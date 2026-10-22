import { DESLOCAMENTO } from '../nucleo/direcoes';
import { podeAndar } from '../mundo/colisao';
import type { Arena } from '../mundo/mapa';
import type { CatalogoTiles } from '../mundo/catalogo';
import type { Direcao } from '../mundo/tipos';

/** Tempo por passo (ms), como no UO a pé. */
export const PASSO_ANDAR_MS = 400;
export const PASSO_CORRER_MS = 200;
/** Se o último passo terminou há menos que isso, o próximo mantém o ritmo (sem soluço). */
const TOLERANCIA_ENCADEAR_MS = 100;

export interface Movimento {
  deX: number;
  deY: number;
  paraX: number;
  paraY: number;
  inicio: number;
  duracao: number;
}

export interface EstadoJogador {
  x: number;
  y: number;
  dir: Direcao;
  movimento: Movimento | null;
  /** Instante em que o último passo terminou. */
  ultimoFim: number;
}

export function criarJogador(x: number, y: number): EstadoJogador {
  return { x, y, dir: 4, movimento: null, ultimoFim: Number.NEGATIVE_INFINITY };
}

/** Conclui o passo em andamento quando o tempo dele acabou. */
export function atualizarJogador(j: EstadoJogador, agora: number): void {
  const m = j.movimento;
  if (m && agora >= m.inicio + m.duracao) {
    j.x = m.paraX;
    j.y = m.paraY;
    j.ultimoFim = m.inicio + m.duracao;
    j.movimento = null;
  }
}

/**
 * Tenta iniciar um passo. Sempre vira o personagem para `dir`;
 * só anda se não houver passo em curso e o destino for livre.
 * `ocupado` informa tiles com outros personagens (ninguém atravessa ninguém).
 */
export function tentarAndar(
  j: EstadoJogador, dir: Direcao, correndo: boolean, agora: number, arena: Arena, cat: CatalogoTiles,
  ocupado?: (x: number, y: number) => boolean,
): boolean {
  j.dir = dir;
  if (j.movimento) return false;
  const { dx, dy } = DESLOCAMENTO[dir] ?? { dx: 0, dy: 0 };
  if (!podeAndar(arena, cat, j.x, j.y, dx, dy)) return false;
  if (ocupado?.(j.x + dx, j.y + dy)) return false;
  const encadeia = agora - j.ultimoFim < TOLERANCIA_ENCADEAR_MS;
  j.movimento = {
    deX: j.x, deY: j.y, paraX: j.x + dx, paraY: j.y + dy,
    inicio: encadeia ? j.ultimoFim : agora,
    duracao: correndo ? PASSO_CORRER_MS : PASSO_ANDAR_MS,
  };
  return true;
}

/** Posição em coordenadas de tile fracionárias, para desenho suave. */
export function posicaoVisual(j: EstadoJogador, agora: number): { x: number; y: number } {
  const m = j.movimento;
  if (!m) return { x: j.x, y: j.y };
  const t = Math.min(1, Math.max(0, (agora - m.inicio) / m.duracao));
  return { x: m.deX + (m.paraX - m.deX) * t, y: m.deY + (m.paraY - m.deY) * t };
}
