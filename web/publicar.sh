#!/usr/bin/env bash
# Publica uma versão pro atualizador: compila e copia o KOFnes.html, os núcleos e o
# versao.txt pra publicado/ (que vai pro git). O KOFnes.exe de quem já tem
# o emulador lê publicado/versao.txt no GitHub e baixa a página nova sozinho.
#   web/publicar.sh && git add publicado && git commit && git push
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
"${COMPILAR:-$AQUI/compilar.sh}"   # COMPILAR=web/compilar-sem-kof.sh: sem o compilador Kof (núcleos iguais aos publicados)
mkdir -p "$RAIZ/publicado"
# os nativos já publicados ficam guardados: sem a saída compilada aqui (container novo), a publicação mantém os de antes
ANTIGAS="$(grep '^nativo_' "$RAIZ/publicado/versao.txt" 2>/dev/null || true)"
GUARDA="$(mktemp -d)"; trap 'rm -rf "$GUARDA"' EXIT
cp -a "$RAIZ/publicado/nativo/." "$GUARDA/" 2>/dev/null || true
manter() {   # manter <nativo_linux|nativo_windows> <prefixo do arquivo>: repõe o que estava publicado
  printf '%s\n' "$ANTIGAS" | grep "^$1=$2-" | while IFS= read -r l; do
    f="${l#*=}"; f="${f%%:*}"; [ -f "$GUARDA/$f" ] && cp "$GUARDA/$f" "$RAIZ/publicado/nativo/" && printf '%s\n' "$l" >> "$RAIZ/publicado/versao.txt"
  done
}
cp "$RAIZ/dist/web/KOFnes.html" "$RAIZ/dist/web/KOFstation.exe" "$RAIZ/dist/web/kofnes.sh" "$RAIZ/dist/web/versao.txt" "$RAIZ/publicado/"
# o lançador 6+ baixa KOFstation.*; os lançadores antigos (KOFnes.exe 5) e o kofnes.sh ainda baixam KOFnes.*: vão os dois nomes
cp "$RAIZ/dist/web/KOFnes.html" "$RAIZ/publicado/KOFstation.html"
cp "$RAIZ/dist/web/KOFstation.exe" "$RAIZ/publicado/KOFnes.exe"
# núcleos (nucleos/<núcleo>-<hash>.js): só os que o versao.txt lista; os de versões velhas saem (o histórico do git guarda)
rm -rf "$RAIZ/publicado/nucleos" && mkdir -p "$RAIZ/publicado/nucleos"
sed -n 's/^nucleo=\([^:]*\):.*/\1/p' "$RAIZ/dist/web/versao.txt" | while read -r f; do cp "$RAIZ/dist/web/nucleos/$f" "$RAIZ/publicado/nucleos/"; done
# PS2 nativo do Linux (pc-nativo/construir.sh): o kofnativo e o núcleo LRPS2 comprimido, com o hash no nome; o kofnes.sh
# baixa pelas linhas nativo_linux=
rm -rf "$RAIZ/publicado/nativo" && mkdir -p "$RAIZ/publicado/nativo"
if [ -f "$RAIZ/pc-nativo/saida/kofnativo" ] && [ -f "$RAIZ/pc-nativo/saida/pcsx2_libretro.so" ]; then
  k="kofnativo-$(sha256sum "$RAIZ/pc-nativo/saida/kofnativo" | cut -c1-8)"
  cp "$RAIZ/pc-nativo/saida/kofnativo" "$RAIZ/publicado/nativo/$k"
  gzip -9n -c "$RAIZ/pc-nativo/saida/pcsx2_libretro.so" > "$RAIZ/publicado/nativo/nucleo.gz"
  n="pcsx2_libretro-$(sha256sum "$RAIZ/publicado/nativo/nucleo.gz" | cut -c1-8).so.gz"
  mv "$RAIZ/publicado/nativo/nucleo.gz" "$RAIZ/publicado/nativo/$n"
  for f in "$k" "$n"; do printf 'nativo_linux=%s:%s\n' "$f" "$(stat -c %s "$RAIZ/publicado/nativo/$f")" >> "$RAIZ/publicado/versao.txt"; done
else manter nativo_linux kofnativo; manter nativo_linux pcsx2_libretro
fi
# PS2 nativo do Windows (pc-nativo/construir-windows.sh): kofnativo.exe e pcsx2_libretro.dll sem comprimir (o Windows não
# tem gzip à mão), com o hash no nome; o KOFstation.exe (lançador 12) baixa pelas linhas nativo_windows= pra nativo\
if [ -f "$RAIZ/pc-nativo/saida/kofnativo.exe" ] && [ -f "$RAIZ/pc-nativo/saida/pcsx2_libretro.dll" ]; then
  k="kofnativo-$(sha256sum "$RAIZ/pc-nativo/saida/kofnativo.exe" | cut -c1-8).exe"
  n="pcsx2_libretro-$(sha256sum "$RAIZ/pc-nativo/saida/pcsx2_libretro.dll" | cut -c1-8).dll"
  cp "$RAIZ/pc-nativo/saida/kofnativo.exe" "$RAIZ/publicado/nativo/$k"
  cp "$RAIZ/pc-nativo/saida/pcsx2_libretro.dll" "$RAIZ/publicado/nativo/$n"
  for f in "$k" "$n"; do printf 'nativo_windows=%s:%s\n' "$f" "$(stat -c %s "$RAIZ/publicado/nativo/$f")" >> "$RAIZ/publicado/versao.txt"; done
else manter nativo_windows kofnativo; manter nativo_windows pcsx2_libretro
fi
# rede entre aparelhos (rede/construir.sh): o kofservico do Linux e do Windows, com o hash no nome; os lançadores (kofnes.sh
# LANCADOR=10, KOFstation.exe 13) baixam junto com os outros nativos e abrem com o KOFstation
if [ -f "$RAIZ/rede/saida/kofservico" ] && [ -f "$RAIZ/rede/saida/kofservico.exe" ]; then
  k="kofservico-$(sha256sum "$RAIZ/rede/saida/kofservico" | cut -c1-8)"; w="kofservico-$(sha256sum "$RAIZ/rede/saida/kofservico.exe" | cut -c1-8).exe"
  cp "$RAIZ/rede/saida/kofservico" "$RAIZ/publicado/nativo/$k"; cp "$RAIZ/rede/saida/kofservico.exe" "$RAIZ/publicado/nativo/$w"
  printf 'nativo_linux=%s:%s\nnativo_windows=%s:%s\n' "$k" "$(stat -c %s "$RAIZ/publicado/nativo/$k")" "$w" "$(stat -c %s "$RAIZ/publicado/nativo/$w")" >> "$RAIZ/publicado/versao.txt"
else manter nativo_linux kofservico; manter nativo_windows kofservico
fi
# celular (APK): a página do celular e todos os núcleos que ela usa (o Snes9x só existe lá); o app lê publicado/android/
H="$RAIZ/dist/web/KOFnes-android.html"
if [ -f "$H" ]; then
  mkdir -p "$RAIZ/publicado/android" && cp "$H" "$RAIZ/publicado/android/"
  {
    grep '^versao=' "$RAIZ/dist/web/versao.txt"
    echo "casca=$(sed -n 's/.*static final int CASCA = \([0-9]*\);.*/\1/p' "$RAIZ/android/src/dev/kofnes/android/MainActivity.java")"
    echo "html=KOFnes-android.html:$(stat -c %s "$H")"
    grep -o 'nucleos/[a-z0-9]*-[0-9a-f]\{8\}\.js' "$H" | sort -u | while read -r n; do
      cp "$RAIZ/dist/web/$n" "$RAIZ/publicado/nucleos/"; echo "nucleo=${n#nucleos/}:$(stat -c %s "$RAIZ/dist/web/$n")"
    done
  } > "$RAIZ/publicado/android/versao.txt"
  cat "$RAIZ/publicado/android/versao.txt"
fi
cat "$RAIZ/publicado/versao.txt"
