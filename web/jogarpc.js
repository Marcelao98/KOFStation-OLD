// ---------------------------------------------------------------- 🖥 Jogar no PC: o PC roda o jogo e transmite pro celular
// Entra por dentro do app.js, depois do rede.js. O celular pede pelo canal "jogo" da rede (rede/PROTOCOLO.md); a conversa
// do WebRTC (oferta/resposta) passa por esse mesmo canal cifrado. Vídeo = a imagem crua do jogo ampliada em pixels inteiros
// (o filtro fica com quem assiste), som = a saída do ScriptProcessor, botões = canal de dados sem fila (6 bytes, o mesmo
// formato do celular como controle). Só rede de casa: sem STUN/TURN.
var transm = { pc: null, de: null, dc: null, cv: null, cx: null, peq: null, pcx: null, track: null, destino: null, ganhoAntes: null, info: '' };
const transmitindo = () => !!transm.pc;
const ipDoAparelho = (id) => { const a = rede.aparelhos.find((x) => x.id === id); return a && a.ip; };
// o Chrome esconde o IP da rede de casa atrás de um nome .local: troca pelo IP que a rede já conhece
const trocarLocal = (sdp, ip) => (ip ? sdp.replace(/[0-9a-f-]{36}\.local/gi, ip) : sdp);
function mandarJogo(para, o) { redeMandar({ t: 'enviar', para, canal: 'jogo', dados: JSON.stringify(o) }); }
function esperarIce(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((ok) => {
    const fim = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', fim); ok(); } };
    pc.addEventListener('icegatheringstatechange', fim);
    setTimeout(ok, 2500);   // rede de casa: os candidatos locais saem na hora
  });
}
rede.ouvintes.push((m) => {
  if (m.t === 'msg' && m.canal === 'jogo') {
    let p; try { p = JSON.parse(m.dados); } catch (e) { return; }
    if (p.t === 'acao' && !CELULAR) { acaoDoCelular(p.a, (o) => mandarJogo(m.de, o)); return; }   // atalhos do celular como controle
    pedidoDoCelular(m.de, p);
  }
  if (m.t === 'lista' && transm.de && !rede.aparelhos.some((a) => a.id === transm.de && a.online)) pararTransmissao('o celular saiu da rede');
});
async function pedidoDoCelular(de, p) {
  if (CELULAR) return;   // só o PC transmite (por enquanto)
  if (p.t === 'pedir') {
    pararTransmissao();
    if (p.jogo) {
      const ok = await abrirJogoPedido(p.jogo).catch((e) => { console.warn(e); return false; });
      if (!ok) { mandarJogo(de, { t: 'erro', texto: 'o PC não tem esse jogo na biblioteca: abra ele uma vez no PC' }); return; }
    }
    if (!snes) { mandarJogo(de, { t: 'erro', texto: 'nenhum jogo aberto no PC: escolha um jogo no celular (🖥 Jogar no PC na ficha)' }); return; }
    try { await comecarTransmissao(de); } catch (e) { pararTransmissao(); mandarJogo(de, { t: 'erro', texto: 'o PC não conseguiu transmitir: ' + e.message }); }
  } else if (p.t === 'resposta' && transm.pc && transm.de === de) {
    await transm.pc.setRemoteDescription({ type: 'answer', sdp: trocarLocal(p.sdp, ipDoAparelho(de)) }).catch((e) => pararTransmissao('resposta inválida: ' + e.message));
  } else if (p.t === 'fim' && transm.de === de) pararTransmissao();
}
// o jogo que o celular escolheu, na biblioteca do PC: pelo CRC (mesma ROM), senão pelo nome do arquivo ou do jogo
async function abrirJogoPedido(j) {
  const todos = await bdTodos('jogos');
  const base = (s) => String(s || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '');
  const achado = (j.crc && todos.find((x) => x.crc === j.crc)) || todos.find((x) => x.sistema === j.sistema && base(x.arquivo) === base(j.arquivo))
    || todos.find((x) => x.sistema === j.sistema && base(x.nome) === base(j.nome));
  if (!achado) return false;
  if (snes && jogoId === achado.id) return true;   // já está aberto
  window.__kofRemoto = true;   // abrindo pelo celular: sem a pergunta do modo de jogo na tela do PC
  try { await abrirJogo({ jogo: achado, nome: achado.arquivo || achado.nome }); } finally { window.__kofRemoto = false; }
  return !!snes && jogoId === achado.id;
}
async function comecarTransmissao(de) {
  ligarSom();
  fecharJanelas(); if (rapidoAberto) fecharRapido();
  pausado = false;
  const K = Math.max(1, Math.min(4, Math.floor(1280 / Math.max(telaL, telaA))));   // pixels inteiros, até ~1280 de lado
  transm.cv = document.createElement('canvas'); transm.cv.width = telaL * K; transm.cv.height = telaA * K;
  transm.cx = transm.cv.getContext('2d'); transm.cx.imageSmoothingEnabled = false;
  transm.peq = document.createElement('canvas'); transm.pcx = transm.peq.getContext('2d');
  const video = transm.cv.captureStream(0);
  transm.track = video.getVideoTracks()[0];
  transm.track.contentHint = 'motion';
  const pc = new RTCPeerConnection({ iceServers: [] });
  transm.pc = pc; transm.de = de; transm.info = '';
  const tv = pc.addTransceiver(transm.track, { direction: 'sendonly', streams: [video] });
  // H.264 primeiro: o PC codifica na placa de vídeo e o celular decodifica no chip (menos atraso e bateria)
  try {
    const cods = RTCRtpSender.getCapabilities('video').codecs;
    tv.setCodecPreferences([...cods.filter((c) => /h264/i.test(c.mimeType)), ...cods.filter((c) => !/h264/i.test(c.mimeType))]);
  } catch (e) { /* navegador sem setCodecPreferences */ }
  if (audio) {
    transm.destino = audio.createMediaStreamDestination();
    no.connect(transm.destino);
    pc.addTransceiver(transm.destino.stream.getAudioTracks()[0], { direction: 'sendonly', streams: [video] });
    if (ganho) { transm.ganhoAntes = ganho.gain.value; ganho.gain.value = 0; }   // o som sai no celular, não no PC
  }
  const dc = pc.createDataChannel('botoes', { ordered: false, maxRetransmits: 0 });
  dc.binaryType = 'arraybuffer'; transm.dc = dc;
  dc.onmessage = (e) => {
    if (typeof e.data === 'string') {
      if (e.data.startsWith('p')) { dc.send('P' + e.data.slice(1)); return; }   // ping: o celular mede o atraso
      let j; try { j = JSON.parse(e.data); } catch (x) { return; }
      if (j.t === 'acao') acaoDoCelular(j.a, (o) => { if (dc.readyState === 'open') dc.send(JSON.stringify(o)); });
      else if (j.t === 'menu') dc.send(JSON.stringify(menuParaCelular()));
      else if (j.t === 'menu-item') {
        const it = ITENS_RAPIDO[j.i];
        if (it && itemRemoto(it)) {
          try { if (j.d && it.aj) it.aj(j.d); else if (it.f) { it.f(); dc.send(JSON.stringify({ t: 'feito', a: it.t })); } } catch (x) { console.warn(x); }
          setTimeout(() => { if (transm.pc) { fecharJanelas(); pausado = false; } if (dc.readyState === 'open') dc.send(JSON.stringify(menuParaCelular())); }, 50);
        }
      }
      return;
    }
    const u = new Int8Array(e.data); if (u.length < 6) return;
    remoto.bits = (u[0] & 255) | ((u[1] & 255) << 8);
    for (let k = 0; k < 4; k++) remoto.eixos[k] = Math.round(u[2 + k] * 32767 / 127);
  };
  dc.onopen = () => { avisar('🖥 transmitindo pro celular', 3000); contarAoCelular(); };
  pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState) && transm.pc === pc) pararTransmissao('a conexão com o celular caiu'); };
  await pc.setLocalDescription(await pc.createOffer());
  await esperarIce(pc);
  if (transm.pc !== pc) return;
  // qualidade: até 12 Mbps, 60 quadros; se a Wi-Fi apertar, perde nitidez antes de perder quadro
  try {
    const s = tv.sender, pr = s.getParameters();
    pr.encodings = pr.encodings && pr.encodings.length ? pr.encodings : [{}];
    pr.encodings[0].maxBitrate = 12e6; pr.encodings[0].maxFramerate = 60; pr.degradationPreference = 'maintain-framerate';
    await s.setParameters(pr);
  } catch (e) { /* sem ajuste fino */ }
  mandarJogo(de, { t: 'oferta', sdp: pc.localDescription.sdp });
  transmitirQuadro();
}
// atalhos do celular (☰ do Jogar no PC, ou a barrinha do celular como controle pela rede)
const ACOES_CELULAR = ['salvar-estado', 'carregar-ultimo', 'home'];
async function acaoDoCelular(a, responder) {
  if (!ACOES_CELULAR.includes(a)) return;
  await acao(a);
  if (transm.pc && a !== 'home') { fecharJanelas(); pausado = false; }   // jogando no celular: o jogo segue
  responder({ t: 'feito', a });
}
// o menu rápido do PC no celular: só o que muda o jogo sem abrir tela no PC (ajustes ◀▶, salvar, carregar, reiniciar)
const itemRemoto = (it) => (!it.so || it.so()) && (it.aj || /^(💾|⟲|↺)/.test(it.t));
const menuParaCelular = () => ({ t: 'menu', itens: ITENS_RAPIDO.map((it, i) => ({ i, t: it.t, v: it.v ? String(it.v()) : '', aj: !!it.aj, it })).filter((x) => itemRemoto(x.it)).map(({ it, ...x }) => x) });
// console e nome do jogo pro celular trocar o controle (o mesmo que o celular como controle recebe)
function contarAoCelular() {
  const dc = transm.dc; if (!dc || dc.readyState !== 'open') return;
  const info = JSON.stringify({ t: 'jogo', sis: snes ? snes.sistema || 'snes' : '', nome: snes ? romNome : '' });
  if (info !== transm.info) { transm.info = info; dc.send(info); }
}
// a cada quadro novo (pintar): a imagem crua, ampliada sem borrar
function transmitirQuadro() {
  const t = transm; if (!t.pc || !img) return;
  if (t.peq.width !== telaL || t.peq.height !== telaA) { t.peq.width = telaL; t.peq.height = telaA; }
  const K = Math.max(1, Math.min(4, Math.floor(1280 / Math.max(telaL, telaA))));
  if (t.cv.width !== telaL * K || t.cv.height !== telaA * K) { t.cv.width = telaL * K; t.cv.height = telaA * K; t.cx.imageSmoothingEnabled = false; }
  t.pcx.putImageData(img, 0, 0);
  t.cx.drawImage(t.peq, 0, 0, t.cv.width, t.cv.height);
  if (t.track.requestFrame) t.track.requestFrame();
  if (t.dc && t.dc.readyState === 'open' && (!t.infoQuando || performance.now() - t.infoQuando > 1000)) { t.infoQuando = performance.now(); contarAoCelular(); }
}
function pararTransmissao(motivo) {
  const t = transm; if (!t.pc) return;
  const de = t.de;
  try { t.pc.close(); } catch (e) { /* já fechada */ }
  if (t.destino) try { no.disconnect(t.destino); } catch (e) { /* já desligado */ }
  if (ganho && t.ganhoAntes !== null) ganho.gain.value = t.ganhoAntes;
  transm = { pc: null, de: null, dc: null, cv: null, cx: null, peq: null, pcx: null, track: null, destino: null, ganhoAntes: null, info: '' };
  remoto.bits = 0; remoto.eixos.fill(0);
  if (motivo) { avisar('🖥 transmissão encerrada: ' + motivo, 4000); if (de) mandarJogo(de, { t: 'erro', texto: motivo }); }
}
if (window.KOFnes) KOFnes.padTeste = (b) => { remoto.bits = b; };   // teste: aperta botões como se viessem do celular
if (window.KOFnes) KOFnes.transmissao = () => ({ ligada: transmitindo(), estado: transm.pc && transm.pc.connectionState, dc: transm.dc && transm.dc.readyState, bits: remoto.bits });
