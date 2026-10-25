// SNES no PC: o Snes9x é o padrão e o Kof fica como opção (Emulação → Núcleo do SNES). Um estado salvo com um núcleo,
// carregado com o outro ativo, reabre o jogo no núcleo do estado. Saves e estatísticas usam a mesma chave nos dois.
//   node testes/navegador/nucleo-snes.cjs dist/web rom.sfc
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [,, pasta, rom] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const falhas = [], conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const p = await (await b.newContext({ viewport: { width: 1100, height: 760 } })).newPage(), erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + path.resolve(pasta, 'KOFnes.html')); await p.waitForTimeout(800);
  const nucleo = () => p.evaluate(() => KOFnes.nucleo().nucleo || 'kof');
  await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(2500);
  const id1 = await p.evaluate(() => KOFnes.estado().jogoId);
  conferir(await nucleo() === 'snes9x', 'SNES no PC abre no Snes9x por padrão (' + await nucleo() + ')');
  // troca pro Kof no menu, salva um estado com ele
  await p.evaluate(() => document.querySelector('[data-acao="nucleo-snes"]').click());
  conferir(/Kof/.test(await p.evaluate(() => document.querySelector('[data-acao="nucleo-snes"]').textContent)), 'o menu mostra o núcleo escolhido');
  await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(2500);
  conferir(await nucleo() === 'kof' && await p.evaluate(() => KOFnes.estado().jogoId) === id1, 'com Kof escolhido, abre no Kof e o jogo tem a mesma chave (saves e estatísticas)');
  await p.keyboard.press('F5'); await p.waitForTimeout(1200);
  // volta pro Snes9x, abre o jogo e carrega o estado do Kof: tem que reabrir no Kof
  await p.evaluate(() => document.querySelector('[data-acao="nucleo-snes"]').click());
  await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(2500);
  conferir(await nucleo() === 'snes9x', 'de volta ao Snes9x');
  await p.keyboard.press('F8'); await p.waitForTimeout(3000);
  const depois = await p.evaluate(() => ({ n: KOFnes.nucleo().nucleo || 'kof', aviso: document.querySelector('#aviso').textContent, pausado: KOFnes.estado().pausado }));
  conferir(depois.n === 'kof' && /carregado/.test(depois.aviso) && !depois.pausado, 'estado do Kof carregado com o Snes9x ativo: reabriu no Kof ' + JSON.stringify(depois));
  conferir(!erros.length, 'sem erro na página ' + erros.join(' | '));
  await b.close();
  console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\ntudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
