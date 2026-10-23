import type { Arena } from './mapa';
import { Z_ANDAR_SUPERIOR, type CatalogoTiles } from './catalogo';

/**
 * Um tile é bloqueado se estiver fora do mapa, se o terreno bloquear
 * (ex.: água) ou se houver qualquer objeto com a flag "bloqueia".
 * Observação: nesta versão a altura (Z) não é considerada; todo o piso é plano.
 */
export function tileBloqueado(arena: Arena, cat: CatalogoTiles, x: number, y: number): boolean {
  if (!arena.dentro(x, y)) return true;
  const terreno = arena.terrenoEm(x, y);
  if (terreno !== undefined && cat.bloqueia(terreno)) return true;
  const chao = alturaDoChao(arena, cat, x, y);
  // A fundação abaixo do piso da casa (vão da porta) não impede de passar
  return arena.objetosEm(x, y).some((o) => o.z < Z_ANDAR_SUPERIOR && cat.bloqueia(o.id) &&
    (chao === 0 || o.z + (cat.obter(o.id)?.altura ?? 0) > chao));
}

/**
 * Regra de passo: o destino precisa estar livre e, em diagonal, o personagem
 * não pode "cortar quina" quando os dois tiles laterais estiverem bloqueados.
 */
export function podeAndar(arena: Arena, cat: CatalogoTiles, x: number, y: number, dx: number, dy: number): boolean {
  if (tileBloqueado(arena, cat, x + dx, y + dy)) return false;
  if (dx !== 0 && dy !== 0) {
    if (tileBloqueado(arena, cat, x + dx, y) && tileBloqueado(arena, cat, x, y + dy)) return false;
  }
  return true;
}

/**
 * Linha de visão entre dois tiles: percorre a reta (Bresenham) e falha se algum tile
 * intermediário tiver objeto que bloqueia. O terreno (ex.: água) não bloqueia a visão.
 */
export function temLinhaDeVisao(
  arena: Arena, cat: CatalogoTiles, a: { x: number; y: number }, b: { x: number; y: number },
): boolean {
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let erro = dx + dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * erro;
    if (e2 >= dy) { erro += dy; x += sx; }
    if (e2 <= dx) { erro += dx; y += sy; }
    if (x === b.x && y === b.y) break;
    if (arena.objetosEm(x, y).some((o) => o.z < Z_ANDAR_SUPERIOR && cat.bloqueia(o.id))) return false;
  }
  return true;
}

/** Ordem de desenho: por tile e altura; no mesmo tile e z, o piso (plano) vem antes de paredes e objetos. */
export function chaveOrdem(x: number, y: number, z: number, def: { altura: number; bloqueia: boolean } | undefined): number {
  const plano = def !== undefined && def.altura === 0 && !def.bloqueia;
  return (x + y) * 10000 + Math.max(0, z) * 10 + (plano ? 0 : 1);
}

const GRUPOS_SUPERFICIE = new Set(['Casas', 'Escadas']);

/** Altura (z) em que se pisa no tile: piso de casa ou topo de escada; 0 no chão. */
export function alturaDoChao(arena: Arena, cat: CatalogoTiles, x: number, y: number): number {
  let z = 0;
  for (const o of arena.objetosEm(x, y)) {
    const def = cat.obter(o.id);
    if (!def || def.bloqueia || o.z >= Z_ANDAR_SUPERIOR || !def.grupo || !GRUPOS_SUPERFICIE.has(def.grupo)) continue;
    z = Math.max(z, o.z + def.altura);
  }
  return z;
}

/** z suavizado durante o passo (sobe a escada aos poucos). */
export function alturaVisual(
  arena: Arena, cat: CatalogoTiles,
  mov: { x: number; y: number; movimento: { deX: number; deY: number; paraX: number; paraY: number; inicio: number; duracao: number } | null },
  agora: number,
): number {
  const m = mov.movimento;
  if (!m) return alturaDoChao(arena, cat, mov.x, mov.y);
  const t = Math.min(1, Math.max(0, (agora - m.inicio) / m.duracao));
  const a = alturaDoChao(arena, cat, m.deX, m.deY);
  return a + (alturaDoChao(arena, cat, m.paraX, m.paraY) - a) * t;
}
