import { describe, expect, it } from 'vitest';
import { mundoParaTile, tileParaMundo } from '../src/nucleo/projecao';
import { DESLOCAMENTO, direcaoPorVetorTela } from '../src/nucleo/direcoes';

describe('projeção isométrica', () => {
  it('ida e volta tile -> mundo -> tile é identidade', () => {
    for (let x = -5; x < 30; x += 3) {
      for (let y = -5; y < 30; y += 4) {
        const m = tileParaMundo(x, y);
        expect(mundoParaTile(m.x, m.y)).toEqual({ x, y });
      }
    }
  });

  it('Z sobe 4 px por unidade', () => {
    expect(tileParaMundo(3, 3, 10).y).toBe(tileParaMundo(3, 3, 0).y - 40);
  });

  it('pontos próximos do centro ainda caem no mesmo tile', () => {
    const m = tileParaMundo(10, 7);
    expect(mundoParaTile(m.x + 5, m.y + 5)).toEqual({ x: 10, y: 7 });
    expect(mundoParaTile(m.x - 5, m.y - 5)).toEqual({ x: 10, y: 7 });
  });
});

describe('direção por vetor de tela (estilo UO)', () => {
  const casos: Array<[string, number, number, number]> = [
    ['direita da tela = Nordeste', 100, 0, 1],
    ['baixo-direita = Leste', 100, 100, 2],
    ['baixo = Sudeste', 0, 100, 3],
    ['baixo-esquerda = Sul', -100, 100, 4],
    ['esquerda = Sudoeste', -100, 0, 5],
    ['cima-esquerda = Oeste', -100, -100, 6],
    ['cima = Noroeste', 0, -100, 7],
    ['cima-direita = Norte', 100, -100, 0],
  ];
  it.each(casos)('%s', (_n, vx, vy, esperado) => {
    expect(direcaoPorVetorTela(vx, vy)).toBe(esperado);
  });

  it('o deslocamento resultante aponta para o mesmo lado da tela', () => {
    // Mover na direção "direita da tela" deve aumentar a coordenada x de tela.
    const d = DESLOCAMENTO[direcaoPorVetorTela(100, 0)]!;
    expect(tileParaMundo(d.dx, d.dy).x).toBeGreaterThan(0);
    const b = DESLOCAMENTO[direcaoPorVetorTela(0, 100)]!;
    expect(tileParaMundo(b.dx, b.dy).y).toBeGreaterThan(0);
  });
});
