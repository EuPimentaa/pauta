/**
 * Aba "Resultados" da página do cliente (F8; FASE2-PLANO §3 F8): lida em 10 segundos.
 * Ordem (desktop): período e "comparado com", "Dados de 14:05 · Atualizar agora", a faixa "Atenção", os 4 KPIs
 * principais de cada conector (12 cartões antes do gráfico) com "Mais métricas" fechado, o gráfico da evolução diária
 * (métrica por chips), as 10 campanhas de Meta e Google e os eventos-chave do GA4.
 * Estados: sem chave, sem contas, carregando (esqueleto dos cartões), Windsor fora do ar com os dados antigos, conta
 * sem dados no período. Números e cores só pelo shared/logica/resultados-formato.ts (os mesmos do MCP).
 */
import { useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BarChart3, Link2, Loader2, RefreshCw } from 'lucide-react'
import {
  ROTULO_CONECTOR, type CampanhaResultado, type Cliente, type ConectorWindsor, type ContaLigada, type ResultadoConector,
  type ResultadosCliente,
} from '@shared/tipos/index.ts'
import { pode } from '@shared/logica/permissoes.ts'
import { DEFINICOES_KPI, formatarKpi, KPIS_PRINCIPAIS, type ChaveKpi } from '@shared/logica/resultados-formato.ts'
import { rotuloIntervalo } from '@shared/logica/resultados-periodo.ts'
import { avisarErro } from '../../api/acoes.ts'
import { useEu } from '../../api/auth.ts'
import { ehErroDaApi } from '../../api/cliente.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { hojeLocal } from '../../lib/datas.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Esqueleto, EstadoVazio } from '../../ui/Indicadores.tsx'
import { atualizarResultados, useResultadosCliente } from './api.ts'
import { CartaoKpi, FaixaAtencao, SeletorPeriodo, usePeriodoDaUrl } from './comum.tsx'
import { GraficoSerie } from './GraficoSerie.tsx'
import { buscadoMaisAntigo, METRICAS_GRAFICO, pontosDa, rotuloTipo, textoDados } from './logica.ts'
import './dialogos.ts'

const DICA_SOMA = 'Total do período em cada conta, somado entre as contas: quem foi alcançado por duas contas conta duas vezes.'

function contasDe(r: ResultadosCliente, c: ConectorWindsor): ContaLigada[] {
  return r.contas.filter((x) => x.conector === c)
}

/** O aviso do conector quando a última busca falhou (com ou sem os dados de antes). */
function avisoDoConector(b: ResultadoConector, hoje: string): string | null {
  const antigos = b.kpis && b.buscadoEm ? ` Mostrando os ${textoDados(b.buscadoEm, hoje)!.replace(/^Dados/, 'dados')}.` : ''
  switch (b.estado) {
    case 'chave_invalida': return `A chave da Windsor foi recusada. Avise o admin.${antigos}`
    case 'fora_do_ar': case 'limite': return `A Windsor não respondeu.${antigos || ' Tente de novo em alguns minutos.'}`
    case 'resposta_invalida': return `A Windsor respondeu algo inesperado.${antigos || ' Tente de novo mais tarde.'}`
    default: return null
  }
}

function EsqueletoCartoes() {
  return (
    <ul className="res-cartoes" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <li key={i} className="res-cartao"><Esqueleto largura="50%" altura={12} /><Esqueleto largura="70%" altura={24} /><Esqueleto largura={48} altura={12} /></li>)}
    </ul>
  )
}

function BlocoConector({ r, b }: { r: ResultadosCliente; b: ResultadoConector }) {
  const id = useId()
  const c = b.conector
  const contas = contasDe(r, c)
  const aviso = avisoDoConector(b, hojeLocal())
  const principais = KPIS_PRINCIPAIS[c] as readonly string[]
  const atual = b.kpis?.atual as Record<string, number | null> | undefined
  const anterior = b.kpis?.anterior as Record<string, number | null> | undefined
  const varias = contas.length > 1
  const dica = (k: string) => (varias && (k === 'alcance' || k === 'usuarios' || k === 'novosUsuarios') ? DICA_SOMA : undefined)
  const outras = Object.keys(DEFINICOES_KPI[c]).filter((k) => !principais.includes(k)).filter((k) => {
    if (!atual || !anterior) return false
    if (k === 'roas') return atual[k] !== null || anterior[k] !== null
    if (k === 'compras' || k === 'valorCompras') return (atual[k] ?? 0) > 0 || (anterior[k] ?? 0) > 0
    return true
  })
  return (
    <section className="res-canal" aria-labelledby={id}>
      <div className="res-canal-cabeca">
        <h3 className="res-canal-titulo" id={id}>{ROTULO_CONECTOR[c]}</h3>
        <span className="res-canal-contas">{contas.map((x) => x.nome).join(' · ')}</span>
      </div>
      {aviso && <p className="res-aviso" role="status">{aviso}</p>}
      {!b.kpis ? (
        r.atualizando ? <EsqueletoCartoes /> : (
          <p className="res-vazio">{b.estado === 'conta_nao_conectada' ? 'Sem dados: a conta não está conectada na Windsor.'
            : aviso ? 'Sem dados deste canal por enquanto.' : 'Ainda sem dados deste canal. Use “Atualizar agora”.'}</p>
        )
      ) : b.estado === 'sem_dados' ? (
        <p className="res-vazio">Nenhum dado neste período: a conta não teve {c === 'googleanalytics4' ? 'visitas registradas' : 'entrega'} entre {rotuloIntervalo(r.de, r.ate)}.</p>
      ) : (
        <>
          <ul className="res-cartoes" aria-label={`${ROTULO_CONECTOR[c]}: principais`}>
            {principais.map((k) => (
              <CartaoKpi key={k} conector={c} chave={k as ChaveKpi<typeof c>} atual={atual![k] ?? null} anterior={anterior![k] ?? null} dica={dica(k)} />
            ))}
          </ul>
          {outras.length > 0 && (
            <details className="res-mais">
              <summary>Mais métricas de {ROTULO_CONECTOR[c]}</summary>
              <ul className="res-cartoes res-cartoes-mais" aria-label={`${ROTULO_CONECTOR[c]}: mais métricas`}>
                {outras.map((k) => (
                  <CartaoKpi key={k} pequeno conector={c} chave={k as ChaveKpi<typeof c>} atual={atual![k] ?? null} anterior={anterior![k] ?? null} dica={dica(k)} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function GraficoResultados({ r }: { r: ResultadosCliente }) {
  const id = useId()
  const blocos = [r.meta, r.googleAds, r.ga4].filter((b): b is ResultadoConector => !!b && !!b.kpis && b.estado !== 'sem_dados')
  const disponiveis = blocos.flatMap((b) => METRICAS_GRAFICO[b.conector])
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const metrica = disponiveis.find((m) => m.id === escolhida) ?? disponiveis[0]
  if (!metrica) return null
  const { atual, anterior } = pontosDa(r, metrica)
  const grupos = blocos.length > 1
  return (
    <section className="res-grafico" aria-labelledby={id}>
      <div className="res-grafico-cabeca">
        <h3 className="res-secao-titulo" id={id}>Evolução diária</h3>
        <div className="res-chips" role="group" aria-label="Métrica do gráfico">
          {blocos.map((b) => (
            <div key={b.conector} className="res-chips-grupo">
              {grupos && <span className="res-chips-rotulo" aria-hidden="true">{ROTULO_CONECTOR[b.conector]}</span>}
              {METRICAS_GRAFICO[b.conector].map((m) => (
                <button key={m.id} type="button" className="res-chip" aria-pressed={m.id === metrica.id}
                  aria-label={grupos ? `${ROTULO_CONECTOR[b.conector]}: ${m.rotulo}` : m.rotulo} onClick={() => setEscolhida(m.id)}>
                  {m.rotulo}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <GraficoSerie metrica={{ ...metrica, rotulo: grupos ? `${metrica.rotulo} (${ROTULO_CONECTOR[metrica.conector]})` : metrica.rotulo }}
        atual={atual} anterior={anterior}
        rotuloAtual={rotuloIntervalo(r.de, r.ate)} rotuloAnterior={rotuloIntervalo(r.deAnterior, r.ateAnterior)} />
    </section>
  )
}

function TabelaCampanhas({ conector, campanhas }: { conector: 'facebook' | 'google_ads'; campanhas: CampanhaResultado[] }) {
  const id = useId()
  const meta = conector === 'facebook'
  const rotuloRes = meta ? 'Resultados' : 'Conversões'
  const rotuloCusto = meta ? 'Custo por resultado' : 'Custo por conversão'
  const res = (v: number) => (meta ? formatarKpi('facebook', 'resultados', v) : formatarKpi('google_ads', 'conversoes', v))
  return (
    <section className="res-bloco" aria-labelledby={id}>
      <h3 className="res-secao-titulo" id={id}>Campanhas · {ROTULO_CONECTOR[conector]}</h3>
      {campanhas.length === 0 ? <p className="res-vazio">Nenhuma campanha com entrega neste período.</p> : (
        <div className="res-tabela-rolagem">
          <table className="res-tabela">
            <thead>
              <tr>
                <th scope="col">Campanha</th><th scope="col" className="num">Investimento</th><th scope="col" className="num">{rotuloRes}</th>
                <th scope="col" className="num">{rotuloCusto}</th><th scope="col" className="num">Cliques</th>
              </tr>
            </thead>
            <tbody>
              {campanhas.map((c) => (
                <tr key={c.id}>
                  <td><div className="res-campanha"><span className="res-campanha-nome">{c.nome}</span>{c.tipo && <span className="res-campanha-tipo">{rotuloTipo(c.tipo)}</span>}</div></td>
                  <td className="num" data-rotulo="Investimento">{formatarKpi('facebook', 'investimento', c.investimento)}</td>
                  <td className="num" data-rotulo={rotuloRes}>{res(c.resultados)}</td>
                  <td className="num" data-rotulo={rotuloCusto}>{formatarKpi('facebook', 'custoPorResultado', c.custoPorResultado)}</td>
                  <td className="num" data-rotulo="Cliques">{formatarKpi('facebook', 'cliques', c.cliques)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function EventosChave({ eventos }: { eventos: { nome: string; quantidade: number }[] }) {
  const id = useId()
  return (
    <section className="res-bloco" aria-labelledby={id}>
      <h3 className="res-secao-titulo" id={id}>Eventos-chave · GA4</h3>
      {eventos.length === 0 ? <p className="res-vazio">Nenhum evento-chave neste período.</p> : (
        <ul className="res-eventos">
          {eventos.map((e) => (
            <li key={e.nome}><span className="res-evento-nome">{e.nome}</span><span className="res-evento-n">{formatarKpi('googleanalytics4', 'eventosChave', e.quantidade)}</span></li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function AbaResultados({ cliente }: { cliente: Cliente }) {
  const qc = useQueryClient()
  const eu = useEu()
  const abrirDialogo = useAbrirDialogo()
  const [periodo, setPeriodo] = usePeriodoDaUrl()
  const consulta = useResultadosCliente(cliente.id, periodo)
  const [pedindo, setPedindo] = useState(false)
  const podeLigar = pode('cliente.editar', { id: eu.usuario.id, papel: eu.usuario.papel }, { cliente })
  const hoje = hojeLocal()

  async function atualizar() {
    setPedindo(true)
    try {
      await atualizarResultados(qc, cliente.id, periodo)
    } catch (e) {
      if (ehErroDaApi(e) && e.status === 429) {
        const s = Number(e.detalhes?.tenteEmSegundos ?? 60)
        avisar('Os resultados deste cliente foram atualizados há pouco.', { tipo: 'aviso', descricao: `Tente de novo em ${s < 90 ? `${s} s` : `${Math.ceil(s / 60)} min`}.` })
      } else avisarErro(e, { titulo: 'Não foi possível atualizar os resultados.' })
    } finally {
      setPedindo(false)
    }
  }

  const filtros = (r?: ResultadosCliente) => (
    <div className="res-filtros">
      <div className="res-filtros-esquerda">
        <SeletorPeriodo valor={r?.periodo ?? periodo} aoMudar={setPeriodo} />
        {r && <p className="res-comparacao">{rotuloIntervalo(r.de, r.ate, hoje.slice(0, 4))}, comparado com {rotuloIntervalo(r.deAnterior, r.ateAnterior, hoje.slice(0, 4))}</p>}
      </div>
      {r?.estado === 'ok' && (
        <div className="res-dados">
          <span aria-live="polite" className="res-dados-texto">
            {r.atualizando || pedindo ? <><Loader2 className="ui-giro" aria-hidden="true" />Atualizando…</> : textoDados(buscadoMaisAntigo(r), hoje) ?? ''}
          </span>
          <Botao tamanho="p" variante="secundario" icone={RefreshCw} carregando={pedindo} disabled={r.atualizando}
            dica="Relê o que a Windsor tem agora. Os 3 últimos dias podem chegar com até 6 h de atraso." onClick={() => void atualizar()}>
            Atualizar agora
          </Botao>
        </div>
      )}
    </div>
  )

  if (consulta.isPending) {
    return (
      <div className="res-aba" aria-busy="true">
        {filtros()}
        <EsqueletoCartoes /><EsqueletoCartoes /><EsqueletoCartoes />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <EstadoVazio icone={BarChart3} titulo="Não foi possível carregar os resultados." texto={consulta.error.mensagem}
        acoes={<Botao variante="secundario" onClick={() => void consulta.refetch()}>Tentar de novo</Botao>} />
    )
  }
  const r = consulta.data
  if (r.estado === 'sem_chave') {
    return (
      <div className="res-aba">
        <EstadoVazio icone={BarChart3} titulo="A integração com a Windsor não está configurada."
          texto={eu.usuario.papel === 'admin' ? 'Defina WINDSOR_API_KEY no EasyPanel.' : 'Fale com o admin para ligar os resultados de mídia e do site.'} />
      </div>
    )
  }
  if (r.estado === 'sem_contas') {
    return (
      <div className="res-aba">
        <EstadoVazio icone={Link2} titulo="Nenhuma conta de resultados ligada."
          texto={podeLigar ? 'Ligue as contas de Meta Ads, Google Ads e GA4 deste cliente para ver os resultados aqui.' : 'Quem liga as contas é o atendimento do cliente ou o admin.'}
          acoes={podeLigar ? <Botao variante="primario" icone={Link2} onClick={() => void abrirDialogo('resultados-ligar-conta', { clienteId: cliente.id })}>Ligar contas</Botao> : undefined} />
      </div>
    )
  }
  const blocos = [r.meta, r.googleAds, r.ga4].filter((b): b is ResultadoConector => !!b)
  return (
    <div className="res-aba" aria-busy={r.atualizando} data-recarregando={consulta.isPlaceholderData ? '' : undefined}>
      {filtros(r)}
      <FaixaAtencao alertas={r.alertas} />
      {blocos.map((b) => <BlocoConector key={b.conector} r={r} b={b} />)}
      <GraficoResultados r={r} />
      {r.meta?.kpis && r.meta.estado !== 'sem_dados' && <TabelaCampanhas conector="facebook" campanhas={r.meta.campanhas} />}
      {r.googleAds?.kpis && r.googleAds.estado !== 'sem_dados' && <TabelaCampanhas conector="google_ads" campanhas={r.googleAds.campanhas} />}
      {r.ga4?.kpis && r.ga4.estado !== 'sem_dados' && <EventosChave eventos={r.ga4.eventosChave} />}
    </div>
  )
}
