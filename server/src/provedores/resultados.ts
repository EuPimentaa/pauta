/**
 * Fase 2 (F8): o provedor de resultados para o MCP (FASE2-PLANO §5; API.md §F.5.1; `ProvedorResultadosMcp` em
 * shared/tipos/mcp.ts). O F7 descobre este arquivo no boot e o usa em `resumo_cliente`, sem importar nada do F8.
 *
 * - `resultados` e `panorama`: as mesmas leituras da aba e da carteira; com cache vencido e `buscar: true`, busca e
 *   espera até `esperarMs` (o MCP passa 20 000); passou disso, devolve o que houver com `atualizando: true`.
 *   `buscar: false` = só o cache, sem disparar busca; `buscar` como função (o MCP) só é chamada quando a busca vai mesmo
 *   acontecer (o limite de 10 por hora conta só busca de verdade).
 * - Nunca lança: o erro de uma conta vira o `estado` do conector; uma exceção inesperada vai ao log mascarado e a
 *   resposta sai do cache, sem buscar (ou, se nem isso der, vazia, com o período certo).
 */
import type { PanoramaResultados, ProvedorResultadosMcp, ResultadosCliente } from '../../../shared/tipos/index.ts'
import { hojeSP } from '../../../shared/logica/datas.ts'
import { periodoDe } from '../../../shared/logica/resultados-periodo.ts'
import { agoraData, type Db } from '../db.ts'
import { lerPanorama, lerResultados, panoramaEsperando, resultadosEsperando } from '../servicos/resultados.ts'
import { descreverErro } from '../servicos/segredos.ts'

function tentar<T>(rotulo: string, fn: () => T): T | null {
  try {
    return fn()
  } catch (e) {
    console.error(`resultados provedor ${rotulo}: ${descreverErro(e)}`)
    return null
  }
}

export const provedor: ProvedorResultadosMcp<Db> = {
  tipo: 'resultados',

  async resultados(db, { clienteId, periodo, esperarMs, buscar }): Promise<ResultadosCliente> {
    try {
      return await resultadosEsperando(db, clienteId, periodo, esperarMs, buscar)
    } catch (e) {
      console.error(`resultados provedor: ${descreverErro(e)}`)
    }
    const doCache = tentar('cache', () => lerResultados(db, clienteId, periodo, { buscar: false }))
    if (doCache) return doCache
    return {
      clienteId, ...periodoDe(periodo, hojeSP(agoraData())), estado: 'ok', atualizando: false, contas: [],
      meta: null, googleAds: null, ga4: null, alertas: [],
    }
  },

  async panorama(db, { periodo, esperarMs, buscar }): Promise<PanoramaResultados> {
    try {
      return await panoramaEsperando(db, periodo, esperarMs, buscar)
    } catch (e) {
      console.error(`resultados provedor carteira: ${descreverErro(e)}`)
    }
    const doCache = tentar('carteira cache', () => lerPanorama(db, periodo, { buscar: false }))
    if (doCache) return doCache
    return { ...periodoDe(periodo, hojeSP(agoraData())), estado: 'ok', atualizando: false, buscadoEm: null, linhas: [] }
  },
}
