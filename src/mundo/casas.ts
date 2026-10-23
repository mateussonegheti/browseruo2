// Casas e estruturas pré-moldadas (multi.mul do cliente), construídas pelo deed.
import type { Arena } from './mapa';
import type { CatalogoTiles } from './catalogo';
import type { ObjetoMapa } from './tipos';
import { Z_ANDAR_SUPERIOR } from './catalogo';

export interface CasaDef {
  id: string;
  nome: string;
  largura: number;
  profundidade: number;
  /** [id do tile no catálogo, x, y, z] relativos à origem da estrutura. */
  tiles: Array<[number, number, number, number]>;
}

export async function carregarCasas(url: string): Promise<CasaDef[]> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    return ((await resp.json()) as { casas?: CasaDef[] }).casas ?? [];
  } catch {
    return [];
  }
}

/** Tiles do chão que a estrutura ocupa quando a origem fica em (ox, oy). */
export function pegadaDaCasa(casa: CasaDef, ox: number, oy: number): Array<{ x: number; y: number }> {
  const vistos = new Set<string>();
  const pegada: Array<{ x: number; y: number }> = [];
  for (const [, x, y] of casa.tiles) {
    const chave = `${x},${y}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    pegada.push({ x: ox + x, y: oy + y });
  }
  return pegada;
}

/** Motivo pelo qual não dá para construir aí (o terreno precisa estar livre), ou null se der. */
export function motivoNaoConstruir(
  arena: Arena, cat: CatalogoTiles, casa: CasaDef, ox: number, oy: number,
  ocupado: (x: number, y: number) => boolean,
): string | null {
  for (const { x, y } of pegadaDaCasa(casa, ox, oy)) {
    if (!arena.dentro(x, y)) return 'A casa não cabe aí: passa da borda da arena.';
    const terreno = arena.terrenoEm(x, y);
    if (terreno !== undefined && cat.bloqueia(terreno)) return 'Não dá para construir sobre esse terreno.';
    if (arena.objetosEm(x, y).length > 0) return 'Precisa de espaço livre: há objetos no terreno da casa.';
    if (ocupado(x, y)) return 'Há alguém no terreno da casa.';
    if (x === arena.spawn.x && y === arena.spawn.y) return 'Não dá para construir sobre o ponto de nascimento.';
  }
  return null;
}

/** Porta de madeira fechada: Oeste (parede ao longo de x) e Sul (parede ao longo de y). */
export const PORTA_PAREDE_X = 0x4000 + 0x6b5;
export const PORTA_PAREDE_Y = 0x4000 + 0x6bd;
/** Placa que a casa ganha quando a estrutura não traz uma. */
export const PLACA_PADRAO = 0x4000 + 0xb98;

type Tile = [number, number, number, number];

/**
 * Portas e placa que o multi.mul não traz. A porta vai em cada vão de parede com piso
 * (parede dos dois lados e passagem livre pela frente e por trás); a placa, se faltar,
 * vai no tile de chão livre mais à frente da estrutura.
 */
export function complementosDaCasa(casa: CasaDef, cat: CatalogoTiles): Tile[] {
  const piso = new Map<string, number>();
  const escada = new Set<string>();
  const paredes = new Map<string, Array<{ z: number; topo: number }>>();
  const chave = (x: number, y: number) => `${x},${y}`;
  let temPlaca = false;
  for (const [id, x, y, z] of casa.tiles) {
    const d = cat.obter(id);
    if (!d) continue;
    if (cat.ehPlaca(id)) temPlaca = true;
    if (z >= Z_ANDAR_SUPERIOR) continue;
    if (d.bloqueia) {
      const l = paredes.get(chave(x, y)) ?? [];
      l.push({ z, topo: z + d.altura });
      paredes.set(chave(x, y), l);
    } else if (d.grupo === 'Escadas') escada.add(chave(x, y));
    else if (d.grupo === 'Casas' && d.altura === 0) piso.set(chave(x, y), Math.max(piso.get(chave(x, y)) ?? 0, z));
  }
  const parede = (x: number, y: number, fz: number) => (paredes.get(chave(x, y)) ?? []).some((p) => p.topo > fz);
  const extras: Tile[] = [];

  if (cat.obter(PORTA_PAREDE_X)?.porta && cat.obter(PORTA_PAREDE_Y)?.porta) {
    // Vão: sequência de 1 ou 2 tiles com piso, entre duas paredes, com passagem livre pela frente e por trás
    const aberto = (x: number, y: number) => piso.has(chave(x, y)) && !escada.has(chave(x, y)) && !parede(x, y, piso.get(chave(x, y))!);
    const passagem = (x: number, y: number, eixo: 'x' | 'y') => {
      const fz = piso.get(chave(x, y))!;
      return eixo === 'x' ? !parede(x, y - 1, fz) && !parede(x, y + 1, fz) : !parede(x - 1, y, fz) && !parede(x + 1, y, fz);
    };
    const vaos = new Set<string>();
    for (const eixo of ['x', 'y'] as const) {
      const passo = eixo === 'x' ? [1, 0] : [0, 1];
      for (const k of piso.keys()) {
        const [x, y] = k.split(',').map(Number) as [number, number];
        // começa no primeiro tile do vão (o anterior é parede)
        if (!aberto(x, y) || aberto(x - passo[0]!, y - passo[1]!) || !parede(x - passo[0]!, y - passo[1]!, piso.get(k)!)) continue;
        const run: Array<[number, number]> = [];
        let cx = x;
        let cy = y;
        while (aberto(cx, cy) && run.length < 3) {
          run.push([cx, cy]);
          cx += passo[0]!;
          cy += passo[1]!;
        }
        if (run.length > 2 || !parede(cx, cy, piso.get(k)!)) continue;
        if (!run.every(([rx, ry]) => passagem(rx, ry, eixo))) continue;
        // Parede dos dois lados e piso na frente e atrás: é um vão, não um corredor
        run.forEach(([rx, ry], n) => {
          const [fx, fy] = eixo === 'x' ? [rx, ry - 1] : [rx - 1, ry];
          const [bx, by] = eixo === 'x' ? [rx, ry + 1] : [rx + 1, ry];
          const ligado = [chave(fx, fy), chave(bx, by)].some((p) => vaos.has(`${eixo}:${p}`));
          if (!ligado) {
            vaos.add(`${eixo}:${chave(rx, ry)}`);
            extras.push([eixo === 'x' ? (n === 0 ? PORTA_PAREDE_X : PORTA_PAREDE_X + 2) : (n === 0 ? PORTA_PAREDE_Y : PORTA_PAREDE_Y + 2), rx, ry, piso.get(chave(rx, ry))!]);
          }
        });
      }
    }
  }

  if (!temPlaca && cat.obter(PLACA_PADRAO)) {
    let melhor: { x: number; y: number } | null = null;
    for (const p of pegadaDaCasa(casa, 0, 0)) {
      if (parede(p.x, p.y, 0) || piso.has(chave(p.x, p.y))) continue;
      if (!melhor || p.y > melhor.y || (p.y === melhor.y && p.x > melhor.x)) melhor = p;
    }
    if (melhor) extras.push([PLACA_PADRAO, melhor.x, melhor.y, 0]);
  }
  return extras;
}

/** Constrói a casa completa (estrutura, portas e placa) e devolve o número da construção. */
export function construirCasa(arena: Arena, casa: CasaDef, ox: number, oy: number, cat?: CatalogoTiles): number {
  const id = arena.proximoIdCasa();
  const tiles: Tile[] = [...casa.tiles, ...(cat ? complementosDaCasa(casa, cat) : [])];
  arena.adicionarVarios(tiles.map(([tid, x, y, z]) => {
    const porta = cat?.obter(tid)?.porta;
    return { id: tid, x: ox + x, y: oy + y, z, casa: id, ...(porta ? { dono: 'A' as const } : {}) };
  }));
  return id;
}

/** Placa de uma construção no tile (x, y), se houver. */
export function placaEm(arena: Arena, cat: CatalogoTiles, x: number, y: number): ObjetoMapa | undefined {
  return arena.objetosEm(x, y).find((o) => o.casa !== undefined && cat.ehPlaca(o.id));
}

/** Demole a construção inteira. Retorna quantos objetos saíram. */
export function demolirCasa(arena: Arena, casa: number): number {
  return arena.removerCasa(casa);
}

/**
 * Objetos de telhado e andar de cima que cobrem o tile (x, y) e os que se ligam a eles:
 * escondê-los deixa ver o interior da casa quando o jogador está dentro.
 */
export function tetosSobre(arena: Arena, cat: CatalogoTiles, x: number, y: number): Set<ObjetoMapa> {
  const ocultos = new Set<ObjetoMapa>();
  if (!arena.objetosEm(x, y).some((o) => cat.ehTeto(o))) return ocultos;
  const visitados = new Set<number>([y * arena.largura + x]);
  const fila: Array<[number, number]> = [[x, y]];
  while (fila.length) {
    const [cx, cy] = fila.pop()!;
    for (const o of arena.objetosEm(cx, cy)) if (cat.ehTeto(o)) ocultos.add(o);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        const chave = ny * arena.largura + nx;
        if (!arena.dentro(nx, ny) || visitados.has(chave)) continue;
        visitados.add(chave);
        if (arena.objetosEm(nx, ny).some((o) => cat.ehTeto(o))) fila.push([nx, ny]);
      }
    }
  }
  return ocultos;
}
