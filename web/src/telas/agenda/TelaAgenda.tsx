/**
 * Agenda (F3): o CalendarioDemandas do núcleo com as demandas de todos os quadros (a cor de cada quadro no chip), mês
 * ou semana começando na segunda, feriados, concluídas riscadas; arrastar um prazo para outro dia muda o prazo
 * ("Prazo: sex, 24/10 · Desfazer"); clicar abre a demanda. Filtros: "Só as minhas" (com a faixa "Sem prazo" para
 * arrastar para um dia), quadros (a legenda de cores é o filtro) e quais datas (prazo, início, publicação).
 * O período e os filtros ficam na URL (?modo=semana&data=2026-10-12&minhas=1&quadros=…&campos=prazo,inicio);
 * o modo e o "Só as minhas" também ficam lembrados neste navegador.
 * As listas saem do bootstrap (mudam na hora); a API traz as concluídas antigas (extras) e os feriados do período.
 */
import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { CalendarClock, CalendarX2, Megaphone, PlayCircle, UserRound } from 'lucide-react'
import type { AgendaConsulta, Bootstrap, CampoAgenda, DataLocal, Demanda, Id } from '@shared/tipos/index.ts'
import { CAMPOS_AGENDA } from '@shared/tipos/index.ts'
import { ehMinha } from '@shared/logica/quadro.ts'
import { useEu } from '../../api/auth.ts'
import { useDemandas, useDoBootstrap, useListaFeriados, useQuadros } from '../../api/seletores.ts'
import { CalendarioDemandas } from '../../calendario/index.ts'
import { registrarControleAgenda } from '../../funcionalidades/paineis/agenda-estado.ts'
import { useAgendaApi } from '../../funcionalidades/paineis/api.ts'
import { intervaloDaGrade, juntarAgenda } from '../../funcionalidades/paineis/logica.ts'
import { useTituloAba } from '../../lib/app.ts'
import { lerLocal, gravarLocal } from '../../lib/armazenamento.ts'
import { ehDataLocal, hojeLocal, inicioDaSemana, somarDias, somarMeses } from '../../lib/datas.ts'
import { useCelular } from '../../lib/midia.ts'
import { useAbrirSobreposta } from '../../sessao/sobreposta.tsx'
import { useEscopoAtalho } from '../../teclado/index.ts'
import { Kbd } from '../../ui/Kbd.tsx'
import '../../funcionalidades/paineis/paineis.css'


const ROTULO_CAMPO: Record<CampoAgenda, string> = { prazo: 'Prazo', inicio: 'Início', publicacao: 'Publicação' }
const ICONE_CAMPO = { prazo: CalendarClock, inicio: PlayCircle, publicacao: Megaphone } as const

const selColunas = (b: Bootstrap) => b.colunas

export default function TelaAgenda() {
  useTituloAba('Agenda')
  useEscopoAtalho('agenda')
  const eu = useEu()
  const celular = useCelular()
  const abrir = useAbrirSobreposta()
  const [params, setParams] = useSearchParams()
  const quadros = useQuadros()
  const demandas = useDemandas()
  const colunas = useDoBootstrap(selColunas)
  const feriadosDoBootstrap = useListaFeriados()

  // ─────────── estado na URL (com o modo e o "Só as minhas" lembrados) ───────────
  const modo: 'mes' | 'semana' = params.get('modo') === 'semana' ? 'semana' : params.get('modo') === 'mes' ? 'mes' : lerLocal<'mes' | 'semana'>('agenda-modo', celular ? 'semana' : 'mes')
  const dataUrl = params.get('data')
  const data: DataLocal = dataUrl && ehDataLocal(dataUrl) ? dataUrl : hojeLocal()
  const soMinhas = params.has('minhas') ? params.get('minhas') === '1' : lerLocal('agenda-minhas', false)
  const ativos = useMemo(() => quadros.filter((q) => q.arquivadoEm === null), [quadros])
  const quadroIds = useMemo(() => {
    const ids = (params.get('quadros') ?? '').split(',').filter((id) => ativos.some((q) => q.id === id))
    return ids
  }, [params, ativos])
  const campos = useMemo((): CampoAgenda[] => {
    const lista = (params.get('campos') ?? 'prazo').split(',').filter((c): c is CampoAgenda => (CAMPOS_AGENDA as readonly string[]).includes(c))
    return lista.length > 0 ? lista : ['prazo']
  }, [params])

  const mudar = useCallback((fn: (p: URLSearchParams) => void) => {
    setParams((atual) => { const p = new URLSearchParams(atual); fn(p); return p }, { replace: true })
  }, [setParams])

  const mudarPeriodo = useCallback((inicio: DataLocal, m: 'mes' | 'semana') => {
    gravarLocal('agenda-modo', m)
    mudar((p) => { p.set('modo', m); if (inicio === hojeLocal()) p.delete('data'); else p.set('data', inicio) })
  }, [mudar])

  // atalhos do escopo agenda (Shift+← → e Shift+T)
  useEffect(() => registrarControleAgenda({
    andar: (passo) => mudarPeriodo(modo === 'mes' ? somarMeses(data, passo) : somarDias(inicioDaSemana(data), 7 * passo), modo),
    hoje: () => mudarPeriodo(hojeLocal(), modo),
  }), [mudarPeriodo, modo, data])

  const { de, ate } = intervaloDaGrade(modo, data)
  const consulta: AgendaConsulta = useMemo(() => ({
    de, ate, campos,
    ...(soMinhas ? { soMinhas: true } : {}),
    ...(quadroIds.length > 0 ? { quadroIds } : {}),
  }), [de, ate, campos, soMinhas, quadroIds])
  const { data: api } = useAgendaApi(consulta)

  const vivas = useMemo(() => demandas.filter((d) => d.arquivadoEm === null), [demandas])
  const itens = useMemo(() => juntarAgenda(vivas, consulta, eu.usuario.id, api), [vivas, consulta, eu.usuario.id, api])
  const feriados = api?.feriados ?? feriadosDoBootstrap.filter((f) => f.data >= de && f.data <= ate)

  // "Sem prazo" só com "Só as minhas" (a de todos os quadros seria enorme): as minhas abertas sem prazo
  const semPrazo = useMemo((): Demanda[] | undefined => {
    if (!soMinhas || !campos.includes('prazo')) return undefined
    const concluidaCol = new Set((colunas ?? []).filter((c) => c.papel === 'concluida').map((c) => c.id))
    return vivas.filter((d) => !d.prazo && !d.concluidaEm && !concluidaCol.has(d.colunaId) && ehMinha(d, eu.usuario.id)
      && (quadroIds.length === 0 || quadroIds.includes(d.quadroId))).sort((a, b) => a.numero - b.numero)
  }, [soMinhas, campos, vivas, colunas, eu.usuario.id, quadroIds])

  // quantas no período por quadro (a legenda mostra)
  const porQuadro = useMemo(() => {
    const m = new Map<Id, number>()
    for (const i of juntarAgenda(vivas, { de, ate, campos, ...(soMinhas ? { soMinhas: true } : {}) }, eu.usuario.id, api)) {
      m.set(i.demanda.quadroId, (m.get(i.demanda.quadroId) ?? 0) + 1)
    }
    return m
  }, [vivas, de, ate, campos, soMinhas, eu.usuario.id, api])

  const alternarQuadro = (id: Id) => mudar((p) => {
    const atual = new Set(quadroIds)
    if (atual.has(id)) atual.delete(id); else atual.add(id)
    if (atual.size === 0 || atual.size === ativos.length) p.delete('quadros'); else p.set('quadros', [...atual].join(','))
  })
  const alternarCampo = (c: CampoAgenda) => mudar((p) => {
    const atual = new Set(campos)
    if (atual.has(c)) { if (atual.size > 1) atual.delete(c) } else atual.add(c)
    const lista = CAMPOS_AGENDA.filter((x) => atual.has(x))
    if (lista.length === 1 && lista[0] === 'prazo') p.delete('campos'); else p.set('campos', lista.join(','))
  })
  const alternarMinhas = () => {
    gravarLocal('agenda-minhas', !soMinhas)
    mudar((p) => p.set('minhas', soMinhas ? '0' : '1'))
  }

  const vazio = itens.length === 0
  const textoVazio = campos.length === 1 && campos[0] === 'prazo'
    ? 'Nenhuma demanda com prazo neste período.'
    : 'Nenhuma demanda com estas datas neste período.'

  return (
    <div className="pnl-agenda">
      <header className="pnl-agenda-topo">
        <h1 className="pnl-agenda-titulo">Agenda</h1>
        <div className="pnl-agenda-filtros" role="group" aria-label="Filtros da Agenda">
          <button type="button" className="pnl-filtro" aria-pressed={soMinhas} onClick={alternarMinhas}>
            <UserRound aria-hidden="true" />Só as minhas
          </button>
          <span className="pnl-agenda-sep" aria-hidden="true" />
          <div className="pnl-agenda-campos" role="group" aria-label="Datas">
            {CAMPOS_AGENDA.map((c) => {
              const I = ICONE_CAMPO[c]
              return (
                <button key={c} type="button" className="pnl-filtro" aria-pressed={campos.includes(c)} onClick={() => alternarCampo(c)}>
                  <I aria-hidden="true" />{ROTULO_CAMPO[c]}
                </button>
              )
            })}
          </div>
        </div>
      </header>
      <div className="pnl-agenda-quadros" role="group" aria-label="Quadros (clique para filtrar)">
        {ativos.map((q) => {
          const ligado = quadroIds.length === 0 || quadroIds.includes(q.id)
          const n = porQuadro.get(q.id) ?? 0
          return (
            <button key={q.id} type="button" className="pnl-legenda" data-cor={q.cor} aria-pressed={quadroIds.includes(q.id)}
              data-apagado={!ligado || undefined} onClick={() => alternarQuadro(q.id)}
              aria-label={`${q.nome}: ${n} no período${quadroIds.includes(q.id) ? ', filtrando' : ''}`}>
              <span className="pnl-legenda-ponto" aria-hidden="true" />
              <span className="pnl-legenda-nome">{q.nome}</span>
              <span className="pnl-legenda-n tabular" aria-hidden="true">{n}</span>
            </button>
          )
        })}
        {quadroIds.length > 0 && (
          <button type="button" className="pnl-legenda-limpar" onClick={() => mudar((p) => p.delete('quadros'))}>Todos os quadros</button>
        )}
      </div>
      {vazio && (
        <p className="pnl-agenda-vazia" role="status"><CalendarX2 aria-hidden="true" />{textoVazio}</p>
      )}
      <CalendarioDemandas modo={modo} inicio={data} mudarPeriodo={mudarPeriodo} itens={itens} feriados={feriados}
        semPrazo={semPrazo} mostrarQuadro abrir={(n) => abrir(`/d/${n}`)} />
      {!celular && (
        <p className="pnl-agenda-dica">
          Arraste um prazo para outro dia para mudar a data. <Kbd teclas="shift+arrowleft" /> <Kbd teclas="shift+arrowright" /> mudam o
          período e <Kbd teclas="shift+t" /> volta para hoje.
        </p>
      )}
    </div>
  )
}
