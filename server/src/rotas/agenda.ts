/**
 * Agendas externas (API.md §F.9, 6 rotas): a lista e os eventos para todos; criar, editar, excluir e "Atualizar agora"
 * só para o admin (`config`, por servicos/permissoes.ts). A busca do iCal roda em segundo plano depois do commit, com
 * `.catch(registrarFalhaMascarada(…))`. Todo erro que não é ErroHttp vira `500 interno` com o log mascarado aqui mesmo
 * (nunca chega ao onError do app.ts, que imprime o objeto inteiro): o endereço iCal não pode escapar num "Failed to
 * parse URL from …" nem num RAISE do banco.
 */
import type { Context } from 'hono'
import { z } from 'zod'
import { CORES, type EventosAgendaConsulta, type Id } from '../../../shared/tipos/index.ts'
import { ehDataLocal } from '../../../shared/logica/datas.ts'
import { corpoJson, exigirUsuario, validar, type Ambiente, type App } from '../auth.ts'
import { tx, type Db } from '../db.ts'
import { ErroHttp, traduzirErroBanco } from '../erros.ts'
import { exigir } from '../servicos/permissoes.ts'
import { descreverErro, registrarFalhaMascarada } from '../servicos/segredos.ts'
import {
  carregarAgenda, criarAgenda, editarAgenda, eventosAgenda, excluirAgenda, listarAgendas, pedirAtualizacao,
} from '../servicos/agenda.ts'
import { buscarAgenda } from '../servicos/agenda-busca.ts'

z.config(z.locales.ptBR())

const cor = z.enum(CORES)
const id = z.string().trim().min(1).max(64)
const endereco = z.string().max(2000)

const criar = z.strictObject({
  nome: z.string().trim().min(1).max(60),
  cor: cor.optional(),
  url: endereco,
})

const editar = z.strictObject({
  nome: z.string().trim().min(1).max(60).optional(),
  cor: cor.optional(),
  ativa: z.boolean().optional(),
  url: endereco.optional(),
  posicao: z.strictObject({ depoisDeId: id.nullable().optional(), antesDeId: id.nullable().optional() }).optional(),
})

const consultaEventos: z.ZodType<EventosAgendaConsulta> = z.object({
  de: z.string().refine(ehDataLocal, 'data inválida (use AAAA-MM-DD)'),
  ate: z.string().refine(ehDataLocal, 'data inválida (use AAAA-MM-DD)'),
  agendaIds: z.array(id).max(50).optional(),
})

/** `agendaIds=a&agendaIds=b` ou `agendaIds=a,b`. */
function lista(valores: string[] | undefined): string[] | undefined {
  const itens = (valores ?? []).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
  return itens.length > 0 ? itens : undefined
}

type Manipulador = (c: Context<Ambiente>) => Response | Promise<Response>

const idDa = (c: Context<Ambiente>): Id => c.req.param('id') ?? ''

/** ErroHttp (e o erro do banco traduzido) seguem o caminho de sempre; o resto vira 500 com o log mascarado. */
function protegido(fn: Manipulador): Manipulador {
  return async (c) => {
    try {
      return await fn(c)
    } catch (e) {
      const traduzido = traduzirErroBanco(e)
      if (traduzido) throw traduzido
      if (e instanceof ErroHttp) throw e
      console.error(`agenda: erro interno em ${c.req.method} ${c.req.path}: ${descreverErro(e)}`)
      throw new ErroHttp(500, 'interno', 'Algo deu errado. Tente de novo.')
    }
  }
}

/** A busca em segundo plano, depois do commit. */
function buscarDepois(db: Db, agendaId: Id): void {
  void buscarAgenda(db, agendaId).catch(registrarFalhaMascarada('agenda busca'))
}

export function registrar(app: App): void {
  app.get('/api/agendas-externas', exigirUsuario, protegido((c) => c.json(listarAgendas(c.get('db')))))

  app.get('/api/agendas-externas/eventos', exigirUsuario, protegido((c) => {
    const consulta = validar(consultaEventos, { ...c.req.query(), agendaIds: lista(c.req.queries('agendaIds')) })
    return c.json(eventosAgenda(c.get('db'), consulta))
  }))

  app.post('/api/agendas-externas', exigirUsuario, protegido(async (c) => {
    exigir(c.get('ator'), 'config')
    const e = validar(criar, await corpoJson(c))
    const db = c.get('db')
    const agenda = tx(db, () => criarAgenda(db, e, c.get('ator')))
    buscarDepois(db, agenda.id)
    return c.json(agenda, 201)
  }))

  app.patch('/api/agendas-externas/:id', exigirUsuario, protegido(async (c) => {
    exigir(c.get('ator'), 'config')
    const e = validar(editar, await corpoJson(c))
    const db = c.get('db')
    const r = tx(db, () => editarAgenda(db, idDa(c), e, c.get('ator')))
    if (r.buscar) buscarDepois(db, r.agenda.id)
    return c.json(r.agenda)
  }))

  app.delete('/api/agendas-externas/:id', exigirUsuario, protegido((c) => {
    exigir(c.get('ator'), 'config')
    const db = c.get('db')
    tx(db, () => excluirAgenda(db, idDa(c), c.get('ator')))
    return c.body(null, 204)
  }))

  app.post('/api/agendas-externas/:id/atualizar', exigirUsuario, protegido((c) => {
    exigir(c.get('ator'), 'config')
    const db = c.get('db')
    const agenda = pedirAtualizacao(db, idDa(c))
    buscarDepois(db, agenda.id)
    return c.json(carregarAgenda(db, agenda.id), 202)
  }))
}
