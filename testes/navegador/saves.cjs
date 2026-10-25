// Saves no banco (v8), estatísticas por aparelho e o backup .kofsave entre dois "aparelhos" (dois navegadores com
// dados separados): migração do save antigo do localStorage, backup de um pro outro e de volta, conflito (o mais novo
// vence, o outro vira cópia), estatísticas somadas sem contar em dobro, tela de Espaço e limite de savestates.
//   node testes/navegador/saves.cjs dist/web
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const [,, pasta] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kofsave-'));
  // save de mentira (como o app guardava antes da v8: base64 sem o fim 0xFF)
  const SAVE_PC = Buffer.from([1, 2, 3, 4, 5, 0, 0, 9]).toString('latin1'), SAVE_CEL = Buffer.from([7, 7, 7, 7]).toString('latin1');
  async function aparelho(nome, rascunhos) {
    const ctx = await b.newContext({ acceptDownloads: true }), p = await ctx.newPage(), erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    await ctx.addInitScript((r) => { if (!sessionStorage.getItem('semeado')) { for (const [k, v] of Object.entries(r)) localStorage.setItem(k, btoa(v)); sessionStorage.setItem('semeado', '1'); } }, rascunhos);
    await p.goto('file://' + path.resolve(pasta, 'KOFnes.html')); await p.waitForTimeout(2600);   // assenta os rascunhos em 1,5 s
    return { p, ctx, erros, nome };
  }
  const exportar = async (a, com) => {
    const [d] = await Promise.all([a.p.waitForEvent('download'), a.p.evaluate((c) => KOFnes.guarda.exportarSaves(c), !!com)]);
    const f = path.join(tmp, a.nome + '.kofsave'); await d.saveAs(f); return f;
  };
  const totalDe = (a, id) => a.p.evaluate(async (i) => { await KOFnes.guarda.carregarEstat(); const e = KOFnes.guarda.estat()[i]; return e ? [e.tempo, e.sessoes] : null; }, id);

  // ---- PC: o save antigo (localStorage) vai pro banco, comprimido, e sai do localStorage
  const pc = await aparelho('pc', { 'kofnes.sram.JOGO TESTE.4096': SAVE_PC, 'kofnes.sram.SO NO PC.2048': SAVE_PC });
  const m = await pc.p.evaluate(async () => ({ resta: Object.keys(localStorage).filter((k) => k.startsWith('kofnes.sram.')).length,
    banco: (await KOFnes.guarda.bdTodos('saves')).map((r) => r.chave).sort(), volta: Array.from(await KOFnes.guarda.lerSave('sram.JOGO TESTE.4096')) }));
  conferir(m.resta === 0 && m.banco.length === 2 && m.volta.join() === '1,2,3,4,5,0,0,9', 'save antigo migrou pro banco e saiu do localStorage ' + JSON.stringify(m));
  // estatística no formato antigo (de antes da v8) + uma sessão nova: vira a parte deste aparelho
  await pc.p.evaluate(() => KOFnes.guarda.bdGuardar('stats', { id: 'JOGO TESTE|4096', nome: 'Jogo Teste', tempo: 3600000, sessoes: 2, primeiro: Date.now() - 864e5, ultimo: Date.now() - 864e5, dias: {} }));
  conferir(JSON.stringify(await totalDe(pc, 'JOGO TESTE|4096')) === '[3600000,2]', 'estatística antiga continua aparecendo igual');

  // ---- Celular: tem o mesmo jogo com um save MAIS NOVO e jogou 30 min
  await new Promise((ok) => setTimeout(ok, 50));
  const cel = await aparelho('cel', { 'kofnes.sram.JOGO TESTE.4096': SAVE_CEL });
  await cel.p.evaluate(() => KOFnes.guarda.bdGuardar('stats', { id: 'JOGO TESTE|4096', nome: 'Jogo Teste', partes: { [KOFnes.guarda.aparelho]: { tempo: 1800000, sessoes: 1, primeiro: Date.now(), ultimo: Date.now(), dias: [], meses: {}, horas: new Array(24).fill(0) } } }));

  // ---- backup do PC aberto no celular (pelo "Adicionar arquivo", como a pessoa faria)
  const fPc = await exportar(pc);
  await cel.p.setInputFiles('#arquivo', fPc); await cel.p.waitForTimeout(1500);
  const c1 = await cel.p.evaluate(async () => {
    const s = await KOFnes.guarda.bdPegar('saves', 'sram.JOGO TESTE.4096');
    return { save: Array.from(await KOFnes.guarda.lerSave('sram.JOGO TESTE.4096')).join(), copia: !!s.anterior, soPc: !!(await KOFnes.guarda.bdPegar('saves', 'sram.SO NO PC.2048')), aviso: document.querySelector('#aviso').textContent };
  });
  conferir(c1.save === '7,7,7,7' && c1.copia, 'conflito: o save mais novo (do celular) ficou, o do PC virou cópia ' + JSON.stringify(c1));
  conferir(c1.soPc && /backup trazido/.test(c1.aviso), 'o save que só o PC tinha chegou no celular; aviso: ' + c1.aviso);
  conferir(JSON.stringify(await totalDe(cel, 'JOGO TESTE|4096')) === '[5400000,3]', 'celular: estatística = 1 h do PC + 30 min dele');

  // ---- e de volta: backup do celular aberto no PC
  const fCel = await exportar(cel);
  const r2 = await pc.p.evaluate(async (u) => KOFnes.guarda.importarSaves(new Uint8Array(u), false), [...fs.readFileSync(fCel)]);
  const c2 = await pc.p.evaluate(async () => Array.from(await KOFnes.guarda.lerSave('sram.JOGO TESTE.4096')).join());
  conferir(c2 === '7,7,7,7' && r2.trazidos === 1, 'PC recebeu o save mais novo do celular ' + JSON.stringify(r2));
  conferir(JSON.stringify(await totalDe(pc, 'JOGO TESTE|4096')) === '[5400000,3]', 'PC: mesma estatística do celular (sem contar em dobro)');
  await pc.p.evaluate(async (u) => KOFnes.guarda.importarSaves(new Uint8Array(u), false), [...fs.readFileSync(fCel)]);
  conferir(JSON.stringify(await totalDe(pc, 'JOGO TESTE|4096')) === '[5400000,3]', 'trazer o mesmo backup duas vezes não muda nada');

  // ---- configurações: só com a caixinha; mudo e volume nunca viajam
  await cel.p.evaluate(() => { localStorage.setItem('kofnes.tema', 'espresso'); localStorage.setItem('kofnes.mudo', '1'); });
  const fCfg = await exportar(cel);
  const cfg = await pc.p.evaluate(async (u) => { localStorage.removeItem('kofnes.tema'); await KOFnes.guarda.importarSaves(new Uint8Array(u), false); const sem = localStorage.getItem('kofnes.tema');
    await KOFnes.guarda.importarSaves(new Uint8Array(u), true); return [sem, localStorage.getItem('kofnes.tema'), localStorage.getItem('kofnes.mudo')]; }, [...fs.readFileSync(fCfg)]);
  conferir(cfg[0] === null && cfg[1] === 'espresso' && cfg[2] !== '1', 'configurações só com a caixinha, sem levar o mudo ' + JSON.stringify(cfg));

  // ---- savestates: limite por jogo e no backup só marcando
  const lim = await pc.p.evaluate(async () => {
    for (let i = 0; i < 23; i++) await KOFnes.guarda.bdGuardar('estados', { jogo: 'JOGO TESTE|4096', nome: 'Jogo Teste', quando: 1000 + i, dados: new Blob([new Uint8Array(100)]) });
    const apagou = await KOFnes.guarda.limitarEstados('JOGO TESTE|4096'), resta = (await KOFnes.guarda.bdTodos('estados')).map((e) => e.quando);
    return { apagou, resta: resta.length, maisVelho: Math.min(...resta) };
  });
  conferir(lim.apagou === 3 && lim.resta === 20 && lim.maisVelho === 1003, 'no máximo 20 savestates por jogo, sai o mais antigo ' + JSON.stringify(lim));
  const semEst = fs.statSync(await exportar(pc, false)).size, comEst = fs.statSync(await exportar(pc, true)).size;
  const r3 = await cel.p.evaluate(async (u) => KOFnes.guarda.importarSaves(new Uint8Array(u), false), [...fs.readFileSync(path.join(tmp, 'pc.kofsave'))]);
  conferir(comEst > semEst && r3.estados === 20, `savestates só com a caixinha (${semEst} → ${comEst} bytes; ${r3.estados} trazidos)`);

  // ---- celular com PS1 nativo (APK): o cartão de memória é arquivo do app, lido e gravado pela ponte
  const ctxA = await b.newContext({ acceptDownloads: true }), pa = await ctxA.newPage();
  await ctxA.addInitScript(() => {
    const arqs = window.__arqs = { 'ps1-saves/Crash.mcd': { b: btoa('MC' + '\x00'.repeat(30)), q: 1000 } };
    window.KOFnesApk = { salvar: (n, m, b) => { window.__salvo = b; }, versao: () => 'teste',
      savesNativos: () => JSON.stringify(Object.entries(arqs).map(([nome, f]) => ({ nome, tam: atob(f.b).length, quando: f.q }))),
      saveNativoLer: (n) => (arqs[n] ? arqs[n].b : ''), saveNativoGravar: (n, b, q) => { arqs[n] = { b, q }; return true; } };
  });
  await pa.goto('file://' + path.resolve(pasta, 'KOFnes-android.html')); await pa.waitForTimeout(1500);
  const b64 = await pa.evaluate(async () => { await KOFnes.guarda.exportarSaves(false); await new Promise((ok) => setTimeout(ok, 500)); return window.__salvo; });   // no APK o arquivo sai pelo "salvar como" do Android
  const fA = path.join(tmp, 'apk.kofsave'); fs.writeFileSync(fA, Buffer.from(b64 || '', 'base64'));
  const noPc = await pc.p.evaluate(async (u) => { await KOFnes.guarda.importarSaves(new Uint8Array(u), false); const r = await KOFnes.guarda.bdPegar('saves', 'nativo/ps1-saves/Crash.mcd'); return r ? Array.from(await KOFnes.guarda.lerSave('nativo/ps1-saves/Crash.mcd')).slice(0, 2) : null; }, [...fs.readFileSync(fA)]);
  conferir(noPc && noPc.join() === '77,67', 'o cartão do PS1 nativo foi no backup e chegou no PC ' + JSON.stringify(noPc));
  // no PC ele fica guardado; um cartão mais novo de outro backup volta pro arquivo do celular
  const mais = await pa.evaluate(async () => {
    const novo = await (async () => { const u = new Uint8Array(32); u[0] = 77; u[1] = 67; u[2] = 99; return u; })();
    const reg = Object.assign(await KofGuarda.empacotarSave(novo, { chave: 'nativo/ps1-saves/Crash.mcd', quando: 5000 }));
    const pac = await KofGuarda.criarPacote({ versao: 1, aparelho: 'outro', saves: [reg], stats: [] });
    const r = await KOFnes.guarda.importarSaves(pac, false); return { r, arq: atob(window.__arqs['ps1-saves/Crash.mcd'].b).charCodeAt(2), q: window.__arqs['ps1-saves/Crash.mcd'].q };
  });
  conferir(mais.r.trazidos === 1 && mais.arq === 99 && mais.q === 5000, 'cartão mais novo gravado no arquivo do celular ' + JSON.stringify(mais));

  // ---- tela de Espaço
  await pc.p.evaluate(() => document.querySelector('[data-acao="estatisticas"]').click()); await pc.p.waitForTimeout(500);
  await pc.p.evaluate(() => document.querySelector('[data-acao="espaco"]').click()); await pc.p.waitForTimeout(1500);
  const esp = await pc.p.evaluate(() => document.querySelector('#est-espaco').textContent);
  conferir(/Saves/.test(esp) && /Savestates/.test(esp) && /Estatísticas/.test(esp), 'tela de Espaço: ' + esp.slice(0, 160));
  await pc.p.screenshot({ path: path.join(tmp, 'espaco.png') });
  conferir(!pc.erros.length && !cel.erros.length, 'sem erro na página ' + pc.erros.concat(cel.erros).join(' | '));
  await b.close();
  console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\ntudo certo (print em ' + tmp + ')');
  process.exit(falhas.length ? 1 : 0);
})();
