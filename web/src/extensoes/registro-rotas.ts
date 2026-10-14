/**
 * Rotas descobertas em telas/**\/rota.tsx (contrato em extensoes/tipos.ts, ExtensaoRota). É o único registro que o
 * App.tsx importa direto: só metadados e `carregar` (cada tela vira um chunk), para a página pública não baixar o resto
 * das extensões (esse fica em registro.ts, carregado com import() pela área autenticada).
 */
import type { ExtensaoRota, ModulosExtensao } from './tipos.ts'

const modulos = import.meta.glob<ModulosExtensao['rota']>('../telas/**/rota.tsx', { eager: true })

let cache: ExtensaoRota[] | null = null

export function rotas(): ExtensaoRota[] {
  if (cache) return cache
  const lista: ExtensaoRota[] = []
  for (const [arquivo, m] of Object.entries(modulos)) {
    const daqui = [...(m.rota ? [m.rota] : []), ...(m.rotas ?? [])]
    if (import.meta.env.DEV && daqui.length === 0 && !arquivo.includes('/dev')) {
      console.error(`[extensões] ${arquivo} não exporta \`rota\` nem \`rotas\`.`)
    }
    lista.push(...daqui)
  }
  if (import.meta.env.DEV) {
    const vistos = new Set<string>()
    for (const r of lista) {
      if (vistos.has(r.caminho)) console.error(`[extensões] rota repetida: ${r.caminho}`)
      vistos.add(r.caminho)
    }
  }
  cache = lista
  return lista
}
