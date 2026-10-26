# KOFstation (antigo KOFnes) — contexto pra próxima sessão

## ⏩ ONDE PAROU (25/10, fim do chat longo; leia isto primeiro)
- **main publicada: versão 202610260305 (tela "🔑 BIOS dos consoles": card no Início + Arquivo, um botão por console, a do PS2 aceita qualquer nome pelo conteúdo 4–8 MB + ROMDIR; erro com BIOS tem atalho; PS2 pelo PCSX2 nativo no Linux, LANCADOR=6), CASCA 13, lançador 10 (exe) / LANCADOR=5 (kofnes.sh)** (26/10: PS2 no PC + controle 2; publicado com `COMPILAR=web/compilar-sem-kof.sh web/publicar.sh`, sem o compilador Kof, porque snes/ e os núcleos não mudaram; precisa do `nucleo-libretro/saida/play.js` do `nucleo-ps2/construir.sh`) (repositório agora é `Marcelao98/KOFStation`; o nome antigo redireciona).
  Na main: N64 (PC wasm + celular nativo), PS1 nativo, analógico (N64/PS1), saves no banco + backup `.kofsave`, celular
  como controle do PC, busca por gênero/empresa, pasta de ROMs no APK, painel de desempenho (F3), **SNES do PC = Snes9x**
  (Kof como opção em Emulação). Detalhes de cada um nas notas abaixo.
- **Aberto / a fazer, nesta ordem:**
  0. **ATUALIZAÇÃO 25/10 (última mensagem do chat): o Marcelo disse "deu certo, muito foda"** logo depois de receber as
     instruções do controle: tudo indica que o **celular como controle conectou**. Confirmar com ele no começo do chat novo
     antes de mexer no item 2; se estiver ok, o próximo é o que ele pedir (Fase 3 sync, PS2, motor novo...).
     Antes: **PRIORIDADE (Marcelo, 25/10): consertar o celular como controle (item 2).** Depois da 1ª parte da otimização ele
     disse que **já está rodando liso**: o motor novo (item 1) fica pra depois, só se ele pedir.
  1. **Lentidão (prioridade do Marcelo, "tem que rodar liso, PC e celular, todos os consoles"):** 1ª parte feita (painel,
     rebobinar sem cópias, Snes9x no PC). Esperando ele mandar print do painel (F3) no PC e no celular. Próximo = **motor
     novo**: emulação num Web Worker + som por **AudioWorklet** ditando o ritmo (hoje `ScriptProcessorNode` 2048 a 32 kHz na
     linha principal, `ligarSom()` no app.js, e o laço é `laco()` com rAF); depois recompilar núcleos com `-flto -msimd128`.
     Nativo no celular pro SNES etc. só se ainda não ficar liso (perde filtros/molduras). Medir com
     `/tmp`-style script: Playwright + `Emulation.setCPUThrottlingRate` 4 ≈ celular médio; `KOFnes.desempenho()`.
     Cuidado: engasgos no container com janela grande são do SwiftShader (placa imitada), teste com janela pequena.
  2. **Celular como controle: FUNCIONOU no aparelho dele (25/10, vídeo: celular controlando o PC ligado na TV).** Conserto publicado na 202610251829. Feito: (a) `ControleServidor`
     responde GET com a página "✅ Celular achado" (e OPTIONS com `Access-Control-Allow-Private-Network`); (b) o PC explica
     na 1ª falha (`explicarFalhaControle`: link http://ip:porta, mesma Wi-Fi, e se a permissão `local-network-access`
     está negada); (c) celular mostra o link de teste e avisa se o IP não é de rede de casa (`casa` no JSON; `ipLocal`
     agora prefere endereço 192.168/10/172.16 a um do 4G); (d) exe e kofnes.sh abrem o navegador com
     `--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests`. Se ainda falhar: perguntar o que
     aparece em http://ip:porta no navegador do PC; WebRTC só se precisar. Histórico do diagnóstico:
     **Celular como controle NÃO conectou no aparelho dele** (mensagem exata desconhecida). Suspeitas: o "Acesso à rede
     local" novo do Chrome/Edge bloqueando a página file:// de falar com 192.168.x.x (mais provável); roteador isolando
     clientes; IP errado (4G/VPN). Plano combinado: (a) ControleServidor responder GET http comum com página "✅ achado"
     (pedi pra ele testar `http://<ip>:8642` no navegador do PC), (b) mensagens de erro específicas no PC, (c) celular avisar
     se não está na Wi-Fi, (d) lançador (`kofnes.sh`/exe) abrir o navegador liberando a rede local só pra janela do
     KOFstation, (e) WebRTC só se precisar.
  3. "Não atualizou direto" (última mensagem dele, incompleta): conferir se o `kofnes.sh` do Linux dele pegou a versão
     202610251737 (pedir o que aparece / o log). Ele migrou pro **Linux** (Fedora ou parecido; não tem apt).
  4. Depois: **Fase 3** (sincronizar saves/estatísticas pela conexão do controle; resolver chave do save do PS1 PC × .mcd
     do celular).
  5. **PS2 no PC: PUBLICADO (202610252216); falta o Marcelo testar com jogo de verdade.** Ver a nota
     "PlayStation 2" abaixo. Publicar = `publicar.sh` (lançador 10 / LANCADOR=5 levam a opção do navegador).
  6. **Controle 2: PUBLICADO (202610252216); CASCA 13, APK novo em android/apk.** O PC manda `JOGO <sis>\t<nome>`
     (texto, depois do `ok`; `contarJogoAoControle` no fim do `abrirBytes` e ao conectar); `ControleServidor.jogo` +
     `controleEstado` = `n\tnomePc\tsis\tjogo` (a página aceita o "n|nome" antigo); o celular troca o controle
     (`consoleDoControle`: data-sis, so-ab, analógico puro no N64, `rotularControle`; ps2 usa o do ps1) e mostra a "telinha"
     console + jogo. **Senha fixa por celular** (prefs `controle`/`senha`) e o PC religa sozinho (`controleAuto`,
     `conectarControle(t, silencioso)`: tenta quieto a cada 5 s). IP/senha só até o 1º pareamento
     (`kofnes.controlePareado` no celular) ou no ⓘ. Cores por console no modelo clássico (PS ✕○□△, MD preto, Neo Geo, N64,
     NES, GB/GBA). Teste: `testes/android/controle.cjs` (ROMs de MD e NES geradas no teste). `testes/montar-sem-kof.sh <pasta>`
     monta os 2 html sem Kof/emscripten; APK: `.so` tiradas do APK anterior pra `android/nativo/lib/arm64-v8a/` + apt
     (aapt apksigner zipalign libandroid-23-java dalvik-exchange android-sdk-platform-23) + `android/construir-apk.sh`.
  7. **Ideias de negócio (26/10, só conversa):** vender TV box (homologada Anatel) pintada com o KOFstation, sem jogos
     (só homebrew com autorização escrita do autor). O nome KOFstation FICA (Kof é a linguagem da Mel, parceira). Pra
     versão vendida: trocar os núcleos só não comerciais (Snes9x, Genesis Plus GX, FBNeo) por Geolith (Neo Geo, BSD-3,
     tem libretro), Gearsystem/BlastEm ou ares (SMS/GG/MD) e o núcleo Kof (SNES, otimizar); pôr licença GPL-3 no projeto.
     Próximo se ele pedir: Geolith primeiro; depois app de TV (leanback, controle remoto, controle Bluetooth).
     Também: **comércio com sala de espera** (barbearia, lava-jato, oficina): aluguel mensal da box; "modo comércio" (tela
     travada só com os jogos liberados, volta pra tela de apresentação parada, logo/promoções da loja entre partidas) e o
     **celular do cliente como controle por QR code, sem instalar nada** (precisa de uma página de controle no navegador,
     servida pela própria box; hoje o controle exige o APK). Hardware barato combinado: TV box primeiro, depois Orange Pi
     Zero 3 com versão nativa leve. Jogos em comércio: SÓ homebrew com autorização (exibição pública agrava).
     **Fliperama de bar com jukebox** (um amigo dele monta gabinete): comando/botões por placa USB "zero delay" (vira
     controle comum), moedeiro = um botão "ficha"; ideia de software: modo fliperama (créditos, tela de atração, ranking de
     recordes do bar, contador do que rendeu), Pix depois (Mercado Pago/PagSeguro). Jukebox de bar: música de verdade só
     com licença (ECAD é do bar; Spotify proíbe uso comercial) → domínio público + artistas locais autorizados. Nunca dar
     prêmio (vira jogo de azar). Modelo: dividir as fichas com o dono do bar.
     **Loja de jogos indie dentro do KOFstation** (ideia 26/10): devs de homebrew/retrô novo vendem pela loja, divisão de
     receita (tipo 70/30 pro dev), jogos licenciados travados pra rodar só no KOFstation; Pix. Começar com vitrine grátis.
- **N64 e PS1 nativos ainda sem teste de jogo de verdade confirmado pelo Marcelo** (o PS1 voltou a abrir depois do
  conserto de 25/10; o N64 recebia "failed to read rom", corrigido na casca 7 entregando a ROM na memória).
- Ambiente desta sessão (some no container novo): Kof4j em `/home/user/Kof4j`, núcleos compilados em
  `nucleo-libretro/saida/` (fora do git), libs nativas em `android/nativo/lib/` (fora do git; `android/nativo/construir.sh`
  baixa do LemuroidCores). ROMs livres: PeterLemon SNES/N64/PSX, cubo do PS1 montado com genisoimage.

> **PS2 pelo PCSX2 NATIVO no Linux (26/10, PUBLICADO 202610260240; falta o Marcelo testar com a BIOS dele):** o Play! falhou
> no Shadow of the Colossus (CompileError do gerador de wasm do Play!; `nucleo-ps2/codegen-kof.patch` faz o erro trazer o
> bloco em base64). Agora: `pc-nativo/kofnativo.c` (C + SDL2 estático + OpenGL 3.3) carrega o núcleo **LRPS2**
> (github.com/libretro/ps2, PCSX2 libretro, GPL-3, commit 38d3a83f) numa janela própria em tela cheia por cima da página;
> WebSocket em 127.0.0.1:8643 (protocolo no topo do .c): `abrir <tam> <nome>` e o DVD vem da página aos pedaços (VFS
> `kof://disco/...`, blocos de 1 MB com cache), BIOS (`bios-ps2.bin`, 4 MB, loja `bios`; SISTEMAS.ps2.bios opcional),
> pasta de saves inteira num pacote (`ps2/pcsx2` no banco), savestate (`estado`/'E', `carregar`), teclado (`teclas`),
> pad/celular (`pad`), filtro = o shader da página convertido pra GLSL 3.30 (`filtro`/`uni`), Esc/F1/Guide na janela =
> `pausou` (a página pausa; voltar ao jogo = `mostrar`). Página: `web/ps2.js` (`conectarNativo`, `fachadaNativa`, nucleo
> 'pcsx2'; sem kofnativo cai no Play!). `pc-nativo/construir.sh` (SDL2 2.30.9 estático + LRPS2) -> `pc-nativo/saida/`;
> `publicar.sh` leva pra `publicado/nativo/` (`kofnativo-<hash>`, `pcsx2_libretro-<hash>.so.gz`) e escreve `nativo_linux=`
> no versao.txt; **kofnes.sh LANCADOR=6** baixa, descompacta em `~/.local/share/KOFnes/nativo/`, abre o kofnativo antes do
> navegador e mata quando o navegador fecha; flags novas contra "segundo plano lento". Teste:
> `xvfb-run -a node testes/navegador/ps2-nativo.cjs <html> pc-nativo/saida/kofnativo pc-nativo/saida/pcsx2_libretro.so <iso>`
> (sem BIOS de verdade: confere conexão, BIOS indo, erro na tela e filtro compilando). Windows: ainda não (falta compilar
> LRPS2 + kofnativo pro Windows e o lançador_win abrir). Cuidado: `pkill -f`/`pgrep -f` com o nome casam o próprio shell. **BIOS:** o LRPS2 procura a BIOS só no retro_init: o kofnativo
> passa `pcsx2_bios=<arquivo>` (a tabela de opções tem 512 lugares; com 64 a opção da BIOS ficava de fora). Teste com BIOS falsa
> (`KOF_BIOS=bios-falsa.bin`: romdir RESET/ROMDIR/EXTINFO/ROMVER) chega no "pronto" (disco lido, OpenGL ligado) e depois cai
> (o RetroArch cai igual com ela: é a BIOS falsa).

> **PlayStation 2 (branch `ps2`, 25/10, não publicado):** núcleo **Play!** (github.com/jpd002/Play-, BSD-2, commit 505dac73)
> em WebAssembly, só no PC. `nucleo-ps2/construir.sh` (emscripten **4.0.1** do emsdk, cmake + ninja; ~15 min na 1ª vez)
> aplica `nucleo-ps2/play-kof.patch` (Main.cpp: `setPad(máscara libretro, 4 eixos int8)` por um provedor de entrada
> "cru", `pauseVm`/`resumeVm` SEM esperar a thread da máquina (o Pause/Resume normal trava: a máquina espera a linha
> principal ler o DVD), `saveState/loadState/estadoPronto` (arquivo no disco virtual, feito na thread da máquina),
> `setVolume` (OpenAL); CMake: `SINGLE_FILE`, sem ES6) e grava `nucleo-libretro/saida/play.js` = o código numa string
> (`KofPlayCodigo`, `Nucleo_play()`): numa página file:// os Workers das threads não abrem arquivo, então `web/ps2.js` faz
> um Blob e passa como `mainScriptUrlOrBlob`. **SharedArrayBuffer em file://**: só com o navegador aberto com
> `--enable-features=SharedArrayBuffer` (testado: funciona sem isolamento e sem localhost, então o banco/saves continuam
> os mesmos); lançador **10** (exe) e **LANCADOR=5** (kofnes.sh) passam a opção; sem ela o app avisa pra abrir pelo
> lançador. `web/ps2.js` entra por dentro do app.js só no html do PC (juntar.py, quando existe o play.js; o celular não
> leva o play): fachada igual aos nativos do celular (`nativo: true`; o canvas `#outputCanvas` 640x480 do Play! fica por
> cima do `#tela`; sem runFrame por 250 ms = pausa e some), `ehPs2` (.elf/.cso/.isz; .iso/.img pelo SYSTEM.CNF com BOOT2;
> .chd > 900 MB), DVD lido aos pedaços do File (`discImageDevice`, nada vai pro banco de ROMs; da biblioteca reabre pela
> pasta de ROMs, `ps2Jogo`), savestate assíncrono (`estadoAsync/restaurarAsync`; app.js usa `capturarEstado/
> restaurarEstado`; ~135 KB no teste), cartão de memória = pasta `vfs/mc0` inteira num save só `ps2/mc0` (vai no
> `.kofsave`; guardado ao pausar, a cada 30 s e ao fechar). BIOS não precisa (o Play! imita). Sem filtros/molduras/capa
> (a imagem não passa pelo WebGL do app). Teste: `testes/navegador/ps2.cjs` com o cube.elf dos exemplos do ps2sdk
> (toolchain pronto: github.com/ps2dev/ps2dev releases `ps2dev-ubuntu-latest.tar.gz`, `make` em samples/draw/cube) e o
> DVD de `testes/ps2/montar-dvd.py` (pycdlib): ~60 fps no SwiftShader. Montar o html sem Kof: extrair o KofNucleo do
> `publicado/KOFstation.html` como Default.mjs + runtime vazio, núcleos de `publicado/nucleos/` sem o hash + play.js.

> **Nome:** desde 19/10 o produto se chama **KOFstation** (SNES + Game Boy). O que o usuário vê, o README, o APK
> (`android/apk/KOFstation.apk`, rótulo do app) e os pacotes (`dist/KOFstation-windows.zip`/`-linux.tar.gz`) usam o nome novo.
> **De propósito ficaram com o nome antigo** (trocar apagaria dados ou travaria a atualização de quem já usa):
> `KOFnes.exe`/`KOFnes.html`/`kofnes.sh` (o atualizador do lançador 5 baixa esses nomes de `publicado/`), o perfil do Edge
> `%LOCALAPPDATA%\KOFnes` e o banco `kofnes` + chaves `kofnes.*` do navegador (saves, biblioteca, músicas), o pacote do APK
> `dev.kofnes.android` (trocar = app novo, sem os dados) e o repositório `Marcelao98/KOFSnes`. Nomes internos de código
> (`window.KOFnes`, `KOFnesApk`, `KOFnes-android.html`) também ficaram.
> **Lançador 6 (publicado 19/10):** o exe agora é `KOFstation.exe` e abre `KOFstation.html`; se acha os arquivos com o nome antigo,
> renomeia sozinho (`KOFnes.exe`→`KOFstation.exe`, `KOFnes.html`→`KOFstation.html`). O perfil do Edge continua em
> `%LOCALAPPDATA%\KOFnes`. `publicar.sh` publica os dois nomes (`KOFstation.*` pro 6 e `KOFnes.*` pros lançadores antigos
> e pro `kofnes.sh` do Linux, que segue com o nome antigo). Testado no Wine (renomeia e atualiza).
> **Cores do Game Boy:** a ponte responde `GET_VARIABLE` (`lr_var`, `KofLibretro.opcao(núcleo, {chave: valor})`); menu
> Imagem e menu rápido (só no GB) têm a paleta dos jogos de Game Boy original: automática (paletas do GBC por jogo, reserva
> "GBC - Dark Green", padrão), verde (DMG) ou cinza (`kofnes.paletaGb`).
> **NES (branch `nes`, 19/10):** núcleo **FCEUmm** (`construir.sh fceumm`, GPL-2) em WebAssembly, sem reescrever nada. A ponte
> agora entrega a ROM pela memória (`RETRO_ENVIRONMENT_GET_GAME_INFO_EXT`; sem isso o FCEUmm tenta abrir arquivo e trava no
> 1º quadro). `.nes` (256x240, o app corta 8 linhas em cima e embaixo → 256x224; 4:3 "como na TV" via `tv43`), título =
> "NES " + CRC32 da ROM sem cabeçalho, botões A/B/Start/Select (classe `body.so-ab` no `android.css`, vale pro GB também),
> paletas no menu Imagem/menu rápido (`kofnes.paletaNes`: default, composite-direct-fbx "TV de tubo", wavebeam "Viva").
> Jukebox: 5 canais (Pulso 1, Pulso 2, Triângulo, Ruído, DPCM) pelo remendo `nucleo-libretro/fceumm-sonda.patch` (cada
> canal em volta da escrita no `WaveHi`; precisa do som em alta qualidade: `fceumm_sndquality=High`, padrão do sistema no
> `nucleo.js`). Capas oficiais por sistema (`ACERVO`/`capaSis` no app.js: SNES, NES, GB, GBC). Áudio do FCEUmm é 48 kHz.
> Famicom Disk System (.fds, BIOS disksys.rom) ficou pra depois. HTML do PC ~3 MB (o carregamento de núcleo sob demanda é
> o próximo passo). ROMs de teste livres: christopherpow/nes-test-roms (cpu_timing_test passa) e uma de som gerada.
> **Mega Drive, Master System e Game Gear (branch `sega`, 19/10):** núcleo **Genesis Plus GX** (`construir.sh genplus`, só uso
> NÃO comercial; compilado com `HAVE_CHD=0`, sem Sega CD) EMBUTIDO no html (decisão do Marcelo: separar núcleos em arquivos só
> quando vierem os pesados, Neo Geo/PS1). Sistemas `md` (.md .gen .smd .bin, 320/256x224, resolução **dinâmica**: o
> `nucleo.js` troca `largura/altura/rgba` e o `desenhar()` chama `tamanhoTela`), `sms` (.sms, 256x192, dinâmico) e `gg`
> (.gg, 160x144, proporção 10:9). O núcleo escolhe 3 ou 6 botões sozinho; mapa: SNES Y/B/A = MD A/B/C, L/X/R = X/Y/Z,
> Select = Mode; SMS/GG: B = 1, A = 2. Controle virtual com nomes por console (`rotularControle` no android.js, chamado no
> `abrirBytes`) e o MD em duas fileiras de 3. Sonda (`nucleo-libretro/genplus-sonda.patch`, cuidado: `ym2612.c` tem quebra
> de linha CRLF): 10 canais (0-5 FM, 6-9 PSG) a ~26,6 kHz, cada canal com posição própria (`kof_ondaPosC`,
> `lr_onda_pos_c`); `SISTEMAS[x].indices` diz quais canais o sistema usa. Mudo/solo do genplus = opções de volume por canal
> do núcleo (`genesis_plus_gx_md_channel_N_volume`/`psg_channel_N_volume`), só na instância da jukebox. HTML do PC ~6,7 MB,
> do celular ~10,7 MB. ROMs de teste: geradas (68000 e Z80 escritos à mão: cor + FM + PSG); o 240p Test Suite só tem fonte.
> **20/10 (fim):** KOF RODOU no KOFstation (Neo Geo, testado pelo Marcelo). Versão publicada 202610200139: o zip de Neo Geo é
> reconhecido também pelo conteúdo (`KofNeoGeoCrc`/`setNeoGeoDoZip`), qualquer nome. Próximo: ele vai jogar/testar tudo e trazer bugs.
> **PUBLICADO 20/10 (versão 202610200121, lançador 7):** main = `neogeo` (Sega + núcleos separados + GBA + Neo Geo). Testado
> no Wine baixando do GitHub de verdade: o lançador 6 troca html+exe, o 7 baixa os 5 núcleos na abertura seguinte. O Marcelo
> é praticamente o único usuário: pode publicar sem medo quando ele pedir.
> **Núcleos separados (branch `nucleos`, 20/10, FEITO, não publicado; o Sega vai junto quando ele mandar publicar):**
> `web/nucleo.js` tem `ARQUIVOS` (o juntar.py troca `/*{{NUCLEOS}}*/ {}` pela lista `{núcleo: 'nucleos/<núcleo>-<hash8>.js'}`)
> e `buscar(n)` põe um `<script src>` só ao abrir um jogo daquele console (erro: "faltou baixar o núcleo do <console>...").
> `juntar.py` grava `dist/web/nucleos/<núcleo>-<sha256[:8]>.js` e, com `KOFNES_LISTA`, a lista arquivo:tamanho. versao.txt
> termina com `nucleo=<arquivo>:<tamanho>` (só os do PC). HTML do PC 615 KB, do celular 658 KB. Zip/tar levam `nucleos/`
> (só PC); PWA (`dist/web/android/`) leva todos e o sw.js recebe a lista + cache por build; APK leva `assets/nucleos/`;
> `publicar.sh` refaz `publicado/nucleos/`. **Lançador 7** (`lancador_win.c`): `fonte.txt` do lado do exe (caminho do
> GitHub `/dono/repo/branch/publicado/` ou URL inteira `http://127.0.0.1:8765/publicado/`; com outro servidor pula o
> curl), baixa os núcleos que faltam/tamanho errado ANTES do html (faltou um = html não troca), apaga os fora da lista (só
> se o navegador ainda não abriu). **kofnes.sh LANCADOR=2** igual (+ `fonte.txt`/`KOFNES_URL`). Testado no Wine com
> servidor local: pasta nova, núcleo corrompido, núcleo velho, núcleo faltando no servidor, lançador 6→7 (o 6 troca html
> e exe; o 7 baixa os núcleos na abertura seguinte). Testes: `testes/navegador/nucleos.cjs` e `testes/android/apk-simulado.cjs`
> (agora serve `nucleos/` como a Activity). ROM de Mega Drive gerada: vetores + "SEGA" em 0x100 + VDP cor de fundo.
> Engenharia toda explicada em `docs/arquitetura.md`.
> **GBA (branch `gba`, saindo da `nucleos`, 20/10, não publicado):** núcleo **mGBA** (`construir.sh mgba`, MPL-2.0; é CMake:
> as sondagens de função do CMake mentem no emscripten, então `HAVE_POPCOUNT32/PTHREAD_H/SNPRINTF_L=0` à mão, e o libretro
> dele só compila com `M_CORE_GB` ligado). Sistema `gba` (.gba, 240x160, 3:2, 59,73 fps, áudio 65.536 Hz; botões A/B/L/R/
> Start/Select; título = 12 letras em 0xA0). **BIOS**: loja `bios` no IndexedDB (banco v7), Arquivo > BIOS… (`escolherBios`,
> reconhece pelo nome/tamanho via `SISTEMAS[x].bios`), `KofLibretro.bios(núcleo, arquivo, bytes)` grava em `/sistema/` pela
> `lr_arquivo` da ponte antes do jogo; a do GBA é opcional (o mGBA imita a BIOS). A ponte também tem `lr_apagar` e aceita
> `lr_load` com ROM nula (jogo já no disco virtual `/jogos`, pro Neo Geo). Save enxuto: a bateria vai pro localStorage sem
> o fim de 0xFF (o do GBA tem 128 KB) e volta como 0xFF. Sonda: `nucleo-libretro/mgba-sonda.patch` (6 canais: 4 PSG + Direct
> A/B, 32.768 Hz; mudo pelo `forceDisableCh` do mGBA). Controle virtual: `so-ab` esconde X/Y, mas o GBA mostra L/R. Suíte do
> jsmolka: memory passa; arm 522 e thumb 230 falham (STM com o registrador base no meio da lista: caso raríssimo, jogo
> comercial não usa). Testes: `testes/navegador/gba.cjs`, `nucleos.cjs` (6º argumento .gba) e `testes/libretro/jukebox.cjs`
> com uma ROM de GBA com som (gerada: escreve nos registradores de som e trava num laço).
> **Neo Geo (branch `neogeo`, saindo da `gba`, 20/10, não publicado; o Marcelo aprovou a `gba` e vai testar as duas):**
> núcleo **FBNeo** `SUBSET=neogeo` (`construir.sh fbneo`: `make generate-files` gera a lista de drivers só do Neo Geo; zlib
> interno; ~8 MB). Zip reconhecido pelo nome em `web/neogeo-jogos.js` (697 jogos, `nucleo-libretro/lista-neogeo.py` do
> `gamelist.txt` do FBNeo; o juntar.py embute antes do nucleo.js) e aberto INTEIRO: `/jogos/<set>.zip` (+ zip do pai, achado
> na biblioteca/pasta por `zipsDoPai`), BIOS em `/sistema/neogeo.zip`, `lr_load(0, 0, caminho)`, apaga os zips depois.
> Banco v7 da `gba` já tem a loja `bios`. Tela `#bios-tela` (pagina.html) quando falta a BIOS; escolhida, abre o jogo que
> esperava (`biosEsperando`). `fbneo-neogeo-mode=AES_EUR` (se falhar, tenta `DIPSWITCH`; o FBNeo também cai sozinho pra
> outra BIOS). Driver que não inicia = FBNeo "abre" com a tela de erro (640x480, estado 0): o adaptador trata como falha e
> mostra a linha do log (`m.kofLog`) ou "precisa também do <pai>.zip". O tamanho do estado do FBNeo muda depois do 1º
> quadro: `serializar` relê o tamanho se falhar. Restaurar estado não é bit a bit (6 campos do ADPCM-A recalculados ao
> carregar). Sonda `nucleo-libretro/fbneo-sonda.patch`: 14 canais a 8 MHz/144, posição por canal. Botões: A/B/C/D = B/A/Y/X
> do SNES, Ficha = Select; `ROTULOS.neogeo` no android.js. **Bug antigo corrigido:** `rotularControle` estava presa dentro do
> IIFE do android.js (os nomes A/B/C do Mega Drive nunca apareciam): agora vai pelo `window`. Teste sem BIOS nem jogo:
> `testes/neogeo/zip-falso.py` (nomes e CRCs do d_neogeo.cpp, conteúdo zerado com 4 bytes ajustados pro CRC) +
> `testes/navegador/neogeo.cjs`. Jogo de verdade só o Marcelo testa.
> **Decisões de 19/10 (fim do dia):** (1) Sega testado pelo Marcelo (Sonic ok), branch `sega` AINDA NÃO publicada (perguntar).
> (2) Próximo: branch `nucleos` (criada a partir da `sega`, sem mudanças ainda) = **núcleos em arquivos separados**:
> `dist/web/nucleos/<núcleo>-<hash8>.js` (nome com hash do conteúdo, o html leva a lista exata; carrega com `<script src>`
> só ao abrir um jogo daquele console; SINGLE_FILE continua, porque `fetch` de .wasm em file:// é bloqueado), juntar.py
> para de embutir e embute só a lista; **lançador 7** (Windows): lê linhas `nucleo=<arquivo>:<tamanho>` do versao.txt,
> baixa pra `nucleos\` o que falta ANTES de trocar o html, confere tamanho, apaga núcleo velho; `fonte.txt` opcional ao lado
> do exe troca o caminho do GitHub (pra testar uma branch no Wine); `kofnes.sh` (Linux, LANCADOR=2) faz o mesmo; APK leva
> `assets/nucleos/`; PWA também; publicar.sh copia `publicado/nucleos/`. Lançadores antigos baixam o html novo e o exe 7;
> na abertura seguinte o 7 baixa os núcleos (o app mostra "faltou baixar o núcleo..." se faltar). Depois: escrever
> `docs/arquitetura.md` explicando toda a engenharia pro Marcelo (camadas, libretro, WebAssembly, ponte, adaptador,
> determinismo, áudio, vídeo, sonda, atualizador, Android, testes, glossário).
> (3) Depois da separação: **GBA** (mGBA, MPL-2.0, BIOS opcional, 6 canais na jukebox; ROMs livres: suíte do jsmolka) e
> **Neo Geo** (FBNeo só Neo Geo; tela de BIOS nova pro `neogeo.zip`, zip de fliperama inteiro num disco virtual MEMFS,
> lista de nomes de sets do FBNeo, modo AES por padrão, botões A/B/C/D + Ficha, YM2610 com 14 canais). Eu NÃO consigo
> testar jogo de Neo Geo (a BIOS não é livre): o Marcelo testa. Neo Geo pesa em memória (ROM até 90 MB).
> (4) **Kof aos poucos:** primeiro tudo funcionando com núcleos libretro; depois reescrever em Kof um console por vez
> (Game Boy → NES → SMS/GG...), usando o núcleo libretro como gabarito quadro a quadro. Gasta bem mais token: ir aos poucos.
> (5) Limites do WebAssembly: até Neo Geo/GBA sobra (Mega Drive ~810 fps no container); PS1 no limite no celular;
> N64/Saturn pra cima = núcleo nativo (DLL + processo auxiliar no PC, nativo no APK), mesma interface.

Emulador de Super Nintendo escrito em **Kof** (linguagem brasileira, github.com/KofLang/Kof4j,
criada pela Mel Santos ~2 meses antes do projeto). Dono: Marcelo (Marcelao98). Repositório:
**Marcelao98/KOFSnes**, branch `main`. A história completa, pra humano, está em `HISTORICO.md`;
o que o produto faz está no `README.md`.

## Como falar com o Marcelo

- Português do Brasil, informal, direto. Ele escreve rápido por voz (muitos erros de digitação:
  "Redmi" = README, "kofnes"/"Coffes Ness" = KOFnes).
- Ele se preocupa com **economia de tokens**: fazer só o que ele pediu, sem varrer coisas à toa
  (ex.: quando pediu "teste só esse jogo", não rodar 300 ROMs).
- Funcionalidade nova grande: **branch novo**, testar, mandar o zip; depois ele pede pra juntar na
  `main` e **publicar pelo atualizador**. Correção/pedido pequeno: direto na `main` + publicar.
- Ele testa no Windows de verdade (KOFnes.exe) e manda prints/gravações com bugs. Ele é quem
  joga; os amigos e a galera do LinkedIn também já usam.

## Regras que não mudam

- **Nunca** commitar, distribuir ou indicar onde baixar ROM (nem em teste, doc ou issue).
- **KOFnes não vai pro repositório natty-bot** (já aconteceu por engano e ele não gostou).
- Commits: mensagem em português, **sem nome de modelo de IA**, terminando com as linhas de
  co-autoria/sessão que o sistema indicar. `git status` antes de commitar.
- Não abrir PR sem ele pedir.

## Estrutura

```
snes/            núcleo em Kof (~5.600 linhas): Cpu.kf (65816), Ppu.kf, Spc.kf (SPC700),
                 Dsp.kf, Apu.kf, CpuBus.kf/Snes.kf (barramento, DMA/HDMA, IRQ), Cartridge.kf
                 (LoROM/HiROM/ExHiROM, SRAM), Gsu.kf (Super FX)
web/             A VERSÃO PRINCIPAL: o núcleo Kof → JavaScript num KOFnes.html só
  app.js         toda a interface (≈1.800 linhas): biblioteca, Início, temas, savestates,
                 rebobinar, jukebox, estatísticas, caçador de bugs, atualizações...
  estado.js      savestate genérico (KofEstado.capturar/restaurar) + Rebobinador (fotos delta)
  spc.js         ler/gravar arquivos .spc (jukebox)
  pagina.html, estilo.css (126 temas por variáveis CSS), juntar.py (monta o HTML)
  compilar.sh    build: kof build --target js → juntar.py → dist/web/KOFnes.html + KOFnes.exe
                 (mingw) + versao.txt + dist/KOFnes-windows.zip
  publicar.sh    compila e copia html/exe/versao.txt pra publicado/ (o atualizador lê de lá)
  lancador_win.c o KOFnes.exe: atualizador (IP que responde + curl.exe; WinINet/WinHTTP de reserva) + abre o html numa janela app do Edge
  kof-js-correcoes.patch  correções no alvo JS do compilador Kof (sem elas o núcleo quebra)
publicado/       a versão que o KOFnes.exe dos usuários baixa (raw.githubusercontent.com)
bugs/reproduzir.cjs  roda um pacote do caçador de bugs (kofbug-*.json.gz) quadro a quadro
testes/          scripts de teste (Playwright e Node), ver testes/README.md
docs/            como-o-snes-funciona.md, relatórios dos bugs do Kof, kof-repros/, issues/, prints/
app/, empacotar/, nativo/  versões antigas: Java (instalador) e nativa Linux só em Kof
                 (~22 fps) — hoje são laboratório da linguagem, não recebem funcionalidades
```

## Montar o ambiente (o container da nuvem perde tudo fora do repositório)

1. Compilador Kof 0.6.3 **com o patch**: clonar github.com/KofLang/Kof4j, `git checkout
   kof-0.6.3-linux-x86_64`, aplicar `web/kof-js-correcoes.patch` (mexe em 5 arquivos de
   `kof-compiler/src/main/java/dev/kof/compiler/js/`), recompilar e atualizar o `lib/kof.jar`
   (na sessão anterior: compilar as classes alteradas com javac e trocar dentro do jar com
   `jar uf`; Maven com JAVA_HOME num JDK 25 também serve). Depois:
   `export PATH=<Kof4j>/bin:/usr/lib/jvm/java-25-openjdk-amd64/bin:$PATH`.
2. `web/compilar.sh` precisa de python3 (PIL só pros prints) e `x86_64-w64-mingw32-gcc` pro .exe.
3. Testes: Playwright/Chromium já vêm no container (`/opt/node22/...`, `/opt/pw-browsers`);
   WebGL headless com `--use-gl=swiftshader --enable-unsafe-swiftshader`. O `.exe` dá pra testar
   com Wine (`/usr/lib/wine/wine64`, WINEPREFIX numa pasta temporária).
4. ROMs livres pra teste: github.com/PeterLemon/SNES (CPU, PPU/Mode7, SPC700/FFVIIPrelude
   tem música). Nunca subir ROM pro git.

## Como as coisas funcionam (o que costuma importar)

- O núcleo é **determinístico**: savestate restaura bit a bit; o rebobinar e o replay do caçador
  de bugs dependem disso (teste: `testes/node/rebob.cjs`, `replay.cjs`).
- Banco do navegador: IndexedDB `kofnes` versão 6 — lojas c, jogos (metadados e prints), roms,
  autos (estado automático), estados (savestates gzip), capas, stats, musicas. Mudou o formato?
  subir a versão e migrar no `onupgradeneeded` (já tem migração v4→v5).
- Telas: `#home`, `#biblioteca`, `#estados`, `#jukebox`, `#estatisticas`, `#guia`, `#teclas`;
  o jogo pausa com qualquer uma aberta; histórico do Voltar por MutationObserver nelas.
- Biblioteca com milhares de ROMs: lista em lotes de 150, pasta lida 1x por sessão em segundo plano.
- Atualizador: `publicado/versao.txt` tem `versao=AAAAMMDDHHMM`, `tamanho=`, `lancador=`,
  `tamanho_exe=`. O exe compara com o `versao.txt` local, baixa, confere tamanho/cabeçalho,
  troca, e anota tudo em `atualizacao.log` ao lado do exe. `LANCADOR` no `lancador_win.c`
  (hoje 5) controla a troca do próprio exe; `lancador_linux=` e `tamanho_linux=` fazem o mesmo pro kofnes.sh.

> **Abertura (branch `abertura`, 20/10, não publicada):** `#abertura` (pagina.html) na primeira vez (só se a biblioteca
> está vazia; `kofnes.boasVindas`; Ajuda > Boas-vindas reabre; em navegador automatizado só aparece com `window.__kofAbertura`):
> título -> frases -> 10 temas nostálgicos passando (`AB_TEMAS`, só experimenta) -> apresentação -> guia de 4 passos (jogos,
> BIOS, tema, dicas). Música própria em 8 bits (`web/musica.js`, `KofMusica`: 2 pulsos + triângulo + ruído a 32 kHz, tocador
> com a cara dos da jukebox): Air (Bach, notas do .ly de domínio público do Mutopia em `web/musicas/`, `air-midi.py` ->
> `air.json`, o juntar.py embute) na abertura e "Se Essa Rua Fosse Minha" (da partitura de domínio público que o Marcelo mandou, MuseScore,
> arranjo Daniel Pynkus, em `RUA.melodia`) no Início; toca como faixa interna da jukebox (`juke.interna`, loop, sem mini-player), para ao abrir jogo ou a
> jukebox; Som > "Música no Início". `.so-cel` agora some no PC pelo estilo.css. Teste: `testes/navegador/abertura.cjs`.
> **Trilha no som do Mega Drive (mesma branch):** `web/musicas/fm/trilha.py` transforma partituras (texto `nota:duração`) +
> acordes + instrumentos FM desenhados lá numa lista de comandos por música (YM parte I/II, PSG, espera N quadros, marca/volta
> loop); saída `web/musicas/trilha.js` (`KofTrilha`, campo `cmd` em base64; as 5 brasileiras somam ~16 KB). Quem toca é o
> **núcleo só de som** `nucleo-libretro/somfm.c` (`construir.sh somfm` -> `saida/som/somfm.js`, **82 KB**): YM2612 + PSG +
> blip_buf do Genesis Plus GX com a sonda, sem 68000/Z80/vídeo; `web/somfm.js` (`KofSomFm.tocador(cmd)`, mesma cara dos
> tocadores da jukebox, 10 canais, mudo por `config.md_ch_volumes`/`psg_ch_volumes`); o juntar.py embute os dois no html
> (não baixa o Genesis Plus GX de 3,8 MB). Som conferido contra o núcleo inteiro (mesmo volume, envelope 0,98). Sem o núcleo
> de som, cai pro 8 bits (`musica.js`, só air/rua). `trilha.py --rom <pasta>` ainda grava as ROMs de Mega Drive (tocador em
> 68000 `fm/tocador.s` -> `tocador.bin` em 0x200, comandos em 0x800), idênticas às de antes. Músicas: air, rua, guarani,
> ticotico, abrealas, balao. O Marcelo NÃO gostou do Air em FM: o **Air toca em violino de verdade** (File:Air.ogg do
> Wikimedia, The USAF Strings / United States Air Force Band, domínio público; o Marcelo mandou o arquivo) em
> `web/musicas/air-violino.opus` (Opus 40 kbps, ~1 MB, era 3,6 MB). O juntar.py transforma em `nucleos/violino-<hash>.js`
> (`KofViolino` em base64, entra na lista `nucleo=` do versao.txt: o lançador 7/kofnes.sh baixam, APK/PWA levam);
> `carregarViolino`/`tocadorViolino` no app.js (decodifica com `OfflineAudioContext` a 48 kHz, 2 canais Esquerda/Direita nas
> Ondas, loop). Vale pra abertura, Início e jukebox; sem o arquivo, cai pro Air em 8 bits. O Air em FM só sai no `--rom`.
> Início: escolha em Som e no rodapé do Início (`INICIO`, `kofnes.musicaInicio`: id, 'sortear' ou '0'); só toca depois do
> 1º toque/tecla (`houveGesto`). Jukebox: as 6 aparecem como "🎵 Trilha do KOFstation" (`juke.lista` com `trilha`,
> sem renomear/apagar), com Ondas dos 10 canais e exportar .wav. Teste: `testes/navegador/trilha.cjs`.
> **Visual (branch `visual`, 20/10, não publicada):** (1) **Patches de tradução** `web/patch.js` (`KofPatch.aplicar`: IPS, BPS,
> UPS; BPS/UPS conferem CRC; ROM de SNES com cabeçalho de 512 funciona; conferido byte a byte contra o Flips): abrir/arrastar
> o patch (ou zip com ele) aplica no jogo aberto ou pede a ROM (`aplicarPatch`, `escolherRom`); ROM + patch soltos juntos;
> Arquivo > Aplicar tradução. O traduzido vira outro jogo "<nome> (tradução)" com save próprio e selo 🇧🇷 (`traducao` no
> registro). (2) **Painel de imagem** (F4, gaveta `#visual`; o jogo continua rodando; sem jogo, `cartelaTeste()`):
> `web/visual.js` (`KofVisual`): 51 ajustes em grupos (Pixels, TV, Sinal, Portátil, Cor, Foto, Retrô, Efeitos) e 30
> predefinições (15 filtros + 15 efeitos), "Salvar como meu jeito" (`kofnes.visualMeus`), comparar antes|depois, por
> console (`kofnes.visualPorSis`). TV em luz linear no estilo crt-lottes (linha gaussiana, máscara com média 1), HD = xBR
> nível 1 em um passo pra qualquer escala, Pintura = Kuwahara, Desenho = Kuwahara + degraus + Sobel. **Shader sob medida**:
> ajuste no padrão e escolhas viram constantes (`KofVisual.fonte/chave`), um programa por combinação (`glPrograma`), senão
> o shader único caía de 60 pra 14 fps no SwiftShader. Uniforms empacotados (`tela`, `u` = tempo/divisão/liga/pausa,
> `p[13]`). Filmadora = `#filmadora` (texto da página). O Marcelo aprovou filtros e efeitos: NÃO mexer mais neles.
> (3) **Molduras** `web/molduras.js` (`KofMolduras.LISTA`: 15 em SVG gerado no tamanho exato da tela, `svgMoldura`;
> bordas por moldura em `b`, `bordasDe`), galeria `#molduras` com categorias, animações SMIL (`kofnes.moldAnim`), por console
> (`kofnes.moldPorSis`, `PADRAO_SIS`) e **moldura sua em PNG** (acha o buraco transparente a partir do centro; guardada no
> banco `c`/`molduraPropria`). Prints de teste usam `KOFnes.imagemTeste(rgba, l, a)` (o print do FF6 veio do
> libretro-thumbnails `Named_Snaps`, só pra prévia, fora do git).
> **PlayStation (branch `ps1`, 20/10, não publicada):** núcleo **PCSX-ReARMed** (`construir.sh pcsx`, GPL-2; o Makefile.libretro já
> tem `platform=emscripten`; o build troca a zlib do emscripten pela miniz, porque o cache do emscripten do Ubuntu é congelado;
> sem dynarec = interpretador: ~150 fps no Node com demo 3D). `nucleos/pcsx-<hash>.js` ~1,3 MB. Sistema `ps1` (.cue .chd .pbp
> .iso .exe; 320x240 dinâmico, 4:3, `caminho: true`, `grande: true`): o CD vai pro disco virtual `/jogos` e FICA lá enquanto
> o jogo roda (o PCSX lê o CD aos poucos; `mod.kofCd` apaga o anterior), sem copiar o Uint8Array; não vai pro banco `roms`
> (até 700 MB): a biblioteca reabre pela pasta de ROMs (`bytesDoJogo`). `.cue` = `binsDoCue` (acha os .bin nos arquivos
> escolhidos/arrastados juntos, na pasta ou pergunta; `#arquivo` aceita vários). Os .bin de um .cue não aparecem como jogo de
> Mega Drive na biblioteca (`faixa`). BIOS opcional (scph5501.bin etc., 512 KB; sem ela o PCSX usa a BIOS imitada). Rebobinar
> desligado no PS1 (estado de ~4,4 MB). Controle: ✕ ○ □ △ = B A Y X, L1/R1 = L/R, L2/R2 = bits livres 0x0008/0x0004 do registrador (teclas E/R, gatilhos 6/7 do controle; zerados fora do PS1 em `rodarQuadro`; ids 12/13 no `LIGACAO`). Falta: analógico, L2/R2 no controle de toque e a jukebox do PS1 (sonda do SPU). Capas:
> `Sony_-_PlayStation`. Teste: `testes/navegador/ps1.cjs` com o Cube.exe do PeterLemon/PSX e um CD montado com ele
> (genisoimage + SYSTEM.CNF `BOOT = cdrom:\CUBE.EXE;1` + .cue MODE1/2048).
> **PS1 (21/10, publicado):** CD grande vai pro MEMFS por `FS.writeFile` com `canOwn` (pcsx exporta `FS`, `RT_EXTRA` no
> construir.sh), sem passar pelo heap do wasm. `.bin` sozinho = CD pelo conteúdo (`cdPs1`), usa o .cue do lado ou monta um
> (`cueDasFaixas`, faixas "(Track N)"). Zip com CD (`cdDoZip`/`itensDoZip`) lido do Blob aos poucos; o registro guarda `zip`.
> APK: escolha múltipla vem no ClipData (MainActivity). Pular quadros: ponte guarda o `SET_AUDIO_BUFFER_STATUS_CALLBACK`,
> app põe `snes.atrasado/ocupacao` antes de cada quadro, `lr_audio_status`; PS1 com `frameskip_type=auto`. Celular: reverb
> desligado e `psxclock=45` (quadro ~22% mais rápido; o gargalo é a CPU interpretada, não o desenho). Crash travou no celular
> antes disso; o próximo passo, se ainda picotar, é o núcleo num Web Worker.
> **PS1 no celular: ADIADO (21/10, pedido do Marcelo).** No PC roda liso; no celular (Crash) picota mesmo com os ajustes.
> Plano combinado: branch `ps1-nativo`, só no APK: PCSX-ReARMed nativo (NDK, recompilador ARM64 + GPU NEON), imagem numa
> superfície nativa por baixo da WebView, som nativo, botões pela ponte `KOFnesApk`; resto em WebAssembly. Primeiro passo:
> ver se o NDK instala no container.
> **PS1 nativo (branch `ps1-nativo`, 24/10, NÃO publicado, falta o Marcelo testar no celular):** sem NDK (dl.google.com e
> buildbot.libretro.com bloqueados). Núcleo = PCSX-ReARMed ARM64 já compilado (ari64 + NEON) do **LemuroidCores**
> (github.com/Swordfish90/LemuroidCores, commit fee2e824, GPL-2; baixado pelo git em `android/nativo/construir.sh`, vai no
> APK como `lib/arm64-v8a/libretro.so`, que é o SONAME dele). Ponte `android/nativo/kofps1.c` (~200 linhas, JNI, buffers
> diretos de imagem RGBA e som; cartão de memória = SAVE_RAM gravado em `ps1-saves/<jogo>.mcd`), compilada com o clang do
> Ubuntu `--target=aarch64-linux-android24 -nostdlib` + stubs de libc/liblog + `inc/` (jni.h do JDK, libretro.h).
> Java: `Ps1.java` (só os nativos, testável) e `Ps1Jogo.java` (copia o CD dos URIs escolhidos ou extrai o zip pra
> `files/ps1-cd`, thread de emulação no ritmo do AudioTrack, SurfaceView por cima da área do jogo; sem `ps1Pad` por 250 ms =
> pausa e some). Página: `android.js` (`PS1N`, `ps1NativoArquivo` antes de ler o arquivo, `ps1Fachada` = núcleo de fachada
> com lr/serializar pela ponte, `nucleo: 'pcsx-nativo'`). `CASCA = 3`. Testes: `testes/android/ps1-nativo.sh` (a ponte
> compilada pro Linux com o PCSX do Linux, interpretador: lightrec briga com a JVM) e `testes/android/ps1-fachada.cjs`.
> Sem filtros/molduras no PS1 nativo (a imagem não passa pelo WebGL).
> **N64 nativo (branch `n64`, 24/10, não publicado, falta testar no celular):** núcleo Mupen64Plus-Next GLES3 ARM64 do
> LemuroidCores (GLideN64, GPL-2), SONAME trocado com `patchelf` pra `libn64.so` (o original também é `libretro.so`).
> A ponte virou genérica: `android/nativo/kofnativo.c` compilada 2x (`-DCLASSE=Ps1` → libkofps1.so; `-DCLASSE=N64 -DKOF_GL`
> → libkofn64.so, com SET_HW_RENDER: framebuffer 0 da GLSurfaceView, `eglGetProcAddress`, `context_reset` no 1º quadro;
> direcional → analógico esquerdo; bits 16-19 → botões C pelo analógico direito). `N64Jogo.java`: tudo na thread do
> OpenGL (queueEvent + latch), `setFixedSize` no tamanho da imagem, AudioTrack bloqueante marca o ritmo, a GLSurfaceView
> nunca some (encolhe pra 1 px). Página: `android.js` genérico (`NATIVO`, `consoleNativo`, `fachada(c, r)`, `mascaraN64`),
> sistema `n64` no `nucleo.js` (`nativo: 'n64'`; `disponivel` pergunta `KOFnesApk.n64Nativo()`), ROTULOS.n64.
> CASCA = 4. Sem teste do N64 com o núcleo de verdade aqui (sem OpenGL ES no container).
> **APK se atualiza sozinho (21/10, publicado):** `android/src/.../Atualizador.java` (sem Android dentro, testável:
> `testes/android/teste-atualizador.sh`) lê `publicado/android/versao.txt` (`versao=`, `casca=`, `html=`, `nucleo=`),
> baixa pra `files/web/baixando` → `pronta` (núcleo que já existe é copiado), e na abertura seguinte `pronta` vira `atual`
> e a `servir()` da Activity lê de lá (cai pros assets se faltar arquivo). APK mais novo que a versão baixada = vale o APK
> (`assets/versao.txt`). **`CASCA` no MainActivity.java: SUBIR sempre que mudar o Java**; publicado com casca maior = o app
> pede pra baixar o APK novo (`android/apk/KOFstation.apk` na main) e não baixa a página. `publicar.sh` gera
> `publicado/android/` e copia todos os núcleos do celular (inclui o Snes9x) pra `publicado/nucleos/`.
> **Ideia aprovada pra depois: "jogar pelo PC" no celular.** O celular escolhe: rodar o jogo nele mesmo (como hoje) ou
> usar o KOFstation do PC (o PC emula e transmite imagem+som por WebRTC; o celular manda os botões por DataChannel;
> conexão por QR code, com o KOFstation.exe fazendo a apresentação na rede de casa, nada vai pra internet). Etapas:
> (1) transmissão com conexão manual, (2) QR + exe, (3) som, qualidade automática, reconectar.
> **Download (21/10):** página `docs/index.html` (GitHub Pages: o Marcelo liga em Settings → Pages → main /docs; a API de
> Pages é bloqueada pra sessão) com links raw: `publicado/KOFstation.exe` sozinho (**lançador 8**: sem o html na pasta, mostra
> um aviso e baixa página + núcleos antes de abrir; sem internet, avisa e sai), `android/apk/KOFstation.apk` e o comando do
> `kofnes.sh` (**LANCADOR=3**, mesma coisa). Testado no Wine e no sh com servidor local. README e prints refeitos SÓ com
> conteúdo livre (PeterLemon Mode7 Perspective/RotZoom, Cube do PS1, Trilha): jogo ou capa comercial NÃO entra em print.
> Script dos prints: refazer com Playwright (KOFnes.mudarTema/aplicarFiltro/mudarMoldura + juntar com PIL).
> **24/10 (N64 PUBLICADO na main, versão 202610242237, CASCA 5; a branch `n64` foi junta):** PS1 nativo engasgava no celular (publicado 202610242054, CASCA 4): o caçador de bugs copiava o estado (~4 MB)
> pela ponte a cada 10 s e a página travava (>250 ms sem sinal = o jogo nativo pausa); agora o nativo não tem caçador,
> salva o automático a cada 2 min, a página não redesenha por baixo, a imagem é ampliada pelo Android (setFixedSize) e o
> som do PCSX roda em thread (`pcsx_rearmed_spu_thread`). **N64 no PC (branch `n64`, NÃO publicada, CASCA 5):** Mupen64Plus-
> Next em WebAssembly roda (demos livres do PeterLemon, `testes/navegador/n64.cjs`): `GLES3=1` + `FULL_ES3`, libco por
> fibers do emscripten + ASYNCIFY (`nucleo-libretro/libco-emscripten.c`), `lr_ok()` (o retorno se perde na troca de
> corrotina), glMapBufferRange com leitura na ponte, instância nova por jogo. **A ponte (e a nativa) agora guardam o padrão
> das opções do `SET_VARIABLES`**, como o RetroArch (sem isso o Mupen ficava sem emulação de framebuffer); os outros núcleos
> só ganham isso quando forem recompilados. Falta o Marcelo testar jogo de N64 de verdade no PC e no celular.
> **Busca com base de jogos (PUBLICADA 25/10, versão 202610251330, na main):** `web/jogos/montar.py` lê os `rdb/*.rdb` do
> libretro-database (`web/jogos/rdb.py` = leitor de MessagePack; .rdb baixados em `web/jogos/.rdb/`, fora do git) e grava
> `web/jogos/jogos.json.gz` (~600 KB, versões/regiões juntadas pelo título sem parênteses e com o artigo na frente, gêneros
> traduzidos em ~25 (`GENERO`), jogos sem informação fora; PS1 junta por código do disco; Neo Geo pelo set pai, sem gênero
> na base). Licença **CC BY-SA 4.0** (crédito no Guia e em `web/jogos/LEIA-ME.md`). O juntar.py transforma em
> `nucleos/jogos-<hash>.js` (`KofJogosDb`, gzip em base64; entra na lista `nucleo=`, APK/PWA levam). `web/jogos.js`
> (`KofJogos.carregar/info/crcRom`): acha pelo CRC32 (No-Intro: sem cabeçalho 512/iNES; o `abrirBytes` grava `crc` no
> registro e `preencherCrcs` completa os antigos 1x por sessão), pelo título ou pelo set do Neo Geo; zip sem console procura
> em todos. Biblioteca: `metaDe`/`r.busca` (texto livre acha gênero, empresa, série, ano, console), `campo:valor`
> (`CAMPOS`), fileira `#bib-filtros` (FACETAS: Console, Gênero, Empresa, Década, Jogadores, Série; `#bib-pop` com contagem
> e caixinha de procurar; ✕ tira), ordenar (`ORDENS`, `kofnes.bibOrdem`), `#info-meta` com botõezinhos que filtram.
> Teste: `testes/navegador/busca.cjs <html> [prints]`. Pacote de teste SEM o exe (o lançador apaga núcleo fora da lista do
> main). Montar html sem Kof/emscripten: pegar o núcleo Kof e o somfm de `publicado/KOFstation.html` e os núcleos de
> `publicado/nucleos/` e rodar o juntar.py (o hash dos núcleos sai igual ao publicado).
> **Pasta de ROMs no APK + biblioteca do celular (PUBLICADA 25/10 na main, CASCA 9; a casca 8 foi o analógico):** `Pasta.java`:
> `ACTION_OPEN_DOCUMENT_TREE` com permissão guardada (prefs `pasta`/`arvore`), lista até 2 níveis filtrando pelo `EXT_ROM`
> que a página manda, e serve cada arquivo em `/pasta?u=<uri>` com Range (206); só o que foi listado. Ponte: `pastaEscolher`
> (-> `__pastaEscolhida`), `pastaNome`, `pastaListar` (thread; -> `__pastaLida`), `pastaPreparar(uri)` (põe o arquivo + as
> faixas do mesmo CD no `ultimaEscolha` do PS1/N64 nativo). Página: `pastaApk`/`temPasta` no app.js, `arquivoApk` no
> android.js (objeto tipo File: `slice`/`arrayBuffer`/`stream` por Range; zip e CD não são lidos inteiros),
> `listarPastaApk`/`escolherPastaApk`; `nativoJogo` copia da pasta. Corrigido: `lerPasta` sem `await` antes do 1º `return`
> deixava `lendoPasta` preso. Biblioteca no celular (android.css): tela cheia, capinha + linha "gênero · ano · empresa"
> (`.li-sub`), filtros numa faixa de lado, lista dos filtros embaixo, e a **ficha** (`#biblioteca.ficha`, `.bib-dir` subindo
> de baixo com capa, botõezinhos, Jogar/Estados; 1º toque abre a ficha, 2º joga; Voltar fecha). Teste:
> `testes/android/pasta-apk.cjs <html> <pasta> [prints]`. APK montado com as `.so` tiradas do APK anterior
> (`android/nativo/lib/`, fora do git) e o html montado sem Kof/emscripten. Falta testar no celular de verdade.
> **Saves e backup (PUBLICADA na main 25/10, CASCA 10; Fase 1 do plano saves → controle → sync):**
> `web/guarda.js` (`KofGuarda`, testado no Node: `testes/node/guarda.cjs`): save comprimido (gzip, sem o fim 0xFF, hash da
> parte com conteúdo), `decidir` (igual/trazer/manter pelo hash e `quando`), estatísticas por aparelho (`partes[aparelho]`,
> dias `[nº do dia, s]` → meses depois de 400 dias, `horas[24]`; `visao()` dá o formato antigo pra tela), pacote `.kofsave`
> (`KOFSAVE1` + JSON gzip + blocos binários). app.js: banco **v8** com a loja `saves` (keyPath `chave`); o save cai no
> `localStorage` como **rascunho** (síncrono, seguro ao fechar) e `assentarSave` leva pro banco e apaga o rascunho (o mesmo
> código migra os saves antigos); `APARELHO` (código por aparelho); `storage.persist()`; no máximo 20 savestates por jogo
> (`limitarEstados`); Estatísticas ganharam backup/trazer backup/Espaço usado (+ Arquivo); abrir/arrastar um `.kofsave`
> traz o backup (junta: save mais novo vence, o outro vira `anterior`; configs só com a caixinha, nunca mudo/volume;
> savestates só se exportados com a caixinha). Celular: `SavesNativos.java` (cartão do PS1 e save do N64 nativos pela
> ponte `savesNativos/saveNativoLer/saveNativoGravar`, chave `nativo/<pasta>/<arquivo>`). Ainda não juntam: o save do PS1
> do PC (chave `sram.<título>.<tam>`) e o `.mcd` do celular são chaves diferentes (resolver na Fase 3). Testes:
> `testes/navegador/saves.cjs dist/web`, `testes/android/teste-saves-nativos.sh`, `gba.cjs` (save no banco).

> **Celular como controle do PC (branch `controle`, 25/10, NÃO publicada na main, CASCA 11; Fase 2):** `ControleServidor.java`
> (sem Android, `main` de teste com modo `entrada`): WebSocket mínimo na porta 8642 (ou outra livre), senha de 4 dígitos,
> `TCP_NODELAY`; o PC manda `KOF <senha> <nome>`, recebe `ok` e depois 6 bytes por mudança (botões no formato do SNES do
> app + 4 eixos int8). Ponte: `controleIniciar` (liga a tela acesa; JSON ip/porta/senha), `controleEnviar`, `controleEstado`,
> `controleParar`. Celular: Controles → "Usar este celular como controle do PC" (`entrarModoControle` no android.js: o
> controle de toque sem jogo, direcional = analógico 'misto', L2/R2 visíveis, manda a cada mudança ou a cada 250 ms; o
> voltar sai). PC: Arquivo → "📱 Celular como controle…" (`conectarControle('ip[:porta] senha')`, `remoto.bits/eixos`
> entram no `estado()`/`lerEixos()`, tenta de novo se cair). Testado: página do arquivo (file://) conecta em ws:// de
> outra máquina; `testes/android/controle.cjs dist/web` (celular → Java de verdade → PC; ~10 ms aqui).

> **Desempenho, 1ª parte (PUBLICADA 25/10):** painel `desemp` (F3 / menu rápido "📈 Painel de desempenho": fps, ms do
> núcleo/som/tela/rebobinar por quadro, engasgos = quadros atrasados, falta de som; `KOFnes.desempenho()`), medido com
> `Emulation.setCPUThrottlingRate` (4x ≈ celular médio). Achados: o rebobinar das libretro copiava o estado inteiro 2x por
> foto (~50 MB/s de lixo no Snes9x) → agora compara direto na memória do núcleo (`estadoVivo()` no nucleo.js), 7,4 → 3,4 ms
> por foto no 4x; e o **SNES do PC passou pro Snes9x** (núcleo 5,5 → 1,1 ms; o Kof gerava ~25 engasgos/s), Kof como opção
> em Emulação (`kofnes.nucleoSnes`, `nucleoSnes()`); estado salvo com o outro núcleo reabre o jogo nele
> (`nucleoDoEstado`). juntar.py agora leva o snes9x pro PC. Teste: `testes/navegador/nucleo-snes.cjs dist/web rom.sfc`.
> Próximo (2ª parte, combinado): motor novo = emulação num Worker + som por AudioWorklet ditando o ritmo (hoje
> ScriptProcessor na linha principal), depois recompilar núcleos com -flto/-msimd128; nativo no celular só se precisar.

## Pendências (atualizado 17/10; ver a nota de 20/10 logo abaixo)

> **20/10:** conferido no git: as branches `temas-menu` (126 temas, busca, categorias, Café) e `atualizador-wininet` (aviso
> de mudo, rebobinar Príncipe da Pérsia, lançador 5) JÁ ESTÃO na `main` e publicadas; os "não publicado" abaixo sobre elas
> estão velhos. Fora da `main` só o Perfil (`ccr-ff223c92-a1bil9`, 2 commits), por escolha do Marcelo.
> Plano do lançamento combinado (fazer quando ele pedir, uma etapa por vez): (2) primeira abertura guiada + capas de GBA e
> Neo Geo + pasta inteira de ROMs no APK; (3) clipe dos últimos 30 s em MP4 (savestate de 30 s atrás + botões, rejogados
> por trás e gravados com WebCodecs) + jukebox exportando .wav; (4) site no GitHub Pages (prints com ROMs livres, GIFs que
> ele grava com o clipe, botões de baixar, PWA em /jogar) + release no GitHub.

- ~~Atualizador no Windows~~ **Resolvido.** Lançador 2 (WinHTTP, log, troca do próprio exe) publicado
  na versão 202610171459; troca do exe confirmada no Wine e o Marcelo já testou no Windows dele e em
  outro computador (só exe + html + jogos): roda liso. Se falhar de novo, pedir o `atualizacao.log`.
- **Decidido, a fazer depois (branch novo): envio de bug/sugestão com um clique.** Cloudflare Worker
  (token fine-grained só de issues, guardado no Worker) cria a issue num repositório **privado**
  "caixa" do Marcelo (ex.: `kofnes-caixa`); anônimo, só `{tipo, texto, versão}`; limite de tamanho e
  de pedidos + honeypot. Sem internet/falha: cai no fluxo atual (issue preenchida no GitHub). Envio
  automático é só texto; o pacote do caçador de bugs continua baixado à parte (conferir antes se ele
  carrega trechos de ROM). Caixa de sugestões na mesma tela. A conta Cloudflare/token é do Marcelo.
- **Publicado (17/10):** navegação corrigida (botão direito nas telas = Voltar; Esc = volta ao jogo;
  Voltar anda pelo histórico; F2 só no jogo), correção do foco (tirar print não pula pro jogo), menu
  Arquivo por cima da barra lateral e **lançador de Linux** (`web/lancador_linux.sh` → `kofnes.sh`, POSIX
  sh, qualquer distro).
- **Atualizador no Windows do Marcelo (branch `atualizador-wininet`, ainda não publicado):** o erro 12002
  era a rede dele: só 1 dos 4 IPs do raw.githubusercontent.com responde (185.199.110.133) e o IPv6 não
  sai. O **lançador 5** pede os IPv4 ao DNS, conecta em todos ao mesmo tempo e baixa pelo `curl.exe` do
  Windows preso no IP que respondeu (`--resolve`); WinINet e WinHTTP ficam de reserva com prazo de 3 s.
  Testado no Windows dele: atualiza em ~1 s. O lançador 4 (só WinINet) está publicado e não resolve.
- **Perfil (`.kofperfil`) está só no branch `ccr-ff223c92-a1bil9`, FORA da main por pedido dele:** foi
  publicado na 202610172119 e retirado com `git revert` (commit "Revert Perfil...") + nova publicação.
  Pra trazer de volta: `git revert` desse revert na main (ou juntar o branch). Formato: `KOFPERFIL1` +
  tamanho do cabeçalho + JSON + blocos binários. O "quebrou tudo (jukebox etc.)" era o **mudo**: carregar
  o perfil copia todas as configs `kofnes.*`, inclusive `mudo=1`. Ao trazer de volta, não levar `mudo`
  nem `volume` no arquivo. ~100 MB a otimizar. O "Continuar sem ROM pede a pasta" (`c1260eb`) também
  ficou só nesse branch, porque só serve pro perfil.
- **Aviso de mudo (branch `atualizador-wininet`):** "o som está desligado: aperte M pra ligar" ao abrir
  um jogo e no play da jukebox.
- **Rebobinar estilo Príncipe da Pérsia (trazido do branch do perfil pro `atualizador-wininet`, ainda não
  publicado):** segurar Backspace/Select+Y volta até 5 s em preto e branco; soltou ou acabou, o buffer
  zera e a ampulheta ⏳ leva 30 s de jogo pra recarregar. Sem item no menu (savestates guardam momentos);
  só roda com o jogo andando. Chave `kofnes.rebobLimite` (3/5/10/15) só pros testes. Teste:
  `testes/navegador/rebob.cjs`.
- **Temas com categorias e busca (branch `temas-menu`, ainda não publicado):** a galeria tem busca (sem acento,
  por nome/categoria/id) e fileira de categorias (os grupos de `TEMAS` em `web/app.js`; grupo novo vira categoria
  sozinho), o showcase passa só os temas filtrados, e o **menu do botão direito** (menu rápido) ganhou o item
  "🎨 Tema" (◀▶ troca, Enter abre a galeria). Pra adicionar tema: bloco `[data-tema="id"]` no `estilo.css` + uma
  linha em `TEMAS`; o contador "N temas" do Início e do Guia se atualiza sozinho. Teste: `testes/navegador/temas-menu.cjs`.
- **Pacote Café (branch `temas-menu`, não publicado):** categoria "Café" com 8 temas: `cafe` (Café queimado, o
  original e o padrão, **não mexer**), `espresso`, `cappuccino`, `latte`, `mocha`, `caramelo`, `coldbrew`, `canela`.
  Tokens do sistema: `--fundo`, `--painel`/`--painel2`, `--texto`, `--fraco`, `--destaque`, `--borda`, `--sel` e (novos,
  opcionais) `--botao-fundo`/`--botao-texto` pro `.grande`. Foco de teclado e `:disabled` agora valem pra todos os temas.
  Testes: `testes/node/contraste.cjs` (WCAG dos 8) e `testes/navegador/pacote-cafe.cjs`.
- **Pacotes de temas (branch `temas-menu`, não publicado):** 126 temas: Café 8, Animais 7, Animes 23 (a categoria 'Anime' virou 'Animes'), Bem brasileiro 44 (os antigos 3 + Nostalgia BR 20 + Brasilidades 20 + Clube da Esquina), Clássicos do SNES 26 (20 jogos + os 6 de 'Jogos'); as categorias Nostalgia BR, Brasilidades e Jogos foram mescladas a pedido dele. IDs de tema não podem ter hífen (viram chave de objeto no app.js). Showcase tem dois botões: lento (3,5 s por tema) e rápido (0,5 s, pra apresentar pros outros). `TEMAS` aceita descrição
  opcional (`[id, nome, descrição]`, aparece na prévia e entra na busca); Nostalgia BR tem 20 com descrição. Só cor, gradiente e
  textura leve em `--fundo-img` (sem imagem, sem nome de marca). Testes: `testes/node/contraste.cjs` (lista de ids no topo; todo
  tema novo entra lá) e `testes/navegador/nostalgia-br.cjs` e `categorias-temas.cjs` (contagens, nomes, ids únicos, persistência, prints).
- **Android (branch `android`, não publicado):** `web/compilar.sh` gera `dist/web/KOFnes-android.html` (e a pasta `dist/web/android/`
  = PWA: index.html + manifest + sw.js + ícones) quando existe `nucleo-libretro/saida/snes9x.js` (construir com
  `nucleo-libretro/construir.sh snes9x`, emscripten + libretro/snes9x; licença só NÃO comercial). Núcleo no celular = **Snes9x em WebAssembly**
  (`web/nucleo.js` imita o núcleo Kof: pad, runFrame, ppu.frame, apu.dsp, cart.sram; savestate e rebobinar via
  retro_serialize, ~820 KB por estado); o PC continua com o núcleo Kof. `juntar.py <...> <pasta-com-snes9x.js>` monta o modo celular:
  `web/android.js` entra DENTRO da função do app.js (mesmo escopo), `web/android.css` junto do CSS, `<html class="celular">`.
  Controle virtual (multitoque, deslizar entre botões) com 6 modelos (classico, moderno, minimo, arcade, portatil, tema), tela
  Controles (reaproveita a janela de teclas), barra de baixo no lugar do menu/lateral, voltar do Android = menu rápido, textos de PC
  escondidos com `.so-pc` / `.so-cel` (no pagina.html) e `CELULAR` no app.js. Testes: `testes/libretro/nucleo.cjs` (Node) e
  `testes/android/celular.cjs` (Playwright com toque; aceita html, rom, pasta de prints). Pendente: testar no aparelho real
  (latência, desempenho do Snes9x), APK (Capacitor/GitHub Actions), seletor de pasta de ROMs (só no APK), guardar música e caçador
  de bugs não existem no celular, posições do arcade/portátil na horizontal usam o layout padrão.
- **APK (branch `android`):** `android/construir-apk.sh` (depois de `web/compilar.sh`) gera `dist/KOFnes.apk` SEM Gradle e sem
  SDK completo: WebView nativa em Java (`android/src`, uma Activity) com o `KOFnes-android.html` dentro (assets/index.html),
  servido em `https://appassets.androidplatform.net/` (endereço seguro: IndexedDB, crypto, WebAssembly). Ferramentas do Ubuntu:
  `apt install aapt apksigner zipalign libandroid-23-java dalvik-exchange android-sdk-platform-23` + JDK; compila com
  `javac --release 8` contra o android.jar API 23, sem lambdas (o dx não desaçucara). minSdk 24, targetSdk 34, assinado v2/v3 com
  a chave de TESTE `android/kofnes-teste.keystore` (senha `kofnes-teste`; é pública de propósito: serve pra instalar e atualizar
  por cima; **Play Store precisa de chave de verdade fora do repositório e de AAB**). A ponte `window.KOFnesApk` (MainActivity.Ponte)
  salva arquivos (pacote de bug, .spc exportado) pelo "salvar como" do Android; o seletor de arquivo (ROM, .spc) e o window.open
  (issue do GitHub, abre no navegador) são tratados na Activity. Teste sem celular: `testes/android/apk-simulado.cjs` (serve o
  html no endereço do app e troca a ponte por um stub). O APK de teste fica em `android/apk/KOFnes.apk` (link direto pelo raw.githubusercontent.com na branch `android`; o celular dele não abre zip). Menu rápido no celular: ☰, ou toque longo SÓ em cima da imagem do jogo (`contextmenu` fora de `#tela`/`#moldura` é ignorado). O controle (6 modelos) é desenhado em CSS (`web/android.css`: relevo com radial-gradient/color-mix, setas do direcional com clip-path); no retrato as medidas usam a largura (`--u: 0.87cqw`), na horizontal a altura. Ainda NÃO testado num aparelho de verdade. Faltam: escolher a pasta de
  ROMs inteira (SAF, ACTION_OPEN_DOCUMENT_TREE) e AAB/assinatura de produção pra Play.
- **Multi-sistema: PUBLICADO na versão 202610191323 (main = branch `multi-sistema`, que inclui a `android`; o exe
  continua o do lançador 5). Pra desfazer: `git revert` do commit da publicação e publicar de novo.** Detalhes: núcleos libretro em WebAssembly, sem
  reescrever núcleo em Kof. Etapa 1 feita: `nucleo-libretro/ponte.cpp` (ponte genérica, funções `lr_*`; `lr_info()` dá
  tamanho/proporção/fps/taxa de áudio do `retro_get_system_av_info`) + `nucleo-libretro/construir.sh snes9x|gambatte` →
  `saida/<núcleo>.js` (módulo `Nucleo_<núcleo>`). Teste: `node testes/libretro/ponte.cjs gambatte rom.gb`. ROMs livres de GB:
  dmg-acid2/cgb-acid2 (github.com/mattcurrie). Etapa 2 feita: `web/nucleo.js` (`KofLibretro`, substituiu o nucleo_s9x.js):
  `SISTEMAS` (snes: .sfc/.smc/.fig/.swc → snes9x 256x224; gb: .gb/.gbc/.sgb → gambatte 160x144), `criar(bytes, nomeDoArquivo)`,
  `sistemaDe(nome)`, `disponivel(sis)`; o objeto tem `sistema`, `nucleo`, `largura/altura`, `fps`, `taxaAudio`, `rgba` (já no
  formato do canvas) e `ppu.frame` (getter no formato Kof). Estado: `{lr: núcleo, d}` (Snes9x mantém `s9x: 1`). O juntar.py
  embute todo `nucleo-libretro/saida/*.js`. Pacote de bug: `nucleo` = 'kof' | 's9x' | 'gambatte'. Teste:
  `node testes/libretro/nucleo.cjs rom.sfc|rom.gb`. Etapas 3-5 feitas: app.js sem 256x224 fixo (`telaL/telaA`,
  `tamanhoTela()`, textura/foto/escala/proporção pelo núcleo; Game Boy: "Original" = 10:9), áudio na taxa do núcleo (jukebox
  segue 32 kHz), `QUADRO_MS` pelo fps do núcleo; `body[data-sis]` (controle virtual do GB só A/B/Start/Select em
  `android.css`); `SIS_ATIVOS`/`EXT_ROM` (extensões, zip, pasta, accept), rótulo "GB" na biblioteca, `sistema` no registro do
  jogo, "Guardar esta música" some fora do SNES (`so:` nos itens do menu rápido). PC: `juntar.py ... saida pc` embute só os
  núcleos que não são do SNES (Gambatte, ~870 KB); SNES no PC continua no núcleo Kof (`novoNucleo`); `CELULAR` agora é só a
  classe do html. Gancho de teste `KOFnes.nucleo()`. Teste: `node testes/libretro/gameboy.cjs dist/web rom.gb rom.sfc prints/`.
  APK da branch: `android/apk/KOFnes.apk` (link raw na branch `multi-sistema`). Falta: o Marcelo testar no celular e no PC.
- **Jukebox pra todos os sistemas + osciloscópio (branch `multi-sistema`):** a vista padrão continua a de antes (capa +
  barras), agora com 8 barras no SNES e 4 no Game Boy (Pulso 1, Pulso 2, Onda, Ruído). Modo extra **〰 Ondas** (botão na
  jukebox, lembrado em `kofnes.jkVista`): uma faixa por canal com a forma da onda (gatilho na subida, 18 ms), cores do
  `--destaque` do tema, estilo pelo tema (`ESTILO_TEMA` no app.js: fio/neon/preenchido/pixel; tema sem entrada: claro =
  preenchido, escuro = fio; `kofnes.jkEstilo` troca), **Mudo** e **Solo** por faixa (`juke.mudas`, `juke.solo`,
  `mudasEfetivas()`). `juke.apu` virou um "tocador" (`tocadorSnes(apu)` ou `KofLibretro.tocador(sis, rom, estado)`):
  `encher/limpar/mudas/onda(v)/nivel/taxa/canais/nomes`. Música do Game Boy = **música por estado** (`reg.sistema`,
  `reg.lr` = savestate do Gambatte em base64; toca numa instância SEPARADA do núcleo, sem imagem e sem botão; a ROM vem da
  loja `roms` pelo `jogoId`; sem ROM na biblioteca = aviso). Sonda: SNES em `snes/Dsp.kf` (`onda` 8x2048, `ondaPos`,
  `sonda`; fora do savestate pelo `PULAR` do estado.js); Game Boy pelo remendo `nucleo-libretro/gambatte-sonda.patch`
  (cada canal num buffer próprio, `kof_onda` 4x4096 a 32 kHz, `kof_mudas`), lido pela ponte (`lr_canais/lr_sonda/lr_mudas/
  lr_onda/lr_onda_pos`, símbolos fracos nos núcleos sem remendo). Teste: `node testes/libretro/jukebox.cjs dist/web rom.gb
  rom.sfc prints/` (ROM de GB com som: dá pra gerar uma de teste escrevendo nos registradores NR10–NR52).
- README: não existe *release* no GitHub (o README aponta pra `publicado/`); sugerido criar uma
  com o zip. O print do modo sofá no README mostra capas comerciais e nomes de teste repetidos.
- Bugs conhecidos de compatibilidade: defeito gráfico na parte de baixo da tela no **Mega Man X**;
  **Super Mario All-Stars + World** trava na mensagem do começo (o SMW avulso roda bem).
- Ideias que ele curtiu e ainda não foram feitas: Android (GitHub Pages/PWA + controle touch),
  lançador de Linux igual ao do Windows, exportar estatísticas (CSV) / "Seu ano retrô", patches
  IPS/BPS (traduções), triagem automática Java × JavaScript dos pacotes de bug (achar bugs do
  Kof pra Mel), conquistas (RetroAchievements), jogar online, kit de lançamento (licença,
  modelos de issue, notas de versão, site), KOFnes multi-sistema (NES/Game Boy; núcleos pesados
  como PS1 talvez em Rust → WebAssembly, ideia dele, falar com a Mel).
