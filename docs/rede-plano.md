# 📡 Módulo de rede: plano de implementação

Combinado em 26/10. Tudo **só na rede de casa**: nada passa pela internet. Branch: `rede`.

Objetivos:
1. **Parear** os aparelhos (PC, celular, depois TV box e outros PCs).
2. **Sincronizar** saves, estados, estatísticas e configurações.
3. **Jogar no celular** com o jogo rodando no PC, e escolher quem processa.

## Peças

| Peça | Onde roda | Tecnologia | O que faz |
|---|---|---|---|
| **kofservico** | PC (Linux e Windows) | C, mesmo jeito do kofnativo (gcc / llvm-mingw) | Servidor da rede: anuncia o PC, pareia, sincroniza arquivos direto no disco (pasta Kof Games), repassa a "conversa" do vídeo |
| **libkofrede** | Celular (APK) | o **mesmo código C** do kofservico, por JNI | Criptografia e sincronização no celular (um código só, testado uma vez) |
| Página do PC | navegador | JS | Tela Aparelhos, QR code, transmite o jogo (WebRTC) |
| Página do celular | WebView | JS + ponte Java | Tela Aparelhos, lê o QR, recebe o vídeo, manda os botões |

O kofservico é **separado do kofnativo (PCSX2)** de propósito: se o PS2 travar, a rede continua de pé. O lançador
(`kofnes.sh` / `KOFstation.exe`) abre os dois.

### Bibliotecas (todas pequenas, de código aberto e sem nada a instalar)
- **Monocypher** (C, um arquivo, BSD-2 / domínio público): X25519 (troca de chaves), XChaCha20-Poly1305 (cifra) e
  BLAKE2b (hash dos arquivos).
- **Achar na rede:** pergunta por broadcast UDP na porta 8650 (`KOFR?kofstation`), como o Steam Link. Ficou no lugar do
  mDNS, que no Linux e no Windows briga pela porta 5353 com o Avahi e com o serviço do próprio Windows.
- **qrcode-generator** (JS, MIT): o PC desenha o QR.
- **jsQR** (JS, Apache-2): o celular lê o QR pela câmera (getUserMedia na WebView).
- **WebRTC** (já vem no Chrome, Edge e na WebView): vídeo, som e o canal dos botões.

## 1. Achar e parear

```
PC: "📡 Aparelhos → Parear celular"  →  mostra QR + código de 6 números (vale 2 minutos)
      QR = kofstation://IP:porta?id=<id do PC>&chave=<chave pública do PC>&t=<senha de uso único>
Celular: "Adicionar aparelho" → lê o QR (ou digita o código, achando o PC pela lista da rede)
      → manda a chave pública dele, cifrada e assinada com a senha de uso único
Os dois guardam a chave pública do outro: daí em diante se reconhecem sozinhos.
```

- **Conexões depois do pareamento:** troca de chaves X25519 (as fixas dos dois + uma nova a cada conexão) e
  canal cifrado com XChaCha20-Poly1305. É o mesmo desenho do Noise/WireGuard: ninguém na rede lê nem finge ser um
  dos aparelhos.
- **Só rede de casa:** o kofservico recusa conexão de endereço que não seja de rede local (192.168, 10, 172.16-31).
- **Rede:** porta **8650/TCP** (se estiver ocupada, a próxima livre; o anúncio diz qual) e **8650/UDP** (achar). O
  kofnativo continua só em 127.0.0.1:8643. No Windows o firewall pergunta uma vez.
- **Reserva:** se o mDNS estiver bloqueado na rede, dá pra digitar o IP.

## 2. Sincronizar

Antes, a última parte da pasta Kof Games: **saves, estados, estatísticas e configurações viram arquivos**. O banco do
navegador passa a ser só um cache rápido. A página do PC grava direto na pasta, pela permissão que já existe; a do
celular grava pela ponte, na pasta do app.

```
Kof Games/
├── Saves/<console>/<jogo>.srm           save da bateria (e cartões de memória)
├── Saves/<console>/<jogo>/estados/*.kofestado
├── Saves/estatisticas/<aparelho>.json   cada aparelho escreve só o seu (sem conflito)
├── Config/configuracoes.json            temas, filtros, modos, opções de emulação…
├── Config/bios/                         (sincronizar é opcional)
└── Config/local/                        NUNCA sincroniza: chave privada, nome do aparelho, volume, escala,
                                         layout do controle, aparelhos pareados, índice do sync
```

**Como sincroniza (otimizado):**
1. Cada lado tem um **índice**: caminho, tamanho, data e hash BLAKE2b de cada arquivo. O hash só é recalculado
   quando a data muda.
2. Os dois trocam os índices (alguns KB) e comparam com a **base**, o índice do último sync entre os dois.
3. Mudou só de um lado: copia. Mudou dos dois: vence o mais novo e o outro vira `nome.anterior-<aparelho>`, nada se
   perde. Apagou de um lado: apaga do outro (fica registrado no índice).
4. Só os arquivos diferentes viajam, em blocos de 1 MB cifrados. Um sync sem mudança leva menos de 1 segundo.

**Quando:** sozinho, quando os aparelhos se encontram na rede e quando um save muda (com alguns segundos de espera
pra juntar mudanças), e também pelo botão "Sincronizar agora".

**O quê (marcar na tela):** Saves ✔ · Estados ✔ · Estatísticas ✔ · Configurações ✔ · BIOS ☐ · Jogos ☐ (por console).

## 3. Jogar no celular rodando no PC

```
PC (página)                                           Celular (WebView)
 canvas do jogo ─captureStream(60)─┐                  <video> ─→ textura WebGL ─→ filtro/moldura do celular
 som (AudioContext) ─MediaStream───┼─ WebRTC ────────► som
 rodarQuadro ◄── botões ◄──────────┘◄─ DataChannel ─── controle de toque (6 bytes, igual ao controle de hoje)
 a conversa inicial (offer/answer) passa pelo canal cifrado: página PC ↔ kofservico ↔ libkofrede ↔ página celular
```

- **Vídeo:** a imagem do jogo **sem filtro**, ampliada 3x nos pixels (pixel art comprime melhor assim), em
  **H.264 por hardware** (o Chrome escolhe a placa de vídeo), 60 qps, de 6 a 15 Mbps.
  - `degradationPreference: maintain-framerate` e `playoutDelayHint = 0` no celular: o mínimo de atraso.
  - Filtro e moldura são aplicados **no celular**, do jeito do celular.
  - Vale pro PS2 também (modo página).
- **Som:** Opus estéreo de 128 kbps em pacotes curtos. O PC fica mudo enquanto transmite (opção).
- **Botões:** DataChannel sem fila e sem reenvio (botão velho não serve), mais um "ping" a cada segundo que mede o atraso
  e aparece no painel F3.
- **Rede local direta:** sem servidor STUN/TURN. Os endereços (candidatos ICE) são só os de casa. O Chrome esconde o
  IP local atrás de nomes `.local`: o lançador liga o navegador com `WebRtcHideLocalIpsWithMdns` desligado e, por
  garantia, os candidatos são reescritos com o IP que o canal já conhece.
- **Qualidade automática:** o WebRTC já baixa a taxa se a Wi-Fi piorar. O menu tem Automática/Alta/Média/Baixa.
- **Meta:** 30 a 60 ms de atraso total numa Wi-Fi 5 GHz.

**Escolher quem processa:** na ficha do jogo, no celular, aparecem **▶ Jogar aqui** e **🖥 Jogar no PC (nome)**. O PC
abre o mesmo jogo. Ele procura pelo CRC/nome na biblioteca dele; se não tiver, oferece mandar a ROM pra `Games/` do
PC. Console que o celular não roda (PS2) já vem com "Jogar no PC" como padrão. O ☰ abre um menu do celular por cima:
voltar, qualidade, salvar estado no PC, sair.

## Configuração (tela 📡 Aparelhos, no PC e no celular)

| Seção | Opções |
|---|---|
| Este aparelho | nome ("PC do Marcelo"), visível na rede (sim/não) |
| Parear | PC: mostrar QR + código · Celular: ler QR / digitar código / aparelhos achados na rede |
| Pareados | online/offline, último sync, Sincronizar agora, Jogar nele (celular → PC), Remover |
| Sincronização | automática (sim/não) e o que vai (Saves, Estados, Estatísticas, Configurações, BIOS, Jogos por console) |
| Transmissão | qualidade (auto/alta/média/baixa), ampliação (2x/3x), som no PC durante a transmissão |

Arquivos: a identidade e os pareados ficam **fora da pasta Kof Games**: no PC em `~/.local/share/KOFnes/rede/` ou
`%LOCALAPPDATA%\KOFnes\rede\` (`identidade.bin`, `pareados.txt`, `config.txt`), e no celular nas preferências do app.
Assim, copiar a pasta Kof Games pra outro PC não copia a identidade. A base do sync de cada par fica junto (etapa 2).

O **celular como controle** de hoje continua funcionando como está. Depois ele passa pro canal novo e deixa de
precisar de IP e senha.

## Etapas e testes

| Etapa | Entrega | Teste aqui | O Marcelo testa |
|---|---|---|---|
| 1 ✅ (branch `rede`, 26/10) | kofservico + achar na rede + pareamento QR/código + tela Aparelhos (APK novo: câmera, CASCA 14) | dois navegadores + kofservico + o lado do celular em Java/JNI no Linux (como o teste do controle) | parear o celular com o PC |
| 2 | Saves/Config em arquivo + sincronização | duas pastas Kof Games de teste, conflitos, apagar, arquivo grande | jogar no PC, continuar o save no celular |
| 3 | Jogar no celular pelo PC (vídeo, som, botões, qualidade, reconectar) | dois navegadores com WebRTC na mesma máquina, atraso medido pelo ping | jogar no celular com o PC processando |
| 4 | depois: TV box/outro PC como aparelho, controle no canal novo, jogar fora de casa (precisa de servidor na internet: outra conversa) | | |
