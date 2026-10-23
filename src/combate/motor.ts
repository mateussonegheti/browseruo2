import type { EstadoJogador } from '../jogo/jogador';
import { DESLOCAMENTO } from '../nucleo/direcoes';
import type { Direcao } from '../mundo/tipos';
import {
  atrasoGolpeMs, chanceAcerto, chanceBloqueio, danoGolpe,
  chanceCure, chanceResistir, curaGreaterHeal, curaHeal, custoMana, danoMagia, danoVeneno, distanciaTiles,
  duracaoParalisiaMs, escalaPocao, estaminaMaxima, inteiro, intervaloRegenManaMs, intervaloRegenStamMs,
  intervaloRegenVidaMs, manaMaxima, nivelVeneno, pontosReflexo, recuperacaoMs, tempoCastMs, vidaMaxima,
  type Aleatorio,
} from './formulas';
import type { Combatente, DefArma, DefMagia, Elemento, EventoCombate, Ficha, ModoBot, Regras } from './tipos';

const ELEMENTOS: Elemento[] = ['fisica', 'fogo', 'frio', 'veneno', 'energia'];
/** Quanto da animação de golpe aparece (o resto do tempo é a espera até o próximo golpe). */
const DURACAO_ANIMACAO_GOLPE_MS = 650;

export interface OpcoesMotor {
  aleatorio?: Aleatorio;
  /** Linha de visão entre dois tiles (muros bloqueiam). */
  temVisao: (a: { x: number; y: number }, b: { x: number; y: number }) => boolean;
  /** Onde o combatente renasce. */
  posicaoRespawn: (c: Combatente) => { x: number; y: number };
  /** Tile onde dá para ficar (Teleport). */
  tileLivre?: (x: number, y: number) => boolean;
  /** Ergue um muro temporário (Wall of Stone). */
  criarMuro?: (tiles: Array<{ x: number; y: number }>, objeto: number, ateMs: number) => void;
}

interface Agendado {
  quandoMs: number;
  executar: (agora: number) => void;
}

/** Distância máxima (em tiles) para abrir um corpo, como no UO. */
const ALCANCE_LOOT_TILES = 2;
const COR_MAGIA = '#7fb7ff';
const COR_FALA_CAST = '#9a9a9a';
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
      stam: estaminaMaxima(ficha), stamMax: estaminaMaxima(ficha),
      itens: {}, travas: {}, modificadores: [],
      proximaRegenStamMs: agora + intervaloRegenStamMs(ficha),
      equipamento: structuredClone(this.regras.equipamentoInicial),
      resistencias: { ...ficha.resistencias },
      guerra: false, alvoAtaqueId: null, proximoGolpeMs: 0, golpe: null,
      espolio: {}, cast: null, mira: null, proximaMagiaMs: 0, veneno: null, paralisadoAteMs: 0, reflexo: 0,
      morto: false, respawnEmMs: 0,
      proximaRegenVidaMs: agora + intervaloRegenVidaMs(),
      proximaRegenManaMs: agora + intervaloRegenManaMs(ficha),
      ultimoAlvoId: null,
      bot: bot ? { modo: bot, proximaDecisaoMs: agora + 800 } : null,
    };
    c.itens = this.mochilaSemEquipados(c);
    this.recalcularEquipamento(c);
    this.combatentes.set(id, c);
    return c;
  }

  // ---------------------------------------------------------------- equipamento e corpo a corpo

  /** Arma na mão (ou os punhos). */
  armaDe(c: Combatente): DefArma {
    return (c.equipamento.arma && this.regras.armas[c.equipamento.arma]) || this.regras.desarmado;
  }

  /** Veste ou empunha um item da mochila; o que estava no lugar volta para a mochila. */
  equipar(id: string, item: string): string | null {
    const c = this.combatentes.get(id);
    if (!c) return 'Personagem inválido.';
    if ((c.itens[item] ?? 0) < 1) return 'Esse item não está na mochila.';
    if (c.morto) return 'Você está morto.';
    const eq = c.equipamento;
    const guardar = (it: string | null | undefined) => { if (it) c.itens[it] = (c.itens[it] ?? 0) + 1; };
    const arma = this.regras.armas[item];
    const armadura = this.regras.armaduras[item];
    if (arma) {
      guardar(eq.arma);
      eq.arma = item;
      // Arma de duas mãos não deixa usar escudo
      if (arma.maos === 2 && eq.escudo) {
        guardar(eq.escudo);
        eq.escudo = null;
      }
    } else if (this.regras.escudos[item]) {
      if (eq.arma && this.regras.armas[eq.arma]?.maos === 2) {
        guardar(eq.arma);
        eq.arma = null;
      }
      guardar(eq.escudo);
      eq.escudo = item;
    } else if (armadura) {
      guardar(eq.armadura[armadura.camada]);
      eq.armadura[armadura.camada] = item;
    } else {
      return 'Isso não pode ser equipado.';
    }
    c.itens[item] = (c.itens[item] ?? 0) - 1;
    this.recalcularEquipamento(c);
    return null;
  }

  /** Tira um item equipado e guarda na mochila. */
  desequipar(id: string, item: string): string | null {
    const c = this.combatentes.get(id);
    if (!c) return 'Personagem inválido.';
    const eq = c.equipamento;
    if (eq.arma === item) eq.arma = null;
    else if (eq.escudo === item) eq.escudo = null;
    else {
      const camada = Object.keys(eq.armadura).find((k) => eq.armadura[k] === item);
      if (!camada) return 'Esse item não está equipado.';
      delete eq.armadura[camada];
    }
    c.itens[item] = (c.itens[item] ?? 0) + 1;
    this.recalcularEquipamento(c);
    return null;
  }

  /** Itens equipados, na ordem: armaduras, escudo, arma. */
  equipados(c: Combatente): string[] {
    const eq = c.equipamento;
    return [...Object.values(eq.armadura), ...(eq.escudo ? [eq.escudo] : []), ...(eq.arma ? [eq.arma] : [])];
  }

  /** Liga/desliga o modo de guerra (Tab no cliente). Em paz, para de atacar. */
  alternarGuerra(id: string, guerra?: boolean): void {
    const c = this.combatentes.get(id);
    if (!c) return;
    c.guerra = guerra ?? !c.guerra;
    if (!c.guerra) c.alvoAtaqueId = null;
  }

  /** Entra em guerra e passa a golpear o alvo sempre que ele estiver ao lado. */
  atacar(id: string, alvoId: string): string | null {
    const c = this.combatentes.get(id);
    const alvo = this.combatentes.get(alvoId);
    if (!c || !alvo || alvo.morto || alvo === c) return 'Alvo inválido.';
    c.guerra = true;
    c.alvoAtaqueId = alvoId;
    c.ultimoAlvoId = alvoId;
    return null;
  }

  /** Devolve ao combate um combatente removido (ex.: a montaria quando o cavaleiro desmonta). */
  adicionar(c: Combatente): void {
    this.combatentes.set(c.id, c);
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

  /** O personagem pode andar? (não paralisado nem morto; pode andar durante o cast) */
  podeMover(id: string, agora: number): boolean {
    const c = this.combatentes.get(id);
    if (!c) return true;
    return !c.morto && agora >= c.paralisadoAteMs;
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

  /** Escolhe o tile da magia na mira (Teleport, Wall of Stone) e começa o cast. */
  escolherLocal(id: string, x: number, y: number, agora: number): string | null {
    const c = this.combatentes.get(id);
    const m = c?.mira;
    if (!c || !m || m.alvo !== 'local') return 'Nenhuma magia de local na mira.';
    const erro = this.erroAoCastar(c, m, agora) ?? this.erroLocal(c, m, x, y);
    if (erro) {
      c.mira = null;
      this.avisar(c, erro);
      return erro;
    }
    c.mira = null;
    this.comecarCast(c, m, c.id, agora, { x, y });
    return null;
  }

  /** Escolhe o alvo da magia na mira e começa o cast. Retorna o erro, ou null se começou. */
  escolherAlvo(id: string, alvoId: string, agora: number): string | null {
    const c = this.combatentes.get(id);
    const alvo = this.combatentes.get(alvoId);
    const m = c?.mira;
    if (!c || !m) return 'Nenhuma magia na mira.';
    if (m.alvo === 'local') return this.escolherLocal(id, alvo?.mov.x ?? -1, alvo?.mov.y ?? -1, agora);
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

  /** Itens do corpo de quem morreu que `id` consegue ver; null se não houver corpo ao alcance. */
  itensDoCorpo(id: string, corpoId: string): Record<string, number> | null {
    const c = this.combatentes.get(id);
    const corpo = this.combatentes.get(corpoId);
    if (!c || c.morto || !corpo || !corpo.morto || corpo === c) return null;
    if (distanciaTiles(c.mov, corpo.mov) > ALCANCE_LOOT_TILES) return null;
    return corpo.espolio;
  }

  /** Pega o item (a pilha toda) do corpo e guarda na mochila. Retorna o erro, ou null se pegou. */
  lootar(id: string, corpoId: string, item: string): string | null {
    const c = this.combatentes.get(id);
    const itens = this.itensDoCorpo(id, corpoId);
    if (!c) return 'Personagem inexistente.';
    if (!itens) return 'O corpo está longe demais.';
    const qtd = itens[item] ?? 0;
    if (qtd < 1) return 'Esse item não está mais no corpo.';
    delete itens[item];
    c.itens[item] = (c.itens[item] ?? 0) + qtd;
    return null;
  }

  /** Usa (bebe) um item da mochila. Retorna a mensagem de erro, ou null se usou. */
  usarItem(id: string, item: string, agora: number): string | null {
    const c = this.combatentes.get(id);
    const p = this.regras.pocoes[item];
    if (!c || !p) return 'Isso não pode ser usado.';
    const erro = this.erroPocao(c, item, p, agora);
    if (erro) {
      this.avisar(c, erro);
      return erro;
    }
    c.travas[item] = agora + 500; // BasePotion: 0,5 s entre usos do mesmo tipo
    c.itens[item] = (c.itens[item] ?? 0) - 1;
    this.eventos.push({ tipo: 'som', som: this.regras.somBeber, alvoId: c.id });
    switch (p.tipo) {
      case 'cura': {
        c.travas['pocao-cura'] = agora + (p.travaMs ?? 10000);
        const valor = inteiro(this.rng, escalaPocao(c.ficha, p.min ?? 0), escalaPocao(c.ficha, p.max ?? 0));
        this.curar(c, valor);
        break;
      }
      case 'cura-veneno': {
        this.eventos.push({ tipo: 'visual', visual: 'cura-veneno', origemId: c.id, alvoId: c.id, duracaoMs: 600 });
        if (this.rng() < (p.chances?.[c.veneno!.nivel] ?? 0)) {
          c.veneno = null;
          this.eventos.push({ tipo: 'texto', alvoId: c.id, texto: '*curado do veneno*', cor: COR_VENENO });
        } else {
          this.avisar(c, 'A poção não curou o veneno.');
        }
        break;
      }
      case 'refresh':
        c.stam = c.stamMax;
        break;
      case 'forca':
      case 'agilidade':
        c.modificadores.push({ atributo: p.tipo === 'forca' ? 'str' : 'dex', valor: p.bonus ?? 0, ateMs: agora + (p.duracaoMs ?? 0) });
        this.recalcularMaximos(c);
        break;
      case 'veneno':
        this.envenenar(c, p.nivel ?? 2, agora);
        break;
    }
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
      if (c.modificadores.some((m) => agora >= m.ateMs)) {
        c.modificadores = c.modificadores.filter((m) => agora < m.ateMs);
        this.recalcularMaximos(c);
        this.recalcularEquipamento(c);
      }
      this.concluirCast(c, agora);
      this.processarGolpe(c, agora);
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
    if (m.reagentes.some((r) => (c.itens[r] ?? 0) < 1)) return 'Você não tem reagentes suficientes.';
    return null;
  }

  private erroPocao(c: Combatente, item: string, p: { tipo: string; bonus?: number }, agora: number): string | null {
    if (c.morto) return 'Você está morto.';
    // BasePotion.HasFreeHand: arma de duas mãos, ou arma + escudo, ocupa as duas mãos
    const arma = c.equipamento.arma ? this.regras.armas[c.equipamento.arma] : undefined;
    if (arma?.maos === 2 || (arma && c.equipamento.escudo)) return 'Você precisa de uma mão livre para beber.';
    if ((c.itens[item] ?? 0) < 1) return 'Você não tem mais disso.';
    if (agora < (c.travas[item] ?? 0)) return 'Você precisa esperar para fazer outra ação.';
    switch (p.tipo) {
      case 'cura':
        if (c.vida >= c.vidaMax) return 'Você já está com a vida cheia.';
        if (c.veneno) return 'Você não pode se curar no seu estado atual.';
        if (agora < (c.travas['pocao-cura'] ?? 0)) return 'Você precisa esperar 10 segundos para outra poção de cura.';
        return null;
      case 'cura-veneno':
        return c.veneno ? null : 'Você não está envenenado.';
      case 'refresh':
        return c.stam < c.stamMax ? null : 'Você já está com a estamina cheia.';
      case 'forca':
      case 'agilidade': {
        const atributo = p.tipo === 'forca' ? 'str' : 'dex';
        return c.modificadores.some((m) => m.atributo === atributo) ? 'Você já está sob um efeito parecido.' : null;
      }
      default:
        return null;
    }
  }

  /** Teleport e Wall of Stone, no fim do cast. */
  private lancarLocal(c: Combatente, m: DefMagia, local: { x: number; y: number }, agora: number): void {
    c.mana -= this.custo(c, m);
    for (const r of m.reagentes) c.itens[r] = (c.itens[r] ?? 0) - 1;
    const ef = m.efeito;
    this.eventos.push({ tipo: 'som', som: m.som, alvoId: c.id });
    if (ef.tipo === 'teleporte') {
      this.eventos.push({ tipo: 'visual', visual: 'teleporte', origemId: c.id, alvoId: c.id, duracaoMs: 700, local: { x: c.mov.x, y: c.mov.y } });
      c.mov.x = local.x;
      c.mov.y = local.y;
      c.mov.movimento = null;
      this.eventos.push({ tipo: 'visual', visual: 'teleporte', origemId: c.id, alvoId: c.id, duracaoMs: 700 });
    } else if (ef.tipo === 'muro') {
      // WallOfStone: 3 peças atravessadas na linha entre quem lança e o alvo
      const dx = c.mov.x - local.x;
      const dy = c.mov.y - local.y;
      const rx = (dx - dy) * 44;
      const ry = (dx + dy) * 44;
      const lesteOeste = (rx >= 0 && ry < 0) || (rx < 0 && ry >= 0);
      const tiles = [-1, 0, 1]
        .map((i) => (lesteOeste ? { x: local.x + i, y: local.y } : { x: local.x, y: local.y + i }))
        .filter((t) => !this.listar().some((o) => !o.morto && o.mov.x === t.x && o.mov.y === t.y));
      this.opcoes.criarMuro?.(tiles, ef.objeto, agora + ef.duracaoMs);
    }
  }

  /** Resistências com armadura, escudo e Curse (teto 70). */
  private recalcularEquipamento(c: Combatente): void {
    const r: Record<Elemento, number> = { ...c.ficha.resistencias };
    for (const item of this.equipados(c)) {
      const def = this.regras.armaduras[item] ?? this.regras.escudos[item];
      for (const el of ELEMENTOS) r[el] += def?.resistencias[el] ?? 0;
    }
    // Curse: −10 nas resistências elementais (a física não muda)
    const maldicao = c.modificadores.filter((md) => md.atributo === 'resistencias').reduce((t, md) => t + md.valor, 0);
    for (const el of ELEMENTOS) r[el] = Math.max(0, Math.min(70, r[el] + (el === 'fisica' ? 0 : maldicao)));
    c.resistencias = r;
  }

  private bloqueiaMeditacao(c: Combatente): boolean {
    return Object.values(c.equipamento.armadura).some((it) => this.regras.armaduras[it]?.bloqueiaMeditacao);
  }

  /** O que entra na mochila: o conteúdo inicial menos o que já está equipado. */
  private mochilaSemEquipados(c: Combatente): Record<string, number> {
    const itens = { ...this.regras.mochilaInicial };
    for (const it of this.equipados(c)) if (itens[it]) itens[it] -= 1;
    return itens;
  }

  /** Golpe automático em guerra: alvo ao lado e tempo de golpe vencido. */
  private processarGolpe(c: Combatente, agora: number): void {
    if (c.golpe && agora >= c.golpe.fimMs) c.golpe = null;
    if (!c.guerra || !c.alvoAtaqueId) return;
    const alvo = this.combatentes.get(c.alvoAtaqueId);
    if (!alvo || alvo.morto) {
      c.alvoAtaqueId = null;
      return;
    }
    if (c.cast || this.paralisado(c, agora) || agora < c.proximoGolpeMs) return;
    if (distanciaTiles(c.mov, alvo.mov) > 1) return;

    const arma = this.armaDe(c);
    const atraso = atrasoGolpeMs(arma.velocidade, c.stam);
    c.proximoGolpeMs = agora + atraso;
    c.mov.dir = direcaoAte(c.mov, alvo.mov) ?? c.mov.dir;
    c.golpe = { inicioMs: agora, fimMs: agora + Math.min(atraso, DURACAO_ANIMACAO_GOLPE_MS), animacao: arma.golpe };

    const skill = c.ficha.skills[habilidadeDa(arma)];
    const defesa = alvo.ficha.skills[habilidadeDa(this.armaDe(alvo))];
    const acertou = this.rng() < chanceAcerto(skill, defesa);
    this.eventos.push({ tipo: 'golpe', origemId: c.id, alvoId: alvo.id, acertou });
    this.eventos.push({ tipo: 'som', som: acertou ? arma.somAcerto : arma.somErro, alvoId: alvo.id });
    if (!acertou) return;
    if (alvo.equipamento.escudo && this.rng() < chanceBloqueio(alvo.ficha.skills.parry, this.atributo(alvo, 'dex'))) {
      this.eventos.push({ tipo: 'visual', visual: 'refletido', origemId: alvo.id, alvoId: alvo.id, duracaoMs: 500 });
      this.eventos.push({ tipo: 'texto', alvoId: alvo.id, texto: '*bloqueia*', cor: COR_SISTEMA });
      return;
    }
    const dano = danoGolpe(this.rng, arma, c.ficha, this.atributo(c, 'str'), alvo.resistencias.fisica);
    this.causarDano(alvo, dano, c.id, agora);
  }

  private atributo(c: Combatente, a: 'str' | 'dex' | 'int'): number {
    return c.ficha.atributos[a] + c.modificadores.filter((m) => m.atributo === a).reduce((t, m) => t + m.valor, 0);
  }

  /** Vida e estamina máximas com os bônus de poção (o atual não passa do novo máximo). */
  private recalcularMaximos(c: Combatente): void {
    const soma = (a: 'str' | 'dex' | 'int') => c.modificadores.filter((m) => m.atributo === a).reduce((t, m) => t + m.valor, 0);
    c.vidaMax = vidaMaxima(c.ficha, soma('str'));
    c.stamMax = estaminaMaxima(c.ficha, soma('dex'));
    c.manaMax = manaMaxima(c.ficha) + soma('int');
    c.vida = Math.min(c.vida, c.vidaMax);
    c.stam = Math.min(c.stam, c.stamMax);
    c.mana = Math.min(c.mana, c.manaMax);
  }

  private erroAlvo(c: Combatente, alvo: Combatente | undefined, m: DefMagia, agora: number): string | null {
    if (!alvo || alvo.morto) return 'Alvo inválido.';
    if (this.paralisado(c, agora)) return 'Você não pode fazer isso paralisado.';
    if (distanciaTiles(c.mov, alvo.mov) > this.regras.alcanceMiraTiles) return 'O alvo está longe demais.';
    if (alvo.id !== c.id && !this.opcoes.temVisao(c.mov, alvo.mov)) return 'O alvo não pode ser visto.';
    if (c.mana < this.custo(c, m)) return `Mana insuficiente (precisa de ${this.custo(c, m)}).`;
    return null;
  }

  private erroLocal(c: Combatente, m: DefMagia, x: number, y: number): string | null {
    const ef = m.efeito;
    const alcance = ef.tipo === 'teleporte' || ef.tipo === 'muro' ? ef.alcanceTiles : this.regras.alcanceMiraTiles;
    if (distanciaTiles(c.mov, { x, y }) > alcance) return 'Esse lugar está longe demais.';
    if (!this.opcoes.temVisao(c.mov, { x, y })) return 'Esse lugar não pode ser visto.';
    if (ef.tipo === 'teleporte' && !(this.opcoes.tileLivre?.(x, y) ?? true)) return 'Não dá para ir para lá.';
    return null;
  }

  private comecarCast(c: Combatente, m: DefMagia, alvoId: string, agora: number, local?: { x: number; y: number }): void {
    c.cast = { magia: m, alvoId, local, inicioMs: agora, fimMs: agora + tempoCastMs(m.circulo, c.ficha) };
    // Lançar magia reinicia o tempo do golpe (só volta a golpear depois do cast)
    c.proximoGolpeMs = Math.max(c.proximoGolpeMs, c.cast.fimMs + atrasoGolpeMs(this.armaDe(c).velocidade, c.stam));
    c.golpe = null;
    c.mov.movimento = null;
    this.eventos.push({ tipo: 'texto', alvoId: c.id, texto: m.palavras, cor: COR_FALA_CAST });
  }

  /** Fim do tempo de cast: confere o alvo de novo e só então gasta a mana e aplica o efeito. */
  private concluirCast(c: Combatente, agora: number): void {
    if (!c.cast || agora < c.cast.fimMs) return;
    const { magia: m, alvoId, local } = c.cast;
    c.cast = null;
    c.proximaMagiaMs = agora + recuperacaoMs(c.ficha);
    if (local) {
      const erroLocal = this.paralisado(c, agora) ? 'Você não pode fazer isso paralisado.' : this.erroLocal(c, m, local.x, local.y);
      if (erroLocal || c.mana < this.custo(c, m)) {
        this.avisar(c, `${erroLocal ?? 'Mana insuficiente.'} A magia falhou.`);
        this.eventos.push({ tipo: 'texto', alvoId: c.id, texto: '*fizzle*', cor: COR_SISTEMA });
        return;
      }
      this.lancarLocal(c, m, local, agora);
      return;
    }
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
    for (const r of m.reagentes) c.itens[r] = (c.itens[r] ?? 0) - 1;
    const ef = m.efeito;
    switch (ef.tipo) {
      case 'mente': {
        // Mind Blast (AoS): (Magery + Int)/5 + 2..6, até 60; chega 1 s depois; não usa Eval
        const { destino } = this.checarReflexo(m.circulo, c, alvoOriginal);
        const base = Math.min(ef.maximo, Math.floor((c.ficha.skills.magery + Math.min(200, this.atributo(c, 'int'))) / 5) + inteiro(this.rng, 2, 6));
        this.eventos.push({ tipo: 'visual', visual: 'mente', origemId: c.id, alvoId: destino.id, duracaoMs: 600 });
        this.agendados.push({ quandoMs: agora + ef.atrasoMs, executar: (quando) => {
          if (destino.morto) return;
          this.eventos.push({ tipo: 'som', som: m.som, alvoId: destino.id });
          const dano = inteiro(this.rng, base, base + 4);
          this.causarDano(destino, Math.max(0, Math.floor((dano * (100 - destino.resistencias.frio)) / 100)), c.id, quando);
        } });
        break;
      }
      case 'maldicao': {
        const { destino } = this.checarReflexo(m.circulo, c, alvoOriginal);
        // SpellHelper.GetOffsetScalar/GetDuration (AoS): 8% + Eval/10 − Resist/10; (6 × Eval×10 / 50 + 1) s
        const pct = Math.max(0, ef.percentualBase + c.ficha.skills.evalInt / 10 - destino.ficha.skills.resist / 10) / 100;
        const ate = agora + (Math.floor((6 * c.ficha.skills.evalInt * 10) / 50) + 1) * 1000;
        destino.modificadores = destino.modificadores.filter((md) => md.origem !== 'maldicao');
        for (const a of ['str', 'dex', 'int'] as const) {
          destino.modificadores.push({ atributo: a, valor: -Math.ceil(destino.ficha.atributos[a] * pct), ateMs: ate, origem: 'maldicao' });
        }
        destino.modificadores.push({ atributo: 'resistencias', valor: -ef.resistencias, ateMs: ate, origem: 'maldicao' });
        this.recalcularMaximos(destino);
        this.recalcularEquipamento(destino);
        this.interromper(destino);
        destino.paralisadoAteMs = 0;
        this.eventos.push({ tipo: 'som', som: m.som, alvoId: destino.id });
        this.eventos.push({ tipo: 'visual', visual: 'maldicao', origemId: c.id, alvoId: destino.id, duracaoMs: 600 });
        this.eventos.push({ tipo: 'texto', alvoId: destino.id, texto: '*amaldiçoado*', cor: COR_ALERTA });
        break;
      }
      case 'dreno-mana': {
        const { destino } = this.checarReflexo(m.circulo, c, alvoOriginal);
        this.interromper(destino);
        destino.paralisadoAteMs = 0;
        this.eventos.push({ tipo: 'som', som: m.som, alvoId: destino.id });
        this.eventos.push({ tipo: 'visual', visual: 'dreno-mana', origemId: c.id, alvoId: destino.id, duracaoMs: 600 });
        // AoS: 40 + Eval − Resist; a mana volta depois de 5 s; só um dreno por vez
        if (agora < (destino.travas['dreno-mana'] ?? 0)) break;
        const drenar = Math.min(destino.mana, Math.max(0, ef.base + c.ficha.skills.evalInt - destino.ficha.skills.resist));
        if (drenar <= 0) break;
        destino.mana -= drenar;
        destino.travas['dreno-mana'] = agora + ef.devolveMs;
        this.eventos.push({ tipo: 'texto', alvoId: destino.id, texto: `-${drenar} mana`, cor: '#7fb7ff' });
        this.agendados.push({ quandoMs: agora + ef.devolveMs, executar: () => {
          if (!destino.morto) destino.mana = Math.min(destino.manaMax, destino.mana + drenar);
        } });
        break;
      }
      case 'teleporte':
      case 'muro':
        break; // magias de local: ver lancarLocal
      case 'dano': {
        const { origem, destino } = this.checarReflexo(m.circulo, c, alvoOriginal);
        // Harm perde força com a distância (calculada com quem lançou a magia)
        const fator = ef.perdePorDistancia
          ? (distanciaTiles(c.mov, alvoOriginal.mov) > 2 ? 0.25 : distanciaTiles(c.mov, alvoOriginal.mov) > 1 ? 0.5 : 1)
          : 1;
        this.eventos.push({ tipo: 'som', som: m.som, alvoId: destino.id });
        this.eventos.push({ tipo: 'visual', visual: ef.visual, origemId: origem.id, alvoId: destino.id, duracaoMs: Math.max(500, ef.atrasoMs) });
        const aplicar = (quando: number) => {
          if (destino.morto) return;
          const bruto = danoMagia(this.rng, ef.bonus, ef.dados, ef.lados, c.ficha, 0);
          const dano = Math.floor(Math.floor(bruto * fator) * (100 - Math.min(70, destino.resistencias[ef.elemento])) / 100);
          this.causarDano(destino, dano, c.id, quando);
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
    const iMana = intervaloRegenManaMs(c.ficha, this.bloqueiaMeditacao(c));
    while (agora >= c.proximaRegenManaMs) {
      if (c.mana < c.manaMax) c.mana++;
      c.proximaRegenManaMs += iMana;
    }
    const iStam = intervaloRegenStamMs(c.ficha);
    while (agora >= c.proximaRegenStamMs) {
      if (c.stam < c.stamMax) c.stam++;
      c.proximaRegenStamMs += iStam;
    }
  }

  private morrer(c: Combatente, agora: number): void {
    c.morto = true;
    c.espolio = { ...c.itens };
    for (const it of this.equipados(c)) c.espolio[it] = (c.espolio[it] ?? 0) + 1;
    c.cast = null;
    c.mira = null;
    c.veneno = null;
    c.paralisadoAteMs = 0;
    c.reflexo = 0;
    c.modificadores = [];
    c.alvoAtaqueId = null;
    c.golpe = null;
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
    c.espolio = {};
    this.recalcularMaximos(c);
    c.vida = c.vidaMax;
    c.mana = c.manaMax;
    c.stam = c.stamMax;
    // Arena: renasce com a mochila cheia de novo (o equipado continua no corpo)
    c.itens = this.mochilaSemEquipados(c);
    c.travas = {};
    c.proximaMagiaMs = 0;
    c.proximaRegenVidaMs = agora + intervaloRegenVidaMs();
    c.proximaRegenManaMs = agora + intervaloRegenManaMs(c.ficha);
    this.eventos.push({ tipo: 'respawn', alvoId: c.id });
  }

  private avisar(c: Combatente, texto: string): void {
    this.eventos.push({ tipo: 'aviso', paraId: c.id, texto });
  }
}

/** Skill de ataque/defesa de cada arma (todas em 100 no modelo, mas o tipo importa para outras regras). */
function habilidadeDa(arma: DefArma): 'swords' | 'macing' | 'fencing' | 'wrestling' {
  if (arma.maos === 0) return 'wrestling';
  if (arma.golpe.includes('perfura')) return 'fencing';
  if (arma.golpe.includes('esmaga')) return 'macing';
  return 'swords';
}

/** Direção do UO de `de` para `para` (null se for o mesmo tile). */
function direcaoAte(de: { x: number; y: number }, para: { x: number; y: number }): Direcao | null {
  const dx = Math.sign(para.x - de.x);
  const dy = Math.sign(para.y - de.y);
  if (!dx && !dy) return null;
  return DESLOCAMENTO.findIndex((d) => d.dx === dx && d.dy === dy) as Direcao;
}
