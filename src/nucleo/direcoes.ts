import type { Direcao } from '../mundo/tipos';

/** Deslocamento em tiles de cada direção (índice = Direcao do UO). */
export const DESLOCAMENTO: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: -1 }, // 0 N
  { dx: 1, dy: -1 }, // 1 NE
  { dx: 1, dy: 0 }, // 2 E
  { dx: 1, dy: 1 }, // 3 SE
  { dx: 0, dy: 1 }, // 4 S
  { dx: -1, dy: 1 }, // 5 SO
  { dx: -1, dy: 0 }, // 6 O
  { dx: -1, dy: -1 }, // 7 NO
];

// No UO o "norte" aponta para cima-direita na tela. Os 8 setores de 45° da
// tela, começando pela direita e girando no sentido horário (eixo Y para baixo):
// direita, baixo-direita, baixo, baixo-esquerda, esquerda, cima-esquerda, cima, cima-direita.
const SETOR_TELA_PARA_DIRECAO: ReadonlyArray<Direcao> = [1, 2, 3, 4, 5, 6, 7, 0];

/** Converte o vetor tela (personagem -> cursor) na direção do UO mais próxima. */
export function direcaoPorVetorTela(vx: number, vy: number): Direcao {
  const graus = (Math.atan2(vy, vx) * 180) / Math.PI;
  const setor = ((Math.round(graus / 45) % 8) + 8) % 8;
  return SETOR_TELA_PARA_DIRECAO[setor] ?? 0;
}
