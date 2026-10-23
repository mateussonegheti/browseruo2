// Portas: um objeto que troca de tile (e de sprite) ao abrir/fechar, como no UO.
import type { Arena } from './mapa';
import type { CatalogoTiles } from './catalogo';
import type { Lado, ObjetoMapa } from './tipos';

/** Porta (aberta ou fechada) que está no tile, se houver. */
export function portaEm(arena: Arena, cat: CatalogoTiles, x: number, y: number): ObjetoMapa | undefined {
  return arena.objetosEm(x, y).find((o) => cat.obter(o.id)?.porta);
}

/** Só o lado dono controla a porta; sem dono, qualquer um. */
export function podeUsarPorta(porta: ObjetoMapa, lado: Lado | null): boolean {
  return porta.dono === undefined || porta.dono === lado;
}

/**
 * Abre ou fecha a porta. Retorna a mensagem de erro, ou null se alternou.
 * `ocupado` diz se há alguém no tile: não dá para fechar a porta em cima de uma pessoa.
 */
export function alternarPorta(
  arena: Arena, cat: CatalogoTiles, porta: ObjetoMapa, lado: Lado | null,
  ocupado: (x: number, y: number) => boolean,
): string | null {
  const def = cat.obter(porta.id)?.porta;
  if (!def) return 'Isso não é uma porta.';
  if (!podeUsarPorta(porta, lado)) return 'Esta porta pertence a outro jogador.';
  const x = porta.x + def.dx;
  const y = porta.y + def.dy;
  if (!arena.dentro(x, y)) return 'A porta não abre aí.';
  if (def.aberta && ocupado(x, y)) return 'Tem alguém no caminho da porta.';
  arena.removerExato(porta.x, porta.y, porta.z, porta.id);
  arena.adicionarVarios([{ x, y, z: porta.z, id: def.par, dono: porta.dono, casa: porta.casa }]);
  return null;
}

/** Porta fechada do `lado` a até `alcance` tiles de (x, y): os bots a usam para sair da casa. */
export function portaFechadaPerto(
  arena: Arena, cat: CatalogoTiles, x: number, y: number, lado: Lado, alcance = 2,
): ObjetoMapa | undefined {
  for (let dy = -alcance; dy <= alcance; dy++) {
    for (let dx = -alcance; dx <= alcance; dx++) {
      const porta = portaEm(arena, cat, x + dx, y + dy);
      if (porta && porta.dono === lado && !cat.obter(porta.id)?.porta?.aberta) return porta;
    }
  }
  return undefined;
}
