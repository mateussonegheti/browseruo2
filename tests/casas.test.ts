import { describe, expect, it } from 'vitest';
import { Arena, criarMapaVazio, validarMapa } from '../src/mundo/mapa';
import { alternarPorta, portaEm } from '../src/mundo/portas';
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
  it('o deed vem do totem, não da mochila inicial, e gasta uma vez', () => {
    const motor = new MotorCombate(regras as never, { aleatorio: () => 0, temVisao: () => true, posicaoRespawn: () => ({ x: 0, y: 0 }) });
    motor.criar('a', 'A', criarJogador(1, 1), 0);
    expect(motor.obter('a')!.itens['0x14F0']).toBeUndefined();
    expect(regras.totem.itens).toContain('0x14F0');
    motor.darItem('a', '0x14F0');
    expect(motor.obter('a')!.itens['0x14F0']).toBe(1);
    expect(motor.gastarItem('a', '0x14F0')).toBe(true);
    expect(motor.gastarItem('a', '0x14F0')).toBe(false);
  });
});

describe('portas', () => {
  const portaCat = new CatalogoTiles({
    versao: 1, origem: 'x',
    tiles: [
      { id: 1, nome: 'g', tipo: 'terreno', altura: 0, bloqueia: false, cor: '#000000' },
      { id: 50, nome: 'porta', tipo: 'objeto', altura: 20, bloqueia: true, cor: '#000000', porta: { par: 51, dx: -1, dy: 1 } },
      { id: 51, nome: 'porta aberta', tipo: 'objeto', altura: 20, bloqueia: false, cor: '#000000', porta: { par: 50, dx: 1, dy: -1, aberta: true } },
    ],
  } as never);

  it('abre trocando de tile e fecha voltando, mantendo o dono', () => {
    const a = arena();
    a.adicionarObjeto(5, 5, 0, 50, 'A');
    expect(tileBloqueado(a, portaCat, 5, 5)).toBe(true);
    expect(alternarPorta(a, portaCat, portaEm(a, portaCat, 5, 5)!, 'A')).toBeNull();
    expect(tileBloqueado(a, portaCat, 5, 5)).toBe(false);
    const aberta = portaEm(a, portaCat, 4, 6)!;
    expect(aberta).toMatchObject({ id: 51, dono: 'A' });
    expect(alternarPorta(a, portaCat, aberta, 'A')).toBeNull();
    expect(portaEm(a, portaCat, 5, 5)!.id).toBe(50);
  });
  it('só o dono usa a porta; sem dono, qualquer um', () => {
    const a = arena();
    a.adicionarObjeto(5, 5, 0, 50, 'A');
    expect(alternarPorta(a, portaCat, portaEm(a, portaCat, 5, 5)!, 'B')).toMatch(/outro jogador/);
    expect(portaEm(a, portaCat, 5, 5)!.id).toBe(50);
    a.adicionarObjeto(8, 8, 0, 50);
    expect(alternarPorta(a, portaCat, portaEm(a, portaCat, 8, 8)!, 'B')).toBeNull();
  });
  it('fecha a porta mesmo com alguém no tile', () => {
    const a = arena();
    a.adicionarObjeto(4, 6, 0, 51);
    expect(alternarPorta(a, portaCat, portaEm(a, portaCat, 4, 6)!, null)).toBeNull();
  });
  it('mapa aceita spawn B e dono, e rejeita dono inválido', () => {
    const m = criarMapaVazio('t', 16, 16, 1);
    m.spawnB = { x: 3, y: 3 };
    m.objetos.push({ x: 1, y: 1, z: 0, id: 50, dono: 'A' });
    expect(validarMapa(m).ok).toBe(true);
    m.objetos.push({ x: 2, y: 2, z: 0, id: 50, dono: 'C' as never });
    expect(validarMapa(m).ok).toBe(false);
  });
});
