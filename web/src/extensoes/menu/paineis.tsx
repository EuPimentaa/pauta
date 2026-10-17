/**
 * Menu lateral, grupo `trabalho` (F3; PLANO §4): Início 100 (com o número das minhas atrasadas), Agenda 200, Horas 300.
 */
import { useCallback } from 'react'
import { CalendarDays, Clock3, House } from 'lucide-react'
import type { Bootstrap } from '@shared/tipos/index.ts'
import { minhasPorPrazo } from '@shared/logica/paineis.ts'
import type { ExtensaoMenu, ItemMenu } from '../tipos.ts'
import { useDoBootstrap } from '../../api/seletores.ts'
import { useAgora } from '../../quadro/estado.ts'

function useItens(): ItemMenu[] {
  const agora = useAgora()
  const contar = useCallback((b: Bootstrap) => {
    const papel = new Map(b.colunas.map((c) => [c.id, c.papel]))
    return minhasPorPrazo(b.demandas, (id) => papel.get(id) ?? 'normal', b.eu.usuario.id, agora).atrasadas.length
  }, [agora])
  const atrasadas = useDoBootstrap(contar) ?? 0
  return [
    { id: 'paineis-inicio', rotulo: 'Início', icone: House, caminho: '/inicio', contador: atrasadas, ordem: 100 },
    { id: 'paineis-agenda', rotulo: 'Agenda', icone: CalendarDays, caminho: '/agenda', ordem: 200 },
    { id: 'paineis-horas', rotulo: 'Horas', icone: Clock3, caminho: '/horas', ordem: 300 },
  ]
}

export const menu: ExtensaoMenu = { id: 'paineis', grupo: 'trabalho', ordem: 100, useItens }
