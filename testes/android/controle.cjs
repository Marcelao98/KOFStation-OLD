// O celular como controle do PC, de ponta a ponta: a página do celular (modo "Controle do PC", ponte KOFnesApk de
// mentira) manda o que o dedo aperta pro ControleServidor.java DE VERDADE (rodando no Linux), e a página do PC conecta
// nele por WebSocket e recebe botões e eixos. Confere também senha errada, o celular caindo, o controle trocando pro console
// do jogo que o PC abriu (ROMs geradas aqui: só um laço infinito) e o PC religando sozinho ao abrir de novo.
//   node testes/android/controle.cjs dist/web
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { spawn, execSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const [,, pasta] = process.argv, RAIZ = path.resolve(__dirname, '../..');
(async () => {
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kofctl-'));
  execSync(`javac -d ${tmp} ${RAIZ}/android/src/dev/kofnes/android/ControleServidor.java`, { stdio: 'ignore' });
  const PORTA = 18000 + Math.floor(Math.random() * 1000);
  const java = spawn('java', ['-cp', tmp, 'dev.kofnes.android.ControleServidor', '4821', String(PORTA), 'entrada'], { stdio: ['pipe', 'pipe', 'ignore'] });
  let cel = null, estadoJava = '0\t\t';   // o que o controleEstado do app devolveria (o Java imprime "ESTADO ..." quando muda)
  java.stdout.on('data', (d) => { for (const l of String(d).split('\n')) if (l.startsWith('ESTADO ')) { estadoJava = l.slice(7); if (cel) cel.evaluate((t) => { window.__estado = t; }, estadoJava).catch(() => {}); } });
  await new Promise((ok) => setTimeout(ok, 1500));
  const b = await chromium.launch({ args: ['--no-proxy-server'] });
  // ---- celular: a página do APK com a ponte de mentira; controleEnviar vai pro servidor Java
  cel = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })).newPage(), erros = [];
  cel.on('pageerror', (e) => erros.push('cel: ' + e.message));
  await cel.exposeBinding('__enviar', (src, bits, eixos) => { java.stdin.write(bits + ' ' + eixos + '\n'); });
  await cel.addInitScript((porta) => {
    let ligados = 0;
    window.KOFnesApk = { salvar() {}, versao: () => 'teste', controleIniciar: () => JSON.stringify({ ip: '127.0.0.1', casa: window.__casa, porta, senha: '4821' }),
      controleEnviar: (b, e) => window.__enviar(b, e), controleEstado: () => window.__estado || '0\t\t', controleParar: () => { window.__parou = 1; } };
  }, PORTA);
  await cel.goto('file://' + path.resolve(pasta, 'KOFnes-android.html')); await cel.waitForTimeout(800);
  await cel.evaluate(() => { document.querySelector('[data-acao="teclas"]').click(); });
  await cel.waitForTimeout(400);
  await cel.evaluate(() => document.querySelector('[data-acao="modo-controle"]').click());
  await cel.waitForTimeout(400);
  const tela = await cel.evaluate(() => ({ codigo: (document.querySelector('#modo-controle code') || {}).textContent, ctl: getComputedStyle(document.querySelector('#ctl')).display !== 'none', l2: getComputedStyle(document.querySelector('#ctl [data-b="L2"]')).display !== 'none' }));
  conferir(tela.codigo === `127.0.0.1:${PORTA} 4821` && tela.ctl && tela.l2, 'celular mostra o endereço e a senha e o controle inteiro ' + JSON.stringify(tela));
  conferir((await cel.evaluate(() => document.querySelector('#modo-controle em').textContent)).includes(`http://127.0.0.1:${PORTA}`), 'celular mostra o link pra testar no navegador do PC');
  await cel.screenshot({ path: path.join(tmp, 'celular-controle.png') });
  // ---- navegador comum no endereço do celular: página "celular achado" (separa problema de rede de bloqueio do navegador)
  const g = await fetch(`http://127.0.0.1:${PORTA}/`), gt = await g.text();
  conferir(g.status === 200 && /Celular achado/.test(gt), 'http://ip:porta no navegador responde "✅ Celular achado"');
  const op = await fetch(`http://127.0.0.1:${PORTA}/`, { method: 'OPTIONS' });
  conferir(op.status === 204 && op.headers.get('access-control-allow-private-network') === 'true', 'pré-verificação de rede privada respondida');
  // ---- PC: endereço onde ninguém responde = explica logo o que conferir (antes só depois de 60 s)
  const pc = await (await b.newContext()).newPage();
  pc.on('pageerror', (e) => erros.push('pc: ' + e.message));
  await pc.goto('file://' + path.resolve(pasta, 'KOFnes.html')); await pc.waitForTimeout(800);
  await pc.evaluate((p) => KOFnes.controle.conectar(`127.0.0.1:${p} 4821`), PORTA + 1000); await pc.waitForTimeout(1200);
  const av = await pc.evaluate(() => document.querySelector('#aviso').textContent);
  conferir(av.includes(`http://127.0.0.1:${PORTA + 1000}`) && /mesma Wi-Fi/.test(av), 'sem resposta: o PC explica na hora ' + JSON.stringify(av.slice(0, 80)));
  await pc.evaluate(() => KOFnes.controle.desconectar());
  // ---- senha errada é recusada
  await pc.evaluate((p) => KOFnes.controle.conectar(`127.0.0.1:${p} 0000`), PORTA); await pc.waitForTimeout(800);
  conferir(!(await pc.evaluate(() => KOFnes.controle.estado().ligado)) && /senha errada/.test(await pc.evaluate(() => document.querySelector('#aviso').textContent)), 'senha errada: o PC não conecta e avisa');
  // ---- senha certa: o que o dedo aperta no celular chega no PC
  await pc.evaluate((p) => KOFnes.controle.conectar(`127.0.0.1:${p} 4821`), PORTA); await pc.waitForTimeout(800);
  conferir(await pc.evaluate(() => KOFnes.controle.estado().ligado), 'senha certa: conectado');
  const apertar = (sel, dx) => cel.evaluate(([s, d]) => { const e = document.querySelector(s), r = e.getBoundingClientRect();
    e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, clientX: r.left + r.width / 2 + d * r.width / 2, clientY: r.top + r.height / 2 })); }, [sel, dx || 0]);
  const soltar = (sel) => cel.evaluate((s) => document.querySelector(s).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3 })), sel);
  await apertar('#ctl [data-b="A"]'); await pc.waitForTimeout(300);
  const a = await pc.evaluate(() => KOFnes.botoes());
  await soltar('#ctl [data-b="A"]'); await pc.waitForTimeout(300);
  const solto = await pc.evaluate(() => KOFnes.botoes());
  conferir((a & 0x0080) && !(solto & 0x0080), `botão A do celular aperta e solta no PC (${a.toString(16)} → ${solto.toString(16)})`);
  await apertar('#ctl [data-b="dpad"]', 0.98); await pc.waitForTimeout(300);
  const dir = await pc.evaluate(() => ({ bits: KOFnes.botoes(), eixos: KOFnes.controle.estado().eixos }));
  await soltar('#ctl [data-b="dpad"]'); await pc.waitForTimeout(300);
  conferir((dir.bits & 0x0100) && dir.eixos[0] > 30000 && Math.abs(dir.eixos[1]) < 3000, 'direcional pra direita chega como direcional e como analógico ' + JSON.stringify(dir));
  // ---- conectado: some o endereço, fica a barrinha verde e a telinha "nenhum jogo aberto"; o celular lembra que já pareou
  await cel.evaluate((t) => { window.__estado = t; }, estadoJava); await cel.waitForTimeout(500);
  const lig = await cel.evaluate(() => { const d = document.querySelector('#modo-controle'); return { ligado: d.classList.contains('ligado'), pareando: d.classList.contains('pareando'), sis: d.querySelector('.mc-sis').textContent, pareado: localStorage.getItem('kofnes.controlePareado') }; });
  conferir(lig.ligado && !lig.pareando && lig.sis === 'nenhum jogo aberto' && lig.pareado === '1', 'conectado: sem IP na tela, só a barrinha e a telinha ' + JSON.stringify(lig));
  await cel.screenshot({ path: path.join(tmp, 'controle-sem-jogo.png') });
  // ---- o PC abre um jogo: o celular troca pro controle daquele console
  const md = Buffer.alloc(0x400); md.writeUInt32BE(0xFFFE00, 0); md.writeUInt32BE(0x200, 4); md.write('SEGA MEGA DRIVE ', 0x100); md.writeUInt16BE(0x4EFE, 0x200);
  const nes = Buffer.alloc(16 + 0x4000 + 0x2000); nes.write('NES\x1a', 0); nes[4] = 1; nes[5] = 1; nes.writeUInt16LE(0xC000, 16 + 0x3FFC); nes[16] = 0x4C; nes[17] = 0x00; nes[18] = 0xC0;   // JMP $C000
  fs.writeFileSync(path.join(tmp, 'Teste do Controle.md'), md); fs.writeFileSync(path.join(tmp, 'Teste NES.nes'), nes);
  const ctlCel = () => cel.evaluate(() => ({ sis: document.body.dataset.sis, soAb: document.body.classList.contains('so-ab'), console: document.querySelector('.mc-sis').textContent, jogo: document.querySelector('.mc-jogo').textContent,
    Y: document.querySelector('#ctl [data-b="Y"]').textContent, L2: getComputedStyle(document.querySelector('#ctl [data-b="L2"]')).display !== 'none', X: getComputedStyle(document.querySelector('#ctl [data-b="X"]')).display !== 'none' }));
  await pc.setInputFiles('#arquivo', path.join(tmp, 'Teste do Controle.md')); await pc.waitForTimeout(1500);
  let c = await ctlCel();
  conferir(c.sis === 'md' && c.console === 'Mega Drive' && c.jogo === 'Teste do Controle' && c.Y === 'A' && !c.L2, 'PC abriu Mega Drive: o celular virou controle de Mega Drive ' + JSON.stringify(c));
  await cel.screenshot({ path: path.join(tmp, 'controle-md.png') });
  await cel.setViewportSize({ width: 915, height: 412 }); await cel.waitForTimeout(400);
  await cel.screenshot({ path: path.join(tmp, 'controle-md-deitado.png') });
  await cel.setViewportSize({ width: 412, height: 915 });
  await pc.setInputFiles('#arquivo', path.join(tmp, 'Teste NES.nes')); await pc.waitForTimeout(1500);
  c = await ctlCel();
  conferir(c.sis === 'nes' && c.console === 'NES' && c.soAb && !c.X, 'PC abriu NES: o celular virou controle de NES (só A e B) ' + JSON.stringify(c));
  await cel.screenshot({ path: path.join(tmp, 'controle-nes.png') });
  // ---- ☰ do celular = Select+Start: abre (e fecha) o menu rápido do PC
  const menuVisivel = () => cel.evaluate(() => getComputedStyle(document.querySelector('#ctl [data-b="menu"]')).display !== 'none');
  conferir(await menuVisivel(), 'o ☰ aparece no celular como controle');
  await apertar('#ctl [data-b="menu"]'); await pc.waitForTimeout(600);
  const abriu = await pc.evaluate(() => !document.querySelector('#rapido').hidden);
  await apertar('#ctl [data-b="menu"]'); await pc.waitForTimeout(600);
  conferir(abriu && await pc.evaluate(() => document.querySelector('#rapido').hidden), '☰ do celular abre e fecha o menu rápido do PC');
  // ---- ⓘ mostra o endereço de novo (pra parear outro PC) e esconde
  await cel.evaluate(() => document.querySelector('.mc-info').click());
  const info = await cel.evaluate(() => document.querySelector('#modo-controle').classList.contains('pareando'));
  await cel.evaluate(() => document.querySelector('.mc-info').click());
  conferir(info && !(await cel.evaluate(() => document.querySelector('#modo-controle').classList.contains('pareando'))), 'ⓘ mostra e esconde o endereço');
  // ---- o PC fecha e abre o KOFstation de novo: conecta sozinho (sem digitar nada) e já conta o jogo
  await pc.reload(); await pc.waitForTimeout(800);
  const auto = await (async () => { for (let i = 0; i < 30; i++) { if (await pc.evaluate(() => KOFnes.controle.estado().ligado)) return true; await pc.waitForTimeout(200); } return false; })();
  conferir(auto, 'PC aberto de novo: conecta sozinho no celular de antes');
  await pc.waitForTimeout(600);
  conferir((await ctlCel()).console === 'nenhum jogo aberto', 'PC sem jogo aberto: o celular volta pro controle completo');
  // ---- tempo de ida (página do celular -> Java -> PC), medido aqui na mesma máquina
  const t = [];
  for (let i = 0; i < 10; i++) {
    const t0 = Date.now(); await apertar('#ctl [data-b="B"]');
    while (!((await pc.evaluate(() => KOFnes.botoes())) & 0x8000) && Date.now() - t0 < 1000) { /* espera */ }
    t.push(Date.now() - t0); await soltar('#ctl [data-b="B"]'); await pc.waitForTimeout(60);
  }
  conferir(Math.max(...t) < 200, `chega rápido: ${t.join(', ')} ms (inclui o vaivém do teste)`);
  // ---- o celular cai: o PC solta tudo e tenta de novo
  await apertar('#ctl [data-b="A"]'); await pc.waitForTimeout(200);
  java.kill(); await pc.waitForTimeout(800);
  const caiu = await pc.evaluate(() => ({ ...KOFnes.controle.estado(), b: KOFnes.botoes() }));
  conferir(!caiu.ligado && !(caiu.b & 0x0080), 'celular caiu: o PC solta os botões (nada fica "preso")');
  // ---- sair do modo controle
  await cel.evaluate(() => document.querySelector('#modo-controle .mc-sair').click()); await cel.waitForTimeout(300);
  conferir(await cel.evaluate(() => !document.querySelector('#modo-controle') && window.__parou === 1 && !document.body.classList.contains('modo-controle')), 'Sair fecha o modo controle e desliga o servidor');
  // ---- celular fora da rede de casa (4G/VPN): avisa pra ligar a Wi-Fi
  await cel.evaluate(() => { window.__casa = false; document.querySelector('[data-acao="teclas"]').click(); }); await cel.waitForTimeout(400);
  await cel.evaluate(() => document.querySelector('[data-acao="modo-controle"]').click()); await cel.waitForTimeout(400);
  conferir(/não parece estar na Wi-Fi/.test(await cel.evaluate(() => document.querySelector('#modo-controle em').textContent)), 'celular fora da Wi-Fi avisa');
  await cel.evaluate(() => document.querySelector('#modo-controle .mc-sair').click());
  await pc.evaluate(() => KOFnes.controle.desconectar());
  conferir(!erros.length, 'sem erro nas páginas ' + erros.join(' | '));
  await b.close();
  console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\ntudo certo (print em ' + tmp + ')');
  process.exit(falhas.length ? 1 : 0);
})();
