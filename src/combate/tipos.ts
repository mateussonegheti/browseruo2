// Tipos do combate. Sem DOM: o mesmo código poderá rodar no servidor autoritativo.
import type { EstadoJogador } from '../jogo/jogador';

export type Elemento = 'fisica' | 'fogo' | 'frio' | 'veneno' | 'energia';
/** 'local': a mira escolhe um tile (Teleport, Wall of Stone). */
export type TipoAlvo = 'outro' | 'qualquer' | 'proprio' | 'local';

export type EfeitoMagia =
  | { tipo: 'dano'; bonus: number; dados: number; lados: number; elemento: Elemento; atrasoMs: number; visual: string;
      /** Harm: metade do dano a 2 tiles, um quarto mais longe. */
      perdePorDistancia?: boolean }
  | { tipo: 'mente'; maximo: number; atrasoMs: number }
  | { tipo: 'maldicao'; percentualBase: number; resistencias: number }
  | { tipo: 'dreno-mana'; base: number; devolveMs: number }
  | { tipo: 'teleporte'; alcanceTiles: number }
  | { tipo: 'muro'; alcanceTiles: number; duracaoMs: number; objeto: number }
  | { tipo: 'veneno'; alcanceForteTiles: number; limiares: number[]; niveis: number[] }
  | { tipo: 'paralisia'; baseS: number; porMagery: number; fatorResistido: number }
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
  /** Itens (arte, ex.: "0x0F7A") gastos quando a magia sai. */
  reagentes: string[];
}

export type TipoPocao = 'cura' | 'cura-veneno' | 'refresh' | 'forca' | 'agilidade' | 'veneno';

/** Poção (ServUO, versões "Greater"/"Total"). */
export interface DefPocao {
  nome: string;
  tipo: TipoPocao;
  /** Cura: faixa de vida antes do bônus de Alchemy. */
  min?: number;
  max?: number;
  /** Trava entre poções do mesmo grupo (ex.: 10 s nas de cura). */
  travaMs?: number;
  /** Cure: chance (0 a 1) por nível de veneno. */
  chances?: number[];
  /** Força/agilidade: bônus e duração. */
  bonus?: number;
  duracaoMs?: number;
  /** Veneno: nível aplicado em quem bebe. */
  nivel?: number;
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
    poisoning: number; meditation: number; focus: number; alchemy: number;
    swords: number; macing: number; fencing: number; wrestling: number;
    tactics: number; anatomy: number; parry: number; lumberjacking: number;
  };
  resistencias: Record<Elemento, number>;
  fasterCasting: number;
  fasterCastRecovery: number;
  lowerManaCost: number;
}

/** Arma (ServUO, valores de ML). `golpe` é a animação de ataque do humano. */
export interface DefArma {
  nome: string;
  min: number;
  max: number;
  /** Segundos por golpe (MlSpeed). */
  velocidade: number;
  /** 0 = punhos, 1 = uma mão, 2 = duas mãos. */
  maos: number;
  golpe: string;
  somAcerto: string;
  somErro: string;
  /** Machados ganham o bônus de Lumberjacking. */
  machado: boolean;
}

export interface DefArmadura {
  nome: string;
  /** Camada no corpo: peito, pernas, bracos, luvas, gorjal, elmo, robe. */
  camada: string;
  resistencias: Partial<Record<Elemento, number>>;
  bloqueiaMeditacao: boolean;
}

export interface DefEscudo {
  nome: string;
  resistencias: Partial<Record<Elemento, number>>;
}

export interface Equipamento {
  arma: string | null;
  escudo: string | null;
  /** camada -> item */
  armadura: Record<string, string>;
}

export interface Regras {
  modelo: Ficha;
  alcanceMiraTiles: number;
  respawnMs: number;
  manaPorCirculo: number[];
  venenos: DefVeneno[];
  magias: DefMagia[];
  pocoes: Record<string, DefPocao>;
  /** Conteúdo da mochila ao nascer e ao renascer: arte do item -> quantidade. */
  mochilaInicial: Record<string, number>;
  somBeber: string;
  armas: Record<string, DefArma>;
  desarmado: DefArma;
  armaduras: Record<string, DefArmadura>;
  escudos: Record<string, DefEscudo>;
  equipamentoInicial: Equipamento;
  /** Item da mochila que guarda os equipáveis (o baú). */
  itemBau: string;
}

/** parado: boneco de treino · ativo: mago que luta · criatura: animal/monstro que só passeia. */
export type ModoBot = 'parado' | 'ativo' | 'criatura';

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
  stam: number;
  stamMax: number;
  /** Mochila: arte do item -> quantidade. */
  itens: Record<string, number>;
  /** Corpo (só quando morto): mochila e tudo o que estava vestido, para o loot. */
  espolio: Record<string, number>;
  /** Travas de uso (ex.: "cura" das poções, ou o próprio item) -> liberada em (ms). */
  travas: Record<string, number>;
  /** Bônus e penalidades temporários (poções de força/agilidade, Curse). */
  modificadores: Array<{ atributo: 'str' | 'dex' | 'int' | 'resistencias'; valor: number; ateMs: number; origem?: string }>;
  proximaRegenStamMs: number;
  equipamento: Equipamento;
  /** Resistências com a armadura (teto 70). */
  resistencias: Record<Elemento, number>;
  /** Modo de guerra e o alvo do corpo a corpo. */
  guerra: boolean;
  alvoAtaqueId: string | null;
  proximoGolpeMs: number;
  /** Golpe em andamento (para a animação). */
  golpe: { inicioMs: number; fimMs: number; animacao: string } | null;
  /** Magia sendo lançada no alvo (ou tile) já escolhido; o efeito sai no fim (o personagem não anda até lá). */
  cast: { magia: DefMagia; alvoId: string; local?: { x: number; y: number }; inicioMs: number; fimMs: number } | null;
  /** Magia escolhida, esperando o alvo (cursor de mira). */
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
  | { tipo: 'visual'; visual: string; origemId: string; alvoId: string; duracaoMs: number; local?: { x: number; y: number } }
  | { tipo: 'golpe'; origemId: string; alvoId: string; acertou: boolean }
  | { tipo: 'morte'; alvoId: string }
  | { tipo: 'respawn'; alvoId: string };
