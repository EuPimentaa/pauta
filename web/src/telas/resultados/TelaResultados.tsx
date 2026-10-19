/**
 * /resultados (F8): a carteira lado a lado. Uma linha por cliente e canal com conta ligada (por sigla), os 4 KPIs
 * principais do canal com a variação (pelo shared/logica/resultados-formato.ts, os mesmos números da aba do cliente) e,
 * no topo, a faixa "Atenção" da carteira inteira. Mídia paga (Meta Ads e Google Ads) numa tabela e o site (GA4) noutra;
 * no celular, as linhas viram cartões. O mesmo seletor de período da aba (na URL); a sigla leva à aba do cliente.
 */
import { useId } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, BarChart3, Link2, Loader2 } from 'lucide-react'
import {
  ROTULO_CONECTOR, type AlertaResultado, type ConectorWindsor, type LinhaPanorama, type PanoramaResultados, type PeriodoResultados,
} from '@shared/tipos/index.ts'
import { definicaoKpi, formatarValor, KPIS_PRINCIPAIS, linhaKpi, type ChaveKpi } from '@shared/logica/resultados-formato.ts'
import { rotuloIntervalo } from '@shared/logica/resultados-periodo.ts'
import { useEu } from '../../api/auth.ts'
import { usePanorama } from '../../funcionalidades/resultados/api.ts'
import { FaixaAtencao, SeletorPeriodo, usePeriodoDaUrl, Variacao } from '../../funcionalidades/resultados/comum.tsx'
import { textoDados } from '../../funcionalidades/resultados/logica.ts'
import { useTituloAba } from '../../lib/app.ts'
import { hojeLocal } from '../../lib/datas.ts'
import { Botao, propsBotao } from '../../ui/Botao.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'

const ESTADO: Record<string, string> = {
  sem_dados: 'Sem dados no período', chave_invalida: 'Chave da Windsor recusada', fora_do_ar: 'A Windsor não respondeu',
  limite: 'A Windsor não respondeu', conta_nao_conectada: 'Conta não conectada na Windsor', resposta_invalida: 'Resposta inesperada da Windsor',
}

const linkCliente = (sigla: string, periodo: PeriodoResultados) =>
  `/clientes/${encodeURIComponent(sigla)}?aba=resultados${periodo === '30d' ? '' : `&periodo=${periodo}`}`

interface LinhaTabela { linha: LinhaPanorama; c: LinhaPanorama['conectores'][number]; alertas: AlertaResultado[] }

function Celula<C extends ConectorWindsor>({ conector, chave, c }: { conector: C; chave: ChaveKpi<C>; c: LinhaTabela['c'] }) {
  const def = definicaoKpi(conector, chave)
  const a = c.atual[chave] ?? null
  const b = c.anterior[chave] ?? null
  return (
    <td className="num" data-rotulo={def.rotulo}>
      <span className="sr-only">{linhaKpi(conector, chave, a, b)}</span>
      <span className="res-celula" aria-hidden="true">
        <span>{formatarValor(a, def.formato)}</span>
        <Variacao conector={conector} chave={chave} atual={a} anterior={b} />
      </span>
    </td>
  )
}

function Tabela({ titulo, linhas, conectores, periodo }: {
  titulo: string; linhas: LinhaTabela[]; conectores: ConectorWindsor[]; periodo: PeriodoResultados
}) {
  const id = useId()
  if (linhas.length === 0) return null
  const base = conectores[0]!
  const cabecalhos = (KPIS_PRINCIPAIS[base] as readonly string[]).map((k) => {
    if (base === 'googleanalytics4') return definicaoKpi(base, k as ChaveKpi<'googleanalytics4'>).rotulo
    return ({ investimento: 'Investimento', resultados: 'Resultados ou conversões', custoPorResultado: 'Custo por resultado', ctr: 'CTR' } as Record<string, string>)[k]!
  })
  const midia = base !== 'googleanalytics4'
  return (
    <section className="res-bloco" aria-labelledby={id}>
      <h2 className="res-secao-titulo" id={id}>{titulo}</h2>
      <div className="res-tabela-rolagem">
        <table className="res-tabela res-tabela-carteira">
          <thead>
            <tr>
              <th scope="col">Cliente</th>{midia && <th scope="col">Canal</th>}
              {cabecalhos.map((h) => <th key={h} scope="col" className="num">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ linha, c, alertas }) => (
              <tr key={`${linha.clienteId}:${c.conector}`}>
                <th scope="row" className="res-carteira-cliente">
                  <Link to={linkCliente(linha.sigla, periodo)} className="res-sigla">{linha.sigla}</Link>
                  {alertas.length > 0 && (
                    <span className="res-alerta-mini" title={alertas.map((a) => a.texto).join('\n')}>
                      <AlertTriangle aria-hidden="true" /><span className="sr-only">{alertas.length === 1 ? '1 alerta' : `${alertas.length} alertas`}</span>
                    </span>
                  )}
                  {midia && <span className="res-canal-celular" aria-hidden="true">{ROTULO_CONECTOR[c.conector]}</span>}
                </th>
                {midia && <td className="res-canal-coluna" data-rotulo="Canal">{ROTULO_CONECTOR[c.conector]}</td>}
                {c.estado === 'sem_dados' || (c.atual[KPIS_PRINCIPAIS[c.conector][0]] == null && c.anterior[KPIS_PRINCIPAIS[c.conector][0]] == null) ? (
                  <td colSpan={4} className="res-carteira-estado">{ESTADO[c.estado] ?? 'Buscando na Windsor…'}</td>
                ) : (KPIS_PRINCIPAIS[c.conector] as readonly string[]).map((k) => (
                  <Celula key={k} conector={c.conector} chave={k as never} c={c} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function linhasDe(p: PanoramaResultados, conectores: ConectorWindsor[]): LinhaTabela[] {
  return p.linhas.flatMap((linha) => linha.conectores.filter((c) => conectores.includes(c.conector))
    .map((c) => ({ linha, c, alertas: linha.alertas.filter((a) => a.conector === c.conector) })))
}

export default function TelaResultados() {
  useTituloAba('Resultados')
  const eu = useEu()
  const [periodo, setPeriodo] = usePeriodoDaUrl()
  const consulta = usePanorama(periodo)
  const hoje = hojeLocal()
  const gestao = eu.usuario.papel !== 'equipe'
  const p = consulta.data
  const siglaDe = new Map((p?.linhas ?? []).flatMap((l) => l.alertas.map((a) => [a, l.sigla] as const)))
  const alertas = (p?.linhas ?? []).flatMap((l) => l.alertas)

  return (
    <div className="res-pagina">
      <header className="res-pagina-cabeca">
        <h1 className="res-pagina-titulo">Resultados</h1>
        <p className="res-pagina-sub">Os clientes com conta ligada, lado a lado. Toque na sigla para ver o cliente.</p>
      </header>
      <div className="res-filtros">
        <div className="res-filtros-esquerda">
          <SeletorPeriodo valor={p?.periodo ?? periodo} aoMudar={setPeriodo} />
          {p && <p className="res-comparacao">{rotuloIntervalo(p.de, p.ate, hoje.slice(0, 4))}, comparado com {rotuloIntervalo(p.deAnterior, p.ateAnterior, hoje.slice(0, 4))}</p>}
        </div>
        {p?.estado === 'ok' && p.linhas.length > 0 && (
          <span className="res-dados res-dados-texto" aria-live="polite">
            {p.atualizando ? <><Loader2 className="ui-giro" aria-hidden="true" />Atualizando…</> : textoDados(p.buscadoEm, hoje) ?? ''}
          </span>
        )}
      </div>
      {consulta.isPending ? <EsqueletoLinhas linhas={8} /> : consulta.isError ? (
        <EstadoVazio icone={BarChart3} titulo="Não foi possível carregar a carteira." texto={consulta.error.mensagem}
          acoes={<Botao variante="secundario" onClick={() => void consulta.refetch()}>Tentar de novo</Botao>} />
      ) : p!.estado === 'sem_chave' ? (
        <EstadoVazio icone={BarChart3} titulo="A integração com a Windsor não está configurada."
          texto={eu.usuario.papel === 'admin' ? 'Defina WINDSOR_API_KEY no EasyPanel.' : 'Fale com o admin para ligar os resultados de mídia e do site.'} />
      ) : p!.linhas.length === 0 ? (
        <EstadoVazio icone={Link2} titulo="Nenhum cliente com conta de resultados ligada."
          texto={gestao ? 'Ligue as contas da Windsor aos clientes em Configurações.' : 'Quem liga as contas é o atendimento ou o admin.'}
          acoes={gestao ? <Link {...propsBotao({ variante: 'secundario' })} to="/config/resultados-windsor">Ligar contas</Link> : undefined} />
      ) : (
        <div className="res-carteira" data-recarregando={consulta.isPlaceholderData ? '' : undefined}>
          <FaixaAtencao alertas={alertas} prefixo={(a) => siglaDe.get(a) ?? null} />
          <Tabela titulo="Mídia paga" linhas={linhasDe(p!, ['facebook', 'google_ads'])} conectores={['facebook', 'google_ads']} periodo={periodo} />
          <Tabela titulo="Site (GA4)" linhas={linhasDe(p!, ['googleanalytics4'])} conectores={['googleanalytics4']} periodo={periodo} />
        </div>
      )}
    </div>
  )
}
