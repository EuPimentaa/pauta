/**
 * Busca de demandas (API.md §4.13, GET /api/busca; a fonte Demandas da paleta Cmd+K):
 * - `#4521` ou `4521` → o número exato primeiro;
 * - as primeiras palavras iguais a um apelido de cliente ("he", "hospital evangelico") filtram o cliente;
 * - o resto vai ao FTS5 (título e descrição) por prefixo, sem acento ("acao" acha "Ação");
 * - nunca a anonimizada (nem pelo número); arquivadas e de quadro arquivado só com `incluirArquivadas`.
 * Ordem: abertas, depois concluídas, depois arquivadas; dentro de cada grupo, a relevância (título pesa mais).
 * O trecho é texto puro (Markdown e menções tirados) em volta do termo, quando ele está só na descrição.
 */
import type { BuscaConsulta, BuscaSaida, Id, ResultadoBuscaDemanda } from '../../../shared/tipos/index.ts'
import { normalizarAlias } from '../../../shared/logica/texto.ts'
import { todos, um, type Db } from '../db.ts'

export const LIMITE_BUSCA = 20

interface LinhaBusca {
  id: string
  numero: number
  titulo: string
  descricao_md: string
  cliente_id: string | null
  quadro_id: string
  coluna_id: string
  concluida_em: string | null
  arquivado_em: string | null
  quadro_arquivado_em: string | null
}

const COLUNAS = `d.id, d.numero, d.titulo, d.descricao_md, d.cliente_id, d.quadro_id, d.coluna_id, d.concluida_em, d.arquivado_em,
  q.arquivado_em AS quadro_arquivado_em`

/** Termos do FTS: só letras e números (nada de sintaxe do FTS5 vinda da pessoa). */
export function termosDaBusca(texto: string): string[] {
  return texto.split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}]+/gu, '')).filter(Boolean).slice(0, 8)
}

/** Texto puro de um Markdown (para o trecho): sem títulos, ênfases, citações, listas, links e menções. */
export function markdownParaTexto(md: string): string {
  // os escapes (\* \_ ...) viram caracteres reservados antes de tirar a sintaxe e voltam no fim
  return md
    .replace(/\\([\\`*_[\]~<>|#+\-.!()])/g, (_, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)))
    .replace(/@\[([^\]\n]{1,120})\]\(mencao:[A-Za-z0-9-]{1,64}\)/g, '@$1')
    .replace(/\[([^\]\n]*)\]\((?:[^)\s]*)\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>+|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|~~|`+)/g, '')
    .replace(/(^|[\s(])[*_](\S)/g, '$1$2')
    .replace(/(\S)[*_](?=[\s).,;:!?]|$)/g, '$1')
    .replace(/[-]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normaliza guardando, para cada caractere normalizado, a posição no original (o trecho corta no texto de verdade). */
function normalizarComMapa(s: string): { n: string; mapa: number[] } {
  let n = ''
  const mapa: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    for (const x of c) {
      n += x
      mapa.push(i)
    }
  }
  return { n, mapa }
}

/** Trecho em volta do primeiro termo (prefixo de palavra) que aparece no texto; null se nenhum aparece. */
export function trechoCom(texto: string, termos: string[]): string | null {
  if (!texto || termos.length === 0) return null
  const { n, mapa } = normalizarComMapa(texto)
  let pos = -1
  for (const t of termos) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${normalizarAlias(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u')
    const m = re.exec(n)
    if (m && (pos < 0 || m.index + m[1]!.length < pos)) pos = m.index + m[1]!.length
  }
  if (pos < 0) return null
  const ini = mapa[pos]!
  let de = Math.max(0, ini - 40)
  let ate = Math.min(texto.length, ini + 100)
  if (de > 0) { const esp = texto.indexOf(' ', de); if (esp >= 0 && esp < ini) de = esp + 1 }
  if (ate < texto.length) { const esp = texto.lastIndexOf(' ', ate); if (esp > ini) ate = esp }
  return `${de > 0 ? '…' : ''}${texto.slice(de, ate).trim()}${ate < texto.length ? '…' : ''}`
}

/** As primeiras palavras (até 4) que formam um apelido de cliente: o cliente e quantas palavras usou. */
function clienteDoComeco(db: Db, palavras: string[]): { clienteId: Id; usadas: number } | null {
  for (let k = Math.min(4, palavras.length); k >= 1; k--) {
    const alias = normalizarAlias(palavras.slice(0, k).join(' '))
    if (!alias) continue
    const l = um<{ cliente_id: string }>(db, 'SELECT cliente_id FROM cliente_alias WHERE alias_norm = ?', alias)
    if (l) return { clienteId: l.cliente_id, usadas: k }
  }
  return null
}

function resultado(l: LinhaBusca, termos: string[]): ResultadoBuscaDemanda {
  const tituloTem = termos.length > 0 && trechoCom(l.titulo, termos) !== null
  return {
    id: l.id, numero: l.numero, titulo: l.titulo, clienteId: l.cliente_id, quadroId: l.quadro_id, colunaId: l.coluna_id,
    concluida: l.concluida_em !== null, arquivado: l.arquivado_em !== null || l.quadro_arquivado_em !== null,
    trecho: tituloTem ? null : trechoCom(markdownParaTexto(l.descricao_md), termos),
  }
}

/** GET /api/busca (até 20). */
export function buscarDemandas(db: Db, c: BuscaConsulta): BuscaSaida {
  const texto = c.q.trim()
  const limite = Math.min(LIMITE_BUSCA, Math.max(1, c.limite ?? LIMITE_BUSCA))
  if (!texto) return { demandas: [] }

  const filtros: string[] = ['d.excluido_em IS NULL']
  const params: unknown[] = []
  if (!c.incluirArquivadas) filtros.push('d.arquivado_em IS NULL', 'q.arquivado_em IS NULL')
  if (c.quadroId) { filtros.push('d.quadro_id = ?'); params.push(c.quadroId) }
  const ordem = '(d.arquivado_em IS NOT NULL OR q.arquivado_em IS NOT NULL), (d.concluida_em IS NOT NULL)'

  const achadas: LinhaBusca[] = []
  const ja = new Set<string>()
  const juntar = (ls: LinhaBusca[]) => { for (const l of ls) if (!ja.has(l.id) && achadas.length < limite) { ja.add(l.id); achadas.push(l) } }

  // número exato primeiro
  const num = /^#?(\d{1,9})$/.exec(texto)
  if (num) {
    juntar(todos<LinhaBusca>(db, `SELECT ${COLUNAS} FROM demanda d JOIN quadro q ON q.id = d.quadro_id
      WHERE d.numero = ? AND ${filtros.join(' AND ')}`, Number(num[1]), ...params))
    if (texto.startsWith('#')) return { demandas: achadas.map((l) => resultado(l, [])) }
  }

  const palavras = texto.split(/\s+/)
  const cliente = num ? null : clienteDoComeco(db, palavras)
  const termos = termosDaBusca((cliente ? palavras.slice(cliente.usadas) : palavras).join(' '))
  const filtrosCliente = cliente ? [...filtros, 'd.cliente_id = ?'] : filtros
  const paramsCliente = cliente ? [...params, cliente.clienteId] : params

  if (termos.length > 0) {
    const consulta = termos.map((t) => `"${t}"*`).join(' AND ')
    juntar(todos<LinhaBusca>(db, `
      SELECT ${COLUNAS} FROM demanda_fts JOIN demanda d ON d.numero = demanda_fts.rowid JOIN quadro q ON q.id = d.quadro_id
       WHERE demanda_fts MATCH ? AND ${filtrosCliente.join(' AND ')}
       ORDER BY ${ordem}, bm25(demanda_fts, 8.0, 1.0), d.numero DESC LIMIT ?`, consulta, ...paramsCliente, limite + ja.size))
  } else if (cliente) {
    juntar(todos<LinhaBusca>(db, `SELECT ${COLUNAS} FROM demanda d JOIN quadro q ON q.id = d.quadro_id
      WHERE ${filtrosCliente.join(' AND ')} ORDER BY ${ordem}, d.atualizado_em DESC LIMIT ?`, ...paramsCliente, limite))
  }
  return { demandas: achadas.map((l) => resultado(l, termos)) }
}
