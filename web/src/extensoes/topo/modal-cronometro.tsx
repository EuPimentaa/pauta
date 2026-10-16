/** Modal (F1): "0:42 · #123" com ■ na barra superior, só com o cronômetro ligado (direita, ordem 50). */
import type { ExtensaoTopo } from '../tipos.ts'
import { TopoCronometro } from '../../funcionalidades/modal/cronometro.tsx'

export const topo: ExtensaoTopo = { id: 'modal-cronometro', ordem: 50, lado: 'direita', Componente: TopoCronometro }
