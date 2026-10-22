import type { Arena } from './mapa';
import type { CatalogoTiles } from './catalogo';

/**
 * Um tile é bloqueado se estiver fora do mapa, se o terreno bloquear
 * (ex.: água) ou se houver qualquer objeto com a flag "bloqueia".
 * Observação: nesta versão a altura (Z) não é considerada; todo o piso é plano.
 */
export function tileBloqueado(arena: Arena, cat: CatalogoTiles, x: number, y: number): boolean {
  if (!arena.dentro(x, y)) return true;
  const terreno = arena.terrenoEm(x, y);
  if (terreno !== undefined && cat.bloqueia(terreno)) return true;
  return arena.objetosEm(x, y).some((o) => cat.bloqueia(o.id));
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
