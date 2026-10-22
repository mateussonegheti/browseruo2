// Teste de fumaça no Chromium: movimento por mouse, colisão e editor.
// Uso: (com `npm run dev` ativo) node e2e/fumaca.mjs [url]
import { chromium } from 'playwright';
import { existsSync, readFileSync, rmSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const falhas = [];
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FALHA'} ${msg}`); if (!cond) falhas.push(msg); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 720 } });
const erros = [];
pagina.on('pageerror', (e) => erros.push(String(e)));
pagina.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
const estado = () => pagina.evaluate(() => {
  const j = window.__jogo.jogador;
  return { x: j.x, y: j.y, dir: j.dir, movendo: Boolean(j.movimento) };
});

await pagina.goto(URL);
await pagina.evaluate(() => localStorage.clear());
await pagina.reload();
await pagina.waitForFunction(() => window.__jogo?.arena);
await pagina.screenshot({ path: '/tmp/claude-0/-home-claude/9327f7ba-abf7-5a15-b34d-347700155b3a/scratchpad/jogo-inicio.png' });

let e = await estado();
ok(e.x === 24 && e.y === 24, `jogador nasce no spawn (24,24): (${e.x},${e.y})`);

// 1) Andar para a direita da tela (Nordeste: x+1, y-1), longe do personagem = correr
await pagina.mouse.move(1000, 340);
await pagina.mouse.down();
await espera(1300);
await pagina.mouse.up();
await espera(300);
e = await estado();
ok(e.dir === 1, `direção Nordeste ao segurar à direita (dir=${e.dir})`);
ok(e.x > 24 && e.y < 24 && e.x - 24 === 24 - e.y, `andou na diagonal NE: (${e.x},${e.y})`);
const passosCorrendo = e.x - 24;
ok(passosCorrendo >= 4 && passosCorrendo <= 7, `correndo ~200ms/passo em 1,3s: ${passosCorrendo} passos`);

// 2) Soltar o botão para o personagem
const parado = await estado();
await espera(500);
const depois = await estado();
ok(parado.x === depois.x && parado.y === depois.y && !depois.movendo, 'para ao soltar o botão');

// 3) Colisão: muro ao lado e tentar andar contra ele
await pagina.evaluate(() => {
  const j = window.__jogo.jogador;
  window.__jogo.arena.adicionarObjeto(j.x + 1, j.y, 0, 101); // Leste
});
const antes = await estado();
await pagina.mouse.move(900, 500); // baixo-direita = Leste
await pagina.mouse.down();
await espera(900);
await pagina.mouse.up();
e = await estado();
ok(e.x === antes.x && e.y === antes.y && e.dir === 2, `muro barra o passo para Leste e o personagem vira (${e.x},${e.y}, dir=${e.dir})`);
await pagina.screenshot({ path: '/tmp/claude-0/-home-claude/9327f7ba-abf7-5a15-b34d-347700155b3a/scratchpad/jogo-muro.png' });

// 4) Andar a pé (cursor perto) = 400ms/passo
await pagina.evaluate(() => {
  const j = window.__jogo.jogador;
  j.x = 20; j.y = 20; // coluna livre de obstáculos
});
await pagina.mouse.move(640 - 60, 360 + 60); // baixo-esquerda curto = Sul (dx=-1, dy=+1)
await pagina.mouse.down();
await espera(1700);
await pagina.mouse.up();
await espera(500);
e = await estado();
const passosAndando = e.y - 20; // Sul = (0,+1)
ok(passosAndando >= 3 && passosAndando <= 5, `andando ~400ms/passo em 1,7s: ${passosAndando} passos`);

// 5) Editor
await pagina.keyboard.press('e');
ok(await pagina.evaluate(() => window.__jogo.editor.ativo), 'tecla E abre o editor');
ok(await pagina.isVisible('#painel'), 'painel visível');
const arenaAntes = await pagina.evaluate(() => window.__jogo.arena.objetosEm(30, 24).length);
await pagina.click('text=Pilar');
// câmera do editor começa onde o jogador estava: converte tile -> tela
const alvo = await pagina.evaluate(() => {
  const j = window.__jogo.jogador;
  return { jx: j.x, jy: j.y };
});
const paraTela = (tx, ty) => ({
  x: 640 + ((tx - alvo.jx) - (ty - alvo.jy)) * 22 - 150 * 0, // painel não afeta o centro do canvas
  y: 360 + ((tx - alvo.jx) + (ty - alvo.jy)) * 22,
});
const p = paraTela(alvo.jx - 3, alvo.jy);
await pagina.mouse.click(p.x, p.y);
const colocado = await pagina.evaluate(([x, y]) => window.__jogo.arena.objetosEm(x, y).map((o) => o.id), [alvo.jx - 3, alvo.jy]);
ok(colocado.includes(103), `clique esquerdo coloca Pilar no tile sob o cursor: ${JSON.stringify(colocado)}`);
await pagina.mouse.click(p.x, p.y, { button: 'right' });
const apagado = await pagina.evaluate(([x, y]) => window.__jogo.arena.objetosEm(x, y).length, [alvo.jx - 3, alvo.jy]);
ok(apagado === 0, 'clique direito apaga');
void arenaAntes;

// Pintar arrastando (muro) por 4 tiles
await pagina.click('text=Muro de pedra');
const a = paraTela(alvo.jx + 2, alvo.jy + 2);
const b = paraTela(alvo.jx + 5, alvo.jy + 2);
await pagina.mouse.move(a.x, a.y);
await pagina.mouse.down();
await pagina.mouse.move(b.x, b.y, { steps: 12 });
await pagina.mouse.up();
const pintados = await pagina.evaluate(([x, y]) => [0, 1, 2, 3].map((i) => window.__jogo.arena.objetosEm(x + i, y).length), [alvo.jx + 2, alvo.jy + 2]);
ok(pintados.every((n) => n === 1), `arrastar pinta uma linha de 4 muros: ${JSON.stringify(pintados)}`);

// Terreno: água
await pagina.click('text=Água');
const t = paraTela(alvo.jx, alvo.jy + 6);
await pagina.mouse.click(t.x, t.y);
ok(await pagina.evaluate(([x, y]) => window.__jogo.arena.terrenoEm(x, y) === 6, [alvo.jx, alvo.jy + 6]), 'terreno Água colocado');

await pagina.screenshot({ path: '/tmp/claude-0/-home-claude/9327f7ba-abf7-5a15-b34d-347700155b3a/scratchpad/editor.png' });

// Salvar no projeto com outro nome (não sobrescreve a arena padrão)
await pagina.fill('#painel input[type=text]', 'teste-e2e');
await pagina.dispatchEvent('#painel input[type=text]', 'change');
await pagina.click('text=Salvar');
await pagina.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Salvo em'), null, { timeout: 5000 }).catch(() => {});
const arquivo = 'public/arenas/teste-e2e.json';
ok(existsSync(arquivo), 'Salvar grava o JSON em public/arenas/');
if (existsSync(arquivo)) {
  const j = JSON.parse(readFileSync(arquivo, 'utf-8'));
  ok(j.nome === 'teste-e2e' && j.objetos.length > 90, `arquivo salvo contém a arena editada (${j.objetos.length} objetos)`);
  rmSync(arquivo);
}
ok(await pagina.evaluate(() => localStorage.getItem('browseruo.arena.v1') !== null), 'cópia local no navegador gravada');

// Nome inválido é recusado
await pagina.fill('#painel input[type=text]', '../hack');
await pagina.dispatchEvent('#painel input[type=text]', 'change');
ok((await pagina.textContent('.status'))?.includes('inválido'), 'nome com ../ é recusado');

// Fechar editor volta ao jogo
await pagina.click('canvas', { position: { x: 5, y: 5 }, button: 'right' }); // tira o foco do input
await pagina.keyboard.press('e');
ok(!(await pagina.evaluate(() => window.__jogo.editor.ativo)), 'E fecha o editor');

ok(erros.length === 0, `sem erros no console (${erros.length}) ${erros.slice(0, 3).join(' | ')}`);
await navegador.close();
console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\nTudo certo');
process.exit(falhas.length ? 1 : 0);
