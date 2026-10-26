// ---------------------------------------------------------------- 📡 Aparelhos: rede entre PC e celular (rede/PROTOCOLO.md)
// Entra por dentro do app.js (juntar.py). PC: fala com o kofservico (o lançador abre) por WebSocket em 127.0.0.1:8644.
// Celular: os mesmos pedidos pela ponte (KOFnesApk.redeCmd) e os mesmos eventos em window.__rede. Daqui pra cima é igual.
var rede = { ok: false, eu: null, aparelhos: [], achados: null, ws: null, janela: null, relogio: 0, camera: null, ouvintes: [] };
function redeMandar(o) {
  if (CELULAR) {
    if (typeof KOFnesApk === 'undefined' || !KOFnesApk.redeCmd) return false;
    KOFnesApk.redeCmd(JSON.stringify(o)); return true;
  }
  if (!rede.ws || rede.ws.readyState !== 1) return false;
  rede.ws.send(JSON.stringify(o)); return true;
}
function redeLigar() {
  if (CELULAR) { rede.ok = typeof KOFnesApk !== 'undefined' && !!KOFnesApk.redeCmd; redeMandar({ t: 'eu' }); return; }
  let ws;
  try { ws = new WebSocket('ws://127.0.0.1:8644'); } catch (e) { setTimeout(redeLigar, 10000); return; }
  ws.onopen = () => { rede.ws = ws; rede.ok = true; redeMandar({ t: 'eu' }); };
  ws.onmessage = (e) => { try { redeEvento(JSON.parse(e.data)); } catch (x) { /* nada */ } };
  ws.onclose = () => { const era = rede.ok; rede.ws = null; rede.ok = false; if (era) desenharAparelhos(); setTimeout(redeLigar, 10000); };
}
function redeEvento(m) {
  if (m.t === 'lista') { rede.ok = true; rede.eu = m.eu; rede.aparelhos = m.aparelhos || []; }
  else if (m.t === 'achados') rede.achados = m.lista || [];
  else if (m.t === 'parear') { rede.janela = { ...m, ate: Date.now() + m.seg * 1000 }; mostrarQr(); }
  else if (m.t === 'parear-fim') { rede.janela = null; if (m.motivo) apMsg('⏱ Pareamento encerrado: ' + m.motivo); }
  else if (m.t === 'pareado') { rede.janela = null; pararCamera(); apMsg('✅ Pareado com ' + m.aparelho.nome); avisar('📡 Pareado com ' + m.aparelho.nome, 4000); }
  else if (m.t === 'par-erro') { apMsg('⚠ ' + m.texto); }
  if (m.t === 'lista') {   // card do Início: quantos pareados e conectados
    const el = $('#hm-aparelhos'), on = rede.aparelhos.filter((a) => a.online);
    if (el) el.textContent = !rede.aparelhos.length ? 'parear o celular com o PC'
      : on.length ? '🟢 conectado: ' + on.map((a) => a.nome).join(', ') : `${rede.aparelhos.length} pareado(s), nenhum na rede agora`;
  }
  if (m.t === 'lista') { const b = $('[data-acao="jogar-pc"]'); if (b) b.hidden = !(CELULAR && pcOnline()); }
  for (const f of rede.ouvintes.slice()) try { f(m); } catch (e) { console.warn(e); }
  if (!$('#aparelhos').hidden) desenharAparelhos();
}
window.__rede = redeEvento;
setTimeout(redeLigar, 500);

function apMsg(t) { const e = $('#ap-msg'); if (e) { e.textContent = t; e.hidden = !t; } }
function abrirAparelhos() {
  fecharJanelas(); $('#aparelhos').hidden = false; apMsg('');
  redeMandar({ t: 'lista' });
  desenharAparelhos();
}
function fecharAparelhos() {
  if (rede.janela) redeMandar({ t: 'parear-fim' });
  rede.janela = null; pararCamera(); $('#aparelhos').hidden = true;
}
const quandoFoi = (s) => {
  if (!s) return 'nunca';
  const m = Math.round((Date.now() / 1000 - s) / 60);
  return m < 2 ? 'agora há pouco' : m < 60 ? `há ${m} min` : m < 48 * 60 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dias`;
};
function desenharAparelhos() {
  const sem = !rede.ok;
  $('#ap-sem').hidden = !sem; $('#ap-com').hidden = sem;
  if (sem) return;
  const nome = $('#ap-nome');
  if (document.activeElement !== nome) nome.value = (rede.eu && rede.eu.nome) || '';
  const ul = $('#ap-lista'); ul.textContent = '';
  for (const a of rede.aparelhos) {
    const li = document.createElement('li'); li.classList.toggle('tem', a.online);
    const s = document.createElement('span');
    const b = document.createElement('b'); b.textContent = (a.tipo === 'celular' ? '📱 ' : '🖥 ') + a.nome;
    const sm = document.createElement('small'); sm.textContent = a.online ? '🟢 conectado' + (a.ip ? ' · ' + a.ip : '') : '⚪ fora da rede · visto ' + quandoFoi(a.visto);
    s.append(b, sm);
    const rm = document.createElement('button'); rm.className = 'grande sec'; rm.textContent = 'Remover';
    rm.onclick = () => { if (confirm(`Remover ${a.nome}? Pra voltar, precisa parear de novo.`)) redeMandar({ t: 'remover', id: a.id }); };
    li.append(s);
    if (CELULAR && a.online && a.tipo === 'pc') {   // 🖥 Jogar no PC: o jogo que estiver aberto lá (ou escolha na ficha)
      const j = document.createElement('button'); j.className = 'grande'; j.textContent = '🎮 Jogar no PC';
      j.onclick = () => { fecharAparelhos(); window.entrarModoControle({ pc: a.id }); };
      li.append(j);
    }
    li.append(rm); ul.appendChild(li);
  }
  $('#ap-vazio').hidden = rede.aparelhos.length > 0;
  // PCs achados na rede (pra parear pelo código, sem câmera)
  const ua = $('#ap-achados'); ua.textContent = '';
  const achados = (rede.achados || []).filter((x) => !x.pareado && !rede.aparelhos.some((a) => a.id === x.id));
  for (const a of achados) {
    const li = document.createElement('li');
    const s = document.createElement('span');
    const b = document.createElement('b'); b.textContent = '🖥 ' + a.nome;
    const sm = document.createElement('small'); sm.textContent = a.ip;
    s.append(b, sm);
    const cod = document.createElement('input'); cod.inputMode = 'numeric'; cod.maxLength = 6; cod.placeholder = 'código'; cod.className = 'ap-cod';
    const ir = document.createElement('button'); ir.className = 'grande'; ir.textContent = 'Parear';
    const vai = () => {
      const c = cod.value.replace(/\D/g, '');
      if (c.length !== 6) { apMsg('Digite os 6 números que aparecem no PC (📡 Aparelhos → Parear um celular).'); cod.focus(); return; }
      apMsg('Pareando com ' + a.nome + '…'); redeMandar({ t: 'parear-com', ip: a.ip, porta: a.porta, senha: c, modo: 'c' });
    };
    ir.onclick = vai; cod.onkeydown = (e) => { if (e.key === 'Enter') vai(); };
    li.append(s, cod, ir); ua.appendChild(li);
  }
  $('#ap-achados-vazio').hidden = !rede.achados || achados.length > 0;
  mostrarQr();
}
function mostrarQr() {
  const j = rede.janela, box = $('#ap-qr');
  box.hidden = !j;
  clearInterval(rede.relogio);
  if (!j) return;
  if (box.dataset.qr !== j.qr) {
    box.dataset.qr = j.qr;
    const q = qrcode(0, 'M'); q.addData(j.qr); q.make();
    $('#ap-qr-img').innerHTML = q.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  }
  $('#ap-codigo').textContent = j.codigo.slice(0, 3) + ' ' + j.codigo.slice(3);
  const tique = () => {
    const s = Math.max(0, Math.round((j.ate - Date.now()) / 1000));
    $('#ap-tempo').textContent = `vale por mais ${s} s · ${j.ip}:${j.porta}`;
    if (!s) clearInterval(rede.relogio);
  };
  tique(); rede.relogio = setInterval(tique, 1000);
}

// ---- ler o QR do PC pela câmera do celular (jsQR vem em nucleos/qr-<hash>.js, só quando precisa)
function carregarJsQr() {
  if (typeof jsQR === 'function') return Promise.resolve();
  const arq = typeof KofLibretro !== 'undefined' && KofLibretro.ARQUIVOS.qr;
  if (!arq) return Promise.reject(new Error('faltou o leitor de QR'));
  return new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = arq;
    s.onload = () => (typeof jsQR === 'function' ? ok() : erro(new Error('faltou o leitor de QR')));
    s.onerror = () => erro(new Error('faltou o leitor de QR'));
    document.head.appendChild(s);
  });
}
function parearPeloQr(texto) {
  if (!/^kofstation:\/\/parear\?/.test(texto)) return false;
  const p = new URL(texto).searchParams;
  apMsg('Pareando com ' + (p.get('n') || 'o PC') + '…');
  redeMandar({ t: 'parear-com', ip: p.get('ip'), porta: +p.get('p'), senha: p.get('s'), modo: 'q' });
  return true;
}
async function lerQr() {
  apMsg('');
  try {
    const detector = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
    if (!detector) await carregarJsQr();
    const v = $('#ap-video');
    rede.camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    v.srcObject = rede.camera; $('#ap-camera').hidden = false; await v.play();
    const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
    const olhar = async () => {
      if (!rede.camera) return;
      if (v.videoWidth) {
        let t = null;
        if (detector) { const r = await detector.detect(v).catch(() => []); t = r[0] && r[0].rawValue; }
        else {
          const k = Math.min(1, 640 / v.videoWidth); c.width = v.videoWidth * k; c.height = v.videoHeight * k;
          g.drawImage(v, 0, 0, c.width, c.height);
          const r = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
          t = r && r.data;
        }
        if (t && parearPeloQr(t)) { pararCamera(); return; }
      }
      setTimeout(olhar, 150);
    };
    olhar();
  } catch (e) {
    pararCamera();
    apMsg('📷 Não deu pra usar a câmera (' + (e.message || e.name) + '). Procure o PC na lista abaixo e digite o código.');
    redeMandar({ t: 'achar' });
  }
}
function pararCamera() {
  if (!rede) return;   // fecharJanelas roda antes deste trecho na abertura
  if (rede.camera) for (const t of rede.camera.getTracks()) t.stop();
  rede.camera = null;
  const c = $('#ap-camera'); if (c) c.hidden = true;
}
$('#ap-nome').addEventListener('change', (e) => { const n = e.target.value.trim(); if (n) redeMandar({ t: 'nome', nome: n }); });
const pcOnline = () => rede.aparelhos.find((a) => a.online && a.tipo === 'pc');
function acaoRede(a) {
  switch (a) {
    case 'jogar-pc': {   // ficha do jogo no celular: o PC abre o mesmo jogo (pela ROM) e transmite
      const pc = pcOnline(), r = visiveis[selecionada];
      if (!pc) { avisar('🖥 nenhum PC pareado na rede agora', 4000); return true; }
      if (!r || !r.jogo) { avisar('🖥 escolha um jogo da biblioteca', 4000); return true; }
      const j = r.jogo;
      window.entrarModoControle({ pc: pc.id, jogo: { crc: j.crc || '', arquivo: j.arquivo || '', nome: j.nome || '', sistema: j.sistema || 'snes' } });
      return true;
    }
    case 'aparelhos': abrirAparelhos(); return true;
    case 'aparelhos-fechar': fecharAparelhos(); return true;
    case 'ap-parear': apMsg(''); redeMandar({ t: 'parear' }); return true;
    case 'ap-parear-fim': redeMandar({ t: 'parear-fim' }); rede.janela = null; mostrarQr(); return true;
    case 'ap-ler-qr': lerQr(); return true;
    case 'ap-camera-fim': pararCamera(); return true;
    case 'ap-achar': rede.achados = null; $('#ap-achados-vazio').hidden = true; apMsg('🔎 Procurando na rede…'); redeMandar({ t: 'achar' }); setTimeout(() => apMsg(''), 2200); return true;
  }
  return false;
}
if (window.KOFnes) KOFnes.parearPeloQr = parearPeloQr;   // teste: entrega o texto que a câmera leria
