import type { EventoCombate } from '../combate/tipos';
import type { Ponto } from '../nucleo/projecao';
import type { FonteUO } from '../interface/recursos';

interface Visual {
  visual: string;
  origemId: string;
  alvoId: string;
  inicio: number;
  fim: number;
}

interface TextoFlutuante {
  alvoId: string;
  texto: string;
  cor: string;
  inicio: number;
  fim: number;
  /** Ordem de empilhamento sobre a cabeça. */
  linha: number;
}

/** Folha de quadros de um efeito do cliente (gerada pelo extrator em public/efeitos/). */
interface FolhaEfeito {
  arquivo: string;
  quadros: number;
  largura: number;
  altura: number;
  intervaloMs: number;
  /** "item": desenhado como objeto no tile do alvo; "gump": base da imagem nos pés do alvo (raio). */
  ancora: 'item' | 'gump';
  img?: HTMLImageElement;
}

const DURACAO_TEXTO_MS = 1600;
const DURACAO_PROJETIL_MS = 350;

/** Efeito do cliente usado em cada visual do motor (ids iguais aos do ServUO). */
const EFEITO_DO_VISUAL: Record<string, string> = {
  projetil: '0x379F', // Energy Bolt (MovingParticles)
  explosao: '0x36BD',
  'coluna-fogo': '0x3709',
  raio: 'raio', // gumps 0x4E20–0x4E29
  cura: '0x376A',
  paralisia: '0x376A',
  veneno: '0x374A',
  'cura-veneno': '0x373A',
  reflexo: '0x375A',
  refletido: '0x37B9',
};

/** Efeitos de magia e textos sobre os personagens, criados a partir dos eventos do motor. */
export class Efeitos {
  private visuais: Visual[] = [];
  private textos: TextoFlutuante[] = [];
  private folhas = new Map<string, FolhaEfeito>();
  /** Fonte do cliente para os textos sobre os personagens. */
  fonte?: FonteUO;

  /** Carrega as folhas extraídas do cliente. Sem elas, os efeitos são desenhados à mão. */
  async carregar(url = '/efeitos/efeitos.json'): Promise<void> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return;
      const dados = (await resp.json()) as { efeitos: Record<string, FolhaEfeito> };
      for (const [nome, f] of Object.entries(dados.efeitos)) {
        const img = new Image();
        img.onload = () => { f.img = img; };
        img.src = `/efeitos/${f.arquivo}`;
        this.folhas.set(nome, f);
      }
    } catch { /* sem efeitos extraídos */ }
  }

  adicionar(ev: EventoCombate, agora: number): void {
    switch (ev.tipo) {
      case 'visual': {
        const folha = this.folha(ev.visual);
        let duracao = ev.duracaoMs;
        if (ev.visual === 'projetil') duracao = DURACAO_PROJETIL_MS;
        else if (folha) duracao = folha.quadros * folha.intervaloMs;
        this.visuais.push({ visual: ev.visual, origemId: ev.origemId, alvoId: ev.alvoId, inicio: agora, fim: agora + duracao });
        break;
      }
      case 'dano':
        this.texto(ev.alvoId, `-${ev.valor}`, '#ff5a4f', agora);
        break;
      case 'cura':
        if (ev.valor > 0) this.texto(ev.alvoId, `+${ev.valor}`, '#6fe06f', agora);
        break;
      case 'texto':
        this.texto(ev.alvoId, ev.texto, ev.cor, agora);
        break;
      default:
        break;
    }
  }

  /** `posicao` devolve o pé do personagem em coordenadas do mundo (ou null se ele sumiu). */
  desenhar(ctx: CanvasRenderingContext2D, agora: number, posicao: (id: string) => Ponto | null): void {
    this.visuais = this.visuais.filter((v) => agora < v.fim);
    this.textos = this.textos.filter((t) => agora < t.fim);
    for (const v of this.visuais) {
      const a = posicao(v.origemId);
      const b = posicao(v.alvoId);
      if (!a || !b) continue;
      this.desenharVisual(ctx, v, a, b, (agora - v.inicio) / (v.fim - v.inicio));
    }
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    for (const t of this.textos) {
      const p = posicao(t.alvoId);
      if (!p) continue;
      const progresso = (agora - t.inicio) / (t.fim - t.inicio);
      const y = p.y - 70 - t.linha * 15 - progresso * 18;
      ctx.globalAlpha = progresso > 0.75 ? (1 - progresso) * 4 : 1;
      if (this.fonte) {
        this.fonte.desenhar(ctx, t.texto, p.x, y - this.fonte.altura + 4, t.cor);
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(t.texto, p.x, y);
        ctx.fillStyle = t.cor;
        ctx.fillText(t.texto, p.x, y);
      }
      ctx.globalAlpha = 1;
    }
  }

  private texto(alvoId: string, texto: string, cor: string, agora: number): void {
    const linha = this.textos.filter((t) => t.alvoId === alvoId && agora - t.inicio < 400).length;
    this.textos.push({ alvoId, texto, cor, inicio: agora, fim: agora + DURACAO_TEXTO_MS, linha });
  }

  private folha(visual: string): FolhaEfeito | undefined {
    const f = this.folhas.get(EFEITO_DO_VISUAL[visual] ?? '');
    return f?.img ? f : undefined;
  }

  private desenharVisual(ctx: CanvasRenderingContext2D, v: Visual, de: Ponto, para: Ponto, t: number): void {
    const corpo = (p: Ponto): Ponto => ({ x: p.x, y: p.y - 24 });
    const f = this.folha(v.visual);
    if (f?.img) {
      if (v.visual === 'projetil') {
        // Imagem parada que viaja girada na direção do alvo, como no cliente
        const a = corpo(de);
        const b = corpo(para);
        ctx.save();
        ctx.translate(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2);
        ctx.drawImage(f.img, 0, 0, f.largura, f.altura, -f.largura / 2, -f.altura / 2, f.largura, f.altura);
        ctx.restore();
        return;
      }
      const quadro = Math.min(f.quadros - 1, Math.max(0, Math.floor(t * f.quadros)));
      // item: base no vértice inferior do losango (como os objetos); gump (raio): ponta no peito do alvo
      const baseY = f.ancora === 'item' ? para.y + 22 : para.y - 24;
      // A ponta do raio fica à direita do centro do quadro: puxa para cima do alvo
      const ajusteX = f.ancora === 'gump' ? -18 : 0;
      ctx.drawImage(f.img, quadro * f.largura, 0, f.largura, f.altura,
        para.x - f.largura / 2 + ajusteX, baseY - f.altura, f.largura, f.altura);
      return;
    }
    switch (v.visual) {
      case 'projetil': {
        // Energy Bolt: esfera azul viajando até o alvo
        const a = corpo(de);
        const b = corpo(para);
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        brilho(ctx, x, y, 9, 'rgba(140,170,255,0.95)', 'rgba(60,90,255,0)');
        break;
      }
      case 'explosao': {
        // Explosion: nada até o fim do atraso, depois o estouro
        const fase = (t - 0.83) / 0.17;
        if (fase < 0) break;
        const c = corpo(para);
        brilho(ctx, c.x, c.y, 10 + fase * 30, `rgba(255,190,80,${1 - fase})`, 'rgba(255,60,0,0)');
        break;
      }
      case 'coluna-fogo': {
        const c = para;
        const alfa = t < 0.8 ? 0.9 : (1 - t) * 4.5;
        const grad = ctx.createLinearGradient(c.x, c.y, c.x, c.y - 90);
        grad.addColorStop(0, `rgba(255,120,30,${alfa})`);
        grad.addColorStop(1, 'rgba(255,220,80,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y - 40, 14 + Math.sin(t * 30) * 2, 50, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'raio': {
        const c = corpo(para);
        ctx.strokeStyle = `rgba(255,250,170,${1 - t})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        let x = c.x + 10;
        ctx.moveTo(x, c.y - 160);
        for (let y = c.y - 160; y < c.y; y += 20) {
          x = c.x + (Math.random() - 0.5) * 18;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
        break;
      }
      case 'veneno':
        bolhas(ctx, corpo(para), t, 'rgba(110,230,110,0.85)');
        break;
      case 'cura':
      case 'cura-veneno':
        bolhas(ctx, corpo(para), t, 'rgba(200,230,255,0.9)');
        break;
      case 'paralisia':
        bolhas(ctx, corpo(para), Math.min(1, t * 4), 'rgba(255,220,90,0.9)');
        break;
      case 'reflexo':
      case 'refletido': {
        const c = corpo(para);
        ctx.strokeStyle = `rgba(120,180,255,${1 - t})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 12 + t * 20, 20 + t * 30, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      default:
        break;
    }
  }
}

function brilho(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, centro: string, borda: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, centro);
  g.addColorStop(1, borda);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function bolhas(ctx: CanvasRenderingContext2D, c: Ponto, t: number, cor: string): void {
  ctx.fillStyle = cor;
  ctx.globalAlpha = 1 - t;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c.x + Math.cos(ang) * 12, c.y + 10 - t * 30 - (i % 2) * 8, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
