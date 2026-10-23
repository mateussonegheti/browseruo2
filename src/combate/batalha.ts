// Batalha contra bots: composição das equipes, contagem inicial e fim. Lógica pura, sem DOM.

export type ModoBatalha = '1x1' | '2x2' | '3x3' | 'ffa';
export type TipoBatalha = 'treino' | 'avera';
export type LadoBatalha = 'A' | 'B';
export type FaseBatalha = 'contagem' | 'luta' | 'fim';

export const CONTAGEM_MS = 5000;
export const MODOS_BATALHA: readonly ModoBatalha[] = ['1x1', '2x2', '3x3', 'ffa'];

export interface Composicao {
  /** Bots na equipe do jogador. */
  aliados: number;
  /** Bots contra o jogador (cada um em equipe própria no FFA). */
  inimigos: number;
  ffa: boolean;
}

export function composicao(modo: ModoBatalha): Composicao {
  switch (modo) {
    case '1x1': return { aliados: 0, inimigos: 1, ffa: false };
    case '2x2': return { aliados: 1, inimigos: 2, ffa: false };
    case '3x3': return { aliados: 2, inimigos: 3, ffa: false };
    case 'ffa': return { aliados: 0, inimigos: 3, ffa: true };
  }
}

export interface Participante {
  id: string;
  equipe: string;
}

/** Monta os participantes: o jogador na equipe do seu lado e os bots conforme o modo. */
export function montarParticipantes(
  modo: ModoBatalha, lado: LadoBatalha, idJogador: string, idBot: (n: number) => string,
): Participante[] {
  const { aliados, inimigos, ffa } = composicao(modo);
  const outro: LadoBatalha = lado === 'A' ? 'B' : 'A';
  const lista: Participante[] = [{ id: idJogador, equipe: lado }];
  let n = 0;
  for (let i = 0; i < aliados; i++) lista.push({ id: idBot(n++), equipe: lado });
  for (let i = 0; i < inimigos; i++) lista.push({ id: idBot(n++), equipe: ffa ? `ffa-${i}` : outro });
  return lista;
}

export class Batalha {
  private _fase: FaseBatalha = 'contagem';
  private _vencedora: string | null = null;
  private readonly equipes = new Map<string, string>();

  constructor(
    readonly modo: ModoBatalha,
    readonly tipo: TipoBatalha,
    readonly lado: LadoBatalha,
    readonly idJogador: string,
    readonly participantes: readonly Participante[],
    readonly inicioMs: number,
  ) {
    for (const p of participantes) this.equipes.set(p.id, p.equipe);
  }

  get fase(): FaseBatalha { return this._fase; }
  /** Equipe que sobrou (null = todos morreram ou ainda lutando). */
  get vencedora(): string | null { return this._vencedora; }
  get jogadorVenceu(): boolean { return this._fase === 'fim' && this._vencedora === this.equipeDe(this.idJogador); }

  equipeDe(id: string): string | undefined { return this.equipes.get(id); }
  aliados(a: string, b: string): boolean {
    const ea = this.equipes.get(a);
    return ea !== undefined && ea === this.equipes.get(b);
  }

  /** Segundos que faltam na contagem (0 depois dela). */
  segundosRestantes(agora: number): number {
    return Math.max(0, Math.ceil((this.inicioMs + CONTAGEM_MS - agora) / 1000));
  }

  /** Avança a fase. `vivo` diz se o participante ainda está de pé. Retorna a fase atual. */
  atualizar(agora: number, vivo: (id: string) => boolean): FaseBatalha {
    if (this._fase === 'contagem' && agora >= this.inicioMs + CONTAGEM_MS) this._fase = 'luta';
    if (this._fase === 'luta') {
      const vivas = new Set(this.participantes.filter((p) => vivo(p.id)).map((p) => p.equipe));
      if (vivas.size <= 1) {
        this._fase = 'fim';
        this._vencedora = vivas.size === 1 ? [...vivas][0]! : null;
      }
    }
    return this._fase;
  }

  /** Inimigo vivo mais próximo de `id` (outra equipe). */
  inimigoMaisProximo<T extends { id: string; mov: { x: number; y: number } }>(
    id: string, candidatos: readonly T[],
  ): T | undefined {
    const eu = candidatos.find((c) => c.id === id);
    if (!eu) return undefined;
    let melhor: T | undefined;
    let dist = Infinity;
    for (const c of candidatos) {
      if (c.id === id || this.aliados(id, c.id)) continue;
      const d = Math.max(Math.abs(c.mov.x - eu.mov.x), Math.abs(c.mov.y - eu.mov.y));
      if (d < dist) { dist = d; melhor = c; }
    }
    return melhor;
  }
}
