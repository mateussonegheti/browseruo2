// Janelas no estilo dos gumps do UO: paperdoll e mochila. Arrastáveis; botão direito fecha.
import type { Animacoes } from '../render/animacoes';
import type { RecursosInterface } from './recursos';

/** Uma peça desenhada no paperdoll: gump (public/interface/gumps/) e matiz opcional. */
export interface PecaPaperdoll {
  gump: string;
  matiz?: number;
  /** Item equipado (duplo clique na peça desequipa). */
  item?: string;
}

const GUMP_PAPERDOLL = '0x07D0';
const GUMP_MOCHILA_PAPERDOLL = '0xC4F6';
const GUMP_MOCHILA = '0x003C';
const GUMP_LIVRO = '0x08AC';
const ITEM_SPELLBOOK = '0x0EFA';
/** Onde o corpo fica dentro do paperdoll — arco da versão Outlands (262×324). */
const CORPO_X = 8;
const CORPO_Y = 35;
const GUMP_BAU = '0x004C';
/** Área útil de cada contêiner (onde os itens podem ficar) e a grade inicial. */
const AREA_MOCHILA = { x: 44, y: 65, w: 142, h: 94, colunas: 5, celulaX: 29, celulaY: 31 };
const AREA_CORPO = { x: 18, y: 84, w: 108, h: 112, colunas: 4, celulaX: 27, celulaY: 30 };
const GUMP_CORPO = '0x0009';
const AREA_BAU = { x: 46, y: 62, w: 166, h: 120, colunas: 7, celulaX: 24, celulaY: 40 };

type Area = typeof AREA_MOCHILA;
type ChaveConteiner = 'mochila' | 'bau' | 'corpo';

/** O que as janelas precisam do jogo: mochila do jogador e as magias. */
/** Valores mostrados no status completo (gump 0x0802). */
export interface DadosStatus {
  nome: string;
  str: number; dex: number; int: number;
  vida: number; vidaMax: number; mana: number; manaMax: number; stam: number; stamMax: number;
  ar: number; ouro: number; peso: number;
}

export interface AcoesJanelas {
  estoque(): Record<string, number>;
  usar(item: string): void;
  equipar(item: string): void;
  desequipar(item: string): void;
  /** Armas, armaduras e escudos ficam no baú, não na mochila. */
  ehEquipavel(item: string): boolean;
  /** Item da mochila que abre o menu de casas. */
  itemDeed: string;
  usarDeed(): void;
  /** Item da mochila que abre o baú. */
  itemBau: string;
  /** Itens do corpo aberto; null se ele sumiu (renasceu) ou está longe demais. */
  estoqueCorpo(corpoId: string): Record<string, number> | null;
  lootar(corpoId: string, item: string): void;
  magias(): Array<{ id: string; nome: string; circulo: number }>;
  lancar(magia: string): void;
  alternarGuerra(): void;
  estadoGuerra(): boolean;
  obterStatus(): DadosStatus;
}

function carregar(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

export class Janelas {
  private paperdoll: { el: HTMLElement; canvas: HTMLCanvasElement; nome: string; pecas: () => PecaPaperdoll[]; btnGuerra: HTMLButtonElement } | null = null;
  private conteineres: Record<ChaveConteiner, { el: HTMLElement; caixa: HTMLElement } | null> = { mochila: null, bau: null, corpo: null };
  private corpoAberto: string | null = null;
  private livro: HTMLElement | null = null;
  private status: { el: HTMLElement; canvas: HTMLCanvasElement; fundo: HTMLImageElement; obter: () => DadosStatus } | null = null;
  private jornalEl: HTMLElement | null = null;
  private jornalMsgs: HTMLElement | null = null;
  jornal: Array<{ texto: string; cor: 'normal' | 'sistema' | 'alerta' | 'magia' }> = [];
  private posicoes = new Map<string, { x: number; y: number }>();
  /** Posição de cada item dentro da mochila (mantida ao fechar e abrir). */
  private itensMochila = new Map<string, { x: number; y: number }>();

  constructor(
    private readonly raiz: HTMLElement, private readonly recursos: RecursosInterface,
    private readonly animacoes: Animacoes, private readonly acoes: AcoesJanelas,
  ) {}

  get abertas(): boolean {
    return Boolean(this.paperdoll || this.conteineres.mochila || this.conteineres.bau || this.conteineres.corpo || this.livro || this.jornalEl);
  }

  /** Paperdoll: `pecas` é chamado de novo a cada redesenho (ao equipar ou desequipar). */
  async alternarPaperdoll(nome: string, pecas: () => PecaPaperdoll[]): Promise<void> {
    if (this.paperdoll) {
      this.fechar('paperdoll');
      return;
    }
    const fundo = await carregar(`/interface/gumps/${GUMP_PAPERDOLL}.png`);
    if (!fundo) return;
    const canvas = document.createElement('canvas');
    canvas.width = fundo.width;
    canvas.height = fundo.height;
    canvas.addEventListener('dblclick', (e) => void this.duploCliquePaperdoll(e.offsetX, e.offsetY));
    const { col, btnGuerra } = this.criarBotoesPaperdoll();
    const wrapper = document.createElement('div');
    wrapper.className = 'paperdoll-wrapper';
    wrapper.append(canvas, col);
    const el = this.janela('paperdoll', wrapper, { x: 80, y: 60 });
    this.paperdoll = { el, canvas, nome, pecas, btnGuerra };
    await this.redesenharPaperdoll();
  }

  private criarBotoesPaperdoll(): { col: HTMLElement; btnGuerra: HTMLButtonElement } {
    const col = document.createElement('div');
    col.className = 'paperdoll-botoes';
    const G = (nome: string) => `/interface/gumps-outlands-preview/${nome}`;
    const bGump = (src: string, rotulo: string, titulo: string, acao: () => void): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.title = titulo; btn.className = 'paperdoll-btn';
      const img = document.createElement('img');
      img.src = src; img.alt = rotulo; img.draggable = false;
      btn.append(img);
      btn.addEventListener('click', acao);
      btn.addEventListener('mouseup', () => btn.blur());
      return btn;
    };
    const bCss = (rotulo: string, titulo: string, acao: () => void): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = rotulo; btn.title = titulo;
      btn.className = 'paperdoll-btn sem-gump';
      btn.addEventListener('click', acao);
      btn.addEventListener('mouseup', () => btn.blur());
      return btn;
    };
    const emGuerra = this.acoes.estadoGuerra();
    const btnGuerra = bCss(emGuerra ? 'WAR' : 'PEACE', 'Guerra / Paz (Tab)', () => {
      this.acoes.alternarGuerra();
      this.atualizarGuerraPaperdoll();
    });
    if (emGuerra) btnGuerra.classList.add('em-guerra');
    col.append(
      bGump(G('0x07EF_64x21.png'), 'HELP',    'Ajuda',                   () => {}),
      bGump(G('0x07D8_64x21.png'), 'OPTIONS', 'Opções',                  () => {}),
      bGump(G('0x07DA_64x22.png'), 'LOG OUT', 'Sair',                    () => {}),
      bGump(G('0x0839_66x19.png'), 'SKILLS',  'Habilidades',             () => {}),
      bGump(G('0x0830_66x19.png'), 'JOURNAL', 'Diário de mensagens (J)', () => this.alternarJornal()),
      btnGuerra,
      bCss('STATUS', 'Status (S)', () => void this.alternarStatus(this.acoes.obterStatus)),
    );
    return { col, btnGuerra };
  }

  atualizarGuerraPaperdoll(): void {
    if (!this.paperdoll) return;
    const em = this.acoes.estadoGuerra();
    this.paperdoll.btnGuerra.textContent = em ? 'WAR' : 'PEACE';
    this.paperdoll.btnGuerra.classList.toggle('em-guerra', em);
  }

  adicionarLog(texto: string, cor: 'normal' | 'sistema' | 'alerta' | 'magia' = 'normal'): void {
    this.jornal.push({ texto, cor });
    if (this.jornal.length > 200) this.jornal.shift();
    if (!this.jornalMsgs) return;
    const p = document.createElement('p');
    p.textContent = texto;
    if (cor !== 'normal') p.className = cor;
    this.jornalMsgs.append(p);
    this.jornalMsgs.scrollTop = this.jornalMsgs.scrollHeight;
  }

  alternarJornal(): void {
    if (this.jornalEl) { this.fechar('jornal'); return; }
    const div = document.createElement('div');
    div.className = 'jornal-gump';
    const titulo = document.createElement('div');
    titulo.className = 'jornal-titulo';
    titulo.textContent = 'JOURNAL';
    const msgs = document.createElement('div');
    msgs.className = 'jornal-msgs';
    for (const m of this.jornal) {
      const p = document.createElement('p');
      p.textContent = m.texto;
      if (m.cor !== 'normal') p.className = m.cor;
      msgs.append(p);
    }
    div.append(titulo, msgs);
    this.jornalMsgs = msgs;
    this.jornalEl = this.janela('jornal', div, { x: 360, y: 80 });
    requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
  }

  async redesenharPaperdoll(): Promise<void> {
    if (!this.paperdoll) return;
    const { canvas, nome, pecas } = this.paperdoll;
    const fundo = await carregar(`/interface/gumps/${GUMP_PAPERDOLL}.png`);
    if (!fundo) return;
    const camadas: Array<{ img: CanvasImageSource }> = [];
    for (const p of [...pecas(), { gump: GUMP_MOCHILA_PAPERDOLL }] as PecaPaperdoll[]) {
      const img = await carregar(`/interface/gumps/${p.gump}.png`);
      if (img) camadas.push({ img: p.matiz === undefined ? img : this.animacoes.tingir(img, p.matiz) });
    }
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(fundo, 0, 0);
    for (const c of camadas) g.drawImage(c.img, CORPO_X, CORPO_Y);
    const fonte = this.recursos.fontes.titulo ?? this.recursos.fontes.texto;
    if (fonte) fonte.desenhar(g, nome, canvas.width / 2, canvas.height - 44, '#e8d9a8', { contorno: '#000000' });
    else {
      g.font = 'bold 14px serif';
      g.textAlign = 'center';
      g.fillStyle = '#e8d9a8';
      g.fillText(nome, canvas.width / 2, canvas.height - 30);
    }
  }

  /** Duplo clique no paperdoll: a mochila abre a mochila; uma peça equipada volta para o baú. */
  private async duploCliquePaperdoll(x: number, y: number): Promise<void> {
    if (!this.paperdoll) return;
    const mochila = await carregar(`/interface/gumps/${GUMP_MOCHILA_PAPERDOLL}.png`);
    if (mochila && this.temPixel(mochila, x - CORPO_X, y - CORPO_Y)) {
      void this.alternarMochila();
      return;
    }
    // Da peça de cima para a de baixo
    for (const p of [...this.paperdoll.pecas()].reverse()) {
      if (!p.item) continue;
      const img = await carregar(`/interface/gumps/${p.gump}.png`);
      if (img && this.temPixel(img, x - CORPO_X, y - CORPO_Y)) {
        this.acoes.desequipar(p.item);
        await this.redesenharPaperdoll();
        this.atualizarMochila();
        return;
      }
    }
  }

  alternarMochila(): Promise<void> {
    return this.alternarConteiner('mochila', GUMP_MOCHILA, AREA_MOCHILA, { x: 380, y: 180 });
  }

  alternarBau(): Promise<void> {
    return this.alternarConteiner('bau', GUMP_BAU, AREA_BAU, { x: 640, y: 200 });
  }

  /** Abre o corpo de quem morreu (gump do caixão com a caveira); duplo clique num item pega para a sua mochila. */
  async abrirCorpo(corpoId: string, nome: string): Promise<void> {
    if (this.conteineres.corpo) this.fechar('corpo');
    this.corpoAberto = corpoId;
    await this.alternarConteiner('corpo', GUMP_CORPO, AREA_CORPO, { x: 160, y: 260 });
    const caixa = this.conteineres.corpo?.caixa;
    if (caixa) caixa.title = `Corpo de ${nome}`;
  }

  private async alternarConteiner(chave: ChaveConteiner, gump: string, area: Area, pos: { x: number; y: number }): Promise<void> {
    if (this.conteineres[chave]) {
      this.fechar(chave);
      return;
    }
    const fundo = await carregar(`/interface/gumps/${gump}.png`);
    if (!fundo) return;
    const caixa = document.createElement('div');
    caixa.className = 'mochila';
    caixa.style.width = `${fundo.width}px`;
    caixa.style.height = `${fundo.height}px`;
    caixa.style.backgroundImage = `url(${fundo.src})`;
    const el = this.janela(chave, caixa, pos);
    this.conteineres[chave] = { el, caixa };
    this.sincronizar(chave, area);
  }

  /** O que cada contêiner mostra: o baú guarda os equipáveis; a mochila, o resto e o próprio baú. */
  private mostra(chave: ChaveConteiner, item: string): boolean {
    if (chave === 'corpo') return true;
    return chave === 'bau' ? this.acoes.ehEquipavel(item) : !this.acoes.ehEquipavel(item);
  }

  /** Acrescenta itens que chegaram, tira os que acabaram e atualiza as quantidades. */
  private sincronizar(chave: ChaveConteiner, area: Area): void {
    const aberto = this.conteineres[chave];
    if (!aberto) return;
    const estoque = chave === 'corpo' ? this.estoqueDoCorpo() : this.acoes.estoque();
    if (!estoque) return;
    const presentes = new Map([...aberto.caixa.querySelectorAll<HTMLImageElement>('img[data-item]')].map((i) => [i.dataset.item!, i]));
    let indice = 0;
    for (const [id, qtd] of Object.entries(estoque)) {
      if (!this.mostra(chave, id) || !this.recursos.itens[id]) continue;
      const atual = presentes.get(id);
      presentes.delete(id);
      if (qtd <= 0) {
        atual?.remove();
        continue;
      }
      const meta = this.recursos.itens[id]!;
      const titulo = qtd > 1 ? `${meta.nome} (${qtd})` : meta.nome;
      if (atual) {
        if (atual.title !== titulo) atual.title = titulo;
        indice++;
        continue;
      }
      const img = document.createElement('img');
      img.src = `/interface/itens/${id}.png`;
      img.alt = meta.nome;
      img.dataset.item = id;
      img.title = titulo;
      img.draggable = false;
      img.addEventListener('dblclick', () => (chave === 'corpo' ? this.lootarItem(id) : this.usarNoConteiner(id)));
      const chavePos = `${chave}:${id}`;
      const pos = this.itensMochila.get(chavePos) ?? {
        x: Math.round(area.x + (indice % area.colunas) * area.celulaX + area.celulaX / 2 - meta.largura / 2),
        y: Math.round(area.y + Math.floor(indice / area.colunas) * area.celulaY + area.celulaY / 2 - meta.altura / 2),
      };
      this.itensMochila.set(chavePos, pos);
      img.style.left = `${pos.x}px`;
      img.style.top = `${pos.y}px`;
      this.arrastarItem(img, chavePos, meta.largura, meta.altura, area);
      aberto.caixa.append(img);
      indice++;
    }
    for (const sobra of presentes.values()) sobra.remove();
  }

  /** Itens do corpo aberto; se ele sumiu ou ficou longe, a janela fecha. */
  private estoqueDoCorpo(): Record<string, number> | null {
    const estoque = this.corpoAberto ? this.acoes.estoqueCorpo(this.corpoAberto) : null;
    if (!estoque) this.fechar('corpo');
    return estoque;
  }

  private lootarItem(id: string): void {
    if (this.corpoAberto) this.acoes.lootar(this.corpoAberto, id);
    this.atualizarMochila();
  }

  private usarNoConteiner(id: string): void {
    if (id === ITEM_SPELLBOOK) void this.alternarLivro();
    else if (id === this.acoes.itemBau) void this.alternarBau();
    else if (id === this.acoes.itemDeed) this.acoes.usarDeed();
    else if (this.acoes.ehEquipavel(id)) {
      this.acoes.equipar(id);
      void this.redesenharPaperdoll();
    } else this.acoes.usar(id);
    this.atualizarMochila();
  }

  /** Status completo (gump 0x0802), com os valores atualizados enquanto estiver aberto. */
  async alternarStatus(obter: () => DadosStatus): Promise<void> {
    if (this.status) {
      this.fechar('status');
      return;
    }
    const fundo = await carregar('/interface/gumps/0x0802.png');
    if (!fundo) return;
    const canvas = document.createElement('canvas');
    canvas.width = fundo.width;
    canvas.height = fundo.height;
    const el = this.janela('status', canvas, { x: 12, y: 150 });
    this.status = { el, canvas, fundo, obter };
    this.atualizarStatus();
  }

  atualizarStatus(): void {
    if (!this.status) return;
    const { canvas, fundo, obter } = this.status;
    const d = obter();
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(fundo, 0, 0);
    const fonte = this.recursos.fontes.texto;
    const escrever = (texto: string, x: number, y: number): void => {
      if (fonte) fonte.desenhar(g, texto, x, y - 2, '#1a1410', { alinhar: 'esquerda', contorno: null });
      else {
        g.font = '11px serif';
        g.fillStyle = '#1a1410';
        g.fillText(texto, x, y + 10);
      }
    };
    // Posições dos campos no gump Outlands 0x0802 (282×151)
    escrever(d.nome, 68, 34);
    const esquerda: Array<[number, number]> = [[d.str, 51], [d.dex, 68], [d.int, 85]];
    for (const [v, y] of esquerda) escrever(String(v), 47, y);
    escrever('Masc.', 47, 102);
    escrever(String(d.ar), 47, 119);
    const direita: Array<[string, number]> = [
      [`${d.vida}/${d.vidaMax}`, 51], [`${d.mana}/${d.manaMax}`, 68], [`${d.stam}/${d.stamMax}`, 85],
      [String(d.ouro), 102], [String(d.peso), 119],
    ];
    for (const [v, y] of direita) escrever(v, 183, y);
  }

  /** Atualiza a mochila e o baú abertos (itens que chegaram, acabaram ou mudaram de quantidade). */
  atualizarMochila(): void {
    this.sincronizar('mochila', AREA_MOCHILA);
    this.sincronizar('bau', AREA_BAU);
    this.sincronizar('corpo', AREA_CORPO);
  }

  /** Livro de magias (gump 0x08AC): círculos 1–4 na página da esquerda, 5–8 na da direita. */
  async alternarLivro(): Promise<void> {
    if (this.livro) {
      this.fechar('livro');
      return;
    }
    const fundo = await carregar(`/interface/gumps/${GUMP_LIVRO}.png`);
    if (!fundo) return;
    const caixa = document.createElement('div');
    caixa.className = 'livro';
    caixa.style.width = `${fundo.width}px`;
    caixa.style.height = `${fundo.height}px`;
    caixa.style.backgroundImage = `url(${fundo.src})`;
    const fonte = this.recursos.fontes.titulo ?? this.recursos.fontes.texto;
    const escrever = (texto: string, x: number, y: number, cor: string, magia?: string): void => {
      const el: HTMLElement = fonte ? fonte.emCanvas(texto, cor, null) : Object.assign(document.createElement('span'), { textContent: texto });
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      if (magia) {
        el.classList.add('magia');
        el.dataset.magia = magia;
        el.title = 'Clique para lançar';
        el.addEventListener('click', () => this.acoes.lancar(magia));
      }
      caixa.append(el);
    };
    escrever('Magery', 66, 18, '#5a1010');
    const magias = [...this.acoes.magias()].sort((a, b) => a.circulo - b.circulo);
    // Círculos 1–3 na página da esquerda, 4–8 na da direita
    let esquerda = 40;
    let direita = 22;
    for (const m of magias) {
      const naDireita = m.circulo >= 4;
      const y = naDireita ? direita : esquerda;
      escrever(`${m.circulo}º  ${m.nome.replace('Magic Reflection', 'Magic Reflect')}`, naDireita ? 226 : 62, y, '#2a1a0a', m.id);
      if (naDireita) direita += 17;
      else esquerda += 17;
    }
    this.livro = this.janela('livro', caixa, { x: 300, y: 90 });
  }

  // ---------- helpers ----------

  private janela(chave: string, conteudo: HTMLElement, padrao: { x: number; y: number }): HTMLElement {
    const el = document.createElement('div');
    el.className = 'gump';
    el.dataset.janela = chave;
    const pos = this.posicoes.get(chave) ?? padrao;
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.append(conteudo);
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.fechar(chave);
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || ['IMG', 'BUTTON'].includes((e.target as HTMLElement).tagName)) return;
      e.preventDefault();
      const inicio = { x: e.clientX - el.offsetLeft, y: e.clientY - el.offsetTop };
      const mover = (m: MouseEvent) => {
        el.style.left = `${m.clientX - inicio.x}px`;
        el.style.top = `${m.clientY - inicio.y}px`;
      };
      const soltar = () => {
        this.posicoes.set(chave, { x: el.offsetLeft, y: el.offsetTop });
        window.removeEventListener('mousemove', mover);
        window.removeEventListener('mouseup', soltar);
      };
      window.addEventListener('mousemove', mover);
      window.addEventListener('mouseup', soltar);
    });
    this.raiz.append(el);
    return el;
  }

  private fechar(chave: string): void {
    if (chave === 'paperdoll') {
      this.paperdoll?.el.remove();
      this.paperdoll = null;
    } else if (chave === 'livro') {
      this.livro?.remove();
      this.livro = null;
    } else if (chave === 'status') {
      this.status?.el.remove();
      this.status = null;
    } else if (chave === 'jornal') {
      this.jornalEl?.remove();
      this.jornalEl = null;
      this.jornalMsgs = null;
    } else if (chave === 'mochila' || chave === 'bau') {
      this.conteineres[chave]?.el.remove();
      this.conteineres[chave] = null;
    } else if (chave === 'corpo') {
      this.conteineres.corpo?.el.remove();
      this.conteineres.corpo = null;
      this.corpoAberto = null;
    }
  }

  /** Itens podem ser arrastados dentro da área útil do contêiner. */
  private arrastarItem(img: HTMLImageElement, id: string, w: number, h: number, area: Area): void {
    img.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const inicio = { x: e.clientX - img.offsetLeft, y: e.clientY - img.offsetTop };
      const origem = { x: e.clientX, y: e.clientY };
      let arrastou = false;
      const mover = (m: MouseEvent) => {
        // Só vira arraste depois de alguns pixels (assim o duplo clique continua funcionando)
        if (!arrastou && Math.hypot(m.clientX - origem.x, m.clientY - origem.y) < 4) return;
        arrastou = true;
        img.classList.add('arrastando');
        const x = Math.max(area.x - w / 2, Math.min(area.x + area.w - w / 2, m.clientX - inicio.x));
        const y = Math.max(area.y - h / 2, Math.min(area.y + area.h - h / 2, m.clientY - inicio.y));
        img.style.left = `${x}px`;
        img.style.top = `${y}px`;
      };
      const soltar = () => {
        if (arrastou) {
          img.classList.remove('arrastando');
          this.itensMochila.set(id, { x: img.offsetLeft, y: img.offsetTop });
          img.parentElement?.append(img); // o item solto fica por cima dos outros
        }
        window.removeEventListener('mousemove', mover);
        window.removeEventListener('mouseup', soltar);
      };
      window.addEventListener('mousemove', mover);
      window.addEventListener('mouseup', soltar);
    });
  }

  private temPixel(img: HTMLImageElement, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return false;
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const g = c.getContext('2d')!;
    g.drawImage(img, -x, -y);
    return g.getImageData(0, 0, 1, 1).data[3]! > 0;
  }
}
