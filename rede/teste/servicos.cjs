// Dois kofservico na mesma máquina (A = PC da sala, B = outro PC), falando com "páginas" de mentira por WebSocket:
// achar na rede, código errado, parear, conectar, mensagens nos dois sentidos, reabrir e reconectar.
//   node rede/teste/servicos.cjs <kofservico>
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const bin = process.argv[2] || '/tmp/kofservico';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kofrede-'));
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'ok: ' : 'FALHOU: ') + m); if (!c) falhas++; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function servico(nome, base) {
  const p = spawn(bin, ['--pasta', path.join(tmp, nome), '--nome', 'PC ' + nome, '--porta', String(base), '--udp', String(base),
    '--ws', String(base - 6), '--achar', '127.0.0.1:18650'], { stdio: ['ignore', 'ignore', 'pipe'] });
  p.stderr.on('data', (d) => process.env.VERBOSO && process.stderr.write(nome + ' ' + d));
  return p;
}
async function pagina(porta) {
  for (let i = 0; i < 50; i++) {
    try {
      const ws = new WebSocket('ws://127.0.0.1:' + porta);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      const fila = [];
      let acorda = null;
      ws.onmessage = (e) => { fila.push(JSON.parse(e.data)); if (acorda) acorda(); };
      ws.pedir = (o) => ws.send(JSON.stringify(o));
      ws.esperar = async (t, cond = () => true, ms = 6000) => {
        const fim = Date.now() + ms;
        for (;;) {
          const i = fila.findIndex((m) => m.t === t && cond(m));
          if (i >= 0) return fila.splice(i, 1)[0];
          if (Date.now() > fim) return null;
          await new Promise((r) => { acorda = r; setTimeout(r, 100); });
        }
      };
      return ws;
    } catch { await esperar(100); }
  }
  throw new Error('kofservico não abriu na porta ' + porta);
}

(async () => {
  let A = servico('A', 18650), B = servico('B', 18660);
  let pa = await pagina(18644), pb = await pagina(18654);
  pa.pedir({ t: 'eu' }); pb.pedir({ t: 'eu' });
  const la = await pa.esperar('lista'), lb = await pb.esperar('lista');
  ok(la && la.eu.id.length === 16 && la.eu.nome === 'PC A', 'A responde quem é');
  pb.pedir({ t: 'achar' });
  const ach = await pb.esperar('achados');
  ok(ach && ach.lista.some((x) => x.id === la.eu.id && x.porta === 18650 && x.nome === 'PC A' && !x.pareado), 'B acha A na rede');

  pb.pedir({ t: 'parear-com', ip: '127.0.0.1', porta: 18650, senha: '000000', modo: 'c' });
  let e = await pb.esperar('par-erro');
  ok(e && /aberto/.test(e.texto), 'sem a janela de pareamento aberta, A recusa: ' + (e && e.texto));

  pa.pedir({ t: 'parear' });
  const j = await pa.esperar('parear');
  ok(j && /^\d{6}$/.test(j.codigo) && j.qr.startsWith('kofstation://parear?') && j.qr.includes('n=PC%20A'), 'A abre o pareamento: código e QR');
  const errado = String((+j.codigo + 1) % 1000000).padStart(6, '0');
  pb.pedir({ t: 'parear-com', ip: '127.0.0.1', porta: 18650, senha: errado, modo: 'c' });
  e = await pb.esperar('par-erro');
  ok(e && e.texto === 'código errado', 'código errado não pareia');

  const segredo = new URL(j.qr.replace('kofstation:', 'http:')).searchParams.get('s');
  pb.pedir({ t: 'parear-com', ip: '127.0.0.1', porta: 18650, senha: segredo, modo: 'q' });
  const [pA, pB] = [await pa.esperar('pareado'), await pb.esperar('pareado')];
  ok(pA && pA.aparelho.id === lb.eu.id && pA.aparelho.nome === 'PC B', 'A guardou B (pelo QR)');
  ok(pB && pB.aparelho.id === la.eu.id && pB.aparelho.tipo === 'pc', 'B guardou A');
  ok(await pa.esperar('parear-fim', () => true, 500) === null, 'janela fecha sem aviso de erro');

  pb.pedir({ t: 'conectar', id: la.eu.id });
  const on = await pa.esperar('lista', (m) => m.aparelhos.some((x) => x.id === lb.eu.id && x.online));
  ok(!!on, 'B conecta em A (cifrado) e A vê B online');
  await pb.esperar('lista', (m) => m.aparelhos.some((x) => x.online));
  pb.pedir({ t: 'enviar', para: la.eu.id, canal: 'teste', dados: 'olá do B "aspas" \\ ✓ 🎮' });
  let m = await pa.esperar('msg');
  ok(m && m.de === lb.eu.id && m.canal === 'teste' && m.dados === 'olá do B "aspas" \\ ✓ 🎮', 'mensagem B → A (acentos e emoji)');
  const grande = 'x'.repeat(300000);
  pa.pedir({ t: 'enviar', para: lb.eu.id, canal: 'sync', dados: grande });
  m = await pb.esperar('msg');
  ok(m && m.dados.length === grande.length && m.canal === 'sync', 'mensagem grande A → B (300 KB)');
  pa.pedir({ t: 'enviar', para: '0000000000000000', canal: 'x', dados: 'y' });
  ok(!!(await pa.esperar('nao-enviou')), 'aparelho desconhecido: avisa que não enviou');

  // reabrir os dois: as chaves e os pareados ficam no disco
  A.kill(); B.kill(); await esperar(300);
  A = servico('A', 18650); B = servico('B', 18660);
  pa = await pagina(18644); pb = await pagina(18654);
  pb.pedir({ t: 'eu' });
  const lb2 = await pb.esperar('lista');
  ok(lb2 && lb2.eu.id === lb.eu.id && lb2.aparelhos.length === 1, 'B lembra quem é e do pareado depois de reabrir');
  pb.pedir({ t: 'conectar', id: la.eu.id });
  ok(!!(await pa.esperar('lista', (x) => x.aparelhos.some((y) => y.online))), 'reconecta depois de reabrir');
  pa.pedir({ t: 'remover', id: lb.eu.id });
  ok(!!(await pa.esperar('lista', (x) => x.aparelhos.length === 0)), 'A remove B');
  pb.pedir({ t: 'conectar', id: la.eu.id });
  await esperar(1500);
  pa.pedir({ t: 'lista' });
  ok(!!(await pa.esperar('lista', (x) => x.aparelhos.length === 0)), 'removido não volta sozinho');

  A.kill(); B.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(falhas ? falhas + ' FALHAS' : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})();
