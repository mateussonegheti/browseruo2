import { describe, expect, it } from 'vitest';
import { Arena, criarMapaVazio } from '../src/mundo/mapa';
import { CatalogoTiles } from '../src/mundo/catalogo';
import { tileBloqueado } from '../src/mundo/colisao';
import { construirCasa, motivoNaoConstruir, pegadaDaCasa, tetosSobre, type CasaDef } from '../src/mundo/casas';
import { MotorCombate } from '../src/combate/motor';
import { criarJogador } from '../src/jogo/jogador';
import regras from '../src/combate/regras.json';
import catalogoJson from './fixtures/catalogo-placeholder.json';

const cat = new CatalogoTiles(catalogoJson as never);
const MURO = 101;
const nunca = () => false;

// Casa 2×2: muro no chão, dois no andar de cima (z 30) e um repetido no mesmo (x, y, z)
const casa: CasaDef = {
  id: '0x001', nome: 'Teste', largura: 2, profundidade: 2,
  tiles: [[MURO, 0, 0, 0], [MURO, 1, 0, 0], [MURO, 0, 0, 0], [MURO, 0, 0, 30], [MURO, 1, 1, 30]],
};
const arena = () => new Arena(criarMapaVazio('t', 16, 16, 1));

describe('casas do deed', () => {
  it('a pegada junta os tiles repetidos', () => {
    expect(pegadaDaCasa(casa, 5, 5)).toHaveLength(3);
  });
  it('constrói sem substituir objetos no mesmo z', () => {
    const a = arena();
    construirCasa(a, casa, 5, 5);
    expect(a.objetosEm(5, 5).filter((o) => o.z === 0)).toHaveLength(2);
  });
  it('só constrói em espaço livre', () => {
    const a = arena();
    expect(motivoNaoConstruir(a, cat, casa, 5, 5, nunca)).toBeNull();
    expect(motivoNaoConstruir(a, cat, casa, 15, 15, nunca)).toMatch(/borda/);
    expect(motivoNaoConstruir(a, cat, casa, 5, 5, (x, y) => x === 6 && y === 5)).toMatch(/alguém/);
    a.adicionarObjeto(5, 5, 0, MURO);
    expect(motivoNaoConstruir(a, cat, casa, 5, 5, nunca)).toMatch(/livre/);
  });
  it('o andar de cima não bloqueia o chão', () => {
    const a = arena();
    construirCasa(a, casa, 5, 5);
    expect(tileBloqueado(a, cat, 6, 6)).toBe(false);
  });
  it('esconde o teto só quando o jogador está debaixo dele', () => {
    const a = arena();
    construirCasa(a, casa, 5, 5);
    expect(tetosSobre(a, cat, 2, 2).size).toBe(0);
    expect(tetosSobre(a, cat, 6, 6).size).toBe(2);
  });
});

describe('deed na mochila', () => {
  it('começa com o deed e gasta uma vez', () => {
    const motor = new MotorCombate(regras as never, { aleatorio: () => 0, temVisao: () => true, posicaoRespawn: () => ({ x: 0, y: 0 }) });
    motor.criar('a', 'A', criarJogador(1, 1), 0);
    expect(motor.obter('a')!.itens['0x14F0']).toBe(1);
    expect(motor.gastarItem('a', '0x14F0')).toBe(true);
    expect(motor.gastarItem('a', '0x14F0')).toBe(false);
  });
});
