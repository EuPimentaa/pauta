/**
 * Fonte "agenda" da Agenda (F9; FASE2-PLANO §3 e §4): `usarItensAgenda` lê os eventos do período visível (TanStack
 * Query, ['agenda-externa', 'eventos', de, ate]), esconde as agendas desligadas no filtro e devolve um item por dia de
 * cada evento; clicar abre o diálogo `agenda-evento` (popover no desktop, folha no celular). `FiltroAgendas`: um chip
 * por agenda ativa, na cor dela; ligado e desligado ficam neste aparelho (localStorage, a mesma chave do Início).
 */
import { useMemo } from 'react'
import { CalendarDays, EyeOff } from 'lucide-react'
import type { DataLocal } from '@shared/tipos/index.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import type { ItemAgendaExterno } from '../../extensoes/tipos.ts'
import { useAgendasExternas, useDesligadas, useEventosAgenda } from './api.ts'
import { itensDoPeriodo } from './logica.ts'
import './agenda.css'

export function usarItensAgenda({ de, ate }: { de: DataLocal; ate: DataLocal }): { itens: ItemAgendaExterno[]; carregando: boolean } {
  const { desligadas } = useDesligadas()
  const { data, isPending } = useEventosAgenda(de, ate)
  const abrir = useAbrirDialogo()
  const itens = useMemo(() => itensDoPeriodo(data, desligadas, de, ate).map(({ evento, ...i }): ItemAgendaExterno => ({
    ...i,
    abrir: (ancora) => { void abrir('agenda-evento', { evento, agenda: { nome: i.origem, cor: i.cor } }, { ancora }) },
  })), [data, desligadas, de, ate, abrir])
  return { itens, carregando: isPending }
}

export function FiltroAgendas() {
  const { data } = useAgendasExternas()
  const { desligadas, alternar } = useDesligadas()
  const ativas = (data ?? []).filter((a) => a.ativa)
  if (ativas.length === 0) return null
  return (
    <div className="agd-filtro" role="group" aria-label="Agendas externas: clique para mostrar ou esconder">
      <span className="agd-filtro-rotulo" aria-hidden="true"><CalendarDays />Agendas</span>
      {ativas.map((a) => {
        const ligada = !desligadas.has(a.id)
        return (
          <button key={a.id} type="button" className="agd-chip" data-cor={a.cor} aria-pressed={ligada}
            title={ligada ? `Esconder os eventos de ${a.nome}` : `Mostrar os eventos de ${a.nome}`} onClick={() => alternar(a.id)}>
            {ligada ? <span className="agd-chip-ponto" aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            <span className="agd-chip-nome">{a.nome}</span>
          </button>
        )
      })}
    </div>
  )
}
