/**
 * Nome do produto (APP_NOME, padrão "Pauta"; nunca fixo no código) e título da aba.
 * Antes do login vem do <meta name="application-name"> do index.html (o servidor pode trocar pelo APP_NOME ao servir);
 * depois, de bootstrap.app.nome (api/bootstrap.ts chama definirNomeApp).
 */
import { useEffect, useSyncExternalStore } from 'react'

const PADRAO = 'Pauta'
let nome: string | null = null
const ouvintes = new Set<() => void>()

function lerMeta(): string {
  if (typeof document === 'undefined') return PADRAO
  const meta = document.querySelector<HTMLMetaElement>('meta[name="application-name"]')
  const v = meta?.content.trim()
  return v ? v : PADRAO
}

export function nomeApp(): string {
  if (nome === null) nome = lerMeta()
  return nome
}

export function definirNomeApp(novo: string | null | undefined): void {
  const v = novo?.trim()
  if (!v || v === nomeApp()) return
  nome = v
  ouvintes.forEach((f) => f())
}

export function useNomeApp(): string {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    nomeApp,
    () => PADRAO,
  )
}

/** "<titulo> · <APP_NOME>" na aba (só o nome do produto sem título). Telas com título dinâmico chamam com o nome. */
export function useTituloAba(titulo?: string | null): void {
  const app = useNomeApp()
  useEffect(() => {
    document.title = titulo ? `${titulo} · ${app}` : app
  }, [titulo, app])
}
