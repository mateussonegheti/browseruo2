import { DESLOCAMENTO } from '../nucleo/direcoes';
import type { Direcao } from '../mundo/tipos';
import { distanciaTiles, type Aleatorio } from './formulas';
import type { MotorCombate } from './motor';
import type { Combatente } from './tipos';

/** O que o bot quer fazer neste quadro (no máximo uma coisa). */
export interface AcaoBot {
  lancar?: string;
  alvo?: string;
  /** Mira aberta sem alvo válido (inimigo morreu): desiste da magia. */
  cancelarMira?: boolean;
  mover?: Direcao;
}

const INTERVALO_DECISAO_MS = [350, 700] as const;
const ATAQUES = ['explosion', 'energy-bolt', 'flamestrike', 'lightning', 'fireball', 'mind-blast'] as const;

/** Direção do UO que mais aproxima de (dx, dy). */
export function direcaoPara(dx: number, dy: number): Direcao {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const i = DESLOCAMENTO.findIndex((d) => d.dx === sx && d.dy === sy);
  return (i < 0 ? 4 : i) as Direcao;
}

/**
 * IA simples de mago: cura e cura veneno quando precisa, mantém o reflexo, ataca de 3 a 7 tiles
 * e se movimenta para manter essa distância. O bot "parado" não faz nada (boneco de treino).
 */
export function decidirBot(
  bot: Combatente, inimigo: Combatente | undefined, motor: MotorCombate, agora: number, rng: Aleatorio,
  temVisao: (a: { x: number; y: number }, b: { x: number; y: number }) => boolean,
): AcaoBot {
  if (!bot.bot || bot.bot.modo === 'parado' || bot.morto) return {};
  if (bot.bot.modo === 'criatura') return passear(bot, agora, rng);

  // Magia pronta: escolhe o alvo na hora (como uma macro de "último alvo" / "si mesmo")
  if (bot.mira) {
    if (bot.mira.alvo !== 'outro') return { alvo: bot.id };
    return inimigo && !inimigo.morto ? { alvo: inimigo.id } : { cancelarMira: true };
  }
  if (motor.paralisado(bot, agora) || agora < bot.bot.proximaDecisaoMs) return {};
  const [min, max] = INTERVALO_DECISAO_MS;
  bot.bot.proximaDecisaoMs = agora + min + rng() * (max - min);

  const lancando = Boolean(bot.cast);
  const podeLancar = (id: string): boolean => {
    if (lancando) return false;
    const m = motor.magia(id);
    return Boolean(m) && agora >= bot.proximaMagiaMs && bot.mana >= motor.custo(bot, m!);
  };

  // Defesa
  if (bot.veneno && podeLancar('cure')) return { lancar: 'cure' };
  if (!bot.veneno && bot.vida < bot.vidaMax * 0.55 && podeLancar('greater-heal')) return { lancar: 'greater-heal' };
  if (bot.reflexo === 0 && rng() < 0.15 && podeLancar('magic-reflect')) return { lancar: 'magic-reflect' };

  if (!inimigo || inimigo.morto) return { mover: aleatoria(rng) };

  const dist = distanciaTiles(bot.mov, inimigo.mov);
  const visao = temVisao(bot.mov, inimigo.mov);

  // Ataque
  if (dist <= 10 && visao) {
    if (!inimigo.veneno && rng() < 0.25 && podeLancar('poison')) return { lancar: 'poison' };
    if (rng() < 0.1 && podeLancar('paralyze')) return { lancar: 'paralyze' };
    if (rng() < 0.06 && podeLancar('curse') && !inimigo.modificadores.some((m) => m.origem === 'maldicao')) return { lancar: 'curse' };
    if (rng() < 0.05 && inimigo.mana > 30 && podeLancar('mana-drain')) return { lancar: 'mana-drain' };
    const opcoes = ATAQUES.filter(podeLancar);
    if (opcoes.length && rng() < 0.7) return { lancar: opcoes[Math.floor(rng() * opcoes.length)]! };
  }

  // Movimento: aproxima se longe ou sem visão, afasta se muito perto, às vezes anda de lado
  const dx = inimigo.mov.x - bot.mov.x;
  const dy = inimigo.mov.y - bot.mov.y;
  if (dist > 7 || !visao) return { mover: direcaoPara(dx, dy) };
  if (dist < 3) return { mover: direcaoPara(-dx, -dy) };
  if (rng() < 0.4) return { mover: aleatoria(rng) };
  return {};
}

/** Criaturas andam à toa, com pausas. */
function passear(bot: Combatente, agora: number, rng: Aleatorio): AcaoBot {
  if (!bot.bot || agora < bot.bot.proximaDecisaoMs) return {};
  bot.bot.proximaDecisaoMs = agora + 500 + rng() * 1500;
  return rng() < 0.6 ? { mover: aleatoria(rng) } : {};
}

function aleatoria(rng: Aleatorio): Direcao {
  return Math.floor(rng() * 8) as Direcao;
}
