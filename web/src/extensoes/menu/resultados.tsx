/** Menu lateral, grupo `agencia` (F8): "Resultados" → /resultados, ordem 150 (entre Clientes 100 e Arquivo 200). */
import { BarChart3 } from 'lucide-react'
import type { ExtensaoMenu, ItemMenu } from '../tipos.ts'

const ITENS: ItemMenu[] = [{ id: 'resultados', rotulo: 'Resultados', icone: BarChart3, caminho: '/resultados', ordem: 150 }]

export const menu: ExtensaoMenu = { id: 'resultados', grupo: 'agencia', ordem: 150, useItens: () => ITENS }
