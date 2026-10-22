"""Extrator de sprites do cliente do UO Outlands (arquivos .uoo).

Lê a pasta de instalação do cliente e gera:
  - public/catalogo/catalogo.json   (contrato descrito no README)
  - public/sprites/terreno/*.png e public/sprites/objetos/*.png
  - public/gumps/*.png (ícones de magia) e public/sons/*.wav

Uso:
  python scripts/extrator/extrair_sprites.py
  python scripts/extrator/extrair_sprites.py --cliente "C:/Program Files (x86)/Ultima Online Outlands"

Formato .uoo (deduzido dos arquivos, não documentado oficialmente):
  - Cabeçalho: magic u32 (0x1E7FAB6D) + versão u32.
  - art.uoo / landtiles.uoo: entradas em sequência, cada uma com
      id u32, tamanho u32, e (se tamanho > 0)
      largura u16, altura u16, caixa útil 4×u16, tamanho comprimido u32, dados em deflate puro.
    Os dados descomprimidos são largura*altura pixels ARGB1555 (0 = transparente).
  - artdata.uoo (objetos, 72 bytes) e landdata.uoo (terreno, 48 bytes): cabeçalho + quantidade u32
    + registros no estilo do tiledata.mul (flags u64 no início, nome ASCII com 36 bytes).

Não usa bibliotecas externas: os PNGs são gravados com zlib da biblioteca padrão.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import zlib
from dataclasses import dataclass
from pathlib import Path

MAGIC_UOO = 0x1E7FAB6D
PASTA_CLIENTE_PADRAO = Path(r"C:\Program Files (x86)\Ultima Online Outlands")
RAIZ_PROJETO = Path(__file__).resolve().parents[2]

# Flags do tiledata usadas aqui
FLAG_IMPASSAVEL = 0x40

# Ids de catálogo: terreno usa o id do gráfico; objeto soma 0x4000 (mesma convenção do art.mul).
BASE_ID_OBJETO = 0x4000

TAM_REGISTRO_TERRENO = 48
TAM_REGISTRO_OBJETO = 72


@dataclass
class InfoTile:
    nome: str
    flags: int
    altura: int


@dataclass
class Imagem:
    largura: int
    altura: int
    rgba: bytes


# ---------------------------------------------------------------- leitura .uoo

def ler_arquivo_uoo(caminho: Path) -> bytes:
    dados = caminho.read_bytes()
    magic = struct.unpack_from("<I", dados, 0)[0]
    if magic != MAGIC_UOO:
        raise ValueError(f"{caminho.name}: magic inesperado {magic:#x}")
    return dados


def indexar_entradas(dados: bytes) -> dict[int, int]:
    """Mapeia id -> posição do cabeçalho da imagem, percorrendo as entradas em sequência."""
    indice: dict[int, int] = {}
    pos = 8
    while pos + 8 <= len(dados):
        ident, tamanho = struct.unpack_from("<II", dados, pos)
        if pos + 8 + tamanho > len(dados):
            break  # bloco final (rodapé) que não é entrada
        if tamanho > 0:
            indice[ident] = pos + 8
        pos += 8 + tamanho
    return indice


def decodificar_imagem(dados: bytes, pos: int) -> Imagem:
    largura, altura = struct.unpack_from("<HH", dados, pos)
    tamanho_comprimido = struct.unpack_from("<I", dados, pos + 12)[0]
    bruto = zlib.decompress(dados[pos + 16: pos + 16 + tamanho_comprimido], -15)
    pixels = struct.unpack_from(f"<{largura * altura}H", bruto)
    rgba = bytearray(largura * altura * 4)
    for i, p in enumerate(pixels):
        if p:
            o = i * 4
            rgba[o] = ((p >> 10) & 31) * 255 // 31
            rgba[o + 1] = ((p >> 5) & 31) * 255 // 31
            rgba[o + 2] = (p & 31) * 255 // 31
            rgba[o + 3] = 255
    return Imagem(largura, altura, bytes(rgba))


def ler_tiledata(caminho: Path, tam_registro: int, pos_nome: int, pos_altura: int | None) -> list[InfoTile]:
    dados = ler_arquivo_uoo(caminho)
    quantidade = struct.unpack_from("<I", dados, 8)[0]
    infos = []
    for i in range(quantidade):
        r = 12 + i * tam_registro
        flags = struct.unpack_from("<Q", dados, r)[0]
        nome = dados[r + pos_nome: r + pos_nome + 36].split(b"\0")[0].decode("latin-1").strip()
        altura = dados[r + pos_altura] if pos_altura is not None else 0
        infos.append(InfoTile(nome, flags, altura))
    return infos


# ---------------------------------------------------------------- seleção

def ler_faixa(faixa: list[str]) -> tuple[int, int]:
    return int(faixa[0], 0), int(faixa[1], 0)


def selecionar(infos: list[InfoTile], grupos: list[dict], faixa_padrao: tuple[int, int],
               existentes: dict[int, int]) -> list[tuple[str, int]]:
    """Retorna (grupo, id do gráfico) na ordem dos grupos; cada gráfico entra uma vez só."""
    escolhidos: list[tuple[str, int]] = []
    usados: set[int] = set()
    for g in grupos:
        nomes = {n.lower() for n in g["nomes"]}
        ini, fim = ler_faixa(g["faixa"]) if "faixa" in g else faixa_padrao
        achados = 0
        for gid in range(max(ini, 0), min(fim, len(infos) - 1) + 1):
            if gid in usados or gid not in existentes:
                continue
            if infos[gid].nome.lower() in nomes:
                escolhidos.append((g["grupo"], gid))
                usados.add(gid)
                achados += 1
        if achados == 0:
            print(f"  aviso: grupo '{g['grupo']}' não encontrou nenhum tile", file=sys.stderr)
    return escolhidos


# ---------------------------------------------------------------- saída

def gravar_png(caminho: Path, img: Imagem) -> None:
    linhas = b"".join(
        b"\x00" + img.rgba[y * img.largura * 4:(y + 1) * img.largura * 4] for y in range(img.altura)
    )

    def bloco(tipo: bytes, conteudo: bytes) -> bytes:
        crc = zlib.crc32(tipo + conteudo) & 0xFFFFFFFF
        return struct.pack(">I", len(conteudo)) + tipo + conteudo + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", img.largura, img.altura, 8, 6, 0, 0, 0)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(
        b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", ihdr) + bloco(b"IDAT", zlib.compress(linhas, 9)) + bloco(b"IEND", b"")
    )


def cor_media(img: Imagem) -> str:
    """Cor média dos pixels opacos: vira o placeholder quando o PNG não está disponível."""
    soma = [0, 0, 0]
    n = 0
    for o in range(0, len(img.rgba), 4):
        if img.rgba[o + 3]:
            soma[0] += img.rgba[o]
            soma[1] += img.rgba[o + 1]
            soma[2] += img.rgba[o + 2]
            n += 1
    if n == 0:
        return "#808080"
    return "#" + "".join(f"{v // n:02x}" for v in soma)


def extrair_tipo(tipo: str, pasta_saida: str, dados_arte: bytes, indice: dict[int, int],
                 infos: list[InfoTile], escolhidos: list[tuple[str, int]], pasta_sprites: Path) -> list[dict]:
    tiles = []
    vistos: set[tuple[str, bytes]] = set()  # (grupo, hash) para não repetir imagens idênticas no mesmo grupo
    for grupo, gid in escolhidos:
        img = decodificar_imagem(dados_arte, indice[gid])
        if not any(img.rgba[3::4]):
            continue  # imagem vazia
        assinatura = (grupo, hashlib.sha1(img.rgba + struct.pack("<HH", img.largura, img.altura)).digest())
        if assinatura in vistos:
            continue
        vistos.add(assinatura)

        arquivo = f"{pasta_saida}/0x{gid:04X}.png"
        gravar_png(pasta_sprites / arquivo, img)
        info = infos[gid]
        tiles.append({
            "id": gid if tipo == "terreno" else BASE_ID_OBJETO + gid,
            "nome": info.nome or f"{tipo} 0x{gid:04X}",
            "tipo": tipo,
            "altura": 0 if tipo == "terreno" else info.altura,
            "bloqueia": bool(info.flags & FLAG_IMPASSAVEL),
            "cor": cor_media(img),
            "grupo": grupo,
            "grafico": gid,
            "sprite": {"arquivo": arquivo, "largura": img.largura, "altura": img.altura},
        })
    return tiles


def extrair_gumps(caminho: Path, ids: list[int], pasta: Path) -> int:
    """gumps.uoo usa o mesmo formato de entradas do art.uoo."""
    dados = ler_arquivo_uoo(caminho)
    indice = indexar_entradas(dados)
    gravados = 0
    for gid in ids:
        if gid not in indice:
            print(f"  aviso: gump 0x{gid:04X} não existe", file=sys.stderr)
            continue
        gravar_png(pasta / f"0x{gid:04X}.png", decodificar_imagem(dados, indice[gid]))
        gravados += 1
    return gravados


def extrair_sons(pasta_cliente: Path, ids: list[int], pasta: Path) -> int:
    """sound.mul + soundidx.mul (formato clássico): cabeçalho de 40 bytes + PCM 16 bits mono 22050 Hz."""
    indice = (pasta_cliente / "soundidx.mul").read_bytes()
    gravados = 0
    with open(pasta_cliente / "sound.mul", "rb") as arq:
        for sid in ids:
            pos, tamanho, _ = struct.unpack_from("<iii", indice, sid * 12)
            if pos < 0 or tamanho <= 40:
                print(f"  aviso: som 0x{sid:04X} não existe", file=sys.stderr)
                continue
            arq.seek(pos + 40)
            pcm = arq.read(tamanho - 40)
            cabecalho = struct.pack(
                "<4sI4s4sIHHIIHH4sI", b"RIFF", 36 + len(pcm), b"WAVE", b"fmt ", 16, 1, 1,
                22050, 22050 * 2, 2, 16, b"data", len(pcm),
            )
            pasta.mkdir(parents=True, exist_ok=True)
            (pasta / f"0x{sid:04X}.wav").write_bytes(cabecalho + pcm)
            gravados += 1
    return gravados


# ---------------------------------------------------------------- principal

def main() -> int:
    ap = argparse.ArgumentParser(description="Gera catalogo.json e sprites a partir do cliente do UO Outlands.")
    ap.add_argument("--cliente", type=Path, default=PASTA_CLIENTE_PADRAO, help="pasta de instalação do cliente")
    ap.add_argument("--selecao", type=Path, default=Path(__file__).with_name("selecao.json"))
    ap.add_argument("--saida", type=Path, default=RAIZ_PROJETO / "public", help="pasta public/ do projeto")
    args = ap.parse_args()

    selecao = json.loads(args.selecao.read_text(encoding="utf-8"))
    faixa_padrao = ler_faixa(selecao["faixaPadrao"])
    pasta_sprites = args.saida / "sprites"

    print("Lendo tiledata...")
    infos_terreno = ler_tiledata(args.cliente / "landdata.uoo", TAM_REGISTRO_TERRENO, pos_nome=12, pos_altura=None)
    infos_objeto = ler_tiledata(args.cliente / "artdata.uoo", TAM_REGISTRO_OBJETO, pos_nome=36, pos_altura=32)

    print("Indexando arte...")
    arte_terreno = ler_arquivo_uoo(args.cliente / "landtiles.uoo")
    arte_objeto = ler_arquivo_uoo(args.cliente / "art.uoo")
    indice_terreno = indexar_entradas(arte_terreno)
    indice_objeto = indexar_entradas(arte_objeto)

    print("Selecionando e gravando sprites...")
    tiles = extrair_tipo(
        "terreno", "terreno", arte_terreno, indice_terreno, infos_terreno,
        selecionar(infos_terreno, selecao["terreno"], faixa_padrao, indice_terreno), pasta_sprites,
    )
    tiles += extrair_tipo(
        "objeto", "objetos", arte_objeto, indice_objeto, infos_objeto,
        selecionar(infos_objeto, selecao["objetos"], faixa_padrao, indice_objeto), pasta_sprites,
    )

    origem = f"outlands-uoo:{args.cliente.name}"
    destino = args.saida / "catalogo" / "catalogo.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    # Um tile por linha: arquivo compacto e com diffs legíveis.
    linhas = ",\n    ".join(json.dumps(t, ensure_ascii=False) for t in tiles)
    texto = '{"versao": 1, "origem": ' + json.dumps(origem, ensure_ascii=False) + ', "tiles": [\n    ' + linhas + "\n]}\n"
    destino.write_text(texto, encoding="utf-8")

    print("Gravando icones e sons...")
    n_gumps = extrair_gumps(args.cliente / "gumps.uoo", [int(g, 0) for g in selecao.get("gumps", [])],
                            args.saida / "gumps")
    n_sons = extrair_sons(args.cliente, [int(s, 0) for s in selecao.get("sons", [])], args.saida / "sons")

    n_terreno = sum(1 for t in tiles if t["tipo"] == "terreno")
    print(f"Pronto: {n_terreno} terrenos e {len(tiles) - n_terreno} objetos em {destino}")
    print(f"        {n_gumps} gumps em public/gumps e {n_sons} sons em public/sons")
    return 0


if __name__ == "__main__":
    sys.exit(main())
