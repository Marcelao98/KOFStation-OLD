#!/bin/sh
# Testa o SavesNativos.java (lista, lê e grava os saves do PS1/N64 nativos; recusa caminho fora das pastas de save)
set -e
RAIZ=$(cd "$(dirname "$0")/../.." && pwd); T=$(mktemp -d)
javac -d "$T/out" "$RAIZ/android/src/dev/kofnes/android/SavesNativos.java" "$RAIZ/testes/android/TesteSavesNativos.java"
mkdir -p "$T/base" && java -cp "$T/out" dev.kofnes.android.TesteSavesNativos "$T/base"
