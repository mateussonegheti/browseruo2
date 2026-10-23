// Menu do totem de batalha: escolher modo, tipo e lado; ou sair da arena.
import { MODOS_BATALHA, type LadoBatalha, type ModoBatalha, type TipoBatalha } from '../combate/batalha';

export interface EscolhaBatalha {
  modo: ModoBatalha;
  tipo: TipoBatalha;
  lado: LadoBatalha;
}

const ROTULO_MODO: Record<ModoBatalha, string> = { '1x1': '1x1', '2x2': '2x2', '3x3': '3x3', ffa: 'FFA' };
const ROTULO_TIPO: Record<TipoBatalha, string> = {
  treino: 'Treino — kit completo; ao morrer você sai com o que tinha',
  avera: 'A vera — seu próprio kit; o vencedor loota',
};
const ROTULO_LADO: Record<LadoBatalha, string> = { A: 'Lado A (dentro da casa)', B: 'Lado B (fora)' };

export class MenuBatalha {
  private el: HTMLElement | null = null;
  private escolha: EscolhaBatalha = { modo: '1x1', tipo: 'treino', lado: 'A' };

  constructor(private readonly raiz: HTMLElement) {}

  get aberto(): boolean { return this.el !== null; }

  /** Fora da batalha: escolhe e entra contra bots. */
  abrirEntrada(entrar: (e: EscolhaBatalha) => void): void {
    const el = this.criar('Totem de batalha — contra bots');
    const campo = <K extends keyof EscolhaBatalha>(chave: K, opcoes: Record<string, string>) => {
      const linha = document.createElement('div');
      linha.className = 'menu-batalha-linha';
      for (const [valor, texto] of Object.entries(opcoes)) {
        const b = document.createElement('button');
        b.textContent = texto;
        b.className = 'menu-batalha-opcao';
        const marcar = () => b.classList.toggle('ativo', this.escolha[chave] === valor);
        b.addEventListener('click', () => {
          (this.escolha[chave] as string) = valor;
          for (const irmao of linha.querySelectorAll<HTMLButtonElement>('button')) irmao.dispatchEvent(new Event('marcar'));
        });
        b.addEventListener('marcar', marcar);
        marcar();
        linha.append(b);
      }
      el.append(linha);
    };
    campo('modo', Object.fromEntries(MODOS_BATALHA.map((m) => [m, ROTULO_MODO[m]])));
    campo('tipo', ROTULO_TIPO);
    campo('lado', ROTULO_LADO);
    const ir = document.createElement('button');
    ir.className = 'menu-batalha-entrar';
    ir.textContent = 'Entrar na arena';
    ir.addEventListener('click', () => {
      const e = { ...this.escolha };
      this.fechar();
      entrar(e);
    });
    el.append(ir);
  }

  /** Dentro da batalha: só sair (ou aviso de que ainda não pode). */
  abrirSaida(texto: string | null, sair: () => void): void {
    const el = this.criar('Totem de batalha');
    if (texto) {
      const p = document.createElement('p');
      p.textContent = texto;
      el.append(p);
      return;
    }
    const b = document.createElement('button');
    b.className = 'menu-batalha-entrar';
    b.textContent = 'Sair da arena';
    b.addEventListener('click', () => {
      this.fechar();
      sair();
    });
    el.append(b);
  }

  fechar(): void {
    this.el?.remove();
    this.el = null;
  }

  private criar(titulo: string): HTMLElement {
    this.fechar();
    const el = document.createElement('div');
    el.className = 'gump menu-casas menu-batalha';
    const t = document.createElement('div');
    t.className = 'menu-casas-titulo';
    t.textContent = titulo;
    const x = document.createElement('button');
    x.textContent = '×';
    x.title = 'Fechar';
    x.addEventListener('click', () => this.fechar());
    t.append(x);
    el.append(t);
    this.raiz.append(el);
    this.el = el;
    return el;
  }
}
