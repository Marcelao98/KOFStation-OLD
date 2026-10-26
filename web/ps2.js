
// ---------- PlayStation 2 (Play!, só no PC) ----------
// O Play! (nucleo-ps2/) não é libretro: roda sozinho nas threads dele (Workers + SharedArrayBuffer) e desenha com WebGL2
// num canvas próprio (#outputCanvas), posto por cima da área do jogo. Aqui fica uma "fachada" com a cara de núcleo que o
// app conhece, igual aos nativos do celular (android.js): o runFrame só manda os botões; parou de ser chamado (menu, outra
// tela, janela escondida) = a máquina pausa e o canvas some. O DVD não é lido inteiro: o Play! pede pedaços do arquivo.
// SharedArrayBuffer numa página file:// só existe com o navegador aberto com --enable-features=SharedArrayBuffer (o
// lançador faz isso). O cartão de memória (pasta mc0 do Play!) vai inteiro pro banco como um save só: 'ps2/mc0'.
const PS2_MC = '/home/web_user/.local/share/Play Data Files/vfs/mc0';
const PS2_CHAVE_MC = 'ps2/mc0';
let play = null;   // { m: módulo do Play!, tela: canvas }
const logPs2 = [];   // últimas linhas que o Play! escreveu: vão junto do erro (botão copiar)
async function ehPs2(arq) {
  const n = (arq && arq.name || '').toLowerCase();
  if (typeof KofLibretro === 'undefined' || !KofLibretro.disponivel('ps2')) return false;
  if (/\.(elf|cso|isz)$/.test(n)) return true;
  if (/\.chd$/.test(n)) return arq.size > 900e6;   // CD de PS1 cabe em 700 MB; DVD de PS2 em .chd passa disso
  if (!/\.(iso|img)$/.test(n) || !arq.slice) return false;
  // ISO 9660 (setor de 2048): descritor no setor 16 -> pasta raiz -> SYSTEM.CNF. "BOOT2" = PS2 ("BOOT" sozinho = PS1)
  const ler = async (setor, tam) => new Uint8Array(await arq.slice(setor * 2048, setor * 2048 + tam).arrayBuffer());
  try {
    const pvd = await ler(16, 2048);
    if (String.fromCharCode.apply(null, pvd.subarray(1, 6)) !== 'CD001') return false;
    const v = new DataView(pvd.buffer), raiz = await ler(v.getUint32(158, true), Math.min(v.getUint32(166, true), 65536));
    for (let i = 0; i < raiz.length;) {
      const len = raiz[i];
      if (!len) { i = (Math.floor(i / 2048) + 1) * 2048; continue; }   // registros não atravessam setor: o resto é zero
      const nome = String.fromCharCode.apply(null, raiz.subarray(i + 33, i + 33 + raiz[i + 32]));
      if (/^SYSTEM\.CNF/i.test(nome)) {
        const d = new DataView(raiz.buffer, i);
        return /BOOT2/.test(new TextDecoder().decode(await ler(d.getUint32(2, true), Math.min(d.getUint32(10, true), 2048))));
      }
      i += len;
    }
  } catch (e) { /* arquivo curto ou estranho: não é PS2 */ }
  return false;
}
async function iniciarPlay() {
  if (play) return play;
  if (typeof SharedArrayBuffer === 'undefined')
    throw new Error('o PlayStation 2 precisa do KOFstation aberto pelo lançador novo (KOFstation.exe ou kofnes.sh), que liga uma opção do navegador que ele usa. Feche esta janela e abra de novo pelo lançador.');
  avisar('💿 carregando o PlayStation 2…', 4000);
  const codigo = (await KofLibretro.buscar('play'))();
  const url = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
  await new Promise((ok, erro) => { const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => erro(new Error('não consegui abrir o núcleo do PS2')); document.head.appendChild(s); });
  const tela = document.createElement('canvas');
  tela.id = 'outputCanvas'; tela.width = 640; tela.height = 480;   // o Play! desenha em 640x480 e encaixa a imagem dentro
  tela.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:5;display:none';
  document.body.appendChild(tela);
  const anotar = (t) => { logPs2.push(String(t)); if (logPs2.length > 40) logPs2.shift(); };
  const m = await Play({ mainScriptUrlOrBlob: url, print: anotar, printErr: anotar,
    onAbort: (w) => avisarErro('o PlayStation 2 parou: ' + w, logPs2.join('\n')) });
  m.FS.mkdir('/work');
  m.discImageDevice = {   // o Play! pede pedaços do DVD por aqui (na linha principal) e espera o isDone()
    arq: null, pronto: false,
    read(dst, ini, tam) {
      this.pronto = false;
      this.arq.slice(ini, ini + tam).arrayBuffer().then((b) => { m.HEAPU8.set(new Uint8Array(b), dst); this.pronto = true; });
    },
    getFileSize() { return this.arq.size; },
    isDone() { return this.pronto; },
  };
  m.ccall('initVm', '', [], []);
  m.pauseVm();
  try { const r = await bdPegar('saves', PS2_CHAVE_MC); if (r) abrirCartao(m, await KofGuarda.abrirSave(r)); } catch (e) { console.warn('cartão do PS2', e); }
  play = { m, tela, cartao: '' };
  setInterval(vigiarPs2, 100);
  setInterval(() => { if (play.vivo) guardarCartao(); }, 30000);
  addEventListener('beforeunload', () => guardarCartao());
  return play;
}
// cartão de memória <-> bytes: [tamanho do nome u16][nome][tamanho u32][dados] por arquivo, caminhos relativos ao mc0
function cartaoBytes(m) {
  const partes = [], enc = new TextEncoder();
  const andar = (dir, rel) => {
    for (const n of m.FS.readdir(dir)) {
      if (n === '.' || n === '..') continue;
      const c = dir + '/' + n, r = rel ? rel + '/' + n : n;
      if (m.FS.isDir(m.FS.stat(c).mode)) andar(c, r);
      else { const nome = enc.encode(r), d = m.FS.readFile(c), cab = new DataView(new ArrayBuffer(6 + nome.length));
        cab.setUint16(0, nome.length, true); new Uint8Array(cab.buffer).set(nome, 2); cab.setUint32(2 + nome.length, d.length, true);
        partes.push(new Uint8Array(cab.buffer), d); }
    }
  };
  andar(PS2_MC, '');
  const u = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of partes) { u.set(p, o); o += p.length; }
  return u;
}
function abrirCartao(m, u) {
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength), dec = new TextDecoder();
  for (let o = 0; o + 6 <= u.length;) {
    const nl = v.getUint16(o, true), nome = dec.decode(u.subarray(o + 2, o + 2 + nl)), tam = v.getUint32(o + 2 + nl, true);
    const c = PS2_MC + '/' + nome, pasta = c.slice(0, c.lastIndexOf('/'));
    try { m.FS.mkdirTree(pasta); } catch (e) { /* já existe */ }
    m.FS.writeFile(c, u.subarray(o + 6 + nl, o + 6 + nl + tam));
    o += 6 + nl + tam;
  }
}
async function guardarCartao() {
  if (!play) return;
  try {
    const u = cartaoBytes(play.m);
    const marca = u.length + ':' + KofGuarda.crc32(u);
    if (!u.length || marca === play.cartao) return;
    play.cartao = marca;
    const reg = await KofGuarda.empacotarSave(u, { chave: PS2_CHAVE_MC, quando: Date.now(), aparelho: APARELHO });
    reg.nome = 'Cartão de memória do PS2';
    await bdMudar('saves', PS2_CHAVE_MC, (velho) => {
      if (velho && velho.hash === reg.hash) return null;
      if (velho) reg.anterior = { dados: velho.dados, cheio: velho.cheio, hash: velho.hash, quando: velho.quando, aparelho: velho.aparelho };
      return reg;
    });
  } catch (e) { console.warn('não consegui guardar o cartão do PS2', e); }
}
// o app parou de chamar o runFrame (menu, outra tela, janela escondida): pausa a máquina e esconde o canvas
function vigiarPs2() {
  if (!play || !play.vivo || performance.now() - play.ultimo < 250) return;
  play.vivo = false; play.m.pauseVm(); play.tela.style.display = 'none';
  guardarCartao();
}
function posicionarPs2() {
  const q = $('#tela').getBoundingClientRect(), t = play.tela.style;
  t.left = q.left + 'px'; t.top = q.top + 'px'; t.width = q.width + 'px'; t.height = q.height + 'px';
}
// espera a thread da máquina terminar de salvar/carregar o estado (ela usa o disco virtual, que roda nesta linha: não dá
// pra esperar parado num laço, tem que soltar a linha principal)
function esperarEstadoPs2() {
  return new Promise((ok, erro) => {
    const t0 = performance.now();
    const ver = () => { const r = play.m.estadoPronto(); if (r === 1) ok(); else if (r === 2) erro(new Error('o PS2 recusou o estado')); else if (performance.now() - t0 > 20000) erro(new Error('o PS2 demorou demais')); else setTimeout(ver, 20); };
    ver();
  });
}
function fachadaPs2(arq) {
  const elf = /\.elf$/i.test(arq.name);
  return {
    sistema: 'ps2', nucleo: 'play', lr: true, nativo: true, largura: 640, altura: 448, proporcao: 4 / 3,
    fps: 59.94, taxaAudio: 48000, rgba: new Uint32Array(640 * 448), quadros: 0, pad: [0],
    apu: { dsp: { outCount: 0, outBuf: new Int16Array(4) } },   // o som sai pelo OpenAL do próprio Play!
    cart: { title: arq.name.replace(/\.[^.]+$/, ''), hasSram: () => false, sram: new Uint8Array(0) },
    runFrame() {
      play.ultimo = performance.now();
      if (!play.vivo) { play.vivo = true; play.tela.style.display = ''; posicionarPs2(); play.m.resumeVm(); }
      if (this.quadros++ % 30 === 0) { posicionarPs2(); play.m.setVolume(mudo ? 0 : volume / 100); }
      play.m.setPad(KofLibretro.mascara(this.pad[0]), KofLibretro.empacotar(this.eixos));
    },
    reset() {   // (re)liga o console com o disco; o estado carregado logo depois (continuar) espera o boot
      play.m.pauseVm(); play.vivo = false; play.ultimo = 0;   // o próximo runFrame continua a máquina
      this.ligando = (async () => {
        if (elf) { play.m.FS.writeFile('/jogo.elf', new Uint8Array(await arq.arrayBuffer())); play.m.bootElf('/jogo.elf'); }
        else { play.m.discImageDevice.arq = arq; play.m.bootDiscImage(arq.name); }
      })();
      vigiarInicio(arq);
      vigiarInicio(arq);
      return this.ligando;
    },
    ps2Quadros: () => play.m.getFrames(),   // pros testes: quadros que o Play! já mostrou
    fecharNativo() { play.vivo = false; play.m.pauseVm(); play.tela.style.display = 'none'; guardarCartao(); },
    // savestate: a thread da máquina grava num arquivo do disco virtual; o app espera (estadoAsync/restaurarAsync)
    async estadoAsync() {
      play.m.saveState('/estado.ps2'); await esperarEstadoPs2();
      const u = play.m.FS.readFile('/estado.ps2'); play.m.FS.unlink('/estado.ps2');
      return { lr: 'play', d: paraB64(u) };
    },
    async restaurarAsync(o) {
      await this.ligando;
      const t = atob(o.d), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
      play.m.FS.writeFile('/estado.ps2', u); play.m.loadState('/estado.ps2');
      try { await esperarEstadoPs2(); } finally { play.m.FS.unlink('/estado.ps2'); }
    },
  };
}
const marcaPs2 = (nome) => new TextEncoder().encode(('ps2 ' + nome).padEnd(16)).slice(0, 16);   // o "arquivo" que o app guarda
// o que mandar junto de um erro do PS2 (o Marcelo copia e manda): o log do Play! e como o navegador está
function diagnosticoPs2(arq) {
  return [`arquivo: ${arq ? arq.name + ' (' + Math.round(arq.size / 1048576) + ' MB)' : '?'}`,
    `SharedArrayBuffer: ${typeof SharedArrayBuffer !== 'undefined'}, WebGL2: ${!!document.createElement('canvas').getContext('webgl2')}`,
    `navegador: ${navigator.userAgent}`, '--- log do PS2 ---'].concat(logPs2).join('\n');
}
async function abrirPs2(arq) {
  try {
    await iniciarPlay();
    const f = fachadaPs2(arq);
    await abrirBytes(arq.name, marcaPs2(arq.name), true, { nativo: f });
  } catch (e) { e.detalhe = diagnosticoPs2(arq); throw e; }
  avisar('💿 PlayStation 2', 1500);
}
// o Play! não avisa quando o jogo não começa (só escreve no log): sem nenhum quadro em 15 s de jogo rodando, mostra o erro
function vigiarInicio(arq) {
  clearInterval(vigiarInicio.t);
  const antes = play.m.getFrames(); let rodando = 0;
  vigiarInicio.t = setInterval(() => {
    if (!play.vivo) return;   // pausado (menu etc.): não conta
    if (play.m.getFrames() > antes + 5) { clearInterval(vigiarInicio.t); return; }
    if (++rodando > 15) { clearInterval(vigiarInicio.t); avisarErro('o jogo de PS2 não começou (tela preta). Aperte "copiar" e me mande o texto.', diagnosticoPs2(arq)); }
  }, 1000);
}
// o Play! não avisa quando o jogo não começa (só escreve no log): sem nenhum quadro em 15 s de jogo rodando, mostra o erro
function vigiarInicio(arq) {
  clearInterval(vigiarInicio.t);
  const antes = play.m.getFrames(); let rodando = 0;
  vigiarInicio.t = setInterval(() => {
    if (!play.vivo) return;   // pausado (menu etc.): não conta
    if (play.m.getFrames() > antes + 5) { clearInterval(vigiarInicio.t); return; }
    if (++rodando > 15) { clearInterval(vigiarInicio.t); avisarErro('o jogo de PS2 não começou (tela preta). Aperte "copiar" e me mande o texto.', diagnosticoPs2(arq)); }
  }, 1000);
}
// abrir pelo arquivo escolhido/arrastado: é de PS2? (o .iso pode ser de PS1)
async function ps2Arquivo(arq) {
  if (!arq || !(await ehPs2(arq))) return false;
  await abrirPs2(arq);
  return true;
}
// abrir da biblioteca: o DVD não fica no app, só na pasta de ROMs
async function ps2Jogo(j) {
  const it = (await lerPasta(false).catch(() => [])).find((x) => x.arquivo.toLowerCase() === (j.arquivo || '').toLowerCase());
  if (!it) throw new Error('o DVD desse jogo de PS2 não fica guardado dentro do app: deixe ele na pasta de ROMs ou abra o arquivo de novo');
  const arq = await it.h.getFile();
  await iniciarPlay();
  return { bytes: marcaPs2(arq.name), extras: { nativo: fachadaPs2(arq) } };
}
// pros testes (testes/navegador/ps2.cjs): o cartão de memória
KOFnes.ps2 = { gravarNoCartao: (nome, bytes) => { play.m.FS.mkdirTree(PS2_MC + '/' + nome.replace(/\/[^/]*$/, '')); play.m.FS.writeFile(PS2_MC + '/' + nome, bytes); }, lerDoCartao: (nome) => { try { return Array.from(play.m.FS.readFile(PS2_MC + '/' + nome)); } catch (e) { return null; } }, guardarCartao };
