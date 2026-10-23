#!/usr/bin/env python3
"""Extrai ItemID -> nome de classe dos scripts C# de ServUO / RunUO / ModernUO.

Uso:
  git clone --depth 1 https://github.com/ServUO/ServUO
  python tools/extrator/extrair_nomes_servidor.py ServUO [outro-repo ...] -o nomes.json

Esses repositórios NÃO contêm sprites (a arte vem do cliente); servem só para nomear itens.
"""
import argparse
import json
import re
from pathlib import Path

CLASSE = re.compile(r"\bclass\s+(\w+)\s*(?::\s*[\w.<>, ]+)?\s*\{?")
BASE = re.compile(r":\s*base\(\s*(0x[0-9A-Fa-f]+|\d+)\s*\)")


def humanizar(nome):
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", nome)


def varrer(raiz, saida):
    for arq in Path(raiz).rglob("*.cs"):
        try:
            txt = arq.read_text(encoding="utf-8-sig", errors="ignore")
        except OSError:
            continue
        for m in CLASSE.finditer(txt):
            b = BASE.search(txt, m.end(), m.end() + 2500)
            if not b:
                continue
            prox = CLASSE.search(txt, m.end())
            if prox and prox.start() < b.start():
                continue
            saida.setdefault(str(int(b.group(1), 0)), humanizar(m.group(1)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("repos", nargs="+", type=Path)
    ap.add_argument("-o", "--saida", type=Path, default=Path("nomes.json"))
    a = ap.parse_args()
    nomes = {}
    for r in a.repos:
        varrer(r, nomes)
    a.saida.write_text(json.dumps(nomes, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(nomes)} ItemIDs nomeados -> {a.saida}")


if __name__ == "__main__":
    main()
