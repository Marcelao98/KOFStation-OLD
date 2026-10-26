# 📈 Progresso do KOFstation

Onde cada parte está. Atualizado em **26/10/2026** (versão publicada **202610260355**).
A história contada fica no [HISTORICO.md](../HISTORICO.md) e a engenharia em [arquitetura.md](arquitetura.md).

## Consoles

| Console | Núcleo (licença) | PC | Celular | Situação |
|---|---|---|---|---|
| Super Nintendo | Snes9x (não comercial); o núcleo **Kof** fica como opção no PC | ✅ | ✅ | Testado, roda liso |
| NES | FCEUmm (GPL-2) | ✅ | ✅ | Testado |
| Game Boy / Color | Gambatte (GPL-2) | ✅ | ✅ | Testado |
| Game Boy Advance | mGBA (MPL-2.0) | ✅ | ✅ | Testado; BIOS opcional |
| Mega Drive / Master System / Game Gear | Genesis Plus GX (não comercial) | ✅ | ✅ | Testado (Sonic) |
| Neo Geo | FBNeo (não comercial) | ✅ | ✅ | Testado (KOF); precisa do neogeo.zip |
| PlayStation | PCSX-ReARMed (GPL-2) | ✅ WebAssembly | ✅ nativo | Liso no PC; o nativo do celular falta confirmar com jogo de verdade |
| Nintendo 64 | Mupen64Plus-Next (GPL-2) | ✅ WebAssembly | ✅ nativo | Falta confirmar com jogo de verdade |
| PlayStation 2 | PCSX2/LRPS2 (GPL-3) no kofnativo; Play! (BSD-2) de reserva | 🟡 Linux | ❌ | Falta confirmar o Shadow of the Colossus. Windows sem o kofnativo ainda. Ver [ps2.md](ps2.md) |

## O que o app já faz

- **Biblioteca** com pasta de ROMs, capas, busca por gênero, empresa, ano e série (base do libretro-database, CC BY-SA 4.0).
- **Saves** no banco do navegador, **backup `.kofsave`**, savestates, rebobinar.
- **Modos de jogo** escolhidos ao abrir o jogo: 😄 Só alegria, 🙂 Normal, 😤 Raiz e 💀 Hardcore. Também tem a aba **Opções de emulação** (limite de estados, tempo de rebobinar, salvar automático...).
- **126 temas**, filtros e efeitos de imagem (F4), molduras, painel de desempenho (F3).
- **Jukebox** com os canais de som de cada console e trilha própria (violino e FM).
- **Traduções** IPS/BPS/UPS.
- **Celular**: APK que se atualiza sozinho, controle de toque, pasta de ROMs. O celular também pode ser **controle do PC**, e o controle muda conforme o console do jogo aberto.
- **Atualizador**: `KOFstation.exe` (Windows) e `kofnes.sh` (Linux) baixam a versão nova de `publicado/`.
- **Tela de BIOS** (🔑): um botão por console, mostra o que já está guardado.

## Em aberto

1. **PS2:** confirmar no Linux do Marcelo, depois levar o kofnativo pro Windows e pôr molduras.
2. **Motor novo** (se precisar de mais desempenho): emulação num Worker e som por AudioWorklet.
3. **Fase 3 dos saves:** sincronizar saves e estatísticas entre PC e celular pela conexão do controle.
4. **Versão comercial** (ideia): trocar os núcleos não comerciais (Snes9x, Genesis Plus GX, FBNeo) por Geolith, ares, Gearsystem/BlastEm ou o núcleo Kof.
5. **Kof aos poucos:** reescrever consoles em Kof um por vez (Game Boy → NES → Master System...), usando o núcleo libretro como gabarito.

## Consoles novos (ordem combinada em 26/10)

1. **PSP** (PPSSPP): PC pelo kofnativo, celular nativo, sem BIOS.
2. **Nintendo DS** (melonDS): navegador e celular, tela de toque.
3. **Portáteis leves** (Neo Geo Pocket, WonderSwan, Lynx, Virtual Boy): núcleos pequenos no navegador.
4. Depois: GameCube/Wii (Dolphin pelo kofnativo), PC Engine, Sega CD, Dreamcast.
5. **Bem depois: PS3 e Switch.** Não existe núcleo libretro deles, exigem um PC forte e precisam de firmware e chaves do console. O do Switch ainda tem risco jurídico: a Nintendo processou os autores do Yuzu em 2024. Por enquanto, só ideia.

## Bugs conhecidos

- Mega Man X: defeito gráfico na parte de baixo da tela (núcleo Kof).
- Super Mario All-Stars + World trava na mensagem do começo (núcleo Kof).
