/**
 * Dados de demonstração dos resultados da Windsor (F8): liga à CLA (Clínica Aurora) as 3 contas das fixtures da pesquisa
 * (Meta, Google Ads e GA4, server/test/fixtures/resultados/contas-ds-accounts.json). Com `WINDSOR_API_KEY=fixtures` no
 * servidor de desenvolvimento, a aba Resultados da CLA e a carteira /resultados mostram os números das fixtures; as
 * outras contas de contas-demo.json ficam na lista para o "Ligar a…" de Configurações → Resultados (Windsor).
 * Pelo serviço (atividade e evento como na tela), como o AM da CLA; sem a CLA, não faz nada.
 */
import type { ConectorWindsor } from '../../../shared/tipos/index.ts'
import { atorDe } from '../../src/auth.ts'
import { lerFixture } from '../../src/servicos/resultados-fixtures.ts'
import { ligarConta } from '../../src/servicos/resultados-contas.ts'
import type { ContextoDemo } from '../seed-demo.ts'

export function semear(ctx: ContextoDemo): void {
  const cla = ctx.clientes.cla
  if (!cla) return
  const am = Object.values(ctx.pessoas).find((p) => p.id === cla.atendimentoId) ?? ctx.pessoas.admin
  const contas = lerFixture<{ datasource: ConectorWindsor; account_name: string; account_id: string }[]>('contas-ds-accounts.json')
  for (const c of contas) {
    ligarConta(ctx.db, cla.id, { conector: c.datasource, contaId: c.account_id, nome: c.account_name }, atorDe(am))
  }
}
