import type { Arena } from '../mundo/mapa';
import type { CatalogoTiles } from '../mundo/catalogo';
import type { DefinicaoTile, Lado, Mapa } from '../mundo/tipos';
import { construirCasa, type CasaDef } from '../mundo/casas';
import { conjuntosMuro, reajustarMuros, type ConjuntoMuro } from './muros';

export type Ferramenta = 'colocar' | 'apagar' | 'spawn' | 'spawnB' | 'muro' | 'casa';

/** Quantos passos o Ctrl+Z guarda. */
const LIMITE_HISTORICO = 50;

/** Lógica do editor de arena, sem DOM: o painel e o mouse apenas chamam estes métodos. */
export class Editor {
  ativo = false;
  ferramenta: Ferramenta = 'colocar';
  selecionadoId: number;
  /** Altura Z usada ao colocar objetos. */
  z = 0;
  grade = true;
  /** Dono das portas colocadas (ferramenta Colocar): vazio = qualquer um abre. */
  donoPorta: Lado | '' = '';
  /** Casa pronta escolhida para a ferramenta Casa. */
  casa: CasaDef | null = null;
  /** Conjuntos de muro do catálogo e o escolhido para a ferramenta Muro. */
  readonly conjuntos: ConjuntoMuro[];
  conjunto: ConjuntoMuro | undefined;
  /** Cópias da arena antes de cada gesto (um clique ou um arraste), para o Ctrl+Z. */
  private historico: string[] = [];

  constructor(
    private getArena: () => Arena,
    private readonly catalogo: CatalogoTiles,
    /** Chamado após qualquer alteração no mapa (para autosave, etc.). */
    private readonly aoMudar: () => void,
  ) {
    this.selecionadoId = catalogo.dados.tiles[0]?.id ?? 1;
    this.conjuntos = conjuntosMuro(catalogo);
    this.conjunto = this.conjuntos[0];
  }

  get selecionado(): DefinicaoTile | undefined {
    return this.catalogo.obter(this.selecionadoId);
  }

  /** O que desenhar como "fantasma" sob o cursor. */
  get fantasma(): { def: DefinicaoTile; z: number } | null {
    if (!this.ativo) return null;
    if (this.ferramenta === 'muro' && this.conjunto) {
      const def = this.catalogo.obter(this.conjunto.poste);
      return def ? { def, z: this.z } : null;
    }
    if (this.ferramenta !== 'colocar' || !this.selecionado) return null;
    return { def: this.selecionado, z: this.z };
  }

  alternar(): void {
    this.ativo = !this.ativo;
  }

  /** Chamado no começo de cada clique/arraste: guarda a arena para o Ctrl+Z. */
  iniciarGesto(): void {
    const copia = JSON.stringify(this.getArena().dados);
    if (this.historico[this.historico.length - 1] === copia) return;
    this.historico.push(copia);
    if (this.historico.length > LIMITE_HISTORICO) this.historico.shift();
  }

  /** Devolve a arena de antes do último gesto que mudou algo (ou null se não há o que desfazer). */
  desfazer(): Mapa | null {
    const atual = JSON.stringify(this.getArena().dados);
    while (this.historico.length) {
      const copia = this.historico.pop()!;
      if (copia !== atual) return JSON.parse(copia) as Mapa;
    }
    return null;
  }

  get podeDesfazer(): boolean {
    return this.historico.length > 0;
  }

  /** Aplica a ferramenta atual no tile; `apagar` força remoção (botão direito). */
  aplicar(x: number, y: number, apagar = false): boolean {
    if (!this.ativo) return false;
    const arena = this.getArena();
    if (!arena.dentro(x, y)) return false;

    if (apagar || this.ferramenta === 'apagar') {
      const removido = arena.removerTopo(x, y);
      if (removido) {
        // Se era muro, os vizinhos trocam de peça (ex.: a quina vira trecho reto)
        const conjunto = this.conjuntos.find((c) => [c.quina, c.x, c.y, c.poste].includes(removido.id));
        if (conjunto) reajustarMuros(arena, conjunto, x, y, removido.z);
        this.aoMudar();
      }
      return Boolean(removido);
    }
    if (this.ferramenta === 'spawn' || this.ferramenta === 'spawnB') {
      arena.definirSpawn(x, y, this.ferramenta === 'spawnB' ? 'B' : 'A');
      this.aoMudar();
      return true;
    }
    if (this.ferramenta === 'casa') {
      if (!this.casa) return false;
      construirCasa(arena, this.casa, x, y, this.catalogo);
      this.aoMudar();
      return true;
    }
    if (this.ferramenta === 'muro') {
      if (!this.conjunto) return false;
      arena.adicionarObjeto(x, y, this.z, this.conjunto.poste);
      reajustarMuros(arena, this.conjunto, x, y, this.z);
      this.aoMudar();
      return true;
    }
    const def = this.selecionado;
    if (!def) return false;
    if (def.tipo === 'terreno') {
      if (arena.terrenoEm(x, y) === def.id) return false;
      arena.definirTerreno(x, y, def.id);
    } else {
      arena.adicionarObjeto(x, y, this.z, def.id, def.porta && this.donoPorta ? this.donoPorta : undefined);
    }
    this.aoMudar();
    return true;
  }
}
