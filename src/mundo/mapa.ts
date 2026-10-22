import type { Mapa, ObjetoMapa } from './tipos';

export const VERSAO_MAPA = 1;
export const TAMANHO_MIN = 8;
export const TAMANHO_MAX = 256;

export function criarMapaVazio(nome: string, largura: number, altura: number, idTerreno: number): Mapa {
  return {
    versao: VERSAO_MAPA,
    nome,
    largura,
    altura,
    terreno: new Array<number>(largura * altura).fill(idTerreno),
    objetos: [],
    spawn: { x: Math.floor(largura / 2), y: Math.floor(altura / 2) },
  };
}

export function validarMapa(obj: unknown): { ok: true; mapa: Mapa } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const m = obj as Partial<Mapa> | null;
  if (!m || typeof m !== 'object') return { ok: false, erros: ['mapa não é um objeto'] };

  if (m.versao !== VERSAO_MAPA) erros.push(`versao deve ser ${VERSAO_MAPA}`);
  if (typeof m.nome !== 'string' || !m.nome) erros.push('nome ausente');

  const dimOk = (v: unknown): v is number =>
    Number.isInteger(v) && (v as number) >= TAMANHO_MIN && (v as number) <= TAMANHO_MAX;
  if (!dimOk(m.largura) || !dimOk(m.altura)) {
    return { ok: false, erros: [...erros, `largura/altura devem ser inteiros entre ${TAMANHO_MIN} e ${TAMANHO_MAX}`] };
  }
  const { largura, altura } = m;

  if (!Array.isArray(m.terreno) || m.terreno.length !== largura * altura) {
    erros.push('terreno deve ter largura*altura posições');
  } else if (!m.terreno.every((v) => Number.isInteger(v) && v >= 0)) {
    erros.push('terreno contém ids inválidos');
  }

  if (!Array.isArray(m.objetos)) {
    erros.push('objetos ausente');
  } else {
    m.objetos.forEach((o, i) => {
      const ok =
        Number.isInteger(o.x) && Number.isInteger(o.y) && Number.isInteger(o.z) && Number.isInteger(o.id) &&
        o.x >= 0 && o.x < largura && o.y >= 0 && o.y < altura && o.id >= 1;
      if (!ok) erros.push(`objetos[${i}] inválido`);
    });
  }

  const s = m.spawn;
  if (!s || !Number.isInteger(s.x) || !Number.isInteger(s.y) || s.x < 0 || s.x >= largura || s.y < 0 || s.y >= altura) {
    erros.push('spawn fora do mapa');
  }

  return erros.length ? { ok: false, erros } : { ok: true, mapa: m as Mapa };
}

/** Mapa + índice por tile para consulta rápida (colisão e desenho). */
export class Arena {
  private indice = new Map<number, ObjetoMapa[]>();

  constructor(readonly dados: Mapa) {
    this.reindexar();
  }

  get nome(): string { return this.dados.nome; }
  get largura(): number { return this.dados.largura; }
  get altura(): number { return this.dados.altura; }
  get spawn(): { x: number; y: number } { return this.dados.spawn; }

  dentro(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.largura && y < this.altura;
  }

  terrenoEm(x: number, y: number): number | undefined {
    return this.dentro(x, y) ? this.dados.terreno[this.chave(x, y)] : undefined;
  }

  definirTerreno(x: number, y: number, id: number): void {
    if (this.dentro(x, y)) this.dados.terreno[this.chave(x, y)] = id;
  }

  objetosEm(x: number, y: number): readonly ObjetoMapa[] {
    return this.indice.get(this.chave(x, y)) ?? [];
  }

  /** Adiciona um objeto; se já existir algo no mesmo (x, y, z), substitui. */
  adicionarObjeto(x: number, y: number, z: number, id: number): void {
    if (!this.dentro(x, y)) return;
    const existente = this.objetosEm(x, y).find((o) => o.z === z);
    if (existente) this.removerObjeto(existente);
    const novo: ObjetoMapa = { x, y, z, id };
    this.dados.objetos.push(novo);
    const chave = this.chave(x, y);
    const lista = this.indice.get(chave) ?? [];
    lista.push(novo);
    this.indice.set(chave, lista);
  }

  /** Remove o objeto mais alto do tile (o "de cima"). */
  removerTopo(x: number, y: number): ObjetoMapa | undefined {
    const lista = this.objetosEm(x, y);
    if (lista.length === 0) return undefined;
    const topo = lista.reduce((a, b) => (b.z >= a.z ? b : a));
    this.removerObjeto(topo);
    return topo;
  }

  definirSpawn(x: number, y: number): void {
    if (this.dentro(x, y)) this.dados.spawn = { x, y };
  }

  private removerObjeto(o: ObjetoMapa): void {
    const i = this.dados.objetos.indexOf(o);
    if (i >= 0) this.dados.objetos.splice(i, 1);
    const chave = this.chave(o.x, o.y);
    const lista = (this.indice.get(chave) ?? []).filter((q) => q !== o);
    if (lista.length) this.indice.set(chave, lista);
    else this.indice.delete(chave);
  }

  private reindexar(): void {
    this.indice.clear();
    for (const o of this.dados.objetos) {
      const chave = this.chave(o.x, o.y);
      const lista = this.indice.get(chave) ?? [];
      lista.push(o);
      this.indice.set(chave, lista);
    }
  }

  private chave(x: number, y: number): number {
    return y * this.largura + x;
  }
}
