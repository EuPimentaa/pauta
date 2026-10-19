/**
 * Ponte do MCP com os dados de outras funcionalidades (F7, FASE2-PLANO §5, API.md §F.5.1), sem import cruzado: cada
 * dona cria `server/src/provedores/<prefixo>.ts` com `export const provedor: ProvedorMcp<Db>` (resultados da Windsor,
 * agenda da Melt) e este arquivo descobre a pasta no boot, como as rotas. Pasta ausente ou vazia = nenhum provedor (a
 * ferramenta diz "ainda não disponível"). Os testes trocam com `definirProvedores()`.
 */
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ProvedorAgendaMcp, ProvedorMcp, ProvedorResultadosMcp } from '../../../shared/tipos/index.ts'
import type { Db } from '../db.ts'
import { descreverErro } from './segredos.ts'

const PASTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'provedores')

let resultados: ProvedorResultadosMcp<Db> | null = null
let agenda: ProvedorAgendaMcp<Db> | null = null

async function descobrir(): Promise<void> {
  if (!existsSync(PASTA)) return
  for (const nome of readdirSync(PASTA).filter((n) => n.endsWith('.ts') && !n.endsWith('.d.ts')).sort()) {
    try {
      const mod = (await import(pathToFileURL(join(PASTA, nome)).href)) as { provedor?: ProvedorMcp<Db> }
      const p = mod.provedor
      if (p?.tipo === 'resultados' && typeof p.resultados === 'function') resultados ??= p
      else if (p?.tipo === 'agenda' && typeof p.eventos === 'function') agenda ??= p
    } catch (e) {
      // um provedor quebrado não derruba o MCP: a ferramenta segue sem ele
      console.error(`mcp provedor ${nome}: ${descreverErro(e)}`)
    }
  }
}

await descobrir()

export function provedorResultados(): ProvedorResultadosMcp<Db> | null {
  return resultados
}

export function provedorAgenda(): ProvedorAgendaMcp<Db> | null {
  return agenda
}

/** Testes: troca os provedores (null tira; ausente mantém). Devolve os de antes para restaurar. */
export function definirProvedores(p: { resultados?: ProvedorResultadosMcp<Db> | null; agenda?: ProvedorAgendaMcp<Db> | null }):
  { resultados: ProvedorResultadosMcp<Db> | null; agenda: ProvedorAgendaMcp<Db> | null } {
  const antes = { resultados, agenda }
  if (p.resultados !== undefined) resultados = p.resultados
  if (p.agenda !== undefined) agenda = p.agenda
  return antes
}
