# Protocolo kofrede (versão 1)

A rede entre aparelhos do KOFstation, sem nada de jogo. O nome do app (`kofstation`) entra no pedido e na
criptografia. Outro app usa o mesmo protocolo trocando só esse nome. Quem quiser reescrever (por exemplo em Rust)
segue este arquivo e passa nos testes de `rede/teste/` contra o kofservico.

## Camadas

```
app (página do KOFstation)      canais: "sinal", "sync", "jogo"...  (o que cada um carrega é do app)
───────────────────────────────────────────────────────────────────────────────────────────────
API local (JSON)                PC: WebSocket 127.0.0.1:8644 → kofservico · celular: KOFnesApk.redeCmd / window.__rede
───────────────────────────────────────────────────────────────────────────────────────────────
transporte                      TCP 8650 entre aparelhos, mensagens cifradas por canal
núcleo (kofrede.c)              CPace (parear), 3DH (conectar), XChaCha20-Poly1305 (mensagens). Só conta, sem rede
```

A API local é a mesma no PC e no celular, então o código do app é um só. Pra ligar por fora de casa no futuro
(servidor na internet), entra um transporte novo embaixo, e as camadas de cima não mudam.

## Achar (UDP 8650)

Pedido: `KOFR?<app>` em broadcast. Resposta, só de quem está visível e só pra endereço da rede de casa:
`KOFR!{"app":"kofstation","v":1,"id":"<16 hex>","porta":8650,"tipo":"pc","nome":"PC da sala"}`.

## Conexão (TCP 8650)

Cada quadro é `u32 big-endian (tamanho) | corpo`. Corpo de no máximo 1 MB + 512.

Primeiro quadro, do cliente: `"KOFR" | 1 (versão) | modo | 0 | tamanho do app | app | resto`.
O servidor responde `'R' | msg2` ou, quando recusa, `'X' | motivo em UTF-8` e fecha.

**Parear** (modo `'P'`, resto = `'c'` código ou `'q'` QR | msg1 de 48 bytes):
1. Cliente → `sid(16) | Ya(32)`. G = Elligator2(BLAKE2b-256("KOFREDE-CPACE-1\0" app "\0" senha "\0" sid)); Ya = X25519(ya, G).
2. Servidor → `'R' | Yb(32) | conf_s(16)`. K = X25519(yb, Ya); isk = BLAKE2b-512("KOFREDE-PAR-1\0" app "\0" sid Ya Yb K).
3. Cliente confere conf_s → `'F' | conf_c(16)`. Os rótulos são `conf-s`, `conf-c`, `c->s` e `s->c`, todos em BLAKE2b com chave isk.
4. Pelo canal cifrado, cada um manda a sua ficha no canal `par`: `pk(32) | porta(u16) | tamanho do tipo | tipo | nome`.
   O cliente manda primeiro.

A senha é o código de 6 números (vale 2 minutos, 5 erros e acaba) ou o segredo de 128 bits do QR
(`kofstation://parear?ip=&p=&id=&s=<segredo>&n=<nome>`). Quem não sabe a senha tem um chute por tentativa.

**Conectar** (modo `'C'`, resto = `PKc(32) | Ec(32)`), só aparelho já pareado:
- ck = BLAKE2b-512("KOFREDE-CON-1\0" app "\0" PKc PKs Ec Es DH(e,E) DH(e_c,S_s) DH(S_c,e_s)).
- Servidor → `'R' | Es(32) | conf_s(16)`. Cliente → `'F' | conf_c(16)`.
- Dá sigilo pra frente (as chaves efêmeras somem) e autenticação dos dois lados.

**Mensagens:** `mac(16) | cifrado`, com XChaCha20-Poly1305. O nonce é um contador de 64 bits por sentido. Por dentro:
`tamanho do canal (1) | canal | dados`. O canal vazio é de controle: `p` = ping e `P` = resposta. Ping a cada 15 s;
sem receber nada por 45 s, a conexão caiu.

Quem liga: o celular sempre liga pro PC. Entre dois PCs, liga o de id menor.

## API local (JSON)

Pedidos: `eu`/`lista`, `nome {nome}`, `visivel {sim}`, `parear` (PC abre o QR e o código), `parear-fim`, `achar`,
`parear-com {ip, porta, senha, modo}`, `conectar {id}`, `remover {id}`, `enviar {para, canal, dados}`.

Eventos: `lista {eu, aparelhos[{id, nome, tipo, online, visto, ip}]}`, `parear {codigo, qr, seg, ip, porta}`,
`parear-fim {motivo}`, `achados {lista}`, `pareado {aparelho}`, `par-erro {texto}`, `msg {de, canal, dados}`,
`nao-enviou {para}`.

Hoje `dados` é texto. Binário vai em base64 por enquanto.

## Onde fica cada coisa

- PC: `~/.local/share/KOFnes/rede/` ou `%LOCALAPPDATA%\KOFnes\rede\`, com `identidade.bin` (a chave secreta, nunca sai
  da máquina), `pareados.txt` e `config.txt`. Fica fora da pasta Kof Games de propósito: copiar a pasta pra outro PC não
  copia a identidade.
- Celular: preferências privadas do app (`rede`).
