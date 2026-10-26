// PS2 pelo PCSX2 nativo (pc-nativo/kofnativo.c): a página conecta no kofnativo de verdade (rodando numa tela virtual), sem
// BIOS pede a BIOS, com uma BIOS manda a BIOS e o disco (aos pedaços), o filtro da página compila lá, e o erro do PCSX2
// (aqui a BIOS é falsa: ele recusa) aparece na tela com o log. Jogo de verdade só com a BIOS do console do Marcelo.
//   xvfb-run -a node testes/navegador/ps2-nativo.cjs <pasta com KOFnes.html> <kofnativo> <pcsx2_libretro.so> "Cubo PS2.iso"
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const [,, pasta, kof, nucleo, iso] = process.argv;
(async () => {
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'kofnat-')), log = [];
  const nat = spawn(kof, [nucleo, dados], { env: { ...process.env, KOF_JANELA: '1', SDL_AUDIODRIVER: 'dummy' } });
  nat.stderr.on('data', (d) => log.push(String(d)));
  await new Promise((ok) => setTimeout(ok, 1500));
  const b = await chromium.launch({ args: ['--enable-features=SharedArrayBuffer', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext()).newPage(), erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + path.resolve(pasta, 'KOFnes.html')); await p.waitForTimeout(800);
  // 1) sem BIOS: pede a BIOS (tela de BIOS do PS2)
  await p.setInputFiles('#arquivo', iso); await p.waitForTimeout(1500);
  const tela = await p.evaluate(() => ({ aberta: !document.querySelector('#bios-tela').hidden, nome: document.querySelector('#bios-nome').textContent }));
  conferir(tela.aberta && tela.nome === 'PlayStation 2', 'sem BIOS: o KOFstation pede a BIOS do PS2 ' + JSON.stringify(tela));
  // 2) com uma BIOS (falsa, 4 MB): vai pro kofnativo, o disco é pedido e o erro do PCSX2 aparece com o log
  const falsa = process.env.KOF_BIOS ? Array.from(fs.readFileSync(process.env.KOF_BIOS)) : null;   // KOF_BIOS: uma BIOS falsa que passa na conferência do PCSX2 (testa o disco)
  await p.evaluate((f) => new Promise((ok) => { const r = indexedDB.open('kofnes'); r.onsuccess = () => { const t = r.result.transaction('bios', 'readwrite'); t.objectStore('bios').put({ sistema: 'ps2', dados: f ? Uint8Array.from(f) : new Uint8Array(4194304) }, 'bios-ps2.bin'); t.oncomplete = ok; }; }), falsa);
  await p.evaluate(() => { document.querySelector('#bios-tela').hidden = true; });
  await p.setInputFiles('#arquivo', iso); await p.waitForTimeout(6000);
  const biosLa = fs.existsSync(path.join(dados, 'sistema/pcsx2/bios/bios-ps2.bin')) && fs.statSync(path.join(dados, 'sistema/pcsx2/bios/bios-ps2.bin')).size;
  conferir(biosLa === 4194304, `a BIOS foi pro kofnativo (${biosLa} bytes)`);
  const aviso = await p.evaluate(() => ({ erro: document.querySelector('#aviso').classList.contains('erro'), texto: document.querySelector('#aviso').textContent }));
  conferir(aviso.erro && /PS2|PCSX2/.test(aviso.texto), 'o erro do PCSX2 aparece na tela e fica: ' + aviso.texto.slice(0, 120));
  const txt = log.join('');
  conferir(!/filtro não compilou/.test(txt), 'o filtro da página compilou no kofnativo');
  conferir(/BIOS/.test(txt), 'o PCSX2 recebeu a BIOS e respondeu (aqui recusa a falsa)');
  // 3) o filtro de TV (o mais pesado) também compila lá
  await p.evaluate(() => KOFnes.aplicarFiltro && KOFnes.aplicarFiltro('tv'));
  await p.evaluate(() => { const s = KOFnes.nucleo(); if (s && s.runFrame) s.runFrame(); });
  await p.waitForTimeout(800);
  conferir(!/filtro não compilou/.test(log.join('')), 'o filtro de TV compilou no kofnativo');
  conferir(!erros.length, 'sem erro na página ' + erros.join(' | '));
  await b.close(); nat.kill();
  fs.writeFileSync(path.join(dados, 'kofnativo.log'), log.join(''));
  console.log(falhas.length ? `${falhas.length} falha(s) (log em ${dados}/kofnativo.log)` : 'tudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
