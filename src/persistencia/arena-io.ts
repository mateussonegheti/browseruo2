import { validarMapa } from '../mundo/mapa';
import type { Mapa } from '../mundo/tipos';

// v2: ids do catálogo extraído do cliente (as cópias v1 usavam ids de placeholder).
const CHAVE_LOCAL = 'browseruo.arena.v2';
/** Mesma regra aplicada no servidor de desenvolvimento (vite.config.ts). */
export const REGEX_NOME_ARENA = /^[a-z0-9_-]{1,40}$/i;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

/** Cópia de segurança no navegador (por viewer; pode falhar em janela privada). */
export function salvarLocal(mapa: Mapa): void {
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(mapa));
  } catch { /* sem armazenamento: segue sem cópia local */ }
}

export function carregarLocal(): Mapa | null {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCAL);
    if (!bruto) return null;
    const res = validarMapa(JSON.parse(bruto));
    return res.ok ? res.mapa : null;
  } catch {
    return null;
  }
}

export async function carregarDoProjeto(nome: string): Promise<Resultado<Mapa>> {
  if (!REGEX_NOME_ARENA.test(nome)) return { ok: false, erro: 'nome de arena inválido' };
  try {
    const resp = await fetch(`/arenas/${nome}.json`, { cache: 'no-store' });
    if (!resp.ok) return { ok: false, erro: `arquivo não encontrado (${resp.status})` };
    const res = validarMapa(await resp.json());
    return res.ok ? { ok: true, valor: res.mapa } : { ok: false, erro: res.erros.join('; ') };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}

/** Grava em public/arenas/<nome>.json via servidor de desenvolvimento (npm run dev). */
export async function salvarNoProjeto(mapa: Mapa): Promise<Resultado<string>> {
  if (!REGEX_NOME_ARENA.test(mapa.nome)) return { ok: false, erro: 'nome inválido (use letras, números, - e _)' };
  try {
    const resp = await fetch(`/api/arenas/${mapa.nome}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapa),
    });
    if (!resp.ok) return { ok: false, erro: `servidor recusou (${resp.status}): ${await resp.text()}` };
    return { ok: true, valor: `public/arenas/${mapa.nome}.json` };
  } catch (e) {
    return { ok: false, erro: `sem servidor de desenvolvimento: ${String(e)}` };
  }
}

export function baixarJson(mapa: Mapa): void {
  const blob = new Blob([JSON.stringify(mapa)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${mapa.nome}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function lerArquivoJson(arquivo: File): Promise<Resultado<Mapa>> {
  try {
    const res = validarMapa(JSON.parse(await arquivo.text()));
    return res.ok ? { ok: true, valor: res.mapa } : { ok: false, erro: res.erros.join('; ') };
  } catch (e) {
    return { ok: false, erro: `JSON ilegível: ${String(e)}` };
  }
}
