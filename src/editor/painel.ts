import type { CatalogoTiles } from '../mundo/catalogo';
import type { DefinicaoTile } from '../mundo/tipos';
import type { Editor, Ferramenta } from './editor';

/** Máximo de miniaturas por paleta (o resto aparece pela busca). */
const LIMITE_PALETA = 400;

/** Id legível: gráfico do cliente em hexadecimal quando existir. */
function descreverId(t: DefinicaoTile): string {
  return t.grafico !== undefined ? `0x${t.grafico.toString(16).toUpperCase().padStart(4, '0')}` : `id ${t.id}`;
}

/** Ações que o painel dispara; quem implementa é o main.ts. */
export interface AcoesPainel {
  salvar(): void;
  baixar(): void;
  carregarArquivo(arquivo: File): void;
  nova(): void;
  restaurar(): void;
  renomear(nome: string): void;
}

/** Painel HTML do editor (paleta, ferramentas, Z e arquivo). */
export class PainelEditor {
  private readonly raiz: HTMLElement;
  private readonly status: HTMLElement;
  private readonly botoesPaleta = new Map<number, HTMLButtonElement>();
  private readonly botoesFerramenta = new Map<Ferramenta, HTMLButtonElement>();
  private readonly campoNome: HTMLInputElement;
  private readonly infoSelecionado: HTMLElement;

  constructor(raiz: HTMLElement, private readonly editor: Editor, catalogo: CatalogoTiles, acoes: AcoesPainel) {
    this.raiz = raiz;
    raiz.innerHTML = '';

    raiz.append(this.titulo('Editor de arena'));

    // Nome
    this.campoNome = document.createElement('input');
    this.campoNome.type = 'text';
    this.campoNome.maxLength = 40;
    this.campoNome.placeholder = 'nome-da-arena';
    this.campoNome.addEventListener('change', () => acoes.renomear(this.campoNome.value.trim()));
    raiz.append(this.rotulo('Nome do arquivo', this.campoNome));

    // Ferramentas
    const barra = document.createElement('div');
    barra.className = 'linha';
    const defs: Array<[Ferramenta, string]> = [['colocar', 'Colocar'], ['muro', 'Muro'], ['apagar', 'Apagar'], ['spawn', 'Spawn']];
    for (const [f, rotulo] of defs) {
      const b = this.botao(rotulo, () => { editor.ferramenta = f; this.atualizar(); });
      this.botoesFerramenta.set(f, b);
      barra.append(b);
    }
    raiz.append(barra);

    // Ferramenta Muro: escolhe o material; as peças (reta, quina, poste) saem sozinhas
    if (editor.conjuntos.length) {
      const material = document.createElement('select');
      for (const c of editor.conjuntos) material.append(new Option(c.nome, c.nome));
      material.addEventListener('change', () => {
        editor.conjunto = editor.conjuntos.find((c) => c.nome === material.value);
        editor.ferramenta = 'muro';
        this.atualizar();
      });
      raiz.append(this.rotulo('Material do muro (ferramenta Muro)', material));
    }

    // Z
    const z = document.createElement('input');
    z.type = 'number';
    z.min = '0';
    z.max = '120';
    z.value = String(editor.z);
    z.addEventListener('input', () => { editor.z = Math.max(0, Math.min(120, Number(z.value) || 0)); });
    raiz.append(this.rotulo('Altura Z do objeto (1 Z = 4 px)', z));

    // Paletas
    this.infoSelecionado = document.createElement('p');
    this.infoSelecionado.className = 'selecionado';
    raiz.append(this.infoSelecionado);
    raiz.append(this.paleta('Terreno', catalogo.listar('terreno')));
    raiz.append(this.paleta('Objetos', catalogo.listar('objeto')));

    // Arquivo
    const arq = document.createElement('div');
    arq.className = 'linha quebra';
    arq.append(
      this.botao('Salvar', acoes.salvar, 'primario'),
      this.botao('Baixar JSON', acoes.baixar),
      this.botao('Carregar JSON…', () => entrada.click()),
      this.botao('Nova…', acoes.nova),
      this.botao('Restaurar do projeto', acoes.restaurar),
    );
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = 'application/json,.json';
    entrada.hidden = true;
    entrada.addEventListener('change', () => {
      const f = entrada.files?.[0];
      if (f) acoes.carregarArquivo(f);
      entrada.value = '';
    });
    raiz.append(arq, entrada);

    this.status = document.createElement('p');
    this.status.className = 'status';
    raiz.append(this.status);

    const dica = document.createElement('p');
    dica.className = 'dica';
    dica.textContent =
      'Esquerdo: usar ferramenta (arraste para pintar) · Direito: apagar · Ctrl+Z: desfazer · W/A/S/D ou setas: câmera · G: grade · E: fechar editor';
    raiz.append(dica);

    this.atualizar();
  }

  definirNome(nome: string): void { this.campoNome.value = nome; }

  mostrarStatus(texto: string, erro = false): void {
    this.status.textContent = texto;
    this.status.dataset.erro = erro ? '1' : '0';
  }

  mostrar(visivel: boolean): void { this.raiz.hidden = !visivel; }

  atualizar(): void {
    for (const [id, b] of this.botoesPaleta) b.classList.toggle('ativo', id === this.editor.selecionadoId);
    for (const [f, b] of this.botoesFerramenta) b.classList.toggle('ativo', f === this.editor.ferramenta);
    const t = this.editor.selecionado;
    this.infoSelecionado.textContent = t
      ? `${t.nome} · ${descreverId(t)} · altura ${t.altura}${t.bloqueia ? ' · bloqueia' : ''}`
      : 'Nada selecionado';
  }

  // ---------- helpers de DOM ----------

  private titulo(texto: string, tag: 'h2' | 'h3' = 'h2'): HTMLElement {
    const el = document.createElement(tag);
    el.textContent = texto;
    return el;
  }

  private rotulo(texto: string, campo: HTMLElement): HTMLElement {
    const l = document.createElement('label');
    const s = document.createElement('span');
    s.textContent = texto;
    l.append(s, campo);
    return l;
  }

  private botao(texto: string, aoClicar: () => void, classe = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    if (classe) b.className = classe;
    b.addEventListener('click', aoClicar);
    return b;
  }

  /** Paleta de uma seção: filtro por grupo, busca por nome/id e grade de miniaturas. */
  private paleta(titulo: string, tiles: DefinicaoTile[]): HTMLElement {
    const secao = document.createElement('section');
    secao.append(this.titulo(titulo, 'h3'));

    const grupos = [...new Set(tiles.map((t) => t.grupo).filter((g): g is string => Boolean(g)))];
    const filtro = document.createElement('select');
    filtro.append(new Option('Todos os grupos', ''));
    for (const g of grupos) filtro.append(new Option(g, g));
    filtro.value = grupos[0] ?? '';

    const busca = document.createElement('input');
    busca.type = 'search';
    busca.placeholder = 'Buscar por nome ou id (ex.: wall, 0x1B)';

    const contador = document.createElement('p');
    contador.className = 'dica';
    const grade = document.createElement('div');
    grade.className = 'paleta';
    const daSecao = new Set<number>();

    const desenhar = (): void => {
      for (const id of daSecao) this.botoesPaleta.delete(id);
      daSecao.clear();
      grade.replaceChildren();
      const termo = busca.value.trim().toLowerCase();
      const filtrados = tiles.filter((t) =>
        (!filtro.value || t.grupo === filtro.value) &&
        (!termo || t.nome.toLowerCase().includes(termo) || descreverId(t).toLowerCase().includes(termo)));
      for (const t of filtrados.slice(0, LIMITE_PALETA)) {
        const b = this.botaoTile(t);
        this.botoesPaleta.set(t.id, b);
        daSecao.add(t.id);
        grade.append(b);
      }
      contador.textContent = filtrados.length > LIMITE_PALETA
        ? `Mostrando ${LIMITE_PALETA} de ${filtrados.length}. Refine a busca.`
        : `${filtrados.length} tile(s)`;
      this.atualizar();
    };
    filtro.addEventListener('change', desenhar);
    busca.addEventListener('input', desenhar);

    if (grupos.length) secao.append(filtro);
    secao.append(busca, grade, contador);
    desenhar();
    return secao;
  }

  private botaoTile(t: DefinicaoTile): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = String(t.id);
    b.title = `${t.nome} (${descreverId(t)}${t.bloqueia ? ', bloqueia' : ''})`;
    const amostra = (): HTMLElement => {
      const i = document.createElement('i');
      i.style.background = t.cor;
      return i;
    };
    if (t.sprite) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = t.nome;
      img.src = `/sprites/${t.sprite.arquivo}`;
      img.addEventListener('error', () => img.replaceWith(amostra()));
      b.append(img);
    } else {
      const nome = document.createElement('span');
      nome.textContent = t.nome;
      b.append(amostra(), nome);
      b.classList.add('com-nome');
    }
    if (t.bloqueia) b.classList.add('bloqueia');
    b.addEventListener('click', () => {
      this.editor.selecionadoId = t.id;
      this.editor.ferramenta = 'colocar';
      this.atualizar();
    });
    return b;
  }

}
