// Base de jogos da busca: gênero, empresa, ano, série e jogadores de ~25 mil jogos (libretro-database, montada por
// web/jogos/montar.py). Fica num arquivo à parte, nucleos/jogos-<hash>.js (JSON em gzip + base64, como o violino): o
// lançador baixa, o APK/PWA levam. O app acha o jogo pelo título (o nome do arquivo sem os parênteses: "Super Mario
// World (USA)" -> "Super Mario World"), pelo CRC32 da ROM quando ela já foi aberta e, no Neo Geo, pelo nome do set.
const KofJogos = (() => {
  'use strict';
  const normal = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // No-Intro escreve "Legend of Zelda, The - A Link to the Past" e outras versões "The Legend of Zelda: A Link...": com o
  // artigo na frente, os dois viram a mesma chave (a base é montada assim, web/jogos/montar.py)
  const chave = (t) => { const a = t.match(/^(.*?), (The|A|An|Le|La|Les|Die|Der|Das|El|Los|Las)\b(.*)$/); return normal(a ? a[2] + ' ' + a[1] + a[3] : t); };
  const titulo = (n) => n.replace(/\s*[([].*$/, '').trim() || n;
  let db = null, carregando = null;
  const por = {}, crcs = {};   // por sistema: chave do título -> índice; CRC32 -> índice (montado na 1ª consulta)

  function carregar() {
    if (db) return Promise.resolve(true);
    const arq = typeof KofLibretro !== 'undefined' && KofLibretro.ARQUIVOS.jogos;
    if (!arq || typeof DecompressionStream === 'undefined') return Promise.resolve(false);
    if (!carregando) carregando = new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = arq;
      s.onload = () => (typeof KofJogosDb === 'string' ? ok() : erro(new Error('base de jogos vazia')));
      s.onerror = () => { s.remove(); erro(new Error('faltou baixar a base de jogos')); };
      document.head.appendChild(s);
    }).then(async () => {
      const gz = Uint8Array.from(atob(KofJogosDb), (c) => c.charCodeAt(0));
      const txt = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      db = JSON.parse(txt);
      for (const [sis, lista] of Object.entries(db.j)) {
        const m = por[sis] = new Map();
        lista.forEach((j, i) => {
          m.set(normal(j[0]), i);
          const k = chave(j[0]); if (!m.has(k)) m.set(k, i);
        });
      }
      return true;
    }).catch((e) => { carregando = null; console.warn('base de jogos:', e.message); return false; });
    return carregando;
  }

  function porCrc(sis, crc) {
    if (!crcs[sis]) {
      const m = crcs[sis] = new Map();
      for (const c of (db.c[sis] || '').split(',')) if (c) m.set(c.slice(0, 8), parseInt(c.slice(8), 16));
    }
    return crcs[sis].get(crc);
  }

  const cache = new Map();
  function montar(sis, i) {
    const j = db.j[sis][i], t = db.t, ch = sis + i;
    if (!cache.has(ch)) cache.set(ch, {
      sistema: sis, titulo: j[0], ano: j[1] || 0, generos: (j[2] || []).map((g) => t.g[g]),
      publicou: j[3] >= 0 ? t.e[j[3]] : '', desenvolveu: j[4] >= 0 ? t.e[j[4]] : '', serie: j[5] >= 0 ? t.s[j[5]] : '', jogadores: j[6] || 0,
    });
    return cache.get(ch);
  }

  // sis: o sistema do jogo, ou nulo quando não dá pra saber pela extensão (zip): aí procura em todos
  function info(sis, nome, crc) {
    if (!db) return null;
    if (sis === 'gbc') sis = 'gb';
    if (crc && sis && db.c[sis]) { const i = porCrc(sis, crc.toLowerCase()); if (i !== undefined) return montar(sis, i); }
    let k = chave(titulo(nome || ''));
    const neo = typeof KofNeoGeoJogos !== 'undefined' && KofNeoGeoJogos[(nome || '').toLowerCase()];
    if (neo && (!sis || sis === 'neogeo')) { sis = 'neogeo'; k = chave(titulo((KofNeoGeoJogos[neo[1]] || neo)[0])); }
    for (const s of sis ? [sis] : Object.keys(por)) {
      const i = por[s] && por[s].get(k);
      if (i !== undefined) return montar(s, i);
    }
    return null;
  }

  // CRC32 da ROM do jogo como o No-Intro calcula: sem o cabeçalho de cópia (512 bytes no SNES/SMS/GG, iNES no NES)
  let tabela = null;
  function crcRom(sis, u8) {
    if (!tabela) { tabela = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; tabela[n] = c; } }
    let ini = 0;
    if ((sis === 'snes' || sis === 'sms' || sis === 'gg') && u8.length % 1024 === 512) ini = 512;
    if (sis === 'nes' && u8[0] === 0x4E && u8[1] === 0x45 && u8[2] === 0x53) ini = 16;
    let c = -1;
    for (let i = ini; i < u8.length; i++) c = (c >>> 8) ^ tabela[(c ^ u8[i]) & 0xFF];
    return ((c ^ -1) >>> 0).toString(16).padStart(8, '0');
  }

  return { carregar, info, crcRom, pronta: () => !!db, GENEROS: () => (db ? db.t.g.slice() : []) };
})();
