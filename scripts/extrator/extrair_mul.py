"""Extrator de sprites de um cliente UO clássico (arquivos .mul), ex.: ZuluHotel Brasil.

Gera as mesmas saídas do extrair_sprites.py (Outlands) e usa o mesmo selecao.json:
  public/catalogo/catalogo.json, public/sprites/, public/gumps/, public/sons/, public/efeitos/,
  public/animacoes/ e public/interface/

Uso:
  python scripts/extrator/extrair_mul.py
  python scripts/extrator/extrair_mul.py --cliente "cliente/extraido/ZuluHotel Brasil OldSkull/Ultima Online"

Arquivos lidos: tiledata.mul, art.mul/artidx.mul, gumpart.mul/gumpidx.mul, sound.mul/soundidx.mul,
animdata.mul, anim*.mul/anim*.idx, bodyconv.def, hues.mul e unifont*.mul.

Este cliente usa ids estendidos (equipamentos 400+, montarias 820+) iguais aos do selecao.json.
Os arquivos do cliente são propriedade de terceiros: gere os PNGs localmente e não os versione.
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from pathlib import Path

import extrair_sprites as es
from extrair_sprites import Imagem, Quadro

RAIZ_PROJETO = es.RAIZ_PROJETO
ID_BASE_OBJETO = es.BASE_ID_OBJETO  # art.mul guarda os estáticos depois dos 0x4000 tiles de terreno

TAM_TERRENO = 26
TAM_ITEM = 37


def localizar_cliente(raiz: Path) -> Path | None:
    for achado in sorted((raiz / "cliente").rglob("tiledata.mul")):
        return achado.parent
    return None


def pixel_rgba(p: int) -> tuple[int, int, int]:
    return ((p >> 10) & 31) * 255 // 31, ((p >> 5) & 31) * 255 // 31, (p & 31) * 255 // 31


# ---------------------------------------------------------------- tiledata.mul (formato antigo)

def ler_tiledata_mul(caminho: Path) -> tuple[list[es.InfoTile], list[es.InfoTile], list[tuple[int, int]]]:
    """Terreno (26 bytes/registro), itens (37 bytes) e, por item, (animação, camada)."""
    d = caminho.read_bytes()
    terreno: list[es.InfoTile] = []
    p = 0
    for _ in range(512):
        p += 4
        for _ in range(32):
            flags = struct.unpack_from("<I", d, p)[0]
            nome = d[p + 6:p + 26].split(b"\0")[0].decode("latin-1").strip()
            terreno.append(es.InfoTile(nome, flags, 0))
            p += TAM_TERRENO
    itens: list[es.InfoTile] = []
    equip: list[tuple[int, int]] = []
    while p + 4 + 32 * TAM_ITEM <= len(d):
        p += 4
        for _ in range(32):
            flags = struct.unpack_from("<I", d, p)[0]
            equip.append((struct.unpack_from("<H", d, p + 10)[0], d[p + 5]))
            nome = d[p + 17:p + 37].split(b"\0")[0].decode("latin-1").strip()
            itens.append(es.InfoTile(nome, flags, d[p + 16]))
            p += TAM_ITEM
    return terreno, itens, equip


# ---------------------------------------------------------------- art.mul e gumpart.mul

class ArquivoIndexado:
    """Par .mul + .idx (entradas de 12 bytes: posição, tamanho, extra)."""

    def __init__(self, mul: Path, idx: Path):
        self.mul = mul.read_bytes()
        self.idx = idx.read_bytes()

    def __len__(self) -> int:
        return len(self.idx) // 12

    def entrada(self, i: int) -> tuple[bytes, int] | None:
        if not 0 <= i < len(self):
            return None
        pos, tam, extra = struct.unpack_from("<iii", self.idx, i * 12)
        if pos < 0 or tam <= 0 or pos + tam > len(self.mul):
            return None
        return self.mul[pos:pos + tam], extra


class Arte(ArquivoIndexado):
    def terreno(self, gid: int) -> Imagem | None:
        e = self.entrada(gid)
        if not e or len(e[0]) < 2024:
            return None
        buf = e[0]
        rgba = bytearray(44 * 44 * 4)
        p = 0
        for y in range(44):
            n = 2 * (y + 1) if y < 22 else 2 * (44 - y)
            x0 = 22 - n // 2
            for x in range(n):
                v = struct.unpack_from("<H", buf, p)[0]
                p += 2
                o = (y * 44 + x0 + x) * 4
                rgba[o:o + 3] = bytes(pixel_rgba(v))
                rgba[o + 3] = 255
        return Imagem(44, 44, bytes(rgba))

    def estatico(self, gid: int) -> Imagem | None:
        e = self.entrada(ID_BASE_OBJETO + gid)
        if not e:
            return None
        buf = e[0]
        larg, alt = struct.unpack_from("<HH", buf, 4)
        if not (0 < larg < 1024 and 0 < alt < 1024):
            return None
        rgba = bytearray(larg * alt * 4)
        base = 8 + alt * 2
        linhas = struct.unpack_from(f"<{alt}H", buf, 8)
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
                    if x < larg and p + 2 <= len(buf):
                        v = struct.unpack_from("<H", buf, p)[0]
                        o = (y * larg + x) * 4
                        rgba[o:o + 3] = bytes(pixel_rgba(v))
                        rgba[o + 3] = 255
                    x += 1
                    p += 2
        return Imagem(larg, alt, bytes(rgba))


class Gumps(ArquivoIndexado):
    def gump(self, gid: int) -> Imagem | None:
        e = self.entrada(gid)
        if not e:
            return None
        buf, extra = e
        larg, alt = (extra >> 16) & 0xFFFF, extra & 0xFFFF
        if not (0 < larg < 2048 and 0 < alt < 2048):
            return None
        rgba = bytearray(larg * alt * 4)
        linhas = struct.unpack_from(f"<{alt}I", buf, 0)
        for y in range(alt):
            p = linhas[y] * 4
            x = 0
            while x < larg and p + 4 <= len(buf):
                cor, n = struct.unpack_from("<HH", buf, p)
                p += 4
                if cor:
                    r, g, b = pixel_rgba(cor)
                    for i in range(min(n, larg - x)):
                        o = (y * larg + x + i) * 4
                        rgba[o:o + 4] = bytes((r, g, b, 255))
                x += n
        return Imagem(larg, alt, bytes(rgba))


# ---------------------------------------------------------------- catálogo

def extrair_tipo(tipo: str, pasta_saida: str, obter, infos: list[es.InfoTile],
                 escolhidos: list[tuple[str, int]], pasta_sprites: Path) -> list[dict]:
    import hashlib
    tiles = []
    vistos: set[tuple[str, bytes]] = set()
    for grupo, gid in escolhidos:
        img = obter(gid)
        if img is None or not any(img.rgba[3::4]):
            continue
        assinatura = (grupo, hashlib.sha1(img.rgba + struct.pack("<HH", img.largura, img.altura)).digest())
        if assinatura in vistos:
            continue
        vistos.add(assinatura)
        arquivo = f"{pasta_saida}/0x{gid:04X}.png"
        es.gravar_png(pasta_sprites / arquivo, img)
        info = infos[gid]
        tiles.append({
            "id": gid if tipo == "terreno" else ID_BASE_OBJETO + gid,
            "nome": info.nome or f"{tipo} 0x{gid:04X}",
            "tipo": tipo,
            "altura": 0 if tipo == "terreno" else info.altura,
            "bloqueia": bool(info.flags & es.FLAG_IMPASSAVEL),
            "cor": es.cor_media(img),
            "grupo": grupo,
            "grafico": gid,
            "sprite": {"arquivo": arquivo, "largura": img.largura, "altura": img.altura},
        })
    return tiles


def extrair_gumps(gumps: Gumps, ids: list[int], pasta: Path) -> int:
    gravados = 0
    for gid in ids:
        img = gumps.gump(gid)
        if img is None:
            print(f"  aviso: gump 0x{gid:04X} não existe", file=sys.stderr)
            continue
        es.gravar_png(pasta / f"0x{gid:04X}.png", img)
        gravados += 1
    return gravados


# ---------------------------------------------------------------- efeitos (animdata.mul)

def ler_animdata_mul(caminho: Path) -> dict[int, tuple[int, list[int]]]:
    """Blocos de 4 + 8 × 68 bytes: 64 deslocamentos (i8), 1 byte livre, quadros, intervalo e atraso."""
    d = caminho.read_bytes()
    tabela: dict[int, tuple[int, list[int]]] = {}
    for bloco in range(len(d) // 548):
        for k in range(8):
            r = bloco * 548 + 4 + k * 68
            desloc = struct.unpack_from("<64b", d, r)
            n, intervalo = d[r + 65], d[r + 66]
            if n:
                gid = bloco * 8 + k
                tabela[gid] = (intervalo, [gid + desloc[i] for i in range(min(n, 64))])
    return tabela


def extrair_efeitos(arte: Arte, gumps: Gumps, animdata: dict, selecao: dict, pasta: Path) -> int:
    saida: dict[str, dict] = {}

    def gravar(nome: str, quadros: list[Imagem], intervalo_ms: int, ancora: str) -> None:
        folha, larg, alt = es.montar_folha(quadros)
        es.gravar_png(pasta / f"{nome}.png", folha)
        saida[nome] = {"arquivo": f"{nome}.png", "quadros": len(quadros), "largura": larg, "altura": alt,
                       "intervaloMs": intervalo_ms, "ancora": ancora}

    for texto in selecao.get("efeitos", []):
        gid = int(texto, 0)
        intervalo, ids = animdata.get(gid, (1, [gid]))
        quadros = [img for img in (arte.estatico(i) for i in ids) if img]
        if not quadros:
            print(f"  aviso: efeito 0x{gid:04X} sem arte", file=sys.stderr)
            continue
        gravar(f"0x{gid:04X}", quadros, max(1, intervalo) * 50, "item")

    for nome, ids_texto in selecao.get("efeitosGump", {}).items():
        quadros = [img for img in (gumps.gump(int(t, 0)) for t in ids_texto) if img]
        if quadros:
            gravar(nome, quadros, 50, "gump")

    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "efeitos.json").write_text(json.dumps({"versao": 1, "efeitos": saida}, indent=1), encoding="utf-8")
    return len(saida)


# ---------------------------------------------------------------- animações (anim*.mul)

class Animacoes:
    """Corpo -> arquivo (bodyconv.def) -> grupos de 5 direções com quadros paletizados."""

    def __init__(self, pasta: Path):
        self.arquivos = {n: ArquivoIndexado(pasta / (f"anim{n if n > 1 else ''}.mul"),
                                            pasta / (f"anim{n if n > 1 else ''}.idx")) for n in range(1, 6)
                         if (pasta / (f"anim{n if n > 1 else ''}.mul")).exists()}
        self.conv: dict[int, tuple[int, int]] = {}
        conv = pasta / "Bodyconv.def"
        if conv.exists():
            for linha in conv.read_text(encoding="latin-1").splitlines():
                nums = re.findall(r"-?\d+", linha.split("#")[0])
                if len(nums) >= 2 and linha.strip()[:1].isdigit():
                    for arq, valor in enumerate(nums[1:5], start=2):
                        if int(valor) >= 0:
                            self.conv[int(nums[0])] = (arq, int(valor))
                            break

    @staticmethod
    def base(arq: int, corpo: int) -> int:
        if arq == 3:
            if corpo < 300:
                return corpo * 65
            if corpo < 400:
                return 33000 + (corpo - 300) * 110
        elif corpo < 200:
            return corpo * 110
        elif corpo < 400:
            return 22000 + (corpo - 200) * 65
        return 35000 + (corpo - 400) * 175

    @staticmethod
    def decodificar_direcao(buf: bytes) -> list[Quadro]:
        paleta = struct.unpack_from("<256H", buf, 0)
        n = struct.unpack_from("<I", buf, 512)[0]
        offsets = struct.unpack_from(f"<{n}I", buf, 516)
        quadros: list[Quadro] = []
        for off in offsets:
            p = 512 + off
            cx, cy, larg, alt = struct.unpack_from("<hhHH", buf, p)
            p += 8
            if not (0 < larg < 1024 and 0 < alt < 1024):
                continue
            rgba = bytearray(larg * alt * 4)
            while p + 4 <= len(buf):
                cab = struct.unpack_from("<I", buf, p)[0]
                p += 4
                if cab == 0x7FFF7FFF:
                    break
                cab ^= (0x200 << 22) | (0x200 << 12)
                x = ((cab >> 22) & 0x3FF) - 0x200 + cx
                y = ((cab >> 12) & 0x3FF) - 0x200 + cy + alt
                n_pix = cab & 0xFFF
                for i in range(n_pix):
                    xx = x + i
                    if 0 <= xx < larg and 0 <= y < alt and p + i < len(buf):
                        r, g, b = pixel_rgba(paleta[buf[p + i]])
                        o = (y * larg + xx) * 4
                        rgba[o:o + 4] = bytes((r, g, b, 255))
                p += n_pix
            quadros.append(Quadro(cx, cy, Imagem(larg, alt, bytes(rgba))))
        return quadros

    def acoes(self, corpo: int, desejadas: set[int]) -> dict[int, list[list[Quadro]]]:
        arq, c = self.conv.get(corpo, (1, corpo))
        fonte = self.arquivos.get(arq)
        resultado: dict[int, list[list[Quadro]]] = {}
        if fonte is None:
            return resultado
        base = self.base(arq, c)
        for g in sorted(desejadas):
            direcoes = []
            for d in range(5):
                e = fonte.entrada(base + g * 5 + d)
                direcoes.append(self.decodificar_direcao(e[0]) if e else [])
            if any(direcoes):
                resultado[g] = direcoes
        return resultado


def extrair_animacoes(anim: Animacoes, hues: Path, selecao: dict, pasta: Path) -> int:
    conf = selecao.get("animacoes")
    if not conf:
        return 0
    gerados: dict[str, dict] = {}
    for item in conf["corpos"] + conf.get("equipamentos", []) + conf.get("montarias", []):
        mapa_acoes: dict[str, int] = conf["acoes"][item["tipo"]]
        acoes = anim.acoes(item["anim"], set(mapa_acoes.values()))
        linhas: list[list[Quadro]] = []
        chaves: list[tuple[str, int]] = []
        for nome_acao, acao in mapa_acoes.items():
            for d, quadros in enumerate(acoes.get(acao, [])):
                linhas.append(quadros)
                chaves.append((nome_acao, d))
        if not linhas:
            print(f"  aviso: animação {item['anim']} ({item['nome']}) não existe", file=sys.stderr)
            continue
        atlas, retangulos = es.montar_atlas(linhas)
        es.gravar_png(pasta / f"{item['nome']}.png", atlas)
        meta_acoes: dict[str, list[list[dict]]] = {}
        for (nome_acao, d), rets in zip(chaves, retangulos):
            meta_acoes.setdefault(nome_acao, []).append(rets)
        gerados[item["nome"]] = {
            "anim": item["anim"], "tipo": item["tipo"], "arquivo": f"{item['nome']}.png",
            "rotulo": item.get("rotulo", item["nome"]), "acoes": meta_acoes,
        }
        if "montaria" in item:
            gerados[item["nome"]]["montaria"] = item["montaria"]
    pasta.mkdir(parents=True, exist_ok=True)
    meta = {"versao": 1, "animacoes": gerados, "matizes": es.ler_matizes(hues, conf.get("matizes", []))}
    (pasta / "animacoes.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return len(gerados)


# ---------------------------------------------------------------- interface

def extrair_cursores(arte: Arte, ids: list[int], pasta: Path) -> dict[str, list[int]]:
    pontos: dict[str, list[int]] = {}
    for gid in ids:
        img = arte.estatico(gid)
        if img is None:
            continue
        rgba = bytearray(img.rgba)
        larg, alt = img.largura, img.altura
        verde = lambda o: rgba[o + 1] > 200 and rgba[o] < 60 and rgba[o + 2] < 60  # noqa: E731
        hx = next((x for x in range(larg) if verde(x * 4)), 0)
        hy = next((y for y in range(alt) if verde(y * larg * 4)), 0)
        for x in range(larg):
            for y in (0, alt - 1):
                rgba[(y * larg + x) * 4 + 3] = 0
        for y in range(alt):
            for x in (0, larg - 1):
                rgba[(y * larg + x) * 4 + 3] = 0
        es.gravar_png(pasta / f"0x{gid:04X}.png", Imagem(larg, alt, bytes(rgba)))
        pontos[f"0x{gid:04X}"] = [hx, hy]
    return pontos


def extrair_interface(cliente: Path, arte: Arte, gumps: Gumps, infos: list[es.InfoTile],
                      selecao: dict, pasta: Path) -> int:
    conf = selecao.get("interface")
    if not conf:
        return 0
    meta: dict = {"versao": 1}
    meta["cursores"] = extrair_cursores(arte, [int(c, 0) for c in conf.get("cursores", [])], pasta / "cursores")
    meta["fontes"] = {nome: es.extrair_fonte(cliente / arquivo, pasta / "fontes", nome)
                      for nome, arquivo in conf.get("fontes", {}).items()}
    itens = {}
    for texto in conf.get("itens", []):
        gid = int(texto, 0)
        img = arte.estatico(gid)
        if img:
            img = es.aparar(img)
            es.gravar_png(pasta / "itens" / f"0x{gid:04X}.png", img)
            itens[f"0x{gid:04X}"] = {"nome": infos[gid].nome.replace("%s%", "").replace("%s", ""),
                                     "largura": img.largura, "altura": img.altura}
    meta["itens"] = itens
    meta["equipaveis"] = selecao.get("_equipaveis", {})
    extrair_gumps(gumps, [int(g, 0) for g in conf.get("gumps", [])], pasta / "gumps")
    (pasta / "interface.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return len(meta["cursores"]) + len(meta["fontes"]) + len(itens)


def preparar_equipaveis(equip: list[tuple[int, int]], selecao: dict) -> dict[str, dict]:
    """Mesma lógica do extrair_sprites.py, lendo animação e camada do tiledata.mul."""
    anim_conf = selecao.setdefault("animacoes", {})
    interface = selecao.setdefault("interface", {})
    meta: dict[str, dict] = {}
    for e in selecao.get("equipaveis", []):
        gid = int(e["item"], 0)
        anim, camada = equip[gid]
        anim_conf.setdefault("equipamentos", []).append({"anim": anim, "nome": e["nome"], "tipo": "humano"})
        gump = f"0x{50000 + anim:04X}"
        interface.setdefault("gumps", []).append(gump)
        interface.setdefault("itens", []).append(e["item"])
        meta[f"0x{gid:04X}"] = {"nome": e["nome"], "rotulo": e.get("rotulo", e["nome"]), "camada": camada,
                                "anim": e["nome"], "gump": gump}
    return meta


# ---------------------------------------------------------------- principal

def main() -> int:
    ap = argparse.ArgumentParser(description="Gera catalogo.json e sprites a partir de um cliente UO clássico (.mul).")
    ap.add_argument("--cliente", type=Path, help="pasta com tiledata.mul, art.mul etc. (padrão: procura em cliente/)")
    ap.add_argument("--selecao", type=Path, default=Path(__file__).with_name("selecao.json"))
    ap.add_argument("--saida", type=Path, default=RAIZ_PROJETO / "public", help="pasta public/ do projeto")
    args = ap.parse_args()

    cliente = args.cliente or localizar_cliente(RAIZ_PROJETO)
    if cliente is None or not (cliente / "tiledata.mul").exists():
        sys.exit("tiledata.mul não encontrado: informe a pasta do cliente com --cliente")

    selecao = json.loads(args.selecao.read_text(encoding="utf-8"))
    faixa_padrao = es.ler_faixa(selecao["faixaPadrao"])
    pasta_sprites = args.saida / "sprites"

    print("Lendo tiledata e arte...")
    infos_terreno, infos_objeto, equip = ler_tiledata_mul(cliente / "tiledata.mul")
    selecao["_equipaveis"] = preparar_equipaveis(equip, selecao)
    arte = Arte(cliente / "art.mul", cliente / "artidx.mul")
    gumps = Gumps(cliente / "Gumpart.mul", cliente / "Gumpidx.mul")
    existe_terreno = {i: 1 for i in range(0x4000) if arte.entrada(i)}
    existe_objeto = {i: 1 for i in range(0x4000) if arte.entrada(ID_BASE_OBJETO + i)}

    print("Selecionando e gravando sprites...")
    tiles = extrair_tipo("terreno", "terreno", arte.terreno, infos_terreno,
                         es.selecionar(infos_terreno, selecao["terreno"], faixa_padrao, existe_terreno), pasta_sprites)
    tiles += extrair_tipo("objeto", "objetos", arte.estatico, infos_objeto,
                          es.selecionar(infos_objeto, selecao["objetos"], faixa_padrao, existe_objeto), pasta_sprites)

    destino = args.saida / "catalogo" / "catalogo.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    linhas = ",\n    ".join(json.dumps(t, ensure_ascii=False) for t in tiles)
    origem = f"mul:{cliente.parent.name}"
    destino.write_text('{"versao": 1, "origem": ' + json.dumps(origem, ensure_ascii=False) +
                       ', "tiles": [\n    ' + linhas + "\n]}\n", encoding="utf-8")

    print("Gravando icones e sons...")
    n_gumps = extrair_gumps(gumps, [int(g, 0) for g in selecao.get("gumps", [])], args.saida / "gumps")
    n_sons = es.extrair_sons(cliente, [int(s, 0) for s in selecao.get("sons", [])], args.saida / "sons")
    print("Gravando efeitos de magia...")
    n_efeitos = extrair_efeitos(arte, gumps, ler_animdata_mul(cliente / "animdata.mul"), selecao, args.saida / "efeitos")
    print("Gravando animacoes de personagens e criaturas (pode levar alguns minutos)...")
    n_anim = extrair_animacoes(Animacoes(cliente), cliente / "hues.mul", selecao, args.saida / "animacoes")
    print("Gravando interface (cursores, fontes, gumps e itens)...")
    n_interface = extrair_interface(cliente, arte, gumps, infos_objeto, selecao, args.saida / "interface")

    n_terreno = sum(1 for t in tiles if t["tipo"] == "terreno")
    print(f"Pronto: {n_terreno} terrenos e {len(tiles) - n_terreno} objetos em {destino}")
    print(f"        {n_gumps} gumps, {n_sons} sons, {n_efeitos} efeitos, {n_anim} animacoes, {n_interface} itens de interface")
    return 0


if __name__ == "__main__":
    sys.exit(main())
