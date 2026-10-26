// PS1 nativo do APK, lado da página (sem celular): a ponte KOFnesApk é trocada por uma de mentira que responde como o
// Java (Ps1Jogo). Confere que um CD de PS1 vai pro nativo sem ser lido pelo JavaScript, que os botões e a área do jogo
// chegam a cada quadro, que pausar para o sinal, savestate pela ponte, reabrir pela biblioteca e trocar pra outro console.
//   node testes/android/ps1-fachada.cjs dist/web/KOFnes-android.html "Cubo de Teste.cue" "Cubo de Teste.bin" rom.sfc
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, html, cue, bin, sfc] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('https://appassets.androidplatform.net/**', (rt) => {
    const nome = decodeURIComponent(new URL(rt.request().url()).pathname.slice(1)) || 'index.html';
    const arq = nome === 'index.html' ? html : path.join(path.dirname(html), nome);
    rt.fulfill(fs.existsSync(arq) ? { status: 200, contentType: nome.endsWith('.js') ? 'application/javascript' : 'text/html', body: fs.readFileSync(arq) } : { status: 404, body: '' });
  });
  await ctx.addInitScript(() => {
    const L = window.__ps1 = { pads: 0, areas: [], abertos: [], fechou: 0, volume: -1, estado: btoa('estado de mentira') };
    window.KOFnesApk = { salvar() {}, versao: () => 'teste', ps1Nativo: () => true,
      ps1Abrir: (n) => { L.abertos.push(n); setTimeout(() => window.__ps1Pronto({ principal: n.replace(/\.zip$/i, '.cue'), largura: 320, altura: 240, fps: 59.94, taxa: 44100 }), 50); },
      ps1Pad: (m) => { L.pads++; L.ultimoPad = m; }, ps1Area: (x, y, w, h) => L.areas.push([x, y, w, h]), ps1Fechar: () => L.fechou++,
      ps1Reiniciar() {}, ps1Volume: (v) => { L.volume = v; }, ps1Estado: () => L.estado, ps1CarregarEstado: (s) => (L.carregado = atob(s), true),
      n64Nativo: () => true, n64Abrir: (n) => { L.n64 = n; setTimeout(() => window.__n64Pronto({ principal: n, largura: 640, altura: 480, fps: 60, taxa: 44100 }), 50); },
      n64Pad: (m, e) => { L.n64pads = (L.n64pads || 0) + 1; L.n64pad = m; L.n64eixos = e; }, n64Area() {}, n64Fechar: () => { L.n64fechou = (L.n64fechou || 0) + 1; }, n64Reiniciar() {}, n64Volume() {},
      n64Estado: () => '', n64CarregarEstado: () => true };
  });
  const p = await ctx.newPage(), erros = [], falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('https://appassets.androidplatform.net/index.html'); await p.waitForTimeout(800);
  await p.setInputFiles('#arquivo', [cue, bin]); await p.waitForTimeout(2500);
  let L = await p.evaluate(() => ({ ...window.__ps1, s: KOFnes.nucleo() && { n: KOFnes.nucleo().nucleo, nativo: KOFnes.nucleo().nativo } }));
  conferir(L.s && L.s.nativo && L.abertos[0] === path.basename(cue), `o .cue foi pro PS1 nativo ${JSON.stringify(L.s)} ${L.abertos}`);
  conferir(L.pads > 60 && L.areas.length > 1 && L.areas[0][2] > 100 && L.volume >= 0, `botões a cada quadro (${L.pads}), área do jogo ${JSON.stringify(L.areas[0])}, volume ${L.volume}`);
  await p.keyboard.down('KeyX'); await p.waitForTimeout(200); L = await p.evaluate(() => window.__ps1); await p.keyboard.up('KeyX');
  conferir((L.ultimoPad & (1 << 8)) !== 0, `apertar A chega como o botão do libretro (${L.ultimoPad})`);
  // menu aberto = sem sinal
  await p.evaluate(() => document.querySelector('#ctl [data-b="menu"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, clientX: 1, clientY: 1 }))); await p.waitForTimeout(400);   // só o dedo encostando (o tap do Playwright manda um clique depois, que cai no menu já aberto)
  const a1 = await p.evaluate(() => window.__ps1.pads); await p.waitForTimeout(600); const a2 = await p.evaluate(() => window.__ps1.pads);
  conferir(a2 === a1, `menu aberto: o sinal para (${a1} → ${a2}), a tela nativa some`);
  const menu = await p.evaluate(() => [...document.querySelectorAll('#rapido-lista li')].filter((li) => !li.hidden).map((li) => li.innerText.split('\n')[0]));
  conferir(!menu.some((t) => /Filtro|Proporção|Reportar bug|Guardar esta música/.test(t)) && menu.some((t) => /Moldura/.test(t)), 'menu sem o que não funciona no PS1 nativo: ' + menu.join(' | '));
  const botoes = await p.evaluate(() => ['rew', 'turbo', 'menu'].map((b) => getComputedStyle(document.querySelector(`#ctl [data-b="${b}"]`)).display));
  conferir(botoes[0] === 'none' && botoes[1] === 'none' && botoes[2] !== 'none', 'controle sem rebobinar e turbo: ' + botoes);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  // savestate pela ponte
  const est = await p.evaluate(() => { const s = KOFnes.nucleo(); const u = s.serializar(); s.desserializar(u); return [u.length, window.__ps1.carregado]; });
  conferir(est[0] === 17 && est[1] === 'estado de mentira', `savestate vai e volta pela ponte ${JSON.stringify(est)}`);
  // biblioteca: reabrir pelo registro
  const reg = await p.evaluate(async () => { const q = indexedDB.open('kofnes'); const db = await new Promise((ok) => { q.onsuccess = () => ok(q.result); }); return await new Promise((ok) => { const t = db.transaction('jogos').objectStore('jogos').getAll(); t.onsuccess = () => ok(t.result.filter((j) => j.sistema === 'ps1').map((j) => j.arquivo)); }); });
  conferir(reg.includes(path.basename(cue)), `o jogo entrou na biblioteca como PS1 (${reg})`);
  // outro console: o nativo fecha
  await p.setInputFiles('#arquivo', sfc); await p.waitForTimeout(2500);
  L = await p.evaluate(() => ({ ...window.__ps1, n: KOFnes.nucleo().nucleo || 'kof' }));
  conferir(L.fechou >= 1 && L.n !== 'pcsx-nativo', `abrir um SNES fecha o PS1 nativo (fechou ${L.fechou}, agora ${L.n})`);
  // N64 nativo: um arquivo .z64 (de mentira) vai pro N64Jogo; o controle troca os nomes; B da tela = A do N64; L2/R2 aparecem
  const rom = require('os').tmpdir() + '/teste-kof.z64'; fs.writeFileSync(rom, Buffer.alloc(1024, 0x37));
  await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(2000);
  L = await p.evaluate(() => ({ ...window.__ps1, n: KOFnes.nucleo().nucleo, rot: ['B', 'Y', 'X', 'L', 'L2', 'R2'].map((k) => document.querySelector(`#ctl [data-b="${k}"]`).textContent).join(' '),
    l2: getComputedStyle(document.querySelector('#ctl [data-b="L2"]')).display }));
  conferir(L.n === 'mupen64-nativo' && L.n64 === 'teste-kof.z64' && L.n64pads > 30, `.z64 foi pro N64 nativo (${L.n}, ${L.n64pads} quadros de sinal)`);
  conferir(L.rot === 'A B C▲ Z C◀ C▶' && L.l2 !== 'none', `controle do N64: ${L.rot} (L2 ${L.l2})`);
  await p.keyboard.down('KeyZ'); await p.waitForTimeout(200); const pn = await p.evaluate(() => window.__ps1.n64pad); await p.keyboard.up('KeyZ');
  conferir(pn === 1, `B da tela (tecla Z) chega como A do N64 (${pn})`);
  await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(200); const pe = await p.evaluate(() => window.__ps1.n64pad); await p.keyboard.up('ArrowLeft');
  conferir(pe === 64, `direcional pra esquerda chega (vira o analógico na ponte) (${pe})`);
  // analógico de toque: o direcional vira um analógico redondo; dedo na borda direita = eixo X no máximo, sem apertar o direcional
  const an = await p.evaluate(async () => {
    const d = document.querySelector('#ctl [data-b="dpad"]'), r = d.getBoundingClientRect();
    const ev = (t) => d.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 7, clientX: r.right - 2, clientY: r.top + r.height / 2 }));
    ev('pointerdown'); await new Promise((ok) => setTimeout(ok, 250));
    const L = window.__ps1, x = (L.n64eixos << 24) >> 24, y = (L.n64eixos << 16) >> 24, m = L.n64pad;
    ev('pointerup'); await new Promise((ok) => setTimeout(ok, 150));
    return { classe: document.body.classList.contains('analogico'), x, y, m, solto: window.__ps1.n64eixos };
  });
  conferir(an.classe && an.x > 100 && Math.abs(an.y) < 20 && !(an.m & 0xF0) && an.solto === 0, 'analógico de toque no N64: ' + JSON.stringify(an));
  await p.setInputFiles('#arquivo', sfc); await p.waitForTimeout(2000);
  conferir((await p.evaluate(() => window.__ps1.n64fechou)) >= 1, 'abrir outro console fecha o N64 nativo');
  conferir(erros.length === 0, 'sem erro na página ' + erros.join(' | '));
  console.log(falhas.length ? falhas.length + ' falha(s)' : 'tudo certo');
  await b.close(); process.exit(falhas.length ? 1 : 0);
})();
