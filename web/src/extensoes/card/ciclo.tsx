/** Ciclo (F2): selo "V2" com o estado e "R3/2" quando passa das inclusas (rodapé do card, ordem 100). */
import type { ExtensaoSeloCard } from '../tipos.ts'
import { SeloCiclo } from '../../funcionalidades/ciclo/SeloCard.tsx'

export const selo: ExtensaoSeloCard = { id: 'ciclo', ordem: 100, lugar: 'rodape', Componente: SeloCiclo }
