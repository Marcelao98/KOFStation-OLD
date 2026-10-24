#!/usr/bin/env bash
# Compila as pontes nativas (kofnativo.c) do PlayStation e do Nintendo 64 pra Android ARM64 SEM o NDK: só o clang/lld do
# Ubuntu, o jni.h do JDK (em inc/) e declarações próprias da libc. As bibliotecas do aparelho (libc, liblog, libEGL) entram
# como "stubs" vazios só pro linker anotar a dependência. Os núcleos são builds do libretro já prontos, distribuídos pelo
# Lemuroid (github.com/Swordfish90/LemuroidCores), baixados pelo git pra android/nativo/lib/ (fora do git do KOFstation):
#   PlayStation: PCSX-ReARMed (GPL-2, recompilador ari64)  -> libretro.so (é o SONAME dele)
#   Nintendo 64: Mupen64Plus-Next (GPL-2, GLideN64 em OpenGL ES 3) -> libn64.so (SONAME trocado com o patchelf: o
#                original também se chama libretro.so e os dois precisam conviver no APK)
#   android/nativo/construir.sh    -> android/nativo/lib/arm64-v8a/{libkofps1.so, libretro.so, libkofn64.so, libn64.so}
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; L="$AQUI/lib/arm64-v8a"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$L"
COMMIT="fee2e824525daa22bcf318f96127fe43fa8a15ad"   # LemuroidCores
baixar() {   # $1 = pasta do núcleo no LemuroidCores, $2 = arquivo, $3 = destino. Pelo git: o download direto pelo raw é bloqueado
  [ -f "$3" ] && return
  [ -d "$T/lc" ] || git clone -q --filter=blob:none --no-checkout https://github.com/Swordfish90/LemuroidCores.git "$T/lc"
  git -C "$T/lc" sparse-checkout set --no-cone "/$1/src/main/jniLibs/arm64-v8a/"
  git -C "$T/lc" checkout -q "$COMMIT"
  cp "$T/lc/$1/src/main/jniLibs/arm64-v8a/$2" "$3"
}
baixar lemuroid_core_pcsx_rearmed libpcsx_rearmed_libretro_android.so "$L/libretro.so"
if [ ! -f "$L/libn64.so" ]; then
  baixar lemuroid_core_mupen64plus_next_gles3 libmupen64plus_next_gles3_libretro_android.so "$T/n64.so"
  patchelf --set-soname libn64.so "$T/n64.so" && mv "$T/n64.so" "$L/libn64.so"
fi
ALVO="--target=aarch64-linux-android24"
for l in c log EGL; do echo 'void kof_stub(void){}' | clang $ALVO -x c -shared -nostdlib -fPIC -fuse-ld=lld -Wl,-soname,lib$l.so -o "$T/lib$l.so" -; done
CC="clang $ALVO -O2 -fPIC -ffreestanding -fno-stack-protector -Wall -Wno-builtin-requires-header -I$AQUI/inc"
LD="clang $ALVO -shared -nostdlib -fuse-ld=lld -Wl,--hash-style=both -Wl,-z,noexecstack -L$T -L$L"
$CC -DCLASSE=Ps1 -c "$AQUI/kofnativo.c" -o "$T/ps1.o"
$LD -Wl,-soname,libkofps1.so -o "$L/libkofps1.so" "$T/ps1.o" -lretro -lc -llog
$CC -DCLASSE=N64 -DKOF_GL -c "$AQUI/kofnativo.c" -o "$T/n64.o"
$LD -Wl,-soname,libkofn64.so -o "$L/libkofn64.so" "$T/n64.o" -ln64 -lc -llog -lEGL
ls -l "$L"
