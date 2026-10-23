// Recursos de interface extraídos do cliente (public/interface/): cursores, fontes e itens.

interface MetaFonte {
  arquivo: string;
  altura: number;
  /** código do caractere -> [x no atlas, largura, deslocamento x] */
  glifos: Record<string, [number, number, number]>;
}

export interface MetaItem {
  nome: string;
  largura: number;
  altura: number;
}

/** Avanço do espaço: no unifont o glifo do espaço é vazio (o cliente usa uma largura fixa). */
const LARGURA_ESPACO = 5;

/** Fonte unicode do UO (unifont*.mul) desenhada a partir do atlas, em qualquer cor. */
export class FonteUO {
  private readonly coloridas = new Map<string, HTMLCanvasElement>();

  constructor(private readonly meta: MetaFonte, private readonly atlas: HTMLImageElement) {}

  get altura(): number {
    return this.meta.altura;
  }

  medir(texto: string): number {
    let w = 0;
    for (const ch of texto) {
      const g = this.meta.glifos[String(ch.codePointAt(0))];
      w += !g || !g[1] ? LARGURA_ESPACO : g[1] + g[2] + 1;
    }
    return Math.max(0, w - 1);
  }

  /** Desenha o texto com o topo em `y`; `alinhar` centraliza em `x`. `contorno` dá a borda escura do cliente. */
  desenhar(
    ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, cor: string,
    opcoes: { alinhar?: 'centro' | 'esquerda'; contorno?: string | null } = {},
  ): void {
    const inicio = opcoes.alinhar === 'esquerda' ? x : Math.round(x - this.medir(texto) / 2);
    const contorno = opcoes.contorno === undefined ? '#000000' : opcoes.contorno;
    if (contorno) {
      const atlas = this.colorida(contorno);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) this.escrever(ctx, atlas, texto, inicio + dx, y + dy);
    }
    this.escrever(ctx, this.colorida(cor), texto, inicio, Math.round(y));
  }

  /** Canvas com o texto pronto, para usar na interface HTML. */
  emCanvas(texto: string, cor: string, contorno: string | null = '#000000'): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.medir(texto) + 2;
    c.height = this.altura + 2;
    const g = c.getContext('2d')!;
    this.desenhar(g, texto, 1, 1, cor, { alinhar: 'esquerda', contorno });
    return c;
  }

  private escrever(ctx: CanvasRenderingContext2D, atlas: HTMLCanvasElement, texto: string, x: number, y: number): void {
    let cx = Math.round(x);
    for (const ch of texto) {
      const g = this.meta.glifos[String(ch.codePointAt(0))];
      if (!g || !g[1]) {
        cx += LARGURA_ESPACO;
        continue;
      }
      const [ax, w, dx] = g;
      ctx.drawImage(atlas, ax, 0, w, this.meta.altura, cx + dx, y, w, this.meta.altura);
      cx += w + dx + 1;
    }
  }

  private colorida(cor: string): HTMLCanvasElement {
    let c = this.coloridas.get(cor);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = this.atlas.width;
    c.height = this.atlas.height;
    const g = c.getContext('2d')!;
    g.drawImage(this.atlas, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = cor;
    g.fillRect(0, 0, c.width, c.height);
    this.coloridas.set(cor, c);
    return c;
  }
}

/** Item equipável: animação (nome em animacoes.json) e gump do paperdoll. */
export interface MetaEquipavel {
  nome: string;
  rotulo: string;
  camada: number;
  anim: string;
  gump: string;
}

export interface RecursosInterface {
  /** id do cursor -> ponto ativo [x, y] */
  cursores: Record<string, [number, number]>;
  fontes: { texto?: FonteUO; titulo?: FonteUO };
  itens: Record<string, MetaItem>;
  equipaveis: Record<string, MetaEquipavel>;
}

function carregarImagem(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

/** Carrega o que o extrator gerou; sem os arquivos, devolve recursos vazios (o jogo usa os padrões). */
export async function carregarRecursosInterface(url = '/interface/interface.json'): Promise<RecursosInterface> {
  const vazio: RecursosInterface = { cursores: {}, fontes: {}, itens: {}, equipaveis: {} };
  try {
    const resp = await fetch(url);
    if (!resp.ok) return vazio;
    const dados = (await resp.json()) as {
      cursores: Record<string, [number, number]>;
      fontes: Record<string, MetaFonte>;
      itens: Record<string, MetaItem>;
      equipaveis?: Record<string, MetaEquipavel>;
    };
    const fontes: RecursosInterface['fontes'] = {};
    for (const [nome, meta] of Object.entries(dados.fontes)) {
      const img = await carregarImagem(`/interface/fontes/${meta.arquivo}`);
      if (img && (nome === 'texto' || nome === 'titulo')) fontes[nome] = new FonteUO(meta, img);
    }
    return { cursores: dados.cursores, fontes, itens: dados.itens, equipaveis: dados.equipaveis ?? {} };
  } catch {
    return vazio;
  }
}

/** Valor de CSS `cursor` para um cursor do cliente (com o ponto ativo certo). */
export function cssCursor(r: RecursosInterface, id: string, reserva = 'auto'): string {
  const p = r.cursores[id];
  return p ? `url(/interface/cursores/${id}.png) ${p[0]} ${p[1]}, ${reserva}` : reserva;
}

/** Cursor direcional do UO: 0x206A + setor de 45° da tela, começando em "para cima" e no sentido horário. */
export function cursorDirecional(vx: number, vy: number): string {
  const graus = (Math.atan2(vx, -vy) * 180) / Math.PI; // 0 = cima, 90 = direita
  const setor = ((Math.round(graus / 45) % 8) + 8) % 8;
  return `0x${(0x206a + setor).toString(16).toUpperCase()}`;
}
