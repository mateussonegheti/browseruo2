import type { CatalogoTiles } from '../mundo/catalogo';
import type { DefinicaoTile } from '../mundo/tipos';
import type { Editor, Ferramenta } from './editor';
import { criarSubEditorCriaturas, type AcoesCriaturas, type CriaturaEditavel } from './painel-criaturas';

/** Máximo de miniaturas por paleta (o resto aparece pela busca). */
const LIMITE_PALETA = 400;

/** Id legível: gráfico do cliente em hexadecimal quando existir. */
function descreverId(t: DefinicaoTile): string {
  return t.grafico !== undefined ? `0x${t.grafico.toString(16).toUpperCase().padStart(4, '0')}` : `id ${t.id}`;
}

/** Ações que o painel dispara; quem implementa é o main.ts. */
export interface AcoesPainel {
  criaturas: CriaturaEditavel[];
  matizes: AcoesCriaturas['matizes'];
  previaCriatura: AcoesCriaturas['previa'];
  colocarCriatura: AcoesCriaturas['colocar'];
  salvarPerfilCriatura: AcoesCriaturas['salvarPadrao'];
  salvar(): void;
  baixar(): void;
  carregarArquivo(arquivo: File): void;
  nova(): void;
  restaurar(): void;
  renomear(nome: string): void;
  /** Escolhe uma casa pronta (menu do deed) para a ferramenta Casa. */
  escolherCasa(): void;
  /** Põe um deed na mochila do jogador. */
  pegarDeed(): void;
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
    const defs: Array<[Ferramenta, string]> = [['colocar', 'Colocar'], ['muro', 'Muro'], ['apagar', 'Apagar'], ['spawn', 'Spawn A'], ['spawnB', 'Spawn B'], ['casa', 'Casa']];
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

    // Itens do jogo: casas prontas (deed) e dono das portas
    const jogo = document.createElement('div');
    jogo.className = 'linha quebra';
    jogo.append(
      this.botao('Casa pronta…', acoes.escolherCasa),
      this.botao('Pegar deed', acoes.pegarDeed),
    );
    raiz.append(jogo);
    const dono = document.createElement('select');
    dono.append(new Option('Qualquer um abre', ''), new Option('Só o lado A (dentro da casa)', 'A'), new Option('Só o lado B', 'B'));
    dono.addEventListener('change', () => { editor.donoPorta = dono.value as '' | 'A' | 'B'; });
    raiz.append(this.rotulo('Dono das portas colocadas (grupo Portas)', dono));

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
    raiz.append(criarSubEditorCriaturas(acoes.criaturas, {
      matizes: acoes.matizes, previa: acoes.previaCriatura, colocar: acoes.colocarCriatura, salvarPadrao: acoes.salvarPerfilCriatura,
    }));
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
    this.infoSelecionado.textContent = this.editor.ferramenta === 'casa'
      ? (this.editor.casa ? `Casa: ${this.editor.casa.nome}` : 'Escolha uma casa em "Casa pronta…"')
      : t
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

  /** Paleta de uma seção: um bloco recolhível (setinha) por grupo, com busca por nome/id. */
  private paleta(titulo: string, tiles: DefinicaoTile[]): HTMLElement {
    const secao = document.createElement('details');
    secao.className = 'secao-paleta';
    secao.open = true;
    const resumo = document.createElement('summary');
    resumo.textContent = titulo;
    secao.append(resumo);

    const porGrupo = new Map<string, DefinicaoTile[]>();
    for (const t of tiles) {
      const g = t.grupo ?? 'Sem grupo';
      const lista = porGrupo.get(g);
      if (lista) lista.push(t);
      else porGrupo.set(g, [t]);
    }

    const busca = document.createElement('input');
    busca.type = 'search';
    busca.placeholder = 'Buscar por nome ou id (ex.: wall, 0x1B)';

    const acoes = document.createElement('div');
    acoes.className = 'linha';
    const lista = document.createElement('div');
    secao.append(busca, acoes, lista);

    const blocos: Array<{ el: HTMLDetailsElement; desenhar: () => void }> = [];
    for (const [grupo, doGrupo] of porGrupo) {
      const el = document.createElement('details');
      el.className = 'grupo-paleta';
      const nome = document.createElement('summary');
      const grade = document.createElement('div');
      grade.className = 'paleta';
      el.append(nome, grade);
      const ids = new Set<number>();

      // Só cria as miniaturas quando o grupo está aberto: a paleta inteira passa de 3 mil itens
      const desenhar = (): void => {
        for (const id of ids) this.botoesPaleta.delete(id);
        ids.clear();
        grade.replaceChildren();
        const termo = busca.value.trim().toLowerCase();
        const achados = doGrupo.filter((t) =>
          !termo || t.nome.toLowerCase().includes(termo) || descreverId(t).toLowerCase().includes(termo));
        nome.textContent = `${grupo} (${achados.length})`;
        el.hidden = achados.length === 0;
        if (!el.open) return;
        for (const t of achados.slice(0, LIMITE_PALETA)) {
          const b = this.botaoTile(t);
          this.botoesPaleta.set(t.id, b);
          ids.add(t.id);
          grade.append(b);
        }
        if (achados.length > LIMITE_PALETA) {
          const aviso = document.createElement('p');
          aviso.className = 'dica';
          aviso.textContent = `Mostrando ${LIMITE_PALETA} de ${achados.length}. Refine a busca.`;
          grade.append(aviso);
        }
        this.atualizar();
      };
      el.addEventListener('toggle', desenhar);
      blocos.push({ el, desenhar });
      lista.append(el);
      nome.textContent = `${grupo} (${doGrupo.length})`;
    }

    const alternarTodos = (abrir: boolean): void => {
      for (const b of blocos) b.el.open = abrir;
      for (const b of blocos) b.desenhar();
    };
    acoes.append(this.botao('Abrir tudo', () => alternarTodos(true)), this.botao('Fechar tudo', () => alternarTodos(false)));

    busca.addEventListener('input', () => {
      const procurando = busca.value.trim() !== '';
      for (const b of blocos) {
        if (procurando) b.el.open = true;
        b.desenhar();
      }
    });
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
