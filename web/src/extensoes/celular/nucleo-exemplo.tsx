/** Só DEV (/dev/extensoes): aba do celular com useContador (o número no canto) e `executar` (sem caminho). */
import { FlaskConical } from 'lucide-react'
import type { ExtensaoAbaCelular } from '../tipos.ts'
import { anotar, useContadorExemplo } from '../../telas/dev-extensoes/exemplos.ts'

export const aba: ExtensaoAbaCelular = {
  id: 'nucleo-exemplo', ordem: 450, rotulo: 'Exemplo', icone: FlaskConical,
  useContador: useContadorExemplo,
  executar: (ctx) => anotar(`aba do celular: ${ctx.eu.usuario.nome}`),
}
