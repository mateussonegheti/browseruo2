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

/** Lança `magia` de a em b e conclui o cast. */
function lancar(motor: MotorCombate, de: string, para: string, magia: string, agora: number): number {
  expect(motor.iniciarCast(de, magia, agora)).toBeNull();
  const fim = agora + tempoCastMs(motor.magia(magia)!.circulo, motor.obter(de)!.ficha);
  motor.atualizar(fim);
  if (motor.obter(de)!.mira) expect(motor.escolherAlvo(de, para, fim)).toBeNull();
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
  it('Paralyze: 0 s entre magos iguais; cresce com a diferença Eval − Resist', () => {
    expect(duracaoParalisiaMs(mago, mago)).toBe(0);
    expect(duracaoParalisiaMs(mago, { ...mago, skills: { ...mago.skills, resist: 50 } })).toBe(5000);
  });
  it('reflexo clássico tem 15 pontos; mana regenera ~1 ponto a cada 0,66 s', () => {
    expect(pontosReflexo(mago)).toBe(15);
    expect(intervaloRegenManaMs(mago)).toBeCloseTo(661.8, 0);
  });
});

describe('motor de combate', () => {
  it('cast trava o movimento, gasta a mana só ao escolher o alvo e o dano chega 1 s depois', () => {
    const { motor, a, b } = montar();
    expect(motor.iniciarCast('a', 'energy-bolt', 0)).toBeNull();
    expect(motor.podeMover('a', 100)).toBe(false);
    motor.atualizar(1750);
    expect(a.mira?.id).toBe('energy-bolt');
    expect(a.mana).toBe(100);
    expect(motor.escolherAlvo('a', 'b', 1750)).toBeNull();
    expect(a.mana).toBe(80);
    motor.atualizar(2749);
    expect(b.vida).toBe(100);
    motor.atualizar(2750);
    expect(b.vida).toBe(83);
  });
  it('dano interrompe o cast do alvo sem gastar mana', () => {
    const { motor, b } = montar();
    motor.iniciarCast('b', 'flamestrike', 0);
    lancar(motor, 'a', 'b', 'lightning', 0); // Lightning: 1,5 s e dano imediato
    expect(b.cast).toBeNull();
    expect(b.mana).toBe(100);
    expect(motor.coletarEventos().some((e) => e.tipo === 'aviso' && e.paraId === 'b')).toBe(true);
  });
  it('Heal falha em alvo envenenado (sem gastar mana) e Cure remove o veneno', () => {
    const { motor, a, b } = montar({ rng: sequencia(0.9) }); // 0,9: não resiste ao Poison
    b.mov.x = 6; // 1 tile: Deadly
    let t = lancar(motor, 'a', 'b', 'poison', 0);
    expect(b.veneno?.nivel).toBe(3);
    motor.iniciarCast('b', 'heal', t + 10);
    motor.atualizar(t + 510);
    expect(motor.escolherAlvo('b', 'b', t + 510)).toMatch(/envenenado/);
    expect(b.mana).toBe(100);
    t += 510;
    t = lancar(motor, 'b', 'b', 'cure', t + 10);
    expect(b.veneno).toBeNull();
    void a;
  });
  it('veneno dá dano em ticks e interrompe o cast', () => {
    const { motor, b } = montar({ rng: sequencia(0.9) });
    b.mov.x = 6;
    const inicio = lancar(motor, 'a', 'b', 'poison', 0); // Poison: 3º círculo = 1 s
    motor.iniciarCast('b', 'greater-heal', inicio + 2500);
    motor.atualizar(inicio + 3000);
    expect(b.vida).toBe(70); // Deadly: 30% de 100
    expect(b.cast).toBeNull();
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
    motor.atualizar(t + 3000);
    expect(b.reflexo).toBe(0);
    expect(b.vida).toBeLessThan(100);
    expect(motor.iniciarCast('b', 'magic-reflect', t + 3000)).toBeNull();
  });
  it('alvo longe demais ou sem visão é recusado e encerra a mira', () => {
    const { motor, a, b } = montar({ visao: false });
    motor.iniciarCast('a', 'lightning', 0);
    motor.atualizar(1500);
    expect(motor.escolherAlvo('a', 'b', 1500)).toMatch(/visto/);
    expect(a.mira).toBeNull();
    b.mov.x = 30;
    void b;
  });
  it('morte e respawn com vida e mana cheias', () => {
    const { motor, b } = montar();
    b.vida = 5;
    lancar(motor, 'a', 'b', 'lightning', 0);
    expect(b.morto).toBe(true);
    motor.atualizar(1500 + regras.respawnMs);
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
    motor.atualizar(6000);
    expect(decidirBot(bot, jogador, motor, 6000, minimo, () => true)).toEqual({ alvo: 't' });
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
