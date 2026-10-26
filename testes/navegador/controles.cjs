// ⌨ Controles e teclas: camadas Geral → console → só este jogo, analógico no teclado (PS1/PS2/N64), botão do controle trocado.
//   node testes/navegador/controles.cjs <pasta com o KOFnes.html> [prints]
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const [dir, prints] = process.argv.slice(2);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kofct-'));
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'ok: ' : 'FALHOU: ') + m); if (!c) falhas++; };
function romMd() {   // Mega Drive: só liga e fica parado (o que importa aqui é a entrada)
  const r = Buffer.alloc(0x400); r.writeUInt32BE(0xFFFE00, 0); r.writeUInt32BE(0x200, 4); r.write('SEGA MEGA DRIVE ', 0x100); r.writeUInt16BE(0x60FE, 0x200); return r;
}
(async () => {
  const nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await nav.newPage({ viewport: { width: 1000, height: 800 } });
  pg.on('pageerror', (e) => { console.log('ERRO:', e.message); falhas++; });
  await pg.addInitScript(() => {   // um controle de mentira: window.__b = botões apertados
    window.__b = [];
    navigator.getGamepads = () => [{ id: 'Controle de teste', index: 0, connected: true, axes: [0, 0, 0, 0], get buttons() { return Array.from({ length: 17 }, (_, k) => ({ pressed: window.__b.includes(k), value: 0 })); } }];
  });
  await pg.goto('file://' + path.resolve(dir, 'KOFnes.html')); await pg.waitForTimeout(1000);
  const m = await pg.evaluate(() => { const c = KOFnes.controles; return { ps2: c.mapaDe('teclas', 'ps2'), n64: c.mapaDe('teclas', 'n64'), md: c.mapaDe('teclas', 'md') }; });
  ok(m.ps2['AE↑'] === 'ArrowUp' && m.ps2['AE←'] === 'ArrowLeft' && m.ps2.Cima === 'KeyT' && m.ps2['AD←'] === 'KeyJ', 'PS2: setas = analógico esquerdo, IJKL = direito, direcional em TFGH ' + JSON.stringify([m.ps2['AE↑'], m.ps2.Cima, m.ps2['AD←']]));
  ok(m.n64['AE↑'] === 'ArrowUp' && !m.n64['AD↑'], 'N64: setas = analógico (sem analógico direito: os C ficam nos botões)');
  ok(m.md.Cima === 'ArrowUp' && !m.md['AE↑'], 'Mega Drive: setas = direcional');

  fs.writeFileSync(path.join(tmp, 'Teste.md'), romMd());
  await pg.setInputFiles('#arquivo', path.join(tmp, 'Teste.md')); await pg.waitForTimeout(1500);
  const segurar = async (k, f) => { await pg.keyboard.down(k); await pg.waitForTimeout(150); const r = await pg.evaluate(f); await pg.keyboard.up(k); await pg.waitForTimeout(60); return r; };
  ok(await segurar('ArrowLeft', () => KOFnes.nucleo().pad[0] & 0x0200), 'no Mega Drive a seta aperta o direcional');

  // finge um console com analógico no mesmo jogo (o núcleo do Mega Drive ignora os eixos)
  await pg.evaluate(() => { KOFnes.nucleo().sistema = 'ps2'; KOFnes.controles.aplicar(); });
  let r = await segurar('ArrowLeft', () => ({ e: Array.from(KOFnes.nucleo().eixos || []), p: KOFnes.nucleo().pad[0] }));
  ok(r.e[0] < -30000 && !(r.p & 0x0200), 'PS2: seta esquerda = analógico esquerdo pra esquerda, sem apertar o direcional ' + JSON.stringify(r));
  r = await segurar('KeyL', () => Array.from(KOFnes.nucleo().eixos || []));
  ok(r[2] > 30000, 'PS2: L = analógico direito pra direita (câmera) ' + JSON.stringify(r));
  ok(await segurar('KeyT', () => KOFnes.nucleo().pad[0] & 0x0800), 'PS2: T = direcional pra cima');
  await pg.evaluate(() => { KOFnes.nucleo().sistema = 'ps1'; KOFnes.controles.aplicar(); });
  r = await segurar('ArrowLeft', () => ({ e: Array.from(KOFnes.nucleo().eixos || []), p: KOFnes.nucleo().pad[0] }));
  ok(r.e[0] < -30000 && (r.p & 0x0200), 'PS1 (misto): a seta mexe o analógico e o direcional junto ' + JSON.stringify(r));
  await pg.evaluate(() => { KOFnes.nucleo().sistema = 'md'; KOFnes.controles.aplicar(); });

  // tela: aba do console do jogo, "só este jogo", B na tecla V (e quem tinha o V troca)
  await pg.evaluate(() => { const it = [...document.querySelectorAll('#rapido-lista li')]; return it.length; });
  ok(await pg.evaluate(() => { document.querySelector('[data-acao="teclas"]').click(); return !document.querySelector('#teclas').hidden && document.querySelector('#ct-abas .ativo').textContent; }) === 'MD', 'a tela abre na aba do console do jogo (MD)');
  await pg.evaluate(() => [...document.querySelectorAll('#ct-escopo button')][1].click());
  const linha = async (rot) => pg.evaluate((rot) => { const c = [...document.querySelectorAll('#grade-teclas .ct-nome')].find((x) => x.textContent.startsWith(rot)); return c ? [c.nextElementSibling.textContent, c.nextElementSibling.nextElementSibling.textContent] : null; }, rot);
  ok((await linha('A (Y)'))[0] === 'A', 'os botões aparecem com o nome do Mega Drive (A = Y do SNES, tecla A)');
  await pg.evaluate(() => { const c = [...document.querySelectorAll('#grade-teclas .ct-nome')].find((x) => x.textContent.startsWith('B')); c.nextElementSibling.click(); });
  await pg.keyboard.press('KeyV'); await pg.waitForTimeout(100);
  const cam = await pg.evaluate(() => { const id = KOFnes.estado().jogoId; return { jogo: JSON.parse(localStorage.getItem('kofnes.teclas.jogo.' + id) || '{}'), cons: localStorage.getItem('kofnes.teclas.md') }; });
  ok(cam.jogo.B === 'KeyV' && !cam.cons, 'B = V gravado só pra este jogo ' + JSON.stringify(cam));
  await pg.evaluate(() => document.querySelector('[data-acao="fechar-teclas"]').click()); await pg.waitForTimeout(300);
  ok(await segurar('KeyV', () => KOFnes.nucleo().pad[0] & 0x8000), 'no jogo, V aperta o B');

  // botão do controle: A (o C do Mega Drive) no botão Y do controle (índice 3)
  await pg.evaluate(() => document.querySelector('[data-acao="teclas"]').click());
  await pg.evaluate(() => { const c = [...document.querySelectorAll('#grade-teclas .ct-nome')].find((x) => x.textContent.startsWith('C (A)')); c.nextElementSibling.nextElementSibling.click(); });
  await pg.waitForTimeout(150); await pg.evaluate(() => { window.__b = [3]; }); await pg.waitForTimeout(200); await pg.evaluate(() => { window.__b = []; });
  ok((await linha('C (A)'))[1] === 'Y', 'C (A) agora é o Y do controle ' + JSON.stringify(await linha('C (A)')));
  if (prints) await pg.screenshot({ path: path.join(prints, 'controles.png') });
  await pg.evaluate(() => document.querySelector('[data-acao="fechar-teclas"]').click()); await pg.waitForTimeout(300);
  await pg.evaluate(() => { window.__b = [3]; }); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => KOFnes.nucleo().pad[0] & 0x0080), 'no jogo, o Y do controle aperta o A do SNES (C do Mega Drive)');
  await pg.evaluate(() => { window.__b = []; });

  // restaurar: o jogo volta a usar os do console
  await pg.evaluate(() => { document.querySelector('[data-acao="teclas"]').click(); document.querySelector('[data-acao="teclas-padrao"]').click(); });
  ok(await pg.evaluate(() => KOFnes.mapa().B === 'KeyZ'), 'Restaurar padrão: o jogo volta pro B no Z');
  ok(await pg.evaluate(() => [...document.querySelectorAll('#rapido-lista li, #rapido-lista button')].length >= 0) && await pg.evaluate(() => /Controles e teclas/.test(document.body.innerHTML)), 'tem "Controles e teclas" no menu');

  await nav.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(falhas ? falhas + ' FALHAS' : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})();
