// Projeção isométrica do UO: losango de 44x44 px, 1 unidade Z = 4 px.

export const METADE_LARGURA = 22;
export const METADE_ALTURA = 22;
export const PIXELS_POR_Z = 4;

export interface Ponto {
  x: number;
  y: number;
}

/** Centro do losango do tile no "espaço do mundo em pixels" (antes da câmera). */
export function tileParaMundo(x: number, y: number, z = 0): Ponto {
  return {
    x: (x - y) * METADE_LARGURA,
    y: (x + y) * METADE_ALTURA - z * PIXELS_POR_Z,
  };
}

/** Inverso de tileParaMundo para o chão (z = 0). Retorna o tile sob o ponto. */
export function mundoParaTile(mx: number, my: number): Ponto {
  const a = mx / METADE_LARGURA;
  const b = my / METADE_ALTURA;
  // Cada tile ocupa [n-0.5, n+0.5] em torno do seu centro inteiro.
  return { x: Math.round((a + b) / 2) || 0, y: Math.round((b - a) / 2) || 0 };
}
