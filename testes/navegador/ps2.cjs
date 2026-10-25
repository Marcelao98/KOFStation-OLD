// PlayStation 2 (Play!, web/ps2.js): abre um .elf e um "DVD" .iso de PS2 (SYSTEM.CNF com BOOT2) no PC, confere que roda
// (quadros do Play! andando), que pausa sozinho quando o app pausa (P) e volta, o savestate (guarda, roda, volta), que o
// cartão de memória vai pro banco, que o DVD não vai pro banco de ROMs e o aviso quando o navegador abre sem a opção do
// SharedArrayBuffer (lançador velho).
//   node testes/navegador/ps2.cjs <pasta com KOFstation.html> cube.elf "Cubo PS2.iso" [prints/]
// Use só programa LIVRE: os exemplos do ps2sdk (samples/draw/cube) e o DVD montado com testes/ps2/montar-dvd.py.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const os = require('os'), path = require('path');
const [,, pasta, elf, iso, saida = os.tmpdir()] = process.argv;
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'];
(async () => {
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const html = 'file://' + path.resolve(pasta, 'KOFstation.html');
  const estado = (p) => p.evaluate(() => { const s = KOFnes.nucleo(); return s && { nucleo: s.nucleo, sis: document.body.dataset.sis, titulo: s.cart.title, ps2: s.ps2Quadros ? s.ps2Quadros() : -1, tela: document.querySelector('#outputCanvas')?.style.display }; });
  const andou = async (p, ms = 2000) => { const a = (await estado(p)).ps2; await p.waitForTimeout(ms); return (await estado(p)).ps2 - a; };

  // 1) navegador aberto como o lançador abre (com SharedArrayBuffer)
  let b = await chromium.launch({ args: ARGS.concat('--enable-features=SharedArrayBuffer') });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(), erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(html); await p.waitForTimeout(800);
  await p.setInputFiles('#arquivo', elf); await p.waitForTimeout(6000);
  let s = await estado(p), q = await andou(p);
  conferir(s && s.nucleo === 'play' && s.sis === 'ps2' && q > 60, `.elf de PS2 roda (${q} quadros em 2 s) ${JSON.stringify(s)}`);
  await p.screenshot({ path: path.join(saida, 'ps2-elf.png') });
  // pausa (P): o app para de chamar o runFrame, o Play! pausa e o canvas some; P de novo volta
  await p.keyboard.press('p'); await p.waitForTimeout(600);
  q = await andou(p, 1000); s = await estado(p);
  conferir(q === 0 && s.tela === 'none', `pausado: a máquina para e o canvas some (${q} quadros, display=${s.tela})`);
  await p.keyboard.press('p'); await p.waitForTimeout(600);
  q = await andou(p, 1500);
  conferir(q > 40, `despausado: volta a rodar (${q} quadros em 1,5 s)`);
  // savestate (assíncrono: a thread do Play! grava)
  const st = await p.evaluate(async () => { const s = KOFnes.nucleo(), t0 = performance.now(), e = await s.estadoAsync(), t1 = performance.now(); await s.restaurarAsync(e); return { tam: e.d.length, salvar: Math.round(t1 - t0), carregar: Math.round(performance.now() - t1) }; });
  q = await andou(p, 1500);
  conferir(st.tam > 100000 && q > 40, `savestate guarda e volta ${JSON.stringify(st)}, roda depois (${q} quadros)`);
  // 2) DVD .iso: reconhecido pelo SYSTEM.CNF (BOOT2), não vira PS1
  await p.setInputFiles('#arquivo', iso); await p.waitForTimeout(8000);
  s = await estado(p); q = await andou(p);
  conferir(s && s.nucleo === 'play' && s.titulo === path.basename(iso, '.iso') && q > 60, `DVD .iso de PS2 roda (${q} quadros em 2 s) ${JSON.stringify(s)}`);
  await p.screenshot({ path: path.join(saida, 'ps2-iso.png') });
  const banco = await p.evaluate(() => new Promise((ok) => { const r = indexedDB.open('kofnes'); r.onsuccess = () => { const t = r.result.transaction(['roms', 'jogos', 'saves']); const k = t.objectStore('roms').getAllKeys(), j = t.objectStore('jogos').getAll(), sv = t.objectStore('saves').getAllKeys(); t.oncomplete = () => ok({ roms: k.result.filter((x) => /Cubo|cube/.test(x)).length, jogos: j.result.filter((x) => x.sistema === 'ps2').map((x) => x.arquivo), saves: sv.result }); }; }));
  conferir(banco.roms === 0 && banco.jogos.length === 2, `DVD e .elf não vão pro banco de ROMs; biblioteca com os 2 como PS2 ${JSON.stringify(banco)}`);
  // cartão de memória: o Play! cria arquivos no mc0 quando o jogo salva; aqui grava um à mão, pausa (o cartão vai pro banco),
  // recarrega a página e confere que o arquivo voltou pro cartão ao ligar o PS2 de novo
  await p.evaluate(() => KOFnes.ps2.gravarNoCartao('BASLUS-00000TESTE/TESTE.BIN', new Uint8Array([1, 2, 3, 4, 5])));
  await p.keyboard.press('p'); await p.waitForTimeout(1500);
  const temSave = await p.evaluate(async () => !!(await KOFnes.guarda.bdPegar('saves', 'ps2/mc0')));
  await p.reload(); await p.waitForTimeout(800);
  await p.setInputFiles('#arquivo', elf); await p.waitForTimeout(5000);
  const volta = await p.evaluate(() => KOFnes.ps2.lerDoCartao('BASLUS-00000TESTE/TESTE.BIN'));
  conferir(temSave && JSON.stringify(volta) === '[1,2,3,4,5]', `cartão de memória vai pro banco e volta ao reabrir (${temSave}, ${JSON.stringify(volta)})`);
  conferir(erros.length === 0, `sem erro na página ${erros.join(' | ')}`);
  await b.close();

  // 3) navegador sem a opção (lançador velho): avisa e não quebra
  b = await chromium.launch({ args: ARGS });
  const p2 = await (await b.newContext()).newPage(), erros2 = [];
  p2.on('pageerror', (e) => erros2.push(e.message));
  await p2.goto(html); await p2.waitForTimeout(800);
  await p2.setInputFiles('#arquivo', elf); await p2.waitForTimeout(1500);
  const aviso = await p2.evaluate(() => document.querySelector('#aviso').textContent);
  conferir(/lançador/.test(aviso) && erros2.length === 0, `sem SharedArrayBuffer: avisa pra abrir pelo lançador ("${aviso.slice(0, 60)}…")`);
  await b.close();
  console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
