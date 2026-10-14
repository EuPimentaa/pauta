/**
 * Erros da API (`ErroApi`, API.md §1) e o tradutor dos erros do SQLite (gatilhos, UNIQUE, CHECK, FK) para o código
 * da API: nunca 500 por regra de integridade (PLANO §0, regra 12).
 */
import type { CodigoErro } from '../../shared/tipos/index.ts'

export class ErroHttp extends Error {
  readonly status: number
  readonly codigo: CodigoErro
  readonly detalhes?: Record<string, unknown>

  constructor(status: number, codigo: CodigoErro, mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem)
    this.name = 'ErroHttp'
    this.status = status
    this.codigo = codigo
    this.detalhes = detalhes
  }

  corpo(): { erro: { codigo: CodigoErro; mensagem: string; detalhes?: Record<string, unknown> } } {
    return { erro: { codigo: this.codigo, mensagem: this.message, ...(this.detalhes ? { detalhes: this.detalhes } : {}) } }
  }
}

export const naoEncontrado = (mensagem = 'Não encontrado.') => new ErroHttp(404, 'nao_encontrado', mensagem)
export const validacao = (mensagem: string, campos?: Record<string, string>) =>
  new ErroHttp(400, 'validacao', mensagem, campos ? { campos } : undefined)
export const conflito = (mensagem: string, detalhes?: Record<string, unknown>) => new ErroHttp(409, 'conflito', mensagem, detalhes)
export const estadoInvalido = (mensagem: string, detalhes?: Record<string, unknown>) =>
  new ErroHttp(422, 'estado_invalido', mensagem, detalhes)

/** Mensagem do RAISE (o texto antes dos dois-pontos é o código) → status, código e texto para a pessoa. */
const GATILHOS: Record<string, [number, CodigoErro, string]> = {
  coluna_com_demandas: [409, 'conflito', 'Mova ou arquive os cards antes.'],
  quadro_com_historico: [409, 'conflito', 'Este quadro já teve demandas. Arquive em vez de excluir.'],
  cliente_fixo_apos_envio: [409, 'conflito', 'Esta demanda já foi enviada ao cliente. Para outro cliente, copie a demanda.'],
  anexo_e_evidencia: [409, 'conflito', 'Este print é a prova de uma aprovação.'],
  anexo_e_capa: [409, 'conflito', 'Este anexo é a capa da demanda. Tire a capa antes.'],
  destino_arquivado: [422, 'estado_invalido', 'A coluna ou o quadro de destino está arquivado.'],
  concluida_sem_data: [422, 'estado_invalido', 'Uma demanda numa coluna de concluídas precisa estar concluída.'],
  arquivo_no_lixo: [400, 'validacao', 'Este arquivo foi removido. Envie de novo.'],
  demanda_de_outro_cliente: [400, 'validacao', 'A demanda é de outro cliente.'],
  contato_de_outro_cliente: [400, 'validacao', 'O contato é de outro cliente.'],
  capa_nao_e_imagem: [400, 'validacao', 'A capa precisa ser uma imagem anexada a esta demanda.'],
  arquivo_em_uso: [409, 'conflito', 'Este arquivo ainda está em uso.'],
  demanda_status_desde: [500, 'interno', 'Erro interno ao mover a demanda.'],
}

/**
 * Erro do banco → ErroHttp (gatilhos da regra 12, UNIQUE → 409, CHECK e FK → 400). Outros erros: null (o chamador
 * devolve 500). Erros de imutabilidade (`*_imutavel`, `*_nao_se_apaga`) são defeito do código: 500.
 */
export function traduzirErroBanco(e: unknown): ErroHttp | null {
  if (e instanceof ErroHttp) return e
  if (!(e instanceof Error) || (e as { code?: string }).code !== 'ERR_SQLITE_ERROR') return null
  const msg = e.message
  const codigo = /^([a-z_]+)/.exec(msg)?.[1]
  if (codigo && codigo in GATILHOS) {
    const [status, cod, texto] = GATILHOS[codigo]!
    if (status === 500) return null
    return new ErroHttp(status, cod, texto)
  }
  if (msg.startsWith('UNIQUE constraint failed')) return conflito('Já existe um registro com esses dados.')
  if (msg.startsWith('CHECK constraint failed')) return validacao('Algum valor está fora do permitido.')
  if (msg.startsWith('FOREIGN KEY constraint failed')) return validacao('Algum item referenciado não existe.')
  return null
}
