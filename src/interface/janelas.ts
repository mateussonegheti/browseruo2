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
/** Onde o corpo fica dentro do paperdoll (posição do cliente clássico). */
const CORPO_X = 8;
const CORPO_Y = 19;
/** Área útil da mochila 0x3C, onde os itens podem ficar. */
const AREA_MOCHILA = { x: 44, y: 65, w: 142, h: 94 };

/** Conteúdo inicial da mochila: [arte do item, quantidade]. */
const CONTEUDO_MOCHILA: Array<[string, number]> = [
  ['0x0EFA', 1],
  ['0x0F7A', 100], ['0x0F7B', 100], ['0x0F84', 100], ['0x0F85', 100],
  ['0x0F86', 100], ['0x0F88', 100], ['0x0F8C', 100], ['0x0F8D', 100],
  ['0x0F0C', 10], ['0x0F07', 10], ['0x0F0B', 10], ['0x0F09', 10], ['0x0F0A', 10], ['0x0F08', 10],
];

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
  private posicoes = new Map<string, { x: number; y: number }>();
  /** Posição de cada item dentro da mochila (mantida ao fechar e abrir). */
  private itensMochila = new Map<string, { x: number; y: number }>();

  constructor(
    private readonly raiz: HTMLElement, private readonly recursos: RecursosInterface,
    private readonly animacoes: Animacoes,
  ) {}

  get abertas(): boolean {
    return Boolean(this.paperdoll || this.mochila);
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
    CONTEUDO_MOCHILA.forEach(([id, qtd], i) => {
      const meta = this.recursos.itens[id];
      if (!meta) return;
      const img = document.createElement('img');
      img.src = `/interface/itens/${id}.png`;
      img.alt = meta.nome;
      img.title = qtd > 1 ? `${meta.nome} (${qtd})` : meta.nome;
      img.draggable = false;
      const pos = this.itensMochila.get(id) ?? {
        x: AREA_MOCHILA.x + (i % 6) * 22 + (Math.floor(i / 6) % 2) * 8,
        y: AREA_MOCHILA.y + Math.floor(i / 6) * 28,
      };
      this.itensMochila.set(id, pos);
      img.style.left = `${pos.x}px`;
      img.style.top = `${pos.y}px`;
      this.arrastarItem(img, id, meta.largura, meta.altura);
      caixa.append(img);
    });
    this.mochila = this.janela('mochila', caixa, { x: 380, y: 180 });
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
      img.classList.add('arrastando');
      const mover = (m: MouseEvent) => {
        const x = Math.max(AREA_MOCHILA.x - w / 2, Math.min(AREA_MOCHILA.x + AREA_MOCHILA.w - w / 2, m.clientX - inicio.x));
        const y = Math.max(AREA_MOCHILA.y - h / 2, Math.min(AREA_MOCHILA.y + AREA_MOCHILA.h - h / 2, m.clientY - inicio.y));
        img.style.left = `${x}px`;
        img.style.top = `${y}px`;
      };
      const soltar = () => {
        img.classList.remove('arrastando');
        this.itensMochila.set(id, { x: img.offsetLeft, y: img.offsetTop });
        img.parentElement?.append(img); // o item solto fica por cima dos outros
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
