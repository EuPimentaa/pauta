/** Esquemas zod das rotas da Entrada (F4), um por DTO de shared/tipos (o tipo de cada um confere com o contrato). */
import { z } from 'zod'
import {
  CORES, PRIORIDADES,
  type AnalisarTextoEntrada, type BuscaConsulta, type CriarModeloDemandaEntrada, type CriarRapidaEntrada,
  type EditarModeloDemandaEntrada,
} from '../../../shared/tipos/index.ts'

z.config(z.locales.ptBR())

const id = z.string().trim().min(1).max(64)
const posicao = z.object({ depoisDeId: id.nullable().optional(), antesDeId: id.nullable().optional() })

export const criarRapida: z.ZodType<CriarRapidaEntrada> = z.object({
  texto: z.string().max(1000), colunaId: id, clienteId: id.nullable().optional(), posicao: posicao.optional(),
})

export const analisarTexto: z.ZodType<AnalisarTextoEntrada> = z.object({ texto: z.string().max(50_000) })

const booleanoDaUrl = z.enum(['1', '0', 'true', 'false']).transform((v) => v === '1' || v === 'true')
export const busca: z.ZodType<BuscaConsulta> = z.object({
  q: z.string().max(200).default(''),
  limite: z.coerce.number().int().min(1).max(20).optional(),
  incluirArquivadas: booleanoDaUrl.optional(),
  quadroId: id.optional(),
})

const item = z.object({ checklist: z.string().trim().max(200).optional(), texto: z.string().trim().min(1).max(2000) })
const etiqueta = z.object({ nome: z.string().trim().min(1).max(40), cor: z.enum(CORES) })
const camposModelo = {
  descricao: z.string().trim().max(200).optional(),
  icone: z.string().regex(/^[a-z0-9-]{1,40}$/, 'nome de ícone (minúsculas, números e hífens)').nullable().optional(),
  briefingMd: z.string().max(20_000).optional(),
  prazoDiasUteis: z.number().int().min(0).max(120).nullable().optional(),
  prioridade: z.enum(PRIORIDADES).nullable().optional(),
  estimativaMin: z.number().int().min(1).max(100_000).nullable().optional(),
  rodadasInclusas: z.number().int().min(0).max(20).nullable().optional(),
  itens: z.array(item).max(100).optional(),
  etiquetas: z.array(etiqueta).max(20).optional(),
}

export const criarModelo: z.ZodType<CriarModeloDemandaEntrada> = z.object({
  quadroId: id.nullable().optional(), nome: z.string().trim().min(1).max(60), ...camposModelo,
})

export const editarModelo: z.ZodType<EditarModeloDemandaEntrada> = z.object({
  nome: z.string().trim().min(1).max(60).optional(), ...camposModelo, ativo: z.boolean().optional(), posicao: posicao.optional(),
})
