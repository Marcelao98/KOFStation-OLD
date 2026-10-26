#!/usr/bin/env bash
# PS2 nativo no Windows, compilado daqui do Linux: o kofnativo.exe (kofnativo.c com o SDL2 estático do MinGW e o glad do
# próprio LRPS2 pro OpenGL 3.3) e o pcsx2_libretro.dll (LRPS2, o mesmo commit do Linux). Compilador: llvm-mingw (clang;
# o mingw-w64 do Ubuntu é velho demais pros cabeçalhos de DirectX 12 do PCSX2). Resultado em pc-nativo/saida/:
# kofnativo.exe e pcsx2_libretro.dll (fora do git; o publicar.sh leva pra publicado/nativo/ e o KOFstation.exe baixa).
# Só depende de DLLs que já vêm no Windows 10/11. A primeira vez demora (~30 min o LRPS2). T=<pasta> troca onde ficam as fontes.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
T="${T:-/tmp/kofnes-nativo-win}"
LRPS2=38d3a83f4ecdec977d609ece8afcc527f5f68702
LLVM=llvm-mingw-20241030-ucrt-ubuntu-20.04-x86_64
mkdir -p "$T" "$AQUI/saida"
[ -d "$T/$LLVM" ] || curl -sSL "https://github.com/mstorsjo/llvm-mingw/releases/download/20241030/$LLVM.tar.xz" | tar xJ -C "$T"
[ -d "$T/SDL2-2.30.9" ] || curl -sSL https://github.com/libsdl-org/SDL/releases/download/release-2.30.9/SDL2-devel-2.30.9-mingw.tar.gz | tar xz -C "$T"
export PATH="$T/$LLVM/bin:$PATH"
if [ ! -d "$T/lrps2/.git" ]; then git clone -q https://github.com/libretro/ps2.git "$T/lrps2"; fi
git -C "$T/lrps2" fetch -q --depth 1 origin "$LRPS2" 2>/dev/null || true
git -C "$T/lrps2" checkout -q -- . && git -C "$T/lrps2" checkout -q "$LRPS2"
git -C "$T/lrps2" apply "$AQUI/lrps2-windows.patch"   # um constexpr que o clang não aceita no código de DirectX 12
# o link.T (version-script) é coisa do ld do GNU: o lld do MinGW não aceita, e no Windows as funções retro_ já saem exportadas
make -C "$T/lrps2" platform=win CC=x86_64-w64-mingw32-clang CXX=x86_64-w64-mingw32-clang++ AR=x86_64-w64-mingw32-ar \
  SHARED="-shared -Wl,--no-undefined" -j"$(nproc)"
llvm-strip -o "$AQUI/saida/pcsx2_libretro.dll" "$T/lrps2/pcsx2_libretro.dll"
cp "$T/lrps2/libretro/libretro-common/include/libretro.h" "$AQUI/libretro.h"
S="$T/SDL2-2.30.9/x86_64-w64-mingw32"; G="$T/lrps2/3rdparty/glad"
x86_64-w64-mingw32-clang -O2 -Wall -Wno-unused-parameter -Wno-format-truncation -I"$S/include" -I"$G/include" \
  -o "$AQUI/saida/kofnativo.exe" "$AQUI/kofnativo.c" "$G/src/glad.c" -L"$S/lib" -static -lSDL2 -lsetupapi -limm32 -lversion \
  -lwinmm -lole32 -loleaut32 -luuid -lgdi32 -luser32 -lshell32 -lws2_32 -lopengl32 -lpthread -mwindows
llvm-strip "$AQUI/saida/kofnativo.exe"
ls -l "$AQUI/saida"
