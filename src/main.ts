import './estilos.css';
import { direcaoPorVetorTela } from './nucleo/direcoes';
import { tileParaMundo, type Ponto } from './nucleo/projecao';
import { carregarCatalogo } from './mundo/catalogo';
import { Arena, TAMANHO_MAX, TAMANHO_MIN, criarMapaVazio } from './mundo/mapa';
import type { Mapa } from './mundo/tipos';
import { atualizarJogador, criarJogador, posicaoVisual, tentarAndar, type EstadoJogador } from './jogo/jogador';
import { Renderizador } from './render/renderizador';
import { Editor } from './editor/editor';
import { PainelEditor } from './editor/painel';
import {
  REGEX_NOME_ARENA, baixarJson, carregarDoProjeto, carregarLocal, lerArquivoJson, salvarLocal, salvarNoProjeto,
} from './persistencia/arena-io';

const NOME_ARENA_PADRAO = 'arena-padrao';
/** Distância (px) do cursor ao personagem acima da qual ele corre. */
const DISTANCIA_CORRIDA_PX = 130;
const ZONA_MORTA_PX = 12;
/** O corpo do personagem fica acima do pé; o vetor de direção parte do meio do corpo. */
const DESLOCAMENTO_CORPO_PX = 20;
const VELOCIDADE_CAMERA_EDITOR = 700; // px/s

async function iniciar(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#jogo')!;
  const elPainel = document.querySelector<HTMLElement>('#painel')!;
  const elHud = document.querySelector<HTMLElement>('#hud')!;

  const catalogo = await carregarCatalogo('/catalogo/catalogo.json');
  const renderizador = new Renderizador(canvas, catalogo);
  const terrenoPadrao = catalogo.listar('terreno')[0]?.id ?? 1;

  // ---------- estado ----------
  let arena = new Arena(await obterMapaInicial(terrenoPadrao));
  let jogador: EstadoJogador = criarJogador(arena.spawn.x, arena.spawn.y);
  let cameraEditor: Ponto = { x: 0, y: 0 };
  const entrada = {
    segurando: false,
    mouse: null as Ponto | null,
    teclas: new Set<string>(),
    pintando: null as null | { apagar: boolean },
    ultimoTile: null as null | { x: number; y: number },
  };

  // ---------- editor ----------
  let temporizadorAutosave: number | undefined;
  const editor = new Editor(() => arena, catalogo, () => {
    painel.mostrarStatus('Alterações ainda não salvas no projeto (cópia local atualizada).');
    window.clearTimeout(temporizadorAutosave);
    temporizadorAutosave = window.setTimeout(() => salvarLocal(arena.dados), 400);
  });

  const trocarArena = (mapa: Mapa, mensagem: string): void => {
    arena = new Arena(mapa);
    jogador = criarJogador(arena.spawn.x, arena.spawn.y);
    painel.definirNome(mapa.nome);
    painel.mostrarStatus(mensagem);
    salvarLocal(arena.dados);
  };

  const painel = new PainelEditor(elPainel, editor, catalogo, {
    async salvar() {
      salvarLocal(arena.dados);
      const r = await salvarNoProjeto(arena.dados);
      painel.mostrarStatus(
        r.ok ? `Salvo em ${r.valor}.` : `Cópia local salva, mas não gravou no projeto: ${r.erro}`, !r.ok,
      );
    },
    baixar() { baixarJson(arena.dados); painel.mostrarStatus('JSON baixado.'); },
    async carregarArquivo(arquivo) {
      const r = await lerArquivoJson(arquivo);
      if (r.ok) trocarArena(r.valor, `Arena "${r.valor.nome}" carregada do arquivo.`);
      else painel.mostrarStatus(`Arquivo recusado: ${r.erro}`, true);
    },
    nova() {
      const resposta = window.prompt(`Tamanho da nova arena (largura x altura, ${TAMANHO_MIN} a ${TAMANHO_MAX}):`, '48x48');
      if (!resposta) return;
      const m = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(resposta);
      const largura = Number(m?.[1]);
      const altura = Number(m?.[2]);
      if (!m || largura < TAMANHO_MIN || largura > TAMANHO_MAX || altura < TAMANHO_MIN || altura > TAMANHO_MAX) {
        painel.mostrarStatus('Tamanho inválido.', true);
        return;
      }
      if (!window.confirm('Descartar a arena atual e criar uma nova em branco?')) return;
      trocarArena(criarMapaVazio('nova-arena', largura, altura, terrenoPadrao), 'Nova arena criada.');
    },
    async restaurar() {
      const nome = arena.nome;
      if (!window.confirm(`Descartar alterações e recarregar "${nome}" do projeto?`)) return;
      const r = await carregarDoProjeto(nome);
      if (r.ok) trocarArena(r.valor, 'Arena restaurada do projeto.');
      else painel.mostrarStatus(`Não foi possível restaurar: ${r.erro}`, true);
    },
    renomear(nome) {
      if (REGEX_NOME_ARENA.test(nome)) {
        arena.dados.nome = nome;
        painel.mostrarStatus(`Nome alterado para "${nome}".`);
      } else {
        painel.definirNome(arena.nome);
        painel.mostrarStatus('Nome inválido: use letras, números, - e _ (até 40).', true);
      }
    },
  });
  painel.definirNome(arena.nome);
  painel.mostrar(false);

  // ---------- helpers ----------
  const cameraAtual = (agora: number): Ponto => {
    if (editor.ativo) return cameraEditor;
    const p = posicaoVisual(jogador, agora);
    return tileParaMundo(p.x, p.y);
  };

  const tileSobMouse = (camera: Ponto): { x: number; y: number } | null =>
    entrada.mouse ? renderizador.canvasParaTile(entrada.mouse.x, entrada.mouse.y, camera) : null;

  const alternarEditor = (agora: number): void => {
    if (!editor.ativo) cameraEditor = cameraAtual(agora);
    editor.alternar();
    entrada.segurando = false;
    entrada.pintando = null;
    painel.mostrar(editor.ativo);
  };

  const posicaoNoCanvas = (e: MouseEvent): Ponto => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // ---------- eventos ----------
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    entrada.mouse = posicaoNoCanvas(e);
    if (editor.ativo) {
      if (e.button !== 0 && e.button !== 2) return;
      entrada.pintando = { apagar: e.button === 2 };
      const t = tileSobMouse(cameraEditor);
      if (t) {
        editor.aplicar(t.x, t.y, entrada.pintando.apagar);
        entrada.ultimoTile = t;
      }
    } else if (e.button === 0) {
      entrada.segurando = true;
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    entrada.mouse = posicaoNoCanvas(e);
    if (editor.ativo && entrada.pintando) {
      const t = tileSobMouse(cameraEditor);
      const mudou = t && (!entrada.ultimoTile || t.x !== entrada.ultimoTile.x || t.y !== entrada.ultimoTile.y);
      if (t && mudou) {
        editor.aplicar(t.x, t.y, entrada.pintando.apagar);
        entrada.ultimoTile = t;
      }
    }
  });

  canvas.addEventListener('mouseleave', () => { entrada.mouse = null; });
  window.addEventListener('mouseup', () => {
    entrada.segurando = false;
    entrada.pintando = null;
    entrada.ultimoTile = null;
  });
  window.addEventListener('blur', () => {
    entrada.segurando = false;
    entrada.pintando = null;
    entrada.teclas.clear();
  });
  window.addEventListener('resize', () => renderizador.redimensionar());

  window.addEventListener('keydown', (e) => {
    const alvo = e.target as HTMLElement;
    if (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'e') alternarEditor(performance.now());
    else if (k === 'g' && editor.ativo) editor.grade = !editor.grade;
    else entrada.teclas.add(k);
  });
  window.addEventListener('keyup', (e) => entrada.teclas.delete(e.key.toLowerCase()));

  // ---------- laço principal ----------
  let anterior = performance.now();
  const quadro = (agora: number): void => {
    const dt = Math.min(0.1, (agora - anterior) / 1000);
    anterior = agora;

    if (editor.ativo) {
      const t = entrada.teclas;
      const dx = (t.has('d') || t.has('arrowright') ? 1 : 0) - (t.has('a') || t.has('arrowleft') ? 1 : 0);
      const dy = (t.has('s') || t.has('arrowdown') ? 1 : 0) - (t.has('w') || t.has('arrowup') ? 1 : 0);
      cameraEditor = {
        x: cameraEditor.x + dx * VELOCIDADE_CAMERA_EDITOR * dt,
        y: cameraEditor.y + dy * VELOCIDADE_CAMERA_EDITOR * dt,
      };
    } else {
      atualizarJogador(jogador, agora);
      if (entrada.segurando && entrada.mouse) {
        const vx = entrada.mouse.x - canvas.clientWidth / 2;
        const vy = entrada.mouse.y - (canvas.clientHeight / 2 - DESLOCAMENTO_CORPO_PX);
        const distancia = Math.hypot(vx, vy);
        if (distancia > ZONA_MORTA_PX) {
          tentarAndar(jogador, direcaoPorVetorTela(vx, vy), distancia > DISTANCIA_CORRIDA_PX, agora, arena, catalogo);
        }
      }
    }

    const camera = cameraAtual(agora);
    const hover = editor.ativo ? tileSobMouse(camera) : null;
    renderizador.desenhar({
      arena, jogador, agora, camera, hover,
      fantasma: editor.fantasma,
      grade: editor.ativo && editor.grade,
    });

    const sobre = hover && arena.dentro(hover.x, hover.y) ? ` · cursor (${hover.x}, ${hover.y})` : '';
    elHud.textContent = editor.ativo
      ? `EDITOR · ${arena.nome} ${arena.largura}×${arena.altura}${sobre}`
      : `JOGO · posição (${jogador.x}, ${jogador.y}) · segure o botão esquerdo na direção desejada (longe = correr) · E: editor`;

    requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);

  // Gancho de depuração apenas em desenvolvimento (usado nos testes de navegador).
  if (import.meta.env.DEV) {
    Object.defineProperty(window, '__jogo', {
      value: { get jogador() { return jogador; }, get arena() { return arena; }, editor },
    });
  }
}

/** Prioridade: cópia local do navegador -> arquivo do projeto -> arena vazia. */
async function obterMapaInicial(terrenoPadrao: number): Promise<Mapa> {
  const local = carregarLocal();
  if (local) return local;
  const doProjeto = await carregarDoProjeto(NOME_ARENA_PADRAO);
  if (doProjeto.ok) return doProjeto.valor;
  console.warn('Arena padrão indisponível, criando uma vazia:', doProjeto.erro);
  return criarMapaVazio(NOME_ARENA_PADRAO, 48, 48, terrenoPadrao);
}

iniciar().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<pre class="erro-fatal">Erro ao iniciar: ${String(e)}</pre>`);
  console.error(e);
});
