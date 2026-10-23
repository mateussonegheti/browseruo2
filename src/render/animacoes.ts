// Animações de personagens e criaturas extraídas do anim.uoo (public/animacoes/).
import type { Direcao } from '../mundo/tipos';

interface RetQuadro {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Centro do quadro no formato do UO (ponto de apoio do personagem). */
  cx: number;
  cy: number;
}

interface MetaAnimacao {
  anim: number;
  tipo: 'humano' | 'animal' | 'monstro' | 'montaria';
  /** Animação usada quando alguém monta esta criatura. */
  montaria?: string;
  arquivo: string;
  rotulo: string;
  /** ação -> [direção armazenada 0..4] -> quadros */
  acoes: Record<string, RetQuadro[][]>;
}

export type AcaoBase = 'andar' | 'correr' | 'parado' | 'castar' | 'apanhar' | 'morrer' | 'atacar';
/** As ações do humano montado têm o prefixo "montado-". */
/** Também aceita as ações extraídas com outros nomes (ex.: "golpe-corte-1m", "guarda-2m"). */
export type AcaoAnimacao = AcaoBase | `montado-${'andar' | 'correr' | 'parado' | 'castar'}` | (string & {});

/** Uma camada desenhada (corpo ou roupa) com matiz opcional do hues.mul. */
export interface Camada {
  nome: string;
  matiz?: number;
}

/**
 * Direção do UO -> direção armazenada (0..4) e se espelha.
 * Só 5 direções existem no arquivo; Norte, Nordeste e Leste são espelhos de Oeste, Sudoeste e Sul.
 */
export function direcaoArmazenada(dir: Direcao): { dir: number; espelhar: boolean } {
  switch (dir) {
    case 3: return { dir: 0, espelhar: false }; // SE (para baixo na tela)
    case 4: return { dir: 1, espelhar: false }; // S
    case 2: return { dir: 1, espelhar: true }; // L
    case 5: return { dir: 2, espelhar: false }; // SO
    case 1: return { dir: 2, espelhar: true }; // NE
    case 6: return { dir: 3, espelhar: false }; // O
    case 0: return { dir: 3, espelhar: true }; // N
    default: return { dir: 4, espelhar: false }; // NO (para cima na tela)
  }
}

/** Ações substitutas quando o corpo não tem a pedida (ex.: monstro não corre). */
const SUBSTITUTA: Record<string, string> = {
  correr: 'andar', castar: 'atacar', atacar: 'parado', apanhar: 'parado', 'montado-castar': 'montado-parado',
  'andar-armado': 'andar', 'correr-armado': 'correr', 'guarda-1m': 'parado', 'guarda-2m': 'guarda-1m', soco: 'castar',
  'golpe-corte-1m': 'atacar', 'golpe-perfura-1m': 'golpe-corte-1m', 'golpe-esmaga-1m': 'golpe-corte-1m',
  'golpe-corte-2m': 'golpe-corte-1m', 'golpe-perfura-2m': 'golpe-corte-2m', 'golpe-esmaga-2m': 'golpe-corte-2m',
};

export class Animacoes {
  private meta = new Map<string, MetaAnimacao>();
  private imagens = new Map<string, HTMLImageElement>();
  private matizes = new Map<number, number[][]>();
  /** Folhas já recoloridas por (nome, matiz). */
  private tingidas = new Map<string, HTMLCanvasElement>();
  carregado = false;

  async carregar(url = '/animacoes/animacoes.json'): Promise<void> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return;
      const dados = (await resp.json()) as { animacoes: Record<string, MetaAnimacao>; matizes: Record<string, string[]> };
      for (const [hue, cores] of Object.entries(dados.matizes)) {
        this.matizes.set(Number(hue), cores.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))));
      }
      await Promise.all(Object.entries(dados.animacoes).map(([nome, m]) => new Promise<void>((ok) => {
        const img = new Image();
        img.onload = () => { this.meta.set(nome, m); this.imagens.set(nome, img); ok(); };
        img.onerror = () => ok();
        img.src = `/animacoes/${m.arquivo}`;
      })));
      this.carregado = this.meta.size > 0;
    } catch { /* sem animações extraídas: o renderizador usa o boneco simples */ }
  }

  tem(nome: string): boolean {
    return this.meta.has(nome);
  }

  /** Lista de corpos de criaturas (para o spawn). */
  criaturas(): Array<{ nome: string; rotulo: string; tipo: string }> {
    return [...this.meta.entries()]
      .filter(([, m]) => m.tipo === 'animal' || m.tipo === 'monstro')
      .filter(([nome]) => !nome.startsWith('montaria-'))
      .map(([nome, m]) => ({ nome, rotulo: m.rotulo, tipo: m.tipo }));
  }

  /** Animação da criatura com alguém em cima, se ela for montável. */
  montariaDe(nome: string): string | undefined {
    return this.meta.get(nome)?.montaria;
  }

  /** Quantos quadros a ação tem para o corpo (para calcular o quadro atual). */
  quadros(nome: string, acao: AcaoAnimacao): number {
    return this.lista(nome, acao)?.[0]?.length ?? 0;
  }

  /**
   * Desenha as camadas com o pé no ponto (x, y) da tela. `progresso` vai de 0 a 1 ao longo da ação
   * (o quadro é escolhido a partir dele), igual para todas as camadas.
   */
  desenhar(
    ctx: CanvasRenderingContext2D, camadas: Camada[], acao: AcaoAnimacao, dir: Direcao,
    progresso: number, x: number, y: number, alfa = 1,
  ): boolean {
    const base = camadas[0];
    if (!base || !this.meta.has(base.nome)) return false;
    const { dir: d, espelhar } = direcaoArmazenada(dir);
    // O instante do quadro (rAF) pode ser um pouco anterior ao início da ação (clique): limita a 0..1
    const t = Number.isFinite(progresso) ? Math.min(0.999, Math.max(0, progresso)) : 0;
    ctx.globalAlpha = alfa;
    for (const camada of camadas) {
      const quadros = this.lista(camada.nome, acao)?.[d];
      if (!quadros?.length) continue;
      const q = quadros[Math.floor(t * quadros.length)]!;
      const folha = this.folha(camada);
      if (!folha) continue;
      // Ponto de apoio: o centro (cx, cy) do quadro fica sobre o pé do personagem
      const topo = y - q.cy - q.h;
      if (espelhar) {
        ctx.save();
        ctx.translate(x, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(folha, q.x, q.y, q.w, q.h, -q.cx, topo, q.w, q.h);
        ctx.restore();
      } else {
        ctx.drawImage(folha, q.x, q.y, q.w, q.h, x - q.cx, topo, q.w, q.h);
      }
    }
    ctx.globalAlpha = 1;
    return true;
  }

  private lista(nome: string, acao: AcaoAnimacao): RetQuadro[][] | undefined {
    const m = this.meta.get(nome);
    if (!m) return undefined;
    let a: string | undefined = acao;
    while (a && !m.acoes[a]) a = SUBSTITUTA[a];
    return a ? m.acoes[a] : m.acoes['parado'];
  }

  /** Folha original ou recolorida com o matiz. */
  private folha(c: Camada): CanvasImageSource | undefined {
    const img = this.imagens.get(c.nome);
    if (!img || c.matiz === undefined) return img;
    return this.tingir(img, c.matiz);
  }

  /** Recolore uma imagem com um matiz do hues.mul (índice da cor = tom de cinza do pixel, como no cliente). */
  tingir(img: HTMLImageElement, matiz: number): CanvasImageSource {
    const chave = `${img.src}:${matiz}`;
    const pronta = this.tingidas.get(chave);
    if (pronta) return pronta;
    const tabela = this.matizes.get(matiz);
    if (!tabela) return img;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const dados = g.getImageData(0, 0, canvas.width, canvas.height);
    const px = dados.data;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const cinza = (px[i]! + px[i + 1]! + px[i + 2]!) / 3;
      const cor = tabela[Math.min(31, Math.round((cinza / 255) * 31))]!;
      px[i] = cor[0]!;
      px[i + 1] = cor[1]!;
      px[i + 2] = cor[2]!;
    }
    g.putImageData(dados, 0, 0);
    this.tingidas.set(chave, canvas);
    return canvas;
  }
}
