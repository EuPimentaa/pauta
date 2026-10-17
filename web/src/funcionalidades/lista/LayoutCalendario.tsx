/**
 * Layout "Calendário" do quadro (extensoes/layouts/lista-calendario.tsx; PLANO §3, F6): o CalendarioDemandas do
 * núcleo (mês e semana, semana começando na segunda, feriados, concluídas riscadas) alimentado pelas demandas
 * filtradas do quadro, com a faixa "Sem prazo". Arrastar um prazo (ou um card da faixa) para um dia muda o prazo
 * mantendo a hora (useMudarPrazo: "Prazo: sex, 24/10 · Desfazer"). Início e publicação aparecem quando ligados.
 * No celular o núcleo mostra a lista por dia; as sem prazo vêm embaixo, como cards.
 */
import './lista.css'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Filter, Inbox } from 'lucide-react'
import type { CampoAgenda, DataLocal } from '@shared/tipos/index.ts'
import { temFiltros } from '@shared/logica/filtros.ts'
import { useListaFeriados } from '../../api/seletores.ts'
import { CalendarioDemandas } from '../../calendario/index.ts'
import type { PropsLayout } from '../../extensoes/tipos.ts'
import { hojeLocal } from '../../lib/datas.ts'
import { CardDemanda } from '../../quadro/index.ts'
import { Botao } from '../../ui/Botao.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { Contador, EstadoVazio } from '../../ui/Indicadores.tsx'
import { useDemandasNoQuadro } from './dados.ts'
import { useCamposCalendario, useModoCalendario } from './estado.ts'
import { itensDoCalendario, semPrazo } from './logica.ts'

const ROTULO_CAMPO: Record<CampoAgenda, string> = { prazo: 'Prazo', inicio: 'Início', publicacao: 'Publicação' }

function SemPrazoCelular({ demandas }: { demandas: PropsLayout['demandas'] }) {
  const [aberta, setAberta] = useState(false)
  if (!demandas.length) return null
  const Seta = aberta ? ChevronDown : ChevronRight
  return (
    <section className="lista-cal-sem" aria-label="Sem prazo">
      <h2 className="lista-cel-cabeca">
        <button type="button" className="lista-grupo-botao" aria-expanded={aberta} onClick={() => setAberta(!aberta)}>
          <Seta aria-hidden="true" className="lista-grupo-seta" />
          <span className="lista-grupo-nome">Sem prazo</span>
          <Contador valor={demandas.length} rotulo={demandas.length === 1 ? 'demanda' : 'demandas'} />
        </button>
      </h2>
      {aberta && (
        <div className="lista-cel-cards">
          <p className="lista-cal-sem-dica">Abra a demanda e escolha o prazo em Datas.</p>
          {demandas.map((d) => <div key={d.id} className="lista-cel-card"><CardDemanda demanda={d} /></div>)}
        </div>
      )}
    </section>
  )
}

export default function LayoutCalendario(p: PropsLayout) {
  const { quadro, colunas, demandas, filtros, definirFiltros, abrir, celular } = p
  const [modo, setModo] = useModoCalendario()
  const [inicio, setInicio] = useState<DataLocal>(() => hojeLocal())
  const [campos, alternarCampo] = useCamposCalendario()
  const feriados = useListaFeriados()
  const todas = useDemandasNoQuadro(quadro.id)
  const itens = useMemo(() => itensDoCalendario(demandas, campos), [demandas, campos])
  const sem = useMemo(() => semPrazo(demandas, colunas), [demandas, colunas])
  const semResultado = todas.length > 0 && demandas.length === 0 && temFiltros(filtros)

  if (todas.length === 0) {
    return (
      <div className="lista lista-centro">
        <EstadoVazio icone={Inbox} titulo="Nenhuma demanda ainda."
          texto="Crie a primeira com Shift+N ou no rodapé de uma coluna, na visão Quadro." />
      </div>
    )
  }

  return (
    <div className="lista lista-cal">
      <div className="lista-barra">
        <div className="lista-barra-campos" role="group" aria-labelledby="lista-cal-mostrar">
          <span id="lista-cal-mostrar" className="lista-barra-rotulo">Além do prazo, mostrar</span>
          {(['inicio', 'publicacao'] as const).map((c) => (
            <Checkbox key={c} tom="neutro" checked={campos.includes(c)} onChange={() => alternarCampo(c)}>{ROTULO_CAMPO[c]}</Checkbox>
          ))}
        </div>
        {!celular && <p className="lista-barra-dica">Arraste um prazo, ou uma demanda da faixa Sem prazo, para outro dia.</p>}
      </div>
      {semResultado && (
        <div className="lista-aviso" role="status">
          <Filter aria-hidden="true" /> Nenhuma demanda com estes filtros.
          <Botao variante="ghost" tamanho="p" onClick={() => definirFiltros({})}>Limpar filtros</Botao>
        </div>
      )}
      <div className="lista-cal-corpo">
        <CalendarioDemandas modo={modo} inicio={inicio}
          mudarPeriodo={(d, m) => { setInicio(d); if (m !== modo) setModo(m) }}
          itens={itens} feriados={feriados} semPrazo={celular ? undefined : sem} abrir={abrir}
          semPrazoVazio={temFiltros(filtros) ? 'Nenhuma sem prazo com estes filtros.' : undefined} />
        {celular && <SemPrazoCelular demandas={sem} />}
      </div>
    </div>
  )
}
