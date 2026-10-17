/**
 * Esquemas zod das entradas do ciclo da peça (F2, API.md §4.8, §4.16 e §4.17), um por DTO de shared/tipos. Campos
 * desconhecidos são descartados; textos com os limites do banco (001_base.sql).
 */
import { z } from 'zod'
import {
  CANAIS, MEMBROS_AO_MOVER, MODELOS_WHATSAPP, MOTIVOS_RODADA,
  type AdicionarItensEntrada, type AjusteInternoEntrada, type AprovadoWhatsappEntrada, type DecisaoPublicaEntrada,
  type DefinirAutomacaoEntrada, type EditarVersaoEntrada, type EntregarVersaoEntrada, type EnviarAoClienteEntrada,
  type MarcarExtraEntrada, type ModeloWhatsapp, type RegistrarRetornoEntrada, type TestarDriveEntrada,
} from '../../../shared/tipos/index.ts'
import { ehDataLocal, ehHoraLocal } from '../../../shared/logica/datas.ts'
import { novoItem } from '../esquemas.ts'

z.config(z.locales.ptBR())

const id = z.string().trim().min(1).max(64)
const dataLocal = z.string().refine(ehDataLocal, 'data inválida (use AAAA-MM-DD)')
const horaLocal = z.string().refine(ehHoraLocal, 'hora inválida (use HH:MM)')
/** Linhas do ajuste (cada uma vira um item de "Ajustes R{N}"); o serviço limpa vazias e marcadores. */
const linhas = z.array(z.string().max(2000)).max(100)
const nota = z.string().trim().max(4000).nullable().optional()

export const entregarVersao: z.ZodType<EntregarVersaoEntrada> = z.object({
  nota,
  itens: z.array(novoItem).min(1, 'entregue pelo menos um link, caminho ou arquivo').max(30),
})

export const editarVersao: z.ZodType<EditarVersaoEntrada> = z.object({ nota })

export const adicionarItens: z.ZodType<AdicionarItensEntrada> = z.object({
  itens: z.array(novoItem).min(1, 'acrescente pelo menos um item').max(30),
})

export const testarDrive: z.ZodType<TestarDriveEntrada> = z.object({ url: z.string().trim().min(1).max(2000) })

export const enviar: z.ZodType<EnviarAoClienteEntrada> = z.object({
  versaoId: id.optional(),
  via: z.enum(['link', 'fora']),
  canal: z.enum(CANAIS).optional(),
  contatoId: id.nullable().optional(),
  prazoRetorno: dataLocal.nullable().optional(),
  prazoRetornoHora: horaLocal.nullable().optional(),
}).refine((e) => e.via === 'link' || !!e.canal, { message: 'diga por onde enviou (WhatsApp, e-mail, reunião ou outro)', path: ['canal'] })

export const registrarRetorno: z.ZodType<RegistrarRetornoEntrada> = z.object({
  versaoId: id.optional(),
  decisao: z.enum(['aprovado', 'ajuste']),
  linhas: linhas.optional(),
  motivo: z.enum(MOTIVOS_RODADA).optional(),
  motivoTexto: z.string().trim().max(1000).nullable().optional(),
  prazo: dataLocal.optional(),
  prazoHora: horaLocal.nullable().optional(),
  contatoId: id.nullable().optional(),
  nomeInformado: z.string().trim().max(120).nullable().optional(),
  canal: z.enum(CANAIS).optional(),
  evidenciaArquivoId: id.nullable().optional(),
})

export const aprovadoWhatsapp: z.ZodType<AprovadoWhatsappEntrada> = z.object({
  versaoId: id.optional(),
  contatoId: id.nullable().optional(),
})

export const ajusteInterno: z.ZodType<AjusteInternoEntrada> = z.object({
  linhas: linhas.min(1, 'escreva pelo menos um ajuste'),
  motivo: z.enum(MOTIVOS_RODADA),
  motivoTexto: z.string().trim().max(1000).nullable().optional(),
  prazo: dataLocal.optional(),
  prazoHora: horaLocal.nullable().optional(),
})

export const marcarExtra: z.ZodType<MarcarExtraEntrada> = z.object({ extra: z.boolean() })

export const modeloWhatsapp: z.ZodType<{ modelo: ModeloWhatsapp }> = z.object({ modelo: z.enum(MODELOS_WHATSAPP) })

export const definirAutomacao: z.ZodType<DefinirAutomacaoEntrada> = z.object({
  destinoColunaId: id,
  membros: z.enum(MEMBROS_AO_MOVER).optional(),
  ativa: z.boolean().optional(),
})

/** Corpo da decisão pública: o nome é texto puro de 1 a 120 caracteres (conferido no serviço). */
export const decisaoPublica: z.ZodType<DecisaoPublicaEntrada> = z.object({
  demandaId: id,
  versaoId: id,
  decisao: z.enum(['aprovado', 'ajuste']),
  linhas: linhas.optional(),
  contatoId: id.nullable().optional(),
  nomeInformado: z.string().max(200).nullable().optional(),
})

/** Idempotency-Key: uuid (qualquer versão). */
export const chaveIdempotencia = z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'use um uuid')
