/** Só DEV (/dev/extensoes): entrada da coluna de ordem 200 (perde para a de 100). */
import { lazy } from 'react'
import type { ExtensaoEntradaColuna } from '../tipos.ts'

const EntradaB = lazy(() => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.EntradaB })))

export const entrada: ExtensaoEntradaColuna = { id: 'nucleo-exemplo-b', ordem: 200, Componente: EntradaB }
