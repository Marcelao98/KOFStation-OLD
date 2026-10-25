// Pasta de ROMs no APK, sem celular: a página no endereço do app, a ponte KOFnesApk de mentira com as funções da Pasta.java
// (pastaEscolher/pastaNome/pastaListar/pastaPreparar) e /pasta?u=... servido de uma pasta local com Range, como o Java faz.
//   node testes/android/pasta-apk.cjs <KOFnes-android.html> <pasta com "ROMs"> [prints]
// A pasta pode ter arquivos de mentira (zeros com nome de jogo): o teste só confere a lista, a busca e a leitura aos pedaços.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, html, pasta, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pedidos = [];
  await ctx.route('https://appassets.androidplatform.net/**', (rt) => {
    const u = new URL(rt.request().url());
    if (u.pathname === '/pasta') {   // como o Pasta.servir(): só o arquivo listado, inteiro ou o pedaço do Range
      const arq = path.join(pasta, u.searchParams.get('u').replace(/^teste:\/\//, '')), dados = fs.readFileSync(arq);
      const rg = (rt.request().headers().range || '').match(/bytes=(\d+)-(\d*)/);
      pedidos.push(rg ? rg[0] : 'inteiro');
      if (!rg) return rt.fulfill({ status: 200, body: dados });
      const ini = +rg[1], fim = rg[2] ? Math.min(+rg[2], dados.length - 1) : dados.length - 1;
      return rt.fulfill({ status: 206, headers: { 'Content-Range': `bytes ${ini}-${fim}/${dados.length}` }, body: dados.subarray(ini, fim + 1) });
    }
    const nome = decodeURIComponent(u.pathname.slice(1)) || 'index.html';
    const arq = nome === 'index.html' ? html : path.join(path.dirname(html), nome);
    rt.fulfill(fs.existsSync(arq) ? { status: 200, contentType: nome.endsWith('.js') ? 'application/javascript' : 'text/html', body: fs.readFileSync(arq) } : { status: 404, body: '' });
  });
  await ctx.route(/github\.com|raw\.githubusercontent/, (rt) => rt.fulfill({ status: 404, body: '' }));
  const lista = [];
  (function varrer(d, prof) {
    for (const n of fs.readdirSync(path.join(pasta, d)).sort()) {
      const rel = path.join(d, n), st = fs.statSync(path.join(pasta, rel));
      if (st.isDirectory()) { if (prof < 2) varrer(rel, prof + 1); } else lista.push({ n, u: 'teste://' + rel, t: st.size });
    }
  })('', 0);
  await ctx.addInitScript((lista) => {
    let escolhida = '';
    window.__preparados = [];
    window.KOFnesApk = {
      versao: () => 'teste', salvar() {},
      pastaEscolher: () => setTimeout(() => { escolhida = 'ROMs'; window.__pastaEscolhida(true); }, 50),
      pastaNome: () => escolhida,
      pastaListar: (ext) => { const re = new RegExp(ext, 'i'); setTimeout(() => window.__pastaLida(lista.filter((x) => re.test(x.n))), 50); },
      pastaPreparar: (u) => window.__preparados.push(u),
    };
  }, lista);
  const p = await ctx.newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('https://appassets.androidplatform.net/index.html'); await p.waitForTimeout(800);
  r.temPasta = await p.evaluate(() => document.querySelector('#biblioteca [data-acao="pasta"]') !== null);
  await p.tap('#home:not([hidden]) [data-acao="biblioteca"]'); await p.waitForTimeout(500);
  r.vazia = await p.textContent('#lista-vazia');
  if (saida) await p.screenshot({ path: saida + '/pasta-apk-vazia.png' });
  r.botaoNoTopo = await p.evaluate(() => { const b = document.querySelector('#biblioteca [data-acao="pasta"]'), q = b.getBoundingClientRect(), e = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return e === b || b.contains(e) ? 'ok' : (e ? e.tagName + '#' + e.id + '.' + e.className : 'fora da tela ' + JSON.stringify(q)); });
  await p.tap('#biblioteca [data-acao="pasta"]'); await p.waitForTimeout(1500);
  r.itens = await p.$$eval('#roms li > span', (s) => s.map((x) => x.textContent));
  await p.waitForTimeout(800);
  r.chips = await p.$$eval('#bib-filtros .chip', (bs) => bs.map((x) => x.textContent));
  await p.fill('#filtro', 'rpg'); await p.waitForTimeout(400);
  r.rpg = await p.$$eval('#roms li > span', (s) => s.map((x) => x.textContent));
  await p.fill('#filtro', ''); await p.waitForTimeout(400);
  if (saida) await p.screenshot({ path: saida + '/pasta-apk-lista.png' });
  // ficha de um jogo que a base conhece e a lista de um filtro aberta
  await p.tap('#roms li >> nth=0'); await p.waitForTimeout(400);
  r.fichaMeta = await p.$$eval('#info-meta .chip', (bs) => bs.map((x) => x.textContent));
  if (saida) await p.screenshot({ path: saida + '/pasta-apk-ficha.png' });
  await p.tap('.bib-fechar-ficha'); await p.waitForTimeout(300); r.fichaFechou = !(await p.evaluate(() => document.querySelector('#biblioteca').classList.contains('ficha')));
  await p.tap('#bib-filtros [data-faceta="genero"]'); await p.waitForTimeout(300);
  if (saida) await p.screenshot({ path: saida + '/pasta-apk-filtro.png' });
  await p.tap('#bib-pop button:has-text("RPG")'); await p.waitForTimeout(300);
  r.filtroRpg = await p.$$eval('#roms li > span', (s) => s.map((x) => x.textContent));
  await p.tap('#bib-filtros .chip.ativo'); await p.waitForTimeout(300);
  // tocar num jogo: mostra as informações dele; tocar de novo abre (zip lido aos pedaços pela ponte)
  const k = await p.$$eval('#roms li > span', (s) => s.findIndex((x) => /Teste Zip/.test(x.textContent)));
  if (k >= 0) {
    await p.tap(`#roms li >> nth=${k}`); await p.waitForTimeout(300);
    if (saida) await p.screenshot({ path: saida + '/pasta-apk-info.png' });
    await p.tap(`#roms li >> nth=${k}`); await p.waitForTimeout(2500);
    r.abriuDoZip = await p.evaluate(() => !!(KOFnes.estado && KOFnes.estado().snes));
  }
  r.pedidos = pedidos.slice(0, 12); r.nPedidos = pedidos.length;
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
