import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Arena, criarMapaVazio } from '../src/mundo/mapa';
import { CatalogoTiles } from '../src/mundo/catalogo';
import { tileBloqueado } from '../src/mundo/colisao';
import { construirCasa, demolirCasa, type CasaDef } from '../src/mundo/casas';
import { portaEm } from '../src/mundo/portas';

const cat = new CatalogoTiles(JSON.parse(readFileSync('public/catalogo/catalogo.json', 'utf8')));

describe('casa completa', () => {
  const piso = cat.dados.tiles.find((t) => t.nome.toLowerCase().includes('wooden boards') && t.grupo === 'Casas');
  const fund = cat.dados.tiles.find((t) => t.nome.toLowerCase().includes('stone wall') && t.bloqueia && t.altura > 0 && t.altura <= 7);
  const par = cat.dados.tiles.find((t) => t.nome.toLowerCase().includes('plaster wall') && t.altura > 0);
  it('catálogo real tem o necessário', () => {
    expect(piso && fund && par).toBeTruthy();
  });
  it('põe porta e placa, e a demolição remove tudo', () => {
    if (!piso || !fund || !par) return;
    // Sala 3x3 com parede em x=0 exceto o vão em (0,1); fundação sob tudo
    const tiles: CasaDef['tiles'] = [];
    for (let y = 0; y < 3; y++) {
      tiles.push([fund.id, 0, y, 0]);
      for (let x = 1; x < 3; x++) tiles.push([piso.id, x, y, 7]);
      if (y !== 1) tiles.push([par.id, 0, y, 7]);
    }
    tiles.push([piso.id, 0, 1, 7]);
    const casa: CasaDef = { id: 'x', nome: 'x', largura: 3, profundidade: 3, tiles };
    const a = new Arena(criarMapaVazio('t', 16, 16, 1));
    a.adicionarObjeto(0, 0, 0, 1);
    const id = construirCasa(a, casa, 4, 4, cat);
    expect(placaEm(a, cat, 4, 4) || [0, 1, 2].some((y) => placaEm(a, cat, 4 + 0, 4 + y) || placaEm(a, cat, 5, 4 + y))).toBeTruthy;
    const total = a.dados.objetos.filter((o) => o.casa === id).length;
    expect(total).toBeGreaterThanOrEqual(tiles.length);
    expect(demolirCasa(a, id)).toBe(total);
    expect(a.dados.objetos.filter((o) => o.casa === id)).toHaveLength(0);
    expect(a.objetosEm(0, 0)).toHaveLength(1);
  });
  it('fundação sob o piso não bloqueia o vão', () => {
    if (!piso || !fund) return;
    const a = new Arena(criarMapaVazio('t', 8, 8, 1));
    a.adicionarObjeto(2, 2, 0, fund.id);
    expect(tileBloqueado(a, cat, 2, 2)).toBe(true);
    a.adicionarObjeto(2, 2, 7, piso.id);
    expect(tileBloqueado(a, cat, 2, 2)).toBe(false);
    expect(portaEm(a, cat, 2, 2)).toBeUndefined();
  });
});
