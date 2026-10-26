#!/usr/bin/env bash
# PlayStation 2: compila o Play! (github.com/jpd002/Play-, licença BSD-2) pra WebAssembly com o nosso remendo
# (play-kof.patch + codegen-kof.patch no submódulo CodeGen: botões e eixos direto do app, pausar/continuar, savestate, volume; .js num arquivo só, sem ES6).
# Resultado: nucleo-libretro/saida/play.js, no mesmo lugar dos outros núcleos (o juntar.py leva só pro PC).
# O arquivo NÃO é o módulo direto: é o código do Play! dentro de uma string (KofPlayCodigo). O Play! usa threads, e cada
# thread é um Worker que carrega o mesmo código; numa página file:// o Worker não consegue abrir o arquivo, então o app
# transforma a string num Blob e dá esse endereço blob: pra página e pros Workers (web/ps2.js).
# Precisa: git, cmake, ninja e o emscripten 4.0.1 (o mesmo do build oficial do Play!):
#   git clone https://github.com/emscripten-core/emsdk && emsdk/emsdk install 4.0.1 && emsdk/emsdk activate 4.0.1
#   source emsdk/emsdk_env.sh
# A primeira vez demora ~15 min (569 arquivos); depois só relinka.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
T="${T:-/tmp/kofnes-ps2}"
COMMIT=505dac73149fece41b04dd961078ce3011a8bed5
P="$T/play"
mkdir -p "$T" "$AQUI/../nucleo-libretro/saida"
if [ ! -d "$P/.git" ]; then git clone -q https://github.com/jpd002/Play-.git "$P"; fi
git -C "$P" fetch -q --depth 1 origin "$COMMIT" 2>/dev/null || true
git -C "$P" checkout -q -- . && git -C "$P" checkout -q "$COMMIT"
git -C "$P" submodule update -q --init --recursive --depth 1
git -C "$P" apply "$AQUI/play-kof.patch"
git -C "$P/deps/CodeGen" checkout -q -- . && git -C "$P/deps/CodeGen" apply "$AQUI/codegen-kof.patch"   # erro do gerador de wasm traz o bloco
(cd "$P" && [ -f build_cmake/build/wasm-ninja/build.ninja ] || emcmake cmake --preset wasm-ninja >/dev/null)
(cd "$P" && cmake --build --preset wasm-ninja-release --target Play)
python3 - "$P/build_cmake/build/wasm-ninja/Source/ui_js/Release/Play.js" "$AQUI/../nucleo-libretro/saida/play.js" <<'PY'
import json, sys
codigo = open(sys.argv[1]).read()
# Nucleo_play() devolve o código: é o que o nucleo.js procura pra saber que o núcleo carregou
open(sys.argv[2], "w").write("var KofPlayCodigo = " + json.dumps(codigo) + ";\nfunction Nucleo_play() { return KofPlayCodigo; }\n")
PY
ls -l "$AQUI/../nucleo-libretro/saida/play.js"
