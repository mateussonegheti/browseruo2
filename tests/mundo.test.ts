import { describe, expect, it } from 'vitest';
import { Arena, criarMapaVazio, validarMapa } from '../src/mundo/mapa';
import { CatalogoTiles, validarCatalogo } from '../src/mundo/catalogo';
import { podeAndar, tileBloqueado } from '../src/mundo/colisao';
import { Editor } from '../src/editor/editor';
import { atualizarJogador, criarJogador, posicaoVisual, tentarAndar, PASSO_ANDAR_MS, PASSO_CORRER_MS } from '../src/jogo/jogador';
import catalogoJson from './fixtures/catalogo-placeholder.json';
import catalogoReal from '../public/catalogo/catalogo.json';
import arenaPadrao from '../public/arenas/arena-padrao.json';

const cat = new CatalogoTiles(catalogoJson as never);
const GRAMA = 1, AGUA = 6, MURO = 101, ARBUSTO = 105;

function arenaVazia(): Arena {
  return new Arena(criarMapaVazio('teste', 16, 16, GRAMA));
}

describe('catálogo', () => {
  it('o catálogo placeholder é válido', () => {
    expect(validarCatalogo(catalogoJson).ok).toBe(true);
  });
  it('o catálogo gerado do cliente é válido', () => {
    expect(validarCatalogo(catalogoReal).ok).toBe(true);
  });
  it('rejeita ids repetidos e cor inválida', () => {
    const ruim = { versao: 1, origem: 'x', tiles: [
      { id: 1, nome: 'a', tipo: 'terreno', altura: 0, bloqueia: false, cor: '#000000' },
      { id: 1, nome: 'b', tipo: 'terreno', altura: 0, bloqueia: false, cor: 'vermelho' },
    ] };
    const r = validarCatalogo(ruim);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join(' ')).toMatch(/repetido/);
  });
});

describe('mapa', () => {
  it('a arena padrão do projeto é válida', () => {
    const r = validarMapa(arenaPadrao);
    expect(r.ok).toBe(true);
  });
  it('rejeita terreno com tamanho errado, objeto fora do mapa e spawn fora', () => {
    const m = criarMapaVazio('t', 16, 16, 1);
    m.terreno.pop();
    m.objetos.push({ x: 99, y: 0, z: 0, id: 101 });
    m.spawn = { x: -1, y: 0 };
    const r = validarMapa(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.length).toBeGreaterThanOrEqual(3);
  });
  it('rejeita dimensões fora dos limites', () => {
    expect(validarMapa({ ...criarMapaVazio('t', 16, 16, 1), largura: 4 }).ok).toBe(false);
  });
  it('adicionar no mesmo (x,y,z) substitui; z diferente empilha; removerTopo tira o mais alto', () => {
    const a = arenaVazia();
    a.adicionarObjeto(3, 3, 0, MURO);
    a.adicionarObjeto(3, 3, 0, ARBUSTO);
    expect(a.objetosEm(3, 3)).toHaveLength(1);
    a.adicionarObjeto(3, 3, 20, MURO);
    expect(a.objetosEm(3, 3)).toHaveLength(2);
    expect(a.removerTopo(3, 3)?.z).toBe(20);
    expect(a.dados.objetos).toHaveLength(1);
    expect(a.removerTopo(3, 3)?.id).toBe(ARBUSTO);
    expect(a.removerTopo(3, 3)).toBeUndefined();
    expect(a.dados.objetos).toHaveLength(0);
  });
  it('ida e volta por JSON preserva a arena', () => {
    const a = arenaVazia();
    a.adicionarObjeto(2, 5, 0, MURO);
    a.definirTerreno(1, 1, AGUA);
    const volta = validarMapa(JSON.parse(JSON.stringify(a.dados)));
    expect(volta.ok).toBe(true);
    if (volta.ok) {
      const b = new Arena(volta.mapa);
      expect(b.objetosEm(2, 5)).toHaveLength(1);
      expect(b.terrenoEm(1, 1)).toBe(AGUA);
    }
  });
});

describe('colisão', () => {
  it('bloqueia fora do mapa, água e objetos que bloqueiam; libera arbusto', () => {
    const a = arenaVazia();
    a.definirTerreno(4, 4, AGUA);
    a.adicionarObjeto(5, 5, 0, MURO);
    a.adicionarObjeto(6, 6, 0, ARBUSTO);
    expect(tileBloqueado(a, cat, -1, 0)).toBe(true);
    expect(tileBloqueado(a, cat, 16, 0)).toBe(true);
    expect(tileBloqueado(a, cat, 4, 4)).toBe(true);
    expect(tileBloqueado(a, cat, 5, 5)).toBe(true);
    expect(tileBloqueado(a, cat, 6, 6)).toBe(false);
    expect(tileBloqueado(a, cat, 8, 8)).toBe(false);
  });
  it('não corta quina em diagonal quando os dois laterais estão bloqueados', () => {
    const a = arenaVazia();
    a.adicionarObjeto(6, 5, 0, MURO);
    a.adicionarObjeto(5, 6, 0, MURO);
    expect(podeAndar(a, cat, 5, 5, 1, 1)).toBe(false);
  });
  it('permite diagonal se apenas um lateral estiver bloqueado', () => {
    const a = arenaVazia();
    a.adicionarObjeto(6, 5, 0, MURO);
    expect(podeAndar(a, cat, 5, 5, 1, 1)).toBe(true);
  });
  it('a arena padrão tem aberturas: dá para entrar pelo meio de cada lado', () => {
    const r = validarMapa(arenaPadrao);
    if (!r.ok) throw new Error('arena padrão inválida');
    const a = new Arena(r.mapa);
    const real = new CatalogoTiles(catalogoReal as never);
    // Muros norte (y = 11) e oeste (x = 11), com aberturas no meio
    expect(tileBloqueado(a, real, 24, 11)).toBe(false);
    expect(tileBloqueado(a, real, 11, 25)).toBe(false);
    expect(tileBloqueado(a, real, 15, 11)).toBe(true);
    expect(tileBloqueado(a, real, 11, 15)).toBe(true);
    expect(tileBloqueado(a, real, a.spawn.x, a.spawn.y)).toBe(false);
    // Todo id usado na arena existe no catálogo
    for (const id of [...r.mapa.terreno, ...r.mapa.objetos.map((o) => o.id)]) expect(real.obter(id)).toBeDefined();
  });
});

describe('jogador', () => {
  it('anda um tile em 400 ms (a pé) e 200 ms (correndo)', () => {
    const a = arenaVazia();
    const j = criarJogador(5, 5);
    expect(tentarAndar(j, 2, false, 1000, a, cat)).toBe(true); // Leste
    expect(posicaoVisual(j, 1000 + PASSO_ANDAR_MS / 2).x).toBeCloseTo(5.5);
    atualizarJogador(j, 1000 + PASSO_ANDAR_MS);
    expect(j).toMatchObject({ x: 6, y: 5, movimento: null });

    expect(tentarAndar(j, 2, true, 2000, a, cat)).toBe(true);
    expect(j.movimento?.duracao).toBe(PASSO_CORRER_MS);
  });
  it('não inicia novo passo enquanto outro está em curso', () => {
    const a = arenaVazia();
    const j = criarJogador(5, 5);
    tentarAndar(j, 2, false, 0, a, cat);
    expect(tentarAndar(j, 4, false, 100, a, cat)).toBe(false);
    expect(j.dir).toBe(4); // mas vira
  });
  it('é barrado por muro mas ainda vira para ele', () => {
    const a = arenaVazia();
    a.adicionarObjeto(6, 5, 0, MURO);
    const j = criarJogador(5, 5);
    expect(tentarAndar(j, 2, false, 0, a, cat)).toBe(false);
    expect(j).toMatchObject({ x: 5, y: 5, dir: 2, movimento: null });
  });
  it('encadeia passos mantendo o ritmo (início = fim do passo anterior)', () => {
    const a = arenaVazia();
    const j = criarJogador(5, 5);
    tentarAndar(j, 2, false, 0, a, cat);
    atualizarJogador(j, PASSO_ANDAR_MS + 8); // quadro um pouco atrasado
    tentarAndar(j, 2, false, PASSO_ANDAR_MS + 8, a, cat);
    expect(j.movimento?.inicio).toBe(PASSO_ANDAR_MS);
  });
  it('depois de parado por um tempo, o novo passo começa "agora"', () => {
    const a = arenaVazia();
    const j = criarJogador(5, 5);
    tentarAndar(j, 2, false, 0, a, cat);
    atualizarJogador(j, PASSO_ANDAR_MS);
    tentarAndar(j, 2, false, PASSO_ANDAR_MS + 1000, a, cat);
    expect(j.movimento?.inicio).toBe(PASSO_ANDAR_MS + 1000);
  });
});

describe('editor', () => {
  const montar = () => {
    const a = arenaVazia();
    let mudancas = 0;
    const e = new Editor(() => a, cat, () => { mudancas++; });
    e.ativo = true;
    return { a, e, mudancas: () => mudancas };
  };
  it('inativo não altera nada', () => {
    const { a, e } = montar();
    e.ativo = false;
    e.selecionadoId = MURO;
    expect(e.aplicar(3, 3)).toBe(false);
    expect(a.objetosEm(3, 3)).toHaveLength(0);
  });
  it('coloca terreno e objeto conforme o tipo do tile selecionado', () => {
    const { a, e, mudancas } = montar();
    e.selecionadoId = AGUA;
    e.aplicar(2, 2);
    expect(a.terrenoEm(2, 2)).toBe(AGUA);
    e.selecionadoId = MURO;
    e.z = 8;
    e.aplicar(2, 2);
    expect(a.objetosEm(2, 2)[0]).toMatchObject({ id: MURO, z: 8 });
    expect(mudancas()).toBe(2);
  });
  it('repintar o mesmo terreno não conta como mudança', () => {
    const { e, mudancas } = montar();
    e.selecionadoId = GRAMA;
    e.aplicar(2, 2);
    expect(mudancas()).toBe(0);
  });
  it('botão direito e ferramenta apagar removem o objeto do topo', () => {
    const { a, e } = montar();
    e.selecionadoId = MURO;
    e.aplicar(4, 4);
    expect(e.aplicar(4, 4, true)).toBe(true);
    expect(a.objetosEm(4, 4)).toHaveLength(0);
    e.selecionadoId = MURO;
    e.aplicar(4, 4);
    e.ferramenta = 'apagar';
    expect(e.aplicar(4, 4)).toBe(true);
    expect(e.aplicar(4, 4)).toBe(false);
  });
  it('ferramenta spawn move o ponto de início; fora do mapa é ignorado', () => {
    const { a, e } = montar();
    e.ferramenta = 'spawn';
    e.aplicar(3, 4);
    expect(a.spawn).toEqual({ x: 3, y: 4 });
    expect(e.aplicar(99, 99)).toBe(false);
  });
});
