// Menu do deed: lista todas as casas e estruturas, com miniatura, para o jogador escolher.
import type { CasaDef } from '../mundo/casas';
import { tileParaMundo } from '../nucleo/projecao';
import type { Renderizador } from '../render/renderizador';

const LARGURA_MINIATURA = 150;
const ALTURA_MINIATURA = 110;

export class MenuCasas {
  private el: HTMLElement | null = null;
  private temporizador = 0;

  constructor(
    private readonly raiz: HTMLElement, private readonly renderizador: Renderizador,
    private readonly casas: readonly CasaDef[],
  ) {}

  get aberto(): boolean { return this.el !== null; }

  abrir(escolher: (casa: CasaDef) => void): void {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'gump menu-casas';
    const titulo = document.createElement('div');
    titulo.className = 'menu-casas-titulo';
    titulo.textContent = 'Deed de casa — escolha a estrutura';
    const fechar = document.createElement('button');
    fechar.textContent = '×';
    fechar.title = 'Fechar';
    fechar.addEventListener('click', () => this.fechar());
    titulo.append(fechar);
    const grade = document.createElement('div');
    grade.className = 'menu-casas-grade';
    const miniaturas: Array<() => boolean> = [];
    for (const casa of this.casas) {
      const cartao = document.createElement('button');
      cartao.className = 'menu-casas-cartao';
      const canvas = document.createElement('canvas');
      canvas.width = LARGURA_MINIATURA;
      canvas.height = ALTURA_MINIATURA;
      const nome = document.createElement('span');
      nome.textContent = casa.nome;
      const tam = document.createElement('small');
      tam.textContent = `${casa.largura}×${casa.profundidade}`;
      cartao.append(canvas, nome, tam);
      cartao.addEventListener('click', () => {
        this.fechar();
        escolher(casa);
      });
      grade.append(cartao);
      miniaturas.push(() => this.desenharMiniatura(canvas, casa));
    }
    el.append(titulo, grade);
    this.raiz.append(el);
    this.el = el;
    // Sprites carregam sob demanda: redesenha até todos terminarem
    let pendentes = miniaturas;
    const passo = (): void => {
      pendentes = pendentes.filter((desenhar) => !desenhar());
      if (pendentes.length && this.el === el) this.temporizador = window.setTimeout(passo, 150);
    };
    passo();
  }

  fechar(): void {
    window.clearTimeout(this.temporizador);
    this.el?.remove();
    this.el = null;
  }

  private desenharMiniatura(canvas: HTMLCanvasElement, casa: CasaDef): boolean {
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [, x, y, z] of casa.tiles) {
      const m = tileParaMundo(x, y, z);
      x0 = Math.min(x0, m.x - 22); x1 = Math.max(x1, m.x + 22);
      y0 = Math.min(y0, m.y - 90); y1 = Math.max(y1, m.y + 12);
    }
    const escala = Math.min(LARGURA_MINIATURA / (x1 - x0), ALTURA_MINIATURA / (y1 - y0), 1);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(escala, escala);
    ctx.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    const completo = this.renderizador.desenharEstrutura(ctx, casa.tiles, 0, 0, 1);
    ctx.restore();
    return completo;
  }
}
