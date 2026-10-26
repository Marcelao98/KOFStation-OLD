// O lado do celular (Rede.java + núcleo C pela JNI, rodando no Linux) contra o kofservico de verdade:
// achar o PC, código errado, parear pelo código de 6 números, conectar sozinho, mensagens nos dois sentidos, reabrir.
//   node rede/teste/celular.cjs <kofservico> <classes do Rede.java> <org.json.jar> <pasta com libkofrede.so>
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const [bin, classes, jsonJar, libs] = process.argv.slice(2);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kofcel-'));
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'ok: ' : 'FALHOU: ') + m); if (!c) falhas++; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
function fila() {
  const f = [];
  let acorda = null;
  f.chegou = (m) => { f.push(m); if (acorda) acorda(); };
  f.esperar = async (t, cond = () => true, ms = 8000) => {
    const fim = Date.now() + ms;
    for (;;) {
      const i = f.findIndex((m) => m.t === t && cond(m));
      if (i >= 0) return f.splice(i, 1)[0];
      if (Date.now() > fim) return null;
      await new Promise((r) => { acorda = r; setTimeout(r, 100); });
    }
  };
  return f;
}
function pc() {
  return spawn(bin, ['--pasta', path.join(tmp, 'pc'), '--nome', 'PC da sala', '--porta', '18750', '--udp', '18750', '--ws', '18744'], { stdio: ['ignore', 'ignore', process.env.VERBOSO ? 'inherit' : 'ignore'] });
}
async function pagina() {
  for (let i = 0; i < 50; i++) {
    try {
      const ws = new WebSocket('ws://127.0.0.1:18744'), f = fila();
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      ws.onmessage = (e) => f.chegou(JSON.parse(e.data));
      f.pedir = (o) => ws.send(JSON.stringify(o));
      return f;
    } catch { await esperar(100); }
  }
  throw new Error('kofservico não abriu');
}
function celular() {
  const p = spawn('java', ['-Djava.library.path=' + libs, '-cp', classes + ':' + jsonJar, 'dev.kofnes.android.Rede', path.join(tmp, 'cel'), '127.0.0.1:18750'],
    { stdio: ['pipe', 'pipe', process.env.VERBOSO ? 'inherit' : 'ignore'] });
  const f = fila();
  let resto = '';
  p.stdout.on('data', (d) => { resto += d; const l = resto.split('\n'); resto = l.pop(); for (const x of l) if (x.startsWith('{')) f.chegou(JSON.parse(x)); });
  f.pedir = (o) => p.stdin.write(JSON.stringify(o) + '\n');
  f.p = p;
  return f;
}

(async () => {
  let A = pc(), pa = await pagina(), cel = celular();
  pa.pedir({ t: 'eu' });
  const la = await pa.esperar('lista');
  cel.pedir({ t: 'eu' });
  const lc = await cel.esperar('lista');
  ok(lc && lc.eu.id.length === 16 && lc.eu.nome === 'Celular de teste', 'celular: chave e id criados');
  cel.pedir({ t: 'achar' });
  const ach = await cel.esperar('achados');
  ok(ach && ach.lista.length === 1 && ach.lista[0].id === la.eu.id && ach.lista[0].nome === 'PC da sala', 'celular acha o PC na rede');

  pa.pedir({ t: 'parear' });
  const j = await pa.esperar('parear');
  const errado = String((+j.codigo + 1) % 1000000).padStart(6, '0');
  cel.pedir({ t: 'parear-com', ip: '127.0.0.1', porta: 18750, senha: errado, modo: 'c' });
  let e = await cel.esperar('par-erro');
  ok(e && e.texto === 'código errado', 'código errado não pareia: ' + (e && e.texto));
  cel.pedir({ t: 'parear-com', ip: '127.0.0.1', porta: 18750, senha: j.codigo, modo: 'c' });
  const [p1, p2] = [await cel.esperar('pareado'), await pa.esperar('pareado')];
  ok(p1 && p1.aparelho.id === la.eu.id && p1.aparelho.tipo === 'pc', 'celular pareou com o PC (código de 6 números)');
  ok(p2 && p2.aparelho.id === lc.eu.id && p2.aparelho.tipo === 'celular' && p2.aparelho.nome === 'Celular de teste', 'PC guardou o celular');
  ok(!!(await pa.esperar('lista', (m) => m.aparelhos.some((x) => x.online))), 'celular conecta sozinho depois de parear');
  await cel.esperar('lista', (m) => m.aparelhos.some((x) => x.online));
  cel.pedir({ t: 'enviar', para: la.eu.id, canal: 'jogo', dados: 'Jogar no PC: ção 🎮' });
  let m = await pa.esperar('msg');
  ok(m && m.de === lc.eu.id && m.dados === 'Jogar no PC: ção 🎮', 'mensagem celular → PC');
  pa.pedir({ t: 'enviar', para: lc.eu.id, canal: 'sinal', dados: JSON.stringify({ sdp: 'v=0\r\n'.repeat(2000) }) });
  m = await cel.esperar('msg');
  ok(m && m.canal === 'sinal' && JSON.parse(m.dados).sdp.length === 10000, 'mensagem PC → celular (10 KB)');

  // o PC fecha e volta: o celular religa sozinho (a cada 30 s) ou na hora pelo "conectar"
  A.kill(); await esperar(300);
  ok(!!(await cel.esperar('lista', (x) => !x.aparelhos[0].online)), 'celular percebe que o PC caiu');
  A = pc(); pa = await pagina();
  cel.pedir({ t: 'conectar', id: la.eu.id });
  ok(!!(await pa.esperar('lista', (x) => x.aparelhos.some((y) => y.online))), 'celular reconecta quando o PC volta');
  cel.p.kill(); cel = celular();
  cel.pedir({ t: 'eu' });
  const lc2 = await cel.esperar('lista');
  ok(lc2 && lc2.eu.id === lc.eu.id && lc2.aparelhos.length === 1, 'celular lembra do PC depois de reabrir o app');

  cel.p.kill(); A.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(falhas ? falhas + ' FALHAS' : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})();
