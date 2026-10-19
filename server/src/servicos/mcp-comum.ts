/**
 * O formato das ferramentas do MCP (F7, API.md §F.5) e o que todas dividem. Cada ferramenta é nossa (nome, título,
 * descrição de uma frase, esquema zod estrito, anotações, `executar`); o adaptador servicos/mcp.ts as expõe pelo
 * JSON-RPC. Nenhuma ferramenta conhece o protocolo.
 */
import type { z } from 'zod'
import type { FerramentaMcp as NomeFerramenta, Usuario } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import type { Db } from '../db.ts'

/** Erro de regra que a própria ferramenta detecta: vira `isError` com a mensagem (o modelo lê e corrige). */
export class ErroMcp extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroMcp'
  }
}

/** Quem chama e com que conexão (a pessoa ativa da concessão; o ator já leva o trace 'mcp-' + uuid v4). */
export interface ContextoFerramenta {
  db: Db
  ator: Ator
  usuario: Usuario
  concessaoId: string
}

export interface AnotacoesMcp {
  readOnlyHint: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint: false
}

export interface Ferramenta<E extends z.ZodType = z.ZodType> {
  nome: NomeFerramenta
  titulo: string
  /** Uma frase. */
  descricao: string
  /** z.object(...).strict(): campo desconhecido é recusado. */
  esquema: E
  anotacoes: AnotacoesMcp
  /** As de escrita rodam síncronas numa tx() que grava o mcp_traco antes (via Claude); as de leitura podem esperar. */
  escrita: boolean
  executar(ctx: ContextoFerramenta, args: z.infer<E>): string | Promise<string>
}

/** Ajuda a tipar cada ferramenta com o próprio esquema. */
export function ferramenta<E extends z.ZodType>(f: Ferramenta<E>): Ferramenta<E> {
  return f
}

/** Leitura: readOnlyHint true, openWorldHint false. */
export const LEITURA: AnotacoesMcp = { readOnlyHint: true, openWorldHint: false }

/** Escrita: destructiveHint só nas FERRAMENTAS_MCP_DESTRUTIVAS; idempotentHint como na tabela da API §F.5. */
export function escrita(idempotente: boolean, destrutiva = false): AnotacoesMcp {
  return { readOnlyHint: false, destructiveHint: destrutiva, idempotentHint: idempotente, openWorldHint: false }
}
