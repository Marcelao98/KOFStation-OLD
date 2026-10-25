"""Monta a base de jogos da busca (web/jogos/jogos.json.gz) a partir do libretro-database.

Uso: python3 web/jogos/montar.py [<pasta com os .rdb já baixados>]
Sem a pasta, baixa os .rdb de github.com/libretro/libretro-database (rdb/<sistema>.rdb).

Cada .rdb é a base do RetroArch de um console: nome No-Intro/Redump, CRC32, gênero, empresa, ano...
A saída junta as versões do mesmo jogo (Japão, EUA, Europa...) num registro só, pelo título sem os parênteses:
  {"v": 1, "t": {"g": [gêneros], "e": [empresas], "s": [séries]},
   "j": {sis: [[título, ano, [gêneros], publicou, desenvolveu, série, jogadores], ...]},
   "c": {sis: "<CRC32 em hex, 8 letras><índice em hex>,..."}}
Os textos repetidos (gênero, empresa, série) viram índices nas tabelas de "t"; -1 = sem informação. O app acha o jogo
pelo título (o nome do arquivo sem os parênteses) ou, com a ROM aberta, pelo CRC32; no Neo Geo, pelo nome do set.
Gêneros já saem em português (GENERO). Vai pro html como nucleos/jogos-<hash>.js: JSON em gzip + base64.
"""
import gzip
import json
import pathlib
import re
import sys
import unicodedata
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import rdb  # noqa: E402

AQUI = pathlib.Path(__file__).parent
URL = "https://raw.githubusercontent.com/libretro/libretro-database/master/rdb/"
SISTEMAS = {
    "snes": ["Nintendo - Super Nintendo Entertainment System"],
    "nes": ["Nintendo - Nintendo Entertainment System"],
    "gb": ["Nintendo - Game Boy", "Nintendo - Game Boy Color"],
    "gba": ["Nintendo - Game Boy Advance"],
    "md": ["Sega - Mega Drive - Genesis"],
    "sms": ["Sega - Master System - Mark III"],
    "gg": ["Sega - Game Gear"],
    "ps1": ["Sony - PlayStation"],
    "neogeo": ["FBNeo - Arcade Games"],
}


# os ~70 gêneros do libretro-database viram ~20 em português (o que não está aqui vai pra "Outros")
GENERO = {
    "Action": "Ação", "Arcade": "Ação", "Platform": "Plataforma", "Platformer": "Plataforma",
    "Role-playing (RPG)": "RPG", "Fighting": "Luta", "Beat'em Up": "Briga de rua", "Adventure": "Aventura",
    "Racing": "Corrida", "Shoot'em Up": "Navinha", "Shooter": "Tiro", "Lightgun Shooter": "Tiro", "Gun": "Tiro",
    "Sports": "Esporte", "Sports with Animals": "Esporte", "Hunting and Fishing": "Esporte", "Football": "Esporte",
    "Basketball": "Esporte", "Tennis": "Esporte", "Wrestling": "Esporte", "Boxing": "Esporte",
    "Simulation": "Simulação", "Flight Simulator": "Simulação", "Breeding": "Simulação", "Constructing": "Simulação",
    "Building": "Simulação", "Cooking": "Simulação", "Strategy": "Estratégia", "SLG": "Estratégia",
    "Puzzle": "Quebra-cabeça", "Tetris": "Quebra-cabeça", "Thinking": "Quebra-cabeça", "Breakout": "Quebra-cabeça",
    "Mahjong & Puzzle": "Quebra-cabeça", "Card": "Cartas e tabuleiro", "Board": "Cartas e tabuleiro",
    "Chess": "Cartas e tabuleiro", "Shogi": "Cartas e tabuleiro", "Go": "Cartas e tabuleiro", "Mahjong": "Cartas e tabuleiro",
    "Tarot": "Cartas e tabuleiro", "Gambling": "Cassino", "Pinball": "Pinball", "Quiz": "Quiz",
    "Music": "Música e dança", "Dancing": "Música e dança", "Party": "Festa", "Mini Games": "Festa", "Casual Game": "Festa",
    "Educational": "Educativo", "Colouring Game": "Educativo", "Colouring Book": "Educativo",
    "Interactive Movie": "História interativa", "Interactive Comic": "História interativa", "Sound Novel": "História interativa",
    "Visual Novel": "História interativa", "Dating": "História interativa", "Survival Horror": "Terror",
    "Compilation": "Coletânea", "Adult": "Adulto",
}


def normal(t):   # igual ao normal() do app.js: sem acento, minúsculo, só letras e números
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


ARTIGO = re.compile(r"^(.*?), (The|A|An|Le|La|Les|Die|Der|Das|El|Los|Las)\b(.*)$")


def chave(t):   # "Legend of Zelda, The - A Link..." e "The Legend of Zelda: A Link..." são o mesmo jogo
    m = ARTIGO.match(t)
    return normal(m.group(2) + " " + m.group(1) + m.group(3) if m else t)


def titulo(nome):   # "Super Mario World (USA) (Rev 1)" -> "Super Mario World"
    return re.sub(r"\s*[\(\[].*$", "", nome).strip() or nome


def texto(v):
    return v.decode("utf-8", "replace") if isinstance(v, bytes) else v


def empresa(v):
    v = re.sub(r"\s*\?+$", "", (texto(v) or "").strip())   # "Nintendo ???" -> "Nintendo"
    return "" if v.lower() in ("", "unknown", "<unknown>", "homebrew") or v.lower().startswith(("hack", "bootleg")) else v


def baixar(pasta, nome):
    f = pasta / (nome + ".rdb")
    if not f.exists():
        print("  baixando", nome)
        with urllib.request.urlopen(URL + urllib.parse.quote(nome + ".rdb")) as r:
            f.write_bytes(r.read())
    return f.read_bytes()


def sets_neogeo():
    txt = (AQUI.parent / "neogeo-jogos.js").read_text()
    m = re.search(r"const KofNeoGeoJogos = (\{.*?\});", txt)
    return json.loads(m.group(1))


def main():
    pasta = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else AQUI / ".rdb"
    pasta.mkdir(parents=True, exist_ok=True)
    tabs = {"g": [], "e": [], "s": []}
    idx = {k: {} for k in tabs}

    def num(tab, v):
        if not v:
            return -1
        if v not in idx[tab]:
            idx[tab][v] = len(tabs[tab]); tabs[tab].append(v)
        return idx[tab][v]

    neo = sets_neogeo()
    saida = {"v": 1, "t": tabs, "j": {}, "c": {}}
    for sis, bases in SISTEMAS.items():
        regs = [r for b in bases for r in rdb.registros(baixar(pasta, b))]
        if sis == "ps1":   # Redump: as faixas e os dados (gênero...) vêm em registros separados, ligados pelo código do disco
            por_serial = {}
            for r in regs:
                s = texto(r.get("serial"))
                if s: por_serial.setdefault(s, {}).update({k: v for k, v in r.items() if v not in (None, "")})
            regs = list(por_serial.values()) + [r for r in regs if not r.get("serial")]
        if sis == "neogeo":   # só os sets do Neo Geo; o set pai primeiro (os dados dele valem mais que os de um clone/hack)
            regs = [r for r in regs if (texto(r.get("rom_name")) or "")[:-4] in neo]
            regs.sort(key=lambda r: len(neo[texto(r["rom_name"])[:-4]]))
        jogos, chave_jogo, crcs = [], {}, []
        for r in regs:
            nome = texto(r.get("name")) or ""
            if sis == "neogeo":   # o título vem da lista do FBNeo (a mesma do app), pelo set pai: os clones caem no mesmo jogo
                setn = texto(r["rom_name"])[:-4]
                pai = neo[setn][1] if len(neo[setn]) > 1 else setn
                base = titulo(neo.get(pai, [nome])[0])
            else:
                base = titulo(nome)
            if not base:
                continue
            k = chave(base)
            if k not in chave_jogo:
                chave_jogo[k] = len(jogos); jogos.append({"t": base, "a": 0, "g": [], "p": "", "d": "", "s": "", "u": 0})
            j = jogos[chave_jogo[k]]
            ano = r.get("releaseyear")
            if isinstance(ano, int) and 1970 < ano < 2100 and (not j["a"] or ano < j["a"]): j["a"] = ano
            for g in re.split(r"\s*[,/]\s*", texto(r.get("genre")) or ""):
                g = GENERO.get(g, "Outros") if g else ""
                if g and g not in j["g"]: j["g"].append(g)
            j["p"] = j["p"] or empresa(r.get("publisher"))
            j["d"] = j["d"] or empresa(r.get("developer"))
            j["s"] = j["s"] or (texto(r.get("franchise")) or "").strip()
            u = r.get("users")
            if isinstance(u, int) and u > j["u"]: j["u"] = u
            c = r.get("crc")
            if isinstance(c, bytes) and len(c) == 4 and sis != "neogeo":
                crcs.append(c.hex() + format(chave_jogo[k], "x"))
        # jogo sem informação nenhuma não serve pra busca: sai (os índices dos CRCs são refeitos)
        novo = {}
        for i, j in enumerate(jogos):
            if j["a"] or j["g"] or j["p"] or j["d"] or j["s"] or j["u"]: novo[i] = len(novo)
        jogos = [j for i, j in enumerate(jogos) if i in novo]
        crcs = [c[:8] + format(novo[int(c[8:], 16)], "x") for c in crcs if int(c[8:], 16) in novo]
        lista = []
        for j in jogos:
            l = [j["t"], j["a"], [num("g", g) for g in j["g"]], num("e", j["p"]), num("e", j["d"]), num("s", j["s"]), j["u"]]
            while len(l) > 1 and l[-1] in (0, -1, []): l.pop()   # campos vazios no fim não vão
            lista.append(l)
        saida["j"][sis], saida["c"][sis] = lista, ",".join(sorted(set(crcs)))
        print(f"{sis}: {len(jogos)} jogos com informação, {len(crcs)} CRCs")
    destino = AQUI / "jogos.json.gz"
    dados = json.dumps(saida, ensure_ascii=False, separators=(",", ":")).encode()
    destino.write_bytes(gzip.compress(dados, 9, mtime=0))   # mtime 0: mesma base = mesmo arquivo (e mesmo hash no nome)
    print(destino, destino.stat().st_size // 1024, "KB")
    print("gêneros:", tabs["g"], "| empresas:", len(tabs["e"]), "| séries:", len(tabs["s"]))


if __name__ == "__main__":
    main()
