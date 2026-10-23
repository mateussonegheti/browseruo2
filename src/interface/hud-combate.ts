import type { MotorCombate } from '../combate/motor';
import type { Combatente, ModoBot } from '../combate/tipos';
import type { FonteUO } from './recursos';

/** Barras no estilo do cliente (gumps 0x0803 e 0x0804); sem os arquivos, barras em HTML. */
export interface OpcoesHud {
  gumps: boolean;
  fonte?: FonteUO;
  /** Duplo clique na própria barra abre o status completo. */
  abrirStatus?: () => void;
}

const G = (id: string) => `url(/interface/gumps/${id}.png)`;
/** Linhas das barras dentro dos gumps (posições do cliente clássico). */
const LINHAS_PROPRIA = [12, 25, 38];
const LINHA_ALVO = 38;

export interface AcoesHud {
  lancar(magiaId: string): void;
  adicionarBot(modo: ModoBot): void;
  removerBots(): void;
  adicionarCriatura(nome: string): void;
  spawnCriaturas(quantidade: number): void;
  removerCriaturas(): void;
  alternarSom(): boolean;
}

interface Barras {
  raiz: HTMLElement;
  nome: HTMLElement;
  vida: HTMLElement;
  vidaTexto: HTMLElement;
  mana: HTMLElement;
  manaTexto: HTMLElement;
  estado: HTMLElement;
  stam?: HTMLElement;
  /** Barras em gump: o nome é desenhado na fonte do cliente quando muda. */
  gump?: boolean;
  nomeAtual?: string;
}

const MAX_AVISOS = 5;
const DURACAO_AVISO_MS = 6000;

/** Interface do combate em HTML: barras de status, barra de magias, bots e mensagens. */
export class HudCombate {
  private readonly proprio: Barras;
  private readonly alvo: Barras;
  private readonly botoesMagia = new Map<string, { botao: HTMLButtonElement; progresso: HTMLElement }>();
  private readonly log: HTMLElement;
  private readonly dicaMira: HTMLElement;
  private avisos: Array<{ texto: string; ate: number }> = [];
  /** Dica mostrada no alto quando não há mira de magia (ex.: posicionar um bot). */
  dicaExtra: string | null = null;

  constructor(
    private readonly raiz: HTMLElement, private readonly motor: MotorCombate, acoes: AcoesHud,
    criaturas: Array<{ nome: string; rotulo: string; tipo: string }> = [],
    private readonly opcoes: OpcoesHud = { gumps: false },
  ) {
    raiz.innerHTML = '';

    const status = div('status-combate');
    this.proprio = opcoes.gumps ? this.barrasGump(false) : this.barras();
    this.alvo = opcoes.gumps ? this.barrasGump(true) : this.barras();
    this.alvo.raiz.classList.add('alvo');
    if (opcoes.abrirStatus) {
      this.proprio.raiz.title = 'Duplo clique: status completo';
      this.proprio.raiz.addEventListener('dblclick', () => opcoes.abrirStatus!());
    }
    status.append(this.proprio.raiz, this.alvo.raiz);

    const bots = div('bots');
    const titulo = document.createElement('strong');
    titulo.textContent = 'Bots de teste';
    const som = botao('Som: ligado', () => { som.textContent = `Som: ${acoes.alternarSom() ? 'ligado' : 'desligado'}`; });
    bots.append(
      titulo,
      botao('+ Bot parado', () => acoes.adicionarBot('parado')),
      botao('+ Bot ativo', () => acoes.adicionarBot('ativo')),
      botao('Remover bots', () => acoes.removerBots()),
    );
    if (criaturas.length) {
      const tituloCriaturas = document.createElement('strong');
      tituloCriaturas.textContent = 'Criaturas';
      const lista = document.createElement('select');
      for (const tipo of ['animal', 'monstro']) {
        const grupo = document.createElement('optgroup');
        grupo.label = tipo === 'animal' ? 'Animais e montarias' : 'Monstros';
        for (const c of criaturas.filter((c) => c.tipo === tipo)) grupo.append(new Option(c.rotulo, c.nome));
        lista.append(grupo);
      }
      bots.append(
        tituloCriaturas, lista,
        botao('+ Criatura', () => acoes.adicionarCriatura(lista.value)),
        botao('Spawn aleatório (6)', () => acoes.spawnCriaturas(6)),
        botao('Remover criaturas', () => acoes.removerCriaturas()),
      );
    }
    bots.append(som);

    const barra = div('barra-magias');
    for (const m of motor.regras.magias) {
      const b = botao('', () => acoes.lancar(m.id));
      b.title = `${m.nome} (${m.palavras}) · ${m.circulo}º círculo · tecla ${m.tecla}`;
      b.dataset.magia = m.id;
      const img = document.createElement('img');
      img.src = `/gumps/${m.icone}.png`;
      img.alt = m.nome;
      img.addEventListener('error', () => { img.replaceWith(spanTexto(m.nome.split(' ').map((p) => p[0]).join(''), 'sigla')); });
      const progresso = div('progresso');
      b.append(img, progresso, spanTexto(m.tecla, 'tecla'));
      this.botoesMagia.set(m.id, { botao: b, progresso });
      barra.append(b);
    }

    this.log = div('log-combate');
    this.dicaMira = div('dica-mira');
    this.dicaMira.textContent = 'Clique no alvo · T: último alvo · Y: você mesmo · Esc: cancelar';
    raiz.append(status, bots, this.log, this.dicaMira, barra);
  }

  mostrar(visivel: boolean): void {
    this.raiz.hidden = !visivel;
  }

  avisar(texto: string, agora: number): void {
    this.avisos.push({ texto, ate: agora + DURACAO_AVISO_MS });
    if (this.avisos.length > MAX_AVISOS) this.avisos.shift();
  }

  atualizar(eu: Combatente, alvo: Combatente | undefined, agora: number): void {
    this.preencher(this.proprio, eu, agora);
    this.alvo.raiz.hidden = !alvo;
    if (alvo) this.preencher(this.alvo, alvo, agora);

    for (const [id, { botao: b, progresso }] of this.botoesMagia) {
      const m = this.motor.magia(id)!;
      const lancando = eu.cast?.magia.id === id;
      b.classList.toggle('lancando', lancando);
      b.classList.toggle('mirando', eu.mira?.id === id);
      b.classList.toggle('sem-mana', eu.mana < this.motor.custo(eu, m));
      progresso.style.width = lancando && eu.cast
        ? `${Math.min(100, ((agora - eu.cast.inicioMs) / (eu.cast.fimMs - eu.cast.inicioMs)) * 100)}%`
        : '0%';
    }
    const dica = eu.mira ? 'Clique no alvo · T: último alvo · Y: você mesmo · Esc: cancelar' : this.dicaExtra;
    if (this.dicaMira.textContent !== dica) this.dicaMira.textContent = dica ?? '';
    this.dicaMira.hidden = !dica;

    this.avisos = this.avisos.filter((a) => a.ate > agora);
    const texto = this.avisos.map((a) => a.texto).join('\n');
    if (this.log.textContent !== texto) this.log.textContent = texto;
  }

  private preencher(b: Barras, c: Combatente, agora: number): void {
    if (b.gump) {
      this.preencherGump(b, c, agora);
      return;
    }
    b.nome.textContent = c.nome;
    b.vida.style.width = `${(c.vida / c.vidaMax) * 100}%`;
    b.vida.classList.toggle('envenenado', Boolean(c.veneno));
    b.vidaTexto.textContent = `${c.vida} / ${c.vidaMax}`;
    b.mana.style.width = `${(c.mana / c.manaMax) * 100}%`;
    b.manaTexto.textContent = `${c.mana} / ${c.manaMax}`;
    const estados: string[] = [];
    if (c.morto) estados.push(`morto (renasce em ${Math.ceil((c.respawnEmMs - agora) / 1000)}s)`);
    if (c.veneno) estados.push(`envenenado (${this.motor.regras.venenos[c.veneno.nivel]?.nome})`);
    if (agora < c.paralisadoAteMs) estados.push(`paralisado ${Math.ceil((c.paralisadoAteMs - agora) / 1000)}s`);
    if (c.reflexo > 0) estados.push(`reflexo ${c.reflexo}`);
    b.estado.textContent = estados.join(' · ');
  }

  /** Gump 0x0803 (você: vida, mana e estamina) ou 0x0804 (alvo: nome e vida), com as barras do cliente. */
  private barrasGump(alvo: boolean): Barras {
    const raiz = div('barras-gump');
    raiz.style.backgroundImage = G(alvo ? '0x0804' : '0x0803');
    const linha = (y: number): HTMLElement => {
      const trilho = div('trilho');
      trilho.style.top = `${y}px`;
      trilho.style.backgroundImage = G('0x0805');
      const valor = div('valor');
      valor.style.backgroundImage = G('0x0806');
      trilho.append(valor);
      raiz.append(trilho);
      return valor;
    };
    const nome = div('nome-gump');
    const estado = div('estado');
    if (alvo) {
      raiz.append(nome);
      const vida = linha(LINHA_ALVO);
      return { raiz: embrulhar(raiz, estado), nome, vida, vidaTexto: raiz, mana: div(''), manaTexto: div(''), estado, gump: true };
    }
    const [vida, mana, stam] = LINHAS_PROPRIA.map(linha) as [HTMLElement, HTMLElement, HTMLElement];
    return { raiz: embrulhar(raiz, estado), nome, vida, vidaTexto: raiz, mana, manaTexto: div(''), stam, estado, gump: true };
  }

  private preencherGump(b: Barras, c: Combatente, agora: number): void {
    const largura = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    b.vida.style.width = largura(c.vida, c.vidaMax);
    // Verde envenenado, amarelo paralisado, azul normal (cores do cliente)
    const fill = c.veneno ? '0x0808' : agora < c.paralisadoAteMs ? '0x0809' : '0x0806';
    if (b.vida.dataset.fill !== fill) {
      b.vida.style.backgroundImage = G(fill);
      b.vida.dataset.fill = fill;
    }
    b.mana.style.width = largura(c.mana, c.manaMax);
    if (b.stam) b.stam.style.width = largura(c.stam, c.stamMax);
    b.vidaTexto.title = `Vida ${c.vida}/${c.vidaMax} · Mana ${c.mana}/${c.manaMax} · Estamina ${c.stam}/${c.stamMax}`;
    if (b.nomeAtual !== c.nome && b.nome.isConnected) {
      b.nomeAtual = c.nome;
      b.nome.replaceChildren(this.opcoes.fonte ? this.opcoes.fonte.emCanvas(c.nome, '#e8d9a8') : document.createTextNode(c.nome));
    }
    const estados: string[] = [];
    if (c.morto) estados.push(`morto (renasce em ${Math.ceil((c.respawnEmMs - agora) / 1000)}s)`);
    if (c.veneno) estados.push(`envenenado (${this.motor.regras.venenos[c.veneno.nivel]?.nome})`);
    if (agora < c.paralisadoAteMs) estados.push(`paralisado ${Math.ceil((c.paralisadoAteMs - agora) / 1000)}s`);
    if (c.reflexo > 0) estados.push(`reflexo ${c.reflexo}`);
    const texto = estados.join(' · ');
    if (b.estado.textContent !== texto) b.estado.textContent = texto;
  }

  private barras(): Barras {
    const raiz = div('barras');
    const nome = div('nome');
    const linha = (classe: string): [HTMLElement, HTMLElement, HTMLElement] => {
      const fundo = div(`barra ${classe}`);
      const valor = div('valor');
      const texto = div('texto');
      fundo.append(valor, texto);
      return [fundo, valor, texto];
    };
    const [fVida, vida, vidaTexto] = linha('vida');
    const [fMana, mana, manaTexto] = linha('mana');
    const estado = div('estado');
    raiz.append(nome, fVida, fMana, estado);
    return { raiz, nome, vida, vidaTexto, mana, manaTexto, estado };
  }
}

/** Gump da barra + linha de estado embaixo, num bloco só. */
function embrulhar(gump: HTMLElement, estado: HTMLElement): HTMLElement {
  const bloco = div('bloco-barra');
  bloco.append(gump, estado);
  return bloco;
}

function div(classe: string): HTMLElement {
  const d = document.createElement('div');
  d.className = classe;
  return d;
}

function spanTexto(texto: string, classe: string): HTMLElement {
  const s = document.createElement('span');
  s.className = classe;
  s.textContent = texto;
  return s;
}

function botao(texto: string, aoClicar: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.addEventListener('click', aoClicar);
  // Não deixar o botão com foco "roubar" as teclas de atalho
  b.addEventListener('mouseup', () => b.blur());
  return b;
}
