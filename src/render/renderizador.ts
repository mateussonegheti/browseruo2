import { DESLOCAMENTO } from '../nucleo/direcoes';
import { METADE_ALTURA as A, METADE_LARGURA as L, PIXELS_POR_Z, tileParaMundo, mundoParaTile, type Ponto } from '../nucleo/projecao';
import type { Arena } from '../mundo/mapa';
import type { CatalogoTiles } from '../mundo/catalogo';
import type { DefinicaoTile, ObjetoMapa } from '../mundo/tipos';
import { alturaVisual, chaveOrdem } from '../mundo/colisao';
import { posicaoVisual, type EstadoJogador } from '../jogo/jogador';
import type { AcaoAnimacao, Animacoes, Camada } from './animacoes';
import type { FonteUO } from '../interface/recursos';

/** Um personagem a desenhar (jogador ou bot). */
export interface PersonagemRender {
  mov: EstadoJogador;
  nome: string;
  cor: string;
  vidaFrac: number;
  morto: boolean;
  envenenado: boolean;
  paralisado: boolean;
  reflexo: boolean;
  /** Último alvo do jogador: ganha um contorno. */
  destaque: boolean;
  /** Corpo e roupas (animações do cliente). Sem elas, desenha o boneco simples. */
  camadas?: Camada[];
  acao?: AcaoAnimacao;
  /** 0 a 1 ao longo da ação atual. */
  progresso?: number;
  /** Animação da montaria quando o personagem está montado. */
  montaria?: string;
}

export interface QuadroRender {
  arena: Arena;
  personagens: PersonagemRender[];
  agora: number;
  /** Centro da câmera em coordenadas de mundo (pixels, antes do zoom). */
  camera: Ponto;
  hover: { x: number; y: number } | null;
  fantasma: { def: DefinicaoTile; z: number } | null;
  grade: boolean;
  /** Desenhado por cima de tudo, em coordenadas do mundo (efeitos de magia, textos). */
  /** Telhados e andares de cima escondidos (jogador dentro da casa). */
  ocultos?: ReadonlySet<ObjetoMapa>;
  sobreposicao?: (ctx: CanvasRenderingContext2D) => void;
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
  /** Fonte do cliente para nomes e textos (sem ela, usa a fonte do sistema). */
  fonte?: FonteUO;

  constructor(
    private readonly canvas: HTMLCanvasElement, private readonly catalogo: CatalogoTiles,
    private readonly animacoes?: Animacoes,
  ) {
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
    for (const p of q.personagens) this.coletarPersonagem(p, q.agora, itens, q.arena);
    itens.sort((a, b) => a.chave - b.chave);
    for (const item of itens) item.desenhar();
    q.sobreposicao?.(ctx);

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
      if (q.ocultos?.has(o)) continue;
      const m = tileParaMundo(o.x, o.y, o.z);
      if (!visivel(m.x, m.y, 160)) continue;
      const def = this.catalogo.obter(o.id);
      saida.push({
        chave: chaveOrdem(o.x, o.y, o.z, def),
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

  /**
   * Desenha uma estrutura (casa) em qualquer contexto, com a origem em (ox, oy) do mapa.
   * Devolve false se algum sprite ainda estiver carregando.
   */
  desenharEstrutura(
    ctx: CanvasRenderingContext2D, tiles: ReadonlyArray<readonly [number, number, number, number]>,
    ox: number, oy: number, alfa: number, apenasChao = false,
  ): boolean {
    let completo = true;
    const ordenados = tiles
      .map(([id, x, y, z]) => ({ id, x: ox + x, y: oy + y, z, def: this.catalogo.obter(id) }))
      .sort((a, b) => chaveOrdem(a.x, a.y, a.z, a.def) - chaveOrdem(b.x, b.y, b.z, b.def));
    for (const t of ordenados) {
      const def = t.def;
      if (!def?.sprite || (apenasChao && t.z >= 20)) continue;
      const sprite = this.imagem(def.sprite.arquivo);
      if (!sprite) {
        completo = false;
        continue;
      }
      const m = tileParaMundo(t.x, t.y, t.z);
      ctx.globalAlpha = alfa;
      ctx.drawImage(sprite, m.x - def.sprite.largura / 2, m.y + A - def.sprite.altura);
    }
    ctx.globalAlpha = 1;
    return completo;
  }

  /** Pegada da estrutura: losangos verdes (livre) ou vermelhos (não dá). */
  desenharPegada(ctx: CanvasRenderingContext2D, tiles: ReadonlyArray<{ x: number; y: number }>, livre: boolean): void {
    ctx.fillStyle = livre ? 'rgba(80,220,100,.35)' : 'rgba(230,60,60,.4)';
    for (const t of tiles) {
      const m = tileParaMundo(t.x, t.y);
      losango(ctx, m.x, m.y);
      ctx.fill();
    }
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

  // ---------- personagens ----------

  private coletarPersonagem(p: PersonagemRender, agora: number, saida: ItemOrdenado[], arena: Arena): void {
    const pos = posicaoVisual(p.mov, agora);
    const z = alturaVisual(arena, this.catalogo, p.mov, agora);
    const m = p.mov.movimento;
    // Tile de referência para ordenação: passa para o destino na metade do passo.
    const meio = m && (agora - m.inicio) / m.duracao >= 0.5;
    // Ao descer na tela, o destino já vale desde o início: o piso dele (elevado) não pode cobrir quem chega
    const destino = m && (meio || m.paraX + m.paraY > m.deX + m.deY);
    const refX = m ? (destino ? m.paraX : m.deX) : p.mov.x;
    const refY = m ? (destino ? m.paraY : m.deY) : p.mov.y;
    saida.push({
      chave: (refX + refY) * 10000 + 9000,
      desenhar: () => this.desenharPersonagem(tileParaMundo(pos.x, pos.y, z), p),
    });
  }

  private desenharPersonagem(c: Ponto, p: PersonagemRender): void {
    const { ctx } = this;
    if (p.camadas && this.animacoes?.tem(p.camadas[0]?.nome ?? '')) {
      this.desenharAnimado(c, p);
      return;
    }
    if (p.morto) {
      // Corpo caído
      ctx.fillStyle = 'rgba(120,120,120,0.85)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 2, 16, 6, -0.3, 0, Math.PI * 2);
      ctx.fill();
      this.textoCentral(`${p.nome} (morto)`, c.x, c.y - 14, '#b0b0b0');
      return;
    }
    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 4, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.destaque) {
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 4, 17, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Indicador de direção no chão
    const d = DESLOCAMENTO[p.mov.dir] ?? { dx: 0, dy: 1 };
    const alvo = tileParaMundo(d.dx * 0.6, d.dy * 0.6);
    ctx.strokeStyle = 'rgba(255,230,120,0.9)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y + 4);
    ctx.lineTo(c.x + alvo.x, c.y + 4 + alvo.y);
    ctx.stroke();
    // Corpo e cabeça (verde se envenenado)
    ctx.fillStyle = p.envenenado ? '#3f9a3f' : p.cor;
    ctx.beginPath();
    ctx.roundRect(c.x - 8, c.y - 34, 16, 34, 6);
    ctx.fill();
    ctx.fillStyle = p.envenenado ? '#9fd99f' : '#f0c9a0';
    ctx.beginPath();
    ctx.arc(c.x, c.y - 42, 8, 0, Math.PI * 2);
    ctx.fill();
    if (p.paralisado) {
      ctx.strokeStyle = 'rgba(255,220,90,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x - 12, c.y - 52, 24, 56);
    }
    if (p.reflexo) {
      ctx.strokeStyle = 'rgba(120,180,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - 22, 18, 32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Nome e barra de vida
    this.textoCentral(p.nome, c.x, c.y - 56, p.cor === '#3d6fd1' ? '#9cc0ff' : '#ffb0a8');
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(c.x - 15, c.y + 10, 30, 4);
    ctx.fillStyle = p.envenenado ? '#55d655' : '#3c7bff';
    ctx.fillRect(c.x - 15, c.y + 10, 30 * Math.max(0, Math.min(1, p.vidaFrac)), 4);
  }

  /** Personagem com as animações do cliente: corpo, roupas, contornos de estado, nome e vida. */
  private desenharAnimado(c: Ponto, p: PersonagemRender): void {
    const { ctx } = this;
    if (!p.morto) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 4, 13, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.destaque && !p.morto) {
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 4, 17, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const acao = p.morto ? 'morrer' : p.acao ?? 'parado';
    const montado = Boolean(p.montaria) && !p.morto;
    if (montado) {
      // Montaria primeiro, depois o cavaleiro com as ações "montado-"
      const base = (acao === 'castar' ? 'castar' : acao) as AcaoAnimacao;
      this.animacoes!.desenhar(ctx, [{ nome: p.montaria! }], base, p.mov.dir, p.progresso ?? 0, c.x, c.y + 6);
      const cavaleiro = `montado-${acao === 'andar' || acao === 'correr' || acao === 'castar' ? acao : 'parado'}` as AcaoAnimacao;
      this.animacoes!.desenhar(ctx, p.camadas!, cavaleiro, p.mov.dir, p.progresso ?? 0, c.x, c.y + 6);
    } else {
      this.animacoes!.desenhar(ctx, p.camadas!, acao, p.mov.dir, p.progresso ?? 0, c.x, c.y + 6, p.morto ? 0.85 : 1);
    }
    if (p.morto) {
      this.textoCentral(`${p.nome} (morto)`, c.x, c.y - 14, '#b0b0b0');
      return;
    }
    const alto = montado ? 22 : 0; // montado, o nome e os contornos sobem
    if (p.envenenado) {
      ctx.fillStyle = 'rgba(80,220,80,0.25)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - 26 - alto, 14, 30, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.paralisado) {
      ctx.strokeStyle = 'rgba(255,220,90,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x - 14, c.y - 66 - alto, 28, 72 + alto);
    }
    if (p.reflexo) {
      ctx.strokeStyle = 'rgba(120,180,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - 28 - alto, 20, 38 + alto / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.textoCentral(p.nome, c.x, c.y - 72 - alto, p.cor === '#3d6fd1' ? '#9cc0ff' : '#ffb0a8');
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(c.x - 15, c.y + 12, 30, 4);
    ctx.fillStyle = p.envenenado ? '#55d655' : '#3c7bff';
    ctx.fillRect(c.x - 15, c.y + 12, 30 * Math.max(0, Math.min(1, p.vidaFrac)), 4);
  }

  private textoCentral(texto: string, x: number, y: number, cor: string): void {
    const { ctx } = this;
    if (this.fonte) {
      this.fonte.desenhar(ctx, texto, x, y - this.fonte.altura + 4, cor);
      return;
    }
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(texto, x, y);
    ctx.fillStyle = cor;
    ctx.fillText(texto, x, y);
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
    // Marcadores de spawn (A verde, B laranja)
    if (q.grade) {
      const marcadores: Array<[string, { x: number; y: number } | undefined, string]> = [
        ['A', q.arena.spawn, '#5ee0a0'], ['B', q.arena.spawnB, '#ffa850'],
      ];
      for (const [letra, ponto, cor] of marcadores) {
        if (!ponto) continue;
        const s = tileParaMundo(ponto.x, ponto.y);
        losango(ctx, s.x, s.y);
        ctx.strokeStyle = cor;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = cor;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(letra, s.x, s.y + 4);
      }
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
