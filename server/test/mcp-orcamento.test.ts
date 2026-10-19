/** F7 · orçamento de tokens (ORCAMENTO_MCP, API.md §F.5): as respostas no seed de demonstração dentro do teto. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bancoDoSeed, medir, tabela } from '../scripts/mcp-medir.ts'
import { INICIO } from './ajuda.ts'

test('mcp-medir: tools/list, minhas, ler, agenda de 7 dias, resumo e listar clientes dentro do ORCAMENTO_MCP', async () => {
  const db = await bancoDoSeed({ agora: INICIO })
  const medidas = await medir(db)
  assert.equal(medidas.length, 6)
  for (const m of medidas) assert.ok(m.caracteres <= m.teto, `${m.rotulo}: ${m.caracteres} > ${m.teto}\n${tabela(medidas)}`)
  assert.ok(medidas.every((m) => m.caracteres > 50), tabela(medidas))
})
