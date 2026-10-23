// Ferramenta "Muro": escolhe a peça certa (reta, quina ou poste) a partir dos muros vizinhos.
import type { Arena } from '../mundo/mapa';
import type { CatalogoTiles } from '../mundo/catalogo';

/** Id de objeto no catálogo = 0x4000 + gráfico do art. */
const OBJ = 0x4000;

/**
 * Conjunto de peças de um muro do UO. No art elas vêm em sequência:
 * base + 0 = quina dupla, +1 e +2 = trechos nos eixos Y e X (a ordem muda por material), +3 = poste.
 */
export interface ConjuntoMuro {
  nome: string;
  quina: number;
  y: number;
  x: number;
  poste: number;
}

/**
 * [material, primeira peça, se +1 é o trecho X em vez do Y] — conferido visualmente no jogo.
 * O arenito (0x158) não segue o padrão e fica de fora; dá para colocá-lo à mão pela paleta.
 */
const BASES: Array<[string, number, boolean]> = [['Pedra', 0x1a, false], ['Mármore', 0xf8, true], ['Madeira', 0x6, true]];

/** Conjuntos disponíveis no catálogo (peça que falta usa a quina no lugar). */
export function conjuntosMuro(cat: CatalogoTiles): ConjuntoMuro[] {
  return BASES.flatMap(([nome, base, trocado]) => {
    const [quina, a, b, poste] = [0, 1, 2, 3].map((k) => OBJ + base + k) as [number, number, number, number];
    const [y, x] = trocado ? [b, a] : [a, b];
    if (!cat.obter(quina) || !cat.obter(y) || !cat.obter(x)) return [];
    return [{ nome, quina, y, x, poste: cat.obter(poste) ? poste : quina }];
  });
}

export type Vizinhos = { oeste: boolean; leste: boolean; norte: boolean; sul: boolean };

/**
 * Peça para um tile de muro. Os trechos X ficam na borda norte do tile e os Y na borda oeste, então:
 * quina vinda de oeste e de norte = quina dupla; quina indo para leste e sul = poste;
 * linha no eixo X = trecho X; coluna no eixo Y = trecho Y; muro isolado = poste.
 */
export function escolherPeca(v: Vizinhos, c: ConjuntoMuro): number {
  const horizontal = v.oeste || v.leste;
  const vertical = v.norte || v.sul;
  if (v.oeste && v.norte) return c.quina;
  if (horizontal && vertical) {
    if (v.leste && v.sul) return c.poste;
    return v.oeste ? c.x : c.y;
  }
  if (horizontal) return c.x;
  if (vertical) return c.y;
  return c.poste;
}

function pecaDoConjunto(arena: Arena, c: ConjuntoMuro, x: number, y: number, z: number): boolean {
  const ids = [c.quina, c.x, c.y, c.poste];
  return arena.objetosEm(x, y).some((o) => o.z === z && ids.includes(o.id));
}

/** Refaz a peça do tile (x, y) e dos 4 vizinhos, se forem muros do conjunto. */
export function reajustarMuros(arena: Arena, c: ConjuntoMuro, x: number, y: number, z: number): void {
  for (const [tx, ty] of [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
    if (!pecaDoConjunto(arena, c, tx, ty, z)) continue;
    const peca = escolherPeca({
      oeste: pecaDoConjunto(arena, c, tx - 1, ty, z),
      leste: pecaDoConjunto(arena, c, tx + 1, ty, z),
      norte: pecaDoConjunto(arena, c, tx, ty - 1, z),
      sul: pecaDoConjunto(arena, c, tx, ty + 1, z),
    }, c);
    arena.adicionarObjeto(tx, ty, z, peca); // mesmo (x, y, z): substitui a peça anterior
  }
}
