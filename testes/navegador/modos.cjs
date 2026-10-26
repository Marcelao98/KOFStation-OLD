// Modos de jogo (Só alegria, Normal, Raiz, Hardcore) e a aba Opções de emulação: escolha ao abrir um jogo (teclado e toque),
// Hardcore sem estados/rebobinar, Só alegria com 30 s de rebobinar, opções guardadas, "não perguntar mais".
//   node testes/navegador/modos.cjs dist/web/KOFnes.html <pasta pros prints> (gera uma ROM de NES de teste lá)
const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs'), path = require('path');
const [,, html, prints] = process.argv;
const nes = Buffer.alloc(16 + 0x4000 + 0x2000); nes.write('NES\x1a', 0); nes[4] = 1; nes[5] = 1; nes.writeUInt16LE(0xC000, 16 + 0x3FFC); nes[16] = 0x4C; nes[17] = 0x00; nes[18] = 0xC0;
const rom = path.join(prints, 'Teste dos Modos.nes'); fs.writeFileSync(rom, nes);
const falhas = []; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FALHA ') + m); if (!c) falhas.push(m); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1000, height: 760 } }); await ctx.addInitScript(() => { window.__kofModo = 1; }); const p = await ctx.newPage(), erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + path.resolve(html)); await p.waitForTimeout(800);
  await p.evaluate(() => { const a = document.querySelector('#abertura'); if (a) a.hidden = true; });
  await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => !document.querySelector('#modo-tela').hidden), 'ao abrir o jogo aparece a escolha do modo');
  await p.screenshot({ path: path.join(prints, 'modo-escolha.png') });
  const f1 = await p.evaluate(() => KOFnes.nucleo().quadro || 0);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  const m = await p.evaluate(() => ({ modo: document.body.dataset.modo, aberto: !document.querySelector('#modo-tela').hidden, rebob: KOFnes.rebobEstado() }));
  ok(m.modo === 'hardcore' && !m.aberto && m.rebob.fotos === -1, 'teclado: ↓↓ + Enter (do Normal) escolhe Hardcore (sem rebobinar) ' + JSON.stringify(m));
  await p.keyboard.press('F5'); await p.waitForTimeout(300);
  ok(/Hardcore/.test(await p.evaluate(() => document.querySelector('#aviso').textContent)), 'Hardcore: F5 não salva estado e avisa');
  // menu rápido: Modo com ◀▶
  await p.keyboard.press('F2'); await p.waitForTimeout(300);
  ok(/🎮 Modo/.test(await p.evaluate(() => document.querySelector('#rapido').innerText)), 'menu rápido tem o Modo');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // opções de emulação
  await p.evaluate(() => document.querySelector('[data-acao="emu-opcoes"]').click()); await p.waitForTimeout(500);
  ok(await p.evaluate(() => !document.querySelector('#emu-opcoes').hidden && document.querySelectorAll('.emu-op').length >= 6), 'Emulação → Opções de emulação abre a aba com as opções');
  await p.selectOption('#emu-modo', 'alegria'); await p.selectOption('#emu-maxEstados', '10'); await p.selectOption('#emu-rebobLimite', '10'); await p.selectOption('#emu-autoSeg', '15');
  await p.screenshot({ path: path.join(prints, 'modo-opcoes.png') });
  const o = await p.evaluate(() => ({ modo: localStorage.getItem('kofnes.modo'), max: localStorage.getItem('kofnes.maxEstados'), reb: localStorage.getItem('kofnes.rebobLimite'), auto: localStorage.getItem('kofnes.autoSeg') }));
  ok(o.modo === 'alegria' && o.max === '10' && o.reb === '10' && o.auto === '15', 'opções ficam guardadas ' + JSON.stringify(o));
  await p.evaluate(() => document.querySelector('[data-acao="fechar-estados"]').click()); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => KOFnes.rebobEstado());
  ok(r.limite === 30 && r.fotos > 0, 'Só alegria: rebobinar de 30 s ligado ' + JSON.stringify(r));
  // não perguntar mais
  await p.evaluate(() => localStorage.setItem('kofnes.modoPerguntar', '0'));
  await p.reload(); await p.waitForTimeout(800); await p.evaluate(() => { const a = document.querySelector('#abertura'); if (a) a.hidden = true; });
  await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => document.querySelector('#modo-tela').hidden && document.body.dataset.modo === 'alegria'), 'com "não perguntar": abre direto no modo guardado');
  ok(!erros.length, 'sem erro na página ' + erros.join(' | '));
  // celular
  const cx = await b.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true }); await cx.addInitScript(() => { window.__kofModo = 1; }); const c = await cx.newPage(); c.on('pageerror', (e) => erros.push('cel: ' + e.message));
  await c.goto('file://' + path.resolve(path.dirname(html), 'KOFnes-android.html')); await c.waitForTimeout(1000);
  await c.evaluate(() => { const a = document.querySelector('#abertura'); if (a) a.hidden = true; });
  await c.setInputFiles('#arquivo', rom); await c.waitForTimeout(1500);
  ok(await c.evaluate(() => !document.querySelector('#modo-tela').hidden), 'celular: aparece a escolha do modo');
  await c.screenshot({ path: path.join(prints, 'modo-celular.png') });
  await c.tap('.modo-op[data-modo="raiz"]'); await c.waitForTimeout(400);
  ok(await c.evaluate(() => document.body.dataset.modo === 'raiz' && document.querySelector('#modo-tela').hidden), 'celular: toque escolhe Raiz');
  ok(!erros.length, 'sem erro (celular) ' + erros.join(' | '));
  await b.close(); console.log(falhas.length ? falhas.length + ' falha(s)' : 'tudo certo'); process.exit(falhas.length ? 1 : 0);
})();
