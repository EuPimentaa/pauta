/**
 * Esquemas zod das entradas do modal (F1, API.md §4.15), um por DTO de shared/tipos. Campos desconhecidos são
 * descartados; textos com os limites do banco (001_base.sql).
 */
import { z } from 'zod'
import type {
  CopiarDemandaEntrada, CriarAnexoEntrada, CriarApontamentoEntrada, CriarChecklistEntrada, CriarComentarioEntrada,
  CriarItensEntrada, EditarAnexoEntrada, EditarChecklistEntrada, EditarComentarioEntrada, EditarItemEntrada,
  ListarHistoricoConsulta,
} from '../../../shared/tipos/index.ts'
import { FINALIDADES_ANEXO } from '../../../shared/tipos/index.ts'
import { ehDataLocal } from '../../../shared/logica/datas.ts'

z.config(z.locales.ptBR())

const id = z.string().trim().min(1).max(64)
const posicao = z.object({ depoisDeId: id.nullable().optional(), antesDeId: id.nullable().optional() })
const dataLocal = z.string().refine(ehDataLocal, 'data inválida (use AAAA-MM-DD)')

// ─────────────────────────────── comentários e histórico ───────────────────────────────

export const criarComentario: z.ZodType<CriarComentarioEntrada> = z.object({
  corpoMd: z.string().max(20000),
  visivelCliente: z.boolean().optional(),
  versaoId: id.nullable().optional(),
  anexoIds: z.array(id).max(20).optional(),
})

export const editarComentario: z.ZodType<EditarComentarioEntrada> = z.object({
  corpoMd: z.string().max(20000).optional(),
  visivelCliente: z.boolean().optional(),
})

export const listarHistorico: z.ZodType<ListarHistoricoConsulta> = z.object({
  cursor: z.string().max(40).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
})

// ─────────────────────────────── checklists ───────────────────────────────

const textoItem = z.string().max(2000)

export const criarChecklist: z.ZodType<CriarChecklistEntrada> = z.object({
  titulo: z.string().max(200),
  itens: z.array(textoItem).max(200).optional(),
})

export const editarChecklist: z.ZodType<EditarChecklistEntrada> = z.object({
  titulo: z.string().max(200).optional(),
  posicao: posicao.optional(),
})

export const criarItens: z.ZodType<CriarItensEntrada> = z.object({
  textos: z.array(textoItem).min(1).max(200),
  posicao: posicao.optional(),
})

export const editarItem: z.ZodType<EditarItemEntrada> = z.object({
  texto: textoItem.optional(),
  feito: z.boolean().optional(),
  posicao: posicao.optional(),
})

// ─────────────────────────────── anexos ───────────────────────────────

const nomeItem = z.string().max(200).optional()
const finalidade = z.enum(FINALIDADES_ANEXO).optional()

export const criarAnexo: z.ZodType<CriarAnexoEntrada> = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('link'), url: z.string().trim().max(2000), nome: nomeItem, finalidade }),
  z.object({ tipo: z.literal('caminho'), caminho: z.string().trim().min(1).max(1000), nome: nomeItem, finalidade }),
  z.object({ tipo: z.literal('arquivo'), arquivoId: id, nome: nomeItem, finalidade }),
])

export const editarAnexo: z.ZodType<EditarAnexoEntrada> = z.object({
  nome: z.string().max(200).optional(),
  posicao: posicao.optional(),
})

// ─────────────────────────────── copiar e horas ───────────────────────────────

export const copiarDemanda: z.ZodType<CopiarDemandaEntrada> = z.object({
  colunaId: id,
  posicao: posicao.optional(),
  titulo: z.string().max(500).optional(),
  manter: z.object({
    checklists: z.boolean().optional(), etiquetas: z.boolean().optional(), membros: z.boolean().optional(),
    anexos: z.boolean().optional(), datas: z.boolean().optional(),
  }).optional(),
})

export const criarApontamento: z.ZodType<CriarApontamentoEntrada> = z.object({
  data: dataLocal.optional(),
  minutos: z.number().int().min(1).max(1440),
  nota: z.string().max(500).nullable().optional(),
})
