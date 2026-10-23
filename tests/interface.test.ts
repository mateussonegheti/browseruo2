import { describe, expect, it } from 'vitest';
import { cursorDirecional } from '../src/interface/recursos';

describe('cursor direcional do UO', () => {
  it('a luva aponta para o lado do mouse: cima, direita, baixo, esquerda e diagonais', () => {
    expect(cursorDirecional(0, -10)).toBe('0x206A');
    expect(cursorDirecional(10, -10)).toBe('0x206B');
    expect(cursorDirecional(10, 0)).toBe('0x206C');
    expect(cursorDirecional(0, 10)).toBe('0x206E');
    expect(cursorDirecional(-10, 0)).toBe('0x2070');
    expect(cursorDirecional(-10, -10)).toBe('0x2071');
  });
});
