/**
 * Arquivo (API.md §4.19, F5): tudo o que saiu do quadro. Arquivadas e concluídas há mais de quadroConcluidasDias
 * (mesmo sem arquivar), mais recentes primeiro por coalesce(arquivado_em, concluida_em), com cursor.
 * A consulta repete o WHERE dos índices parciais demanda_arquivo_ix e demanda_arquivo_cli_ix (o SQLite só usa índice
 * parcial quando o termo aparece na consulta). Anonimizadas (excluido_em) nunca aparecem.
 *
 * Texto (`q`): "#12" ou "12" acha pelo número; o começo pode ser o apelido ou a sigla do cliente ("he outubro",
 * "hospital evangelico carrossel"); o resto procura no título e na descrição (FTS5 por prefixo, sem acento).
 */
import type { Demanda, Id, ListarArquivoConsulta, Pagina } from '../../../shared/tipos/index.ts'
import { instanteSP } from '../../../shared/logica/datas.ts'
import { normalizarAlias } from '../../../shared/logica/texto.ts'
import { agoraData, marcadores, todos, um, type Db } from '../db.ts'
import { validacao } from '../erros.ts'
import { lerConfig } from './config-app.ts'
import { SQL_PROXIMA_DESFEITA, carregarDemandas } from './demandas.ts'

const QUANDO = 'coalesce(d.arquivado_em, d.concluida_em)'

/** Cursor opaco: base64url de [instante, número] do último item da página. */
function codificarCursor(instante: string, numero: number): string {
  return Buffer.from(JSON.stringify([instante, numero])).toString('base64url')
}

function decodificarCursor(cursor: string): [string, number] {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && Number.isInteger(v[1])) return [v[0], v[1] as number]
  } catch { /* cai no erro abaixo */ }
  throw validacao('Cursor inválido.', { cursor: 'cursor inválido' })
}

/** Primeiro instante do mês em São Paulo e o do mês seguinte. */
function limitesDoMes(mes: string): [string, string] {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  const seguinte = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
  return [instanteSP(`${mes}-01`, '00:00').toISOString(), instanteSP(`${seguinte}-01`, '00:00').toISOString()]
}

/**
 * Termo do FTS5 para cada pedaço de letras e números (aspas protegem a sintaxe; * = prefixo), cortado como o
 * tokenizador corta: "pós-venda" vira "pós" e "venda". Pontuação solta ("#", "-") e caracteres de controle saem (o NUL
 * dentro das aspas truncava a consulta e dava 500).
 */
export function termosFts(palavras: string[]): string | null {
  const termos = palavras.flatMap((p) => p.split(/[^\p{L}\p{N}]+/u)).filter(Boolean).map((p) => `"${p}"*`)
  return termos.length ? termos.join(' AND ') : null
}

/**
 * O cliente pelo começo do texto: o maior prefixo de palavras que é apelido (ou sigla) de um cliente.
 * Devolve o cliente e as palavras que sobram.
 */
function clienteNoComeco(db: Db, palavras: string[]): { clienteId: Id | null; resto: string[] } {
  for (let n = Math.min(palavras.length, 6); n >= 1; n--) {
    const alias = palavras.slice(0, n).join(' ')
    const l = um<{ cliente_id: string }>(db, 'SELECT cliente_id FROM cliente_alias WHERE alias_norm = ?', alias)
    if (l) return { clienteId: l.cliente_id, resto: palavras.slice(n) }
  }
  return { clienteId: null, resto: palavras }
}

export function listarArquivo(db: Db, c: ListarArquivoConsulta): Pagina<Demanda> {
  const limite = c.limite ?? 50
  const corte = new Date(agoraData().getTime() - lerConfig(db).quadroConcluidasDias * 86_400_000).toISOString()
  const onde = [
    'd.excluido_em IS NULL AND (d.arquivado_em IS NOT NULL OR d.concluida_em IS NOT NULL)',
    '(d.arquivado_em IS NOT NULL OR d.concluida_em <= ?)',
    // a próxima da repetição que o Desfazer do concluir arquivou só volta concluindo a original de novo
    `NOT ${SQL_PROXIMA_DESFEITA}`,
  ]
  const params: unknown[] = [corte]
  if (c.clienteId) { onde.push('d.cliente_id = ?'); params.push(c.clienteId) }
  if (c.quadroId) { onde.push('d.quadro_id = ?'); params.push(c.quadroId) }
  if (c.mes) {
    const [de, ate] = limitesDoMes(c.mes)
    onde.push(`${QUANDO} >= ? AND ${QUANDO} < ?`)
    params.push(de, ate)
  }
  const texto = c.q ? normalizarAlias(c.q) : ''
  if (texto) {
    const numero = /^#?(\d{1,9})$/.exec(texto)
    if (numero) {
      onde.push('d.numero = ?')
      params.push(Number(numero[1]))
    } else {
      const { clienteId, resto } = clienteNoComeco(db, texto.split(' '))
      if (clienteId) { onde.push('d.cliente_id = ?'); params.push(clienteId) }
      const fts = termosFts(resto)
      if (fts) { onde.push('d.numero IN (SELECT rowid FROM demanda_fts WHERE demanda_fts MATCH ?)'); params.push(fts) }
    }
  }
  if (c.cursor) {
    const [instante, numero] = decodificarCursor(c.cursor)
    onde.push(`(${QUANDO} < ? OR (${QUANDO} = ? AND d.numero < ?))`)
    params.push(instante, instante, numero)
  }
  const linhas = todos<{ id: string; quando: string; numero: number }>(db, `
    SELECT d.id, ${QUANDO} AS quando, d.numero FROM demanda d WHERE ${onde.join(' AND ')}
     ORDER BY ${QUANDO} DESC, d.numero DESC LIMIT ?`, ...params, limite + 1)
  const pagina = linhas.slice(0, limite)
  const itens = pagina.length
    ? carregarDemandas(db, `d.id IN (${marcadores(pagina.length)})`, pagina.map((l) => l.id), `${QUANDO} DESC, d.numero DESC`)
    : []
  const ultima = pagina.at(-1)
  return { itens, proximo: linhas.length > limite && ultima ? codificarCursor(ultima.quando, ultima.numero) : null }
}
