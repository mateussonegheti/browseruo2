// Perfil editável de uma criatura (cor, atributos, resistências, velocidade e comportamento). Sem DOM.
import type { Elemento, Ficha } from './tipos';

export type Comportamento = 'passear' | 'parado';

export interface PerfilCriatura {
  nome: string;
  /** Matiz do hues.mul; 0 = cores originais. */
  matiz: number;
  vida: number;
  str: number;
  dex: number;
  int: number;
  resistencias: Record<Elemento, number>;
  /** Milissegundos por passo (menor = mais rápida). */
  passoMs: number;
  comportamento: Comportamento;
}

export const ELEMENTOS: Elemento[] = ['fisica', 'fogo', 'frio', 'veneno', 'energia'];
const LIMITES = { vida: [1, 5000], atributo: [1, 1000], resistencia: [0, 100], passoMs: [50, 2000] } as const;

const VIDA_CRIATURA: Record<string, number> = { animal: 40, monstro: 120 };
const VIDA_ESPECIAL: Record<string, number> = { ogro: 160, ettin: 180, troll: 150, lich: 200, daemon: 300, dragao: 400 };

const limitar = (v: number, [min, max]: readonly [number, number], padrao: number): number =>
  Math.round(Math.min(max, Math.max(min, Number.isFinite(v) ? v : padrao)));

export function vidaPadrao(corpo: string, tipo: string): number {
  return VIDA_ESPECIAL[corpo] ?? VIDA_CRIATURA[tipo] ?? 50;
}

/** Perfil de fábrica: o mesmo que a criatura tinha antes do editor (vida por tipo, ficha do modelo). */
export function perfilPadrao(corpo: string, tipo: string, rotulo: string, modelo: Ficha): PerfilCriatura {
  const vida = vidaPadrao(corpo, tipo);
  return {
    nome: rotulo,
    matiz: 0,
    vida,
    str: Math.max(1, (vida - 50) * 2),
    dex: modelo.atributos.dex,
    int: modelo.atributos.int,
    resistencias: { ...modelo.resistencias },
    passoMs: 400,
    comportamento: 'passear',
  };
}

/** Garante valores válidos (a entrada vem de campos de formulário e do localStorage). */
export function normalizarPerfil(p: Partial<PerfilCriatura>, base: PerfilCriatura): PerfilCriatura {
  const resistencias = { ...base.resistencias };
  for (const e of ELEMENTOS) resistencias[e] = limitar(p.resistencias?.[e] ?? base.resistencias[e], LIMITES.resistencia, base.resistencias[e]);
  return {
    nome: (p.nome ?? base.nome).trim().slice(0, 30) || base.nome,
    matiz: Math.max(0, Math.round(Number.isFinite(p.matiz) ? p.matiz! : base.matiz)),
    vida: limitar(p.vida ?? base.vida, LIMITES.vida, base.vida),
    str: limitar(p.str ?? base.str, LIMITES.atributo, base.str),
    dex: limitar(p.dex ?? base.dex, LIMITES.atributo, base.dex),
    int: limitar(p.int ?? base.int, LIMITES.atributo, base.int),
    resistencias,
    passoMs: limitar(p.passoMs ?? base.passoMs, LIMITES.passoMs, base.passoMs),
    comportamento: p.comportamento === 'parado' ? 'parado' : 'passear',
  };
}

const CHAVE = 'browseruo.perfis-criaturas';

/** Perfis salvos pelo usuário (por corpo), lidos do localStorage. */
export function lerPerfisSalvos(): Record<string, Partial<PerfilCriatura>> {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as unknown;
    return bruto && typeof bruto === 'object' ? (bruto as Record<string, Partial<PerfilCriatura>>) : {};
  } catch {
    return {};
  }
}

export function gravarPerfilSalvo(corpo: string, perfil: PerfilCriatura | null): void {
  const todos = lerPerfisSalvos();
  if (perfil) todos[corpo] = perfil;
  else delete todos[corpo];
  try {
    localStorage.setItem(CHAVE, JSON.stringify(todos));
  } catch { /* sem armazenamento: o perfil vale só nesta sessão */ }
}
