/**
 * Rascunho da Nova demanda (integração 3A): fechar sem criar (Esc, clique fora, X, Cancelar) guarda o formulário e a
 * próxima abertura o devolve, com "Rascunho de há 3 min · Descartar". Uma conversa colada do WhatsApp não se perde
 * por uma tecla errada. Fica no localStorage com o prefixo `rascunho-` e o id de quem escreve (o Sair e a troca de
 * pessoa no navegador apagam; lib/armazenamento.ts) e vale por 3 dias. Puro, menos lerRascunho/gravarRascunho.
 */
import { PREFIXO_RASCUNHO, gravarLocal, lerLocal } from '../../lib/armazenamento.ts'

export const VALIDADE_RASCUNHO_MS = 3 * 24 * 60 * 60 * 1000

/** O que basta para dizer se a pessoa mexeu no formulário. */
export interface CamposRascunho {
  titulo: string
  descricaoMd: string
  descricaoAuto: string
  colagem: unknown
  etiquetaIds: readonly string[] | null
  mexidos: ReadonlySet<string>
  quadroId: string
  colunaId: string
}

export interface RascunhoGuardado<E> {
  salvoEm: string
  /** O estado com `mexidos` em lista (Set não vira JSON). */
  estado: Omit<E, 'mexidos'> & { mexidos: string[] }
  textoColar: string
}

export const chaveRascunho = (usuarioId: string) => `${PREFIXO_RASCUNHO}nova-demanda:${usuarioId}`

/** A pessoa escreveu, colou ou escolheu alguma coisa (o que o modelo preencheu sozinho não conta). */
export function formularioSujo(e: CamposRascunho, textoColar: string): boolean {
  return !!textoColar.trim() || !!e.colagem || !!e.titulo.trim() || e.descricaoMd.trim() !== e.descricaoAuto.trim()
    || e.etiquetaIds !== null || e.mexidos.size > 0
}

export function paraGuardar<E extends CamposRascunho>(estado: E, textoColar: string, agora: Date): RascunhoGuardado<E> {
  return { salvoEm: agora.toISOString(), estado: { ...estado, mexidos: [...estado.mexidos] }, textoColar }
}

/**
 * O rascunho que ainda vale: dentro da validade e com o quadro ativo (a coluna arquivada volta para a de entrada, pelo
 * `colunaDeEntrada`); senão null.
 */
export function rascunhoValido<E extends CamposRascunho>(r: RascunhoGuardado<E> | null, agora: Date, ctx: {
  quadroAtivo(id: string): boolean
  colunaAtiva(id: string, quadroId: string): boolean
  colunaDeEntrada(quadroId: string): string | null
}): { estado: E; textoColar: string; salvoEm: string } | null {
  if (!r || typeof r !== 'object' || !r.estado || typeof r.salvoEm !== 'string') return null
  const salvo = Date.parse(r.salvoEm)
  if (!Number.isFinite(salvo) || agora.getTime() - salvo > VALIDADE_RASCUNHO_MS) return null
  const e = r.estado
  if (!ctx.quadroAtivo(e.quadroId)) return null
  const colunaId = ctx.colunaAtiva(e.colunaId, e.quadroId) ? e.colunaId : ctx.colunaDeEntrada(e.quadroId) ?? ''
  return { estado: { ...e, colunaId, mexidos: new Set(e.mexidos) } as unknown as E, textoColar: r.textoColar ?? '', salvoEm: r.salvoEm }
}

export function lerRascunho<E>(usuarioId: string): RascunhoGuardado<E> | null {
  return lerLocal<RascunhoGuardado<E> | null>(chaveRascunho(usuarioId), null)
}

export function gravarRascunho<E>(usuarioId: string, r: RascunhoGuardado<E> | null): void {
  gravarLocal(chaveRascunho(usuarioId), r ?? undefined)
}
