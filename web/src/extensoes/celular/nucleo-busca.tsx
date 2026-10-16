/** Aba Busca do celular (NÚCLEO-WEB; ordem 400): abre a paleta em tela cheia. */
import { Search } from 'lucide-react'
import type { ExtensaoAbaCelular } from '../tipos.ts'
import { abrirPaleta } from '../../paleta/estado.ts'

export const aba: ExtensaoAbaCelular = { id: 'nucleo-busca', ordem: 400, rotulo: 'Busca', icone: Search, executar: () => abrirPaleta() }
