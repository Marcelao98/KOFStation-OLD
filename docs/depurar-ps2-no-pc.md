# Roteiro pro Claude Code no PC do Marcelo: PS2 (PCSX2 nativo) não abre o jogo

Cole isto no Claude Code, aberto na pasta do repositório (`git clone https://github.com/Marcelao98/KOFStation`).

## O problema
No Linux do Marcelo, o KOFstation (versão 202610260329, kofnes.sh LANCADOR=7) abre o PS2 pelo **kofnativo**
(`pc-nativo/kofnativo.c`: C + SDL2 + OpenGL 3.3 que carrega o núcleo libretro **LRPS2**, o PCSX2 do libretro).
Ao abrir o Shadow of the Colossus (USA) com a BIOS dele (SCPH-77001, o arquivo .bin de 4 MB), aparece:
`o núcleo não abriu o jogo (falta a BIOS do PS2? o disco é de PS2?)` = `retro_load_game` devolveu false
(`abrirJogo()` no kofnativo.c). No container de desenvolvimento, com uma BIOS falsa e discos de até 4,7 GB, o mesmo
binário chega no "pronto" (disco lido, OpenGL ligado). Então o problema é algo DESTE PC: a BIOS de verdade, o OpenGL
da placa (contexto 3.3 core), Wayland/X11, ou outra coisa que o log mostre.

## Onde estão as coisas no PC
- Lançador: `kofnes.sh` (na pasta do KOFstation). Os binários publicados ficam em `<pasta>/nativo/kofnativo-<hash>` e
  o núcleo descompactado em `~/.local/share/KOFnes/nativo/pcsx2_libretro-<hash>.so`.
- Log do kofnativo: `~/.local/share/KOFnes/nativo/kofnativo.log` (a vez anterior em `kofnativo.log.1`).
- A BIOS que o KOFstation manda fica gravada em `~/.local/share/KOFnes/nativo/sistema/pcsx2/bios/bios-ps2.bin`.

## Passos
1. Ler o `kofnativo.log` e procurar o motivo (linhas do PCSX2 antes do erro: "Could not find any valid PS2 BIOS",
   "VM initialization failed", erro de OpenGL/contexto, etc.).
2. Reproduzir sem o navegador (feche o KOFstation antes; a porta 8643 é de um só):
   `KOF_JANELA=1 KOF_DEBUG=1 <kofnativo> <pcsx2_libretro.so> /tmp/kofps2 2>&1 | tee /tmp/kofps2.log`
   e noutro terminal `node testes/ps2/abrir-direto.cjs <bios.bin> <jogo.iso>`.
   `KOF_RENDERER=` troca o renderizador do PCSX2 (ex.: `Software` se for problema de OpenGL).
3. Compilar o kofnativo/LRPS2 aqui se precisar mexer: `pc-nativo/construir.sh` (precisa de gcc, cmake, ninja, git e
   os -dev do X11/Wayland/pulse/alsa; no Fedora: `dnf install gcc gcc-c++ cmake ninja-build libX11-devel ...`).
4. Achou e consertou: commit na `main` (mensagem em português, sem nome de modelo de IA) e me conte o que era; a
   publicação pro atualizador é feita pela sessão da nuvem (`web/publicar.sh`).

## Regras
- Não baixar nem indicar onde baixar BIOS ou jogo. Usar só os arquivos que já estão no PC do Marcelo.
- Nunca commitar BIOS, ISO ou log com caminhos pessoais.
- Bugs conhecidos: com a janela do kofnativo, um quadrado preto fica na tela quando o jogo falha (falta esconder a janela no erro).
