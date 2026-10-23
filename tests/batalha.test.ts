import { describe, expect, it } from 'vitest';
import regras from '../src/combate/regras.json';
import { MotorCombate } from '../src/combate/motor';
import { criarJogador } from '../src/jogo/jogador';
import { Batalha, CONTAGEM_MS, composicao, montarParticipantes } from '../src/combate/batalha';

const lista = (modo: Parameters<typeof composicao>[0], lado: 'A' | 'B' = 'A') =>
  montarParticipantes(modo, lado, 'eu', (n) => `bot-${n}`);

describe('batalha', () => {
  it('compõe as equipes de cada modo', () => {
    expect(lista('1x1').map((p) => p.equipe)).toEqual(['A', 'B']);
    expect(lista('2x2', 'B').map((p) => p.equipe)).toEqual(['B', 'B', 'A', 'A']);
    expect(lista('3x3')).toHaveLength(6);
    expect(new Set(lista('ffa').map((p) => p.equipe)).size).toBe(4);
  });

  it('conta, luta e termina com uma equipe', () => {
    const b = new Batalha('2x2', 'treino', 'A', 'eu', lista('2x2'), 1000);
    expect(b.segundosRestantes(1000)).toBe(5);
    expect(b.atualizar(1000 + CONTAGEM_MS - 1, () => true)).toBe('contagem');
    expect(b.atualizar(1000 + CONTAGEM_MS, () => true)).toBe('luta');
    expect(b.atualizar(7000, (id) => id !== 'bot-1' && id !== 'bot-2')).toBe('fim');
    expect(b.vencedora).toBe('A');
    expect(b.jogadorVenceu).toBe(true);
  });

  it('FFA só acaba com um vivo e empate dá vencedora nula', () => {
    const b = new Batalha('ffa', 'avera', 'A', 'eu', lista('ffa'), 0);
    b.atualizar(CONTAGEM_MS, () => true);
    expect(b.atualizar(6000, (id) => id === 'eu' || id === 'bot-0')).toBe('luta');
    expect(b.atualizar(6100, () => false)).toBe('fim');
    expect(b.vencedora).toBeNull();
    expect(b.jogadorVenceu).toBe(false);
  });

  it('escolhe o inimigo vivo mais próximo, ignorando aliados', () => {
    const b = new Batalha('2x2', 'treino', 'A', 'eu', lista('2x2'), 0);
    const cs = [
      { id: 'eu', mov: { x: 0, y: 0 } }, { id: 'bot-0', mov: { x: 1, y: 0 } },
      { id: 'bot-1', mov: { x: 9, y: 0 } }, { id: 'bot-2', mov: { x: 5, y: 0 } },
    ];
    expect(b.inimigoMaisProximo('bot-0', cs)?.id).toBe('bot-2');
    expect(b.inimigoMaisProximo('eu', cs)?.id).toBe('bot-2');
  });
});

describe('motor em batalha', () => {
  const montar = () => {
    const motor = new MotorCombate(regras as never, { aleatorio: () => 0, temVisao: () => true, posicaoRespawn: () => ({ x: 0, y: 0 }) });
    motor.criar('a', 'A', criarJogador(1, 1), 0);
    return motor;
  };

  it('prepara a luta: paralisa e segura o respawn até ser liberado', () => {
    const motor = montar();
    const a = motor.obter('a')!;
    motor.prepararLuta('a', 0, CONTAGEM_MS);
    expect(motor.paralisado(a, 1000)).toBe(true);
    expect(motor.paralisado(a, CONTAGEM_MS + 1)).toBe(false);
    a.vida = 0;
    (motor as never as { morrer(c: unknown, t: number): void }).morrer(a, 10_000);
    motor.atualizar(10_000 + regras.respawnMs + 1);
    expect(a.morto).toBe(true);
    motor.agendarRespawn('a', 20_000);
    motor.atualizar(20_001);
    expect(a.morto).toBe(false);
  });

  it('foto devolve o kit de antes do kit completo', () => {
    const motor = montar();
    const a = motor.obter('a')!;
    a.itens = { x: 3 };
    a.equipamento.arma = null;
    const foto = motor.fotografar('a')!;
    motor.kitCompleto('a');
    expect(a.itens['x']).toBeUndefined();
    motor.restaurarFoto('a', foto);
    expect(a.itens).toEqual({ x: 3 });
  });
});
