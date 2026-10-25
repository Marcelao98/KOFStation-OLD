// Guarda: o formato dos saves, das estatísticas e do pacote .kofsave, sem nada de página nem de banco (o app.js liga isso
// ao IndexedDB; os testes rodam no Node). Tudo pensado pra duas coisas: ocupar pouco e juntar dados de aparelhos
// diferentes (PC e celular) sem perder nada.
const KofGuarda = (() => {
  // ---------- utilidades ----------
  const TAB = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TAB[n] = c >>> 0; }
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = TAB[(c ^ u8[i]) & 255] ^ (c >>> 8); return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0'); };
  const fluxo = async (u8, t) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(t)).arrayBuffer());
  const gz = (u8) => fluxo(u8, new CompressionStream('gzip'));
  const ungz = (u8) => fluxo(u8, new DecompressionStream('gzip'));
  const deTexto = (t) => { const u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i) & 255; return u; };

  // ---------- saves (a bateria do cartucho, o cartão de memória) ----------
  // guardado comprimido e sem o fim vazio (0xFF: memória apagada; o save de GBA tem 128 KB quase todo assim), com o
  // hash do conteúdo (só regrava se mudou) e de quando/qual aparelho veio (pra juntar com outro aparelho)
  async function empacotarSave(bytes, extra) {
    let n = bytes.length; while (n > 0 && bytes[n - 1] === 0xFF) n--;
    const util = bytes.subarray(0, n);   // o hash só da parte com conteúdo: o mesmo save dá o mesmo hash em qualquer aparelho
    return Object.assign({ dados: await gz(util), cheio: bytes.length, hash: crc32(util) }, extra);
  }
  async function abrirSave(reg) {
    const d = await ungz(reg.dados), u = new Uint8Array(reg.cheio || d.length).fill(0xFF);
    u.set(d.subarray(0, u.length)); return u;
  }
  // o que fazer com um save que veio de fora (pacote ou outro aparelho): 'igual', 'trazer' (o de fora é mais novo) ou
  // 'manter' (o daqui é mais novo). Quem perde não some: o app guarda como cópia (anterior)
  function decidir(aqui, fora) {
    if (!aqui) return 'trazer';
    if (!fora || aqui.hash === fora.hash) return 'igual';
    return (fora.quando || 0) > (aqui.quando || 0) ? 'trazer' : 'manter';
  }

  // ---------- estatísticas ----------
  // cada aparelho escreve só a sua parte (partes[aparelho]) e o total é a soma: juntar PC + celular nunca conta em
  // dobro nem dá conflito. Dias compactos: [número do dia, segundos]; depois de ~1 ano viram meses ({AAAAMM: s})
  const DIAS = 400;
  const numDia = (t) => { const d = new Date(t); return Math.floor((t - d.getTimezoneOffset() * 60000) / 864e5); };
  const textoDia = (n) => new Date(n * 864e5).toISOString().slice(0, 10);   // o número já está na hora local
  const mesDe = (n) => textoDia(n).slice(0, 7).replace('-', '');
  const novaParte = (t) => ({ tempo: 0, sessoes: 0, primeiro: t, ultimo: t, dias: [], meses: {}, horas: new Array(24).fill(0) });
  function somarTempo(p, ms, t) {
    const d = numDia(t), s = Math.round(ms / 1000), ult = p.dias[p.dias.length - 1];
    p.tempo += ms; p.ultimo = t;
    if (ult && ult[0] === d) ult[1] += s; else p.dias.push([d, s]);
    p.horas[new Date(t).getHours()] += s;
    while (p.dias.length > DIAS) { const [v, seg] = p.dias.shift(); const m = mesDe(v); p.meses[m] = (p.meses[m] || 0) + seg; }
    return p;
  }
  const parteDe = (reg, aparelho, t) => reg.partes[aparelho] || (reg.partes[aparelho] = novaParte(t));
  function registrarTempo(reg, id, nome, aparelho, ms, t) {
    reg = reg && reg.partes ? reg : migrarStats(reg, aparelho, id, nome);
    reg.nome = nome; somarTempo(parteDe(reg, aparelho, t), ms, t); return reg;
  }
  function contarSessao(reg, id, nome, aparelho, t) {
    reg = reg && reg.partes ? reg : migrarStats(reg, aparelho, id, nome);
    const p = parteDe(reg, aparelho, t); p.sessoes++; p.ultimo = t; reg.nome = nome; return reg;
  }
  // formato antigo ({tempo, sessoes, dias: {'AAAA-MM-DD': ms}}) -> parte deste aparelho
  function migrarStats(velho, aparelho, id, nome) {
    const reg = { id: (velho && velho.id) || id, nome: (velho && velho.nome) || nome, partes: {} };
    if (!velho) return reg;
    const p = novaParte(velho.primeiro || Date.now());
    p.tempo = velho.tempo || 0; p.sessoes = velho.sessoes || 0; p.ultimo = velho.ultimo || p.primeiro;
    p.dias = Object.keys(velho.dias || {}).sort().map((k) => [Math.round(Date.parse(k) / 864e5), Math.round(velho.dias[k] / 1000)]);
    reg.partes[aparelho] = p; return reg;
  }
  // a soma, no formato que a tela de estatísticas sempre usou (dias em ms por 'AAAA-MM-DD')
  function visao(reg) {
    if (!reg || !reg.partes) return reg;
    const v = { id: reg.id, nome: reg.nome, tempo: 0, sessoes: 0, primeiro: 0, ultimo: 0, dias: {}, horas: new Array(24).fill(0), aparelhos: Object.keys(reg.partes).length };
    for (const p of Object.values(reg.partes)) {
      v.tempo += p.tempo; v.sessoes += p.sessoes;
      if (p.primeiro && (!v.primeiro || p.primeiro < v.primeiro)) v.primeiro = p.primeiro;
      if (p.ultimo > v.ultimo) v.ultimo = p.ultimo;
      for (const [d, s] of p.dias) { const k = textoDia(d); v.dias[k] = (v.dias[k] || 0) + s * 1000; }
      (p.horas || []).forEach((s, h) => { v.horas[h] += s; });
    }
    return v;
  }
  // juntar com o de outro aparelho: cada parte fica com a versão mais adiantada (mais tempo; empate: a mais recente)
  function juntarStats(aqui, fora) {
    if (!fora || !fora.partes) return aqui;
    if (!aqui || !aqui.partes) return JSON.parse(JSON.stringify(fora));
    const r = { id: aqui.id, nome: aqui.nome || fora.nome, partes: Object.assign({}, aqui.partes) };
    for (const [ap, p] of Object.entries(fora.partes)) {
      const a = r.partes[ap];
      if (!a || p.tempo > a.tempo || (p.tempo === a.tempo && p.ultimo > a.ultimo)) r.partes[ap] = JSON.parse(JSON.stringify(p));
    }
    return r;
  }

  // ---------- pacote .kofsave ----------
  // "KOFSAVE1" + tamanho do JSON (4 bytes) + JSON comprimido + os blocos binários (saves e estados já vêm comprimidos:
  // não comprimem de novo). No JSON, cada binário vira {$b: início, n: tamanho}
  const MAGICO = 'KOFSAVE1';
  async function criarPacote(conteudo) {
    const blocos = []; let pos = 0;
    const json = JSON.stringify(conteudo, (k, v) => {
      if (v instanceof Uint8Array) { blocos.push(v); const r = { $b: pos, n: v.length }; pos += v.length; return r; }
      return v;
    });
    const j = await gz(new TextEncoder().encode(json)), cab = new Uint8Array(12);
    cab.set(deTexto(MAGICO)); new DataView(cab.buffer).setUint32(8, j.length, true);
    const u = new Uint8Array(12 + j.length + pos);
    u.set(cab); u.set(j, 12); let p = 12 + j.length;
    for (const b of blocos) { u.set(b, p); p += b.length; }
    return u;
  }
  const ehPacote = (u8) => u8 && u8.length > 12 && String.fromCharCode(...u8.subarray(0, 8)) === MAGICO;
  async function lerPacote(u8) {
    if (!ehPacote(u8)) throw new Error('isso não é um pacote .kofsave');
    const n = new DataView(u8.buffer, u8.byteOffset).getUint32(8, true), base = 12 + n;
    const json = new TextDecoder().decode(await ungz(u8.subarray(12, base)));
    return JSON.parse(json, (k, v) => (v && typeof v === 'object' && '$b' in v && 'n' in v ? u8.slice(base + v.$b, base + v.$b + v.n) : v));
  }

  return { crc32, gz, ungz, deTexto, empacotarSave, abrirSave, decidir, numDia, textoDia, registrarTempo, contarSessao, migrarStats,
    visao, juntarStats, criarPacote, lerPacote, ehPacote };
})();
if (typeof module !== 'undefined') module.exports = KofGuarda;
