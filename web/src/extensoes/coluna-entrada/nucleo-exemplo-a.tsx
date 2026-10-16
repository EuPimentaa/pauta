/** Só DEV (/dev/extensoes): entrada da coluna de ordem 100 (com duas registradas, N abre esta). */
import { lazy } from 'react'
import type { ExtensaoEntradaColuna } from '../tipos.ts'
import { exemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

// o lazy() fica dentro do ramo de DEV: no build de produção nada disto sobra
export const entrada: ExtensaoEntradaColuna | undefined = import.meta.env.DEV ? {
  id: 'nucleo-exemplo-a', ordem: 100, visivel: exemplosAtivos,
  Componente: lazy(() => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.EntradaA }))),
} : undefined
