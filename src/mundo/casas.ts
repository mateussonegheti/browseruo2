// Casas e estruturas pré-moldadas (multi.mul do cliente), construídas pelo deed.
import type { Arena } from './mapa';
import type { CatalogoTiles } from './catalogo';
import type { ObjetoMapa } from './tipos';

export interface CasaDef {
  id: string;
  nome: string;
  largura: number;
  profundidade: number;
  /** [id do tile no catálogo, x, y, z] relativos à origem da estrutura. */
  tiles: Array<[number, number, number, number]>;
}

export async function carregarCasas(url: string): Promise<CasaDef[]> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    return ((await resp.json()) as { casas?: CasaDef[] }).casas ?? [];
  } catch {
    return [];
  }
}

/** Tiles do chão que a estrutura ocupa quando a origem fica em (ox, oy). */
export function pegadaDaCasa(casa: CasaDef, ox: number, oy: number): Array<{ x: number; y: number }> {
  const vistos = new Set<string>();
  const pegada: Array<{ x: number; y: number }> = [];
  for (const [, x, y] of casa.tiles) {
    const chave = `${x},${y}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    pegada.push({ x: ox + x, y: oy + y });
  }
  return pegada;
}

/** Motivo pelo qual não dá para construir aí (o terreno precisa estar livre), ou null se der. */
export function motivoNaoConstruir(
  arena: Arena, cat: CatalogoTiles, casa: CasaDef, ox: number, oy: number,
  ocupado: (x: number, y: number) => boolean,
): string | null {
  for (const { x, y } of pegadaDaCasa(casa, ox, oy)) {
    if (!arena.dentro(x, y)) return 'A casa não cabe aí: passa da borda da arena.';
    const terreno = arena.terrenoEm(x, y);
    if (terreno !== undefined && cat.bloqueia(terreno)) return 'Não dá para construir sobre esse terreno.';
    if (arena.objetosEm(x, y).length > 0) return 'Precisa de espaço livre: há objetos no terreno da casa.';
    if (ocupado(x, y)) return 'Há alguém no terreno da casa.';
    if (x === arena.spawn.x && y === arena.spawn.y) return 'Não dá para construir sobre o ponto de nascimento.';
  }
  return null;
}

export function construirCasa(arena: Arena, casa: CasaDef, ox: number, oy: number): void {
  arena.adicionarVarios(casa.tiles.map(([id, x, y, z]) => ({ id, x: ox + x, y: oy + y, z })));
}

/**
 * Objetos de telhado e andar de cima que cobrem o tile (x, y) e os que se ligam a eles:
 * escondê-los deixa ver o interior da casa quando o jogador está dentro.
 */
export function tetosSobre(arena: Arena, cat: CatalogoTiles, x: number, y: number): Set<ObjetoMapa> {
  const ocultos = new Set<ObjetoMapa>();
  if (!arena.objetosEm(x, y).some((o) => cat.ehTeto(o))) return ocultos;
  const visitados = new Set<number>([y * arena.largura + x]);
  const fila: Array<[number, number]> = [[x, y]];
  while (fila.length) {
    const [cx, cy] = fila.pop()!;
    for (const o of arena.objetosEm(cx, cy)) if (cat.ehTeto(o)) ocultos.add(o);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        const chave = ny * arena.largura + nx;
        if (!arena.dentro(nx, ny) || visitados.has(chave)) continue;
        visitados.add(chave);
        if (arena.objetosEm(nx, ny).some((o) => cat.ehTeto(o))) fila.push([nx, ny]);
      }
    }
  }
  return ocultos;
}
