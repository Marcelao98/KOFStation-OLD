# KOFstation — Mapa do sistema atual (Fase 1)

> Base: `main` `ceba493` (202610262214). Diagramas em Mermaid. Complementa o `docs/arquitetura.md` (que continua válido
> e explica os conceitos: libretro, wasm, sonda, determinismo).

## 1. Processos e portas em execução (PC)

```mermaid
flowchart LR
  subgraph PC
    L[KOFstation.exe / kofnes.sh<br/>lançador + atualizador]
    B["Edge/Chromium --app=file://KOFstation.html<br/>perfil %LOCALAPPDATA%\\KOFnes"]
    KN["kofnativo<br/>(SDL2 + OpenGL + LRPS2)"]
    KS["kofservico<br/>(rede entre aparelhos)"]
    FS[(Kof Games/<br/>Games, Novos, Config/bios, Saves)]
    IDB[(IndexedDB kofnes v8<br/>+ localStorage kofnes.*)]
  end
  GH[(raw.githubusercontent.com<br/>publicado/)]
  CEL[Celular: APK KOFstation]

  L -- "versao.txt, html, exe,<br/>nucleos/, nativo/" --> GH
  L -- "abre e supervisiona" --> B
  L -- "abre (job object / kill)" --> KN
  L -- "abre" --> KS
  B -- "WS 127.0.0.1:8643<br/>texto + binário Q/E/M/D" --> KN
  B -- "WS 127.0.0.1:8644<br/>JSON (API local)" --> KS
  B -- "File System Access" --> FS
  B --- IDB
  KS <-- "TCP 8650 cifrado<br/>UDP 8650 achar" --> CEL
  B <-. "WebRTC (vídeo/som/botões)<br/>sinalização pelo canal 'jogo'" .-> CEL
  CEL -. "WS :8642 (controle antigo)" .-> B
```

## 2. Build e publicação

```mermaid
flowchart TB
  subgraph Fontes
    SNES[snes/*.kf] ; WEB[web/*.js, pagina.html, estilo.css] ; PONTE[nucleo-libretro/ponte.cpp + *-sonda.patch]
    PCN[pc-nativo/kofnativo.c] ; REDE[rede/*.c] ; AND[android/src/*.java, android/nativo/*.c]
  end
  SNES -->|"kof build --target js (Kof 0.6.3 + patch)"| KOFJS[Default.mjs + runtime]
  PONTE -->|"construir.sh: git clone @commit, emmake, emcc SINGLE_FILE"| NUC["nucleo-libretro/saida/#lt;núcleo#gt;.js<br/>(fora do git)"]
  KOFJS & WEB & NUC -->|"juntar.py (substituição de texto)"| HTML["dist/web/KOFnes.html (PC)<br/>KOFnes-android.html (celular)<br/>nucleos/#lt;núcleo#gt;-#lt;sha8#gt;.js"]
  WEB -->|"mingw: lancador_win.c"| EXE[KOFstation.exe]
  PCN -->|"construir.sh / construir-windows.sh<br/>SDL2 2.30.9 + LRPS2"| PCNS[kofnativo, pcsx2_libretro.so/.dll]
  REDE -->|"rede/construir.sh"| KSS[kofservico, kofservico.exe, libkofrede.so]
  AND -->|"construir-apk.sh (aapt, dx, apksigner)<br/>+ .so do LemuroidCores"| APK[android/apk/KOFstation.apk]
  HTML & EXE & PCNS & KSS -->|"publicar.sh"| PUB["publicado/ (no git, 55 MB)<br/>versao.txt + android/versao.txt"]
```

Observação: `web/compilar-sem-kof.sh` + `testes/montar-sem-kof.sh` montam o html reaproveitando o núcleo Kof e os
núcleos já publicados (sem compilador Kof nem emscripten) — é o caminho usado na prática nas últimas publicações.

## 3. Como um jogo abre (PC, núcleo wasm)

```mermaid
sequenceDiagram
  actor U as Usuário
  participant UI as app.js (UI)
  participant N as nucleo.js (KofLibretro)
  participant W as nucleos/#lt;núcleo#gt;.js (wasm + ponte)
  participant DB as IndexedDB
  U->>UI: escolhe arquivo / jogo da biblioteca
  UI->>UI: abrirArquivo → zip? CD? patch? .kofsave? (itensDoZip, binsDoCue)
  UI->>UI: abrirBytes: sistemaDe(nome/conteúdo), modo de jogo, BIOS
  UI->>N: novoNucleo → KofLibretro.criar(bytes, sis)
  N->>W: buscar(núcleo): #lt;script src="nucleos/...-hash.js"#gt;
  W-->>N: Nucleo_#lt;núcleo#gt;() (instância)
  N->>W: lr_var(opções), lr_arquivo(/sistema/bios), lr_init, lr_load(rom)
  W-->>N: lr_info: largura, altura, fps, taxa de áudio
  N-->>UI: Consolinho {pad, runFrame, ppu.frame, rgba, serializar...}
  UI->>DB: registro do jogo (crc), lerSave → cart.sram, estatísticas
  UI->>UI: aplicarControles, aplicarVisual, ligarSom, laco()
  loop a cada requestAnimationFrame
    UI->>N: rodarQuadro: lr_pad_n/lr_eixos_n → lr_run
    N-->>UI: imagem (HEAPU8) → WebGL · áudio → fila do ScriptProcessor
    UI->>N: rebobinador.foto (estadoVivo, blocos de 16 KB)
  end
```

## 4. PS2 nativo em "modo página"

```mermaid
sequenceDiagram
  participant P as ps2.js (página)
  participant K as kofnativo (127.0.0.1:8643)
  participant C as LRPS2 (pcsx2_libretro)
  P->>K: WS connect (sem token, sem Origin conferido)
  P->>K: bios + binário · sistema #lt;opção#gt; · cartao + binário (pasta de saves)
  P->>K: modo pagina · abrir #lt;tamanho#gt · #lt;nome#gt;
  K->>C: retro_load_game(kof://disco/nome) — VFS próprio
  loop leitura do DVD
    C->>K: vfs read
    K->>P: ler #lt;id#gt · #lt;início#gt · #lt;tamanho#gt;
    P->>K: binário 'D' #lt;id#gt · #lt;dados#gt · (File.slice, blocos de 1 MB com cache)
  end
  K-->>P: pronto #lt;l#gt · #lt;a#gt · #lt;fps#gt;
  loop cada quadro
    P->>K: pad #lt;botões#gt · #lt;eixos#gt;
    K-->>P: binário 'Q' #lt;l u16#gt;#lt;a u16#gt;#lt;RGB#gt · (PBO assíncrono, só o mais novo)
    P->>P: desenha no WebGL com o filtro da página
  end
  P->>K: estado → 'E' (savestate)  · pedecartao → 'M'
```

## 5. Atualização (lançador do Windows)

```mermaid
flowchart TD
  A[abre KOFstation.exe] --> B{fonte.txt?}
  B -->|nao-atualizar| Z[abre o navegador]
  B -->|outra fonte / padrão GitHub| C[DNS → IPv4s, conecta em todos, usa o 1º que responde]
  C --> D[baixa versao.txt via curl.exe --resolve]
  D --> E[nucleo=: baixa os que faltam / tamanho errado]
  E --> F[nativo_windows=: kofnativo.exe, pcsx2_libretro.dll, kofservico.exe]
  F --> G{todos vieram e versao maior?}
  G -->|sim| H[baixa html, confere tamanho + '#lt;!doctype html', troca]
  G -->|não| I[mantém a versão local]
  H & I --> J{lancador= maior?}
  J -->|sim| K[baixa exe novo, renomeia o atual .old]
  J -->|não| L[apaga núcleos fora da lista]
  K --> L --> M["abre kofservico, kofnativo (job KILL_ON_JOB_CLOSE) e o Edge --app"]
  M --> N[religa kofnativo até 5x; fecha tudo junto com o Edge]
```

Nenhum passo confere assinatura ou SHA-256 (só tamanho e cabeçalho).

## 6. Android

```mermaid
flowchart LR
  subgraph APK["APK dev.kofnes.android (CASCA 14)"]
    MA[MainActivity] --> WV["WebView https://appassets.androidplatform.net/<br/>KOFnes-android.html (assets ou files/web/atual)"]
    MA --> BR["window.KOFnesApk (32 métodos)<br/>redeCmd, salvar, pasta*, controle*, saves*, ps1*, n64*"]
    MA --> AT[Atualizador.java<br/>publicado/android/versao.txt]
    MA --> PA[Pasta.java SAF + /pasta?u= com Range]
    MA --> CS[ControleServidor.java WS 8642]
    MA --> RD[Rede.java + libkofrede.so]
    MA --> P1["Ps1Jogo: libkofps1.so + libretro.so (PCSX ARM64)<br/>SurfaceView + AudioTrack"]
    MA --> N6["N64Jogo: libkofn64.so + libn64.so (Mupen GLES3)<br/>GLSurfaceView"]
  end
  WV <--> BR
```

## 7. Dados do usuário (onde mora cada coisa)

```mermaid
erDiagram
  INDEXEDDB_kofnes_v8 ||--o{ jogos : "keyPath id (metadados, prints, crc, sistema)"
  INDEXEDDB_kofnes_v8 ||--o{ roms : "bytes (exceto CDs/PS2)"
  INDEXEDDB_kofnes_v8 ||--o{ estados : "n auto, índice jogo (gzip)"
  INDEXEDDB_kofnes_v8 ||--o{ autos : "estado automático"
  INDEXEDDB_kofnes_v8 ||--o{ saves : "keyPath chave (KofGuarda)"
  INDEXEDDB_kofnes_v8 ||--o{ stats : "keyPath id"
  INDEXEDDB_kofnes_v8 ||--o{ capas : "nome → Blob"
  INDEXEDDB_kofnes_v8 ||--o{ musicas : "jukebox"
  INDEXEDDB_kofnes_v8 ||--o{ bios : "arquivo → {sistema, dados}"
  INDEXEDDB_kofnes_v8 ||--o{ c : "diversos (moldura própria, handle da pasta)"
  localStorage ||--o{ kofnes_chaves : "configs + rascunho de save"
  KofGames ||--o{ Games_sistema : "ROMs organizadas"
  REDE_dir ||--|| identidade_bin : "~/.local/share/KOFnes/rede (fora da Kof Games)"
```

## 8. Fronteiras e contratos que existem hoje

| Fronteira | Contrato | Documentado? | Tipado? |
|---|---|---|---|
| app.js ↔ núcleo | "cara do núcleo Kof" (`pad`, `runFrame`, `ppu.frame`, `rgba`, `serializar`, `nativo`...) | parcialmente (`docs/arquitetura.md §5`) | não |
| JS ↔ wasm | funções `lr_*` da `ponte.cpp` | comentários no .cpp | C |
| página ↔ kofnativo | linhas de texto + binários 'Q','E','M','D' | cabeçalho do `kofnativo.c` | não |
| página ↔ kofservico | JSON da API local | `rede/PROTOCOLO.md` | não |
| aparelho ↔ aparelho | protocolo kofrede v1 | `rede/PROTOCOLO.md` (completo) | binário especificado |
| página ↔ APK | `window.KOFnesApk.*` + callbacks `window.__*` | não | não |
| lançador ↔ GitHub | `versao.txt` chave=valor | `docs/arquitetura.md §7` | não |
| app ↔ dados | IndexedDB v8 + `kofnes.*` | parcial (CLAUDE.md) | não |
| jogarpc (PC ↔ celular) | mensagens `pedir/oferta/resposta/fim/acao/menu/levar` + 6 bytes | CLAUDE.md | não |
