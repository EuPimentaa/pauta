/**
 * Esquemas zod das rotas do F5 (cadastros): feriados, configuração da aplicação e Arquivo. Como os do núcleo
 * (src/esquemas.ts): um por DTO de shared/tipos, campos desconhecidos descartados, mensagens em português.
 */
import { z } from 'zod'
import {
  FAIXAS_CONFIG, TIPOS_FERIADO,
  type CriarFeriadoEntrada, type EditarConfigAppEntrada, type ListarArquivoConsulta, type ParametroNumerico,
} from '../../../shared/tipos/index.ts'
import { ehDataLocal, ehHoraLocal } from '../../../shared/logica/datas.ts'

const dataLocal = z.string().refine(ehDataLocal, 'data inválida (use AAAA-MM-DD)')
const horaLocal = z.string().refine(ehHoraLocal, 'hora inválida (use HH:MM)')
const id = z.string().trim().min(1).max(64)

export const criarFeriado: z.ZodType<CriarFeriadoEntrada> = z.object({
  data: dataLocal,
  nome: z.string().trim().min(1, 'escreva o nome do feriado').max(80, 'até 80 caracteres'),
  tipo: z.enum(TIPOS_FERIADO).optional(),
})

/** ?ano=2027 (padrão: o ano corrente de São Paulo). */
export const consultaFeriados = z.object({
  ano: z.coerce.number().int('ano inválido').min(2000, 'ano inválido').max(2100, 'ano inválido').optional(),
})

const numerico = (campo: ParametroNumerico) => {
  const [min, max] = FAIXAS_CONFIG[campo]
  return z.number({ error: 'precisa ser um número' }).int('precisa ser um número inteiro')
    .min(min, `o mínimo é ${min.toLocaleString('pt-BR')}`).max(max, `o máximo é ${max.toLocaleString('pt-BR')}`).optional()
}

const camposNumericos = Object.fromEntries(
  (Object.keys(FAIXAS_CONFIG) as ParametroNumerico[]).map((k) => [k, numerico(k)]),
) as Record<ParametroNumerico, ReturnType<typeof numerico>>

/** PATCH /api/config/app: cada número dentro de FAIXAS_CONFIG; prazoHoraPadrao em HH:MM (API.md §4.11). */
export const editarConfigApp = z.object({ ...camposNumericos, prazoHoraPadrao: horaLocal.optional() }) as unknown as z.ZodType<EditarConfigAppEntrada>

/** GET /api/arquivo (consulta em texto; `limite` padrão 50, máximo 200). */
export const listarArquivo: z.ZodType<ListarArquivoConsulta> = z.object({
  clienteId: id.optional(),
  quadroId: id.optional(),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'mês inválido (use AAAA-MM)').optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
})
