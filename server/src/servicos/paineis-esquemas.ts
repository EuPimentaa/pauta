/**
 * Esquemas zod das rotas do F3 (API.md §4.18). Consultas chegam como texto: listas repetem a chave
 * (`quadroIds=a&quadroIds=b`, como o comConsulta do front) e booleanos são '1'/'0' ou 'true'/'false'.
 */
import { z } from 'zod'
import {
  CAMPOS_AGENDA, type AgendaConsulta, type ListarNotificacoesConsulta, type MarcarLidasEntrada,
} from '../../../shared/tipos/index.ts'
import { ehDataLocal } from '../../../shared/logica/datas.ts'
import { LIMITE_MAX_NOTIFICACOES } from './paineis-notificacoes.ts'

z.config(z.locales.ptBR())

const dataLocal = z.string().refine(ehDataLocal, 'data inválida (use AAAA-MM-DD)')
const id = z.string().trim().min(1).max(64)
const booleano = z.enum(['1', '0', 'true', 'false']).transform((v) => v === '1' || v === 'true')
const inteiro = (min: number, max: number) => z.string().regex(/^\d{1,12}$/, 'número inteiro').transform(Number).pipe(z.number().int().min(min).max(max))

/** De `c.req.query()` + as listas de `c.req.queries()`. */
export const consultaAgenda: z.ZodType<AgendaConsulta> = z.object({
  de: dataLocal,
  ate: dataLocal,
  soMinhas: booleano.optional(),
  quadroIds: z.array(id).max(200).optional(),
  campos: z.array(z.enum(CAMPOS_AGENDA)).max(3).optional(),
  incluirConcluidas: booleano.optional(),
})

export const consultaNotificacoes: z.ZodType<ListarNotificacoesConsulta> = z.object({
  antesDe: inteiro(1, Number.MAX_SAFE_INTEGER).optional(),
  limite: inteiro(1, LIMITE_MAX_NOTIFICACOES).optional(),
  soNaoLidas: booleano.optional(),
})

export const marcarLidas: z.ZodType<MarcarLidasEntrada> = z.object({
  ids: z.array(z.number().int().positive()).max(500).optional(),
  ate: z.number().int().positive().optional(),
})
