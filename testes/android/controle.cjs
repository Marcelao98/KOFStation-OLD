// O celular como controle do PC, de ponta a ponta: a página do celular (modo "Controle do PC", ponte KOFnesApk de
// mentira) manda o que o dedo aperta pro ControleServidor.java DE VERDADE (rodando no Linux), e a página do PC conecta
// nele por WebSocket e recebe botões e eixos. Confere também senha errada e o celular caindo.
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
  const java = spawn('java', ['-cp', tmp, 'dev.kofnes.android.ControleServidor', '4821', String(PORTA), 'entrada'], { stdio: ['pipe', 'ignore', 'ignore'] });
  await new Promise((ok) => setTimeout(ok, 1500));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
  // ---- celular: a página do APK com a ponte de mentira; controleEnviar vai pro servidor Java
  const cel = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })).newPage(), erros = [];
  cel.on('pageerror', (e) => erros.push('cel: ' + e.message));
  await cel.exposeBinding('__enviar', (src, bits, eixos) => { java.stdin.write(bits + ' ' + eixos + '\n'); });
  await cel.addInitScript((porta) => {
    let ligados = 0;
    window.KOFnesApk = { salvar() {}, versao: () => 'teste', controleIniciar: () => JSON.stringify({ ip: '127.0.0.1', porta, senha: '4821' }),
      controleEnviar: (b, e) => window.__enviar(b, e), controleEstado: () => ligados + '|PC', controleParar: () => { window.__parou = 1; } };
  }, PORTA);
  await cel.goto('file://' + path.resolve(pasta, 'KOFnes-android.html')); await cel.waitForTimeout(800);
  await cel.evaluate(() => { document.querySelector('[data-acao="teclas"]').click(); });
  await cel.waitForTimeout(400);
  await cel.evaluate(() => document.querySelector('[data-acao="modo-controle"]').click());
  await cel.waitForTimeout(400);
  const tela = await cel.evaluate(() => ({ codigo: (document.querySelector('#modo-controle code') || {}).textContent, ctl: getComputedStyle(document.querySelector('#ctl')).display !== 'none', l2: getComputedStyle(document.querySelector('#ctl [data-b="L2"]')).display !== 'none' }));
  conferir(tela.codigo === `127.0.0.1:${PORTA} 4821` && tela.ctl && tela.l2, 'celular mostra o endereço e a senha e o controle inteiro ' + JSON.stringify(tela));
  await cel.screenshot({ path: path.join(tmp, 'celular-controle.png') });
  // ---- PC: senha errada é recusada
  const pc = await (await b.newContext()).newPage();
  pc.on('pageerror', (e) => erros.push('pc: ' + e.message));
  await pc.goto('file://' + path.resolve(pasta, 'KOFnes.html')); await pc.waitForTimeout(800);
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
  await cel.evaluate(() => document.querySelector('#modo-controle button').click()); await cel.waitForTimeout(300);
  conferir(await cel.evaluate(() => !document.querySelector('#modo-controle') && window.__parou === 1 && !document.body.classList.contains('modo-controle')), 'Sair fecha o modo controle e desliga o servidor');
  await pc.evaluate(() => KOFnes.controle.desconectar());
  conferir(!erros.length, 'sem erro nas páginas ' + erros.join(' | '));
  await b.close();
  console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\ntudo certo (print em ' + tmp + ')');
  process.exit(falhas.length ? 1 : 0);
})();
