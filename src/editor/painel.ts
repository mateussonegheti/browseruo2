import type { CatalogoTiles } from '../mundo/catalogo';
import type { DefinicaoTile } from '../mundo/tipos';
import type { Editor, Ferramenta } from './editor';

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
    const defs: Array<[Ferramenta, string]> = [['colocar', 'Colocar'], ['apagar', 'Apagar'], ['spawn', 'Spawn']];
    for (const [f, rotulo] of defs) {
      const b = this.botao(rotulo, () => { editor.ferramenta = f; this.atualizar(); });
      this.botoesFerramenta.set(f, b);
      barra.append(b);
    }
    raiz.append(barra);

    // Z
    const z = document.createElement('input');
    z.type = 'number';
    z.min = '0';
    z.max = '120';
    z.value = String(editor.z);
    z.addEventListener('input', () => { editor.z = Math.max(0, Math.min(120, Number(z.value) || 0)); });
    raiz.append(this.rotulo('Altura Z do objeto (1 Z = 4 px)', z));

    // Paletas
    raiz.append(this.titulo('Terreno', 'h3'), this.paleta(catalogo.listar('terreno')));
    raiz.append(this.titulo('Objetos', 'h3'), this.paleta(catalogo.listar('objeto')));

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
      'Esquerdo: usar ferramenta · Direito: apagar · W/A/S/D ou setas: mover a câmera · G: grade · E: fechar editor';
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

  private paleta(tiles: DefinicaoTile[]): HTMLElement {
    const grade = document.createElement('div');
    grade.className = 'paleta';
    for (const t of tiles) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = `${t.nome} (id ${t.id}${t.bloqueia ? ', bloqueia' : ''})`;
      const amostra = document.createElement('i');
      amostra.style.background = t.cor;
      const nome = document.createElement('span');
      nome.textContent = t.nome + (t.bloqueia ? ' ⛔' : '');
      b.append(amostra, nome);
      b.addEventListener('click', () => {
        this.editor.selecionadoId = t.id;
        this.editor.ferramenta = 'colocar';
        this.atualizar();
      });
      this.botoesPaleta.set(t.id, b);
      grade.append(b);
    }
    return grade;
  }
}
