import type { EstadoJogador } from '../jogo/jogador';
import {
  chanceCure, chanceResistir, curaGreaterHeal, curaHeal, custoMana, danoMagia, danoVeneno, distanciaTiles,
  duracaoParalisiaMs, intervaloRegenManaMs, intervaloRegenVidaMs, manaMaxima, nivelVeneno, pontosReflexo,
  recuperacaoMs, tempoCastMs, vidaMaxima, type Aleatorio,
} from './formulas';
import type { Combatente, DefMagia, EventoCombate, Ficha, ModoBot, Regras } from './tipos';

export interface OpcoesMotor {
  aleatorio?: Aleatorio;
  /** Linha de visão entre dois tiles (muros bloqueiam). */
  temVisao: (a: { x: number; y: number }, b: { x: number; y: number }) => boolean;
  /** Onde o combatente renasce. */
  posicaoRespawn: (c: Combatente) => { x: number; y: number };
}

interface Agendado {
  quandoMs: number;
  executar: (agora: number) => void;
}

const COR_MAGIA = '#7fb7ff';
const COR_SISTEMA = '#e6e8ec';
const COR_VENENO = '#7be27b';
const COR_ALERTA = '#ffb36b';

/**
 * Motor de combate de magia, orientado a tempo: quem chama informa `agora` (ms).
 * Não conhece DOM nem canvas; a interface lê os combatentes e consome os eventos.
 */
export class MotorCombate {
  private readonly combatentes = new Map<string, Combatente>();
  private readonly agendados: Agendado[] = [];
  private eventos: EventoCombate[] = [];
  private readonly rng: Aleatorio;
  private readonly magiasPorId: Map<string, DefMagia>;

  constructor(readonly regras: Regras, private readonly opcoes: OpcoesMotor) {
    this.rng = opcoes.aleatorio ?? Math.random;
    this.magiasPorId = new Map(regras.magias.map((m) => [m.id, m]));
  }

  // ---------------------------------------------------------------- combatentes

  criar(id: string, nome: string, mov: EstadoJogador, agora: number, bot: ModoBot | null = null): Combatente {
    const ficha: Ficha = structuredClone(this.regras.modelo);
    const c: Combatente = {
      id, nome, mov, ficha,
      vida: vidaMaxima(ficha), vidaMax: vidaMaxima(ficha),
      mana: manaMaxima(ficha), manaMax: manaMaxima(ficha),
      cast: null, mira: null, proximaMagiaMs: 0, veneno: null, paralisadoAteMs: 0, reflexo: 0,
      morto: false, respawnEmMs: 0,
      proximaRegenVidaMs: agora + intervaloRegenVidaMs(),
      proximaRegenManaMs: agora + intervaloRegenManaMs(ficha),
      ultimoAlvoId: null,
      bot: bot ? { modo: bot, proximaDecisaoMs: agora + 800 } : null,
    };
    this.combatentes.set(id, c);
    return c;
  }

  remover(id: string): void {
    this.combatentes.delete(id);
    for (const c of this.combatentes.values()) if (c.ultimoAlvoId === id) c.ultimoAlvoId = null;
  }

  obter(id: string): Combatente | undefined {
    return this.combatentes.get(id);
  }

  listar(): Combatente[] {
    return [...this.combatentes.values()];
  }

  magia(id: string): DefMagia | undefined {
    return this.magiasPorId.get(id);
  }

  custo(c: Combatente, m: DefMagia): number {
    return custoMana(this.regras.manaPorCirculo, m.circulo, c.ficha);
  }

  /** O personagem pode andar? (não durante o cast, paralisado nem morto) */
  podeMover(id: string, agora: number): boolean {
    const c = this.combatentes.get(id);
    if (!c) return true;
    return !c.morto && !c.cast && agora >= c.paralisadoAteMs;
  }

  paralisado(c: Combatente, agora: number): boolean {
    return agora < c.paralisadoAteMs;
  }

  /** Eventos gerados desde a última chamada (dano, sons, textos…). */
  coletarEventos(): EventoCombate[] {
    const e = this.eventos;
    this.eventos = [];
    return e;
  }

  // ---------------------------------------------------------------- ações

  /**
   * Escolhe uma magia (estilo Sphere/DMS: a mira vem primeiro). Magias de alvo abrem o cursor de mira
   * na hora; magias em si mesmo (Magic Reflection) já começam o cast. Retorna o erro, ou null.
   */
  iniciarCast(id: string, magiaId: string, agora: number): string | null {
    const c = this.combatentes.get(id);
    const m = this.magiasPorId.get(magiaId);
    if (!c || !m) return 'Magia desconhecida.';
    const erro = this.erroAoCastar(c, m, agora);
    if (erro) {
      this.avisar(c, erro);
      return erro;
    }
    if (m.alvo === 'proprio') {
      c.mira = null;
      this.comecarCast(c, m, c.id, agora);
    } else {
      c.mira = m; // uma magia nova substitui o cursor de mira anterior
    }
    return null;
  }

  /** Escolhe o alvo da magia na mira e começa o cast. Retorna o erro, ou null se começou. */
  escolherAlvo(id: string, alvoId: string, agora: number): string | null {
    const c = this.combatentes.get(id);
    const alvo = this.combatentes.get(alvoId);
    const m = c?.mira;
    if (!c || !m) return 'Nenhuma magia na mira.';
    const erro = this.erroAoCastar(c, m, agora) ?? this.erroAlvo(c, alvo, m, agora);
    if (erro) {
      // Alvo inválido encerra a mira, como no cliente.
      c.mira = null;
      this.avisar(c, erro);
      return erro;
    }
    c.mira = null;
    c.ultimoAlvoId = alvo!.id === c.id ? c.ultimoAlvoId : alvo!.id;
    this.comecarCast(c, m, alvo!.id, agora);
    return null;
  }

  cancelarMira(id: string): void {
    const c = this.combatentes.get(id);
    if (c?.mira) {
      c.mira = null;
      this.avisar(c, 'Mira cancelada.');
    }
  }

  // ---------------------------------------------------------------- tempo

  atualizar(agora: number): void {
    // Efeitos com atraso (Energy Bolt, Flamestrike, Explosion)
    this.agendados.sort((a, b) => a.quandoMs - b.quandoMs);
    while (this.agendados.length && this.agendados[0]!.quandoMs <= agora) this.agendados.shift()!.executar(agora);

    for (const c of this.combatentes.values()) {
      if (c.morto) {
        if (agora >= c.respawnEmMs) this.renascer(c, agora);
        continue;
      }
      this.concluirCast(c, agora);
      this.tickVeneno(c, agora);
      this.regenerar(c, agora);
    }
  }

  // ---------------------------------------------------------------- regras internas

  private erroAoCastar(c: Combatente, m: DefMagia, agora: number): string | null {
    if (c.morto) return 'Você está morto.';
    if (c.cast) return 'Você já está lançando uma magia.';
    if (agora < c.proximaMagiaMs) return 'Você ainda não pode lançar outra magia.';
    if (this.paralisado(c, agora)) return 'Você não pode fazer isso paralisado.';
    if (c.mana < this.custo(c, m)) return `Mana insuficiente (precisa de ${this.custo(c, m)}).`;
    if (m.efeito.tipo === 'reflexo' && c.reflexo > 0) return 'Esta magia já está em efeito.';
    return null;
  }

  private erroAlvo(c: Combatente, alvo: Combatente | undefined, m: DefMagia, agora: number): string | null {
    if (!alvo || alvo.morto) return 'Alvo inválido.';
    if (this.paralisado(c, agora)) return 'Você não pode fazer isso paralisado.';
    if (distanciaTiles(c.mov, alvo.mov) > this.regras.alcanceMiraTiles) return 'O alvo está longe demais.';
    if (alvo.id !== c.id && !this.opcoes.temVisao(c.mov, alvo.mov)) return 'O alvo não pode ser visto.';
    if (c.mana < this.custo(c, m)) return `Mana insuficiente (precisa de ${this.custo(c, m)}).`;
    return null;
  }

  private comecarCast(c: Combatente, m: DefMagia, alvoId: string, agora: number): void {
    c.cast = { magia: m, alvoId, inicioMs: agora, fimMs: agora + tempoCastMs(m.circulo, c.ficha) };
    c.mov.movimento = null;
    this.eventos.push({ tipo: 'texto', alvoId: c.id, texto: m.palavras, cor: COR_MAGIA });
  }

  /** Fim do tempo de cast: confere o alvo de novo e só então gasta a mana e aplica o efeito. */
  private concluirCast(c: Combatente, agora: number): void {
    if (!c.cast || agora < c.cast.fimMs) return;
    const { magia: m, alvoId } = c.cast;
    c.cast = null;
    c.proximaMagiaMs = agora + recuperacaoMs(c.ficha);
    const alvo = this.combatentes.get(alvoId);
    const envenenado = m.efeito.tipo === 'cura' && alvo?.veneno;
    const erro = this.erroAlvo(c, alvo, m, agora) ??
      (envenenado ? (alvo === c ? 'Você não pode se curar envenenado.' : 'O alvo está envenenado.') : null);
    if (erro) {
      this.avisar(c, `${erro} A magia falhou.`);
      this.eventos.push({ tipo: 'texto', alvoId: c.id, texto: '*fizzle*', cor: COR_SISTEMA });
      return;
    }
    this.lancar(c, alvo!, m, agora);
  }

  /** Gasta a mana e aplica o efeito (equivalente a CheckSequence + Target no ServUO). */
  private lancar(c: Combatente, alvoOriginal: Combatente, m: DefMagia, agora: number): void {
    c.mana -= this.custo(c, m);
    const ef = m.efeito;
    switch (ef.tipo) {
      case 'dano': {
        const { origem, destino } = this.checarReflexo(m.circulo, c, alvoOriginal);
        this.eventos.push({ tipo: 'som', som: m.som, alvoId: destino.id });
        this.eventos.push({ tipo: 'visual', visual: ef.visual, origemId: origem.id, alvoId: destino.id, duracaoMs: Math.max(500, ef.atrasoMs) });
        const aplicar = (quando: number) => {
          if (destino.morto) return;
          this.causarDano(destino, danoMagia(this.rng, ef.bonus, ef.dados, ef.lados, c.ficha, destino.ficha, ef.elemento), c.id, quando);
        };
        if (ef.atrasoMs > 0) this.agendados.push({ quandoMs: agora + ef.atrasoMs, executar: aplicar });
        else aplicar(agora);
        break;
      }
      case 'veneno': {
        const { destino } = this.checarReflexo(m.circulo, c, alvoOriginal);
        this.eventos.push({ tipo: 'som', som: m.som, alvoId: destino.id });
        this.eventos.push({ tipo: 'visual', visual: 'veneno', origemId: c.id, alvoId: destino.id, duracaoMs: 600 });
        this.interromper(destino);
        destino.paralisadoAteMs = 0;
        if (this.rng() < chanceResistir(c.ficha, destino.ficha, m.circulo)) {
          this.eventos.push({ tipo: 'texto', alvoId: destino.id, texto: '*resiste*', cor: COR_SISTEMA });
          break;
        }
        const nivel = nivelVeneno(c.ficha, distanciaTiles(c.mov, destino.mov), ef.alcanceForteTiles, ef.limiares, ef.niveis);
        this.envenenar(destino, nivel, agora);
        break;
      }
      case 'paralisia': {
        const { destino } = this.checarReflexo(m.circulo, c, alvoOriginal);
        const resistiu = this.rng() < chanceResistir(c.ficha, destino.ficha, m.circulo);
        const ms = duracaoParalisiaMs(c.ficha, ef, resistiu);
        destino.paralisadoAteMs = Math.max(destino.paralisadoAteMs, agora + ms);
        if (ms > 0) destino.mov.movimento = null;
        this.eventos.push({ tipo: 'som', som: m.som, alvoId: destino.id });
        this.eventos.push({ tipo: 'visual', visual: 'paralisia', origemId: c.id, alvoId: destino.id, duracaoMs: Math.max(600, ms) });
        this.interromper(destino);
        const texto = `*paralisado ${Math.round(ms / 1000)}s${resistiu ? ' (resistiu)' : ''}*`;
        this.eventos.push({ tipo: 'texto', alvoId: destino.id, texto, cor: COR_ALERTA });
        break;
      }
      case 'cura': {
        const valor = ef.formula === 'heal'
          ? curaHeal(this.rng, c.ficha, alvoOriginal !== c)
          : curaGreaterHeal(this.rng, c.ficha);
        this.eventos.push({ tipo: 'som', som: m.som, alvoId: alvoOriginal.id });
        this.eventos.push({ tipo: 'visual', visual: 'cura', origemId: c.id, alvoId: alvoOriginal.id, duracaoMs: 600 });
        this.curar(alvoOriginal, valor);
        break;
      }
      case 'cura-veneno': {
        const alvo = alvoOriginal;
        this.eventos.push({ tipo: 'som', som: m.som, alvoId: alvo.id });
        this.eventos.push({ tipo: 'visual', visual: 'cura-veneno', origemId: c.id, alvoId: alvo.id, duracaoMs: 600 });
        if (!alvo.veneno) break;
        if (chanceCure(c.ficha, alvo.veneno.nivel) > Math.floor(this.rng() * 100)) {
          alvo.veneno = null;
          this.eventos.push({ tipo: 'texto', alvoId: alvo.id, texto: '*curado do veneno*', cor: COR_VENENO });
        } else {
          this.avisar(c, 'Você falhou em curar o veneno.');
        }
        break;
      }
      case 'reflexo': {
        c.reflexo = pontosReflexo(c.ficha);
        this.eventos.push({ tipo: 'som', som: m.som, alvoId: c.id });
        this.eventos.push({ tipo: 'visual', visual: 'reflexo', origemId: c.id, alvoId: c.id, duracaoMs: 800 });
        break;
      }
    }
  }

  /**
   * Magic Reflect clássico (SpellHelper.CheckReflect): cada magia recebida gasta o círculo dela.
   * Enquanto o saldo não fica negativo, a magia volta para quem lançou.
   */
  private checarReflexo(circulo: number, caster: Combatente, alvo: Combatente): { origem: Combatente; destino: Combatente } {
    if (alvo.reflexo <= 0 || alvo === caster) return { origem: caster, destino: alvo };
    alvo.reflexo -= circulo;
    const refletiu = alvo.reflexo >= 0;
    if (alvo.reflexo <= 0) {
      alvo.reflexo = 0;
      const somFim = this.regras.magias.find((m) => m.efeito.tipo === 'reflexo')?.efeito;
      if (somFim?.tipo === 'reflexo') this.eventos.push({ tipo: 'som', som: somFim.somFim, alvoId: alvo.id });
    }
    if (!refletiu) return { origem: caster, destino: alvo };
    this.eventos.push({ tipo: 'visual', visual: 'refletido', origemId: alvo.id, alvoId: alvo.id, duracaoMs: 600 });
    this.eventos.push({ tipo: 'texto', alvoId: alvo.id, texto: '*reflete*', cor: COR_MAGIA });
    return { origem: alvo, destino: caster };
  }

  private causarDano(alvo: Combatente, valor: number, origemId: string | null, agora: number): void {
    if (alvo.morto || valor <= 0) return;
    alvo.vida = Math.max(0, alvo.vida - valor);
    this.eventos.push({ tipo: 'dano', alvoId: alvo.id, valor, origemId });
    this.interromper(alvo);
    alvo.paralisadoAteMs = 0; // qualquer dano quebra a paralisia (Mobile.Damage)
    if (alvo.vida <= 0) this.morrer(alvo, agora);
  }

  private interromper(c: Combatente): void {
    if (!c.cast) return;
    c.cast = null;
    this.avisar(c, 'Sua concentração foi perturbada e a magia falhou.');
    this.eventos.push({ tipo: 'texto', alvoId: c.id, texto: '*fizzle*', cor: COR_SISTEMA });
  }

  private curar(alvo: Combatente, valor: number): void {
    const real = Math.min(valor, alvo.vidaMax - alvo.vida);
    alvo.vida += real;
    this.eventos.push({ tipo: 'cura', alvoId: alvo.id, valor: real });
  }

  private envenenar(alvo: Combatente, nivel: number, agora: number): void {
    if (alvo.veneno && alvo.veneno.nivel >= nivel) {
      this.eventos.push({ tipo: 'texto', alvoId: alvo.id, texto: '*já envenenado*', cor: COR_VENENO });
      return;
    }
    const v = this.regras.venenos[nivel]!;
    alvo.veneno = { nivel, proximoTickMs: agora + v.primeiroMs, ticksFeitos: 0 };
    this.eventos.push({ tipo: 'texto', alvoId: alvo.id, texto: `*envenenado (${v.nome})*`, cor: COR_VENENO });
  }

  private tickVeneno(c: Combatente, agora: number): void {
    const p = c.veneno;
    if (!p || agora < p.proximoTickMs) return;
    const v = this.regras.venenos[p.nivel]!;
    if (p.ticksFeitos >= v.ticks) {
      c.veneno = null;
      this.avisar(c, 'O veneno passou.');
      return;
    }
    p.ticksFeitos++;
    p.proximoTickMs += v.intervaloMs;
    this.causarDano(c, danoVeneno(v, c.vida), null, agora);
  }

  private regenerar(c: Combatente, agora: number): void {
    const iVida = intervaloRegenVidaMs();
    while (agora >= c.proximaRegenVidaMs) {
      if (!c.veneno && c.vida < c.vidaMax) c.vida++;
      c.proximaRegenVidaMs += iVida;
    }
    const iMana = intervaloRegenManaMs(c.ficha);
    while (agora >= c.proximaRegenManaMs) {
      if (c.mana < c.manaMax) c.mana++;
      c.proximaRegenManaMs += iMana;
    }
  }

  private morrer(c: Combatente, agora: number): void {
    c.morto = true;
    c.cast = null;
    c.mira = null;
    c.veneno = null;
    c.paralisadoAteMs = 0;
    c.reflexo = 0;
    c.mov.movimento = null;
    c.respawnEmMs = agora + this.regras.respawnMs;
    this.eventos.push({ tipo: 'morte', alvoId: c.id });
  }

  private renascer(c: Combatente, agora: number): void {
    const p = this.opcoes.posicaoRespawn(c);
    c.mov.x = p.x;
    c.mov.y = p.y;
    c.mov.movimento = null;
    c.morto = false;
    c.vida = c.vidaMax;
    c.mana = c.manaMax;
    c.proximaMagiaMs = 0;
    c.proximaRegenVidaMs = agora + intervaloRegenVidaMs();
    c.proximaRegenManaMs = agora + intervaloRegenManaMs(c.ficha);
    this.eventos.push({ tipo: 'respawn', alvoId: c.id });
  }

  private avisar(c: Combatente, texto: string): void {
    this.eventos.push({ tipo: 'aviso', paraId: c.id, texto });
  }
}
