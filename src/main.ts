import './estilos.css';
import { direcaoPorVetorTela } from './nucleo/direcoes';
import { tileParaMundo, type Ponto } from './nucleo/projecao';
import { carregarCatalogo } from './mundo/catalogo';
import { tileBloqueado, temLinhaDeVisao } from './mundo/colisao';
import { Arena, TAMANHO_MAX, TAMANHO_MIN, criarMapaVazio } from './mundo/mapa';
import type { Direcao, Mapa } from './mundo/tipos';
import { atualizarJogador, criarJogador, posicaoVisual, tentarAndar, type EstadoJogador } from './jogo/jogador';
import { Renderizador, type PersonagemRender } from './render/renderizador';
import { Efeitos } from './render/efeitos';
import { Animacoes, type AcaoAnimacao, type Camada } from './render/animacoes';
import { Editor } from './editor/editor';
import { PainelEditor } from './editor/painel';
import {
  REGEX_NOME_ARENA, baixarJson, carregarDoProjeto, carregarLocal, lerArquivoJson, salvarLocal, salvarNoProjeto,
} from './persistencia/arena-io';
import regrasJson from './combate/regras.json';
import { MotorCombate } from './combate/motor';
import { decidirBot } from './combate/bot';
import type { Combatente, ModoBot, Regras } from './combate/tipos';
import { HudCombate } from './interface/hud-combate';
import { carregarRecursosInterface, cssCursor, cursorDirecional } from './interface/recursos';
import { Janelas, type PecaPaperdoll } from './interface/janelas';
import { MenuContexto, type OpcaoMenu } from './interface/menu-contexto';
import { Sons } from './interface/sons';

const NOME_ARENA_PADRAO = 'arena-padrao';
/** Distância (px) do cursor ao personagem acima da qual ele corre. */
const DISTANCIA_CORRIDA_PX = 130;
const ZONA_MORTA_PX = 12;
/** O corpo do personagem fica acima do pé; o vetor de direção parte do meio do corpo. */
const DESLOCAMENTO_CORPO_PX = 20;
const VELOCIDADE_CAMERA_EDITOR = 700; // px/s
const ID_JOGADOR = 'jogador';
const COR_JOGADOR = '#3d6fd1';
const COR_BOT = '#c2453c';

// Aparência (matizes do hues.mul): pele, sapatos, robe e cabelo
const PELE = 1002, CABELO = 1102, SAPATOS = 1109;
const ROBE_JOGADOR = 5, ROBE_BOT = 33;
const camadasMago = (robe: number): Camada[] => [
  { nome: 'humano', matiz: PELE }, { nome: 'sapatos', matiz: SAPATOS },
  { nome: 'robe', matiz: robe }, { nome: 'cabelo', matiz: CABELO },
];
/** Gumps do paperdoll (anim + 50000) com as mesmas cores das camadas animadas. */
const PAPERDOLL_JOGADOR: PecaPaperdoll[] = [
  { gump: '0x000C', matiz: PELE }, { gump: '0xC530', matiz: SAPATOS },
  { gump: '0xC525', matiz: ROBE_JOGADOR }, { gump: '0xC60C', matiz: CABELO },
];
const CURSOR_PADRAO = '0x2071';
const CURSOR_MIRA = '0x2076';
/** Vida das criaturas por tipo, com exceções para as mais fortes. */
const VIDA_CRIATURA: Record<string, number> = { animal: 40, monstro: 120 };
const VIDA_ESPECIAL: Record<string, number> = { ogro: 160, ettin: 180, troll: 150, lich: 200, daemon: 300, dragao: 400 };

async function iniciar(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#jogo')!;
  const elPainel = document.querySelector<HTMLElement>('#painel')!;
  const elHud = document.querySelector<HTMLElement>('#hud')!;
  const elCombate = document.querySelector<HTMLElement>('#combate')!;

  const catalogo = await carregarCatalogo('/catalogo/catalogo.json');
  const animacoes = new Animacoes();
  await animacoes.carregar();
  const renderizador = new Renderizador(canvas, catalogo, animacoes);
  const recursos = await carregarRecursosInterface();
  // Fonte com curvas do cliente (unifont.mul); a simples (unifont1.mul) fica de reserva
  const fonte = recursos.fontes.titulo ?? recursos.fontes.texto;
  renderizador.fonte = fonte;
  document.documentElement.style.setProperty('--cursor-ui', cssCursor(recursos, CURSOR_PADRAO));
  document.documentElement.style.setProperty('--cursor-pegar', cssCursor(recursos, '0x2075', 'grabbing'));
  const janelas = new Janelas(document.querySelector<HTMLElement>('#janelas')!, recursos, animacoes, {
    estoque: () => motor.obter(ID_JOGADOR)?.itens ?? {},
    usar: (item) => motor.usarItem(ID_JOGADOR, item, performance.now()),
    magias: () => motor.regras.magias,
    lancar: (magia) => motor.iniciarCast(ID_JOGADOR, magia, performance.now()),
  });
  const menu = new MenuContexto(document.querySelector<HTMLElement>('#janelas')!, fonte);
  // Barras do cliente só se os gumps foram extraídos
  const temGumpsStatus = await new Promise<boolean>((ok) => {
    const img = new Image();
    img.onload = () => ok(true);
    img.onerror = () => ok(false);
    img.src = '/interface/gumps/0x0803.png';
  });
  /** O botão direito que cancelou um posicionamento não abre o menu. */
  let ignorarMenu = false;
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

  // ---------- combate ----------
  const motor = new MotorCombate(regrasJson as Regras, {
    temVisao: (a, b) => temLinhaDeVisao(arena, catalogo, a, b),
    posicaoRespawn: (c) => {
      if (c.id === ID_JOGADOR) return tileLivrePerto(arena.spawn, c.id);
      if (c.bot?.modo === 'criatura') return tileAleatorio(c.id);
      return tileLivrePerto(jogador, c.id, 6);
    },
  });
  const eu = motor.criar(ID_JOGADOR, 'Você', jogador, performance.now());
  const aparencia = new Map<string, Camada[]>([[ID_JOGADOR, camadasMago(ROBE_JOGADOR)]]);
  const efeitos = new Efeitos();
  efeitos.fonte = fonte;
  void efeitos.carregar();
  /** Criatura em que o jogador está montado (fica fora do mundo enquanto isso). */
  let montaria: { c: Combatente; anim: string } | null = null;
  /** Algo esperando um clique no chão para ser posicionado (bot ou criatura). */
  let colocando: { texto: string; criar: (p: { x: number; y: number }) => void } | null = null;
  const sons = new Sons();
  let contadorBots = 0;

  /** Tile ocupado por outro personagem vivo (parado nele ou entrando nele). */
  const ocupadoPorOutro = (x: number, y: number, exceto: string): boolean =>
    motor.listar().some((c) => c.id !== exceto && !c.morto &&
      ((c.mov.x === x && c.mov.y === y) || (c.mov.movimento?.paraX === x && c.mov.movimento?.paraY === y)));

  /** Procura em espiral um tile livre a partir de `centro`, começando a `raioMin` tiles. */
  function tileLivrePerto(centro: { x: number; y: number }, id: string, raioMin = 0): { x: number; y: number } {
    for (let r = raioMin; r < 30; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = centro.x + dx;
          const y = centro.y + dy;
          if (!tileBloqueado(arena, catalogo, x, y) && !ocupadoPorOutro(x, y, id)) return { x, y };
        }
      }
    }
    return { x: centro.x, y: centro.y };
  }

  /** Tile livre sorteado dentro da arena (para criaturas). */
  function tileAleatorio(id: string): { x: number; y: number } {
    for (let i = 0; i < 200; i++) {
      const x = Math.floor(Math.random() * arena.largura);
      const y = Math.floor(Math.random() * arena.altura);
      if (!tileBloqueado(arena, catalogo, x, y) && !ocupadoPorOutro(x, y, id)) return { x, y };
    }
    return tileLivrePerto(arena.spawn, id, 3);
  }

  const criarBot = (modo: ModoBot, p: { x: number; y: number }): void => {
    contadorBots++;
    const id = `bot-${contadorBots}`;
    motor.criar(id, `Bot ${modo} ${contadorBots}`, criarJogador(p.x, p.y), performance.now(), modo);
    aparencia.set(id, camadasMago(ROBE_BOT));
    hud.avisar(`Bot ${modo} ${contadorBots} entrou na arena.`, performance.now());
  };
  /** Sem posição escolhida (testes e atalhos): perto do jogador. */
  const adicionarBot = (modo: ModoBot): void => criarBot(modo, tileLivrePerto(jogador, `bot-${contadorBots + 1}`, 5));
  const removerBots = (): void => {
    for (const c of motor.listar()) if (c.bot && c.bot.modo !== 'criatura') motor.remover(c.id);
  };

  const criarCriatura = (nome: string, pos?: { x: number; y: number }): void => {
    const info = animacoes.criaturas().find((c) => c.nome === nome);
    if (!info) return;
    contadorBots++;
    const id = `criatura-${contadorBots}`;
    const p = pos ?? tileAleatorio(id);
    const c = motor.criar(id, info.rotulo, criarJogador(p.x, p.y), performance.now(), 'criatura');
    c.vidaMax = c.vida = VIDA_ESPECIAL[nome] ?? VIDA_CRIATURA[info.tipo] ?? 50;
    aparencia.set(id, [{ nome }]);
  };
  const removerCriaturas = (): void => {
    for (const c of motor.listar()) if (c.bot?.modo === 'criatura') motor.remover(c.id);
  };

  const lancarMagia = (magiaId: string): void => {
    motor.iniciarCast(ID_JOGADOR, magiaId, performance.now());
  };

  /** Montar: a criatura sai do mundo e passa a ser desenhada embaixo do jogador. */
  const montar = (c: Combatente, anim: string): void => {
    motor.remover(c.id);
    montaria = { c, anim };
    jogador.montado = true;
    hud.avisar(`Você montou: ${c.nome}.`, performance.now());
  };
  const desmontar = (): void => {
    if (!montaria) return;
    const { c } = montaria;
    const p = tileLivrePerto(jogador, c.id, 1);
    c.mov.x = p.x;
    c.mov.y = p.y;
    c.mov.movimento = null;
    c.mov.dir = jogador.dir;
    motor.adicionar(c);
    montaria = null;
    jogador.montado = false;
  };

  /** Valores do status completo do jogador. */
  const dadosStatus = () => {
    const bonus = (a: 'str' | 'dex') => eu.modificadores.filter((m) => m.atributo === a).reduce((t, m) => t + m.valor, 0);
    const pesoItens = Object.values(eu.itens).reduce((t, q) => t + q, 0);
    return {
      nome: eu.nome, str: eu.ficha.atributos.str + bonus('str'), dex: eu.ficha.atributos.dex + bonus('dex'),
      int: eu.ficha.atributos.int, vida: eu.vida, vidaMax: eu.vidaMax, mana: eu.mana, manaMax: eu.manaMax,
      stam: eu.stam, stamMax: eu.stamMax, ar: eu.ficha.resistencias.fisica, ouro: 0, peso: Math.round(pesoItens / 10),
    };
  };

  /** Monta se a criatura estiver ao lado e o jogador puder. */
  const tentarMontar = (c: Combatente, anim: string): void => {
    const agora = performance.now();
    if (montaria) hud.avisar('Você já está montado.', agora);
    else if (eu.morto) hud.avisar('Você está morto.', agora);
    else if (Math.max(Math.abs(c.mov.x - jogador.x), Math.abs(c.mov.y - jogador.y)) > 1) hud.avisar('Chegue mais perto para montar.', agora);
    else montar(c, anim);
  };
  const montariaDaCriatura = (c: Combatente): string | undefined =>
    c.bot?.modo === 'criatura' ? animacoes.montariaDe(aparencia.get(c.id)?.[0]?.nome ?? '') : undefined;

  /** Botões do painel: o cursor vira target e o clique no chão escolhe o lugar. */
  const pedirPosicao = (texto: string, criar: (p: { x: number; y: number }) => void): void => {
    colocando = { texto, criar };
    hud.avisar(`Escolha onde colocar: ${texto}.`, performance.now());
  };

  const hud = new HudCombate(elCombate, motor, {
    lancar: lancarMagia,
    adicionarBot: (modo) => pedirPosicao(`bot ${modo}`, (p) => criarBot(modo, p)),
    removerBots,
    adicionarCriatura: (nome) => {
      const rotulo = animacoes.criaturas().find((c) => c.nome === nome)?.rotulo ?? nome;
      pedirPosicao(rotulo.toLowerCase(), (p) => criarCriatura(nome, p));
    },
    spawnCriaturas: (n) => {
      const lista = animacoes.criaturas();
      for (let i = 0; i < n && lista.length; i++) criarCriatura(lista[Math.floor(Math.random() * lista.length)]!.nome);
    },
    removerCriaturas,
    alternarSom: () => (sons.ativo = !sons.ativo),
  }, animacoes.criaturas(), {
    gumps: temGumpsStatus,
    fonte,
    abrirStatus: () => void janelas.alternarStatus(dadosStatus),
  });

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
    eu.mov = jogador;
    montaria = null;
    colocando = null;
    removerBots();
    removerCriaturas();
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

  /** Personagem vivo sob o cursor (o da frente, se houver mais de um). */
  const combatenteSobMouse = (agora: number): Combatente | undefined => {
    if (!entrada.mouse) return undefined;
    const camera = cameraAtual(agora);
    let escolhido: { c: Combatente; y: number } | undefined;
    for (const c of motor.listar()) {
      if (c.morto) continue;
      const v = posicaoVisual(c.mov, agora);
      const p = renderizador.tileParaCanvas(v.x, v.y, camera);
      const dentro = Math.abs(entrada.mouse.x - p.x) <= 16 && entrada.mouse.y >= p.y - 60 && entrada.mouse.y <= p.y + 12;
      if (dentro && (!escolhido || p.y > escolhido.y)) escolhido = { c, y: p.y };
    }
    return escolhido?.c;
  };

  const alternarEditor = (agora: number): void => {
    if (!editor.ativo) cameraEditor = cameraAtual(agora);
    editor.alternar();
    entrada.segurando = false;
    entrada.pintando = null;
    painel.mostrar(editor.ativo);
    hud.mostrar(!editor.ativo);
  };

  const posicaoNoCanvas = (e: MouseEvent): Ponto => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // ---------- eventos ----------
  // Botão direito num personagem: menu com paperdoll, mochila, montar e desmontar
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (ignorarMenu || editor.ativo || colocando || eu.mira) {
      ignorarMenu = false;
      return;
    }
    const c = combatenteSobMouse(performance.now());
    if (!c) return;
    if (c.id === ID_JOGADOR) {
      const opcoes: OpcaoMenu[] = [
        { rotulo: 'Paperdoll', acao: () => void janelas.alternarPaperdoll('Você', PAPERDOLL_JOGADOR) },
        { rotulo: 'Mochila', acao: () => void janelas.alternarMochila() },
      ];
      if (montaria) opcoes.push({ rotulo: 'Desmontar', acao: desmontar });
      menu.abrir(e.clientX, e.clientY, 'Você', opcoes);
      return;
    }
    const anim = montariaDaCriatura(c);
    if (anim) menu.abrir(e.clientX, e.clientY, c.nome, [{ rotulo: 'Montar', acao: () => tentarMontar(c, anim) }]);
  });

  canvas.addEventListener('mousedown', (e) => {
    entrada.mouse = posicaoNoCanvas(e);
    if (menu.aberto) return; // o clique fora só fecha o menu
    if (editor.ativo) {
      if (e.button !== 0 && e.button !== 2) return;
      editor.iniciarGesto();
      entrada.pintando = { apagar: e.button === 2 };
      const t = tileSobMouse(cameraEditor);
      if (t) {
        editor.aplicar(t.x, t.y, entrada.pintando.apagar);
        entrada.ultimoTile = t;
      }
    } else if (colocando) {
      // Target de posicionamento: esquerdo coloca, direito cancela
      const agora = performance.now();
      if (e.button === 2) {
        colocando = null;
        ignorarMenu = true;
        return;
      }
      const t = e.button === 0 ? tileSobMouse(cameraAtual(agora)) : null;
      if (!t) return;
      if (!arena.dentro(t.x, t.y) || tileBloqueado(arena, catalogo, t.x, t.y) || ocupadoPorOutro(t.x, t.y, '')) {
        hud.avisar('Não dá para colocar aí.', agora);
        return;
      }
      colocando.criar(t);
      colocando = null;
    } else if (e.button === 0 && eu.mira) {
      // Cursor de mira: o clique escolhe o alvo em vez de andar
      const agora = performance.now();
      const alvo = combatenteSobMouse(agora);
      if (alvo) motor.escolherAlvo(ID_JOGADOR, alvo.id, agora);
      else motor.cancelarMira(ID_JOGADOR);
    } else if (e.button === 0) {
      // Clique em outro personagem não anda (permite o duplo clique para montar)
      const sob = combatenteSobMouse(performance.now());
      if (!sob || sob.id === ID_JOGADOR) entrada.segurando = true;
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

  canvas.addEventListener('dblclick', () => {
    if (editor.ativo || colocando || eu.mira) return;
    const agora = performance.now();
    const c = combatenteSobMouse(agora);
    if (!c) return;
    if (c.id === ID_JOGADOR) {
      // Como no UO: duplo clique em si mesmo desmonta; a pé, abre o paperdoll
      if (montaria) desmontar();
      else void janelas.alternarPaperdoll('Você', PAPERDOLL_JOGADOR);
      return;
    }
    const anim = montariaDaCriatura(c);
    if (anim) tentarMontar(c, anim);
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
    if (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    const agora = performance.now();
    if (k === 'e') {
      alternarEditor(agora);
      return;
    }
    if (editor.ativo) {
      if (k === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const anterior = editor.desfazer();
        if (anterior) {
          arena = new Arena(anterior);
          salvarLocal(arena.dados);
          painel.mostrarStatus('Desfeito.');
        } else painel.mostrarStatus('Nada para desfazer.');
      } else if (k === 'g') editor.grade = !editor.grade;
      else entrada.teclas.add(k);
      return;
    }
    // Atalhos de combate
    const magia = motor.regras.magias.find((m) => m.tecla === k);
    if (magia) lancarMagia(magia.id);
    else if (k === 'escape') {
      if (colocando) colocando = null;
      else motor.cancelarMira(ID_JOGADOR);
    } else if (k === 'p') void janelas.alternarPaperdoll('Você', PAPERDOLL_JOGADOR);
    else if (k === 'b') void janelas.alternarMochila();
    else if (k === 't' && eu.mira) {
      if (eu.ultimoAlvoId) motor.escolherAlvo(ID_JOGADOR, eu.ultimoAlvoId, agora);
      else hud.avisar('Nenhum alvo anterior.', agora);
    } else if (k === 'y' && eu.mira) motor.escolherAlvo(ID_JOGADOR, ID_JOGADOR, agora);
  });
  window.addEventListener('keyup', (e) => entrada.teclas.delete(e.key.toLowerCase()));

  // ---------- combate por quadro ----------
  const andar = (c: Combatente, dir: Direcao, correndo: boolean, agora: number): boolean =>
    tentarAndar(c.mov, dir, correndo, agora, arena, catalogo, (x, y) => ocupadoPorOutro(x, y, c.id));

  const atualizarCombate = (agora: number): void => {
    motor.atualizar(agora);
    for (const c of motor.listar()) {
      if (c.id !== ID_JOGADOR) atualizarJogador(c.mov, agora);
      if (!c.bot) continue;
      const acao = decidirBot(c, eu, motor, agora, Math.random, (a, b) => temLinhaDeVisao(arena, catalogo, a, b));
      if (acao.lancar) motor.iniciarCast(c.id, acao.lancar, agora);
      else if (acao.alvo) motor.escolherAlvo(c.id, acao.alvo, agora);
      else if (acao.cancelarMira) motor.cancelarMira(c.id);
      else if (acao.mover !== undefined && motor.podeMover(c.id, agora)) {
        // Se o caminho direto estiver bloqueado, tenta as direções vizinhas
        const d = acao.mover;
        void (andar(c, d, false, agora) || andar(c, ((d + 1) % 8) as Direcao, false, agora) ||
          andar(c, ((d + 7) % 8) as Direcao, false, agora));
      }
    }
    for (const ev of motor.coletarEventos()) {
      efeitos.adicionar(ev, agora);
      if (ev.tipo === 'dano') apanharAte.set(ev.alvoId, agora + DURACAO_APANHAR_MS);
      if (ev.tipo === 'som') sons.tocar(ev.som);
      else if (ev.tipo === 'aviso' && ev.paraId === ID_JOGADOR) hud.avisar(ev.texto, agora);
      else if (ev.tipo === 'morte') {
        if (ev.alvoId === ID_JOGADOR) desmontar();
        hud.avisar(`${motor.obter(ev.alvoId)?.nome ?? '?'} morreu.`, agora);
      }
    }
  };

  /** Ação de animação e o progresso dela (0 a 1) a partir do estado do combatente. */
  const estadoAnimacao = (c: Combatente, agora: number): { acao: AcaoAnimacao; progresso: number } => {
    if (c.morto) {
      const morte = c.respawnEmMs - motor.regras.respawnMs;
      return { acao: 'morrer', progresso: Math.min(0.999, (agora - morte) / 1000) };
    }
    if (c.cast) return { acao: 'castar', progresso: Math.min(0.999, (agora - c.cast.inicioMs) / (c.cast.fimMs - c.cast.inicioMs)) };
    const m = c.mov.movimento;
    const fimApanhar = apanharAte.get(c.id) ?? 0;
    if (!m && !c.mov.montado && agora < fimApanhar) {
      return { acao: 'apanhar', progresso: 1 - (fimApanhar - agora) / DURACAO_APANHAR_MS };
    }
    if (m || agora - c.mov.ultimoFim < 120) {
      const passo = m?.duracao ?? (c.mov.montado ? 200 : 400);
      const correndo = c.mov.montado ? passo <= 100 : passo <= 200;
      // Um ciclo de animação a cada dois passos, como no cliente
      return { acao: correndo ? 'correr' : 'andar', progresso: (agora / (passo * 2)) % 1 };
    }
    return { acao: 'parado', progresso: (agora / 2000) % 1 };
  };

  const personagens = (agora: number): PersonagemRender[] =>
    motor.listar().map((c) => ({
      ...estadoAnimacao(c, agora),
      camadas: aparencia.get(c.id),
      montaria: c.id === ID_JOGADOR ? montaria?.anim : undefined,
      mov: c.mov,
      nome: c.nome,
      cor: c.bot ? COR_BOT : COR_JOGADOR,
      vidaFrac: c.vida / c.vidaMax,
      morto: c.morto,
      envenenado: Boolean(c.veneno),
      paralisado: motor.paralisado(c, agora),
      reflexo: c.reflexo > 0,
      destaque: c.id === eu.ultimoAlvoId,
    }));

  const posicaoNoMundo = (agora: number) => (id: string): Ponto | null => {
    const c = motor.obter(id);
    if (!c) return null;
    const v = posicaoVisual(c.mov, agora);
    return tileParaMundo(v.x, v.y);
  };

  /** Cursor do cliente: target na mira, luva apontando para onde o personagem andaria no jogo. */
  let cursorAtual = '';
  /** Fim da animação de "apanhar" de cada personagem (dispara a cada dano recebido). */
  const apanharAte = new Map<string, number>();
  const DURACAO_APANHAR_MS = 450;
  let ultimaMochila = 0;
  const atualizarCursor = (): void => {
    let id = CURSOR_PADRAO;
    if (!editor.ativo) {
      if (eu.mira || colocando) id = CURSOR_MIRA;
      else if (entrada.mouse) {
        id = cursorDirecional(entrada.mouse.x - canvas.clientWidth / 2,
          entrada.mouse.y - (canvas.clientHeight / 2 - DESLOCAMENTO_CORPO_PX));
      }
    }
    if (id === cursorAtual) return;
    cursorAtual = id;
    canvas.style.cursor = cssCursor(recursos, id, id === CURSOR_MIRA ? 'crosshair' : 'default');
  };

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
      if (entrada.segurando && entrada.mouse && motor.podeMover(ID_JOGADOR, agora)) {
        const vx = entrada.mouse.x - canvas.clientWidth / 2;
        const vy = entrada.mouse.y - (canvas.clientHeight / 2 - DESLOCAMENTO_CORPO_PX);
        const distancia = Math.hypot(vx, vy);
        if (distancia > ZONA_MORTA_PX) {
          andar(eu, direcaoPorVetorTela(vx, vy), distancia > DISTANCIA_CORRIDA_PX, agora);
        }
      }
      atualizarCombate(agora);
    }

    const camera = cameraAtual(agora);
    const hover = editor.ativo ? tileSobMouse(camera) : null;
    renderizador.desenhar({
      arena, personagens: personagens(agora), agora, camera, hover,
      fantasma: editor.fantasma,
      grade: editor.ativo && editor.grade,
      sobreposicao: editor.ativo ? undefined : (ctx) => efeitos.desenhar(ctx, agora, posicaoNoMundo(agora)),
    });
    canvas.classList.toggle('mirando', !editor.ativo && Boolean(eu.mira || colocando));
    atualizarCursor();
    if (agora - ultimaMochila > 300) {
      janelas.atualizarMochila();
      janelas.atualizarStatus();
      ultimaMochila = agora;
    }
    hud.dicaExtra = colocando ? `Clique no chão para colocar: ${colocando.texto} · Esc ou botão direito cancela` : null;
    if (!editor.ativo) hud.atualizar(eu, eu.ultimoAlvoId ? motor.obter(eu.ultimoAlvoId) : undefined, agora);

    const sobre = hover && arena.dentro(hover.x, hover.y) ? ` · cursor (${hover.x}, ${hover.y})` : '';
    elHud.textContent = editor.ativo
      ? `EDITOR · ${arena.nome} ${arena.largura}×${arena.altura}${sobre}`
      : `JOGO · (${jogador.x}, ${jogador.y}) · segure o botão esquerdo para andar · 1–0: magias · E: editor`;

    requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);

  // Gancho de depuração apenas em desenvolvimento (usado nos testes de navegador).
  if (import.meta.env.DEV) {
    Object.defineProperty(window, '__jogo', {
      value: {
        get jogador() { return jogador; }, get arena() { return arena; }, get montaria() { return montaria; },
        editor, motor, adicionarBot, criarCriatura, janelas,
      },
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
