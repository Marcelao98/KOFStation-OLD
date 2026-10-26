#!/usr/bin/env bash
# PS2 nativo no PC (Linux x86_64): compila o kofnativo (kofnativo.c, com o SDL2 estático: abre X11/Wayland/som sozinho,
# sem pedir nada instalado) e o núcleo LRPS2 (github.com/libretro/ps2, o PCSX2 do libretro, GPL-3).
# Resultado em pc-nativo/saida/: kofnativo e pcsx2_libretro.so (fora do git; o publicar.sh leva pra publicado/nativo/).
# Precisa: gcc, cmake, ninja, git e os -dev do X11/Wayland/pulse/alsa (pro SDL2):
#   apt install libx11-dev libxext-dev libxrandr-dev libxcursor-dev libxi-dev libxss-dev libxkbcommon-dev libwayland-dev
#               wayland-protocols libpulse-dev libasound2-dev libegl-dev libgl-dev
# A primeira vez demora (~20 min o LRPS2). T=<pasta> troca onde ficam as fontes (padrão /tmp/kofnes-nativo).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
T="${T:-/tmp/kofnes-nativo}"
LRPS2=38d3a83f4ecdec977d609ece8afcc527f5f68702
mkdir -p "$T" "$AQUI/saida"
# SDL2 estático
if [ ! -f "$T/sdl2-inst/lib/libSDL2.a" ]; then
  [ -d "$T/sdl2" ] || git clone -q --depth 1 -b release-2.30.9 https://github.com/libsdl-org/SDL.git "$T/sdl2"
  cmake -S "$T/sdl2" -B "$T/sdl2/b" -G Ninja -DCMAKE_BUILD_TYPE=Release -DSDL_SHARED=OFF -DSDL_STATIC=ON -DSDL_STATIC_PIC=ON \
    -DSDL_TEST=OFF -DCMAKE_INSTALL_PREFIX="$T/sdl2-inst" >/dev/null
  ninja -C "$T/sdl2/b" install >/dev/null
fi
# LRPS2
if [ ! -d "$T/lrps2/.git" ]; then git clone -q https://github.com/libretro/ps2.git "$T/lrps2"; fi
git -C "$T/lrps2" fetch -q --depth 1 origin "$LRPS2" 2>/dev/null || true
git -C "$T/lrps2" checkout -q "$LRPS2"
cmake -S "$T/lrps2" -B "$T/lrps2/b" -G Ninja -DCMAKE_BUILD_TYPE=Release -DLIBRETRO=ON -DUSE_VULKAN=OFF -DUSE_OPENGL=ON >/dev/null
ninja -C "$T/lrps2/b"
cp "$T/lrps2/b/bin/pcsx2_libretro.so" "$AQUI/saida/" && strip "$AQUI/saida/pcsx2_libretro.so"
# kofnativo
cp "$T/lrps2/libretro/libretro-common/include/libretro.h" "$AQUI/libretro.h"
gcc -O2 -Wall -Wno-unused-parameter -Wno-format-truncation -I"$T/sdl2-inst/include" -D_REENTRANT \
  -o "$AQUI/saida/kofnativo" "$AQUI/kofnativo.c" "$T/sdl2-inst/lib/libSDL2.a" -lGL -ldl -lpthread -lm
strip "$AQUI/saida/kofnativo"
ls -l "$AQUI/saida"
