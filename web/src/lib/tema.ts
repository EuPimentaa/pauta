/**
 * Tema claro/escuro. A preferência da pessoa mora em `prefs.tema` (servidor, viaja entre aparelhos) e no localStorage
 * (`pauta:tema`, para pintar antes do login: web/public/tema.js lê a mesma chave antes do primeiro quadro).
 * 'sistema' tira o data-theme e deixa o color-scheme seguir o sistema.
 */
import { useSyncExternalStore } from 'react'
import { gravarLocal, lerLocal } from './armazenamento.ts'

export type PreferenciaTema = 'sistema' | 'claro' | 'escuro'
export type TemaEfetivo = 'claro' | 'escuro'

const CHAVE = 'tema'
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export function lerPreferenciaTema(): PreferenciaTema {
  const v = lerLocal<string>(CHAVE, 'sistema')
  return v === 'claro' || v === 'escuro' ? v : 'sistema'
}

/** Aplica no <html> (data-theme) e guarda no localStorage. */
export function aplicarTema(p: PreferenciaTema): void {
  const raiz = document.documentElement
  if (p === 'sistema') raiz.removeAttribute('data-theme')
  else raiz.setAttribute('data-theme', p === 'escuro' ? 'dark' : 'light')
  gravarLocal(CHAVE, p)
  avisar()
}

const consultaEscuro = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
consultaEscuro?.addEventListener('change', avisar)

export function temaEfetivo(p: PreferenciaTema = lerPreferenciaTema()): TemaEfetivo {
  if (p !== 'sistema') return p
  return consultaEscuro?.matches ? 'escuro' : 'claro'
}

function assinar(f: () => void) {
  ouvintes.add(f)
  return () => { ouvintes.delete(f) }
}

/** Preferência atual e o tema que está valendo (com 'sistema' resolvido). */
export function useTema(): { preferencia: PreferenciaTema; efetivo: TemaEfetivo } {
  const preferencia = useSyncExternalStore(assinar, lerPreferenciaTema, () => 'sistema' as const)
  const efetivo = useSyncExternalStore(assinar, () => temaEfetivo(preferencia), () => 'claro' as const)
  return { preferencia, efetivo }
}
