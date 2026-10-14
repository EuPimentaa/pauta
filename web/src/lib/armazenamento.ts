/**
 * Preferências locais (localStorage): recolher coluna, visão por quadro, quadros recentes, tema antes do login.
 * Tudo com o prefixo `pauta:` e tolerante a erro (modo privado, cota cheia, JSON quebrado).
 * useLocal sincroniza entre componentes e entre abas.
 */
import { useCallback, useSyncExternalStore } from 'react'

export const PREFIXO = 'pauta:'

const ouvintes = new Map<string, Set<() => void>>()

function avisar(chave: string) {
  ouvintes.get(chave)?.forEach((f) => f())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith(PREFIXO)) avisar(e.key.slice(PREFIXO.length))
  })
}

export function lerLocal<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave)
    return bruto === null ? padrao : (JSON.parse(bruto) as T)
  } catch {
    return padrao
  }
}

export function gravarLocal(chave: string, valor: unknown): void {
  try {
    if (valor === undefined) localStorage.removeItem(PREFIXO + chave)
    else localStorage.setItem(PREFIXO + chave, JSON.stringify(valor))
  } catch {
    // sem armazenamento: a preferência vale só nesta sessão
  }
  avisar(chave)
}

/** Cache do texto lido, para o useSyncExternalStore devolver a mesma referência enquanto nada mudou. */
const cache = new Map<string, { bruto: string | null; valor: unknown }>()

function ler<T>(chave: string, padrao: T): T {
  let bruto: string | null = null
  try { bruto = localStorage.getItem(PREFIXO + chave) } catch { /* indisponível */ }
  const anterior = cache.get(chave)
  if (anterior && anterior.bruto === bruto) return anterior.valor as T
  let valor: T = padrao
  if (bruto !== null) { try { valor = JSON.parse(bruto) as T } catch { valor = padrao } }
  cache.set(chave, { bruto, valor })
  return valor
}

export function useLocal<T>(chave: string, padrao: T): [T, (v: T | ((atual: T) => T)) => void] {
  const assinar = useCallback((f: () => void) => {
    let set = ouvintes.get(chave)
    if (!set) { set = new Set(); ouvintes.set(chave, set) }
    set.add(f)
    return () => { set.delete(f) }
  }, [chave])
  const valor = useSyncExternalStore(assinar, () => ler(chave, padrao), () => padrao)
  const definir = useCallback((v: T | ((atual: T) => T)) => {
    const novo = typeof v === 'function' ? (v as (a: T) => T)(ler(chave, padrao)) : v
    gravarLocal(chave, novo)
  }, [chave, padrao])
  return [valor, definir]
}
