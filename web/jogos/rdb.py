"""Lê os arquivos .rdb do libretro-database (RARCHDB + registros em MessagePack)."""
import struct


def registros(dados):
    if dados[:7] != b"RARCHDB":
        raise ValueError("não é um .rdb")
    i = 16

    def ler():
        nonlocal i
        b = dados[i]; i += 1
        if b <= 0x7F: return b
        if 0x80 <= b <= 0x8F: return mapa(b & 0x0F)
        if 0x90 <= b <= 0x9F: return [ler() for _ in range(b & 0x0F)]
        if 0xA0 <= b <= 0xBF: return texto(b & 0x1F)
        if b == 0xC0: return None
        if b == 0xC2: return False
        if b == 0xC3: return True
        if b in (0xC4, 0xC5, 0xC6):
            n = tam({0xC4: 1, 0xC5: 2, 0xC6: 4}[b]); v = dados[i:i + n]; i += n; return bytes(v)
        if b in (0xCC, 0xCD, 0xCE, 0xCF): return tam({0xCC: 1, 0xCD: 2, 0xCE: 4, 0xCF: 8}[b])
        if b in (0xD0, 0xD1, 0xD2, 0xD3):
            n = {0xD0: 1, 0xD1: 2, 0xD2: 4, 0xD3: 8}[b]; v = int.from_bytes(dados[i:i + n], "big", signed=True); i += n; return v
        if b in (0xD9, 0xDA, 0xDB): return texto(tam({0xD9: 1, 0xDA: 2, 0xDB: 4}[b]))
        if b in (0xDC, 0xDD): return [ler() for _ in range(tam({0xDC: 2, 0xDD: 4}[b]))]
        if b in (0xDE, 0xDF): return mapa(tam({0xDE: 2, 0xDF: 4}[b]))
        if b >= 0xE0: return b - 256
        raise ValueError(f"MessagePack: byte {b:#x} em {i - 1}")

    def tam(n):
        nonlocal i
        v = int.from_bytes(dados[i:i + n], "big"); i += n; return v

    def texto(n):
        nonlocal i
        v = dados[i:i + n].decode("utf-8", "replace"); i += n; return v

    def mapa(n):
        return {ler(): ler() for _ in range(n)}

    while i < len(dados):
        r = ler()
        if not isinstance(r, dict):
            break
        yield r
