#!/usr/bin/env python3
"""Extrai sprites e metadados do cliente UO Classic (MUL) para o formato do browserUO.

Uso:
  python tools/extrator/extrair_cliente.py <pasta-do-cliente> [--nomes nomes.json] [--saida public]

Lê art.mul, artidx.mul e tiledata.mul. Gera <saida>/sprites/{terreno,objetos}/*.png
e <saida>/catalogo/catalogo.json.

IDs no catálogo: terreno = id_land + 1 ; objeto = 100000 + id_item.
Os arquivos do cliente são de propriedade da EA/Broadwood: não os versione.
"""
import argparse
import json
import struct
import sys
from pathlib import Path

from PIL import Image

OFFSET_OBJETO = 100000
FLAG_IMPASSABLE = 0x40
FLAG_WET = 0x80


def cor555(v):
    r, g, b = (v >> 10) & 31, (v >> 5) & 31, v & 31
    return (r * 255 // 31, g * 255 // 31, b * 255 // 31, 255 if v else 0)


def ler_indice(caminho):
    dados = caminho.read_bytes()
    for i in range(len(dados) // 12):
        off, tam, _ = struct.unpack_from("<iii", dados, i * 12)
        yield i, off, tam


def decodificar_terreno(buf):
    img = Image.new("RGBA", (44, 44))
    px = img.load()
    p = 0
    for y in range(44):
        n = 2 * (y + 1) if y < 22 else 2 * (44 - y)
        x0 = 22 - n // 2
        for x in range(n):
            px[x0 + x, y] = cor555(struct.unpack_from("<H", buf, p)[0] | 0x8000)
            p += 2
    return img


def decodificar_estatico(buf):
    larg, alt = struct.unpack_from("<HH", buf, 4)
    if not (0 < larg < 1024 and 0 < alt < 1024):
        return None
    img = Image.new("RGBA", (larg, alt))
    px = img.load()
    base = 8 + alt * 2
    linhas = struct.unpack_from("<%dH" % alt, buf, 8)
    for y in range(alt):
        p = base + linhas[y] * 2
        x = 0
        while p + 4 <= len(buf):
            dx, n = struct.unpack_from("<HH", buf, p)
            p += 4
            if dx + n == 0:
                break
            x += dx
            for _ in range(n):
                if x < larg:
                    px[x, y] = cor555(struct.unpack_from("<H", buf, p)[0] | 0x8000)
                x += 1
                p += 2
    return img


def ler_tiledata(caminho):
    d = caminho.read_bytes()
    # formato novo (7.0.9+): flags de 64 bits
    novo = len(d) >= 512 * 964 and (len(d) - 512 * 964) % 1444 == 0 and (len(d) - 512 * 836) % 1316 != 0
    tam_land, tam_item = (30, 45) if novo else (26, 41)
    land, itens = [], []
    p = 0
    for _ in range(512):
        p += 4
        for _ in range(32):
            flags = struct.unpack_from("<Q" if novo else "<I", d, p)[0]
            q = p + (8 if novo else 4)
            nome = d[q + 2:q + 22].split(b"\0")[0].decode("latin-1")
            land.append((flags, nome))
            p += tam_land
    while p + 4 + 32 * tam_item <= len(d):
        p += 4
        for _ in range(32):
            flags = struct.unpack_from("<Q" if novo else "<I", d, p)[0]
            altura = d[p + tam_item - 21]
            nome = d[p + tam_item - 20:p + tam_item].split(b"\0")[0].decode("latin-1")
            itens.append((flags, altura, nome))
            p += tam_item
    return land, itens


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cliente", type=Path)
    ap.add_argument("--nomes", type=Path, help="nomes.json gerado por extrair_nomes_servidor.py")
    ap.add_argument("--saida", type=Path, default=Path("public"))
    a = ap.parse_args()

    for f in ("art.mul", "artidx.mul", "tiledata.mul"):
        if not (a.cliente / f).exists():
            sys.exit(f"{f} não encontrado em {a.cliente} (clientes UOP/7.0.x novos: use um cliente Classic ou converta para MUL)")

    nomes = json.loads(a.nomes.read_text(encoding="utf-8")) if a.nomes else {}
    land, itens = ler_tiledata(a.cliente / "tiledata.mul")
    art = (a.cliente / "art.mul").read_bytes()
    (a.saida / "sprites/terreno").mkdir(parents=True, exist_ok=True)
    (a.saida / "sprites/objetos").mkdir(parents=True, exist_ok=True)

    tiles = []
    for i, off, tam in ler_indice(a.cliente / "artidx.mul"):
        if off < 0 or tam <= 0:
            continue
        buf = art[off:off + tam]
        if i < 0x4000:
            if i >= len(land) or len(buf) < 2048:
                continue
            flags, nome = land[i]
            img = decodificar_terreno(buf)
            rel = f"terreno/0x{i:04X}.png"
            tiles.append({"id": i + 1, "nome": nome or f"Terreno 0x{i:04X}", "tipo": "terreno", "altura": 0,
                          "bloqueia": bool(flags & (FLAG_IMPASSABLE)),
                          "cor": "#%02x%02x%02x" % img.resize((1, 1), Image.BOX).getpixel((0, 0))[:3],
                          "sprite": {"arquivo": rel, "largura": 44, "altura": 44}})
        else:
            j = i - 0x4000
            if j >= len(itens):
                continue
            flags, altura, nome = itens[j]
            img = decodificar_estatico(buf)
            if img is None:
                continue
            rel = f"objetos/0x{j:04X}.png"
            tiles.append({"id": OFFSET_OBJETO + j, "nome": nome or nomes.get(str(j)) or f"Item 0x{j:04X}",
                          "tipo": "objeto", "altura": altura, "bloqueia": bool(flags & FLAG_IMPASSABLE),
                          "cor": "#808080",
                          "sprite": {"arquivo": rel, "largura": img.width, "altura": img.height}})
        img.save(a.saida / "sprites" / rel)

    (a.saida / "catalogo").mkdir(parents=True, exist_ok=True)
    (a.saida / "catalogo/catalogo.json").write_text(
        json.dumps({"versao": 1, "origem": "cliente-classic", "tiles": tiles}, ensure_ascii=False, indent=1),
        encoding="utf-8")
    print(f"{len(tiles)} tiles extraídos para {a.saida}")


if __name__ == "__main__":
    main()
