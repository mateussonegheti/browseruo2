import type { Arena } from '../mundo/mapa';
import type { CatalogoTiles } from '../mundo/catalogo';
import type { DefinicaoTile } from '../mundo/tipos';

export type Ferramenta = 'colocar' | 'apagar' | 'spawn';

/** Lógica do editor de arena, sem DOM: o painel e o mouse apenas chamam estes métodos. */
export class Editor {
  ativo = false;
  ferramenta: Ferramenta = 'colocar';
  selecionadoId: number;
  /** Altura Z usada ao colocar objetos. */
  z = 0;
  grade = true;

  constructor(
    private getArena: () => Arena,
    private readonly catalogo: CatalogoTiles,
    /** Chamado após qualquer alteração no mapa (para autosave, etc.). */
    private readonly aoMudar: () => void,
  ) {
    this.selecionadoId = catalogo.dados.tiles[0]?.id ?? 1;
  }

  get selecionado(): DefinicaoTile | undefined {
    return this.catalogo.obter(this.selecionadoId);
  }

  /** O que desenhar como "fantasma" sob o cursor. */
  get fantasma(): { def: DefinicaoTile; z: number } | null {
    if (!this.ativo || this.ferramenta !== 'colocar' || !this.selecionado) return null;
    return { def: this.selecionado, z: this.z };
  }

  alternar(): void {
    this.ativo = !this.ativo;
  }

  /** Aplica a ferramenta atual no tile; `apagar` força remoção (botão direito). */
  aplicar(x: number, y: number, apagar = false): boolean {
    if (!this.ativo) return false;
    const arena = this.getArena();
    if (!arena.dentro(x, y)) return false;

    if (apagar || this.ferramenta === 'apagar') {
      const removido = arena.removerTopo(x, y);
      if (removido) this.aoMudar();
      return Boolean(removido);
    }
    if (this.ferramenta === 'spawn') {
      arena.definirSpawn(x, y);
      this.aoMudar();
      return true;
    }
    const def = this.selecionado;
    if (!def) return false;
    if (def.tipo === 'terreno') {
      if (arena.terrenoEm(x, y) === def.id) return false;
      arena.definirTerreno(x, y, def.id);
    } else {
      arena.adicionarObjeto(x, y, this.z, def.id);
    }
    this.aoMudar();
    return true;
  }
}
