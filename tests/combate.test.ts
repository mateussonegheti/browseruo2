import { describe, expect, it } from 'vitest';
import regrasJson from '../src/combate/regras.json';
import { MotorCombate } from '../src/combate/motor';
import {
  chanceCure, chanceResistir, curaGreaterHeal, curaHeal, custoMana, danoMagia, danoVeneno, duracaoParalisiaMs,
  intervaloRegenManaMs, nivelVeneno, pontosReflexo, recuperacaoMs, tempoCastMs,
} from '../src/combate/formulas';
import { decidirBot } from '../src/combate/bot';
import type { Regras } from '../src/combate/tipos';
import { criarJogador } from '../src/jogo/jogador';
import { direcaoArmazenada } from '../src/render/animacoes';

const regras = regrasJson as Regras;
const mago = regras.modelo;
const minimo = () => 0;
const maximo = () => 0.999999;
/** Devolve os valores na ordem e depois 0. */
const sequencia = (...v: number[]) => () => v.shift() ?? 0;

function montar(opcoes: { rng?: () => number; visao?: boolean } = {}) {
  const motor = new MotorCombate(regras, {
    aleatorio: opcoes.rng ?? minimo,
    temVisao: () => opcoes.visao ?? true,
    posicaoRespawn: () => ({ x: 0, y: 0 }),
  });
  const a = motor.criar('a', 'A', criarJogador(5, 5), 0);
  const b = motor.criar('b', 'B', criarJogador(8, 5), 0);
  return { motor, a, b };
}

/** Escolhe `magia`, mira em `para` na hora e conclui o cast. Retorna o instante em que o efeito saiu. */
function lancar(motor: MotorCombate, de: string, para: string, magia: string, agora: number): number {
  expect(motor.iniciarCast(de, magia, agora)).toBeNull();
  if (motor.obter(de)!.mira) expect(motor.escolherAlvo(de, para, agora)).toBeNull();
  const fim = agora + tempoCastMs(motor.magia(magia)!.circulo, motor.obter(de)!.ficha);
  motor.atualizar(fim);
  return fim;
}

describe('fórmulas (mago com todas as skills em 100)', () => {
  it('mana por círculo e tempo de cast com FC 2', () => {
    expect(custoMana(regras.manaPorCirculo, 6, mago)).toBe(20);
    expect(custoMana(regras.manaPorCirculo, 8, { ...mago, lowerManaCost: 60 })).toBe(30); // LMC limitado a 40%
    expect(tempoCastMs(1, mago)).toBe(500);
    expect(tempoCastMs(6, mago)).toBe(1750);
    expect(tempoCastMs(7, mago)).toBe(2000);
    expect(recuperacaoMs(mago)).toBe(0);
    expect(recuperacaoMs({ ...mago, fasterCastRecovery: 0 })).toBe(1500);
  });
  it('dano: Energy Bolt 41–45 × 1,2 (Eval) × 1,2 (Int + Inscription) × 30% (resistência 70)', () => {
    expect(danoMagia(minimo, 40, 1, 5, mago, mago, 'energia')).toBe(17);
    expect(danoMagia(maximo, 40, 1, 5, mago, mago, 'energia')).toBe(19);
    const semResist = { ...mago, resistencias: { ...mago.resistencias, energia: 0 } };
    expect(danoMagia(minimo, 40, 1, 5, mago, semResist, 'energia')).toBe(59);
  });
  it('curas', () => {
    expect(curaHeal(minimo, mago, false)).toBe(9);
    expect(curaHeal(maximo, mago, true)).toBe(18);
    expect(curaGreaterHeal(minimo, mago)).toBe(41);
    expect(curaGreaterHeal(maximo, mago)).toBe(50);
  });
  it('Cure: chance por nível de veneno com Magery 100', () => {
    expect([0, 1, 2, 3, 4].map((n) => Math.min(100, chanceCure(mago, n)))).toEqual([100, 100, 76, 43, 20]);
  });
  it('Poison: Deadly até 2 tiles, Lesser mais longe; resistência ~34,5% no 3º círculo', () => {
    expect(nivelVeneno(mago, 2, 2, [1000, 850, 650], [3, 2, 1])).toBe(3);
    expect(nivelVeneno(mago, 3, 2, [1000, 850, 650], [3, 2, 1])).toBe(0);
    expect(chanceResistir(mago, mago, 3)).toBeCloseTo(0.345);
    expect(danoVeneno(regras.venenos[3]!, 100)).toBe(30);
    expect(danoVeneno(regras.venenos[0]!, 10)).toBe(4);
  });
  it('Paralyze pré-AoS: 7 + Magery × 0,2 = 27 s; 20,25 s se o alvo resistir', () => {
    const ef = { baseS: 7, porMagery: 0.2, fatorResistido: 0.75 };
    expect(duracaoParalisiaMs(mago, ef, false)).toBe(27000);
    expect(duracaoParalisiaMs(mago, ef, true)).toBe(20250);
  });
  it('reflexo clássico tem 15 pontos; mana regenera ~1 ponto a cada 0,66 s', () => {
    expect(pontosReflexo(mago)).toBe(15);
    expect(intervaloRegenManaMs(mago)).toBeCloseTo(661.8, 0);
  });
});

describe('motor de combate (mira primeiro, efeito no fim do cast)', () => {
  it('a tecla abre a mira na hora; o alvo começa o cast; mana e dano saem no fim do tempo de cast', () => {
    const { motor, a, b } = montar();
    expect(motor.iniciarCast('a', 'energy-bolt', 0)).toBeNull();
    expect(a.mira?.id).toBe('energy-bolt');
    expect(a.cast).toBeNull();
    expect(motor.escolherAlvo('a', 'b', 100)).toBeNull();
    expect(a.cast?.alvoId).toBe('b');
    expect(motor.podeMover('a', 200)).toBe(false);
    motor.atualizar(1849); // EB: 6º círculo = 1,75 s
    expect(a.mana).toBe(100);
    expect(b.vida).toBe(100);
    motor.atualizar(1850);
    expect(a.mana).toBe(80);
    expect(b.vida).toBe(83);
  });
  it('Magic Reflection não pede alvo: o cast começa direto', () => {
    const { motor, a } = montar();
    motor.iniciarCast('a', 'magic-reflect', 0);
    expect(a.mira).toBeNull();
    expect(a.cast?.alvoId).toBe('a');
  });
  it('dano interrompe o cast do alvo sem gastar mana', () => {
    const { motor, b } = montar();
    motor.iniciarCast('b', 'flamestrike', 0);
    motor.escolherAlvo('b', 'a', 0);
    lancar(motor, 'a', 'b', 'lightning', 0); // Lightning: 1,25 s, antes dos 2 s do Flamestrike
    expect(b.cast).toBeNull();
    expect(b.mana).toBe(100);
    expect(motor.coletarEventos().some((e) => e.tipo === 'aviso' && e.paraId === 'b')).toBe(true);
  });
  it('Heal em alvo envenenado falha no fim do cast (sem gastar mana) e Cure remove o veneno', () => {
    const { motor, b } = montar({ rng: sequencia(0.9) }); // 0,9: não resiste ao Poison
    b.mov.x = 6; // 1 tile: Deadly
    let t = lancar(motor, 'a', 'b', 'poison', 0);
    expect(b.veneno?.nivel).toBe(3);
    t = lancar(motor, 'b', 'b', 'heal', t + 10);
    expect(b.mana).toBe(100);
    t = lancar(motor, 'b', 'b', 'cure', t + 10);
    expect(b.veneno).toBeNull();
  });
  it('veneno dá dano em ticks e interrompe o cast', () => {
    const { motor, b } = montar({ rng: sequencia(0.9) });
    b.mov.x = 6;
    const inicio = lancar(motor, 'a', 'b', 'poison', 0); // Poison: 3º círculo = 1 s
    motor.iniciarCast('b', 'greater-heal', inicio + 2500);
    motor.escolherAlvo('b', 'b', inicio + 2500);
    motor.atualizar(inicio + 3000);
    expect(b.vida).toBe(70); // Deadly: 30% de 100
    expect(b.cast).toBeNull();
  });
  it('Paralyze dura 27 s, interrompe o cast e qualquer dano quebra', () => {
    const { motor, a, b } = montar({ rng: maximo }); // não resiste
    motor.iniciarCast('b', 'flamestrike', 0);
    motor.escolherAlvo('b', 'a', 0);
    const t = lancar(motor, 'a', 'b', 'paralyze', 0);
    expect(b.cast).toBeNull();
    expect(motor.paralisado(b, t + 26000)).toBe(true);
    expect(motor.podeMover('b', t + 1000)).toBe(false);
    expect(motor.iniciarCast('b', 'heal', t + 1000)).toMatch(/paralisado/);
    lancar(motor, 'a', 'b', 'lightning', t + 1000);
    expect(motor.paralisado(b, t + 3000)).toBe(false);
    void a;
  });
  it('Magic Reflect clássico devolve a magia e se esgota pelos círculos', () => {
    const { motor, a, b } = montar();
    let t = lancar(motor, 'b', 'b', 'magic-reflect', 0);
    expect(b.reflexo).toBe(15);
    t = lancar(motor, 'a', 'b', 'lightning', t);
    expect(a.vida).toBeLessThan(100); // voltou para quem lançou
    expect(b.vida).toBe(100);
    expect(b.reflexo).toBe(11);
    t = lancar(motor, 'a', 'b', 'explosion', t + 10);
    t = lancar(motor, 'a', 'b', 'explosion', t + 10); // 11 − 6 = 5, depois 5 − 6 < 0: não reflete
    expect(b.reflexo).toBe(0);
    expect(b.vida).toBeLessThan(100);
    expect(motor.iniciarCast('b', 'magic-reflect', t)).toBeNull();
  });
  it('alvo sem visão é recusado ao mirar e encerra a mira', () => {
    const { motor, a } = montar({ visao: false });
    motor.iniciarCast('a', 'lightning', 0);
    expect(motor.escolherAlvo('a', 'b', 0)).toMatch(/visto/);
    expect(a.mira).toBeNull();
    expect(a.cast).toBeNull();
  });
  it('alvo que se afasta durante o cast faz a magia falhar no fim, sem gastar mana', () => {
    const { motor, a, b } = montar();
    motor.iniciarCast('a', 'lightning', 0);
    motor.escolherAlvo('a', 'b', 0);
    b.mov.x = 30;
    motor.atualizar(1250);
    expect(a.mana).toBe(100);
    expect(b.vida).toBe(100);
  });
  it('morte e respawn com vida e mana cheias', () => {
    const { motor, b } = montar();
    b.vida = 5;
    const t = lancar(motor, 'a', 'b', 'lightning', 0);
    expect(b.morto).toBe(true);
    motor.atualizar(t + regras.respawnMs);
    expect(b.morto).toBe(false);
    expect(b.vida).toBe(b.vidaMax);
    expect(b.mov.x).toBe(0);
  });
});

describe('bot', () => {
  it('bot parado não faz nada; bot ativo ataca o inimigo à vista', () => {
    const motor = new MotorCombate(regras, { aleatorio: minimo, temVisao: () => true, posicaoRespawn: () => ({ x: 0, y: 0 }) });
    const jogador = motor.criar('j', 'J', criarJogador(5, 5), 0);
    const parado = motor.criar('p', 'P', criarJogador(9, 5), 0, 'parado');
    const ativo = motor.criar('t', 'T', criarJogador(9, 9), 0, 'ativo');
    expect(decidirBot(parado, jogador, motor, 5000, minimo, () => true)).toEqual({});
    const acao = decidirBot(ativo, jogador, motor, 5000, minimo, () => true);
    expect(acao.lancar).toBeDefined();
    expect(motor.iniciarCast('t', acao.lancar!, 5000)).toBeNull();
  });
  it('bot ativo envenenado se cura e mira em si mesmo', () => {
    const motor = new MotorCombate(regras, { aleatorio: minimo, temVisao: () => true, posicaoRespawn: () => ({ x: 0, y: 0 }) });
    const jogador = motor.criar('j', 'J', criarJogador(5, 5), 0);
    const bot = motor.criar('t', 'T', criarJogador(9, 9), 0, 'ativo');
    bot.veneno = { nivel: 1, proximoTickMs: 99999, ticksFeitos: 0 };
    expect(decidirBot(bot, jogador, motor, 5000, minimo, () => true)).toEqual({ lancar: 'cure' });
    motor.iniciarCast('t', 'cure', 5000);
    expect(decidirBot(bot, jogador, motor, 5000, minimo, () => true)).toEqual({ alvo: 't' });
  });
  it('bot com magia ofensiva na mira desiste se o inimigo morreu (não acerta a si mesmo)', () => {
    const motor = new MotorCombate(regras, { aleatorio: minimo, temVisao: () => true, posicaoRespawn: () => ({ x: 0, y: 0 }) });
    const jogador = motor.criar('j', 'J', criarJogador(5, 5), 0);
    const bot = motor.criar('t', 'T', criarJogador(9, 9), 0, 'ativo');
    bot.mira = motor.magia('energy-bolt')!;
    jogador.morto = true;
    expect(decidirBot(bot, jogador, motor, 6000, minimo, () => true)).toEqual({ cancelarMira: true });
  });
});

describe('criaturas e animações', () => {
  it('criatura só passeia: nunca lança magia', () => {
    const motor = new MotorCombate(regras, { aleatorio: minimo, temVisao: () => true, posicaoRespawn: () => ({ x: 0, y: 0 }) });
    const jogador = motor.criar('j', 'J', criarJogador(5, 5), 0);
    const cavalo = motor.criar('c', 'Cavalo', criarJogador(7, 7), 0, 'criatura');
    for (let t = 0; t < 20000; t += 500) {
      const acao = decidirBot(cavalo, jogador, motor, t, minimo, () => true);
      expect(acao.lancar).toBeUndefined();
    }
  });
  it('direções do UO: 5 guardadas, Norte/Nordeste/Leste espelhadas', () => {
    expect(direcaoArmazenada(3)).toEqual({ dir: 0, espelhar: false });
    expect(direcaoArmazenada(4)).toEqual({ dir: 1, espelhar: false });
    expect(direcaoArmazenada(2)).toEqual({ dir: 1, espelhar: true });
    expect(direcaoArmazenada(1)).toEqual({ dir: 2, espelhar: true });
    expect(direcaoArmazenada(0)).toEqual({ dir: 3, espelhar: true });
    expect(direcaoArmazenada(7)).toEqual({ dir: 4, espelhar: false });
  });
});
