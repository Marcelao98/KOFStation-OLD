# KOFstation — Plano de migração (Fase 1, para revisão)

> Este documento **propõe**; nada foi implementado nem instalado. As decisões marcadas **D#** viram entradas do
> `docs/DECISIONS.md` do repositório novo depois que forem aprovadas.

## 1. Estratégia: "estrangulamento" com o app antigo vivo

- O repositório atual (`Marcelao98/KOFStation`) **continua sendo o produto** e continua publicando pelo atualizador
  atual, sem mudança, até o app novo ter paridade nas funcionalidades que o Marcelo usa.
- O repositório novo (proposta: `Marcelao98/kofstation-next`, nome a decidir) nasce vazio, com a infraestrutura mínima, e
  recebe as funcionalidades em **fatias verticais** (cada fatia: domínio + caso de uso + UI + teste + comparação com o
  antigo).
- Os **núcleos não são recompilados no começo**: o app novo consome os mesmos artefatos (`nucleos/<núcleo>-<hash>.js`,
  `kofnativo`, `pcsx2_libretro`, `kofservico`) por um manifesto com hash. O build dos núcleos migra depois, para CI.
- Canal de atualização **separado** (o lançador antigo nunca baixa o app novo por engano).

## 2. Decisões propostas

| ID | Decisão | Recomendação | Por quê | Alternativas |
|---|---|---|---|---|
| **D1** | RetroArch | **Não introduzir.** Manter os frontends libretro próprios (`ponte.cpp`, `kofnativo.c`, nativo Android) | O projeto nunca usou RetroArch; jukebox por canal, rebobinar na memória do núcleo, imagem com filtros da página, PS2 modo página e disco aos pedaços dependem do frontend próprio | RetroArch como processo externo (perde tudo isso e muda a experiência); `libretro` via RetroArch CLI só pra cores raros (não há caso hoje) |
| **D2** | Casca desktop | **Decidir por *spike* medido** (Fase 4) entre **(A) Tauri 2** e **(B) Rust local + Chromium em modo app**. Preferência inicial: **A no Windows/Android-futuro se passar no Linux; senão B** | No Windows o Tauri usa WebView2 (Chromium, o mesmo motor de hoje). No Linux usa **WebKitGTK**, que precisa provar: wasm pesado (PS1/N64/Neo Geo) a 60 fps, WebGL2 com as passadas do visual, Gamepad API, AudioWorklet e **WebRTC** (o "Jogar no PC" depende disso; WebKitGTK costuma vir com WebRTC limitado ou desligado) | (C) Electron: motor igual em tudo, mas +~100 MB por instalação e um runtime Node que não precisamos; (D) continuar com `file://` (mantém todos os problemas P4) |
| **D3** | Onde a emulação roda | **No frontend (wasm em Web Worker)** pros núcleos wasm; **no Rust/nativo** só pros nativos (PS2 hoje) | É o que já funciona em todas as plataformas, inclusive Android; trazer todos os núcleos pra nativo perderia filtros/molduras e duplicaria trabalho por SO | Tudo nativo no Rust (libretro em Rust + quadros pra WebView): latência e cópia de quadro, perde a portabilidade |
| **D4** | Camadas no TS | `domain` (puro) · `app-core` (casos de uso) · `engine` (laço/vídeo/áudio/núcleos, sem React) · `apps/desktop` (React) | Separa o que precisa de 60 fps imperativo (engine) do que é tela (React); domínio testável no Node | Tudo dentro de `apps/desktop/src/features` (mais simples, mas mistura engine com React) |
| **D5** | Estado global | **Zustand** para sessão/telas/preferências; engine publica eventos e não depende de store | 1 dependência pequena, sem *boilerplate*; dá pra ler/escrever fora de componentes (a engine e os casos de uso precisam) | Context + `useSyncExternalStore` próprio (zero dependência, mais código); Redux Toolkit (pesado demais) |
| **D6** | Roteamento | **Sem React Router no início**: pilha de telas numa store | O app é usado com controle/TV, sem barra de endereço; as ~20 telas são sobreposições com "Voltar" — uma pilha modela isso direto | React Router com `MemoryRouter` (reavaliar se surgirem URLs profundas, ex.: abrir jogo por link) |
| **D7** | Dados do usuário | **Arquivos** em `Kof Games/` (Saves, Config) geridos pelo Rust + **importação `.kofsave`** do app antigo | Origem nova não enxerga o IndexedDB antigo (P10); arquivos sobrevivem a troca de app/navegador e já estão no plano da rede (etapa 2) | Ler o LevelDB do perfil do Chromium pelo Rust (frágil, formato interno) |
| **D8** | Contrato front ↔ back | **Comandos nomeados e tipados** (serde ↔ TS gerado) + eventos; erros como `{code, message, details}` enumerados | Evita que o React chame qualquer coisa do sistema; erros específicos (não genéricos) | JSON livre (como hoje); gRPC (exagero) |
| **D9** | Geração de tipos TS a partir do Rust | **`ts-rs`** (ou `specta` se Tauri) — avaliar no spike | Uma fonte da verdade para os contratos | Escrever os tipos dos dois lados à mão + teste de contrato |
| **D10** | Rede entre aparelhos | Serviço em Rust que **reusa `kofrede.c` via FFI** primeiro; reescrever em Rust puro só com os testes de `rede/teste/` passando | O protocolo é criptográfico; reescrever cedo é risco sem ganho imediato | Reescrever já com crates (`x25519-dalek`, `chacha20poly1305`, `blake2`; o CPace/Elligator exige cuidado) |
| **D11** | PS2 nativo | O Rust **supervisiona o `kofnativo` atual** como *sidecar*, conversando por um canal com token; a página não fala mais direto com ele | Não reescrever o que funciona; fecha o buraco de segurança P7 | Portar o frontend libretro nativo pra Rust (`libloading` + SDL2/`wgpu`) — decisão futura |
| **D12** | Atualização | **Manifesto assinado** (Ed25519) com SHA-256 por arquivo; updater do Tauri se D2=A | Resolve P8 | Manter o modelo atual (não recomendado) |
| **D13** | Android | **Manter a casca Java atual** servindo o frontend novo (mesma ponte `KOFnesApk`, encapsulada num adaptador TS); Tauri mobile só depois | A casca tem PS1/N64 nativos com Surface; trocar agora é risco alto | Tauri 2 Android desde o início (exige reescrever PS1/N64 como plugin Kotlin) |
| **D14** | Licença do repositório novo | **GPL-3.0** + `THIRD_PARTY.md` (com as 3 licenças não comerciais destacadas) | Compatível com os núcleos GPL-2+/GPL-3 que são distribuídos juntos | Decisão é do Marcelo (e da Mel, pelo Kof) |
| **D15** | Monorepo e gerenciador | **pnpm workspaces** (TS) + **Cargo workspace** (Rust) no mesmo repositório | Um repositório, versões travadas (`pnpm-lock.yaml`, `Cargo.lock`) | npm/yarn; repositórios separados |

## 3. Estrutura proposta do repositório novo (refinada pela auditoria)

```
kofstation/
├── apps/
│   └── desktop/                 # React + Vite (a interface); também é o html do celular
│       └── src/
│           ├── app/             # bootstrap, providers, pilha de telas
│           ├── screens/         # Início, Biblioteca, Jogo, Estados, Jukebox, Temas, Controles, Aparelhos...
│           ├── components/      # botões, listas virtualizadas, foco por controle
│           ├── stores/          # Zustand: sessão, telas, preferências (lê do app-core)
│           ├── platform/        # adaptadores: tauri | android (KOFnesApk) | navegador (testes)
│           └── styles/          # tokens dos 126 temas (copiados do estilo.css)
├── packages/
│   ├── domain/                  # TS puro: Sistema, Jogo, Save, Estado, Config em camadas, Modos, Estatísticas, patch, busca
│   ├── app-core/                # casos de uso: abrirJogo, salvarEstado, importarBackup, organizarPasta...
│   ├── engine/                  # sem React: CoreSession, Worker do núcleo, AudioWorklet, WebGL + visual, rebobinar, jukebox
│   └── contracts/               # tipos gerados do Rust (comandos, eventos, erros)
├── crates/
│   ├── kof-core/                # domínio do backend: caminhos da Kof Games, manifesto, config em disco
│   ├── kof-files/               # varrer/organizar/copiar, saves e estados em arquivo
│   ├── kof-process/             # supervisor de sidecars (kofnativo, ...)
│   ├── kof-net/                 # serviço de rede (FFI kofrede.c no começo)
│   └── kof-update/              # manifesto assinado
├── src-tauri/                   # só se D2 = Tauri: comandos finos que chamam os crates
│   (ou crates/kof-service/)     # se D2 = Rust local + Chromium: servidor local com token
├── third_party/cores/           # manifesto.json (núcleo → hash → URL do release); binários fora do git
├── docs/  ARCHITECTURE.md · DECISIONS.md · API_CONTRACTS.md · MIGRATION_LOG.md
├── tests/e2e/                   # Playwright Test
└── tools/                       # Python: base de jogos, trilha FM, geradores de ROM de teste
```

Diferenças em relação à proposta original: `packages/engine` separado (o laço não pode depender do React);
`packages/domain`/`app-core` fora do app (testáveis sem navegador); `crates/` independentes do Tauri (o backend não
fica refém da decisão D2); `tools/` em Python mantém os geradores que já existem.

## 4. Fronteiras

| Pertence ao React (UI) | Pertence ao TS sem React (engine/app-core/domain) | Pertence ao Rust |
|---|---|---|
| Telas, componentes, temas, foco por controle, controle de toque, menus, painéis | Laço de emulação, núcleos wasm, vídeo/shaders, áudio, rebobinar, jukebox, regras (modos, camadas de config, busca, patches, saves `.kofsave`) | Arquivos e pastas (Kof Games), BIOS em disco, saves/estados em disco, configs em disco, processos nativos (PS2), rede entre aparelhos, atualização, logs em arquivo, detecção de dispositivos que a WebView não vê |

**Operações expostas ao frontend (rascunho do `API_CONTRACTS.md`):**

| Comando | Entrada | Saída | Erros |
|---|---|---|---|
| `app.info` | — | versão, SO, caminhos | — |
| `library.root.get/set` | caminho | `LibraryRoot` | `NotADirectory`, `PermissionDenied` |
| `library.scan` | raiz | lista de `RomFile {path, size, system?}` (stream de eventos `scan.progress`) | `RootMissing` |
| `library.organize.plan` / `.apply` | raiz | lista de movimentos / resultado | `Conflict{path}` |
| `file.read_range` | id do arquivo, início, tamanho | bytes | `NotFound`, `OutOfRange` |
| `bios.list/import` | arquivo | `BiosInfo {system, hash, ok}` | `UnknownBios` |
| `saves.read/write` | chave | bytes + `quando` | `NotFound` |
| `states.list/save/load/delete` | jogo, bytes | `StateMeta` | `QuotaExceeded` |
| `config.get/set` | chave tipada | valor | `InvalidValue` |
| `native.ps2.start/stop/command` | comandos do protocolo kofnativo, tipados | eventos `native.frame`, `native.state` | `SidecarMissing`, `SidecarCrashed{exit}` |
| `net.*` | os pedidos da API local do PROTOCOLO.md | os eventos do PROTOCOLO.md | os mesmos, enumerados |
| `update.check/apply` | — | `UpdateInfo` | `SignatureInvalid`, `Network` |

Nunca existirá `shell.exec`/`fs.read(qualquer caminho)`: todo acesso é por um comando com escopo (dentro da raiz
escolhida ou da pasta de dados do app).

**Fluxo de dados:** UI → (ação) → caso de uso (app-core) → engine (núcleo/áudio/vídeo) e/ou porta `Backend` (interface
TS) → adaptador de plataforma (Tauri `invoke` / WS com token / `KOFnesApk`) → Rust. Eventos do Rust voltam pelo mesmo
adaptador para o app-core, que atualiza as stores.

**Erros:** Rust usa `thiserror` com variantes específicas, serializadas como `{code, message, details}`; o TS tem um
`switch` exaustivo nos códigos; a UI mostra mensagem em português por código (como hoje o `avisarErro`), e o log guarda
o detalhe. Nada de `catch {}` vazio: hoje há vários `try { ... } catch (e) {}` no `app.js` — no novo, erro ignorado
precisa de comentário dizendo por quê.

**Ciclo de vida de uma sessão de jogo (engine):** `idle → loading(core, rom, bios) → running ⇄ paused → stopping →
idle`; `error` a partir de qualquer estado com causa. Sidecar nativo: `absent → starting → ready → running → crashed
(religa até N) → stopped`.

**Configurações:** esquema único (`domain/config`) com chave, tipo, padrão, camadas permitidas (geral/console/jogo) e
se é exportável; persistido pelo Rust em `Kof Games/Config/*.json` (com versão do esquema e migração).

**Testes:** domain/app-core em Vitest (sem DOM); engine em Vitest + Node com os núcleos wasm reais (como
`testes/libretro/` já faz); componentes com Testing Library; fluxos com Playwright Test; Rust com `cargo test`;
**contratos** testados dos dois lados com os mesmos exemplos JSON (fixtures).

## 5. Fases e ordem de migração (ajustada pela auditoria)

A ordem sugerida no pedido foi ajustada porque a auditoria mostrou dependências: biblioteca precisa do contrato de
arquivos; quase tudo depende da **engine** (núcleo + laço); jukebox e rebobinar dependem do núcleo no Worker; e o
"RetroArch" sai da lista (D1).

| Etapa | Conteúdo | Pronto quando (checkpoint) |
|---|---|---|
| **F2** Arquitetura | `ARCHITECTURE.md`, `DECISIONS.md` (D1–D15 aprovadas/alteradas), `API_CONTRACTS.md` v0 | Marcelo aprova |
| **F3** Dependências | Tabela da §6 aprovada; requisitos do Linux documentados; `pnpm-lock`/`Cargo.lock` | instalação limpa reproduzida no container e na máquina do Marcelo |
| **F4a** Esqueleto | Repo novo, React → Rust → React (`app.info`), erro de comunicação tratado, logs (`tracing`), testes básicos, CI | `pnpm test`, `cargo test`, e2e verde no Linux |
| **F4b** *Spike* D2 | Mesmo esqueleto em Tauri (WebKitGTK no Linux, WebView2 no Windows) e em Rust+Chromium; rodar **o Snes9x e o PCSX wasm atuais** num Worker com AudioWorklet, WebGL com uma passada do visual, Gamepad, e uma chamada WebRTC loopback | relatório com fps, engasgos, latência de áudio e o que falhou; D2 decidida |
| **M1** Casca e navegação | pilha de telas, temas (tokens), foco por controle, Início vazio | e2e: abrir telas, Voltar, trocar tema, contraste WCAG |
| **M2** Engine mínima | `CoreSession` + adaptador wasm (Worker), vídeo WebGL simples, áudio AudioWorklet, teclado/Gamepad J1, carregar ROM por arquivo | ROM gerada de MD/NES/GB roda; imagem igual à do app antigo no mesmo quadro (determinismo) |
| **M3** Biblioteca + Kof Games | `library.*` no Rust, registro de jogos, detecção de sistema, zip/CD, busca/filtros/base de jogos, capas | 3.000 jogos falsos (como `bib.cjs`) e a árvore Kof Games igual ao `pastas.cjs` |
| **M4** Configurações + dados | esquema de config com camadas, persistência em arquivo, **importar `.kofsave`** | backup exportado do app antigo abre no novo com saves/estatísticas |
| **M5** Saves, estados, modos | bateria, savestates, automático, modos de jogo, limite de estados | `saves.cjs`/`estados.cjs`/`modos.cjs` reescritos e verdes |
| **M6** Rebobinar | `Rebobinador` dentro do Worker | `rebob.cjs` equivalente; bit a bit |
| **M7** Visual e molduras | `visual.js` portado quase intacto + painel novo | comparação de pixels com a cartela de teste em todas as predefinições |
| **M8** Controles | camadas de teclas/botões, analógico no teclado, jogadores 2–4 | `controles.cjs`/`jogadores.cjs` equivalentes |
| **M9** Jukebox + música | tocador em segunda instância, sonda, Ondas, .spc, .wav, trilha | `juke.cjs`/`jukebox.cjs`/`trilha.cjs` equivalentes |
| **M10** Estatísticas | `KofGuarda` portado | `guarda.cjs` |
| **M11** BIOS + sistemas com BIOS/arquivo | GBA, Neo Geo, PS1 wasm, N64 wasm | `gba.cjs`, `neogeo.cjs` (zips falsos), `ps1.cjs`, `n64.cjs` |
| **M12** PS2 nativo | Rust supervisiona kofnativo, canal com token | `ps2-pagina.cjs` equivalente |
| **M13** Rede + celular | serviço de rede (FFI), Aparelhos, jogadores pela rede, Jogar no PC | `aparelhos.cjs`, `jogar-no-pc.cjs` |
| **M14** Android | a casca Java serve o html novo; adaptador `KOFnesApk` | `apk-simulado.cjs`, `celular.cjs`, `pasta-apk.cjs` |
| **M15** Distribuição | updater assinado, pacotes Win/Linux, primeira versão "beta" ao lado do app antigo | Marcelo testa no Windows e no Linux dele |
| depois | caçador de bugs, patches, abertura, guia, PWA | — |

Regras para cada etapa (do pedido, reforçadas): estudar a implementação antiga (as fichas do FEATURE_INVENTORY já
apontam onde), definir a responsabilidade, implementar, testar, **comparar com o antigo** (mesma ROM/estado/botões →
mesmos quadros: o determinismo permite comparar automaticamente), documentar em `MIGRATION_LOG.md`. Só conta como
migrada com teste verde e comparação feita.

## 6. Dependências recomendadas

> Versões: a linha estável no momento da Fase 3 (conferir no dia; aqui vão as linhas mínimas). Nada foi instalado. No
> container já existem Node 22, pnpm 10.28, Rust/Cargo 1.97; **não** existem as bibliotecas de sistema do Tauri
> (WebKitGTK 4.1, GTK 3).

### Frontend

| Dependência | Versão | Finalidade | Camada | Justificativa | Alternativas consideradas |
|---|---|---|---|---|---|
| Node.js LTS | 22.x (ou 24 LTS se já for a ativa) | runtime de build/teste | build | Vite/Vitest/Playwright exigem | Bun (menos maduro pro Playwright) |
| pnpm | 10.x | pacotes + workspaces | build | lockfile estrito, monorepo, já no container | npm workspaces, yarn |
| TypeScript | 5.x, `strict: true` | tipos | todas TS | contratos e refatoração segura (resolve P1/P3) | JSDoc + checkJs |
| Vite | 6.x/7.x | dev server + build | build | ES modules, `?worker`, `.wasm` como asset, COOP/COEP no dev | esbuild puro, Rollup |
| React | 19.x | UI | presentation | pedido; boa base de componentes | Preact (menor, avaliar se o tamanho do html do celular importar) |
| Zustand | 5.x | stores | presentation/app | D5 | Context + `useSyncExternalStore` |
| React Router | — | — | — | **adiar** (D6) | — |
| Vitest | 3.x | unidades/contratos | testes | mesmo pipeline do Vite | Jest |
| @testing-library/react (+ user-event, jsdom) | 16.x | componentes | testes | testar pelo que o usuário vê | Enzyme (morto) |
| Playwright Test | 1.5x (travado no lockfile) | e2e | testes | os testes atuais já são Playwright | Cypress |
| ESLint (flat config) + typescript-eslint + eslint-plugin-react-hooks | 9.x | análise estática | qualidade | regras de hooks e tipos | Biome (lint+format num só; boa alternativa se quisermos menos dependências) |
| Prettier | 3.x | formatação | qualidade | padrão | Biome |

### Backend

| Dependência | Versão | Finalidade | Camada | Justificativa | Alternativas |
|---|---|---|---|---|---|
| Rust stable + rustfmt + clippy | 1.9x (travado em `rust-toolchain.toml`) | linguagem | backend | pedido; container tem 1.97 | — |
| serde + serde_json | 1.x | contratos, config, manifesto | backend | padrão de fato | miniserde |
| thiserror | 2.x | erros tipados | backend | D8: erros específicos, sem `anyhow` genérico nas fronteiras | `anyhow` (só em binários/testes) |
| tracing + tracing-subscriber (+ tracing-appender) | 0.1 / 0.3 | logs estruturados em arquivo | backend | pedido; substitui `atualizacao.log`/`kofnativo.log` soltos | `log` + `env_logger` |
| Tauri 2 (+ plugins fs/dialog/updater só os usados) | 2.x | casca desktop | app | **condicionado ao spike D2** | Rust local + Chromium (axum/tungstenite); Electron |
| Tokio | 1.x | E/S concorrente | backend | **necessário** pro serviço de rede (TCP+UDP+WS simultâneos) e supervisão de processos; o Tauri já traz | threads + std::net (como o C atual) |
| ts-rs ou specta | — | gerar tipos TS | contracts | D9 | tipos à mão + fixtures |
| sha2, ed25519-dalek | — | manifesto assinado | update | D12 | minisign-verify |
| cc | 1.x | compilar `kofrede.c`/Monocypher | net | D10 | reescrever em Rust |
| walkdir / notify | — | varrer e observar a Kof Games | files | substitui `lerPasta`/File System Access | std::fs recursivo |
| tempfile, insta (dev) | — | testes de arquivos e snapshots | testes | — | — |

### Requisitos de sistema (Linux, para Tauri — a confirmar na Fase 3)
`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev` (se usar bandeja), `librsvg2-dev`,
`libssl-dev`, `build-essential`, `pkg-config`; GStreamer (`gstreamer1.0-plugins-base/good/bad`) para mídia/WebRTC no
WebKitGTK. Fedora (o Marcelo usa Linux sem apt): `webkit2gtk4.1-devel`, `gtk3-devel`, `librsvg2-devel`,
`openssl-devel`. **Para o usuário final**, o WebKitGTK precisa estar instalado (ou ir num AppImage/Flatpak), o que é
diferente de hoje ("qualquer Chromium"): mais um ponto pro spike.

## 7. Riscos do plano e como cada etapa os reduz

| Risco | Onde aparece | Redução |
|---|---|---|
| Perder dados (R1) | M4 | `.kofsave` como ponte; app antigo continua instalado e intocado |
| WebKitGTK insuficiente (R2) | F4b | spike decide antes de escrever telas |
| Escopo grande (R3) | todas | fatias verticais, cada uma entregável; nada é "migrado" sem teste |
| Regressão sutil (R4) | M2, M6, M7, M9 | comparação quadro a quadro e pixel a pixel com o antigo |
| Android (R5) | M14 | casca atual mantida (D13) |
| Segurança (R6) | M12, M13, M15 | token + Origin, manifesto assinado |

## 8. Perguntas pro Marcelo (precisam de resposta antes da Fase 2)

> **Respondidas em 31/10/2026**: ver [PLANO_DETALHADO §0](PLANO_DETALHADO.md#0-decisões-fechadas-pelo-marcelo).

1. **Nome e dono do repositório novo** (ex.: `Marcelao98/kofstation-next`)? Público ou privado? Posso criá-lo pelo
   GitHub quando você autorizar.
2. **Linux é prioridade igual ao Windows?** Isso pesa muito em D2 (Tauri no Linux = WebKitGTK).
3. **Licença** do repositório novo (proposta GPL-3.0) — e se o núcleo Kof (da Mel) entra com qual licença.
4. **Celular**: o frontend novo precisa servir o APK desde o começo, ou o celular fica no app antigo até o PC estar
   pronto? (Recomendo: PC primeiro, celular na M14.)
5. **O que é intocável na experiência**: entendi que filtros/efeitos do painel de imagem (aprovados) e os 126 temas
   são. Há outros?
6. Posso propor (no repositório **antigo**, como correção pequena separada desta migração) a conferência de `Origin` no
   `kofnativo`? É o único risco de segurança imediato encontrado.

## 9. Próximo passo

Aguardar a revisão destes cinco documentos. Com as respostas da §8 e a aprovação (ou mudança) das decisões D1–D15,
começa a **Fase 2** (documentos da arquitetura nova no repositório novo). Nenhum código será escrito antes disso.
