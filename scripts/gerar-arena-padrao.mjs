// Gera public/arenas/arena-padrao.json (arena de demonstração 48x48) com ids do catálogo real.
// Uso: node scripts/gerar-arena-padrao.mjs   (depois de rodar o extrator)
import { readFileSync, writeFileSync } from 'node:fs';

// Terreno: id = gráfico do landtiles. Objeto: id = 0x4000 + gráfico do art (convenção do extrator).
const OBJ = 0x4000;
const GRAMA = 3, PEDRA = 1078, AGUA = 168;
const MURO_X = OBJ + 0x1c; // trecho de muro que corre ao longo do eixo X
const MURO_Y = OBJ + 0x1b; // trecho de muro que corre ao longo do eixo Y
const MURO_QUINA = OBJ + 0x1a; // peça dupla (desenha as duas faces)
const MURO_POSTE = OBJ + 0x1d; // poste
const COLUNA = OBJ + 0x11b, CAIXOTE = OBJ + 0xe3c, ARBUSTO = OBJ + 0x3349;

const catalogo = JSON.parse(readFileSync(new URL('../public/catalogo/catalogo.json', import.meta.url), 'utf-8'));
const existentes = new Set(catalogo.tiles.map((t) => t.id));
const faltando = [GRAMA, PEDRA, AGUA, MURO_X, MURO_Y, MURO_QUINA, MURO_POSTE, COLUNA, CAIXOTE, ARBUSTO].filter((id) => !existentes.has(id));
if (faltando.length) throw new Error(`ids ausentes no catálogo: ${faltando.map((i) => '0x' + i.toString(16)).join(', ')}`);

const L = 48, A = 48;
const terreno = new Array(L * A).fill(GRAMA);
const objetos = [];
const set = (x, y, id) => { terreno[y * L + x] = id; };

// Piso de pedra central (de 12 a 36, incluindo a base dos muros leste e sul)
for (let y = 12; y <= 36; y++) for (let x = 12; x <= 36; x++) set(x, y, PEDRA);
// Um laguinho no canto
for (let y = 4; y <= 8; y++) for (let x = 38; x <= 43; x++) set(x, y, AGUA);

// Anel de muros com uma abertura por lado. Layout ajustado à mão no editor do jogo:
// muros norte (y = 11) e oeste (x = 11) por fora do piso, poste na quina norte e peça dupla na sul.
// Cada trecho: [coordenada fixa, de, até, abertura de, abertura até].
const trecho = (de, ate, abreDe, abreAte, colocar) => {
  for (let i = de; i <= ate; i++) if (i < abreDe || i > abreAte) colocar(i);
};
trecho(12, 36, 23, 25, (x) => objetos.push({ x, y: 11, z: 0, id: MURO_X })); // norte
trecho(12, 35, 23, 25, (x) => objetos.push({ x, y: 36, z: 0, id: MURO_X })); // sul
trecho(12, 36, 24, 26, (y) => objetos.push({ x: 11, y, z: 0, id: MURO_Y })); // oeste
trecho(12, 35, 22, 25, (y) => objetos.push({ x: 36, y, z: 0, id: MURO_Y })); // leste
objetos.push({ x: 11, y: 11, z: 0, id: MURO_POSTE }); // quina norte
objetos.push({ x: 36, y: 36, z: 0, id: MURO_QUINA }); // quina sul
// Obstáculos internos
for (const [x, y] of [[18, 18], [29, 18], [18, 29], [29, 29]]) objetos.push({ x, y, z: 0, id: COLUNA });
for (const [x, y] of [[23, 20], [24, 20], [23, 27], [24, 27]]) objetos.push({ x, y, z: 0, id: CAIXOTE });
// Arbustos decorativos fora da arena
for (const [x, y] of [[6, 6], [8, 40], [41, 30], [5, 20]]) objetos.push({ x, y, z: 0, id: ARBUSTO });

const mapa = { versao: 1, nome: 'arena-padrao', largura: L, altura: A, terreno, objetos, spawn: { x: 31, y: 4 } };
writeFileSync(new URL('../public/arenas/arena-padrao.json', import.meta.url), JSON.stringify(mapa));
console.log(`arena-padrao.json gerada: ${objetos.length} objetos`);
