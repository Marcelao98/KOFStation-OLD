# KOFstation — Inventário de funcionalidades (Fase 1)

> Base: `main` `ceba493` (202610262214). Linhas do `web/app.js` indicadas como `app.js:N` (início do bloco).
> **Nada aqui foi alterado.** "Migração" é a proposta de destino na arquitetura nova (ver MIGRATION_PLAN): **UI** =
> React, **APP** = casos de uso TS, **DOM** = domínio TS, **ENG** = engine TS (laço/vídeo/áudio/núcleos), **RS** = Rust.
>
> Estado de validação pelo usuário (CLAUDE.md): ✔ confirmado pelo Marcelo · ◐ publicado, falta testar no aparelho real ·
> ✖ fora da main.

## Resumo

| # | Funcionalidade | Onde (principal) | Plataforma | Validação | Destino |
|---|---|---|---|---|---|
| 1 | Lançador + atualizador | `web/lancador_win.c`, `web/lancador_linux.sh`, `Atualizador.java` | Win/Linux/Android | ✔ | RS |
| 2 | Telas, navegação e Voltar | `pagina.html`, `app.js:3612,4060-4087` | todas | ✔ | UI |
| 3 | Navegação por controle (foco) | `app.js:3618-3736` (`navegarPad`) | PC | ◐ | UI + APP |
| 4 | Início (Home) e modo sofá | `app.js:3970-4060`, `3271` | todas | ✔ | UI |
| 5 | Abertura da 1ª vez + guia | `app.js:2116-2204` | todas | ✔ | UI |
| 6 | Biblioteca de jogos | `app.js:3153-3612` | todas | ✔ | UI + APP + RS |
| 7 | Busca, filtros e base de jogos | `web/jogos.js`, `web/jogos/montar.py`, `app.js:3304-3486` | todas | ✔ | DOM + APP + UI |
| 8 | Capas | `app.js:3182-3270` | todas | ✔ | APP + RS (cache) |
| 9 | Pasta Kof Games (descoberta e organização) | `app.js:2968-3153` | PC (File System Access), Android (`Pasta.java`) | ◐ | RS |
| 10 | Abrir arquivo, zip, CD (.cue/.bin), detecção de sistema | `app.js:1875-1943, 2204-2319, 2456`, `nucleo.js:119` | todas | ✔ | DOM + APP |
| 11 | BIOS | `app.js:2341-2456`, `nucleo.js` (`bios`, `temBios`) | todas | ✔ | APP + RS |
| 12 | Núcleos libretro em WebAssembly (8 núcleos) | `nucleo-libretro/`, `web/nucleo.js` | PC/celular | ✔ | ENG (sem mudar núcleo) |
| 13 | Núcleo Kof do SNES (opção) | `snes/`, `app.js:2418` | PC | ✔ | ENG (artefato opcional) |
| 14 | PS2 nativo (kofnativo + LRPS2), modo página | `pc-nativo/`, `web/ps2.js` | Linux ◐ / Windows ◐ | ◐ | RS (supervisão) + ENG (adaptador) |
| 15 | PS2 em wasm (Play!) — reserva | `nucleo-ps2/`, `web/ps2.js` | PC | ◐ | adiar |
| 16 | PS1 e N64 nativos no celular | `android/nativo/`, `Ps1Jogo.java`, `N64Jogo.java`, `android.js` | Android | ◐ | casca Android + ENG |
| 17 | Laço de emulação e desempenho (F3) | `app.js:1141-1225, 1708` | todas | ✔ | ENG |
| 18 | Vídeo, escala, proporção, paletas | `app.js:198-260, 615-698` | todas | ✔ | ENG + UI |
| 19 | Painel de imagem (filtros/efeitos, passadas) | `web/visual.js`, `app.js:50-497` | todas | ✔ | ENG (shaders) + UI |
| 20 | Molduras | `web/molduras.js`, `app.js:504-615` | todas | ✔ | UI + ENG |
| 21 | Som e volume | `app.js:698-797` | todas | ✔ | ENG |
| 22 | Controles e teclas (camadas) | `app.js:797-964` | PC | ◐ | DOM + APP + UI |
| 23 | Jogadores 2 a 4 | `web/jogadores.js`, `ponte.cpp` (4 portas) | PC | ◐ | APP + ENG |
| 24 | Controle virtual de toque | `web/android.js`, `android.css` | Android | ✔ | UI (celular) |
| 25 | Celular como controle (antigo, WS 8642) | `ControleServidor.java`, `app.js:1000-1053` | Android→PC | ✔ | substituir por #26 |
| 26 | Rede entre aparelhos (parear/conectar) | `rede/`, `web/rede.js`, `Rede.java` | PC/Android | ✔ | RS |
| 27 | Jogar no PC (WebRTC) + Controle total + Modo Switch | `web/jogarpc.js`, `android.js` | PC↔Android | ◐ | APP + ENG + UI |
| 28 | Menu rápido | `app.js:3736-3824` | todas | ✔ | UI |
| 29 | Modos de jogo (alegria/normal/raiz/hardcore) | `app.js:1831-1848, 2778-2845` | todas | ✔ | DOM |
| 30 | Savestates + automático | `app.js:2756-2968`, `estado.js` | todas | ✔ | APP + RS (arquivos) |
| 31 | Rebobinar | `estado.js` (`Rebobinador`), `nucleo.js` (`estadoVivo`), `app.js:1848-1875` | todas (não PS1/PS2) | ✔ | ENG |
| 32 | Saves de bateria + backup `.kofsave` | `web/guarda.js`, `app.js:2512-2704`, `SavesNativos.java` | todas | ✔ | DOM + RS |
| 33 | Estatísticas | `guarda.js`, `app.js:2560-2623` | todas | ✔ | DOM + APP + UI |
| 34 | Jukebox (estado, .spc, sonda, Ondas, notas, .wav) | `app.js:1225-1700`, `spc.js`, `*-sonda.patch` | todas | ✔ | ENG + UI |
| 35 | Música própria (8 bits, FM, violino) | `musica.js`, `somfm.js`, `musicas/` | todas | ✔ | ENG + UI |
| 36 | Temas (126) + showcase | `estilo.css`, `app.js:4235-4350` | todas | ✔ | UI (tokens CSS) |
| 37 | Patches de tradução (IPS/BPS/UPS) | `web/patch.js`, `app.js:2319-2341` | todas | ✔ | DOM |
| 38 | Caçador de bugs + replay | `app.js:1719-1796`, `bugs/reproduzir.cjs` | PC | ✔ | APP + ENG |
| 39 | Aviso de atualização / versão | `app.js:1796-1831` | todas | ✔ | APP + RS |
| 40 | Guia / ajuda | `app.js:4094-4107` | todas | ✔ | UI |
| 41 | PWA | `web/pwa/` | navegador | ◐ | adiar |
| 42 | Perfil `.kofperfil` | branch `ccr-ff223c92-a1bil9` | — | ✖ fora da main | não migrar (substituído por #32) |

---

## Fichas

Formato: **Descrição** · **Onde** · **Módulos** · **Dependências** · **Integrações externas** · **Como funciona hoje** ·
**Problemas** · **Migração**.

### 1. Lançador + atualizador
- **Descrição:** baixa a versão nova e abre o app em janela sem barra.
- **Onde:** `web/lancador_win.c` (693 l., LANCADOR 13), `web/lancador_inet.c`, `web/lancador_linux.sh` (LANCADOR=10),
  `android/.../Atualizador.java`; `web/publicar.sh` gera `publicado/versao.txt`.
- **Módulos:** versao.txt (`versao`, `tamanho`, `lancador`, `tamanho_exe`, `lancador_linux`, `nucleo=`, `nativo_linux=`,
  `nativo_windows=`), `fonte.txt`, `atualizacao.log`.
- **Dependências:** curl.exe/WinINet/WinHTTP (Windows), curl/wget (Linux), Edge/Chromium.
- **Integrações:** `raw.githubusercontent.com`.
- **Como funciona:** compara versão; baixa núcleos e nativos primeiro (tamanho conferido); troca html/exe; apaga núcleos
  fora da lista; abre `kofservico` e `kofnativo` (job object no Windows, religa até 5x) e o navegador com flags; fecha
  tudo junto com o navegador. Conexão a todos os IPv4 em paralelo (rede do Marcelo).
- **Problemas:** sem assinatura/hash (P8); lógica de supervisão de processos duplicada em C e sh; dependência de flags.
- **Migração:** RS — *updater* assinado (Tauri updater ou módulo próprio) + supervisor de processos em Rust. O
  lançador antigo continua publicando pro app antigo.

### 2. Telas, navegação e Voltar
- **Descrição:** ~20 telas sobrepostas (`#home`, `#biblioteca`, `#estados`, `#jukebox`, `#estatisticas`, `#guia`,
  `#teclas`, `#temas`, `#visual`, `#molduras`, `#bios-tela`, `#aparelhos`, `#jogadores`, `#modo-tela`, `#abertura`...).
- **Onde:** `pagina.html` (568 l.), `abrirTela/voltar/sairDaTela` (`app.js:4060-4087`), `fecharJanelas` (`3612`).
- **Como funciona:** cada tela é um elemento `hidden`; histórico do Voltar por `MutationObserver`; o jogo pausa com
  qualquer tela aberta; botão direito = Voltar; Esc volta ao jogo.
- **Problemas:** estado de navegação implícito no DOM; regras de pausa acopladas à visibilidade.
- **Migração:** UI — pilha de telas numa store (sem React Router no começo), "jogo pausa se pilha não vazia" como regra
  do APP.

### 3. Navegação por controle (Controle total)
- **Descrição:** fora do jogo, o direcional do controle/celular move o foco para o botão mais próximo; A clica, B volta.
- **Onde:** `telaDoPad/escolherPad/moverPad/navegarPad` (`app.js:3618-3736`), `TELAS_PAD`, `.foco-pad`.
- **Problemas:** cálculo geométrico sobre o DOM; desligamentos por casos especiais.
- **Migração:** UI — hook de foco espacial genérico (componentes marcam `focusable`); entrada vem do serviço de input.

### 4. Início e modo sofá
- **Onde:** `abrirHome/montarHome/homeTecla` (`app.js:3982-4060`), `fraseHome/novaDica`, `modoSofa` (`3271`).
- **Como funciona:** "continuar", últimos jogos, dicas, cartão de BIOS, música do Início.
- **Migração:** UI pura sobre casos de uso (`ultimosJogos`, `continuar`).

### 5. Abertura da 1ª vez
- **Onde:** `app.js:2116-2204` (`AB_TEMAS`, `abFilme`, `abGuia`); `kofnes.boasVindas`; `window.__kofAbertura` nos testes.
- **Migração:** UI; condição "biblioteca vazia e nunca viu" no APP.

### 6. Biblioteca de jogos
- **Descrição:** milhares de jogos, lotes de 150, ficha com capa, metadados, Jogar/Estados; celular em tela cheia.
- **Onde:** `montarItens/juntarItens/montarLista/adicionarLis/mostrarInfo/jogar/abrirJogo/mostrarBiblioteca`
  (`app.js:3153-3612`); loja `jogos` (metadados, prints) e `roms` do IndexedDB.
- **Problemas:** lista montada com DOM manual; registro de jogo sem esquema (campos `id`, `sistema`, `crc`, `zip`,
  `traducao`, `faixa`...).
- **Migração:** DOM (`Game`), APP (`listarBiblioteca`, `abrirJogo`), UI (lista virtualizada), RS (índice dos arquivos).

### 7. Busca, filtros e base de jogos
- **Onde:** `web/jogos.js` (`KofJogos.carregar/info/crcRom`), base `nucleos/jogos-<hash>.js` (gzip base64 de
  `web/jogos/jogos.json.gz`, CC BY-SA), `metaDe/consulta/passa/ordenar` (`app.js:3304-3353`), `FACETAS`, `CAMPOS`,
  `ORDENS`, `preencherCrcs` (`3467`).
- **Como funciona:** CRC32 No-Intro (sem cabeçalho 512/iNES), título normalizado, set do Neo Geo; texto livre +
  `campo:valor`; facetas com contagem.
- **Migração:** DOM puro (consulta testável em Vitest) + UI. Gerador `montar.py` continua em Python (ferramenta).

### 8. Capas
- **Onde:** `nomesCapa/baixarCapa/capaPorNome` (`app.js:3182-3270`), loja `capas`, `ACERVO` por sistema.
- **Integrações:** `libretro-thumbnails` no GitHub.
- **Migração:** APP + RS (cache em disco, download no backend com limite).

### 9. Pasta Kof Games
- **Descrição:** árvore fixa `Kof Games/{KOFstation, Games/<sistema>, Novos, Config/bios, Saves}`; organizar move jogos
  soltos/novos/na pasta errada (CD .cue+.bin junto); copiar o que vem de fora.
- **Onde:** `varrer/lerPasta/garantirArvore/permissaoRaiz/organizar/arrumar/guardarNaArvore/escolherRaiz`
  (`app.js:2968-3153`); handle no IndexedDB; Android: `Pasta.java` (SAF, Range).
- **Dependências:** File System Access (só Chromium).
- **Problemas:** operações de arquivo em JS com permissões do navegador; ler o handle de volta derruba o headless.
- **Migração:** **RS** — é o caso clássico do backend nativo: varredura, mover, copiar, observar mudanças, permissões.
  Comandos `library.scan`, `library.organize` com plano (dry-run) + execução.

### 10. Abrir arquivo, zip, CD e detecção de sistema
- **Onde:** `itensDoZip/cdDoZip/lerZip` (`app.js:1875-1943`), `binsDoCue/cueDasFaixas/abrirCdSolto/bytesDoJogo/abrirArquivo`
  (`2204-2319`), `abrirBytes` (`2456`), `KofLibretro.sistemaDe` (`nucleo.js:119`), `ehPs2` (`ps2.js`), `cdPs1`.
- **Como funciona:** extensão + conteúdo (SYSTEM.CNF, tamanho, cabeçalho Neo Geo por CRC); CD grande vai pro MEMFS sem
  cópia; zip lido aos pedaços do Blob.
- **Problemas:** `abrirBytes` faz tudo (P2).
- **Migração:** DOM (`detectSystem(arquivo)` puro e testável), APP (`abrirJogo`), RS (acesso ao arquivo/CD aos pedaços).

### 11. BIOS
- **Onde:** `ehBiosPs2/escolherBios/biosGuardadas/listarBios/abrirBiosTela/carregarBios/pedirBios` (`app.js:2341-2456`);
  loja `bios`; `SISTEMAS[x].bios`; `KofLibretro.bios()` grava em `/sistema/`; PS2 por conteúdo (4–8 MB + ROMDIR).
- **Migração:** APP + RS (BIOS em `Kof Games/Config/bios`, conferência por hash/tamanho).

### 12. Núcleos libretro em WebAssembly
- **Onde:** `nucleo-libretro/construir.sh`, `ponte.cpp`, `*-sonda.patch`, `libco-emscripten.c`; `web/nucleo.js`
  (`SISTEMAS`, `Consolinho`, `criar`, `buscar`, `tocador`, `opcao`, `estadoVivo`, `ARQUIVOS`).
- **Como funciona:** ver CURRENT_SYSTEM_MAP §3. `lr_*` exportadas; imagem/som lidos do `HEAPU8`; núcleo carregado por
  `<script>` sob demanda; opções padrão do `SET_VARIABLES` guardadas como o RetroArch faz.
- **Problemas:** contrato "imita o Kof" (P6); wasm em base64 (P4); 2 emscripten.
- **Migração:** ENG — **mesmos binários wasm** (manifesto por hash), adaptador `WasmLibretroCore implements CoreSession`
  rodando num Worker. A `ponte.cpp` continua sendo o frontend libretro.

### 13. Núcleo Kof do SNES
- **Onde:** `snes/*.kf`, `web/nucleo.kf`, `estado.js` (savestate por grafo de objetos), `nucleoSnes()` (`app.js:2418`).
- **Situação:** opcional desde 25/10 (Snes9x é o padrão no PC: 5,5 → 1,1 ms por quadro).
- **Migração:** ENG — adaptador `KofCore`, artefato JS gerado fora do repositório novo (o compilador com patch fica no
  antigo). Baixa prioridade; manter como "laboratório da linguagem".

### 14. PS2 nativo (kofnativo + LRPS2)
- **Onde:** `pc-nativo/kofnativo.c`, `construir.sh`, `construir-windows.sh`, `lrps2-windows.patch`; `web/ps2.js`
  (`conectarNativo`, `fachadaNativa`, `quadroNativo`); `docs/depurar-ps2-no-pc.md`.
- **Como funciona:** processo separado com SDL2/OpenGL; WS 8643; disco lido pela página aos pedaços (`ler`/'D'),
  BIOS, pasta de saves num pacote, savestate 'E', filtro da página convertido pra GLSL 3.30; **modo página**: sem janela,
  quadros RGB pela WS ('Q') e a página desenha com os filtros.
- **Problemas:** sem conferência de Origin (P7); quadro trafega por WebSocket (cópia + latência); Windows sem teste real.
- **Migração:** RS supervisiona o kofnativo atual como *sidecar* (sem reescrever); contrato tipado no Rust; depois
  avaliar trazer o frontend libretro nativo pra Rust (carregar `.so` via `libloading`) — decisão futura, não agora.

### 15. PS2 em wasm (Play!)
- **Onde:** `nucleo-ps2/`, `web/ps2.js`. Reserva quando não há kofnativo; precisa SharedArrayBuffer.
- **Migração:** adiar; reavaliar quando a origem própria (P4) liberar SAB sem flag.

### 16. PS1 e N64 nativos no celular
- **Onde:** `android/nativo/kofnativo.c` (compilado 2x: `-DCLASSE=Ps1` / `-DCLASSE=N64 -DKOF_GL`), `Ps1.java`,
  `Ps1Jogo.java`, `N64.java`, `N64Jogo.java`, `android.js` (`NATIVO`, `fachada`), `.so` do LemuroidCores.
- **Como funciona:** SurfaceView/GLSurfaceView por baixo/cima da WebView; AudioTrack dita o ritmo; sem sinal da página
  por 250 ms = pausa.
- **Problemas:** sem filtros/molduras; bug aberto do N64 no celular (área 640x480 em celular 390).
- **Migração:** mantém a casca Java; o frontend novo fala com ela pelo mesmo tipo de adaptador (`NativeAndroidCore`).

### 17. Laço de emulação e desempenho
- **Onde:** `laco` (`app.js:1141`), `rodarQuadro` (`1708`), `mostrarDesempenho/alternarDesempenho` (`1197-1225`),
  `QUADRO_MS`, pular quadros (`lr_audio_status`).
- **Problemas:** linha principal (P5).
- **Migração:** ENG — Worker + AudioWorklet (o "motor novo" já combinado com o Marcelo), métricas expostas por evento.

### 18. Vídeo, escala, proporção, paletas
- **Onde:** `tamanhoTela/pintar/conferirTela/ajustarEscala/mudarProporcao/mudarPaletaGb/mudarPaletaNes`
  (`app.js:198-698`); resolução dinâmica (Sega/PS1).
- **Migração:** ENG (renderizador WebGL) + UI (opções).

### 19. Painel de imagem
- **Onde:** `web/visual.js` (591 l.: 61 ajustes, 42 predefinições, `PASSOS`, `fonte()`, `chave()`, `custo()`),
  `gl*` (`app.js:50-197`), `montarSimples/montarAvancado/...` (`303-497`); por console e por jogo; `.kofvisual`.
- **Como funciona:** shader sob medida por combinação (constantes), passadas NTSC/Scale4x/bloom em framebuffers,
  prévia por `readPixels`. **O Marcelo aprovou filtros e efeitos: não mexer no visual.**
- **Migração:** ENG — copiar `visual.js` praticamente intacto (é TS-izável e sem DOM), UI nova só no painel. Teste de
  regressão: comparar pixels contra o app antigo com a mesma cartela.

### 20. Molduras
- **Onde:** `web/molduras.js` (15 SVG gerados), `app.js:504-615`, moldura PNG própria (loja `c`).
- **Migração:** UI (SVG em componente) + ENG (bordas/escala).

### 21. Som e volume
- **Onde:** `ligarSom/mudarVolume/avisarMudo/marcarSom/empurrarSom` (`app.js:698-797`), mudo `M`.
- **Problemas:** `ScriptProcessorNode` (obsoleto).
- **Migração:** ENG — AudioWorklet + anel de amostras.

### 22. Controles e teclas
- **Onde:** `acoesDe/juntarCamada/mapaDe/aplicarControles/eixosDoTeclado/tecladoBits/montarGrade/capturar`
  (`app.js:797-964`); `NOMES_BOTAO`, `EIXOS_TECLA`, `BOTOES`; chaves `kofnes.teclas[.<sis>|.jogo.<id>]`, `kofnes.botoes...`.
- **Como funciona:** três camadas (geral → console → jogo), tecla repetida sai da ação antiga; analógico no teclado
  para PS1/PS2/N64; bits no formato do SNES traduzidos pelo `LIGACAO` do `nucleo.js`.
- **Migração:** DOM (`InputMap` com resolução de camadas genérica), APP, UI (tela de mapeamento). Formato de bits SNES
  vira um "pad virtual" do domínio.

### 23. Jogadores 2 a 4
- **Onde:** `web/jogadores.js` (`jogadorDe`, `lerJogadores`, tela `#jogadores`), `ponte.cpp` (`lr_pad_n`, `lr_eixos_n`,
  `lr_dispositivo_n`, `JOGADORES=4`).
- **Migração:** APP (atribuição de aparelho → jogador) + ENG (portas do núcleo).

### 24. Controle virtual de toque
- **Onde:** `web/android.js` (595 l.), `android.css` (6 modelos em CSS, multitoque, rótulos por console).
- **Migração:** UI específica do celular (componente), entrada pelo mesmo serviço de input.

### 25. Celular como controle (antigo)
- **Onde:** `ControleServidor.java` (WS 8642, senha 4 dígitos, 6 bytes por mudança), `conectarControle` etc. (`app.js:1000-1053`).
- **Migração:** **não migrar como está**: a rede (#26) já faz isso pareado e cifrado (canal `pad`). Manter no app
  antigo até a nova estar validada.

### 26. Rede entre aparelhos
- **Onde:** `rede/kofrede.c` (núcleo cripto sem E/S), `rede/kofservico.c` (TCP/UDP 8650, WS 8644), `rede/jni.c`,
  `Rede.java`, `RedeNucleo.java`, `web/rede.js` (tela `#aparelhos`, QR), `rede/PROTOCOLO.md`, `docs/rede-plano.md`;
  testes `rede/teste/`.
- **Como funciona:** CPace (código 6 dígitos/QR) → 3DH → XChaCha20-Poly1305; canais por nome; API local JSON igual no
  PC e no celular.
- **Migração:** **RS** — candidato natural (o próprio PROTOCOLO.md prevê reescrita em Rust passando nos testes de
  `rede/teste/`). Opção conservadora: Rust chama o `kofrede.c` por FFI (crate `cc`) e reescreve só o serviço.

### 27. Jogar no PC (WebRTC), Controle total no celular, Modo Switch
- **Onde:** `web/jogarpc.js` (canal `jogo`: `pedir`, `oferta`, `resposta`, `fim`; canal de dados `botoes` 6 bytes;
  `acaoDoCelular`, `menuParaCelular`, `levarProCelular`), `android.js` (`entrarModoControle({pc, jogo})`, `.mc-atalhos`,
  `puxarVideo`).
- **Dependências:** WebRTC nas duas pontas (H.264 preferido), `captureStream`.
- **Problemas:** **depende de WebRTC na WebView do PC** — ponto decisivo na escolha Tauri/WebKitGTK.
- **Migração:** APP (sinalização pela rede do RS) + ENG (captura do canvas + áudio) + UI.

### 28. Menu rápido
- **Onde:** `montarRapido/abrirRapido/fecharRapido/rapidoTecla` (`app.js:3736-3824`), `ITENS_RAPIDO`, `itemRemoto`.
- **Migração:** UI; itens declarados como dados (já são), ações chamam casos de uso.

### 29. Modos de jogo
- **Onde:** `MODOS` (alegria/normal/raiz/hardcore), `aplicarModo/mudarModo` (`app.js:1831`), `perguntarModo/escolherModo/
  montarOpcoesEmu` (`2778-2845`), `OPCOES_EMU`.
- **Migração:** DOM — política pura (`canRewind`, `canSaveState`, `rewindLimit`, `maxStates`...) testável.

### 30. Savestates + salvar automático
- **Onde:** `salvarEstado/limitarEstados/carregarEstado/continuar/estadosDe/carregarUltimo/mostrarEstados`
  (`app.js:2845-2968`), `salvarAuto` (`2756`); lojas `estados` (gzip) e `autos`; `estado.js` (Kof);
  `serializar` (libretro); async no PS2/nativos; `nucleoDoEstado` (estado de outro núcleo reabre no certo).
- **Migração:** APP + RS (estados como arquivos em `Kof Games/Saves/<sistema>/<jogo>/`), ENG (serializar).

### 31. Rebobinar
- **Onde:** `Rebobinador` (`estado.js:102`), `estadoVivo()` (`nucleo.js`, compara direto na memória do núcleo, blocos de
  16 KB), `novoRebob/marcarAmpulheta/rebobinarPasso/terminarRebobinar` (`app.js:1848-1875`); ampulheta 30 s
  (estilo Príncipe da Pérsia), limite por modo; desligado no PS1/PS2.
- **Migração:** ENG (dentro do Worker, junto do núcleo, para não copiar estado entre threads). Teste:
  `testes/node/rebob.cjs` e `testes/navegador/rebob.cjs` como especificação.

### 32. Saves de bateria e backup `.kofsave`
- **Onde:** `web/guarda.js` (`KofGuarda`: gzip sem fim 0xFF, hash, `decidir`, pacote `KOFSAVE1`),
  `textoSram/salvarSram/assentarSave/lerSave/assentarRascunhos` (`app.js:2512-2560`), `exportarSaves/importarSaves`
  (`2639-2704`); rascunho no localStorage → loja `saves`; `SavesNativos.java`.
- **Problemas:** chaves diferentes PS1 PC × `.mcd` do celular (pendência da "Fase 3"); tudo no perfil do navegador.
- **Migração:** DOM (`guarda.js` quase direto pra TS, já é testado no Node) + RS (arquivos). **O `.kofsave` é a ponte de
  migração de dados do app antigo para o novo.**

### 33. Estatísticas
- **Onde:** `registrarTempo/contarSessao/duracao/carregarEstat/mostrarEstat` (`app.js:2560-2623`), `guarda.js`
  (`partes[aparelho]`, dias → meses, `horas[24]`), loja `stats`.
- **Migração:** DOM + APP + UI.

### 34. Jukebox
- **Onde:** `tocadorSnes/jukeEncher/jukeCarregar/jukeTocar/.../exportarWav/montarJuke/montarOndas/desenharOndas/
  analisarNotas/desenharNotas/desenharVozes` (`app.js:1225-1700`), `spc.js`, loja `musicas`, sondas nos 6 núcleos,
  `KofLibretro.tocador` (instância separada do núcleo).
- **Como funciona:** guarda o *estado* do jogo no momento da música; toca numa segunda instância sem imagem; mudo/solo
  por canal; osciloscópio; .spc no SNES; .wav.
- **Migração:** ENG (tocador em Worker/AudioWorklet) + UI (visualização em canvas). Depende de #12 e #21.

### 35. Música própria
- **Onde:** `musica.js` (8 bits), `somfm.js` + `nucleo-libretro/somfm.c` (FM), `musicas/fm/trilha.py`, `trilha.js`,
  violino Opus (`nucleos/violino-<hash>.js`), `tocadorViolino/tocadorMusica/tocarMusica` (`app.js:2026-2116`).
- **Migração:** ENG + UI; o gerador `trilha.py` continua em Python (ferramenta de dados).

### 36. Temas
- **Onde:** `estilo.css` (1.649 l., 126 temas por `[data-tema]` com tokens `--fundo`, `--painel`, `--texto`,
  `--destaque`...), `TEMAS` e `experimentar/achaTema/temasFiltrados/montarCategorias/montarTemas/passarTema/
  iniciarShowcase` (`app.js:4235-4350`), testes de contraste WCAG (`testes/node/contraste.cjs`).
- **Migração:** UI — **reaproveitar os tokens CSS como estão** (são o sistema de design pronto); componentes React
  usam só tokens. Teste de contraste migra pra Vitest.

### 37. Patches de tradução
- **Onde:** `web/patch.js` (IPS/BPS/UPS, CRC conferido), `escolherRom/aplicarPatch` (`app.js:2319-2341`).
- **Migração:** DOM puro (já sem DOM; conferido contra o Flips) → TS + Vitest.

### 38. Caçador de bugs + replay
- **Onde:** `novoMarco/marcarCacador/abrirBug/enviarBug/assinatura` (`app.js:1719-1796`), `bugs/reproduzir.cjs`; pacote
  `kofbug-*.json.gz` (estado + botões quadro a quadro).
- **Migração:** APP + ENG. Útil também como ferramenta de comparação app antigo × novo.

### 39. Aviso de atualização
- **Onde:** `procurarAtualizacao/avisarSeAtualizou` (`app.js:1796-1831`).
- **Migração:** APP + RS (updater).

### 40. Guia
- **Onde:** `abrirGuia/mostrarPaginaGuia` (`app.js:4094`). **Migração:** UI (conteúdo como dados/markdown).

### 41. PWA
- **Onde:** `web/pwa/manifest.webmanifest`, `sw.js`. **Migração:** adiar (o Vite tem plugin se for preciso).

### 42. Perfil `.kofperfil`
- Fora da main por decisão do Marcelo (copiava `mudo`). **Não migrar**; o `.kofsave` cobre o caso.

---

## Ganchos de teste (comportamento observável a preservar)

`window.KOFnes` (`app.js:4534`) expõe `desempenho`, `controle`, `guarda`, `imagemTeste`, `mudarMoldura`, `abrirArquivo`,
`estado`, `nucleo`, `botoes`, `mapa`, `controles`, `filtro`, `aplicarFiltro`, `aplicarVisual`, `notaDoCanal`, `notas`,
`mudarSinc`, `auto`, `webgl`, entre outros; também `window.__rede`, `window.__kofRemoto`, `window.__kofModo`,
`window.__kofAbertura`. Os ~85 testes dependem disso. No app novo, o equivalente deve ser **uma API de teste explícita,
só no build de teste**, não um objeto global no build de produção.
