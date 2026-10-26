#!/usr/bin/env bash
# Compila o módulo de rede:
#   rede/saida/kofservico        (Linux x86-64, estático na medida do possível)
#   rede/saida/kofservico.exe    (Windows, mingw do Ubuntu)
#   rede/saida/libkofrede.so     (Linux, a ponte JNI pros testes do Rede.java)
#   android/nativo/lib/arm64-v8a/libkofrede.so  (celular; sem NDK, como o android/nativo/construir.sh)
# E roda o teste do núcleo.
set -euo pipefail
R="$(cd "$(dirname "$0")" && pwd)"; S="$R/saida"; mkdir -p "$S"
F="$R/kofrede.c $R/terceiros/monocypher.c"
gcc -O2 -Wall -I "$R" "$R/teste/nucleo.c" $F -o "$S/teste-nucleo" && "$S/teste-nucleo" | tail -1
gcc -O2 -Wall -Wno-format-truncation -I "$R" "$R/kofservico.c" $F -lpthread -o "$S/kofservico"
x86_64-w64-mingw32-gcc -O2 -Wall -Wno-format-truncation -I "$R" "$R/kofservico.c" $F -static -lpthread -lws2_32 -lshell32 -o "$S/kofservico.exe"
JDK="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
gcc -O2 -shared -fPIC -I "$R" -I "$JDK/include" -I "$JDK/include/linux" "$R/jni.c" $F -o "$S/libkofrede.so"
# Android ARM64: só precisa de memcpy/memset/strlen da libc do aparelho
A="$R/../android/nativo"; L="$A/lib/arm64-v8a"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT; mkdir -p "$L"
ALVO="--target=aarch64-linux-android24"
echo 'void kof_stub(void){}' | clang $ALVO -x c -shared -nostdlib -fPIC -fuse-ld=lld -Wl,-soname,libc.so -o "$T/libc.so" -
clang $ALVO -O2 -fPIC -ffreestanding -fno-stack-protector -Wall -I "$A/inc" -I "$R" -shared -nostdlib -fuse-ld=lld \
  -Wl,--hash-style=both -Wl,-z,noexecstack -Wl,-soname,libkofrede.so -L"$T" "$R/jni.c" $F -lc -o "$L/libkofrede.so"
ls -l "$S" "$L/libkofrede.so"
