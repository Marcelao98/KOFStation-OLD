#!/bin/sh
# Monta o KOFnes.html (PC) e o KOFnes-android.html (celular) SEM o compilador Kof e sem emscripten: o núcleo Kof sai do
# publicado/KOFstation.html e os núcleos de publicado/nucleos/ (sem o hash no nome). Serve pra testar mudanças só de
# web/*.js|css|html (snes/ e os núcleos iguais aos publicados). Núcleo novo (ex.: nucleo-libretro/saida/play.js) entra se
# existir. Com KOFNES_LISTA, o juntar.py do PC escreve a lista "arquivo:tamanho" dos núcleos (pro versao.txt).
#   sh testes/montar-sem-kof.sh <pasta de saída>      -> <saída>/KOFnes.html, <saída>/KOFnes-android.html, <saída>/nucleos/
set -e
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"; S="$1"; T="$S/.montar"
rm -rf "$T"; mkdir -p "$T/kof" "$T/nuc" "$S"
python3 - "$RAIZ/publicado/KOFstation.html" "$T" <<'PY'
import base64, re, sys
h = open(sys.argv[1]).read(); T = sys.argv[2]
ini = "const KofNucleo = (() => {\n'use strict';\n"
a = h.index(ini) + len(ini); b = h.index("\nreturn { Snes: snes_Snes", a)
open(T + "/kof/kof-runtime.mjs", "w").write("function kofArrayGet(array, index) {\n}\nfunction kofArraySet(array, index, value, kind) {\n}\n")
open(T + "/kof/Default.mjs", "w").write(h[a:b])
# o núcleo só de som da trilha (somfm, embutido no html): do "var Nucleo_somfm" até o começo do web/somfm.js
i = h.index("var Nucleo_somfm = "); j = h.index("// Tocador da trilha do KOFstation", i)
import os; os.makedirs(T + "/nuc/som", exist_ok=True); open(T + "/nuc/som/somfm.js", "w").write(h[i:j].rstrip("\n") + "\n")
open(T + "/icone.png", "wb").write(base64.b64decode(re.search(r"data:image/png;base64,([A-Za-z0-9+/=]+)", h).group(1)))
PY
for f in "$RAIZ"/publicado/nucleos/*.js; do n=$(basename "$f"); case $n in jogos-*|violino-*) continue;; esac; cp "$f" "$T/nuc/${n%-*}.js"; done
[ -f "$RAIZ/nucleo-libretro/saida/play.js" ] && cp "$RAIZ/nucleo-libretro/saida/play.js" "$T/nuc/"
# núcleos recompilados aqui (nucleo-libretro/construir.sh) valem no lugar dos publicados
for f in "$RAIZ"/nucleo-libretro/saida/*.js; do [ -f "$f" ] && cp "$f" "$T/nuc/"; done
python3 "$RAIZ/web/juntar.py" "$T/kof" "$RAIZ/web" "$T/icone.png" "$S/KOFnes.html" "$T/nuc" pc 2>&1 | grep -v Deprecat | grep -v utcnow | tail -1
KOFNES_LISTA= python3 "$RAIZ/web/juntar.py" "$T/kof" "$RAIZ/web" "$T/icone.png" "$S/KOFnes-android.html" "$T/nuc" 2>&1 | grep -v Deprecat | grep -v utcnow | tail -1
