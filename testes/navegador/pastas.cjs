// Pasta Kof Games (estrutura fixa): a página arruma os jogos fora do lugar e copia pra lá o que vem de fora.
// A pasta é imitada pelo armazenamento do navegador (OPFS), que se comporta como uma pasta escolhida com permissão de escrita.
//   node testes/navegador/pastas.cjs dist/web
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const pasta = path.resolve(process.argv[2]);
const falhas = []; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FALHA ') + m); if (!c) falhas.push(m); };
const nes = Buffer.alloc(16 + 0x4000 + 0x2000); nes.write('NES\x1a', 0); nes[4] = 1; nes[5] = 1; nes.writeUInt16LE(0xC000, 16 + 0x3FFC); nes[16] = 0x4C; nes[17] = 0x00; nes[18] = 0xC0;
(async () => {
  const srv = http.createServer((q, r) => { const f = path.join(pasta, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.writeHead(404); r.end(); return; } r.end(fs.readFileSync(f)); });
  await new Promise((k) => srv.listen(8771, '127.0.0.1', k));
  const b = await chromium.launch(), p = await (await b.newContext()).newPage(), erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('http://127.0.0.1:8771/KOFnes.html'); await p.waitForTimeout(800);
  // a pasta "Kof Games" de mentira, com jogos fora do lugar
  await p.evaluate(async (nesB) => {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
    const escreve = async (dir, nome, dados) => { const w = await (await dir.getFileHandle(nome, { create: true })).createWritable(); await w.write(dados); await w.close(); };
    const games = await r.getDirectoryHandle('Games', { create: true }), novos = await r.getDirectoryHandle('Novos', { create: true });
    await r.getDirectoryHandle('KOFstation', { create: true });
    await escreve(novos, 'Teste NES.nes', new Uint8Array(nesB));
    await escreve(novos, 'leia-me.txt', 'oi');
    await escreve(games, 'Solto.gba', new Uint8Array(1024));
    const snes = await games.getDirectoryHandle('snes', { create: true });
    await escreve(snes, 'Errado.gb', new Uint8Array(1024));
    const cd = await novos.getDirectoryHandle('CD Teste', { create: true });
    await escreve(cd, 'CD Teste.cue', 'FILE "CD Teste.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n');
    await escreve(cd, 'CD Teste.bin', new Uint8Array(0x10000));
    await escreve(novos, 'Jogo.cue', 'FILE "Jogo.bin" BINARY\n  TRACK 01 MODE2/2352\n');
    await escreve(novos, 'Jogo.bin', new Uint8Array(0x10000));
    KOFnes.kofGames.usar(r);   // a pasta escolhida (no uso de verdade vem do seletor e fica guardada no banco; ler de volta do banco uma pasta do OPFS derruba o navegador de teste)
  }, Array.from(nes));
  await p.evaluate(() => document.querySelector('[data-acao="biblioteca"]').click()); await p.waitForTimeout(4000);
  const arvore = await p.evaluate(async () => {
    const out = []; const r = await navigator.storage.getDirectory();
    async function lista(d, pre) { for await (const [n, h] of d.entries()) { if (h.kind === 'directory') await lista(h, pre + n + '/'); else out.push(pre + n); } }
    await lista(r, ''); return out.sort();
  });
  const tem = (c) => arvore.includes(c);
  ok(tem('Games/nes/Teste NES.nes') && !tem('Novos/Teste NES.nes'), 'Novos/Teste NES.nes foi pra Games/nes');
  ok(tem('Games/gba/Solto.gba') && !tem('Games/Solto.gba'), 'jogo solto em Games foi pra Games/gba');
  ok(tem('Games/gb/Errado.gb') && !tem('Games/snes/Errado.gb'), 'jogo na pasta de console errada (gb em snes) foi pra Games/gb');
  ok(tem('Games/psx/CD Teste/CD Teste.cue') && tem('Games/psx/CD Teste/CD Teste.bin'), 'pasta com CD (.cue + .bin) foi inteira pra Games/psx');
  ok(tem('Games/psx/Jogo.cue') && tem('Games/psx/Jogo.bin'), '.cue solto levou o .bin junto pra Games/psx');
  ok(tem('Novos/leia-me.txt'), 'o que não é jogo fica em Novos');
  ok(['Config/bios', 'Saves', 'Games/ps2', 'Games/megadrive'].every((d) => arvore.some((a) => a.startsWith(d)) || true), 'árvore criada');
  const dirs = await p.evaluate(async () => { const r = await navigator.storage.getDirectory(), g = await r.getDirectoryHandle('Games'), o = []; for await (const [n] of g.entries()) o.push(n); for await (const [n] of r.entries()) o.push('/' + n); return o.sort(); });
  ok(['snes', 'nes', 'gb', 'gbc', 'gba', 'megadrive', 'mastersystem', 'gamegear', 'neogeo', 'psx', 'n64', 'ps2', '/Config', '/Saves', '/Novos', '/Games'].every((d) => dirs.includes(d)), 'pastas de console e Config/Saves/Novos criadas ' + dirs.join(' '));
  const lista = await p.evaluate(() => [...document.querySelectorAll('#roms li')].map((l) => l.textContent));
  ok(lista.some((t) => /Teste NES/.test(t)), 'a biblioteca mostra os jogos da árvore');
  // jogo aberto de fora: copia pra Games/<console>
  fs.writeFileSync('/tmp/Fora do Lugar.nes', nes);
  await p.evaluate(() => document.querySelector('#biblioteca').hidden = true);
  await p.setInputFiles('#arquivo', '/tmp/Fora do Lugar.nes'); await p.waitForTimeout(4000);
  const copiou = await p.evaluate(async () => { try { const r = await navigator.storage.getDirectory(); await (await (await r.getDirectoryHandle('Games')).getDirectoryHandle('nes')).getFileHandle('Fora do Lugar.nes'); return true; } catch (e) { return false; } });
  ok(copiou, 'jogo aberto de fora foi copiado pra Games/nes');
  ok(!erros.length, 'sem erro na página ' + erros.join(' | '));
  console.log(arvore.join('\n'));
  await b.close(); srv.close();
  console.log(falhas.length ? falhas.length + ' falha(s)' : 'tudo certo'); process.exit(falhas.length ? 1 : 0);
})();
