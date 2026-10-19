/**
 * Mede as respostas do MCP no seed de demonstração (F7, API.md §F.5, ORCAMENTO_MCP): monta um banco em memória com o
 * seed, chama cada leitura como uma pessoa da equipe (e o resumo como o atendimento) e imprime caracteres e tokens
 * estimados (≈ 3,3 caracteres por token) contra o teto. Sai com código 1 se algum passar.
 *
 *   node server/scripts/mcp-medir.ts            (300 demandas na Criação, como o seed:demo)
 *   node server/scripts/mcp-medir.ts --demandas 1000
 *
 * Também roda como teste (server/test/mcp-orcamento.test.ts). Não lê nem grava o DATA_DIR.
 */
import { randomBytes } from 'node:crypto'
import { ORCAMENTO_MCP } from '../../shared/tipos/index.ts'
import { configurar } from '../src/config.ts'
import { abrir, fixarRelogio, migrar, relogioFixado, todos, type Db } from '../src/db.ts'
import { chamarFerramenta, listaDeFerramentas } from '../src/servicos/mcp.ts'
import { zerarLimitesMcp } from '../src/servicos/mcp-limites.ts'
import { carregarUsuario } from '../src/servicos/pessoas.ts'
import { semearDemo } from './seed-demo.ts'

export interface Medida {
  nome: keyof typeof ORCAMENTO_MCP
  rotulo: string
  caracteres: number
  teto: number
}

const POR_TOKEN = 3.3

async function texto(db: Db, usuarioId: string, ferramenta: string, args: Record<string, unknown>): Promise<string> {
  const r = await chamarFerramenta(db, { usuario: carregarUsuario(db, usuarioId), concessaoId: 'medir', ip: '' }, ferramenta, args)
  if (r.isError) throw new Error(`${ferramenta}: ${r.content[0]!.text}`)
  return r.content[0]!.text
}

/** O banco do seed (relógio fixo: as datas do seed são relativas a ele). */
export async function bancoDoSeed(o: { demandas?: number; agora?: string } = {}): Promise<Db> {
  fixarRelogio(o.agora ?? '2026-10-19T13:00:00.000Z')
  const db = abrir(':memory:')
  migrar(db)
  const senha = `${randomBytes(12).toString('base64url')}-Pauta9`
  const log = console.log
  console.log = () => {}
  try {
    await semearDemo(db, { emailAdmin: 'admin@pauta.test', senhaAdmin: senha, senhaPessoas: senha, demandasCriacao: o.demandas ?? 300 })
  } finally {
    console.log = log
  }
  return db
}

/** As medidas do ORCAMENTO_MCP. `ler_demanda` mede a maior entre 30 demandas do seed (as de mais conteúdo primeiro). */
export async function medir(db: Db): Promise<Medida[]> {
  zerarLimitesMcp()
  const pessoa = (apelido: string) => todos<{ id: string }>(db, 'SELECT id FROM usuario WHERE apelido = ?', apelido)[0]!.id
  const equipe = pessoa('Rafa')
  const atendimento = pessoa('Pri')
  const medidas: Medida[] = []
  const m = (nome: Medida['nome'], rotulo: string, t: string) => medidas.push({ nome, rotulo, caracteres: t.length, teto: ORCAMENTO_MCP[nome] })

  m('toolsList', 'tools/list', JSON.stringify(listaDeFerramentas()))
  m('minhasDemandas', 'minhas_demandas (Rafa, equipe)', await texto(db, equipe, 'minhas_demandas', {}))
  const numeros = todos<{ numero: number }>(db, `SELECT d.numero FROM demanda d WHERE d.excluido_em IS NULL
    ORDER BY (SELECT count(*) FROM comentario c WHERE c.demanda_id = d.id) + (SELECT count(*) FROM checklist_item i WHERE i.demanda_id = d.id)
      + length(d.descricao_md) / 200 DESC, d.numero LIMIT 30`).map((l) => l.numero)
  let maior = ''
  for (const n of numeros) {
    const t = await texto(db, equipe, 'ler_demanda', { numero: n })
    if (t.length > maior.length) maior = t
  }
  m('lerDemanda', `ler_demanda (a maior de ${numeros.length})`, maior)
  m('agenda7Dias', 'agenda de 7 dias (Rafa)', await texto(db, equipe, 'agenda', {}))
  m('resumoCliente', 'resumo_cliente CLA (Pri)', await texto(db, atendimento, 'resumo_cliente', { cliente: 'CLA' }))
  m('listarClientes', 'listar clientes', await texto(db, equipe, 'listar', { tipo: 'clientes' }))
  return medidas
}

export function tabela(medidas: Medida[]): string {
  const linhas = medidas.map((x) => `${x.caracteres <= x.teto ? 'ok    ' : 'PASSOU'}  ${x.rotulo.padEnd(34)} ${String(x.caracteres).padStart(6)} car. `
    + `≈ ${String(Math.round(x.caracteres / POR_TOKEN)).padStart(5)} tokens  (teto ${x.teto})`)
  return linhas.join('\n')
}

if (import.meta.main) {
  configurar({ log: false, segredo: randomBytes(32).toString('base64url'), appUrl: 'https://demandas.meltcomunicacao.com.br' })
  const i = process.argv.indexOf('--demandas')
  const antes = relogioFixado()
  const db = await bancoDoSeed({ demandas: i > 0 ? Number(process.argv[i + 1]) : undefined })
  const medidas = await medir(db)
  fixarRelogio(antes)
  console.log(tabela(medidas))
  process.exit(medidas.every((x) => x.caracteres <= x.teto) ? 0 : 1)
}
