/**
 * Agenda externa da demonstração (F9): a agenda "Melt" com o endereço de teste da convenção de desenvolvimento
 * (FASE2-PLANO §1: ele lê server/test/fixtures/agenda/google-2026.ics, nunca a rede) e as ocorrências já gravadas, como
 * depois de uma busca boa. Assim a Agenda, o Início e a ferramenta `agenda` do MCP mostram eventos logo depois do
 * seed. Os eventos da fixture vão de setembro de 2026 a abril de 2027 (relógio dos casos: 19/10/2026).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { atorDe } from '../../src/auth.ts'
import { criarAgenda } from '../../src/servicos/agenda.ts'
import { ENDERECO_TESTE, gravarCorpoAgenda } from '../../src/servicos/agenda-busca.ts'
import type { ContextoDemo } from '../seed-demo.ts'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test', 'fixtures', 'agenda', 'google-2026.ics')

export function semear(ctx: ContextoDemo): void {
  const agenda = criarAgenda(ctx.db, { nome: 'Melt', cor: 'roxo', url: ENDERECO_TESTE }, atorDe(ctx.pessoas.admin))
  gravarCorpoAgenda(ctx.db, agenda.id, readFileSync(FIXTURE))
}
