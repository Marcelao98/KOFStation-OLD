// Busca da biblioteca com a base de jogos (gênero, empresa, ano...): node testes/navegador/busca.cjs <KOFnes.html> <pasta dos prints>
// Só nomes de jogo (não precisa de ROM): a lista de teste usa nomes No-Intro e a base acha o resto.
const { chromium } = require('playwright');
const [,, html, saida] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(500);
  // a base carrega na 1ª vez que a biblioteca abre
  const t0 = Date.now();
  r.base = await p.evaluate(() => KofJogos.carregar()); r.msCarregar = Date.now() - t0;
  r.mario = await p.evaluate(() => KofJogos.info('snes', 'Super Mario World (USA)'));
  r.zelda = await p.evaluate(() => KofJogos.info('snes', 'The Legend of Zelda - A Link to the Past (Brazil)'));
  r.zipSemConsole = await p.evaluate(() => (KofJogos.info(null, 'Sonic The Hedgehog 2 (World)') || {}).sistema);
  r.neogeo = await p.evaluate(() => KofJogos.info('neogeo', 'kof98'));
  r.ps1 = await p.evaluate(() => KofJogos.info('ps1', 'Crash Bandicoot (USA)'));
  // CRC32 igual ao do zlib (e sem o cabeçalho de 512 bytes no SNES)
  r.crc = await p.evaluate(() => { const u = new Uint8Array(1024 + 512); for (let i = 0; i < u.length; i++) u[i] = i * 7; return [KofJogos.crcRom('gba', new TextEncoder().encode('123456789')), KofJogos.crcRom('snes', u) === KofJogos.crcRom('gba', u.subarray(512))]; });
  const nomes = ['Super Mario World (USA)', 'Chrono Trigger (USA)', 'Street Fighter II Turbo (USA)', 'Final Fantasy III (USA) (Rev 1)', 'Donkey Kong Country (USA) (Rev 2)',
    'Super Metroid (Japan, USA) (En,Ja)', 'Mortal Kombat II (USA)', 'Secret of Mana (USA)', 'Sonic The Hedgehog 2 (World)', 'Jogo Inventado Que Nao Existe (Brazil)'];
  r.montar = await p.evaluate((n) => KOFnes.testeLista(10, n), nomes);
  await p.waitForTimeout(200);
  r.chips = await p.$$eval('#bib-filtros .chip', (bs) => bs.map((b) => b.textContent));
  const busca = async (t) => { await p.fill('#filtro', t); await p.waitForTimeout(400); return p.$$eval('#roms li > span', (s) => s.map((x) => x.textContent)); };
  r.rpg = await busca('rpg'); r.capcom = await busca('capcom'); r.ano1994 = await busca('1994'); r.luta = await busca('luta');
  r.campos = await busca('empresa:nintendo ano:199'); r.nomeContinua = await busca('mario');
  await p.fill('#filtro', ''); await p.waitForTimeout(300);
  // filtro de gênero pela fileira de botões: abre a lista com as contagens, escolhe RPG
  await p.click('#bib-filtros [data-faceta="genero"]');
  r.opcoesGenero = await p.$$eval('#bib-pop .pop-lista button', (bs) => bs.map((b) => b.textContent));
  if (saida) await p.screenshot({ path: saida + '/busca-generos.png' });
  await p.click('#bib-pop button:has-text("RPG")'); await p.waitForTimeout(200);
  r.soRpg = await p.$$eval('#roms li > span', (s) => s.map((x) => x.textContent));
  r.chipAtivo = await p.textContent('#bib-filtros .chip.ativo');
  r.infoMeta = await p.$$eval('#info-meta .chip', (bs) => bs.map((b) => b.textContent));
  if (saida) await p.screenshot({ path: saida + '/busca-rpg.png' });
  await p.click('#bib-filtros .chip.ativo'); await p.waitForTimeout(200); r.semFiltro = await p.locator('#roms li').count();
  // ordenar por ano
  await p.click('#bib-filtros [data-faceta="ordem"]'); await p.click('#bib-pop button:has-text("Ano")'); await p.waitForTimeout(200);
  r.porAno = await p.$$eval('#roms li > span', (s) => s.map((x) => x.textContent));
  // empresa: lista grande com caixinha de procurar e teclado (setas + Enter, Esc fecha)
  await p.click('#bib-filtros [data-faceta="empresa"]'); r.empresaFoco = await p.evaluate(() => document.activeElement.className || document.activeElement.tagName);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  r.empresaTeclado = await p.textContent('#bib-filtros .chip.ativo').catch(() => '');
  await p.click('#bib-filtros [data-faceta="decada"]'); await p.keyboard.press('Escape'); r.escFecha = await p.isHidden('#bib-pop');
  r.bibAberta = await p.isVisible('#biblioteca');
  // desempenho: 5000 jogos com a base
  r.montar5000 = await p.evaluate((n) => KOFnes.testeLista(5000, n), nomes);
  r.busca5000 = await p.evaluate(async () => { const t = performance.now(); document.querySelector('#filtro').value = 'rpg'; document.querySelector('#filtro').dispatchEvent(new Event('input')); await new Promise((ok) => setTimeout(ok, 200)); return Math.round(performance.now() - t - 140); });
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
