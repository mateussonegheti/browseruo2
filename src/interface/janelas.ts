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
/** Onde o corpo fica dentro do paperdoll (posição do cliente clássico). */
const CORPO_X = 8;
const CORPO_Y = 19;
const GUMP_BAU = '0x004C';
/** Área útil de cada contêiner (onde os itens podem ficar) e a grade inicial. */
const AREA_MOCHILA = { x: 44, y: 65, w: 142, h: 94, colunas: 5, celulaX: 29, celulaY: 31 };
const AREA_BAU = { x: 46, y: 62, w: 166, h: 120, colunas: 7, celulaX: 24, celulaY: 40 };

type Area = typeof AREA_MOCHILA;
type ChaveConteiner = 'mochila' | 'bau';

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
  /** Item da mochila que abre o baú. */
  itemBau: string;
  magias(): Array<{ id: string; nome: string; circulo: number }>;
  lancar(magia: string): void;
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
  private paperdoll: { el: HTMLElement; canvas: HTMLCanvasElement; nome: string; pecas: () => PecaPaperdoll[] } | null = null;
  private conteineres: Record<ChaveConteiner, { el: HTMLElement; caixa: HTMLElement } | null> = { mochila: null, bau: null };
  private livro: HTMLElement | null = null;
  private status: { el: HTMLElement; canvas: HTMLCanvasElement; fundo: HTMLImageElement; obter: () => DadosStatus } | null = null;
  private posicoes = new Map<string, { x: number; y: number }>();
  /** Posição de cada item dentro da mochila (mantida ao fechar e abrir). */
  private itensMochila = new Map<string, { x: number; y: number }>();

  constructor(
    private readonly raiz: HTMLElement, private readonly recursos: RecursosInterface,
    private readonly animacoes: Animacoes, private readonly acoes: AcoesJanelas,
  ) {}

  get abertas(): boolean {
    return Boolean(this.paperdoll || this.conteineres.mochila || this.conteineres.bau || this.livro);
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
    const el = this.janela('paperdoll', canvas, { x: 80, y: 120 });
    this.paperdoll = { el, canvas, nome, pecas };
    await this.redesenharPaperdoll();
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
    return chave === 'bau' ? this.acoes.ehEquipavel(item) : !this.acoes.ehEquipavel(item);
  }

  /** Acrescenta itens que chegaram, tira os que acabaram e atualiza as quantidades. */
  private sincronizar(chave: ChaveConteiner, area: Area): void {
    const aberto = this.conteineres[chave];
    if (!aberto) return;
    const estoque = this.acoes.estoque();
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
      img.addEventListener('dblclick', () => this.usarNoConteiner(id));
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

  private usarNoConteiner(id: string): void {
    if (id === ITEM_SPELLBOOK) void this.alternarLivro();
    else if (id === this.acoes.itemBau) void this.alternarBau();
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
    // Posições dos campos no gump do cliente
    escrever(d.nome, 86, 40);
    const esquerda: Array<[number, number]> = [[d.str, 61], [d.dex, 73], [d.int, 85]];
    for (const [v, y] of esquerda) escrever(String(v), 86, y);
    escrever('Masc.', 86, 97);
    escrever(String(d.ar), 86, 109);
    const direita: Array<[string, number]> = [
      [`${d.vida}/${d.vidaMax}`, 61], [`${d.mana}/${d.manaMax}`, 73], [`${d.stam}/${d.stamMax}`, 85],
      [String(d.ouro), 97], [String(d.peso), 109],
    ];
    for (const [v, y] of direita) escrever(v, 172, y);
  }

  /** Atualiza a mochila e o baú abertos (itens que chegaram, acabaram ou mudaram de quantidade). */
  atualizarMochila(): void {
    this.sincronizar('mochila', AREA_MOCHILA);
    this.sincronizar('bau', AREA_BAU);
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
    let esquerda = 44;
    let direita = 44;
    for (const m of magias) {
      const naDireita = m.circulo >= 5;
      const y = naDireita ? direita : esquerda;
      escrever(`${m.circulo}º  ${m.nome.replace('Magic Reflection', 'Magic Reflect')}`, naDireita ? 232 : 66, y, '#2a1a0a', m.id);
      if (naDireita) direita += 22;
      else esquerda += 22;
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
      if (e.button !== 0 || (e.target as HTMLElement).tagName === 'IMG') return;
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
    } else if (chave === 'mochila' || chave === 'bau') {
      this.conteineres[chave]?.el.remove();
      this.conteineres[chave] = null;
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
