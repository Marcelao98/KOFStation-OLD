#!/usr/bin/env bash
# Igual ao compilar.sh, mas SEM o compilador Kof e sem emscripten: o núcleo Kof, o somfm e os núcleos libretro vêm do
# publicado/ (testes/montar-sem-kof.sh). Só vale quando snes/ e nucleo-libretro/ não mudaram desde a última publicação
# (núcleo novo que não está publicado, como o play.js do PS2, entra se existir em nucleo-libretro/saida/).
#   COMPILAR=web/compilar-sem-kof.sh web/publicar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(dirname "$AQUI")"; SAIDA="$RAIZ/dist/web"
export KOFNES_BUILD="${KOFNES_BUILD:-$(date -u +%Y%m%d%H%M)}"
rm -rf "$SAIDA"; mkdir -p "$SAIDA"
KOFNES_LISTA="$SAIDA/.nucleos-pc.txt" sh "$RAIZ/testes/montar-sem-kof.sh" "$SAIDA"
T="$SAIDA/.montar"
python3 "$RAIZ/empacotar/icone.py" "$T" >/dev/null   # icone.ico pro exe
(cd "$T" && cp "$RAIZ/empacotar/kofnes.rc" . && x86_64-w64-mingw32-windres kofnes.rc -O coff -o res.o)
x86_64-w64-mingw32-gcc -O2 -s -municode -mwindows -o "$SAIDA/KOFstation.exe" "$AQUI/lancador_win.c" "$AQUI/lancador_inet.c" "$T/res.o" -lshlwapi -lwinhttp -lwininet -lws2_32
cp "$AQUI/lancador_linux.sh" "$SAIDA/kofnes.sh" && chmod +x "$SAIDA/kofnes.sh"
cp "$T/icone.png" "$SAIDA/KOFnes.png"
LANCADOR="$(sed -n 's/^#define LANCADOR \([0-9]*\).*/\1/p' "$AQUI/lancador_win.c")"
{
    printf 'versao=%s\ntamanho=%s\nlancador=%s\n' "$KOFNES_BUILD" "$(stat -c %s "$SAIDA/KOFnes.html")" "$LANCADOR"
    printf 'tamanho_exe=%s\n' "$(stat -c %s "$SAIDA/KOFstation.exe")"
    printf 'lancador_linux=%s\ntamanho_linux=%s\n' "$(sed -n 's/^LANCADOR=\([0-9]*\).*/\1/p' "$SAIDA/kofnes.sh")" "$(stat -c %s "$SAIDA/kofnes.sh")"
    sed 's/^/nucleo=/' "$SAIDA/.nucleos-pc.txt"
} > "$SAIDA/versao.txt"
cat "$SAIDA/versao.txt"
