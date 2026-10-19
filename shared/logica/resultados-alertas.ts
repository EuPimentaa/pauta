/**
 * Fase 2 (F8): a faixa "Atenção" dos resultados (API.md §F.8; shared/tipos/resultados.ts, TIPOS_ALERTA_RESULTADO). Puro:
 * o servidor calcula e manda o `texto` pronto, o mesmo na aba, na carteira e no MCP.
 * - conta_nao_conectada: a Windsor disse que nenhuma das contas pedidas está conectada;
 * - parou_de_gastar: investimento zero ontem numa conta que gastou nos 7 dias antes (Meta e Google Ads; só quando o
 *   período termina ontem, porque é o "ontem" que interessa);
 * - custo_subiu: custo por resultado (Meta) ou por conversão (Google Ads) +30% ou mais contra o período anterior (a
 *   variação arredondada, a mesma que a tela mostra: +29,6% aparece "+30%" e alerta).
 */
import type { DataLocal } from '../tipos/nucleo.ts'
import { ROTULO_CONECTOR, type AlertaResultado, type ConectorWindsor, type ErroWindsor } from '../tipos/resultados.ts'
import type { GastoRecente } from '../tipos/ext/resultados.ts'
import { somarDias } from './datas.ts'
import { formatarKpi, formatarVariacao, variacao } from './resultados-formato.ts'

/** Variação mínima do custo (arredondada, em %) para o alerta. */
export const CUSTO_SUBIU_PCT = 30

export interface ConectorParaAlertas {
  conector: ConectorWindsor
  estado: 'ok' | 'sem_dados' | ErroWindsor
  /** As contas ligadas neste conector, com o nome guardado na ligação. */
  contas: { contaId: string; nome: string }[]
  /** O custo do período atual e do anterior (Meta: custo por resultado; Google Ads: custo por conversão). Null: sem dados. */
  custo: { atual: number | null; anterior: number | null } | null
  /** Gasto por conta e dia nos 8 dias que terminam no fim do período (Meta e Google Ads). */
  gastoRecente: GastoRecente | null
  /** O último dia do período atual. */
  ate: DataLocal
}

const ROTULO_CUSTO: Partial<Record<ConectorWindsor, string>> = { facebook: 'custo por resultado', google_ads: 'custo por conversão' }
const CHAVE_CUSTO = { facebook: 'custoPorResultado', google_ads: 'custoPorConversao' } as const

function dinheiro(v: number): string {
  return formatarKpi('facebook', 'investimento', v)
}

/** Os alertas de um cliente, na ordem: contas não conectadas, contas que pararam de gastar, custos que subiram. */
export function alertasResultados(conectores: readonly ConectorParaAlertas[], hoje: DataLocal): AlertaResultado[] {
  const ontem = somarDias(hoje, -1)
  const desconectadas: AlertaResultado[] = []
  const pararam: AlertaResultado[] = []
  const custos: AlertaResultado[] = []
  for (const c of conectores) {
    const rotulo = ROTULO_CONECTOR[c.conector]
    if (c.estado === 'conta_nao_conectada') {
      const uma = c.contas.length === 1 ? c.contas[0]! : null
      desconectadas.push({
        tipo: 'conta_nao_conectada', conector: c.conector, contaId: uma?.contaId ?? null,
        texto: uma
          ? `${rotulo}: a conta ${uma.nome} não está conectada na Windsor. Avise o admin.`
          : `${rotulo}: as contas ligadas não estão conectadas na Windsor. Avise o admin.`,
      })
    }
    if (c.gastoRecente && c.ate === ontem && c.conector !== 'googleanalytics4') {
      for (const conta of c.contas) {
        const dias = c.gastoRecente[conta.contaId] ?? {}
        let antes = 0
        for (let i = 1; i <= 7; i++) antes += dias[somarDias(ontem, -i)] ?? 0
        antes = Math.round(antes * 100) / 100
        if ((dias[ontem] ?? 0) === 0 && antes > 0) {
          pararam.push({
            tipo: 'parou_de_gastar', conector: c.conector, contaId: conta.contaId,
            texto: `${rotulo}: a conta ${conta.nome} não gastou ontem (gastou ${dinheiro(antes)} nos 7 dias antes)`,
          })
        }
      }
    }
    const rotuloCusto = ROTULO_CUSTO[c.conector]
    if (rotuloCusto && c.custo) {
      const v = variacao(c.custo.atual, c.custo.anterior)
      if (v.tipo === 'pct' && Math.round(v.fracao * 100) >= CUSTO_SUBIU_PCT) {
        const chave = CHAVE_CUSTO[c.conector as 'facebook' | 'google_ads']
        const fmt = (x: number | null) => formatarKpi(c.conector as 'facebook', chave as 'custoPorResultado', x)
        custos.push({
          tipo: 'custo_subiu', conector: c.conector, contaId: null,
          texto: `${rotulo}: o ${rotuloCusto} subiu ${formatarVariacao(v)} (${fmt(c.custo.atual)} contra ${fmt(c.custo.anterior)} no período anterior)`,
        })
      }
    }
  }
  return [...desconectadas, ...pararam, ...custos]
}
