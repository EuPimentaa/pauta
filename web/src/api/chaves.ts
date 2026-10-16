/**
 * Chaves do TanStack Query (PLANO §2.1). Toda consulta do app usa uma destas; quem muda um dado atualiza a chave pelo
 * retorno da API e pelo tratador do tempo real (idempotente).
 */
import type { AgendaConsulta, Id, ListarApontamentosConsulta, ListarArquivoConsulta } from '../../../shared/tipos/index.ts'

export const chaves = {
  bootstrap: ['bootstrap'] as const,
  detalhe: (numero: number) => ['demanda', numero] as const,
  comentarios: (id: Id) => ['demanda', id, 'comentarios'] as const,
  historico: (id: Id) => ['demanda', id, 'historico'] as const,
  links: (id: Id) => ['demanda', id, 'links'] as const,
  quadrosArquivados: ['quadros', 'arquivados'] as const,
  quadro: (id: Id) => ['quadro', id] as const,
  modelosDemanda: ['modelos-demanda'] as const,
  clientes: ['clientes'] as const,
  cliente: (sigla: string) => ['cliente', sigla] as const,
  aprovacoesCliente: (id: Id) => ['cliente', id, 'aprovacoes'] as const,
  pessoas: ['pessoas'] as const,
  configApp: ['config', 'app'] as const,
  feriados: (ano: number) => ['feriados', ano] as const,
  arquivo: (c: ListarArquivoConsulta) => ['arquivo', c] as const,
  inicio: ['inicio'] as const,
  agenda: (c: AgendaConsulta) => ['agenda', c] as const,
  notificacoes: ['notificacoes'] as const,
  apontamentos: (c: ListarApontamentosConsulta) => ['apontamentos', c] as const,
  busca: (q: string) => ['busca', q] as const,
} satisfies Record<string, readonly unknown[] | ((...a: never[]) => readonly unknown[])>
