// 🖥 Jogar no PC, de ponta a ponta: página do PC + kofservico de verdade, página do celular + Rede.java de verdade (no Linux).
// Pareia, o PC abre um jogo de Mega Drive (gerado aqui: fundo vermelho), o celular pede pra jogar no PC e recebe o vídeo
// (confere a cor no <video>), o som chega como trilha de áudio, e os botões do celular chegam no PC pelo canal de dados.
//   node testes/navegador/jogar-no-pc.cjs <pasta com os 2 html> <kofservico> <classes> <org.json.jar> <libs> [prints]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const [dir, bin, classes, jsonJar, libs, prints] = process.argv.slice(2);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kofjpc-'));
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'ok: ' : 'FALHOU: ') + m); if (!c) falhas++; };

// Mega Drive: liga a tela e pinta o fundo de vermelho (68000 escrito à mão)
function romVermelha() {
  const r = Buffer.alloc(0x400);
  r.writeUInt32BE(0xFFFE00, 0); r.writeUInt32BE(0x200, 4); r.write('SEGA MEGA DRIVE ', 0x100);
  const c = [0x33FC, 0x8004, 0x00C0, 0x0004, 0x33FC, 0x8144, 0x00C0, 0x0004, 0x33FC, 0x8700, 0x00C0, 0x0004,
    0x23FC, 0xC000, 0x0000, 0x00C0, 0x0004, 0x33FC, 0x000E, 0x00C0, 0x0000, 0x60FE];
  c.forEach((w, i) => r.writeUInt16BE(w, 0x200 + 2 * i));
  return r;
}

(async () => {
  const pcSrv = spawn(bin, ['--pasta', path.join(tmp, 'pc'), '--nome', 'PC da sala'], { stdio: 'ignore' });
  const nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const pg = await nav.newPage({ viewport: { width: 900, height: 700 } });
  pg.on('pageerror', (e) => console.log('ERRO na página do PC:', e.message));
  await pg.goto('file://' + path.resolve(dir, 'KOFnes.html'));
  await pg.waitForTimeout(1500);

  const java = spawn('java', ['-Djava.library.path=' + libs, '-cp', classes + ':' + jsonJar, 'dev.kofnes.android.Rede', path.join(tmp, 'cel'), '127.0.0.1:8650'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const cel = await nav.newPage({ viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true });
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

  // parear (o fluxo da tela já tem teste próprio: aqui vai direto pelo código)
  await pg.evaluate(() => document.querySelector('[data-acao="aparelhos"]').click());
  await pg.waitForSelector('#ap-com:not([hidden])', { timeout: 15000 });
  await pg.click('[data-acao="ap-parear"]');
  await pg.waitForSelector('#ap-qr:not([hidden])');
  const codigo = (await pg.textContent('#ap-codigo')).replace(/\s/g, '');
  await cel.evaluate((c) => KOFnesApk.redeCmd(JSON.stringify({ t: 'parear-com', ip: '127.0.0.1', porta: 8650, senha: c, modo: 'c' })), codigo);
  await pg.waitForFunction(() => /conectado/.test(document.querySelector('#ap-lista').textContent), null, { timeout: 15000 });
  await cel.waitForFunction(() => !document.querySelector('[data-acao="jogar-pc"]').hidden, null, { timeout: 15000 }).catch(() => {});
  ok(!(await cel.evaluate(() => document.querySelector('[data-acao="jogar-pc"]').hidden)), 'celular: botão "🖥 Jogar no PC" aparece com o PC na rede');

  // sem jogo aberto no PC: o celular recebe o aviso
  await cel.evaluate(() => { document.querySelector('[data-acao="aparelhos"]').click(); });
  await cel.waitForSelector('#ap-lista button.grande:not(.sec)', { timeout: 5000 });
  await cel.click('#ap-lista button.grande:not(.sec)');
  await cel.waitForFunction(() => !document.querySelector('#modo-controle'), null, { timeout: 10000 }).catch(() => {});
  ok(!(await cel.$('#modo-controle')), 'sem jogo no PC: o celular avisa e sai');

  fs.writeFileSync(path.join(tmp, 'Fundo Vermelho.md'), romVermelha());
  await pg.setInputFiles('#arquivo', path.join(tmp, 'Fundo Vermelho.md'));
  await pg.waitForTimeout(1500);
  ok(await pg.evaluate(() => KOFnes.estado().snes), 'PC abriu o jogo');

  await cel.evaluate(() => document.querySelector('[data-acao="aparelhos"]').click());
  await cel.waitForSelector('#ap-lista button.grande:not(.sec)');
  const t0 = Date.now();
  await cel.click('#ap-lista button.grande:not(.sec)');
  await cel.waitForFunction(() => { const v = document.querySelector('#modo-controle .mc-video'); return v && v.videoWidth > 0 && v.currentTime > 0.3; }, null, { timeout: 20000 }).catch(() => {});
  const v = await cel.evaluate(() => { const v = document.querySelector('#modo-controle .mc-video'); return v ? { l: v.videoWidth, a: v.videoHeight, t: v.currentTime, audio: v.srcObject && v.srcObject.getAudioTracks().length } : null; });
  ok(v && v.l > 0, `celular recebe o vídeo do PC: ${v && v.l}x${v && v.a} em ${Date.now() - t0} ms`);
  ok(v && v.audio === 1, 'com trilha de som');
  const cor = await cel.evaluate(() => { const v = document.querySelector('#modo-controle .mc-video'); const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.drawImage(v, 0, 0, 64, 64); return Array.from(g.getImageData(32, 32, 1, 1).data); });
  ok(cor[0] > 180 && cor[1] < 70 && cor[2] < 70, 'a imagem é a do jogo (fundo vermelho): ' + cor);
  const ctl = await cel.evaluate(() => ({ sis: document.body.dataset.sis, ligado: document.querySelector('#modo-controle').classList.contains('ligado'), status: document.querySelector('.mc-status').textContent }));
  ok(ctl.sis === 'md' && ctl.ligado && ctl.status === 'PC da sala', 'controle virou o do Mega Drive e mostra o PC ' + JSON.stringify(ctl));
  const tr = await pg.evaluate(() => KOFnes.transmissao());
  ok(tr.ligada && tr.estado === 'connected' && tr.dc === 'open', 'PC transmitindo ' + JSON.stringify(tr));

  const apertar = (sel) => cel.evaluate((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); }, sel);
  const soltar = (sel) => cel.evaluate((s) => document.querySelector(s).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3 })), sel);
  await apertar('#ctl [data-b="A"]'); await pg.waitForTimeout(300);
  const a = await pg.evaluate(() => KOFnes.botoes());
  await soltar('#ctl [data-b="A"]'); await pg.waitForTimeout(300);
  const solto = await pg.evaluate(() => KOFnes.botoes());
  ok((a & 0x0080) && !(solto & 0x0080), `botão do celular chega no PC pelo WebRTC (${a.toString(16)} → ${solto.toString(16)})`);
  await cel.waitForTimeout(1500);
  ok(/\d+ ms/.test(await cel.textContent('#modo-controle .mc-ping')), 'atraso medido: ' + await cel.textContent('#modo-controle .mc-ping'));
  // ⏪ segurando = Select+Y no PC (o rebobinar de lá)
  await cel.evaluate(() => document.querySelector('.mc-atalhos [data-at="rebob"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5 })));
  await pg.waitForTimeout(300);
  const rb = await pg.evaluate(() => KOFnes.botoes());
  await cel.evaluate(() => document.querySelector('.mc-atalhos [data-at="rebob"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5 })));
  await pg.waitForTimeout(300);
  ok((rb & 0x6000) === 0x6000 && !(await pg.evaluate(() => KOFnes.botoes() & 0x6000)), '⏪ segurado vira Select+Y (rebobinar) no PC e solta');
  await cel.click('.mc-atalhos [data-at="salvar-estado"]');
  await cel.waitForFunction(() => /estado salvo no PC/.test(document.body.textContent), null, { timeout: 8000 }).catch(() => {});
  ok(/estado salvo no PC/.test(await cel.textContent('body')), '💾 salva estado no PC pelo celular');
  ok(!(await pg.evaluate(() => KOFnes.estado().pausado)), 'o PC segue rodando depois de salvar');
  // ☰: o menu rápido do PC aparece no celular
  await cel.click('.mc-atalhos [data-at="menu"]');
  await cel.waitForSelector('#modo-controle .mc-menu-pc .mc-item', { timeout: 5000 }).catch(() => {});
  const itens = await cel.$$eval('#modo-controle .mc-menu-pc .mc-item', (l) => l.map((x) => x.textContent));
  ok(itens.some((t) => /Tema/.test(t)) && itens.some((t) => /Volume/.test(t)) && itens.some((t) => /Salvar estado/.test(t)), '☰ mostra o menu do PC no celular: ' + itens.length + ' itens');
  const temaAntes = itens.find((t) => /Tema/.test(t));
  await cel.evaluate(() => [...document.querySelectorAll('#modo-controle .mc-menu-pc .mc-item')].find((x) => /Tema/.test(x.textContent)).querySelector('.mc-aj:last-child').click());
  await cel.waitForFunction((a) => [...document.querySelectorAll('#modo-controle .mc-menu-pc .mc-item')].some((x) => /Tema/.test(x.textContent) && x.textContent !== a), temaAntes, { timeout: 5000 }).catch(() => {});
  const temaDepois = await cel.evaluate(() => [...document.querySelectorAll('#modo-controle .mc-menu-pc .mc-item')].find((x) => /Tema/.test(x.textContent)).textContent);
  ok(temaDepois !== temaAntes, `▶ no celular troca o tema do PC (${temaAntes} → ${temaDepois})`);
  if (prints) await cel.screenshot({ path: path.join(prints, 'jogar-no-pc-menu.png') });
  await cel.click('#modo-controle .mc-menu [data-r="voltar"]');
  ok(!(await pg.evaluate(() => KOFnes.estado().pausado)) && await cel.isHidden('#modo-controle .mc-menu'), 'volta ao jogo com o PC rodando');
  if (prints) { await cel.screenshot({ path: path.join(prints, 'jogar-no-pc-celular.png') }); await pg.screenshot({ path: path.join(prints, 'jogar-no-pc-pc.png') }); }

  await cel.evaluate(() => document.querySelector('#modo-controle .mc-sair').click());
  await pg.waitForFunction(() => !KOFnes.transmissao().ligada, null, { timeout: 5000 }).catch(() => {});
  ok(!(await pg.evaluate(() => KOFnes.transmissao().ligada)), 'sair no celular encerra a transmissão no PC');

  // controle mexe nas telas do PC: direcional escolhe, B fecha
  const pad = async (b) => { await pg.evaluate((x) => KOFnes.padTeste(x), b); await pg.waitForTimeout(120); await pg.evaluate(() => KOFnes.padTeste(0)); await pg.waitForTimeout(120); };
  await pg.evaluate(() => document.querySelector('[data-acao="aparelhos"]').click());
  await pg.waitForTimeout(300);
  await pad(0x0400);
  const f1 = await pg.evaluate(() => { const e = document.querySelector('.foco-pad'); return e && e.closest('#aparelhos') ? e.textContent.trim().slice(0, 30) : null; });
  await pad(0x0400);
  const f2 = await pg.evaluate(() => { const e = document.querySelector('.foco-pad'); return e ? e.textContent.trim().slice(0, 30) : null; });
  ok(f1 && f2 && f1 !== f2, `direcional anda pelos botões da tela (${f1} → ${f2})`);
  if (prints) await pg.screenshot({ path: path.join(prints, 'controle-navegando.png') });
  await pad(0x8000);
  ok(await pg.isHidden('#aparelhos'), 'B fecha a janela');

  await nav.close(); java.kill(); pcSrv.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(falhas ? falhas + ' FALHAS' : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})();
