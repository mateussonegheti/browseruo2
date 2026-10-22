// Fórmulas da era ML, transcritas do ServUO (commit d76bf44). Referências por função.
import type { DefVeneno, Elemento, Ficha } from './tipos';

export type Aleatorio = () => number;

/** Inteiro em [min, max] (Utility.RandomMinMax). */
export function inteiro(rng: Aleatorio, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Utility.Dice(dados, lados, bonus). */
export function dado(rng: Aleatorio, dados: number, lados: number, bonus: number): number {
  let total = bonus;
  for (let i = 0; i < dados; i++) total += inteiro(rng, 1, lados);
  return total;
}

/** Vida máxima de jogador em AoS+: 50 + Str/2. */
export function vidaMaxima(f: Ficha): number {
  return 50 + Math.floor(f.atributos.str / 2);
}

export function manaMaxima(f: Ficha): number {
  return f.atributos.int;
}

/** MagerySpell.GetMana + Spell.ScaleMana (LMC limitado a 40%). */
export function custoMana(tabela: number[], circulo: number, f: Ficha): number {
  const lmc = Math.min(40, f.lowerManaCost);
  return Math.floor((tabela[circulo - 1] ?? 0) * (1 - lmc / 100));
}

/** Spell.GetCastDelay: (3 + círculo) × 0,25 s − FC × 0,25 s, FC de Magery até 2, mínimo 0,25 s. */
export function tempoCastMs(circulo: number, f: Ficha): number {
  const fc = Math.min(2, f.fasterCasting);
  return Math.max(250, (3 + circulo) * 250 - fc * 250);
}

/** Spell.GetCastRecovery: (6 − FCR) / 4 s, mínimo 0. */
export function recuperacaoMs(f: Ficha): number {
  return (Math.max(0, 6 - f.fasterCastRecovery) / 4) * 1000;
}

/**
 * Spell.GetNewAosDamage + AOS.Damage com 100% de um elemento:
 * dado × (30 + 0,9 × EvalInt)% × (100 + bônus de Inscription + Int/10)% × (100 − resistência)%.
 */
export function danoMagia(
  rng: Aleatorio, bonus: number, dados: number, lados: number, caster: Ficha, alvo: Ficha, elemento: Elemento,
): number {
  let dano = dado(rng, dados, lados, bonus) * 100;
  const inscribeFixo = Math.floor(caster.skills.inscription * 10);
  const bonusScribe = inscribeFixo >= 1000 ? 10 : Math.floor(inscribeFixo / 200);
  const bonusDano = bonusScribe + Math.floor(caster.atributos.int / 10);
  const evalFixo = Math.floor(caster.skills.evalInt * 10);
  const escalaEval = 30 + Math.floor((9 * evalFixo) / 100);
  dano = Math.floor((dano * escalaEval) / 100);
  dano = Math.floor((dano * (100 + bonusDano)) / 100);
  dano = Math.floor(dano / 100);
  const resistencia = Math.min(70, alvo.resistencias[elemento]);
  return Math.max(0, Math.floor((dano * (100 - resistencia)) / 100));
}

/** HealSpell (ramo AoS/SE): Magery.Fixed/120 + 1d4, ×1,5 em outro alvo. */
export function curaHeal(rng: Aleatorio, caster: Ficha, emOutro: boolean): number {
  let cura = Math.floor((caster.skills.magery * 10) / 120) + inteiro(rng, 1, 4);
  if (emOutro) cura = Math.floor(cura * 1.5);
  return cura;
}

/** GreaterHealSpell: 40% de Magery + (1 a 10). */
export function curaGreaterHeal(rng: Aleatorio, caster: Ficha): number {
  return Math.floor(caster.skills.magery * 0.4) + inteiro(rng, 1, 10);
}

/** CureSpell (AoS): chance em % de curar um veneno de nível 0 a 4. */
export function chanceCure(caster: Ficha, nivel: number): number {
  const fator = nivel < 4 ? 3300 : 3100;
  return Math.trunc((10000 + Math.floor(caster.skills.magery * 75) - (nivel + 1) * fator) / 100);
}

/** MagerySpell.CheckResisted: probabilidade (0 a 1) de o alvo resistir. */
export function chanceResistir(caster: Ficha, alvo: Ficha, circulo: number): number {
  const resist = alvo.skills.resist;
  const primeiro = resist / 5;
  const segundo = resist - ((caster.skills.magery - 20) / 5 + circulo * 5);
  return Math.max(primeiro, segundo) / 2 / 100;
}

/** PoisonSpell (ramo AoS, sem SA): nível pelo total de Magery + Poisoning e pela distância. */
export function nivelVeneno(caster: Ficha, distancia: number, alcanceForte: number, limiares: number[], niveis: number[]): number {
  if (distancia > alcanceForte) return 0;
  const total = Math.floor((caster.skills.magery * 10 + caster.skills.poisoning * 10) / 2);
  const [l1 = 1000, l2 = 850, l3 = 650] = limiares;
  if (total >= l1) return niveis[0] ?? 3;
  if (total > l2) return niveis[1] ?? 2;
  if (total > l3) return niveis[2] ?? 1;
  return 0;
}

/** PoisonTimer: 1 + vida atual × %, preso entre mínimo e máximo. */
export function danoVeneno(v: DefVeneno, vidaAtual: number): number {
  const dano = 1 + Math.floor(vidaAtual * (v.percentual / 100));
  return Math.min(v.max, Math.max(v.min, dano));
}

/** ParalyzeSpell pré-AoS: (base + Magery × fator) segundos, ×0,75 se o alvo resistir. */
export function duracaoParalisiaMs(
  caster: Ficha, ef: { baseS: number; porMagery: number; fatorResistido: number }, resistiu: boolean,
): number {
  const s = ef.baseS + caster.skills.magery * ef.porMagery;
  return Math.round((resistiu ? s * ef.fatorResistido : s) * 1000);
}

/** MagicReflectSpell pré-AoS: 8 ou 15 pontos (15 com Magery + Inscription ≥ 200). */
export function pontosReflexo(f: Ficha): number {
  const soma = Math.floor(f.skills.magery + f.skills.inscription);
  return 8 + Math.floor(soma / 200) * 7;
}

/** RegenRates: humano em ML ganha +2 pontos de regeneração de vida. */
export function intervaloRegenVidaMs(): number {
  return 1000 / (0.1 * (1 + 2));
}

/** RegenRates (ramo ML), sem armadura que bloqueie Meditation e sem itens de regeneração. */
export function intervaloRegenManaMs(f: Ficha): number {
  const med = f.skills.meditation;
  const focus = f.skills.focus;
  const bonusFocus = focus / 200;
  let bonusMed = 0.0075 * med + 0.0025 * f.atributos.int;
  if (bonusMed >= 100) bonusMed *= 1.1;
  const baseItem = (((med / 2 + focus / 4) / 90) * 0.65) + 2.35;
  const bonusItem = (baseItem * 0 - (baseItem - 1)) / 10;
  return 1000 / (0.2 + bonusFocus + bonusMed + bonusItem);
}

/** Distância em tiles no estilo do UO (maior dos eixos). */
export function distanciaTiles(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
