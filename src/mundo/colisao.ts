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
  return arena.objetosEm(x, y).some((o) => o.z < Z_ANDAR_SUPERIOR && cat.bloqueia(o.id));
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
