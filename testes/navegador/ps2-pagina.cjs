// PS2 pelo PCSX2 nativo no MODO PÁGINA: o kofnativo (jogo de verdade, BIOS de verdade) manda os quadros pra página, que desenha
// com filtro, moldura e tema por cima; pausa (P) pausa o PCSX2; savestate vai e volta; o menu rápido mostra Filtro e Proporção.
//   node testes/navegador/ps2-pagina.cjs <KOFnes.html> <kofnativo> <pcsx2_libretro.so> <bios.bin> <jogo.iso> <pasta de saída>
// (o kofnativo de teste pode usar outra porta: o html tem que apontar pra mesma; PW = pasta do playwright, CHROME = navegador,
// CHROME_ARGS="--enable-gpu --use-angle=gl" = WebGL na placa de vídeo: sem isso o headless desenha na CPU e rouba do PCSX2)
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const [,, html, kof, nucleo, bios, iso, saida] = process.argv;
(async () => {
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'kofpag-')), log = [];
  const nat = spawn(kof, [nucleo, dados], { env: { ...process.env, KOF_DEBUG: '1' } });
  nat.stderr.on('data', (d) => log.push(String(d))); nat.stdout.on('data', (d) => log.push(String(d)));
  let morreu = null; nat.on('exit', (c, s) => { morreu = c + ' ' + s; });
  await new Promise((ok) => setTimeout(ok, 1500));
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--enable-features=SharedArrayBuffer', '--autoplay-policy=no-user-gesture-required', ...(process.env.CHROME_ARGS || '').split(' ').filter(Boolean)] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(), erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + path.resolve(html)); await p.waitForTimeout(800);
  await p.evaluate((f) => new Promise((ok) => { const r = indexedDB.open('kofnes'); r.onsuccess = () => { const t = r.result.transaction('bios', 'readwrite'); t.objectStore('bios').put({ sistema: 'ps2', dados: Uint8Array.from(f) }, 'bios-ps2.bin'); t.oncomplete = ok; }; }), Array.from(fs.readFileSync(bios)));
  const estado = () => p.evaluate(() => { const s = KOFnes.nucleo(); return s && { nucleo: s.nucleo, sis: document.body.dataset.sis, pagina: !!s.imagemNaPagina, l: s.largura, a: s.altura, ps2: s.ps2Quadros() }; });
  const andou = async (ms) => { const a = (await estado()).ps2; await p.waitForTimeout(ms); return (await estado()).ps2 - a; };
  // a área do jogo na tela: quanto dela não é preto (o quadro do PS2 chegou e foi desenhado). Pela captura da tela: o canvas
  // WebGL lido direto sai preto (sem preserveDrawingBuffer)
  const foto = async (nome) => {
    const arq = path.join(saida, nome + '.png'), cx = await p.locator('#tela').boundingBox();
    await p.screenshot({ path: arq });
    const png = (await p.screenshot({ clip: cx })).toString('base64');
    return p.evaluate((png) => new Promise((ok) => { const im = new Image(); im.onload = () => { const g = document.createElement('canvas'); g.width = 64; g.height = 48; const x = g.getContext('2d'); x.drawImage(im, 0, 0, 64, 48); const d = x.getImageData(0, 0, 64, 48).data; let n = 0, soma = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; soma += v; if (v > 30) n++; } ok({ claros: n, media: Math.round(soma / (d.length / 4)) }); }; im.src = 'data:image/png;base64,' + png; }), png);
  };
  await p.setInputFiles('#arquivo', iso); await p.waitForTimeout(25000);
  let s = await estado(), q = await andou(4000);
  conferir(s && s.nucleo === 'pcsx2' && s.sis === 'ps2' && s.pagina && q > 200, `o SotC roda no modo página (${q} quadros em 4 s) ${JSON.stringify(s)}`);
  // emulados × recebidos na mesma janela de 6 s (o "quadros" do kofnativo chega 1 vez por segundo)
  const r = await p.evaluate(() => new Promise((ok) => { const s = KOFnes.nucleo(), a = s.ps2Recebidos(), e = s.ps2Quadros(); setTimeout(() => ok({ recebidos: s.ps2Recebidos() - a, emulados: s.ps2Quadros() - e }), 6000); }));
  conferir(r.recebidos >= r.emulados * 0.95 - 60, `os quadros chegam na página ${JSON.stringify(r)} em 6 s`);
  const desemp = await p.evaluate(() => KOFnes.desempenho());
  console.log('       desempenho da página:', JSON.stringify(desemp));
  await p.waitForTimeout(15000);   // a abertura do jogo, com imagem
  // filtros: a imagem passa pelo shader da página
  for (const f of ['original', 'tv', 'locadora', 'gameboy', 'cartoon']) {
    const ok = await p.evaluate((f) => { if (!KofVisual.PREDEF.some(([k]) => k === f)) return false; KOFnes.aplicarFiltro(f); return KOFnes.filtro() === f; }, f);
    if (!ok) { console.log('       (filtro ' + f + ' não existe aqui)'); continue; }
    await p.waitForTimeout(700); const r = await foto('filtro-' + f);
    conferir(r.claros > 50, `filtro ${f}: imagem do jogo na tela ${JSON.stringify(r)}`);
  }
  await p.evaluate(() => KOFnes.aplicarFiltro('original'));
  // molduras
  const molds = await p.evaluate(() => KofMolduras.LISTA.slice(0, 3).map((m) => m.id));
  for (const m of molds) {
    await p.evaluate((m) => KOFnes.mudarMoldura(m, true), m); await p.waitForTimeout(700);
    const r = await foto('moldura-' + m), bg = await p.evaluate(() => getComputedStyle(document.querySelector('#tela').parentElement).backgroundImage.slice(0, 30));
    conferir(r.claros > 50, `moldura ${m}: jogo na tela ${JSON.stringify(r)} fundo=${bg}`);
  }
  await p.evaluate(() => KOFnes.mudarMoldura('nenhuma', true));
  // temas
  const temas = await p.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('.previa')).map((x) => x.dataset.tema))).slice(0, 3));
  for (const t of temas.length ? temas : ['luna']) {
    await p.evaluate((t) => { document.documentElement.dataset.tema = t; }, t); await p.waitForTimeout(500);
    const r = await foto('tema-' + t); conferir(r.claros > 50, `tema ${t}: jogo na tela ${JSON.stringify(r)}`);
  }
  // pausa: P para o PCSX2 (some o som), P de novo volta
  await p.keyboard.press('p'); await p.waitForTimeout(800);
  q = await andou(1500); conferir(q === 0, `pausado (P): o PCSX2 para (${q} quadros em 1,5 s)`);
  const pausa = await foto('pausado'); conferir(pausa.claros > 50, `pausado: o último quadro continua na tela por baixo do menu ${JSON.stringify(pausa)}`);
  await p.keyboard.press('p'); await p.waitForTimeout(800);
  q = await andou(3000); conferir(q > 120, `despausado: volta (${q} quadros em 3 s)`);
  // controles: L2 (E) e R2 (R) do teclado chegam no PS2; o celular como controle (botões + analógico) também
  const pad = async () => p.evaluate(() => { const s = KOFnes.nucleo(); return { pad: s.pad[0], eixos: s.eixos ? Array.from(s.eixos) : null }; });
  await p.keyboard.down('KeyE'); await p.keyboard.down('KeyR'); await p.waitForTimeout(200);
  let c = await pad(); await p.keyboard.up('KeyE'); await p.keyboard.up('KeyR');
  conferir((c.pad & 0x000C) === 0x000C, `L2 e R2 do teclado chegam no PS2 (pad=${c.pad.toString(16)})`);
  // celular falso: o mesmo protocolo do ControleServidor do APK ("KOF <senha> <nome>" -> "ok"; binário bits u16 + 4 eixos int8)
  const celular = require('http').createServer(), conexoes = [];
  celular.on('upgrade', (req, sock) => {
    const k = require('crypto').createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + k + '\r\n\r\n');
    sock.on('data', () => {});
    const manda = (op, d) => sock.write(Buffer.concat([Buffer.from([0x80 | op, d.length]), d]));
    setTimeout(() => manda(1, Buffer.from('ok')), 100); conexoes.push(manda);
  });
  await new Promise((ok) => celular.listen(8650, '127.0.0.1', ok));
  await p.evaluate(() => KOFnes.controle.conectar('127.0.0.1:8650 1234')); await p.waitForTimeout(800);
  const ctl = await p.evaluate(() => KOFnes.controle.estado());
  conferir(ctl.ligado, 'celular falso conectou como controle');
  conexoes[0](2, Buffer.from(Int8Array.from([0x80, 0x00 | 0x00, 127, 0, 0, -127]).buffer).fill(0x88, 0, 1));   // bits 0x0088 (L2 + um botão), eixo X todo pra direita, Y2 pra cima
  await p.waitForTimeout(300); c = await pad();
  conferir((c.pad & 0x0088) === 0x0088 && c.eixos && c.eixos[0] > 30000 && c.eixos[3] < -30000, `botões e analógico do celular chegam no PS2 ${JSON.stringify(c)}`);
  conexoes[0](2, Buffer.alloc(6)); await p.waitForTimeout(200);
  await p.evaluate(() => KOFnes.controle.desconectar()); celular.close();
  // menu rápido (F2): Filtro e Proporção aparecem (antes sumiam no PS2 nativo)
  await p.keyboard.press('F2'); await p.waitForTimeout(500);
  const menu = await p.evaluate(() => document.body.innerText);
  conferir(/Filtro/.test(menu) && /Proporção/.test(menu), 'menu rápido tem Filtro e Proporção');
  await foto('menu-rapido'); await p.keyboard.press('Escape'); await p.waitForTimeout(800);
  // savestate
  const st = await p.evaluate(async () => { const s = KOFnes.nucleo(), t0 = performance.now(), e = await s.estadoAsync(), t1 = performance.now(); await s.restaurarAsync(e); return { tam: e.d.length, salvar: Math.round(t1 - t0), carregar: Math.round(performance.now() - t1) }; });
  q = await andou(3000);
  conferir(st.tam > 1e6 && q > 120, `savestate guarda e volta ${JSON.stringify(st)}, roda depois (${q} quadros)`);
  await foto('depois-do-estado');
  conferir(!morreu, 'o kofnativo não caiu ' + (morreu || ''));
  conferir(!/filtro não compilou/.test(log.join('')), 'sem erro de filtro no kofnativo');
  conferir(!erros.length, 'sem erro na página ' + erros.join(' | '));
  await b.close(); nat.kill();
  fs.writeFileSync(path.join(saida, 'kofnativo.log'), log.join(''));
  console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
