// Menu de contexto do botão direito sobre um personagem (estilo do menu popup do cliente).
import type { FonteUO } from './recursos';

export interface OpcaoMenu {
  rotulo: string;
  acao: () => void;
}

export class MenuContexto {
  private el: HTMLElement | null = null;

  constructor(private readonly raiz: HTMLElement, private readonly fonte?: FonteUO) {
    window.addEventListener('mousedown', (e) => {
      if (this.el && !this.el.contains(e.target as Node)) this.fechar();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.fechar();
    });
  }

  get aberto(): boolean {
    return Boolean(this.el);
  }

  abrir(x: number, y: number, titulo: string, opcoes: OpcaoMenu[]): void {
    this.fechar();
    const el = document.createElement('div');
    el.className = 'menu-contexto';
    el.append(this.rotulo(titulo, '#e8d9a8', 'titulo'));
    for (const o of opcoes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.opcao = o.rotulo;
      b.append(this.rotulo(o.rotulo, '#ffffff'));
      b.addEventListener('click', () => {
        this.fechar();
        o.acao();
      });
      el.append(b);
    }
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.raiz.append(el);
    // Mantém o menu dentro da tela
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.min(x, window.innerWidth - r.width - 4)}px`;
    el.style.top = `${Math.min(y, window.innerHeight - r.height - 4)}px`;
    this.el = el;
  }

  fechar(): void {
    this.el?.remove();
    this.el = null;
  }

  /** Texto na fonte do cliente (ou texto comum, sem os arquivos extraídos). */
  private rotulo(texto: string, cor: string, classe = ''): HTMLElement {
    if (this.fonte) {
      const c = this.fonte.emCanvas(texto, cor);
      if (classe) c.className = classe;
      return c;
    }
    const s = document.createElement('span');
    s.textContent = texto;
    if (classe) s.className = classe;
    return s;
  }
}
