import { DESLOCAMENTO } from '../nucleo/direcoes';
import { METADE_ALTURA as A, METADE_LARGURA as L, PIXELS_POR_Z, tileParaMundo, mundoParaTile, type Ponto } from '../nucleo/projecao';
import type { Arena } from '../mundo/mapa';
import type { CatalogoTiles } from '../mundo/catalogo';
import type { DefinicaoTile } from '../mundo/tipos';
import { posicaoVisual, type EstadoJogador } from '../jogo/jogador';

export interface QuadroRender {
  arena: Arena;
  jogador: EstadoJogador;
  agora: number;
  /** Centro da câmera em coordenadas de mundo (pixels, antes do zoom). */
  camera: Ponto;
  hover: { x: number; y: number } | null;
  fantasma: { def: DefinicaoTile; z: number } | null;
  grade: boolean;
}

interface ItemOrdenado {
  chave: number;
  desenhar: () => void;
}

const COR_DESCONHECIDO = '#ff00ff';

function escurecer(hex: string, fator: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * fator)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function losango(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - A);
  ctx.lineTo(cx + L, cy);
  ctx.lineTo(cx, cy + A);
  ctx.lineTo(cx - L, cy);
  ctx.closePath();
}

export class Renderizador {
  private readonly ctx: CanvasRenderingContext2D;
  private largura = 0;
  private altura = 0;
  private readonly imagens = new Map<string, HTMLImageElement | 'carregando' | 'erro'>();

  constructor(private readonly canvas: HTMLCanvasElement, private readonly catalogo: CatalogoTiles) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
    this.redimensionar();
  }

  redimensionar(): void {
    const dpr = window.devicePixelRatio || 1;
    this.largura = this.canvas.clientWidth;
    this.altura = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.largura * dpr);
    this.canvas.height = Math.round(this.altura * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Posição do mouse (px CSS do canvas) -> tile do chão sob o cursor. */
  canvasParaTile(cx: number, cy: number, camera: Ponto): { x: number; y: number } {
    return mundoParaTile(cx - this.largura / 2 + camera.x, cy - this.altura / 2 + camera.y);
  }

  /** Tile fracionário -> posição na tela (px CSS do canvas). */
  tileParaCanvas(x: number, y: number, camera: Ponto, z = 0): Ponto {
    const m = tileParaMundo(x, y, z);
    return { x: m.x - camera.x + this.largura / 2, y: m.y - camera.y + this.altura / 2 };
  }

  desenhar(q: QuadroRender): void {
    const { ctx } = this;
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, this.largura, this.altura);

    ctx.save();
    ctx.translate(this.largura / 2 - q.camera.x, this.altura / 2 - q.camera.y);

    const visivel = (mx: number, my: number, folga: number) =>
      mx + folga > q.camera.x - this.largura / 2 && mx - folga < q.camera.x + this.largura / 2 &&
      my + folga > q.camera.y - this.altura / 2 && my - folga < q.camera.y + this.altura / 2;

    this.desenharTerreno(q, visivel);
    if (q.grade) this.desenharGrade(q, visivel);

    const itens: ItemOrdenado[] = [];
    this.coletarObjetos(q, visivel, itens);
    this.coletarJogador(q, itens);
    itens.sort((a, b) => a.chave - b.chave);
    for (const item of itens) item.desenhar();

    this.desenharEdicao(q);
    ctx.restore();
  }

  // ---------- terreno ----------

  private desenharTerreno(q: QuadroRender, visivel: (x: number, y: number, f: number) => boolean): void {
    const { ctx } = this;
    for (let y = 0; y < q.arena.altura; y++) {
      for (let x = 0; x < q.arena.largura; x++) {
        const m = tileParaMundo(x, y);
        if (!visivel(m.x, m.y, 30)) continue;
        const def = this.catalogo.obter(q.arena.terrenoEm(x, y) ?? 0);
        const sprite = def?.sprite ? this.imagem(def.sprite.arquivo) : null;
        if (sprite) {
          ctx.drawImage(sprite, m.x - L, m.y - A, 44, 44);
          continue;
        }
        losango(ctx, m.x, m.y);
        ctx.fillStyle = def ? def.cor : COR_DESCONHECIDO;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  private desenharGrade(q: QuadroRender, visivel: (x: number, y: number, f: number) => boolean): void {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    for (let y = 0; y < q.arena.altura; y++) {
      for (let x = 0; x < q.arena.largura; x++) {
        const m = tileParaMundo(x, y);
        if (!visivel(m.x, m.y, 30)) continue;
        losango(ctx, m.x, m.y);
        ctx.stroke();
      }
    }
  }

  // ---------- objetos ----------

  private coletarObjetos(q: QuadroRender, visivel: (x: number, y: number, f: number) => boolean, saida: ItemOrdenado[]): void {
    for (const o of q.arena.dados.objetos) {
      const m = tileParaMundo(o.x, o.y, o.z);
      if (!visivel(m.x, m.y, 160)) continue;
      const def = this.catalogo.obter(o.id);
      saida.push({
        chave: (o.x + o.y) * 10000 + o.z,
        desenhar: () => this.desenharObjeto(def, m, 1),
      });
    }
  }

  private desenharObjeto(def: DefinicaoTile | undefined, base: Ponto, alfa: number): void {
    const { ctx } = this;
    ctx.globalAlpha = alfa;
    const sprite = def?.sprite ? this.imagem(def.sprite.arquivo) : null;
    if (def && sprite && def.sprite) {
      // Âncora: centro inferior da imagem no vértice inferior do losango do tile.
      ctx.drawImage(sprite, base.x - def.sprite.largura / 2, base.y + A - def.sprite.altura);
    } else {
      this.desenharCaixa(base, def ? def.altura : 10, def ? def.cor : COR_DESCONHECIDO);
    }
    ctx.globalAlpha = 1;
  }

  /** Placeholder: caixa isométrica com faces sombreadas. */
  private desenharCaixa(base: Ponto, alturaZ: number, cor: string): void {
    const { ctx } = this;
    const h = Math.max(1, alturaZ) * PIXELS_POR_Z;
    const topo = base.y - h;

    ctx.beginPath();
    ctx.moveTo(base.x - L, base.y); ctx.lineTo(base.x, base.y + A);
    ctx.lineTo(base.x, topo + A); ctx.lineTo(base.x - L, topo);
    ctx.closePath();
    ctx.fillStyle = escurecer(cor, 0.72);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(base.x, base.y + A); ctx.lineTo(base.x + L, base.y);
    ctx.lineTo(base.x + L, topo); ctx.lineTo(base.x, topo + A);
    ctx.closePath();
    ctx.fillStyle = escurecer(cor, 0.5);
    ctx.fill();

    losango(ctx, base.x, topo);
    ctx.fillStyle = cor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ---------- jogador ----------

  private coletarJogador(q: QuadroRender, saida: ItemOrdenado[]): void {
    const pos = posicaoVisual(q.jogador, q.agora);
    const m = q.jogador.movimento;
    // Tile de referência para ordenação: passa para o destino na metade do passo.
    const meio = m && (q.agora - m.inicio) / m.duracao >= 0.5;
    const refX = m ? (meio ? m.paraX : m.deX) : q.jogador.x;
    const refY = m ? (meio ? m.paraY : m.deY) : q.jogador.y;
    saida.push({
      chave: (refX + refY) * 10000 + 9000,
      desenhar: () => this.desenharPersonagem(tileParaMundo(pos.x, pos.y), q.jogador.dir),
    });
  }

  private desenharPersonagem(c: Ponto, dir: number): void {
    const { ctx } = this;
    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 4, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Indicador de direção no chão
    const d = DESLOCAMENTO[dir] ?? { dx: 0, dy: 1 };
    const alvo = tileParaMundo(d.dx * 0.6, d.dy * 0.6);
    ctx.strokeStyle = 'rgba(255,230,120,0.9)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y + 4);
    ctx.lineTo(c.x + alvo.x, c.y + 4 + alvo.y);
    ctx.stroke();
    // Corpo e cabeça
    ctx.fillStyle = '#3d6fd1';
    ctx.beginPath();
    ctx.roundRect(c.x - 8, c.y - 34, 16, 34, 6);
    ctx.fill();
    ctx.fillStyle = '#f0c9a0';
    ctx.beginPath();
    ctx.arc(c.x, c.y - 42, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- editor ----------

  private desenharEdicao(q: QuadroRender): void {
    const { ctx } = this;
    if (q.fantasma && q.hover) {
      const m = tileParaMundo(q.hover.x, q.hover.y, q.fantasma.def.tipo === 'objeto' ? q.fantasma.z : 0);
      if (q.fantasma.def.tipo === 'objeto') this.desenharObjeto(q.fantasma.def, m, 0.6);
      else {
        losango(ctx, m.x, m.y);
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = q.fantasma.def.cor;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (q.hover) {
      const m = tileParaMundo(q.hover.x, q.hover.y);
      losango(ctx, m.x, m.y);
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Marcador de spawn
    const s = tileParaMundo(q.arena.spawn.x, q.arena.spawn.y);
    if (q.grade) {
      losango(ctx, s.x, s.y);
      ctx.strokeStyle = '#5ee0a0';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ---------- sprites reais (quando existirem) ----------

  private imagem(arquivo: string): HTMLImageElement | null {
    const atual = this.imagens.get(arquivo);
    if (atual instanceof HTMLImageElement) return atual;
    if (atual) return null;
    this.imagens.set(arquivo, 'carregando');
    const img = new Image();
    img.onload = () => this.imagens.set(arquivo, img);
    img.onerror = () => this.imagens.set(arquivo, 'erro');
    img.src = `/sprites/${arquivo}`;
    return null;
  }
}
