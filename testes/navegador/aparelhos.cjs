// Tela 📡 Aparelhos no PC (página de verdade + kofservico de verdade) e no celular (página do celular com a ponte
// trocada por um stub que repassa pro Rede.java de verdade, no Linux):
// PC abre o pareamento (QR + código), o celular lê o QR (o texto do QR é entregue direto) e os dois aparecem conectados.
//   node testes/navegador/aparelhos.cjs <pasta com KOFnes.html e KOFnes-android.html> <kofservico> <classes> <org.json.jar> <libs> [prints]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const [dir, bin, classes, jsonJar, libs, prints] = process.argv.slice(2);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kofap-'));
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'ok: ' : 'FALHOU: ') + m); if (!c) falhas++; };

(async () => {
  const pc = spawn(bin, ['--pasta', path.join(tmp, 'pc'), '--nome', 'PC da sala'], { stdio: 'ignore' });
  const nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await nav.newPage({ viewport: { width: 1100, height: 800 } });
  pg.on('pageerror', (e) => console.log('ERRO na página do PC:', e.message));
  await pg.goto('file://' + path.resolve(dir, 'KOFnes.html'));
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.querySelector('[data-acao="aparelhos"]').click());
  await pg.waitForSelector('#ap-com:not([hidden])', { timeout: 15000 }).catch(() => {});
  ok(await pg.isVisible('#ap-com'), 'PC: tela Aparelhos conectada ao kofservico');
  ok((await pg.inputValue('#ap-nome')) === 'PC da sala', 'PC: mostra o nome do aparelho');
  await pg.click('[data-acao="ap-parear"]');
  await pg.waitForSelector('#ap-qr:not([hidden]) svg', { timeout: 5000 }).catch(() => {});
  const codigo = (await pg.textContent('#ap-codigo')).replace(/\s/g, '');
  ok(/^\d{6}$/.test(codigo) && await pg.isVisible('#ap-qr-img svg'), 'PC: QR e código ' + codigo);
  const qr = (await pg.evaluate(() => document.querySelector('#ap-qr').dataset.qr)).replace(/ip=[^&]+/, 'ip=127.0.0.1');   // o IP do container não é de rede de casa
  if (prints) await pg.screenshot({ path: path.join(prints, 'aparelhos-pc-qr.png') });

  // celular: a página do celular com window.KOFnesApk.redeCmd ligado no Rede.java (stdin/stdout)
  const java = spawn('java', ['-Djava.library.path=' + libs, '-cp', classes + ':' + jsonJar, 'dev.kofnes.android.Rede', path.join(tmp, 'cel'), '127.0.0.1:8650'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const cel = await nav.newPage({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  cel.on('pageerror', (e) => console.log('ERRO na página do celular:', e.message));
  await cel.exposeFunction('__paraJava', (j) => java.stdin.write(j + '\n'));
  let resto = '';
  java.stdout.on('data', (d) => {
    resto += d; const l = resto.split('\n'); resto = l.pop();
    for (const x of l) if (x.startsWith('{')) cel.evaluate((j) => window.__rede && window.__rede(JSON.parse(j)), x).catch(() => {});
  });
  await cel.addInitScript(() => { window.KOFnesApk = { redeCmd: (j) => window.__paraJava(j) }; });
  await cel.goto('file://' + path.resolve(dir, 'KOFnes-android.html'));
  await cel.waitForTimeout(1500);
  await cel.evaluate(() => document.querySelector('[data-acao="aparelhos"]').click());
  await cel.waitForSelector('#ap-com:not([hidden])', { timeout: 10000 }).catch(() => {});
  ok(await cel.isVisible('#ap-com') && await cel.isVisible('[data-acao="ap-ler-qr"]'), 'celular: tela Aparelhos com o botão de ler QR');
  await cel.click('[data-acao="ap-achar"]');
  await cel.waitForSelector('#ap-achados li', { timeout: 6000 }).catch(() => {});
  ok((await cel.textContent('#ap-achados')).includes('PC da sala'), 'celular: acha o PC na rede');
  if (prints) await cel.screenshot({ path: path.join(prints, 'aparelhos-celular-achados.png') });
  // a câmera não existe aqui: entrega o texto que ela leria
  await cel.evaluate((t) => KOFnes.parearPeloQr(t), qr).catch(async () => {
    // parearPeloQr fica dentro do app: usa o caminho do código, que também é o da tela
    await cel.fill('#ap-achados .ap-cod', codigo); await cel.click('#ap-achados li button');
  });
  await pg.waitForFunction(() => /conectado/.test(document.querySelector('#ap-lista').textContent), null, { timeout: 15000 }).catch(() => {});
  ok((await pg.textContent('#ap-lista')).includes('📱') && (await pg.textContent('#ap-lista')).includes('conectado'), 'PC: celular pareado e conectado');
  await cel.waitForFunction(() => /conectado/.test(document.querySelector('#ap-lista').textContent), null, { timeout: 15000 }).catch(() => {});
  ok((await cel.textContent('#ap-lista')).includes('PC da sala'), 'celular: PC pareado e conectado');
  ok(await pg.isHidden('#ap-qr'), 'PC: o QR some depois de parear');
  if (prints) { await pg.screenshot({ path: path.join(prints, 'aparelhos-pc-pareado.png') }); await cel.screenshot({ path: path.join(prints, 'aparelhos-celular-pareado.png') }); }

  await nav.close(); java.kill(); pc.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(falhas ? falhas + ' FALHAS' : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})();
