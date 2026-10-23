// Menu do totem: lista de itens que o jogador pode pegar (deed de casa e, no futuro, outros).
import type { MetaItem } from './recursos';

export interface EntradaTotem {
  id: string;
  meta: MetaItem | undefined;
}

export class MenuTotem {
  private el: HTMLElement | null = null;

  constructor(private readonly raiz: HTMLElement) {}

  get aberto(): boolean { return this.el !== null; }

  abrir(entradas: readonly EntradaTotem[], pegar: (id: string) => void): void {
    this.fechar();
    const el = document.createElement('div');
    el.className = 'gump menu-casas menu-totem';
    const titulo = document.createElement('div');
    titulo.className = 'menu-casas-titulo';
    titulo.textContent = 'Totem — escolha um item';
    const fechar = document.createElement('button');
    fechar.textContent = '×';
    fechar.title = 'Fechar';
    fechar.addEventListener('click', () => this.fechar());
    titulo.append(fechar);
    const grade = document.createElement('div');
    grade.className = 'menu-casas-grade';
    for (const { id, meta } of entradas) {
      const cartao = document.createElement('button');
      cartao.className = 'menu-casas-cartao';
      const img = document.createElement('img');
      img.src = `/interface/itens/${id}.png`;
      img.alt = '';
      const nome = document.createElement('span');
      nome.textContent = meta?.nome ?? id;
      cartao.append(img, nome);
      cartao.addEventListener('click', () => pegar(id));
      grade.append(cartao);
    }
    el.append(titulo, grade);
    this.raiz.append(el);
    this.el = el;
  }

  fechar(): void {
    this.el?.remove();
    this.el = null;
  }
}
