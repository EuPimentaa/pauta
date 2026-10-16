/**
 * Só DEV (/dev/extensoes): aba do celular com useContador (o número no canto) e `executar` (sem caminho). A barra de
 * abas é da casca e não tem `visivel`: até o pedido 1 (docs/pedidos/nucleo-web.md) entrar, esta aba aparece em todas
 * as telas no desenvolvimento, sem número fora da tela de exemplos. No build de produção não entra.
 */
import { FlaskConical } from 'lucide-react'
import type { ExtensaoAbaCelular } from '../tipos.ts'
import { anotar, useContadorExemplo, useExemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

function useContador(): number {
  const ativos = useExemplosAtivos()
  const n = useContadorExemplo()
  return ativos ? n : 0
}

export const aba: ExtensaoAbaCelular | undefined = import.meta.env.DEV ? {
  id: 'nucleo-exemplo', ordem: 450, rotulo: 'Exemplo', icone: FlaskConical, useContador,
  executar: (ctx) => anotar(`aba do celular: ${ctx.eu.usuario.nome}`),
} : undefined
