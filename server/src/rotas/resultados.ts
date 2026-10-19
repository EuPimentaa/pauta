/**
 * Fase 2 (F8): rotas dos resultados da Windsor (API.md §F.8 e §F.7). Todas capturam o próprio erro: ErroHttp (e o erro
 * de banco traduzido) segue o caminho de sempre; o resto vira `500 interno` com o log `descreverErro` (nunca o objeto
 * inteiro do onError, que poderia levar a URL da Windsor ou um texto dela).
 *
 * | Rota | Quem |
 * |---|---|
 * | GET  /api/resultados/contas (?recarregar=1) | admin e atendimento (recarregar: admin) |
 * | GET  /api/resultados/panorama?periodo= | todos |
 * | GET  /api/clientes/:id/resultados/contas | todos |
 * | POST /api/clientes/:id/resultados/contas | cliente.editar |
 * | DELETE /api/clientes/:id/resultados/contas/:ligacaoId | cliente.editar |
 * | GET  /api/clientes/:id/resultados?periodo= | todos |
 * | POST /api/clientes/:id/resultados/atualizar | todos (1 por cliente a cada 5 min) |
 */
import type { Context } from 'hono'
import { z } from 'zod'
import {
  CONECTORES_WINDSOR, PERIODOS_RESULTADOS, type AtualizarResultadosEntrada, type LigarContaEntrada, type PeriodoResultados,
} from '../../../shared/tipos/index.ts'
import { corpoJson, exigirPapel, exigirUsuario, validar, type Ambiente, type App } from '../auth.ts'
import { tx } from '../db.ts'
import { ErroHttp, traduzirErroBanco, validacao } from '../erros.ts'
import { carregarClienteResumo } from '../servicos/clientes.ts'
import { exigir } from '../servicos/permissoes.ts'
import { atualizarAgora, contasLigadas, lerPanorama, lerResultados } from '../servicos/resultados.ts'
import { desligarConta, ligarConta, listarContasWindsor } from '../servicos/resultados-contas.ts'
import { descreverErro } from '../servicos/segredos.ts'

const ligarEsquema: z.ZodType<LigarContaEntrada> = z.object({
  conector: z.enum(CONECTORES_WINDSOR),
  contaId: z.string().trim().min(1).max(60),
  nome: z.string().trim().max(200).optional(),
})
const atualizarEsquema: z.ZodType<AtualizarResultadosEntrada> = z.object({ periodo: z.enum(PERIODOS_RESULTADOS) })

/** `?periodo=` (padrão 30d; outro valor → 400). */
function periodoDaConsulta(c: Context<Ambiente>): PeriodoResultados {
  const p = c.req.query('periodo')
  if (p === undefined || p === '') return '30d'
  if (!(PERIODOS_RESULTADOS as readonly string[]).includes(p)) {
    throw validacao(`Período inválido: use ${PERIODOS_RESULTADOS.join(', ')}.`, { periodo: 'fora da lista' })
  }
  return p as PeriodoResultados
}

/** O handler com a captura da Fase 2 (API.md §F.1). */
function protegido(rotulo: string, h: (c: Context<Ambiente>) => Response | Promise<Response>) {
  return async (c: Context<Ambiente>): Promise<Response> => {
    try {
      return await h(c)
    } catch (e) {
      const traduzido = traduzirErroBanco(e)
      if (traduzido) throw traduzido
      console.error(`resultados ${rotulo}: ${descreverErro(e)}`)
      throw new ErroHttp(500, 'interno', 'Algo deu errado. Tente de novo.')
    }
  }
}

/** O cliente da rota (404 se não existir). */
function clienteDaRota(c: Context<Ambiente>) {
  return carregarClienteResumo(c.get('db'), c.req.param('id')!)
}

export function registrar(app: App): void {
  app.get('/api/resultados/contas', exigirUsuario, exigirPapel('admin', 'atendimento'), protegido('contas', async (c) => {
    const recarregar = c.req.query('recarregar') === '1'
    if (recarregar && c.get('ator').papel !== 'admin') {
      throw new ErroHttp(403, 'sem_permissao', 'Só o admin recarrega a lista de contas da Windsor.')
    }
    return c.json(await listarContasWindsor(c.get('db'), recarregar))
  }))

  app.get('/api/resultados/panorama', exigirUsuario, protegido('carteira', (c) =>
    c.json(lerPanorama(c.get('db'), periodoDaConsulta(c), { buscar: true }))))

  app.get('/api/clientes/:id/resultados/contas', exigirUsuario, protegido('contas do cliente', (c) => {
    const cliente = clienteDaRota(c)
    return c.json(contasLigadas(c.get('db'), cliente.id))
  }))

  app.post('/api/clientes/:id/resultados/contas', exigirUsuario, protegido('ligar conta', async (c) => {
    const cliente = clienteDaRota(c)
    exigir(c.get('ator'), 'cliente.editar', { cliente })
    const e = validar(ligarEsquema, await corpoJson(c))
    const db = c.get('db')
    return c.json(tx(db, () => ligarConta(db, cliente.id, e, c.get('ator'))), 201)
  }))

  app.delete('/api/clientes/:id/resultados/contas/:ligacaoId', exigirUsuario, protegido('desligar conta', (c) => {
    const cliente = clienteDaRota(c)
    exigir(c.get('ator'), 'cliente.editar', { cliente })
    const db = c.get('db')
    tx(db, () => desligarConta(db, cliente.id, c.req.param('ligacaoId')!, c.get('ator')))
    return c.body(null, 204)
  }))

  app.get('/api/clientes/:id/resultados', exigirUsuario, protegido('resultados', (c) => {
    const cliente = clienteDaRota(c)
    return c.json(lerResultados(c.get('db'), cliente.id, periodoDaConsulta(c), { buscar: true }))
  }))

  app.post('/api/clientes/:id/resultados/atualizar', exigirUsuario, protegido('atualizar', async (c) => {
    const cliente = clienteDaRota(c)
    const e = validar(atualizarEsquema, await corpoJson(c))
    return c.json(atualizarAgora(c.get('db'), cliente.id, e.periodo, c.get('ator')), 202)
  }))
}
