// Tipos do combate. Sem DOM: o mesmo código poderá rodar no servidor autoritativo.
import type { EstadoJogador } from '../jogo/jogador';

export type Elemento = 'fisica' | 'fogo' | 'frio' | 'veneno' | 'energia';
export type TipoAlvo = 'outro' | 'qualquer' | 'proprio';

export type EfeitoMagia =
  | { tipo: 'dano'; bonus: number; dados: number; lados: number; elemento: Elemento; atrasoMs: number; visual: string }
  | { tipo: 'veneno'; alcanceForteTiles: number; limiares: number[]; niveis: number[] }
  | { tipo: 'paralisia' }
  | { tipo: 'cura'; formula: 'heal' | 'greater-heal' }
  | { tipo: 'cura-veneno' }
  | { tipo: 'reflexo'; somFim: string };

export interface DefMagia {
  id: string;
  nome: string;
  palavras: string;
  circulo: number;
  tecla: string;
  /** Gump do ícone (arquivo em /gumps/) e som (arquivo em /sons/), em hexadecimal. */
  icone: string;
  som: string;
  alvo: TipoAlvo;
  efeito: EfeitoMagia;
}

export interface DefVeneno {
  nome: string;
  min: number;
  max: number;
  percentual: number;
  primeiroMs: number;
  intervaloMs: number;
  ticks: number;
}

export interface Ficha {
  atributos: { str: number; dex: number; int: number };
  skills: {
    magery: number; evalInt: number; resist: number; inscription: number;
    poisoning: number; meditation: number; focus: number;
  };
  resistencias: Record<Elemento, number>;
  fasterCasting: number;
  fasterCastRecovery: number;
  lowerManaCost: number;
}

export interface Regras {
  modelo: Ficha;
  alcanceMiraTiles: number;
  respawnMs: number;
  manaPorCirculo: number[];
  venenos: DefVeneno[];
  magias: DefMagia[];
}

export type ModoBot = 'parado' | 'ativo';

export interface Combatente {
  id: string;
  nome: string;
  /** Posição e passos (o mesmo estado usado pelo movimento do jogador). */
  mov: EstadoJogador;
  ficha: Ficha;
  vida: number;
  vidaMax: number;
  mana: number;
  manaMax: number;
  /** Magia sendo lançada (o personagem não anda até terminar). */
  cast: { magia: DefMagia; inicioMs: number; fimMs: number } | null;
  /** Magia pronta, esperando o alvo (cursor de mira). */
  mira: DefMagia | null;
  /** Recuperação entre magias (FCR). */
  proximaMagiaMs: number;
  veneno: { nivel: number; proximoTickMs: number; ticksFeitos: number } | null;
  paralisadoAteMs: number;
  /** Pontos do Magic Reflect clássico (MagicDamageAbsorb): 0 = sem reflexo. */
  reflexo: number;
  morto: boolean;
  respawnEmMs: number;
  proximaRegenVidaMs: number;
  proximaRegenManaMs: number;
  ultimoAlvoId: string | null;
  /** Só para bots. */
  bot: { modo: ModoBot; proximaDecisaoMs: number } | null;
}

export type EventoCombate =
  | { tipo: 'dano'; alvoId: string; valor: number; origemId: string | null }
  | { tipo: 'cura'; alvoId: string; valor: number }
  | { tipo: 'texto'; alvoId: string; texto: string; cor: string }
  | { tipo: 'aviso'; paraId: string; texto: string }
  | { tipo: 'som'; som: string; alvoId: string }
  | { tipo: 'visual'; visual: string; origemId: string; alvoId: string; duracaoMs: number }
  | { tipo: 'morte'; alvoId: string }
  | { tipo: 'respawn'; alvoId: string };
