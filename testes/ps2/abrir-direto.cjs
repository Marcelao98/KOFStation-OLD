// Abre um jogo de PS2 direto no kofnativo (sem o navegador), fazendo o papel da página: manda a BIOS, o pedido de
// abrir e responde os pedaços do disco. Serve pra ver o erro do PCSX2 no PC de quem joga.
//   1) num terminal:  KOF_JANELA=1 KOF_DEBUG=1 <kofnativo> <pcsx2_libretro.so> /tmp/kofps2 2>&1 | tee /tmp/kofps2.log
//   2) noutro:        node testes/ps2/abrir-direto.cjs <bios.bin> <jogo.iso>
// (feche antes o KOFstation: os dois usam a porta 8643)
const fs = require('fs');
const [,, bios, iso] = process.argv;
if (!iso) { console.log('uso: node abrir-direto.cjs <bios.bin> <jogo.iso>'); process.exit(1); }
const fd = fs.openSync(iso, 'r'), tam = fs.fstatSync(fd).size;
const ws = new WebSocket('ws://127.0.0.1:8643'); ws.binaryType = 'arraybuffer';
ws.onopen = () => { ws.send('bios bios-ps2.bin'); ws.send(fs.readFileSync(bios)); ws.send('mostrar'); ws.send('abrir ' + tam + ' ' + iso.replace(/^.*\//, '')); };
ws.onerror = () => console.log('não conectou em 127.0.0.1:8643: o kofnativo está aberto?');
ws.onmessage = (e) => {
  if (typeof e.data !== 'string') return;
  const t = e.data;
  if (t.startsWith('ler ')) {
    const [, id, ini, len] = t.split(' ').map(Number), h = Buffer.alloc(5), d = Buffer.alloc(Math.max(0, Math.min(len, tam - ini)));
    fs.readSync(fd, d, 0, d.length, ini); h[0] = 68; h.writeUInt32LE(id, 1); ws.send(Buffer.concat([h, d])); return;
  }
  if (!t.startsWith('quadros')) console.log('<', t);
};
ws.onclose = () => { console.log('o kofnativo fechou a conexão (caiu?)'); process.exit(0); };
