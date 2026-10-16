/** Modal (F1): selo do meu cronômetro ligado neste card (rodapé, ordem 200). */
import type { ExtensaoSeloCard } from '../tipos.ts'
import { SeloCronometro } from '../../funcionalidades/modal/cronometro.tsx'

export const selo: ExtensaoSeloCard = { id: 'modal-cronometro', ordem: 200, lugar: 'rodape', Componente: SeloCronometro }
