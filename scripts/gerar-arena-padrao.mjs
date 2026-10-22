// Gera public/arenas/arena-padrao.json (arena de demonstração 48x48).
// Uso: node scripts/gerar-arena-padrao.mjs
import { writeFileSync } from 'node:fs';

const L = 48, A = 48;
const terreno = new Array(L * A).fill(1); // grama
const objetos = [];
const set = (x, y, id) => { terreno[y * L + x] = id; };

// Piso de pedra central 24x24 (de 12 a 35)
for (let y = 12; y <= 35; y++) for (let x = 12; x <= 35; x++) set(x, y, 4);
// Um laguinho no canto
for (let y = 4; y <= 8; y++) for (let x = 38; x <= 43; x++) set(x, y, 6);

// Anel de muros com 4 aberturas (uma por lado)
const abertura = (v) => v >= 22 && v <= 25;
for (let i = 12; i <= 35; i++) {
  if (!abertura(i)) {
    objetos.push({ x: i, y: 12, z: 0, id: 101 });
    objetos.push({ x: i, y: 35, z: 0, id: 101 });
    objetos.push({ x: 12, y: i, z: 0, id: 101 });
    objetos.push({ x: 35, y: i, z: 0, id: 101 });
  }
}
// Obstáculos internos
for (const [x, y] of [[18, 18], [29, 18], [18, 29], [29, 29]]) objetos.push({ x, y, z: 0, id: 103 });
for (const [x, y] of [[23, 20], [24, 20], [23, 27], [24, 27]]) objetos.push({ x, y, z: 0, id: 104 });
// Arbustos decorativos fora da arena
for (const [x, y] of [[6, 6], [8, 40], [41, 30], [5, 20]]) objetos.push({ x, y, z: 0, id: 105 });

const mapa = { versao: 1, nome: 'arena-padrao', largura: L, altura: A, terreno, objetos, spawn: { x: 24, y: 24 } };
writeFileSync(new URL('../public/arenas/arena-padrao.json', import.meta.url), JSON.stringify(mapa));
console.log(`arena-padrao.json gerada: ${objetos.length} objetos`);
