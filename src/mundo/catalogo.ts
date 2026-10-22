import type { Catalogo, DefinicaoTile, TipoTile } from './tipos';

/** Índice do catálogo de tiles (placeholder agora; gerado pelo extrator depois). */
export class CatalogoTiles {
  private readonly porId = new Map<number, DefinicaoTile>();

  constructor(readonly dados: Catalogo) {
    for (const tile of dados.tiles) this.porId.set(tile.id, tile);
  }

  obter(id: number): DefinicaoTile | undefined {
    return this.porId.get(id);
  }

  listar(tipo: TipoTile): DefinicaoTile[] {
    return this.dados.tiles.filter((t) => t.tipo === tipo);
  }

  /** Id desconhecido não bloqueia (o renderizador o desenha em magenta). */
  bloqueia(id: number): boolean {
    return this.porId.get(id)?.bloqueia ?? false;
  }
}

export function validarCatalogo(obj: unknown): { ok: true; catalogo: Catalogo } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const c = obj as Partial<Catalogo> | null;
  if (!c || typeof c !== 'object') return { ok: false, erros: ['catálogo não é um objeto'] };
  if (typeof c.versao !== 'number') erros.push('versao ausente');
  if (typeof c.origem !== 'string') erros.push('origem ausente');
  if (!Array.isArray(c.tiles)) return { ok: false, erros: [...erros, 'tiles ausente'] };

  const vistos = new Set<number>();
  c.tiles.forEach((t, i) => {
    const rot = `tiles[${i}]`;
    if (!Number.isInteger(t.id) || t.id < 1) erros.push(`${rot}: id inválido`);
    else if (vistos.has(t.id)) erros.push(`${rot}: id ${t.id} repetido`);
    else vistos.add(t.id);
    if (typeof t.nome !== 'string' || !t.nome) erros.push(`${rot}: nome inválido`);
    if (t.tipo !== 'terreno' && t.tipo !== 'objeto') erros.push(`${rot}: tipo inválido`);
    if (typeof t.altura !== 'number' || t.altura < 0) erros.push(`${rot}: altura inválida`);
    if (typeof t.bloqueia !== 'boolean') erros.push(`${rot}: bloqueia inválido`);
    if (typeof t.cor !== 'string' || !/^#[0-9a-f]{6}$/i.test(t.cor)) erros.push(`${rot}: cor inválida`);
  });
  return erros.length ? { ok: false, erros } : { ok: true, catalogo: c as Catalogo };
}

export async function carregarCatalogo(url: string): Promise<CatalogoTiles> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao carregar catálogo (${resp.status})`);
  const res = validarCatalogo(await resp.json());
  if (!res.ok) throw new Error(`Catálogo inválido: ${res.erros.join('; ')}`);
  return new CatalogoTiles(res.catalogo);
}
