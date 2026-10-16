/** Só DEV (/dev/extensoes): entrada da coluna de ordem 200 (perde para a de 100). */
import { lazy } from 'react'
import type { ExtensaoEntradaColuna } from '../tipos.ts'
import { exemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

// o lazy() fica dentro do ramo de DEV: no build de produção nada disto sobra
export const entrada: ExtensaoEntradaColuna | undefined = import.meta.env.DEV ? {
  id: 'nucleo-exemplo-b', ordem: 200, visivel: exemplosAtivos,
  Componente: lazy(() => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.EntradaB }))),
} : undefined
