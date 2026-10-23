import { describe, expect, it } from 'vitest';
import regras from '../src/combate/regras.json';
import { MotorCombate } from '../src/combate/motor';
import { decidirBot } from '../src/combate/bot';
import { criarJogador, tentarAndar } from '../src/jogo/jogador';
import { Arena, criarMapaVazio } from '../src/mundo/mapa';
import { CatalogoTiles } from '../src/mundo/catalogo';
import { normalizarPerfil, perfilPadrao, vidaPadrao } from '../src/combate/criaturas';
import type { Regras } from '../src/combate/tipos';
import catalogoJson from './fixtures/catalogo-placeholder.json';

const modelo = (regras as unknown as Regras).modelo;

describe('perfil de criatura', () => {
  it('o padrão mantém a vida de antes do editor', () => {
    expect(vidaPadrao('daemon', 'monstro')).toBe(300);
    expect(vidaPadrao('lobo', 'animal')).toBe(40);
    expect(vidaPadrao('x', 'monstro')).toBe(120);
    const p = perfilPadrao('daemon', 'monstro', 'Daemon', modelo);
    expect(p.vida).toBe(300);
    expect(p.matiz).toBe(0);
    expect(p.comportamento).toBe('passear');
  });
  it('normaliza valores inválidos e fora dos limites', () => {
    const base = perfilPadrao('orc', 'monstro', 'Orc', modelo);
    const p = normalizarPerfil({
      nome: '   ', vida: -5, str: Number.NaN, passoMs: 5, matiz: -3, comportamento: 'voar' as never,
      resistencias: { fisica: 250, fogo: 30, frio: 0, veneno: 0, energia: 0 },
    }, base);
    expect(p.nome).toBe('Orc');
    expect(p.vida).toBe(1);
    expect(p.str).toBe(base.str);
    expect(p.passoMs).toBe(50);
    expect(p.matiz).toBe(0);
    expect(p.comportamento).toBe('passear');
    expect(p.resistencias.fisica).toBe(100);
    expect(p.resistencias.fogo).toBe(30);
  });
  it('passo próprio da criatura vale no lugar do passo a pé', () => {
    const a = new Arena(criarMapaVazio('t', 8, 8, 1));
    const cat = new CatalogoTiles(catalogoJson as never);
    const j = criarJogador(2, 2);
    expect(tentarAndar(j, 2, false, 1000, a, cat, undefined, 150)).toBe(true);
    expect(j.movimento?.duracao).toBe(150);
  });
  it('criatura parada não decide andar', () => {
    const motor = new MotorCombate(regras as never, { aleatorio: () => 0, temVisao: () => true, posicaoRespawn: () => ({ x: 0, y: 0 }) });
    const c = motor.criar('c', 'Lobo', criarJogador(2, 2), 0, 'criatura');
    c.bot!.parado = true;
    expect(decidirBot(c, undefined, motor, 5000, () => 0.1, () => true)).toEqual({});
    c.bot!.parado = false;
    expect(decidirBot(c, undefined, motor, 5000, () => 0.1, () => true).mover).toBeDefined();
  });
});
