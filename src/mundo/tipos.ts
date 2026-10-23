// Tipos centrais do mundo. Mantidos sem dependências para serem usados
// tanto pelo cliente (navegador) quanto, no futuro, pelo servidor.

/** Direções no padrão do UO: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SO, 6=O, 7=NO. */
export type Direcao = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type TipoTile = 'terreno' | 'objeto';

/** Sprite real extraído do cliente (opcional; sem ele usa-se o placeholder). */
export interface SpriteTile {
  /** Caminho relativo a /sprites/, ex.: "objetos/0x0001.png" */
  arquivo: string;
  largura: number;
  altura: number;
}

export interface DefinicaoTile {
  /** Identificador único dentro do catálogo (inteiro >= 1). */
  id: number;
  nome: string;
  tipo: TipoTile;
  /** Altura em unidades Z do UO (1 Z = 4 px na tela). Terreno usa 0. */
  altura: number;
  /** Impede a passagem do personagem (flag "Impassable" do tiledata). */
  bloqueia: boolean;
  /** Cor do placeholder (#rrggbb). */
  cor: string;
  sprite?: SpriteTile | null;
  /** Telhado (flag Roof do tiledata): some quando o jogador está debaixo dele. */
  teto?: boolean;
  /** Porta: `par` é o tile da outra posição (aberta/fechada) e (dx, dy) o deslocamento ao alternar. */
  porta?: { par: number; dx: number; dy: number; aberta?: boolean };
  /** Grupo da paleta do editor (ex.: "Muro de pedra"). */
  grupo?: string;
  /** Id do gráfico no cliente do UO (terreno: landtiles; objeto: art). */
  grafico?: number;
}

export interface Catalogo {
  versao: number;
  /** "placeholder" ou "cliente-<versao>" quando gerado pelo extrator. */
  origem: string;
  tiles: DefinicaoTile[];
}

export interface ObjetoMapa {
  x: number;
  y: number;
  z: number;
  id: number;
  /** Lado que controla a porta (A = quem nasce no spawn A); sem valor, qualquer um abre. */
  dono?: Lado;
  /** Construção (deed) a que o objeto pertence; demolir a casa remove todos. */
  casa?: number;
}

/** Lados da batalha: A nasce dentro da casa, B fora. */
export type Lado = 'A' | 'B';

export interface Mapa {
  versao: number;
  nome: string;
  largura: number;
  altura: number;
  /** Id do terreno de cada célula, linha a linha (tamanho largura*altura). */
  terreno: number[];
  objetos: ObjetoMapa[];
  spawn: { x: number; y: number };
  /** Ponto de nascimento do lado B (opcional). */
  spawnB?: { x: number; y: number };
}
