// Sub-editor de criaturas: escolhe o corpo, ajusta cor, atributos, resistências e velocidade, e coloca no mapa.
import { ELEMENTOS, normalizarPerfil, type PerfilCriatura } from '../combate/criaturas';

export interface CriaturaEditavel {
  nome: string;
  rotulo: string;
  tipo: string;
  /** Perfil ao abrir (o padrão salvo pelo usuário, se houver). */
  perfil: PerfilCriatura;
  padraoFabrica: PerfilCriatura;
}

export interface AcoesCriaturas {
  matizes: Array<{ id: number; cor: string }>;
  previa(ctx: CanvasRenderingContext2D, nome: string, matiz: number, x: number, y: number): void;
  colocar(nome: string, perfil: PerfilCriatura): void;
  /** `null` apaga o padrão salvo. */
  salvarPadrao(nome: string, perfil: PerfilCriatura | null): void;
}

const ROTULO_ELEMENTO: Record<string, string> = {
  fisica: 'Física', fogo: 'Fogo', frio: 'Frio', veneno: 'Veneno', energia: 'Energia',
};

export function criarSubEditorCriaturas(criaturas: CriaturaEditavel[], acoes: AcoesCriaturas): HTMLElement {
  const secao = document.createElement('details');
  secao.className = 'secao-paleta sub-criaturas';
  const resumo = document.createElement('summary');
  resumo.textContent = 'Criaturas';
  secao.append(resumo);
  if (!criaturas.length) {
    const p = document.createElement('p');
    p.className = 'dica';
    p.textContent = 'Nenhuma criatura extraída (rode o extrator).';
    secao.append(p);
    return secao;
  }

  const lista = document.createElement('select');
  for (const [tipo, titulo] of [['monstro', 'Monstros'], ['animal', 'Animais']] as const) {
    const grupo = document.createElement('optgroup');
    grupo.label = titulo;
    for (const c of criaturas.filter((x) => x.tipo === tipo)) grupo.append(new Option(c.rotulo, c.nome));
    if (grupo.children.length) lista.append(grupo);
  }

  const previa = document.createElement('canvas');
  previa.width = 160;
  previa.height = 150;
  previa.className = 'previa-criatura';

  const campo = (rotulo: string, tipo: 'text' | 'number', min = 0, max = 0): HTMLInputElement => {
    const i = document.createElement('input');
    i.type = tipo;
    if (tipo === 'number') { i.min = String(min); i.max = String(max); }
    else i.maxLength = 30;
    i.title = rotulo;
    return i;
  };
  const rotulado = (texto: string, el: HTMLElement): HTMLElement => {
    const l = document.createElement('label');
    const s = document.createElement('span');
    s.textContent = texto;
    l.append(s, el);
    return l;
  };

  const nome = campo('Nome', 'text');
  const vida = campo('Vida', 'number', 1, 5000);
  const str = campo('Força', 'number', 1, 1000);
  const dex = campo('Destreza', 'number', 1, 1000);
  const int = campo('Inteligência', 'number', 1, 1000);
  const passo = campo('Velocidade', 'number', 50, 2000);
  const comportamento = document.createElement('select');
  comportamento.append(new Option('Passeia pela arena', 'passear'), new Option('Fica parada', 'parado'));
  const resist = Object.fromEntries(ELEMENTOS.map((e) => [e, campo(ROTULO_ELEMENTO[e]!, 'number', 0, 100)])) as Record<string, HTMLInputElement>;

  // Cor: matiz 0 é a cor original; os demais vêm do hues.mul
  const cores = document.createElement('div');
  cores.className = 'cores-criatura';
  let matiz = 0;
  const botoesCor = new Map<number, HTMLButtonElement>();
  const nenhuma = document.createElement('button');
  nenhuma.type = 'button';
  nenhuma.textContent = 'Original';
  nenhuma.className = 'cor-original';
  botoesCor.set(0, nenhuma);
  cores.append(nenhuma);
  for (const m of acoes.matizes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = `Matiz ${m.id}`;
    b.style.background = m.cor;
    botoesCor.set(m.id, b);
    cores.append(b);
  }

  const atual = (): CriaturaEditavel => criaturas.find((c) => c.nome === lista.value) ?? criaturas[0]!;

  const desenharPrevia = (): void => {
    const g = previa.getContext('2d')!;
    g.clearRect(0, 0, previa.width, previa.height);
    acoes.previa(g, atual().nome, matiz, previa.width / 2, previa.height - 14);
  };
  const escolherCor = (id: number): void => {
    matiz = id;
    for (const [k, b] of botoesCor) b.classList.toggle('ativo', k === id);
    desenharPrevia();
  };
  for (const [id, b] of botoesCor) b.addEventListener('click', () => escolherCor(id));

  const preencher = (p: PerfilCriatura): void => {
    nome.value = p.nome;
    vida.value = String(p.vida);
    str.value = String(p.str);
    dex.value = String(p.dex);
    int.value = String(p.int);
    passo.value = String(p.passoMs);
    comportamento.value = p.comportamento;
    for (const e of ELEMENTOS) resist[e]!.value = String(p.resistencias[e]);
    escolherCor(p.matiz);
  };
  const ler = (): PerfilCriatura => normalizarPerfil({
    nome: nome.value, matiz, vida: Number(vida.value), str: Number(str.value), dex: Number(dex.value),
    int: Number(int.value), passoMs: Number(passo.value), comportamento: comportamento.value as PerfilCriatura['comportamento'],
    resistencias: Object.fromEntries(ELEMENTOS.map((e) => [e, Number(resist[e]!.value)])) as PerfilCriatura['resistencias'],
  }, atual().padraoFabrica);

  lista.addEventListener('change', () => preencher(atual().perfil));

  const dica = document.createElement('p');
  dica.className = 'dica';
  dica.textContent = 'Velocidade em ms por passo (menor = mais rápida; 400 é o passo a pé). Resistências de 0 a 100.';

  const linhaResist = document.createElement('div');
  linhaResist.className = 'grade-campos';
  for (const e of ELEMENTOS) linhaResist.append(rotulado(ROTULO_ELEMENTO[e]!, resist[e]!));
  const linhaAtrib = document.createElement('div');
  linhaAtrib.className = 'grade-campos';
  linhaAtrib.append(rotulado('Vida', vida), rotulado('Força', str), rotulado('Destreza', dex), rotulado('Inteligência', int));

  const botao = (texto: string, aoClicar: () => void, classe = ''): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    if (classe) b.className = classe;
    b.addEventListener('click', aoClicar);
    return b;
  };
  const acoesLinha = document.createElement('div');
  acoesLinha.className = 'linha quebra';
  acoesLinha.append(
    botao('Colocar no mapa', () => acoes.colocar(atual().nome, ler()), 'primario'),
    botao('Salvar como padrão', () => {
      const c = atual();
      c.perfil = ler();
      acoes.salvarPadrao(c.nome, c.perfil);
    }),
    botao('Restaurar de fábrica', () => {
      const c = atual();
      c.perfil = c.padraoFabrica;
      acoes.salvarPadrao(c.nome, null);
      preencher(c.perfil);
    }),
  );

  secao.append(
    rotulado('Criatura', lista), previa, rotulado('Nome', nome), rotulado('Cor', cores),
    linhaAtrib, rotulado('Velocidade (ms por passo)', passo), rotulado('Comportamento', comportamento),
    rotulado('Resistências (%)', linhaResist), dica, acoesLinha,
  );
  preencher(atual().perfil);
  return secao;
}
