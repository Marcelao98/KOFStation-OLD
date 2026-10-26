// 🎮 Jogadores: dois controles (de mentira, pela Gamepad API) e um celular de verdade pela rede pareada (kofservico + Rede.java):
// cada um vira um jogador, a tela Jogadores troca e guarda, e o jogador 2 chega no núcleo (pad[1] e o _lr_pad_n).
//   node testes/navegador/jogadores.cjs <pasta com os 2 html> <kofservico> <classes> <org.json.jar> <libs> [prints]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const [dir, bin, classes, jsonJar, libs, prints] = process.argv.slice(2);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kofjog-'));
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'ok: ' : 'FALHOU: ') + m); if (!c) falhas++; };
function romMd() {   // Mega Drive: só liga e fica parado (o que importa aqui é a entrada)
  const r = Buffer.alloc(0x400); r.writeUInt32BE(0xFFFE00, 0); r.writeUInt32BE(0x200, 4); r.write('SEGA MEGA DRIVE ', 0x100); r.writeUInt16BE(0x60FE, 0x200); return r;
}
(async () => {
  const pcSrv = spawn(bin, ['--pasta', path.join(tmp, 'pc'), '--nome', 'PC da sala'], { stdio: 'ignore' });
  const nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await nav.newPage({ viewport: { width: 1000, height: 760 } });
  pg.on('pageerror', (e) => console.log('ERRO no PC:', e.message));
  // dois controles de mentira: window.__b[i] = botões apertados (índices da Gamepad API)
  await pg.addInitScript(() => {
    window.__b = [[], []];
    const pad = (i, id) => ({ id, index: i, connected: true, axes: [0, 0, 0, 0], get buttons() { return Array.from({ length: 17 }, (_, k) => ({ pressed: window.__b[i].includes(k), value: 0 })); } });
    navigator.getGamepads = () => [pad(0, 'Xbox Wireless Controller (STANDARD GAMEPAD)'), pad(1, '8BitDo SN30 Pro (Vendor: 2dc8)')];
  });
  await pg.goto('file://' + path.resolve(dir, 'KOFnes.html')); await pg.waitForTimeout(1200);
  fs.writeFileSync(path.join(tmp, 'Teste.md'), romMd());
  await pg.setInputFiles('#arquivo', path.join(tmp, 'Teste.md')); await pg.waitForTimeout(1500);
  let js = await pg.evaluate(() => KOFnes.jogadores().aparelhos.map((a) => [a.k.split('#')[0].slice(0, 12), a.j]));
  ok(js.length === 3 && js[0][1] === 0 && js[1][1] === 0 && js[2][1] === 1, 'teclado e 1º controle = J1, 2º controle = J2 ' + JSON.stringify(js));
  await pg.evaluate(() => { window.__b[1] = [1]; }); await pg.waitForTimeout(200);   // botão de baixo (A no padrão) no 2º controle
  const p = await pg.evaluate(() => ({ p0: KOFnes.nucleo().pad[0], p1: KOFnes.nucleo().pad[1], n: !!KOFnes.nucleo().mod._lr_pad_n }));
  await pg.evaluate(() => { window.__b[1] = []; });
  ok(!p.p0 && p.p1, `o 2º controle aperta só o jogador 2 (pad[0]=${p.p0}, pad[1]=${p.p1})`);
  ok(p.n, 'o núcleo tem os jogadores 2 a 4 (_lr_pad_n)');
  // tela: troca o 2º controle pra J3 e guarda
  await pg.evaluate(() => document.querySelector('[data-acao="jogadores"]').click()); await pg.waitForTimeout(300);
  await pg.evaluate(() => { window.__b[1] = [2]; }); await pg.waitForTimeout(300);   // X (o de baixo é o B do SNES: nas telas ele volta)
  ok(await pg.evaluate(() => document.querySelectorAll('#jog-lista li.apertando').length === 1), 'a luz acende no controle que está apertando');
  await pg.evaluate(() => { window.__b[1] = []; });
  await pg.evaluate(() => [...document.querySelectorAll('#jog-lista li')][2].querySelectorAll('.jog-bts button')[2].click());
  js = await pg.evaluate(() => KOFnes.jogadores().aparelhos.map((a) => a.j));
  ok(js[2] === 2 && /8BitDo/.test(await pg.evaluate(() => localStorage.getItem('kofnes.jogadores'))), 'J3 escolhido e guardado ' + JSON.stringify(js));
  if (prints) await pg.screenshot({ path: path.join(prints, 'jogadores.png') });

  // celular de verdade pela rede: pareia e entra como controle (sem IP nem senha)
  const java = spawn('java', ['-Djava.library.path=' + libs, '-cp', classes + ':' + jsonJar, 'dev.kofnes.android.Rede', path.join(tmp, 'cel'), '127.0.0.1:8650'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const cel = await nav.newPage({ viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true });
  cel.on('pageerror', (e) => console.log('ERRO no celular:', e.message));
  await cel.exposeFunction('__paraJava', (j) => java.stdin.write(j + '\n'));
  let resto = '';
  java.stdout.on('data', (d) => { resto += d; const l = resto.split('\n'); resto = l.pop(); for (const x of l) if (x.startsWith('{')) cel.evaluate((j) => window.__rede && window.__rede(JSON.parse(j)), x).catch(() => {}); });
  await cel.addInitScript(() => { window.KOFnesApk = { redeCmd: (j) => window.__paraJava(j) }; });
  await cel.goto('file://' + path.resolve(dir, 'KOFnes-android.html')); await cel.waitForTimeout(1500);
  await pg.evaluate(() => document.querySelector('[data-acao="aparelhos"]').click());
  await pg.waitForSelector('#ap-com:not([hidden])', { timeout: 15000 });
  await pg.click('[data-acao="ap-parear"]'); await pg.waitForSelector('#ap-qr:not([hidden])');
  const codigo = (await pg.textContent('#ap-codigo')).replace(/\s/g, '');
  await cel.evaluate((c) => KOFnesApk.redeCmd(JSON.stringify({ t: 'parear-com', ip: '127.0.0.1', porta: 8650, senha: c, modo: 'c' })), codigo);
  await cel.waitForFunction(() => typeof pcOnline === 'undefined' || !!document.querySelector('[data-acao="jogar-pc"]:not([hidden])'), null, { timeout: 15000 }).catch(() => {});
  await cel.evaluate(() => window.entrarModoControle());
  const apertar = (s) => cel.evaluate((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); }, s);
  const soltar = (s) => cel.evaluate((s) => document.querySelector(s).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3 })), s);
  await apertar('#ctl [data-b="A"]'); await pg.waitForTimeout(600);
  const c = await pg.evaluate(() => { const a = KOFnes.jogadores().aparelhos.find((x) => x.k.startsWith('cel:')); return a ? { j: a.j, b: a.b } : null; });
  await soltar('#ctl [data-b="A"]');
  ok(c && c.b && c.j === 1, 'celular pela rede entrou como jogador (a 1ª vaga livre: J2) ' + JSON.stringify(c));
  await cel.waitForFunction(() => /Jogador/.test(document.querySelector('.mc-status').textContent), null, { timeout: 5000 }).catch(() => {});
  const st = await cel.evaluate(() => ({ s: document.querySelector('.mc-status').textContent, sis: document.body.dataset.sis }));
  ok(/Jogador 2/.test(st.s) && st.sis === 'md', 'o celular mostra "Jogador 2" e virou controle de Mega Drive ' + JSON.stringify(st));
  if (prints) await cel.screenshot({ path: path.join(prints, 'jogadores-celular.png') });

  await nav.close(); java.kill(); pcSrv.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(falhas ? falhas + ' FALHAS' : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})();
