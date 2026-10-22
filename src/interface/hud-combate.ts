import type { MotorCombate } from '../combate/motor';
import type { Combatente, ModoBot } from '../combate/tipos';

export interface AcoesHud {
  lancar(magiaId: string): void;
  adicionarBot(modo: ModoBot): void;
  removerBots(): void;
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

  constructor(private readonly raiz: HTMLElement, private readonly motor: MotorCombate, acoes: AcoesHud) {
    raiz.innerHTML = '';

    const status = div('status-combate');
    this.proprio = this.barras();
    this.alvo = this.barras();
    this.alvo.raiz.classList.add('alvo');
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
      som,
    );

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
    this.dicaMira.hidden = !eu.mira;

    this.avisos = this.avisos.filter((a) => a.ate > agora);
    const texto = this.avisos.map((a) => a.texto).join('\n');
    if (this.log.textContent !== texto) this.log.textContent = texto;
  }

  private preencher(b: Barras, c: Combatente, agora: number): void {
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
