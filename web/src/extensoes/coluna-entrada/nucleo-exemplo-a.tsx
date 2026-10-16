/** Só DEV (/dev/extensoes): entrada da coluna de ordem 100 (com duas registradas, N abre esta). */
import { lazy } from 'react'
import type { ExtensaoEntradaColuna } from '../tipos.ts'

const EntradaA = lazy(() => import('../../telas/dev-extensoes/componentes-exemplo.tsx').then((m) => ({ default: m.EntradaA })))

export const entrada: ExtensaoEntradaColuna = { id: 'nucleo-exemplo-a', ordem: 100, Componente: EntradaA }
