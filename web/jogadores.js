// ---------------------------------------------------------------- 🎮 Jogadores: até 4 jogando juntos
// Entra por dentro do app.js (juntar.py), depois do jogarpc.js. Cada aparelho de controle (teclado, cada controle USB ou
// Bluetooth, cada celular pareado) vai pra um jogador. Sem escolha, o primeiro controle é o Jogador 1, o segundo o 2...
// (o teclado é sempre do 1 e não ocupa vaga). A escolha fica guardada pelo nome do controle (kofnes.jogadores).
const JOG_CORES = ['#e84545', '#3d8bfd', '#27c26c', '#f2b632'];
var jog = { escolha: (() => { try { return JSON.parse(ler('jogadores')) || {}; } catch (e) { return {}; } })(), sessao: {}, ordem: [], cel: {}, visto: {} };
function jogCelBits() { let b = 0; const agora = performance.now(); for (const c of Object.values(jog.cel)) if (agora - c.quando < 1500) b |= c.b; return b; }
// controle do jogo -> bits no formato do app (o mesmo do estado())
function bitsDoPad(g, puro) {
  let b = 0;
  for (const [i, bit] of BOTOES) if (g.buttons[i] && g.buttons[i].pressed) b |= bit;
  if (!puro) {
    if (g.axes[0] < -0.5) b |= 0x0200; if (g.axes[0] > 0.5) b |= 0x0100;
    if (g.axes[1] < -0.5) b |= 0x0800; if (g.axes[1] > 0.5) b |= 0x0400;
  }
  if ((b & 0x0C00) === 0x0C00) b &= ~0x0C00;
  if ((b & 0x0300) === 0x0300) b &= ~0x0300;
  return b;
}
const eixoPad = (v) => (Math.abs(v) < 0.15 ? 0 : Math.round(Math.max(-1, Math.min(1, v)) * 32767));
// os aparelhos ligados agora: [{k: chave, nome, b, e}] (o teclado sempre; celulares que mandaram botão nos últimos 5 s)
function aparelhosDeControle() {
  const l = [{ k: 'teclado', nome: CELULAR ? 'Tela de toque' : 'Teclado', b: tecladoBits() | toque, e: eixosDoTeclado() }];
  const puro = analogico() === 'puro';
  for (const g of (navigator.getGamepads ? navigator.getGamepads() : [])) {
    if (!g || !g.connected) continue;
    l.push({ k: 'pad:' + g.id + '#' + g.index, nome: nomeDoPad(g.id), b: bitsDoPad(g, puro), e: [0, 1, 2, 3].map((i) => eixoPad(g.axes[i] || 0)) });
  }
  if (remoto.ligado || (typeof transm !== 'undefined' && transm.pc)) l.push({ k: 'cel-pc', nome: '📱 Celular (controle do PC)', b: remoto.bits, e: Array.from(remoto.eixos) });
  const agora = performance.now();
  for (const [id, c] of Object.entries(jog.cel)) {
    if (agora - c.quando > 5000) { delete jog.cel[id]; continue; }
    const a = rede.aparelhos.find((x) => x.id === id);
    l.push({ k: 'cel:' + id, nome: '📱 ' + ((a && a.nome) || 'Celular'), b: agora - c.quando > 1500 ? 0 : c.b, e: c.e });
  }
  return l;
}
const nomeDoPad = (id) => '🎮 ' + (id.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 32) || 'Controle');
// de que jogador é cada aparelho: escolha guardada (pelo nome, sem o número do slot) > o que já pegou nesta sessão > a
// primeira vaga livre entre os controles ligados
function jogadorDe(k, ligados) {
  if (k === 'teclado') return jog.escolha.teclado !== undefined ? jog.escolha.teclado : 0;
  const base = k.replace(/#\d+$/, '');
  if (jog.escolha[base] !== undefined) return jog.escolha[base];
  if (jog.sessao[k] !== undefined) return jog.sessao[k];
  const usados = new Set(ligados.filter((x) => x !== k && x !== 'teclado' && (jog.sessao[x] !== undefined || jog.escolha[x.replace(/#\d+$/, '')] !== undefined))
    .map((x) => jog.escolha[x.replace(/#\d+$/, '')] ?? jog.sessao[x]));
  let j = 0; while (usados.has(j) && j < 3) j++;
  jog.sessao[k] = j;
  if (!jog.visto[k] && (snes || !$('#jogadores').hidden)) avisar(`🎮 ${(aparelhosDeControle().find((a) => a.k === k) || { nome: 'controle' }).nome} = Jogador ${j + 1}`, 2500);
  jog.visto[k] = 1;
  return j;
}
// os botões e analógicos de cada jogador neste quadro
const jogQuadro = { b: [0, 0, 0, 0], e: [null, null, null, null], aparelhos: [] };
function lerJogadores() {
  const l = aparelhosDeControle(), ks = l.map((a) => a.k);
  jogQuadro.b.fill(0); jogQuadro.e.fill(null); jogQuadro.aparelhos = l;
  for (const a of l) {
    const j = jogadorDe(a.k, ks); a.j = j;
    jogQuadro.b[j] |= a.b;
    if (a.e && a.e.some((x) => x) && !jogQuadro.e[j]) jogQuadro.e[j] = a.e;
  }
  return jogQuadro;
}
function escolherJogador(k, j) {
  jog.escolha[k === 'teclado' ? 'teclado' : k.replace(/#\d+$/, '')] = j; delete jog.sessao[k];
  guardar('jogadores', JSON.stringify(jog.escolha));
  avisarCelularJogador();
  if (!$('#jogadores').hidden) montarJogadores();
}
// celulares pela rede (📡 pareados): mandam "botões,eixos" no canal "pad"; o PC responde qual jogador eles são
rede.ouvintes.push((m) => {
  if (m.t !== 'msg' || m.canal !== 'pad' || CELULAR) return;
  const [b, e] = String(m.dados).split(','), ei = +e | 0, era = jog.cel[m.de];
  jog.cel[m.de] = { b: +b & 0xFFFF, e: [ei << 24 >> 24, ei << 16 >> 24, ei << 8 >> 24, ei >> 24].map((x) => Math.round(x * 32767 / 127)), quando: performance.now() };
  if (!era) { lerJogadores(); avisarCelularJogador(m.de); }
});
function avisarCelularJogador(so) {
  for (const id of so ? [so] : Object.keys(jog.cel)) {
    const j = jogadorDe('cel:' + id, Object.keys(jog.cel).map((x) => 'cel:' + x));
    const sis = snes ? snes.sistema || 'snes' : '';
    redeMandar({ t: 'enviar', para: id, canal: 'pad-ok', dados: JSON.stringify({ jogador: j + 1, sis, nome: snes ? romNome : '' }) });
  }
}
// tela 🎮 Jogadores: cada aparelho com a luz acendendo quando aperta, e J1..J4 pra escolher
function montarJogadores() {
  const l = lerJogadores().aparelhos, ul = $('#jog-lista'); ul.textContent = '';
  for (const a of l) {
    const li = document.createElement('li'); li.dataset.k = a.k;
    const s = document.createElement('span'); s.className = 'jog-nome';
    const luz = document.createElement('i'); luz.className = 'jog-luz';
    const n = document.createElement('b'); n.textContent = a.nome;
    s.append(luz, n);
    const bs = document.createElement('span'); bs.className = 'jog-bts';
    for (let j = 0; j < 4; j++) {
      const b = document.createElement('button'); b.textContent = 'J' + (j + 1); b.style.setProperty('--cor', JOG_CORES[j]);
      b.className = a.j === j ? 'ativo' : ''; b.onclick = () => escolherJogador(a.k, j);
      bs.appendChild(b);
    }
    li.append(s, bs); ul.appendChild(li);
  }
  $('#jog-ps2').hidden = !(snes && snes.sistema === 'ps2');
}
function abrirJogadores() { fecharJanelas(); $('#jogadores').hidden = false; montarJogadores(); }
setInterval(() => {   // luz de quem está apertando e aparelho que entrou/saiu
  if ($('#jogadores').hidden) return;
  const l = lerJogadores().aparelhos, li = [...$('#jog-lista').children];
  if (li.length !== l.length || li.some((x, i) => x.dataset.k !== l[i].k)) { montarJogadores(); return; }
  li.forEach((x, i) => x.classList.toggle('apertando', !!(l[i].b || (l[i].e && l[i].e.some((v) => Math.abs(v) > 8000)))));
}, 120);
if (window.KOFnes) KOFnes.jogadores = () => lerJogadores();
