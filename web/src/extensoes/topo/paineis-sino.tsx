/** Sino de notificações da barra superior (F3; direita, ordem 200, depois do "+ Nova demanda"). */
import type { ExtensaoTopo } from '../tipos.ts'
import { SinoTopo } from '../../funcionalidades/paineis/Sino.tsx'

export const topo: ExtensaoTopo = { id: 'paineis-sino', ordem: 200, lado: 'direita', Componente: SinoTopo }
