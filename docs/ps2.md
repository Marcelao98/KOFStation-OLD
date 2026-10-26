# 💿 PlayStation 2 no KOFstation

Como o PS2 entrou no KOFstation, o que deu errado no caminho e onde ele está hoje. A parte técnica fica no fim.

## Situação (26/10)

| | |
|---|---|
| **PC Linux** | PCSX2 de verdade (núcleo LRPS2), num programa nosso chamado **kofnativo** que o lançador `kofnes.sh` abre junto. Publicado na versão 202610260522. O Shadow of the Colossus rodou direto no kofnativo no PC do Marcelo (60 fps no Ryzen 5 4600H); falta confirmar pelo KOFstation. |
| **PC Windows** | Ainda não tem o kofnativo. Sem ele, o PS2 cai no Play! do navegador, que só roda jogos leves. |
| **Celular** | Não tem PS2. |
| **BIOS** | Precisa da BIOS do console de quem joga: o arquivo **.bin de 4 MB**. Os .DIFF, .rom1, .rom2, .erom, .nvm e .mec que vêm junto não servem. Ela é guardada pela tela **🔑 BIOS dos consoles** (card no Início ou Arquivo). O KOFstation não traz BIOS nenhuma. |
| **Filtros** | Funcionam: o shader da página é convertido e roda dentro do kofnativo. Molduras ainda não. |

## Linha do tempo

1. **25/10, Play! no navegador.** O primeiro caminho foi o **Play!** (emulador de PS2 com licença BSD) compilado pra WebAssembly. Roda demos e jogos leves a ~60 fps, mas o **Shadow of the Colossus** quebrou com um `CompileError`: o Play! gera código WebAssembly na hora e um dos blocos saiu inválido. Isso aparece no print do erro com "btoa": o próprio texto do erro quebrou.
2. **26/10, PCSX2 nativo.** Abrir o programa PCSX2 separado "ia contra a ideia do KOFstation", então o PCSX2 entrou **por dentro**. O kofnativo é um programa pequeno em C que carrega o PCSX2 na forma de núcleo libretro (LRPS2), desenha numa janela própria por cima da página e conversa com a página por WebSocket. A página continua mandando em tudo: biblioteca, saves, controle, filtros e pausa.
3. **Bugs achados testando com o Marcelo:**
   - **"Falta a BIOS"** mesmo com a BIOS escolhida: o LRPS2 só procura a BIOS quando liga. O kofnativo agora diz direto qual arquivo usar (opção `pcsx2_bios`), e a tabela de opções cresceu de 64 pra 512 lugares.
   - **BIOS errada aceita:** o .DIFF tem os mesmos 4 MB da BIOS e passava. Agora a BIOS é reconhecida pelo conteúdo (tabela ROMDIR que começa com RESET), não pelo tamanho.
   - **Caía no Play! sem avisar:** quando o kofnativo não respondia, a página usava o Play!. Agora, se o PCSX2 já funcionou naquele PC, a página espera uns segundos e mostra um erro claro.
   - **kofnativo órfão:** o SDL transformava o pedido de fechar (SIGTERM) em "pausar", então um kofnativo velho ficava vivo segurando a porta 8643, e a página falava com ele. Agora ele fecha de verdade, e o lançador derruba qualquer kofnativo antigo antes de abrir o novo.
   - **Só lia o começo do disco (o bug principal):** o PCSX2 espera que "pular pra uma posição do disco" responda **0** quando dá certo, como faz o RetroArch. O kofnativo respondia a posição nova. A posição 0 funcionava, as outras não. O SYSTEM.CNF do Shadow of the Colossus fica a ~2,67 GB do começo, então o jogo nunca achava esse arquivo e caía na tela da BIOS. Quem achou o sintoma foi o **Claude Code rodando no PC do Marcelo**, seguindo o roteiro `docs/depurar-ps2-no-pc.md`.
   - **Travava jogando (segfault):** o PCSX2 e a janela do kofnativo dividiam o mesmo contexto OpenGL. O kofnativo trocava o estado que o PCSX2 guarda (o VAO e o programa), e o desenho seguinte do PCSX2 lia lixo dentro do driver da placa (Mesa). Agora o núcleo tem um contexto OpenGL só dele, compartilhado com o da janela, como faz o RetroArch. O quadro é copiado pra janela depois de um fence. O conserto foi feito pelo Claude Code no PC do Marcelo, que também ligou o **EE cycle skip leve** por padrão: no Ryzen 5 4600H, o SotC subiu de ~42 pra 60 quadros.

## Como funciona (técnico)

```
página (KOFstation.html, web/ps2.js)  ←── WebSocket 127.0.0.1:8643 ──→  kofnativo (pc-nativo/kofnativo.c)
  · biblioteca, saves, controle/celular                                  · SDL2 estático + OpenGL 3.3
  · lê o DVD do arquivo aos pedaços (File.slice)                         · carrega pcsx2_libretro.so (LRPS2)
  · manda BIOS, teclas, filtro (GLSL)                                    · disco virtual kof://disco/<nome>
                                                                           (blocos de 1 MB pedidos à página)
```

- **Protocolo:** está descrito no topo de `pc-nativo/kofnativo.c` (`abrir`, `bios`, `pad`, `teclas`, `filtro`, `estado`, `ler`, `pronto`, `erro`...).
- **Disco:** o jogo nunca é copiado. O PCSX2 pede pedaços e a página lê do arquivo. Cache de 48 blocos de 1 MB.
- **Saves:** a pasta de cartões de memória do PCSX2 vira um pacote só (`ps2/pcsx2` no banco do navegador) e entra no backup `.kofsave`.
- **Lançador Linux** (`web/lancador_linux.sh` → `kofnes.sh`): baixa `publicado/nativo/` (linhas `nativo_linux=` do versao.txt) e descompacta o núcleo em `~/.local/share/KOFnes/nativo/`. Antes de abrir, fecha kofnativo antigo, guarda o log anterior em `kofnativo.log.1` e reabre o kofnativo se ele cair enquanto o KOFstation estiver aberto.
- **Compilar:** `pc-nativo/construir.sh` (SDL2 2.30.9 + LRPS2 no commit 38d3a83f). Publicar: `COMPILAR=web/compilar-sem-kof.sh web/publicar.sh`.
- **Testes:**
  - `xvfb-run -a node testes/navegador/ps2-nativo.cjs dist/web pc-nativo/saida/kofnativo pc-nativo/saida/pcsx2_libretro.so <iso>`, com uma BIOS falsa em `KOF_BIOS`.
  - `testes/ps2/abrir-direto.cjs <bios> <iso>` abre o jogo no kofnativo sem o navegador. Pra testar leitura longe do começo, use um disco com o SYSTEM.CNF depois de um arquivo grande.
- **Licenças:** LRPS2/PCSX2 GPL-3, Play! BSD-2, SDL2 zlib.

## Próximos passos

1. O Marcelo confirmar o Shadow of the Colossus pelo KOFstation no Linux.
2. kofnativo pro Windows (compilar LRPS2 + kofnativo com mingw e o `KOFstation.exe` abrir junto).
3. Molduras no PS2 (hoje só os filtros passam pro kofnativo).
