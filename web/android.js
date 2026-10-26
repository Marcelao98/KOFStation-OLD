// ---------------- KOFstation no celular (só entra no KOFnes-android.html) ----------------
// Vai junto do app.js, no mesmo escopo: usa o estado dele (snes, toque, voltandoTecla...) sem mudar o PC.
// Controle virtual na tela (multitoque), 6 modelos, tela "Controles" e o voltar do Android.
(() => {
  const html = document.documentElement;
  html.classList.add('celular');
  const MODELOS = [['classico', 'Clássico SNES'], ['moderno', 'Moderno'], ['minimo', 'Minimalista'], ['arcade', 'Arcade'], ['portatil', 'Portátil'], ['tema', 'Segue o tema']];
  const BITS = { A: 0x0080, B: 0x8000, X: 0x0040, Y: 0x4000, L: 0x0020, R: 0x0010, L2: 0x0008, R2: 0x0004, Start: 0x1000, Select: 0x2000 };
  const num = (k, p, min, max) => { const v = parseFloat(ler(k)); return isFinite(v) ? Math.min(max, Math.max(min, v)) : p; };
  const cfg = {
    modelo: MODELOS.some(([k]) => k === ler('ctlModelo')) ? ler('ctlModelo') : 'classico',
    tam: num('ctlTam', 1, 0.7, 1.4), opa: num('ctlOpa', 1, 0.25, 1), vibrar: ler('ctlVibrar') !== '0', canhoto: ler('ctlCanhoto') === '1',
  };

  // ----- montagem do controle -----
  function montarControle(raiz) {
    const el = (cls, b, txt, extra) => { const d = document.createElement('div'); d.className = 'cb ' + cls; if (b) d.dataset.b = b; if (txt) d.textContent = txt; if (extra) d.setAttribute('role', 'button'); return d; };
    const dpad = el('dpad', 'dpad'); dpad.dataset.dir = '';
    for (const c of ['h', 'v', 'u', 'd', 'l', 'r', 'k']) { const i = document.createElement('i'); i.className = c; dpad.appendChild(i); }
    raiz.append(dpad, el('shoulder', 'L', 'L'), el('shoulder', 'R', 'R'), el('shoulder', 'L2', 'L2'), el('shoulder', 'R2', 'R2'), el('pill', 'Select', 'SELECT'), el('pill', 'Start', 'START'),
      el('face', 'Y', 'Y'), el('face', 'X', 'X'), el('face', 'B', 'B'), el('face', 'A', 'A'),
      el('menu', 'menu', '☰'), el('rew', 'rew', '⏪'), el('turbo', 'turbo', '⏩'));
  }
  // nome de cada botão no console do jogo aberto (o botão do SNES por baixo continua o mesmo: é o que o núcleo recebe)
  const ROTULOS = {
    md: { Y: 'A', B: 'B', A: 'C', L: 'X', X: 'Y', R: 'Z', Select: 'MODE' },
    sms: { B: '1', A: '2', Start: 'PAUSE' }, gg: { B: '1', A: '2' },
    neogeo: { B: 'A', A: 'B', Y: 'C', X: 'D', Select: 'FICHA' },
    ps1: { B: '✕', A: '○', Y: '□', X: '△', L: 'L1', R: 'R1' },
    n64: { B: 'A', Y: 'B', X: 'C▲', A: 'C▼', L: 'Z', R: 'R', L2: 'C◀', R2: 'C▶', Select: 'L' },
  };
  // o app.js chama ao abrir um jogo; esta parte toda mora dentro de uma função, então vai pelo window
  window.rotularControle = rotularControle;
  function rotularControle(sis) {
    const r = ROTULOS[sis] || {};
    ctl.querySelectorAll('[data-b]').forEach((e) => {
      const b = e.dataset.b; if (['dpad', 'menu', 'rew', 'turbo'].includes(b)) return;
      e.textContent = r[b] || (b === 'Select' ? 'SELECT' : b === 'Start' ? 'START' : b);
    });
  }
  const ctl = document.createElement('div'); ctl.id = 'ctl'; ctl.setAttribute('aria-label', 'controle virtual');
  montarControle(ctl);
  document.body.insertBefore(ctl, $('#lateral'));
  { const lat = document.querySelector('.lat-itens'), b = document.createElement('button'); b.dataset.acao = 'teclas'; b.dataset.tela = 'teclas'; b.title = 'Controles'; b.innerHTML = '<i>🎮</i><span>Controles</span>'; lat.insertBefore(b, lat.querySelector('[data-acao="temas"]')); }
  $('#arquivo').accept = '';   // o seletor de arquivos do Android não conhece .sfc: deixa escolher qualquer arquivo

  function aplicar() {
    ctl.className = 'skin-' + cfg.modelo;
    ctl.style.setProperty('--esc', cfg.tam); ctl.style.setProperty('--opa', cfg.modelo === 'minimo' ? Math.min(cfg.opa, 0.6) : cfg.opa);
    document.body.classList.toggle('canhoto', cfg.canhoto);
    if (!(ctl.style.getPropertyValue('--opa'))) ctl.style.removeProperty('--opa');
  }
  aplicar();

  // ----- toque -----
  // cada dedo (pointerId) segura um botão; deslizar de um botão pro outro troca (dá pra "rolar" o dedo entre A, B, X e Y)
  const dedos = new Map();   // pointerId -> { b, el }
  let bitsToque = 0;
  const vibrar = () => { if (cfg.vibrar && navigator.vibrate) navigator.vibrate(8); };
  function recalcular() {
    let b = 0;
    for (const { b: nome, dir } of dedos.values()) { if (BITS[nome]) b |= BITS[nome]; if (dir) b |= dir; }
    bitsToque = b; toque = b;
  }
  function dir8(dpad, x, y) {   // posição do dedo -> bits de direção (zona morta no meio)
    const r = dpad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = (x - cx) / (r.width / 2), dy = (y - cy) / (r.height / 2), d = Math.hypot(dx, dy);
    const mx = Math.max(-1, Math.min(1, dx)), my = Math.max(-1, Math.min(1, dy));
    dpad.style.setProperty('--kx', d > 1 ? dx / d : mx); dpad.style.setProperty('--ky', d > 1 ? dy / d : my);
    let bits = 0, nome = '';
    if (d > 0.22) {
      if (dx < -0.38) { bits |= 0x0200; nome += 'l '; } if (dx > 0.38) { bits |= 0x0100; nome += 'r '; }
      if (dy < -0.38) { bits |= 0x0800; nome += 'u '; } if (dy > 0.38) { bits |= 0x0400; nome += 'd '; }
    }
    dpad.dataset.dir = nome.trim();
    const an = modoControle ? modoControle.an || 'misto' : analogico();   // console com analógico (ou o celular como controle do PC): a posição do dedo vai pro analógico
    if (an) { eixosToque[0] = d > 1 ? dx / d : mx; eixosToque[1] = d > 1 ? dy / d : my; if (an === 'puro') return 0; }
    return bits;
  }
  const alvoSob = (x, y) => { const e = document.elementFromPoint(x, y); const c = e && e.closest('#ctl .cb'); return c; };
  function soltar(id) {
    const f = dedos.get(id); if (!f) return;
    f.el.classList.remove('on');
    if (f.b === 'dpad') { f.el.dataset.dir = ''; f.el.style.setProperty('--kx', 0); f.el.style.setProperty('--ky', 0); eixosToque[0] = eixosToque[1] = 0; }
    if (f.b === 'rew') voltandoTecla = false;
    if (f.b === 'turbo') turbo = false;
    dedos.delete(id); recalcular();
  }
  function apertar(id, c, x, y) {
    const b = c.dataset.b, f = { b, el: c, dir: 0 };
    dedos.set(id, f); c.classList.add('on'); vibrar();
    if (b === 'dpad') f.dir = dir8(c, x, y);
    if (b === 'rew') voltandoTecla = true;
    if (b === 'turbo') turbo = true;
    if (b === 'menu' && modoControle) { dedos.delete(id); c.classList.remove('on'); if (modoControle.pc) menuRemoto(); else modoControle.menu = performance.now(); return; }   // jogando no PC: o menu é daqui (o do PC ninguém vê)   // celular como controle: ☰ = Select+Start, o menu rápido do PC
    if (b === 'menu') { dedos.delete(id); c.classList.remove('on'); if (snes && !rapidoAberto) abrirRapido(); else if (rapidoAberto) fecharRapido(); return; }
    recalcular();
  }
  ctl.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.cb'); if (!c) return;
    e.preventDefault(); try { ctl.setPointerCapture(e.pointerId); } catch (x) { /* sem captura */ }
    apertar(e.pointerId, c, e.clientX, e.clientY);
  });
  ctl.addEventListener('pointermove', (e) => {
    const f = dedos.get(e.pointerId); if (!f) return;
    if (f.b === 'dpad') { f.dir = dir8(f.el, e.clientX, e.clientY); recalcular(); return; }
    const c = alvoSob(e.clientX, e.clientY);
    if (c && c !== f.el && c.dataset.b !== 'dpad' && c.dataset.b !== 'menu') { soltar(e.pointerId); apertar(e.pointerId, c, e.clientX, e.clientY); }
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) ctl.addEventListener(t, (e) => soltar(e.pointerId));
  ctl.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
  // saiu do app / abriu uma tela: solta tudo (senão o botão fica "preso")
  const soltarTudo = () => { for (const id of [...dedos.keys()]) soltar(id); toque = 0; };
  addEventListener('blur', soltarTudo); document.addEventListener('visibilitychange', () => { if (document.hidden) soltarTudo(); });

  // ----- quando o controle aparece -----
  let jogando = false, modoControle = null;   // modoControle: o celular como controle do PC (abaixo)
  function atualizarJogando() {
    if (modoControle) return;   // o celular como controle do PC: o controle fica na tela até sair
    const j = !!snes && telaAtual() === 'jogo';
    if (j === jogando) return;
    jogando = j; document.body.classList.toggle('cel-jogo', j);
    if (!j) soltarTudo();
    requestAnimationFrame(() => ajustarEscala());
  }
  setInterval(atualizarJogando, 200);
  addEventListener('resize', () => requestAnimationFrame(() => ajustarEscala()));
  addEventListener('orientationchange', () => setTimeout(() => ajustarEscala(), 250));

  // ----- menu rápido: o que faz sentido no celular -----
  ITENS_RAPIDO.splice(1, 0, { t: '🏠 Início', f: () => { fecharRapido(); acao('home'); } }, { t: '🎮 Controle virtual', f: () => { fecharRapido(); acao('teclas'); } });

  // ----- tela Controles (reaproveita a janela de teclas, que não serve no celular) -----
  const janela = $('#teclas');
  janela.querySelector('.titulo-j').firstChild.textContent = '🎮 Controles ';
  $('#teclas-dica').textContent = 'Escolha o modelo do controle e ajuste do seu jeito.';
  // miniatura de cada modelo: um desenho simples (cruz ou joystick, 4 botões, ombros) nas cores dele
  const PREV = {
    classico: { bg: '#c9c9d1', dp: '#3b3b45', ombro: '#6d6d78', f: { X: '#3a6fd3', Y: '#3aa05a', A: '#d33a3a', B: '#e0b020' }, forma: 'cruz' },
    moderno: { bg: '#14161c', dp: '#ffffff33', ombro: '#2a2d38', f: { X: '#ffd24a', Y: '#4aa8ff', A: '#ff5a5a', B: '#4cd16b' }, forma: 'stick', anel: true },
    minimo: { bg: '#1a110b', dp: 'none', ombro: 'none', f: { X: 'none', Y: 'none', A: 'none', B: 'none' }, forma: 'cruz', contorno: '#f3e5d0' },
    arcade: { bg: '#1a1020', dp: '#d01c1c', ombro: '#3a2a48', f: { X: '#3a8be0', Y: '#e8d23a', A: '#38c060', B: '#e0383a' }, forma: 'stick', arcade: true },
    portatil: { bg: '#b9bda6', dp: '#2a2c26', ombro: '#4a4e3e', f: { X: '#4a4e3e', Y: '#4a4e3e', A: '#8d1f4a', B: '#8d1f4a' }, forma: 'cruz', diag: true },
    tema: { bg: 'var(--painel)', dp: 'var(--painel2)', ombro: 'var(--painel2)', f: { X: 'var(--painel2)', Y: 'var(--painel2)', A: 'var(--destaque)', B: 'var(--destaque)' }, forma: 'cruz', contorno: 'var(--borda)' },
  };
  function desenho(id) {
    const m = PREV[id], c = m.contorno ? `stroke="${m.contorno}" stroke-width="1.4"` : '';
    const pos = m.diag ? { X: [92, 20], Y: [82, 30], A: [104, 30], B: [92, 40] } : m.arcade ? { X: [96, 20], Y: [84, 24], A: [102, 40], B: [88, 42] } : { X: [96, 18], Y: [84, 30], A: [108, 30], B: [96, 42] };
    const dp = m.forma === 'cruz'
      ? `<path d="M22 17h8v10h10v8H30v10h-8V35H12v-8h10z" fill="${m.dp}" ${c}/>`
      : `<circle cx="26" cy="31" r="14" fill="${m.anel ? '#ffffff14' : '#2c2236'}" ${m.anel ? 'stroke="#ffffff55" stroke-width="1.4"' : ''}/><circle cx="26" cy="31" r="7" fill="${m.arcade ? '#d01c1c' : '#ffffffcc'}"/>`;
    const fs = Object.entries(pos).map(([k, [x, y]]) => `<circle cx="${x}" cy="${y}" r="${m.diag && (k === 'X' || k === 'Y') ? 5 : 7}" fill="${m.f[k]}" ${c}/>`).join('');
    const om = `<rect x="4" y="3" width="24" height="7" rx="3" fill="${m.ombro}" ${c}/><rect x="92" y="3" width="24" height="7" rx="3" fill="${m.ombro}" ${c}/>`;
    return `<svg viewBox="0 0 120 56" aria-hidden="true"><rect width="120" height="56" fill="${m.bg}"/>${om}${dp}${fs}</svg>`;
  }
  function previa(m) {
    const card = document.createElement('button'); card.className = 'ctl-card' + (cfg.modelo === m[0] ? ' ativo' : ''); card.dataset.modelo = m[0];
    card.innerHTML = desenho(m[0]); const b = document.createElement('b'); b.textContent = m[1]; card.appendChild(b); return card;
  }
  function slider(rotulo, k, min, max, passo, valor, fmt) {
    const l = document.createElement('label'), s = document.createElement('input'), v = document.createElement('span');
    s.type = 'range'; s.min = min; s.max = max; s.step = passo; s.value = valor; v.textContent = fmt(valor);
    s.addEventListener('input', () => { cfg[k] = parseFloat(s.value); v.textContent = fmt(cfg[k]); guardar(k === 'tam' ? 'ctlTam' : 'ctlOpa', String(cfg[k])); aplicar(); });
    const t = document.createElement('span'); t.textContent = rotulo; l.append(t, s, v); return l;
  }
  function chave(rotulo, k, chaveLs, aoMudar) {
    const l = document.createElement('label'), c = document.createElement('input'), t = document.createElement('span');
    c.type = 'checkbox'; c.checked = !!cfg[k]; t.textContent = rotulo;
    c.addEventListener('change', () => { cfg[k] = c.checked; guardar(chaveLs, k === 'vibrar' ? (c.checked ? '1' : '0') : (c.checked ? '1' : '0')); aplicar(); if (aoMudar) aoMudar(); });
    l.append(t, c); return l;
  }
  montarGrade = function () {
    const g = $('#grade-teclas'); g.innerHTML = ''; g.style.display = 'block';
    const lista = document.createElement('div'); lista.className = 'ctl-lista';
    for (const m of MODELOS) lista.appendChild(previa(m));
    lista.addEventListener('click', (e) => { const c = e.target.closest('[data-modelo]'); if (!c) return; cfg.modelo = c.dataset.modelo; guardar('ctlModelo', cfg.modelo); aplicar(); montarGrade(); });
    const aj = document.createElement('div'); aj.className = 'ctl-ajustes';
    aj.append(slider('Tamanho', 'tam', 0.7, 1.4, 0.05, cfg.tam, (v) => Math.round(v * 100) + '%'), slider('Transparência', 'opa', 0.25, 1, 0.05, cfg.opa, (v) => Math.round(v * 100) + '%'),
      chave('Vibrar ao tocar', 'vibrar', 'ctlVibrar'), chave('Modo canhoto (troca os lados)', 'canhoto', 'ctlCanhoto'));
    const pc = document.createElement('button'); pc.className = 'grande'; pc.dataset.acao = 'modo-controle'; pc.textContent = '📱 Usar este celular como controle do PC';
    const dpc = document.createElement('p'); dpc.className = 'dica'; dpc.textContent = 'Com o KOFstation aberto no PC, na mesma Wi-Fi: o celular vira o controle, com o analógico e todos os botões.';
    g.append(pc, dpc, lista, aj);
  };
  montarAjuda = function () { /* a tabela de atalhos de teclado não existe no celular */ };
  { const rp = janela.querySelector('[data-acao="teclas-padrao"]') || [...janela.querySelectorAll('button')].find((b) => /Restaurar/.test(b.textContent));
    if (rp) { rp.dataset.acao = 'ctl-padrao'; rp.addEventListener('click', () => { Object.assign(cfg, { modelo: 'classico', tam: 1, opa: 1, vibrar: true, canhoto: false }); for (const k of ['ctlModelo', 'ctlTam', 'ctlOpa', 'ctlVibrar', 'ctlCanhoto']) guardar(k, ''); aplicar(); montarGrade(); avisar('controle: padrão'); }); } }
  janela.style.width = 'min(560px, 100vw)'; janela.style.maxHeight = '100%'; janela.style.overflowY = 'auto';

  // ----- o celular como controle do PC -----
  // O APK abre um servidor na rede de casa (ControleServidor.java) e mostra o endereço e a senha; o PC conecta (Arquivo →
  // Celular como controle). Aqui fica o controle de toque de sempre, sem jogo, mandando botões e eixos a cada mudança
  // Tela "Controle do PC": o controle de toque inteiro e, no lugar do jogo, uma "telinha" com o console e o jogo que o PC
  // abriu (o PC manda "JOGO <console> <nome>"; o controle troca botões, nomes e cores pros daquele console). O endereço e a
  // senha só aparecem enquanto o PC nunca conectou (depois ele religa sozinho: a senha deste celular não muda) ou no ⓘ
  const CONSOLE_PARECIDO = { ps2: 'ps1', gbc: 'gb' };   // console sem controle próprio aqui usa o de um parecido
  const NOME_CONSOLE = { ps2: 'PlayStation 2', gbc: 'Game Boy Color' };
  // op.pc = 🖥 Jogar no PC: o PC roda o jogo e manda imagem e som (WebRTC, jogarpc.js); o controle é o mesmo de cá
  function entrarModoControle(op) {
    const pcId = op && op.pc;
    if (!window.KOFnesApk || !(pcId ? KOFnesApk.redeCmd : KOFnesApk.controleIniciar)) { avisar('isso precisa do app KOFstation (APK) no celular', 4000); return; }
    const r = pcId ? { ip: '', porta: 0, senha: '' } : JSON.parse(KOFnesApk.controleIniciar() || '{}');
    if (!pcId && (r.erro || !r.ip)) { avisar('não consegui abrir o controle: ' + (r.erro || 'o celular está sem Wi-Fi?'), 5000); return; }
    if (modoControle) sairModoControle();
    if (snes) pausado = true;
    fecharJanelas();
    const d = document.createElement('div'); d.id = 'modo-controle';
    d.innerHTML = '<div class="mc-barra"><i class="mc-luz"></i><span class="mc-status">procurando o PC…</span><button class="mc-info" aria-label="endereço e senha">ⓘ</button><button class="mc-sair" aria-label="sair">✕</button></div>'
      + '<div class="mc-tela"><small class="mc-sis"></small><b class="mc-jogo"></b></div>'
      + '<div class="mc-parear"><b>📱 Conectar ao PC</b><span>No PC: <b>Arquivo → Celular como controle</b> e digite:</span><code></code><em></em><small>Só na primeira vez: depois o PC conecta sozinho.</small></div>';
    d.querySelector('code').textContent = r.ip + (r.porta !== 8642 ? ':' + r.porta : '') + ' ' + r.senha;
    // sem rede de casa o PC não alcança o celular; com ela, o link serve pra testar no navegador do PC se a rede deixa
    d.querySelector('em').textContent = r.casa === false ? '⚠️ o celular não parece estar na Wi-Fi (4G ou VPN?): ligue a Wi-Fi da mesma rede do PC'
      : `Não conectou? No navegador do PC abra http://${r.ip}:${r.porta}`;
    d.querySelector('.mc-sair').addEventListener('click', sairModoControle);
    d.querySelector('.mc-info').addEventListener('click', () => { modoControle.info = !modoControle.info; marcarModoControle(); });
    d.insertAdjacentHTML('beforeend', '<div class="mc-atalhos"><button data-at="rebob" aria-label="rebobinar (segure)">⏪</button><button data-at="salvar-estado" aria-label="salvar estado">💾</button>'
      + '<button data-at="carregar-ultimo" aria-label="carregar o último estado">📂</button><button data-at="home" aria-label="Início do PC">🏠</button><button data-at="menu" aria-label="menu">☰</button></div>');
    const at = d.querySelector('.mc-atalhos');
    const rb = at.querySelector('[data-at="rebob"]');   // ⏪ segurando = Select+Y no PC (o rebobinar de lá)
    const rbFim = () => { if (modoControle) modoControle.extra = 0; rb.classList.remove('on'); };
    rb.addEventListener('pointerdown', (e) => { e.preventDefault(); if (modoControle) modoControle.extra = 0x6000; rb.classList.add('on'); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) rb.addEventListener(ev, rbFim);
    at.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b === rb) return;
      if (b.dataset.at === 'menu') { if (modoControle && modoControle.pc) menuRemoto(); else if (modoControle) modoControle.menu = performance.now(); }
      else atalhoPc(b.dataset.at);
    });
    if (pcId) {
      d.classList.add('remoto');
      d.insertAdjacentHTML('beforeend', '<video class="mc-video" playsinline autoplay></video><small class="mc-ping"></small>'
        + '<div class="mc-menu" hidden><div class="mc-menu-pc"></div>'
        + '<div class="mc-item"><button data-r="filtro">🎛 Filtro e moldura do celular</button></div><div class="mc-item"><button data-r="visual">🖼 Escolher o filtro do celular…</button></div><div class="mc-item"><button data-r="voltar">▶ Voltar ao jogo</button></div><div class="mc-item"><button data-r="sair">📺 Voltar pra TV (o jogo continua no PC)</button></div></div>');
      d.querySelector('.mc-menu').addEventListener('click', (e) => {
        const r = e.target.closest('button') && e.target.closest('button').dataset.r; if (!r) return;
        fecharMenuRemoto();   // os itens do PC (sem data-r) mandam pelo canal de dados
        if (r === 'sair') sairModoControle();
        else if (r === 'filtro' && modoControle) { modoControle.filtro = !modoControle.filtro; guardar('remotoFiltro', modoControle.filtro ? '1' : '0'); marcarFiltroRemoto(modoControle); }
        else if (r === 'visual') abrirVisual();
      });
      d.querySelector('.mc-status').textContent = 'chamando o PC…';
    }
    document.body.appendChild(d);
    modoControle = { sisAntes: document.body.dataset.sis, b: -1, e: -1, quando: 0, visto: 0, n: -1, jogo: null, info: false, pc: pcId || null };
    if (pcId) { modoControle.filtro = ler('remotoFiltro') !== '0'; marcarFiltroRemoto(modoControle); }
    document.body.classList.add('modo-controle', 'cel-jogo');
    consoleDoControle('', '');
    marcarModoControle();
    modoControle.timer = setInterval(enviarControle, 8);
    requestAnimationFrame(() => ajustarEscala());
    if (pcId) conectarAoPc(modoControle, pcId, op.jogo || null);
  }
  // 💾 📂 🏠: no Jogar no PC pelo canal de dados; no celular como controle, pela rede (precisa estar pareado em 📡 Aparelhos)
  function atalhoPc(a) {
    const m = modoControle; if (!m) return;
    if (m.pc) { if (m.dc && m.dc.readyState === 'open') m.dc.send(JSON.stringify({ t: 'acao', a })); return; }
    const pcs = rede.aparelhos.filter((x) => x.online && x.tipo === 'pc'), pc = pcs.find((x) => x.nome === m.nomePc) || pcs[0];
    if (!pc) { avisar('pareie este celular com o PC em 📡 Aparelhos pra usar 💾 📂 🏠', 5000); return; }
    mandarJogo(pc.id, { t: "acao", a });   // mesmo canal "jogo": o PC responde "feito"
  }
  // ☰ no Jogar no PC: o menu rápido do PC aparece aqui (o PC manda os itens e os valores; o toque volta pra lá)
  // 🎛 filtro do celular por cima do Jogar no PC: cada quadro do vídeo volta pro tamanho do jogo (o PC manda) e passa pelo
  // mesmo desenho dos jogos daqui (filtro, moldura, proporção do celular). Desligado = o vídeo direto, sem nada
  function puxarVideo(m, v) {
    if (m.puxando) return; m.puxando = true;
    const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
    const vez = () => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(quadro) : requestAnimationFrame(quadro));
    const quadro = () => {
      if (modoControle !== m) return;
      if (m.filtro && m.tam && v.videoWidth) {
        const [l, a] = m.tam;
        if (cv.width !== l || cv.height !== a) { cv.width = l; cv.height = a; }
        g.imageSmoothingEnabled = false; g.drawImage(v, 0, 0, l, a);
        if (telaL !== l || telaA !== a) { tamanhoTela(l, a); ajustarEscala(); }
        bytesTela.set(g.getImageData(0, 0, l, a).data); pintar(true);
      }
      vez();
    };
    vez();
  }
  function marcarFiltroRemoto(m) {
    const d = $('#modo-controle'); if (!d || !m.pc) return;
    d.classList.toggle('filtrado', !!m.filtro); document.body.classList.toggle('remoto-filtro', !!m.filtro);
    if (m.filtro) document.body.classList.remove('vazio'); else if (!snes) document.body.classList.add('vazio');
    const b = d.querySelector('[data-r="filtro"]'); if (b) b.textContent = '🎛 Filtro e moldura do celular: ' + (m.filtro ? 'ligado' : 'desligado');
    requestAnimationFrame(() => ajustarEscala());
  }
  function menuRemoto() {
    const mm = $('#modo-controle .mc-menu'); if (!mm) return;
    if (!mm.hidden) { fecharMenuRemoto(); return; }
    mm.hidden = false; $('#modo-controle').classList.add('menu-aberto');   // por cima dos botões (celular deitado)
    const m = modoControle; if (m && m.dc && m.dc.readyState === 'open') m.dc.send(JSON.stringify({ t: 'menu' }));
  }
  function fecharMenuRemoto() { const mm = $('#modo-controle .mc-menu'); if (mm) mm.hidden = true; const d = $('#modo-controle'); if (d) d.classList.remove('menu-aberto'); }
  function desenharMenuRemoto(itens) {
    const lista = $('#modo-controle .mc-menu-pc'); if (!lista) return;
    lista.textContent = '';
    const manda = (o) => { const m = modoControle; if (m && m.dc && m.dc.readyState === 'open') m.dc.send(JSON.stringify(o)); };
    for (const it of itens) {
      const li = document.createElement('div'); li.className = 'mc-item';
      const nm = document.createElement('button'); nm.textContent = it.t + (it.v ? ': ' + it.v : '');
      if (it.aj) {
        const menos = document.createElement('button'); menos.textContent = '◀'; menos.className = 'mc-aj'; menos.onclick = () => manda({ t: 'menu-item', i: it.i, d: -1 });
        const mais = document.createElement('button'); mais.textContent = '▶'; mais.className = 'mc-aj'; mais.onclick = () => manda({ t: 'menu-item', i: it.i, d: 1 });
        nm.onclick = () => manda({ t: 'menu-item', i: it.i, d: 1 });
        li.append(menos, nm, mais);
      } else { nm.onclick = () => { manda({ t: 'menu-item', i: it.i, d: 0 }); fecharMenuRemoto(); }; li.append(nm); }
      lista.appendChild(li);
    }
  }
  // pede o jogo ao PC e responde a oferta de vídeo dele; tudo pelo canal "jogo" da rede (cifrado)
  function conectarAoPc(m, pcId, jogo) {
    const pcNome = (rede.aparelhos.find((a) => a.id === pcId) || {}).nome || 'PC';
    m.ouvinte = async (msg) => {
      if (msg.t !== 'msg' || msg.canal !== 'jogo' || msg.de !== pcId || modoControle !== m) return;
      let p; try { p = JSON.parse(msg.dados); } catch (e) { return; }
      if (p.t === 'erro') { avisar('🖥 ' + p.texto, 7000); sairModoControle(); return; }
      if (p.t !== 'oferta' || m.rtc) return;
      const pc = new RTCPeerConnection({ iceServers: [] }); m.rtc = pc;
      pc.ontrack = (e) => {
        try { e.receiver.playoutDelayHint = 0; } catch (x) { /* navegador antigo */ }
        try { e.receiver.jitterBufferTarget = 0; } catch (x) { /* navegador antigo */ }
        const v = $('#modo-controle .mc-video');
        if (v && v.srcObject !== e.streams[0]) { v.srcObject = e.streams[0]; v.play().catch(() => {}); puxarVideo(m, v); }
      };
      pc.ondatachannel = (e) => {
        const dc = e.channel; dc.binaryType = 'arraybuffer'; m.dc = dc;
        dc.onopen = () => { clearTimeout(m.prazo); m.n = 1; m.nomePc = pcNome; marcarModoControle(); };
        dc.onmessage = (ev) => {
          if (typeof ev.data !== 'string') return;
          if (ev.data[0] === 'P') { const ms = Math.round(performance.now() - +ev.data.slice(1)); const el = $('#modo-controle .mc-ping'); if (el) el.textContent = '📶 ' + ms + ' ms'; return; }
          let j; try { j = JSON.parse(ev.data); } catch (x) { return; }
          if (j.t === 'menu') { desenharMenuRemoto(j.itens || []); return; }
          if (j.t === 'feito') { avisar(j.a === 'salvar-estado' ? '💾 estado salvo no PC' : j.a === 'carregar-ultimo' ? '📂 último estado carregado' : j.a === 'home' ? '🏠 Início do PC' : '✅ ' + j.a, 2500); return; }
          if (j.t === 'jogo') { if (j.l) m.tam = [j.l, j.a]; const k = j.sis + '\t' + j.nome; if (k !== m.jogo) { m.jogo = k; consoleDoControle(j.sis, j.nome); } }
        };
        dc.onclose = () => { if (modoControle === m) { avisar('🖥 a conexão com o PC caiu', 5000); sairModoControle(); } };
      };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && modoControle === m) { avisar('🖥 não deu pra receber a imagem do PC (mesma Wi-Fi?)', 6000); sairModoControle(); } };
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: trocarLocal(p.sdp, ipDoAparelho(pcId)) });
        await pc.setLocalDescription(await pc.createAnswer());
        await esperarIce(pc);
        if (modoControle === m) mandarJogo(pcId, { t: 'resposta', sdp: pc.localDescription.sdp });
      } catch (e) { avisar('🖥 ' + e.message, 6000); sairModoControle(); }
    };
    rede.ouvintes.push(m.ouvinte);
    mandarJogo(pcId, { t: 'pedir', jogo });
    m.prazo = setTimeout(() => { if (modoControle === m && !m.dc) { avisar('🖥 o PC não respondeu: o KOFstation está aberto nele?', 6000); sairModoControle(); } }, 20000);
  }
  // troca o controle pro console do jogo que o PC abriu ('' = nenhum: controle completo, com L2/R2 e analógico)
  function consoleDoControle(sis, nome) {
    const base = CONSOLE_PARECIDO[sis] || sis, S = SIS[base];
    document.body.dataset.sis = S ? base : 'ps1';
    document.body.classList.toggle('analogico', !S || !!S.analogico);
    if (modoControle) modoControle.an = (S && S.analogico === 'puro') || (SIS[sis] && SIS[sis].analogico === 'puro') ? 'puro' : 'misto';   // N64/PS2: o analógico não aperta o direcional
    document.body.classList.toggle('so-ab', !!(S && S.botoes && !S.botoes.includes('X')));
    rotularControle(S ? base : 'ps1');
    const d = $('#modo-controle'); if (!d) return;
    d.querySelector('.mc-sis').textContent = sis ? (NOME_CONSOLE[sis] || (S ? S.nome : sis)) : 'nenhum jogo aberto';
    d.querySelector('.mc-jogo').textContent = sis ? nome || '' : 'abra um jogo no PC';
    const t = d.querySelector('.mc-tela'); t.classList.remove('mc-troca'); void t.offsetWidth; t.classList.add('mc-troca');   // animação de troca
    requestAnimationFrame(() => ajustarEscala());
  }
  function marcarModoControle() {
    const m = modoControle, d = $('#modo-controle'); if (!m || !d) return;
    const ligado = m.n > 0, pareado = ler('controlePareado') === '1';
    d.classList.toggle('ligado', ligado);
    d.classList.toggle('pareando', m.info || (!ligado && !pareado));   // endereço e senha à mostra
    d.querySelector('.mc-status').textContent = ligado ? (m.nomePc || 'PC') : pareado ? 'procurando o PC…' : 'esperando o PC…';
  }
  function enviarControle() {
    const m = modoControle; if (!m) return;
    const b = estado() | (m.extra || 0) | (performance.now() - (m.menu || 0) < 150 ? 0x3000 : 0), e16 = [eixosToque[0], eixosToque[1], 0, 0].map((v) => (Math.abs(v) < 0.15 ? 0 : Math.round(Math.max(-1, Math.min(1, v)) * 32767)));
    const e = KofLibretro.empacotar(e16), agora = performance.now();
    if (m.pc) {   // 🖥 Jogar no PC: os 6 bytes vão pelo canal de dados do WebRTC (sem fila: botão velho não serve)
      const dc = m.dc; if (!dc || dc.readyState !== 'open') return;
      if (b !== m.b || e !== m.e || agora - m.quando > 250) { dc.send(new Int8Array([b, b >> 8, e, e >> 8, e >> 16, e >> 24]).buffer); m.b = b; m.e = e; m.quando = agora; }
      if (agora - m.visto > 1000) { m.visto = agora; dc.send('p' + agora); }
      return;
    }
    if (b !== m.b || e !== m.e || agora - m.quando > 250) { KOFnesApk.controleEnviar(b, e); m.b = b; m.e = e; m.quando = agora; }
    if (agora - m.visto > 300) {
      m.visto = agora;
      const t = String(KOFnesApk.controleEstado() || '0');
      const [n, nomePc, sis = '', jogo = ''] = t.includes('\t') ? t.split('\t') : t.split('|');   // casca antiga: "n|nome"
      if (+n !== m.n || nomePc !== m.nomePc) {
        if (+n > 0 && !(m.n > 0)) { guardar('controlePareado', '1'); m.info = false; }
        m.n = +n; m.nomePc = nomePc; marcarModoControle();
      }
      const j = +n > 0 ? sis + '\t' + jogo : '\t';
      if (j !== m.jogo) { m.jogo = j; consoleDoControle(+n > 0 ? sis : '', jogo); }
    }
  }
  function sairModoControle() {
    const m = modoControle; if (!m) return;
    clearInterval(m.timer); modoControle = null; soltarTudo();
    if (m.pc) {
      clearTimeout(m.prazo); mandarJogo(m.pc, { t: 'fim' });
      const i = rede.ouvintes.indexOf(m.ouvinte); if (i >= 0) rede.ouvintes.splice(i, 1);
      if (m.rtc) try { m.rtc.close(); } catch (x) { /* já fechada */ }
    } else try { KOFnesApk.controleParar(); } catch (x) { /* sem ponte */ }
    const d = $('#modo-controle'); if (d) d.remove();
    document.body.classList.remove('modo-controle', 'cel-jogo', 'remoto-filtro'); if (!snes) document.body.classList.add('vazio'); document.body.classList.toggle('analogico', !!(snes && SIS[snes.sistema] && SIS[snes.sistema].analogico));
    const sisJogo = snes ? snes.sistema || 'snes' : '';   // o controle volta a ser o do jogo deste celular
    document.body.classList.toggle('so-ab', !!(sisJogo && SIS[sisJogo] && SIS[sisJogo].botoes && !SIS[sisJogo].botoes.includes('X')));
    rotularControle(sisJogo);
    if (m.sisAntes) document.body.dataset.sis = m.sisAntes; else delete document.body.dataset.sis;
    jogando = false; atualizarJogando();
  }
  window.entrarModoControle = entrarModoControle;
  // resposta dos atalhos 💾 📂 no celular como controle (chega pela rede)
  rede.ouvintes.push((msg) => {
    if (msg.t !== 'msg' || msg.canal !== 'jogo') return;
    let p; try { p = JSON.parse(msg.dados); } catch (e) { return; }
    // 📱 Levar pro celular (apertado no PC): o jogo que está lá passa pra esta tela
    if (p.t === 'levar') { if (modoControle && modoControle.pc === msg.de) return; if (modoControle) sairModoControle(); fecharJanelas(); entrarModoControle({ pc: msg.de }); return; }
    if (!modoControle || modoControle.pc) return;
    if (p.t === 'feito') avisar(p.a === 'salvar-estado' ? '💾 estado salvo no PC' : p.a === 'carregar-ultimo' ? '📂 último estado carregado' : '🏠 Início do PC', 2500);
  });

  // ----- voltar do Android: no jogo abre o menu rápido; nas telas, volta -----
  history.pushState({ kofnes: 1 }, '');
  addEventListener('popstate', () => {
    history.pushState({ kofnes: 1 }, '');
    if (modoControle) { sairModoControle(); return; }
    if (rapidoAberto) { fecharRapido(); return; }
    if (snes && telaAtual() === 'jogo') { abrirRapido(); return; }
    acao('voltar');
  });

  // ----- textos que só fazem sentido no computador -----
  const guia = $('#guia');
  if (guia) {
    const nav = guia.querySelector('nav'), conteudo = guia.querySelectorAll('[data-pagina]');
    const backup = guia.querySelector('[data-pagina="backup"]');   // a do PC já tem os trechos do celular (.so-cel)
    const paginas = {
      comecar: ['👋 Começando', '<h3>👋 Começando</h3><p>O <b>KOFstation</b> é um emulador de Super Nintendo e Game Boy. Toque em <b>Abrir uma ROM</b>, escolha o arquivo do seu jogo e jogue com o controle na tela.</p><p>Este guia tem o resto: biblioteca, controle, voltar no tempo, imagem e som, jukebox e temas.</p>'],
      biblioteca: ['📚 Biblioteca', '<h3>📚 Biblioteca</h3><p>Toque em <b>Abrir uma ROM</b> e escolha o arquivo do jogo (.sfc, .smc, .nes, .gb, .gbc, .md, .sms, .gg ou .zip). Ele fica guardado na <b>Biblioteca</b>: da próxima vez é só tocar nele.</p><p>No <b>Início</b>, <b>Continuar</b> volta exatamente de onde você parou.</p>'],
      jogando: ['🎮 Jogando', '<h3>🎮 Jogando</h3><p>O controle fica na tela. Dá pra apertar vários botões ao mesmo tempo e deslizar o dedo entre A, B, X e Y.</p><p>Toque em <b>☰</b> pra salvar, carregar, mudar o tema e o filtro. Em <b>Controles</b> (barra de baixo) você troca o modelo do controle, o tamanho e a transparência, e liga o modo canhoto.</p><p>Gire o celular: na horizontal, os botões ficam nos cantos e o jogo ganha a tela.</p><p><b>📱 Controle do PC:</b> em <b>Controles</b>, toque em <b>Usar este celular como controle do PC</b>. Aparecem um endereço e uma senha: no PC, <b>Arquivo → Celular como controle</b> e digite os dois. Os dois precisam estar na mesma Wi-Fi.</p>'],
      bugs: ['🐞 Bugs', '<h3>🐞 Bugs</h3><p>O KOFstation é jovem, e cada bug encontrado ajuda o emulador. Toque em <b>☰</b> e em <b>Reportar bug</b>: a página do GitHub abre já preenchida e um pacote é baixado pra reproduzir o bug quadro a quadro. É só anexar o arquivo na página.</p><p>Se o emulador quebrar, ele mesmo oferece reportar.</p>'],
      tempo: ['⏪ Voltar no tempo', '<h3>⏪ Voltar no tempo</h3><p>Segure o <b>⏪</b> e o jogo volta até 5 segundos, em preto e branco. Soltou, continua dali. Depois a ampulheta ⏳ recarrega enquanto você joga.</p><p><b>⏩</b> acelera o jogo enquanto você segura.</p>'],
      backup: ['💾 Saves e backup', backup ? backup.innerHTML : ''],
      imagem: ['🖼 Imagem e som', '<h3>🖼 Imagem e som</h3><p>No <b>☰</b>: filtro (tela de tubo, LCD, Game Boy…), proporção, moldura e volume. O som precisa estar ligado no aparelho.</p>'],
      jukebox: ['🎵 Jukebox', '<h3>🎵 Jukebox</h3><p>No meio do jogo, toque em <b>☰</b> e em <b>Guardar esta música</b>: a trilha que está tocando vai pra Jukebox, e você ouve depois, sem o jogo. Também dá pra abrir arquivos <b>.spc</b>.</p><p>As 8 vozes do chip de som aparecem ao vivo: toque numa pra silenciar e ouvir só o baixo ou a percussão.</p>'],
      temas: ['🎨 Temas', '<h3>🎨 Temas</h3><p>São <span class="n-temas">126</span> temas, com busca e categorias. Toque em <b>Tema</b> na barra de baixo. O modelo de controle <b>Segue o tema</b> usa as cores do tema escolhido.</p>'],
    };
    nav.innerHTML = Object.entries(paginas).map(([k, [rot]]) => `<button data-guia="${k}">${rot}</button>`).join('');
    const pai = conteudo[0].parentNode; conteudo.forEach((c) => c.remove());
    for (const [k, [, corpo]] of Object.entries(paginas)) { const d = document.createElement('div'); d.dataset.pagina = k; d.hidden = k !== 'comecar'; d.innerHTML = corpo; pai.appendChild(d); }
    nav.firstElementChild.classList.add('ativo');
  }
  // dentro do app (APK) o arquivo já está no aparelho; no navegador, instalável (PWA) só quando servido por http(s)
  if (!window.KOFnesApk && /^https?:/.test(location.protocol) && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  // APK: a WebView não baixa arquivo de link "blob:"; a ponte nativa abre o "salvar como" do Android
  if (window.KOFnesApk) {
    document.addEventListener('click', async (e) => {
      const a = e.target.closest && e.target.closest('a[download]');
      if (!a || !a.href.startsWith('blob:')) return;
      e.preventDefault(); e.stopPropagation();
      try {
        const blob = await (await fetch(a.href)).blob(), u8 = new Uint8Array(await blob.arrayBuffer());
        KOFnesApk.salvar(a.download || 'kofnes.bin', blob.type || 'application/octet-stream', b64(u8));
      } catch (x) { avisar('não consegui salvar o arquivo: ' + x.message, 4000); }
    }, true);
  }
  document.querySelectorAll('.n-temas').forEach((e) => { e.textContent = TODOS_TEMAS.length; });
})();

// ---------- PlayStation e Nintendo 64 nativos (só no APK, celular ARM64) ----------
// Os núcleos rodam no Java (Ps1Jogo/N64Jogo): a imagem vai pra uma tela nativa por cima da área do jogo e o som sai direto.
// Aqui fica só uma "fachada" com a cara de núcleo que o app conhece: ela manda os botões a cada quadro (que é também o
// sinal de "jogando"; parou = menu aberto, a tela nativa some), a posição da área do jogo, o volume e o savestate. O jogo nem
// passa pelo JavaScript: o Java copia direto dos arquivos escolhidos. KOFnesApk.<c>Abrir/<c>Pad/... com c = 'ps1' ou 'n64'.
var NATIVO = {};
if (window.KOFnesApk) for (const c of ['ps1', 'n64']) if (KOFnesApk[c + 'Nativo'] && KOFnesApk[c + 'Nativo']()) NATIVO[c] = true;
var PS1N = !!NATIVO.ps1;
function nativoAbrir(c, nome) {
  return new Promise((ok, falha) => {
    window['__' + c + 'Pronto'] = (r) => { window['__' + c + 'Pronto'] = null; if (r && r.erro) falha(new Error(r.erro)); else ok(r); };
    KOFnesApk[c + 'Abrir'](nome);
  });
}
const marcaNativa = (c, nome) => new TextEncoder().encode((c + ' nativo ' + nome).padEnd(16)).slice(0, 16);   // o "arquivo" que o app guarda
async function nativoJogo(c, nome, j) {   // da biblioteca: o Java copia de novo da pasta de ROMs, ou reabre o último que copiou
  if (pastaApk && KOFnesApk.pastaNome()) {
    const l = await lerPasta(false).catch(() => []), n = (nome || '').toLowerCase(), b = baseCd(n);
    // o CD que veio de um zip fica com o nome de dentro do zip: acha o zip pelo nome sem extensão
    const it = l.find((x) => x.arquivo.toLowerCase() === n) || l.find((x) => /\.zip$/i.test(x.arquivo) && baseCd(x.arquivo).toLowerCase() === b);
    if (it && it.h.uri) { KOFnesApk.pastaPreparar(it.h.uri); nome = it.arquivo; }
  }
  const r = await nativoAbrir(c, nome);
  return { bytes: marcaNativa(c, r.principal), extras: { nativo: fachada(c, r) } };
}
// qual console nativo abre esse arquivo (null = nenhum: segue o caminho normal, WebAssembly)
async function consoleNativo(arq) {
  const n = arq.name.toLowerCase();
  if (NATIVO.n64 && /\.(z64|n64|v64)$/.test(n)) return 'n64';
  if (NATIVO.ps1 && /\.(cue|chd|pbp|iso|img|exe)$/.test(n)) return 'ps1';
  if (NATIVO.ps1 && n.endsWith('.bin') && arq.slice && cdPs1(new Uint8Array(await arq.slice(0, 0x9000).arrayBuffer()))) return 'ps1';
  if (n.endsWith('.zip') && arq.slice) {
    if (NATIVO.ps1 && await cdDoZip(arq)) return 'ps1';
    if (NATIVO.n64) { try { if ((await itensDoZip(arq)).some((f) => /\.(z64|n64|v64)$/i.test(f.name))) return 'n64'; } catch (e) { /* zip quebrado */ } }
  }
  return null;
}
async function nativoArquivo(arq) {
  if (!arq || !arq.name || !Object.keys(NATIVO).length) return false;
  const c = await consoleNativo(arq);
  if (!c) return false;
  avisar(c === 'ps1' ? '💿 preparando o CD do PlayStation…' : '🎮 preparando o cartucho do Nintendo 64…', 30000);
  if (arq.uri) KOFnesApk.pastaPreparar(arq.uri);   // veio da pasta de ROMs: o Java copia de lá (com as faixas do CD)
  const r = await nativoAbrir(c, arq.name);
  await abrirBytes(r.principal, marcaNativa(c, r.principal), true, { nativo: fachada(c, r) });
  avisar(c === 'ps1' ? '💿 PlayStation nativo' : '🎮 Nintendo 64 nativo', 1500);
  return true;
}
function fachada(c, r) {
  const area = () => { const q = $('#tela').getBoundingClientRect(); KOFnesApk[c + 'Area'](q.left, q.top, q.width, q.height); };
  const L = r.largura || 320, A = r.altura || 240;
  return {
    sistema: c, nucleo: c === 'ps1' ? 'pcsx-nativo' : 'mupen64-nativo', lr: true, nativo: true, largura: L, altura: A, proporcao: 4 / 3,
    fps: r.fps || 59.94, taxaAudio: 32000, rgba: new Uint32Array(L * A), quadros: 0, pad: [0],
    apu: { dsp: { outCount: 0, outBuf: new Int16Array(4) } },
    cart: { title: r.principal.replace(/\.[^.]+$/, ''), hasSram: () => false, sram: new Uint8Array(0) },
    runFrame() {
      if (this.quadros++ % 30 === 0) { area(); KOFnesApk[c + 'Volume'](mudo ? 0 : volume / 100); }
      KOFnesApk[c + 'Pad'](c === 'n64' ? KofLibretro.mascaraN64(this.pad[0]) : KofLibretro.mascara(this.pad[0]), KofLibretro.empacotar(this.eixos));
    },
    reset() { KOFnesApk[c + 'Reiniciar'](); },
    fecharNativo() { KOFnesApk[c + 'Fechar'](); },
    serializar() { const t = atob(KOFnesApk[c + 'Estado']()), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; },
    desserializar(u) { let t = ''; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return KOFnesApk[c + 'CarregarEstado'](btoa(t)); },
  };
}

// ---------- pasta de ROMs no APK (Pasta.java) ----------
// Escolhida uma vez pelo seletor de pasta do Android; cada arquivo vira um "arquivo" que a página lê aos pedaços pelo
// endereço /pasta?u=... (cabeçalho Range): zip e CD grande não são lidos inteiros só pra ver o que tem dentro.
function arquivoApk(nome, u, tam, ini = 0, fim = tam) {
  const url = '/pasta?u=' + encodeURIComponent(u), inteiro = tam < 0;
  const pedir = () => fetch(url, inteiro ? {} : { headers: { Range: `bytes=${ini}-${fim - 1}` } }).then((r) => {
    if (!r.ok) throw new Error('não consegui ler ' + nome + ' da pasta de ROMs (ela ainda está no celular?)');
    return r;
  });
  const a = {
    name: nome, size: inteiro ? 0 : fim - ini, type: '', uri: u,
    async arrayBuffer() { return !inteiro && fim <= ini ? new ArrayBuffer(0) : (await pedir()).arrayBuffer(); },
    async text() { return new TextDecoder().decode(await a.arrayBuffer()); },
  };
  if (!inteiro) {   // tamanho conhecido: dá pra ler um pedaço (como o slice de um File)
    a.slice = (x = 0, y = fim - ini) => {
      const t = fim - ini, de = x < 0 ? Math.max(0, t + x) : Math.min(x, t), ate = y < 0 ? Math.max(0, t + y) : Math.min(y, t);
      return arquivoApk(nome, u, tam, ini + de, ini + Math.max(de, ate));
    };
    a.stream = () => { const ts = new TransformStream(); pedir().then((r) => r.body.pipeTo(ts.writable)).catch((e) => ts.writable.abort(e).catch(() => {})); return ts.readable; };
  }
  return a;
}
function listarPastaApk() {
  return new Promise((ok) => {
    window.__pastaLida = (l) => {
      window.__pastaLida = null;
      ok((l || []).map((x) => ({ nome: x.n, h: { kind: 'file', uri: x.u, getFile: async () => arquivoApk(x.n, x.u, x.t) } })));
    };
    KOFnesApk.pastaListar(EXT_ROM.source + '|\\.zip$');
  });
}
function escolherPastaApk() {
  return new Promise((ok) => {
    window.__pastaEscolhida = (sim) => { window.__pastaEscolhida = null; if (sim) avisar('📁 pasta escolhida: ' + KOFnesApk.pastaNome(), 2500); ok(!!sim); };
    KOFnesApk.pastaEscolher();
  });
}
// no APK o botão da pasta aparece em todo lugar (no PWA o navegador do celular não deixa escolher pasta)
if (pastaApk) document.querySelectorAll('[data-acao="pasta"].so-pc').forEach((b) => b.classList.remove('so-pc'));
