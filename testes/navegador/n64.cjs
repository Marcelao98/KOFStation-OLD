// Nintendo 64 no PC (Mupen64Plus-Next + GLideN64 em WebAssembly, desenhando com WebGL2): abre demos livres e confere
// a imagem desenhada pelo RDP (fundo amarelo e quadrado vermelho), a imagem desenhada pela CPU (precisa da emulação do
// framebuffer, que vem do padrão das opções do núcleo), e o savestate indo e voltando (esses demos não tocam som).
//   node testes/navegador/n64.cjs dist/web InputRDP.N64 InputCPU.N64 [prints/]
// Só ROM de teste LIVRE: github.com/PeterLemon/N64 (Input/RDP e Input/CPU). Esses demos leem o controle direto da memória
// do PIF sem esperar a leitura terminar, o que o Mupen64Plus não imita: o controle de verdade só dá pra testar com jogo.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const os = require('os'), path = require('path');
const [,, pasta, romRdp, romCpu, saida = os.tmpdir()] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const p = await (await b.newContext({ viewport: { width: 1100, height: 700 } })).newPage(), erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + path.resolve(pasta, 'KOFnes.html')); await p.waitForTimeout(800);
  const cores = () => p.evaluate(() => {   // contagem por cor (rgba no formato da textura: 0xAABBGGRR)
    const s = KOFnes.nucleo(), c = {};
    for (const v of s.rgba) { const k = (v & 0xFFFFFF).toString(16).padStart(6, '0'); c[k] = (c[k] || 0) + 1; }
    return c;
  });

  await p.setInputFiles('#arquivo', romRdp); await p.waitForTimeout(4000);
  const s = await p.evaluate(() => { const s = KOFnes.nucleo(); return { nucleo: s.nucleo, sis: document.body.dataset.sis, tela: s.largura + 'x' + s.altura, quadros: s.quadros }; });
  conferir(s.nucleo === 'mupen64' && s.sis === 'n64' && s.tela === '320x240' && s.quadros > 10, 'roda no Mupen64Plus ' + JSON.stringify(s));
  const c = await cores();
  conferir(c['00ffff'] > 50000 && c['0000ff'] > 100, 'RDP: fundo amarelo e quadrado vermelho ' + JSON.stringify(c));
  const est = await p.evaluate(() => { const s = KOFnes.nucleo(), e = s.serializar(); for (let i = 0; i < 5; i++) s.runFrame(); return [e.length, s.desserializar(e)]; });
  conferir(est[0] > 1e6 && est[1] === true, `savestate guarda e volta (${est[0]} bytes, ${est[1]})`);
  await p.screenshot({ path: path.join(saida, 'n64-rdp.png') });

  await p.setInputFiles("#arquivo", romCpu); await p.waitForTimeout(9000);
  const c2 = await cores();
  conferir(Object.keys(c2).length > 1, 'CPU: o framebuffer desenhado pela CPU aparece ' + JSON.stringify(c2));
  await p.screenshot({ path: path.join(saida, 'n64-cpu.png') });
  conferir(!erros.length, 'sem erro na página ' + erros.join(' | '));
  await b.close();
  console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\ntudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
