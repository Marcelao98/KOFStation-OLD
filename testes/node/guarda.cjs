// Testes do web/guarda.js (formato dos saves, estatísticas por aparelho e pacote .kofsave), sem navegador:
//   node testes/node/guarda.cjs
const G = require('../../web/guarda.js');
let falhas = 0;
const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas++; };
const igual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
(async () => {
  // save de GBA: 128 KB quase todo 0xFF -> guarda pequeno e volta idêntico
  const gba = new Uint8Array(131072).fill(0xFF); for (let i = 0; i < 300; i++) gba[i] = i * 7 & 255;
  const r = await G.empacotarSave(gba, { quando: 5 });
  conferir(r.dados.length < 1000 && r.cheio === 131072 && r.quando === 5, `save de 128 KB guardado em ${r.dados.length} bytes`);
  conferir(igual(await G.abrirSave(r), gba), 'o save volta idêntico (o fim vazio volta como 0xFF)');
  const zero = new Uint8Array(8192);
  conferir(igual(await G.abrirSave(await G.empacotarSave(zero)), zero), 'save todo zerado volta idêntico');
  conferir(igual(await G.abrirSave(await G.empacotarSave(new Uint8Array(0))), new Uint8Array(0)), 'save vazio');
  // decidir entre o daqui e o de fora
  const a = { hash: 'x', quando: 10 }, b = { hash: 'y', quando: 20 };
  conferir(G.decidir(null, b) === 'trazer' && G.decidir(a, { hash: 'x', quando: 99 }) === 'igual' && G.decidir(a, b) === 'trazer' && G.decidir(b, a) === 'manter', 'decidir: novo, igual, mais novo, mais velho');

  // estatísticas: formato antigo migra pra parte deste aparelho, sem perder nada
  const velho = { id: 'J|1', nome: 'Jogo', tempo: 7200000, sessoes: 3, primeiro: Date.parse('2026-10-01T12:00:00'), ultimo: Date.parse('2026-10-20T12:00:00'),
    dias: { '2026-10-01': 3600000, '2026-10-20': 3600000 } };
  const m = G.migrarStats(velho, 'pc', 'J|1', 'Jogo'), v = G.visao(m);
  conferir(v.tempo === 7200000 && v.sessoes === 3 && v.dias['2026-10-01'] === 3600000 && v.dias['2026-10-20'] === 3600000, 'migração: mesmo tempo, sessões e dias ' + JSON.stringify(v.dias));
  // dois aparelhos: cada um escreve a sua parte, e o total é a soma
  const t = Date.parse('2026-10-25T21:30:00');
  let pc = G.registrarTempo(velho, 'J|1', 'Jogo', 'pc', 600000, t);
  let cel = G.contarSessao(null, 'J|1', 'Jogo', 'cel', t); cel = G.registrarTempo(cel, 'J|1', 'Jogo', 'cel', 1200000, t + 1000);
  const juntos = G.juntarStats(pc, cel), vj = G.visao(juntos);
  conferir(vj.tempo === 7200000 + 600000 + 1200000 && vj.sessoes === 4 && vj.aparelhos === 2, `PC + celular somados (${vj.tempo / 60000} min, ${vj.sessoes} sessões)`);
  conferir(vj.dias['2026-10-25'] === 1800000 && vj.horas[21] === 1800, 'dia e hora do dia somados');
  // juntar de novo (ou juntar ao contrário) não conta em dobro
  conferir(G.visao(G.juntarStats(juntos, cel)).tempo === vj.tempo && G.visao(G.juntarStats(cel, juntos)).tempo === vj.tempo, 'juntar duas vezes não conta em dobro');
  // a parte mais adiantada vence: o celular jogou mais depois do pacote velho
  const cel2 = G.registrarTempo(JSON.parse(JSON.stringify(cel)), 'J|1', 'Jogo', 'cel', 60000, t + 5000);
  conferir(G.visao(G.juntarStats(juntos, cel2)).tempo === vj.tempo + 60000, 'a parte mais nova do outro aparelho entra');
  // mais de ~1 ano de dias vira meses, sem perder tempo
  let longo = null; const d0 = Date.parse('2025-01-01T10:00:00');
  for (let i = 0; i < 450; i++) longo = G.registrarTempo(longo, 'L|1', 'Longo', 'pc', 60000, d0 + i * 864e5);
  const pl = longo.partes.pc, seg = pl.dias.reduce((s, [, x]) => s + x, 0) + Object.values(pl.meses).reduce((s, x) => s + x, 0);
  conferir(pl.dias.length === 400 && seg === 450 * 60 && pl.tempo === 450 * 60000, `dias antigos viram meses (${pl.dias.length} dias + ${Object.keys(pl.meses).length} meses)`);
  conferir(JSON.stringify(longo).length < 450 * 30, `estatística de 450 dias ocupa ${JSON.stringify(longo).length} bytes`);

  // pacote: saves, estatísticas e um estado; volta igual, e o binário não incha
  const est = new Uint8Array(50000).map((x, i) => (i * 31) & 255);
  const pac = await G.criarPacote({ versao: 1, aparelho: 'pc', saves: [Object.assign({ chave: 'sram.JOGO.1' }, r)], stats: [juntos], estados: [{ jogo: 'J|1', dados: est }] });
  conferir(G.ehPacote(pac) && !G.ehPacote(new Uint8Array(20)), 'pacote reconhecido pelo começo (KOFSAVE1)');
  const lido = await G.lerPacote(pac);
  conferir(igual(await G.abrirSave(lido.saves[0]), gba) && lido.saves[0].hash === r.hash, 'o save sai do pacote idêntico');
  conferir(igual(lido.estados[0].dados, est) && G.visao(lido.stats[0]).tempo === vj.tempo, 'estado e estatísticas saem idênticos');
  conferir(pac.length < est.length + r.dados.length + 1500, `pacote sem inchaço (${pac.length} bytes pra ${est.length + r.dados.length} de binários)`);
  let erro = ''; try { await G.lerPacote(new Uint8Array(30)); } catch (e) { erro = e.message; }
  conferir(/kofsave/.test(erro), 'arquivo errado dá erro claro');
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
