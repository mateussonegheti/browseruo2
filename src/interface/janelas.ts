// Janelas no estilo dos gumps do UO: paperdoll e mochila. Arrastáveis; botão direito fecha.
import type { Animacoes } from '../render/animacoes';
import type { RecursosInterface } from './recursos';

/** Uma peça desenhada no paperdoll: gump (public/interface/gumps/) e matiz opcional. */
export interface PecaPaperdoll {
  gump: string;
  matiz?: number;
}

const GUMP_PAPERDOLL = '0x07D0';
const GUMP_MOCHILA_PAPERDOLL = '0xC4F6';
const GUMP_MOCHILA = '0x003C';
const GUMP_LIVRO = '0x08AC';
const ITEM_SPELLBOOK = '0x0EFA';
/** Onde o corpo fica dentro do paperdoll (posição do cliente clássico). */
const CORPO_X = 8;
const CORPO_Y = 19;
/** Área útil da mochila 0x3C, onde os itens podem ficar. */
const AREA_MOCHILA = { x: 44, y: 65, w: 142, h: 94 };

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
  private paperdoll: HTMLElement | null = null;
  private mochila: HTMLElement | null = null;
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
    return Boolean(this.paperdoll || this.mochila || this.livro);
  }

  async alternarPaperdoll(nome: string, pecas: PecaPaperdoll[]): Promise<void> {
    if (this.paperdoll) {
      this.fechar('paperdoll');
      return;
    }
    const fundo = await carregar(`/interface/gumps/${GUMP_PAPERDOLL}.png`);
    if (!fundo) return;
    const canvas = document.createElement('canvas');
    canvas.width = fundo.width;
    canvas.height = fundo.height;
    const g = canvas.getContext('2d')!;
    g.drawImage(fundo, 0, 0);
    for (const p of [...pecas, { gump: GUMP_MOCHILA_PAPERDOLL }]) {
      const img = await carregar(`/interface/gumps/${p.gump}.png`);
      if (!img) continue;
      g.drawImage(p.matiz === undefined ? img : this.animacoes.tingir(img, p.matiz), CORPO_X, CORPO_Y);
    }
    const fonte = this.recursos.fontes.titulo ?? this.recursos.fontes.texto;
    if (fonte) fonte.desenhar(g, nome, canvas.width / 2, canvas.height - 44, '#e8d9a8', { contorno: '#000000' });
    else {
      g.font = 'bold 14px serif';
      g.textAlign = 'center';
      g.fillStyle = '#e8d9a8';
      g.fillText(nome, canvas.width / 2, canvas.height - 30);
    }
    // Duplo clique na mochila desenhada no corpo abre a mochila
    const mascara = await carregar(`/interface/gumps/${GUMP_MOCHILA_PAPERDOLL}.png`);
    canvas.addEventListener('dblclick', (e) => {
      if (mascara && this.temPixel(mascara, e.offsetX - CORPO_X, e.offsetY - CORPO_Y)) void this.alternarMochila();
    });
    this.paperdoll = this.janela('paperdoll', canvas, { x: 80, y: 120 });
  }

  async alternarMochila(): Promise<void> {
    if (this.mochila) {
      this.fechar('mochila');
      return;
    }
    const fundo = await carregar(`/interface/gumps/${GUMP_MOCHILA}.png`);
    if (!fundo) return;
    const caixa = document.createElement('div');
    caixa.className = 'mochila';
    caixa.style.width = `${fundo.width}px`;
    caixa.style.height = `${fundo.height}px`;
    caixa.style.backgroundImage = `url(${fundo.src})`;
    Object.entries(this.acoes.estoque()).filter(([, qtd]) => qtd > 0).forEach(([id, qtd], i) => {
      const meta = this.recursos.itens[id];
      if (!meta) return;
      const img = document.createElement('img');
      img.src = `/interface/itens/${id}.png`;
      img.alt = meta.nome;
      img.dataset.item = id;
      img.title = qtd > 1 ? `${meta.nome} (${qtd})` : meta.nome;
      img.draggable = false;
      // Duplo clique usa o item (poções) ou abre o livro de magias
      img.addEventListener('dblclick', () => {
        if (id === ITEM_SPELLBOOK) void this.alternarLivro();
        else this.acoes.usar(id);
        this.atualizarMochila();
      });
      // Grade de 5 colunas na área útil, centralizando cada item na sua casa
      const pos = this.itensMochila.get(id) ?? {
        x: Math.round(AREA_MOCHILA.x + (i % 5) * 29 + 14 - meta.largura / 2),
        y: Math.round(AREA_MOCHILA.y + Math.floor(i / 5) * 31 + 15 - meta.altura / 2),
      };
      this.itensMochila.set(id, pos);
      img.style.left = `${pos.x}px`;
      img.style.top = `${pos.y}px`;
      this.arrastarItem(img, id, meta.largura, meta.altura);
      caixa.append(img);
    });
    this.mochila = this.janela('mochila', caixa, { x: 380, y: 180 });
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

  /** Atualiza as quantidades da mochila aberta (itens esgotados somem). */
  atualizarMochila(): void {
    if (!this.mochila) return;
    const estoque = this.acoes.estoque();
    for (const img of this.mochila.querySelectorAll<HTMLImageElement>('img[data-item]')) {
      const id = img.dataset.item!;
      const qtd = estoque[id] ?? 0;
      if (qtd <= 0) {
        img.remove();
        continue;
      }
      const nome = this.recursos.itens[id]?.nome ?? id;
      const titulo = qtd > 1 ? `${nome} (${qtd})` : nome;
      if (img.title !== titulo) img.title = titulo;
    }
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
      this.paperdoll?.remove();
      this.paperdoll = null;
    } else if (chave === 'livro') {
      this.livro?.remove();
      this.livro = null;
    } else if (chave === 'status') {
      this.status?.el.remove();
      this.status = null;
    } else {
      this.mochila?.remove();
      this.mochila = null;
    }
  }

  /** Itens podem ser arrastados dentro da área útil da mochila. */
  private arrastarItem(img: HTMLImageElement, id: string, w: number, h: number): void {
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
        const x = Math.max(AREA_MOCHILA.x - w / 2, Math.min(AREA_MOCHILA.x + AREA_MOCHILA.w - w / 2, m.clientX - inicio.x));
        const y = Math.max(AREA_MOCHILA.y - h / 2, Math.min(AREA_MOCHILA.y + AREA_MOCHILA.h - h / 2, m.clientY - inicio.y));
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
