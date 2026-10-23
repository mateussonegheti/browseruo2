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


def ler_animdata(caminho: Path) -> dict[int, tuple[int, list[int]]]:
    """animdata.def do Outlands (texto): id, atraso inicial, intervalo, ids dos quadros."""
    tabela: dict[int, tuple[int, list[int]]] = {}
    for linha in caminho.read_text(encoding="latin-1").splitlines():
        partes = linha.split()
        if len(partes) >= 4 and partes[0].isdigit():
            tabela[int(partes[0])] = (int(partes[2]), [int(p) for p in partes[3:]])
    return tabela


def montar_folha(quadros: list[Imagem]) -> tuple[Imagem, int, int]:
    """Junta os quadros lado a lado em células do mesmo tamanho, alinhados pelo centro da base."""
    larg = max(q.largura for q in quadros)
    alt = max(q.altura for q in quadros)
    rgba = bytearray(larg * len(quadros) * alt * 4)
    linha_folha = larg * len(quadros) * 4
    for i, q in enumerate(quadros):
        ox = i * larg + (larg - q.largura) // 2
        oy = alt - q.altura
        for y in range(q.altura):
            ini = (oy + y) * linha_folha + ox * 4
            rgba[ini:ini + q.largura * 4] = q.rgba[y * q.largura * 4:(y + 1) * q.largura * 4]
    return Imagem(larg * len(quadros), alt, bytes(rgba)), larg, alt


def extrair_efeitos(pasta_cliente: Path, selecao: dict, pasta: Path) -> int:
    """Efeitos de magia: itens animados (art.uoo + animdata.def) e sequências de gumps (raio)."""
    animdata = ler_animdata(pasta_cliente / "animdata.def")
    arte = ler_arquivo_uoo(pasta_cliente / "art.uoo")
    indice_arte = indexar_entradas(arte)
    gumps = ler_arquivo_uoo(pasta_cliente / "gumps.uoo")
    indice_gumps = indexar_entradas(gumps)
    saida: dict[str, dict] = {}

    def gravar(nome: str, quadros: list[Imagem], intervalo_ms: int, ancora: str) -> None:
        folha, larg, alt = montar_folha(quadros)
        gravar_png(pasta / f"{nome}.png", folha)
        saida[nome] = {"arquivo": f"{nome}.png", "quadros": len(quadros), "largura": larg, "altura": alt,
                       "intervaloMs": intervalo_ms, "ancora": ancora}

    for texto in selecao.get("efeitos", []):
        gid = int(texto, 0)
        intervalo, ids = animdata.get(gid, (1, [gid]))  # sem animdata: imagem parada (ex.: Energy Bolt)
        quadros = [decodificar_imagem(arte, indice_arte[i]) for i in ids if i in indice_arte]
        if not quadros:
            print(f"  aviso: efeito 0x{gid:04X} sem arte", file=sys.stderr)
            continue
        # O cliente usa 50 ms por unidade de intervalo do animdata
        gravar(f"0x{gid:04X}", quadros, max(1, intervalo) * 50, "item")

    for nome, ids_texto in selecao.get("efeitosGump", {}).items():
        quadros = [decodificar_imagem(gumps, indice_gumps[int(t, 0)]) for t in ids_texto if int(t, 0) in indice_gumps]
        if quadros:
            gravar(nome, quadros, 50, "gump")

    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "efeitos.json").write_text(json.dumps({"versao": 1, "efeitos": saida}, indent=1), encoding="utf-8")
    return len(saida)


# ---------------------------------------------------------------- animações (anim.uoo)
#
# Formato deduzido: cada entrada (id = corpo ou animação de roupa) contém
#   nAções u32, reservado u32, e para cada ação: id u32, nDireções u32,
#   e para cada direção: id u32, nQuadros u32, tamanho comprimido u32 + deflate puro.
# Descomprimido, cada quadro é: centroX i16, centroY i16, largura u16, altura u16,
#   largura*altura pixels ARGB1555 (0 = transparente) e 4 bytes de preenchimento.
# Como no UO clássico, só 5 direções são guardadas; as outras 3 são espelhadas no cliente.

@dataclass
class Quadro:
    cx: int
    cy: int
    img: Imagem


def indexar_anim(caminho: Path) -> dict[int, tuple[int, int]]:
    """Mapeia id -> (posição, tamanho) sem carregar o arquivo inteiro (ele tem mais de 1,5 GB)."""
    indice: dict[int, tuple[int, int]] = {}
    with open(caminho, "rb") as arq:
        arq.seek(0, 2)
        tamanho_arquivo = arq.tell()
        pos = 8
        while pos + 8 <= tamanho_arquivo:
            arq.seek(pos)
            ident, tamanho = struct.unpack("<II", arq.read(8))
            if pos + 8 + tamanho > tamanho_arquivo:
                break
            if tamanho:
                indice[ident] = (pos + 8, tamanho)
            pos += 8 + tamanho
    return indice


def ler_acoes_anim(arq, pos: int, tamanho: int, acoes_desejadas: set[int]) -> dict[int, list[list[Quadro]]]:
    """Lê as ações pedidas de uma entrada: ação -> [direção 0..4] -> quadros."""
    arq.seek(pos)
    dados = arq.read(tamanho)
    n_acoes = struct.unpack_from("<I", dados, 0)[0]
    p = 8
    resultado: dict[int, list[list[Quadro]]] = {}
    for _ in range(n_acoes):
        acao, n_dirs = struct.unpack_from("<II", dados, p)
        p += 8
        direcoes: list[list[Quadro]] = []
        for _ in range(n_dirs):
            _, n_quadros, comprimido = struct.unpack_from("<III", dados, p)
            if acao in acoes_desejadas:
                bruto = zlib.decompress(dados[p + 12:p + 12 + comprimido], -15)
                quadros: list[Quadro] = []
                q = 0
                for _ in range(n_quadros):
                    cx, cy, larg, alt = struct.unpack_from("<hhHH", bruto, q)
                    pixels = struct.unpack_from(f"<{larg * alt}H", bruto, q + 8)
                    rgba = bytearray(larg * alt * 4)
                    for i, px in enumerate(pixels):
                        if px & 0x7FFF:
                            o = i * 4
                            rgba[o] = ((px >> 10) & 31) * 255 // 31
                            rgba[o + 1] = ((px >> 5) & 31) * 255 // 31
                            rgba[o + 2] = (px & 31) * 255 // 31
                            rgba[o + 3] = 255
                    quadros.append(Quadro(cx, cy, Imagem(larg, alt, bytes(rgba))))
                    q += 8 + larg * alt * 2 + 4
                direcoes.append(quadros)
            p += 12 + comprimido
        if acao in acoes_desejadas:
            resultado[acao] = direcoes
    return resultado


def montar_atlas(linhas: list[list[Quadro]]) -> tuple[Imagem, list[list[dict]]]:
    """Empilha as linhas (uma por ação/direção) num atlas; devolve os retângulos de cada quadro."""
    largura = max((sum(q.img.largura for q in linha) for linha in linhas), default=1) or 1
    alturas = [max((q.img.altura for q in linha), default=0) for linha in linhas]
    altura = sum(alturas) or 1
    rgba = bytearray(largura * altura * 4)
    retangulos: list[list[dict]] = []
    y0 = 0
    for linha, alt_linha in zip(linhas, alturas):
        x0 = 0
        rets = []
        for q in linha:
            for y in range(q.img.altura):
                ini = ((y0 + y) * largura + x0) * 4
                rgba[ini:ini + q.img.largura * 4] = q.img.rgba[y * q.img.largura * 4:(y + 1) * q.img.largura * 4]
            rets.append({"x": x0, "y": y0, "w": q.img.largura, "h": q.img.altura, "cx": q.cx, "cy": q.cy})
            x0 += q.img.largura
        retangulos.append(rets)
        y0 += alt_linha
    return Imagem(largura, altura, bytes(rgba)), retangulos


def ler_matizes(caminho: Path, ids: list[int]) -> dict[str, list[str]]:
    """hues.mul: blocos de 4 + 8 × 88 bytes; cada matiz tem 32 cores ARGB1555 (índice = tom de cinza)."""
    dados = caminho.read_bytes()
    saida: dict[str, list[str]] = {}
    for h in ids:
        i = (h & 0x7FFF) - 1
        pos = (i // 8) * 708 + 4 + (i % 8) * 88
        cores = struct.unpack_from("<32H", dados, pos)
        saida[str(h)] = ["#%02x%02x%02x" % (((c >> 10) & 31) * 255 // 31, ((c >> 5) & 31) * 255 // 31,
                                            (c & 31) * 255 // 31) for c in cores]
    return saida


def extrair_animacoes(pasta_cliente: Path, selecao: dict, pasta: Path) -> int:
    conf = selecao.get("animacoes")
    if not conf:
        return 0
    indice = indexar_anim(pasta_cliente / "anim.uoo")
    gerados: dict[str, dict] = {}
    with open(pasta_cliente / "anim.uoo", "rb") as arq:
        for item in conf["corpos"] + conf.get("equipamentos", []) + conf.get("montarias", []):
            anim = item["anim"]
            if anim not in indice:
                print(f"  aviso: animação {anim} não existe", file=sys.stderr)
                continue
            mapa_acoes: dict[str, int] = conf["acoes"][item["tipo"]]
            acoes = ler_acoes_anim(arq, *indice[anim], set(mapa_acoes.values()))
            linhas: list[list[Quadro]] = []
            chaves: list[tuple[str, int]] = []
            for nome_acao, acao in mapa_acoes.items():
                for d, quadros in enumerate(acoes.get(acao, [])):
                    linhas.append(quadros)
                    chaves.append((nome_acao, d))
            if not linhas:
                continue
            atlas, retangulos = montar_atlas(linhas)
            gravar_png(pasta / f"{item['nome']}.png", atlas)
            meta_acoes: dict[str, list[list[dict]]] = {}
            for (nome_acao, d), rets in zip(chaves, retangulos):
                meta_acoes.setdefault(nome_acao, []).append(rets)
            gerados[item["nome"]] = {
                "anim": anim, "tipo": item["tipo"], "arquivo": f"{item['nome']}.png",
                "rotulo": item.get("rotulo", item["nome"]), "acoes": meta_acoes,
            }
            if "montaria" in item:
                gerados[item["nome"]]["montaria"] = item["montaria"]
    pasta.mkdir(parents=True, exist_ok=True)
    meta = {"versao": 1, "animacoes": gerados, "matizes": ler_matizes(pasta_cliente / "hues.mul", conf.get("matizes", []))}
    (pasta / "animacoes.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return len(gerados)


# ---------------------------------------------------------------- interface (cursores, fontes, itens)

def extrair_cursores(arte: bytes, indice: dict[int, int], ids: list[int], pasta: Path) -> dict[str, list[int]]:
    """Cursores do art: a borda azul marca a área e um pixel verde na 1ª coluna/linha marca o ponto ativo."""
    pontos: dict[str, list[int]] = {}
    for gid in ids:
        if gid not in indice:
            continue
        img = decodificar_imagem(arte, indice[gid])
        rgba = bytearray(img.rgba)
        larg, alt = img.largura, img.altura
        verde = lambda o: rgba[o + 1] > 200 and rgba[o] < 60 and rgba[o + 2] < 60  # noqa: E731
        hx = next((x for x in range(larg) if verde(x * 4)), 0)
        hy = next((y for y in range(alt) if verde(y * larg * 4)), 0)
        # Apaga a moldura (1ª e última linha/coluna), que não faz parte do desenho
        for x in range(larg):
            for y in (0, alt - 1):
                rgba[(y * larg + x) * 4 + 3] = 0
        for y in range(alt):
            for x in (0, larg - 1):
                rgba[(y * larg + x) * 4 + 3] = 0
        gravar_png(pasta / f"0x{gid:04X}.png", Imagem(larg, alt, bytes(rgba)))
        pontos[f"0x{gid:04X}"] = [hx, hy]
    return pontos


def extrair_fonte(caminho: Path, pasta: Path, nome: str) -> dict:
    """unifont*.mul: 0x10000 deslocamentos; glifo = dx, dy (i8), largura, altura (u8) e 1 bit por pixel."""
    dados = caminho.read_bytes()
    caracteres = [c for c in range(32, 256) if c != 127]
    glifos = []
    for c in caracteres:
        pos = struct.unpack_from("<I", dados, c * 4)[0]
        if pos == 0 or pos + 4 > len(dados):
            glifos.append((c, 0, 0, 0, 0, b""))
            continue
        dx, dy, larg, alt = struct.unpack_from("<bbBB", dados, pos)
        glifos.append((c, dx, dy, larg, alt, dados[pos + 4:pos + 4 + ((larg + 7) // 8) * alt]))
    larg_total = sum(g[3] + 1 for g in glifos)
    topo = min((g[2] for g in glifos if g[4]), default=0)  # dy pode ser negativo
    alt_total = max(g[2] - topo + g[4] for g in glifos)
    rgba = bytearray(larg_total * alt_total * 4)
    meta: dict[str, list[int]] = {}
    x0 = 0
    for c, dx, dy, larg, alt, bits in glifos:
        por_linha = (larg + 7) // 8
        for y in range(alt):
            for x in range(larg):
                if bits[y * por_linha + x // 8] >> (7 - x % 8) & 1:
                    o = ((dy - topo + y) * larg_total + x0 + x) * 4
                    rgba[o:o + 4] = b"\xff\xff\xff\xff"
        # [x no atlas, largura, deslocamento x]; o y já está embutido (glifos alinhados pelo topo da linha)
        meta[str(c)] = [x0, larg, dx]
        x0 += larg + 1
    gravar_png(pasta / f"{nome}.png", Imagem(larg_total, alt_total, bytes(rgba)))
    espaco = meta.get("32", [0, 0, 0])
    if espaco[1] == 0:
        meta["32"] = [0, 0, 0]
    return {"arquivo": f"{nome}.png", "altura": alt_total, "glifos": meta}


def aparar(img: Imagem) -> Imagem:
    """Corta as margens transparentes (a arte dos itens tem 44 px de largura com muita sobra)."""
    opacos = [(i % img.largura, i // img.largura) for i in range(img.largura * img.altura) if img.rgba[i * 4 + 3]]
    if not opacos:
        return img
    x0 = min(x for x, _ in opacos)
    x1 = max(x for x, _ in opacos)
    y0 = min(y for _, y in opacos)
    y1 = max(y for _, y in opacos)
    larg, alt = x1 - x0 + 1, y1 - y0 + 1
    rgba = b"".join(img.rgba[((y0 + y) * img.largura + x0) * 4:((y0 + y) * img.largura + x1 + 1) * 4] for y in range(alt))
    return Imagem(larg, alt, rgba)


def extrair_interface(pasta_cliente: Path, selecao: dict, pasta: Path) -> int:
    conf = selecao.get("interface")
    if not conf:
        return 0
    arte = ler_arquivo_uoo(pasta_cliente / "art.uoo")
    indice = indexar_entradas(arte)
    infos = ler_tiledata(pasta_cliente / "artdata.uoo", TAM_REGISTRO_OBJETO, pos_nome=36, pos_altura=32)
    meta: dict = {"versao": 1}
    meta["cursores"] = extrair_cursores(arte, indice, [int(c, 0) for c in conf.get("cursores", [])], pasta / "cursores")
    meta["fontes"] = {nome: extrair_fonte(pasta_cliente / arquivo, pasta / "fontes", nome)
                      for nome, arquivo in conf.get("fontes", {}).items()}
    itens = {}
    for texto in conf.get("itens", []):
        gid = int(texto, 0)
        if gid in indice:
            img = aparar(decodificar_imagem(arte, indice[gid]))
            gravar_png(pasta / "itens" / f"0x{gid:04X}.png", img)
            itens[f"0x{gid:04X}"] = {"nome": infos[gid].nome.replace("%s%", "").replace("%s", ""),
                                     "largura": img.largura, "altura": img.altura}
    meta["itens"] = itens
    meta["equipaveis"] = selecao.get("_equipaveis", {})
    extrair_gumps(pasta_cliente / "gumps.uoo", [int(g, 0) for g in conf.get("gumps", [])], pasta / "gumps")
    (pasta / "interface.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return len(meta["cursores"]) + len(meta["fontes"]) + len(itens)


# ---------------------------------------------------------------- equipáveis (armas, armaduras, escudos)

def preparar_equipaveis(pasta_cliente: Path, selecao: dict) -> dict[str, dict]:
    """
    Para cada item equipável, lê no tiledata a animação (u32 no byte 16) e a camada (byte 9) e acrescenta
    à seleção: a animação (como roupa humana), o gump do paperdoll (anim + 50000) e o ícone do item.
    """
    lista = selecao.get("equipaveis", [])
    if not lista:
        return {}
    dados = ler_arquivo_uoo(pasta_cliente / "artdata.uoo")
    anim_conf = selecao.setdefault("animacoes", {})
    interface = selecao.setdefault("interface", {})
    meta: dict[str, dict] = {}
    for e in lista:
        gid = int(e["item"], 0)
        reg = 12 + gid * TAM_REGISTRO_OBJETO
        anim = struct.unpack_from("<I", dados, reg + 16)[0]
        camada = dados[reg + 9]
        anim_conf.setdefault("equipamentos", []).append({"anim": anim, "nome": e["nome"], "tipo": "humano"})
        gump = f"0x{50000 + anim:04X}"
        interface.setdefault("gumps", []).append(gump)
        interface.setdefault("itens", []).append(e["item"])
        meta[f"0x{gid:04X}"] = {"nome": e["nome"], "rotulo": e.get("rotulo", e["nome"]), "camada": camada,
                                "anim": e["nome"], "gump": gump}
    return meta


# ---------------------------------------------------------------- principal

def main() -> int:
    ap = argparse.ArgumentParser(description="Gera catalogo.json e sprites a partir do cliente do UO Outlands.")
    ap.add_argument("--cliente", type=Path, default=PASTA_CLIENTE_PADRAO, help="pasta de instalação do cliente")
    ap.add_argument("--selecao", type=Path, default=Path(__file__).with_name("selecao.json"))
    ap.add_argument("--saida", type=Path, default=RAIZ_PROJETO / "public", help="pasta public/ do projeto")
    args = ap.parse_args()

    selecao = json.loads(args.selecao.read_text(encoding="utf-8"))
    selecao["_equipaveis"] = preparar_equipaveis(args.cliente, selecao)
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
    print("Gravando efeitos de magia...")
    n_efeitos = extrair_efeitos(args.cliente, selecao, args.saida / "efeitos")
    print("Gravando animacoes de personagens e criaturas (pode levar alguns minutos)...")
    n_anim = extrair_animacoes(args.cliente, selecao, args.saida / "animacoes")
    print("Gravando interface (cursores, fontes, gumps e itens)...")
    n_interface = extrair_interface(args.cliente, selecao, args.saida / "interface")

    n_terreno = sum(1 for t in tiles if t["tipo"] == "terreno")
    print(f"Pronto: {n_terreno} terrenos e {len(tiles) - n_terreno} objetos em {destino}")
    print(f"        {n_gumps} gumps em public/gumps e {n_sons} sons em public/sons")
    print(f"        {n_efeitos} efeitos em public/efeitos e {n_anim} animacoes em public/animacoes")
    print(f"        {n_interface} cursores/fontes/itens em public/interface")
    return 0


if __name__ == "__main__":
    sys.exit(main())
