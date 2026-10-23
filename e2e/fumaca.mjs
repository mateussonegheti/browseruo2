// Teste de fumaça no Chromium: movimento por mouse, colisão e editor.
// Uso: (com `npm run dev` ativo) node e2e/fumaca.mjs [url]
import { chromium } from 'playwright';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[2] ?? 'http://localhost:5173/';
// Capturas de tela vão para E2E_SAIDA (padrão: pasta temporária do sistema).
const SAIDA = process.env.E2E_SAIDA ?? tmpdir();
// Ids do catálogo extraído (objeto = 0x4000 + gráfico do art).
const MURO = 0x4000 + 0x1c, COLUNA = 0x4000 + 0x11b, AGUA = 168;
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
// Espera o primeiro carregamento terminar: recarregar no meio aborta o fetch do catálogo
await pagina.waitForFunction(() => window.__jogo?.arena);
await pagina.evaluate(() => localStorage.clear());
await pagina.reload();
await pagina.waitForFunction(() => window.__jogo?.arena);
await pagina.screenshot({ path: join(SAIDA, 'jogo-inicio.png') });

let e = await estado();
const spawn = await pagina.evaluate(() => window.__jogo.arena.spawn);
ok(e.x === spawn.x && e.y === spawn.y, `jogador nasce no spawn (${spawn.x},${spawn.y}): (${e.x},${e.y})`);
// O resto do teste parte do centro da arena, longe das bordas
await pagina.evaluate(() => { const j = window.__jogo.jogador; j.x = 24; j.y = 24; });

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
await pagina.evaluate((id) => {
  const j = window.__jogo.jogador;
  window.__jogo.arena.adicionarObjeto(j.x + 1, j.y, 0, id); // Leste
}, MURO);
const antes = await estado();
await pagina.mouse.move(900, 500); // baixo-direita = Leste
await pagina.mouse.down();
await espera(900);
await pagina.mouse.up();
e = await estado();
ok(e.x === antes.x && e.y === antes.y && e.dir === 2, `muro barra o passo para Leste e o personagem vira (${e.x},${e.y}, dir=${e.dir})`);
await pagina.screenshot({ path: join(SAIDA, 'jogo-muro.png') });

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
// Escolhe um tile da paleta: grupo da seção (0 = terreno, 1 = objetos) e id do catálogo.
const escolher = async (secao, grupo, id) => {
  await pagina.locator('#painel section').nth(secao).locator('select').selectOption(grupo);
  await pagina.click(`#painel button[data-id="${id}"]`);
};
await escolher(1, 'Colunas', COLUNA);
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
ok(colocado.includes(COLUNA), `clique esquerdo coloca coluna no tile sob o cursor: ${JSON.stringify(colocado)}`);
await pagina.mouse.click(p.x, p.y, { button: 'right' });
const apagado = await pagina.evaluate(([x, y]) => window.__jogo.arena.objetosEm(x, y).length, [alvo.jx - 3, alvo.jy]);
ok(apagado === 0, 'clique direito apaga');
void arenaAntes;

// Pintar arrastando (muro) por 4 tiles
await escolher(1, 'Muro de pedra', MURO);
const a = paraTela(alvo.jx + 2, alvo.jy + 2);
const b = paraTela(alvo.jx + 5, alvo.jy + 2);
await pagina.mouse.move(a.x, a.y);
await pagina.mouse.down();
await pagina.mouse.move(b.x, b.y, { steps: 12 });
await pagina.mouse.up();
const pintados = await pagina.evaluate(([x, y]) => [0, 1, 2, 3].map((i) => window.__jogo.arena.objetosEm(x + i, y).length), [alvo.jx + 2, alvo.jy + 2]);
ok(pintados.every((n) => n === 1), `arrastar pinta uma linha de 4 muros: ${JSON.stringify(pintados)}`);

// Terreno: água
await escolher(0, 'Água', AGUA);
const t = paraTela(alvo.jx, alvo.jy + 6);
await pagina.mouse.click(t.x, t.y);
ok(await pagina.evaluate(([x, y, id]) => window.__jogo.arena.terrenoEm(x, y) === id, [alvo.jx, alvo.jy + 6, AGUA]), 'terreno Água colocado');

await pagina.screenshot({ path: join(SAIDA, 'editor.png') });

// Salvar no projeto com outro nome (não sobrescreve a arena padrão)
await pagina.fill('#painel input[type=text]', 'teste-e2e');
await pagina.dispatchEvent('#painel input[type=text]', 'change');
await pagina.click('#painel button.primario');
await pagina.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Salvo em'), null, { timeout: 5000 }).catch(() => {});
const arquivo = 'public/arenas/teste-e2e.json';
ok(existsSync(arquivo), 'Salvar grava o JSON em public/arenas/');
if (existsSync(arquivo)) {
  const j = JSON.parse(readFileSync(arquivo, 'utf-8'));
  ok(j.nome === 'teste-e2e' && j.objetos.length > 90, `arquivo salvo contém a arena editada (${j.objetos.length} objetos)`);
  rmSync(arquivo);
}
ok(await pagina.evaluate(() => localStorage.getItem('browseruo.arena.v2') !== null), 'cópia local no navegador gravada');

// Nome inválido é recusado
await pagina.fill('#painel input[type=text]', '../hack');
await pagina.dispatchEvent('#painel input[type=text]', 'change');
ok((await pagina.textContent('.status'))?.includes('inválido'), 'nome com ../ é recusado');

// Fechar editor volta ao jogo
await pagina.click('canvas', { position: { x: 5, y: 5 }, button: 'right' }); // tira o foco do input
await pagina.keyboard.press('e');
ok(!(await pagina.evaluate(() => window.__jogo.editor.ativo)), 'E fecha o editor');

// 6) Combate (mira primeiro): tecla 4 abre a mira, clique no bot começa o cast, o dano sai no fim
const bot = await pagina.evaluate(() => {
  window.__jogo.adicionarBot('parado');
  const b = window.__jogo.motor.listar().find((c) => c.bot);
  const j = window.__jogo.jogador;
  return { id: b.id, dx: b.mov.x - j.x, dy: b.mov.y - j.y };
});
const vidaBot = () => pagina.evaluate((id) => window.__jogo.motor.obter(id).vida, bot.id);
await pagina.keyboard.press('4');
ok(await pagina.evaluate(() => window.__jogo.motor.obter('jogador').mira?.id === 'lightning'), 'tecla abre a mira na hora');
await pagina.mouse.click(640 + (bot.dx - bot.dy) * 22, 360 + (bot.dx + bot.dy) * 22 - 25);
ok(await pagina.evaluate(() => window.__jogo.motor.obter('jogador').cast?.magia.id === 'lightning'), 'clique no bot começa o cast');
ok((await vidaBot()) === 100, 'sem dano antes do fim do cast');
await espera(1450); // Lightning: 4º círculo = 1,25 s
const v1 = await vidaBot();
ok(v1 < 100, `dano no fim do cast (vida ${v1})`);
const mana = await pagina.evaluate(() => window.__jogo.motor.obter('jogador').mana);
ok(mana >= 89 && mana <= 90, `Lightning gasta 11 de mana (mana ${mana}, com regeneração)`);
await pagina.keyboard.press('4');
await pagina.keyboard.press('t');
await espera(1450);
const v2 = await vidaBot();
ok(v2 < v1, `T acerta o último alvo (vida ${v1} -> ${v2})`);
await pagina.keyboard.press('7');
await pagina.keyboard.press('y');
ok(await pagina.evaluate(() => window.__jogo.motor.obter('jogador').cast?.alvoId === 'jogador'), 'Y mira em si mesmo (Heal)');
// Posicionar com target: o botão pede um clique no chão
await pagina.click('text=+ Bot parado');
await espera(100);
ok((await pagina.textContent('.dica-mira'))?.includes('Clique no chão'), 'botão de bot abre o target de posicionamento');
const antesBots = await pagina.evaluate(() => window.__jogo.motor.listar().filter((c) => c.bot?.modo === 'parado').length);
const destino = await pagina.evaluate(() => { const j = window.__jogo.jogador; return { x: j.x - 2, y: j.y + 2 }; });
await pagina.mouse.click(640 + (-2 - 2) * 22, 360 + (-2 + 2) * 22);
ok(await pagina.evaluate(([n, d]) => window.__jogo.motor.listar().some((c) => c.bot?.modo === 'parado' && c.mov.x === d.x && c.mov.y === d.y) &&
  window.__jogo.motor.listar().filter((c) => c.bot?.modo === 'parado').length === n + 1, [antesBots, destino]), 'bot aparece no tile clicado');

// Montar: duplo clique no cavalo ao lado; duplo clique em si mesmo desmonta
await pagina.evaluate(() => { const j = window.__jogo; j.criarCriatura('cavalo-1', { x: j.jogador.x + 1, y: j.jogador.y }); for (const c of j.motor.listar()) if (c.bot?.modo === 'criatura') c.bot.proximaDecisaoMs = 1e12; });
await pagina.mouse.dblclick(640 + 22, 360 + 22 - 20);
ok(await pagina.evaluate(() => window.__jogo.montaria?.anim === 'montaria-cavalo-1' && window.__jogo.jogador.montado), 'duplo clique no cavalo monta');
await pagina.mouse.dblclick(640, 360 - 25);
ok(await pagina.evaluate(() => window.__jogo.montaria === null && !window.__jogo.jogador.montado), 'duplo clique em si mesmo desmonta');
await pagina.keyboard.press('p');
await pagina.keyboard.press('b');
await espera(500);
ok(await pagina.evaluate(() => document.querySelectorAll('#janelas .gump').length === 2), 'P abre o paperdoll e B a mochila');
await pagina.mouse.click(640, 360 - 25, { button: 'right' });
await espera(100);
ok(await pagina.isVisible('.menu-contexto'), 'botão direito em si mesmo abre o menu');
await pagina.click('.menu-contexto [data-opcao="Paperdoll"]');
ok(await pagina.evaluate(() => document.querySelectorAll('#janelas .gump').length === 1 && !document.querySelector('.menu-contexto')),
  'opção Paperdoll do menu alterna o paperdoll e fecha o menu');
await pagina.mouse.click(640, 360 - 25, { button: 'right' });
await espera(100);
await pagina.screenshot({ path: join(SAIDA, 'menu.png') });
await pagina.keyboard.press('Escape');

// Criaturas
await pagina.click('text=Spawn aleatório (6)');
ok(await pagina.evaluate(() => window.__jogo.motor.listar().filter((c) => c.bot?.modo === 'criatura').length === 7), 'spawn aleatório cria mais 6 criaturas');
await espera(600);
await pagina.screenshot({ path: join(SAIDA, 'combate.png') });

ok(erros.length === 0, `sem erros no console (${erros.length}) ${erros.slice(0, 3).join(' | ')}`);
await navegador.close();
console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\nTudo certo');
process.exit(falhas.length ? 1 : 0);
