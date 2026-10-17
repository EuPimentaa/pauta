/**
 * Criação rápida no rodapé da coluna (API.md §4.13): "HE: Carrossel @rafa" → cliente HE, membro Rafa, título
 * "Carrossel". Puro: o servidor cria com isto (POST /api/demandas/rapida) e o front desenha a prévia ao vivo e os
 * chips com o MESMO código, então o que a pessoa vê é o que nasce.
 *
 * Marcadores (casamento exato, sem caixa e sem acento):
 * - cliente, no começo: `HE:`, `[HE]`, `HE -` (o apelido inteiro, até com espaço: `hospital evangelico:`); `[HE]` vale
 *   também no meio do texto. Só o primeiro conta;
 * - membro, em qualquer lugar: `@rafa` (o apelido da pessoa ativa; sem apelido, o primeiro nome, se não for de outra).
 * O que não casa continua no título. Sigla no formato de marcador (1 a 12 de A–Z e 0–9, como foi digitada) que não
 * casa nenhum apelido vira `siglaNova` ("Criar cliente XYZ") e o texto fica no título. `HE outubro` (sem os dois
 * pontos) e `15:30` (sem espaço depois dos dois pontos) não são marcadores.
 */
import type { AnaliseRapida, MarcadorRapida } from '../tipos/demandas.ts'
import type { Id } from '../tipos/nucleo.ts'
import { normalizarAlias } from './texto.ts'

export interface ClienteRapida {
  id: Id
  sigla: string
  /** Normalizados (minúsculo, sem acento); a sigla pode vir junto ou não. */
  apelidos: readonly string[]
}

export interface PessoaRapida {
  id: Id
  nome: string
  apelido: string | null
  ativo: boolean
}

export interface ColunaRapida {
  nome: string
  /** Coluna de uma pessoa: ela entra como membro (o servidor põe sozinho; a prévia mostra). */
  responsavelId: Id | null
}

/** O que a análise consulta: mapas prontos (monte uma vez com montarContextoRapida e reuse a cada tecla). */
export interface ContextoRapida {
  /** Apelido normalizado → cliente. */
  clientes: ReadonlyMap<string, Id>
  /** Chave da pessoa (apelido ou primeiro nome, normalizado e sem espaços) → pessoa ativa. */
  pessoas: ReadonlyMap<string, Id>
  /** Sigla do cliente, para a prévia. */
  siglaDe(id: Id): string | null
  /** Apelido (ou primeiro nome) da pessoa, para a prévia; null se não está ativa. */
  nomeDe(id: Id): string | null
}

/** Chave de @menção: minúsculo, sem acento, sem espaços. */
export function chaveDeMencao(s: string): string {
  return normalizarAlias(s).replace(/\s+/g, '')
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? ''

/** Como a pessoa aparece na prévia e no chip: o apelido; sem apelido, o primeiro nome. */
export function nomeCurto(p: Pick<PessoaRapida, 'nome' | 'apelido'>): string {
  return p.apelido?.trim() || primeiroNome(p.nome)
}

/**
 * Os mapas da análise. Pessoas: o apelido de cada pessoa ativa; o primeiro nome entra só para quem não tem apelido e
 * quando ninguém mais usa a mesma chave (chave repetida não casa ninguém: melhor ficar no título do que errar a pessoa).
 */
export function montarContextoRapida(clientes: readonly ClienteRapida[], pessoas: readonly PessoaRapida[]): ContextoRapida {
  const porAlias = new Map<string, Id>()
  const siglas = new Map<Id, string>()
  for (const c of clientes) {
    siglas.set(c.id, c.sigla)
    for (const a of [normalizarAlias(c.sigla), ...c.apelidos.map(normalizarAlias)]) if (a && !porAlias.has(a)) porAlias.set(a, c.id)
  }

  const ativos = pessoas.filter((p) => p.ativo)
  const contagem = new Map<string, number>()
  const chaves: { chave: string; id: Id; forte: boolean }[] = []
  for (const p of ativos) {
    const apelido = p.apelido?.trim()
    const chave = chaveDeMencao(apelido || primeiroNome(p.nome))
    if (!chave) continue
    chaves.push({ chave, id: p.id, forte: !!apelido })
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  const porChave = new Map<string, Id>()
  for (const k of chaves) if (contagem.get(k.chave) === 1) porChave.set(k.chave, k.id)

  const nomes = new Map(ativos.map((p) => [p.id, nomeCurto(p)]))
  return {
    clientes: porAlias,
    pessoas: porChave,
    siglaDe: (id) => siglas.get(id) ?? null,
    nomeDe: (id) => nomes.get(id) ?? null,
  }
}

const SIGLA_FORMATO = /^[A-Z0-9]{1,12}$/
/** Palavras em maiúsculas que aparecem como marcador sem ser cliente ("[URGENTE] Banner", "OBS: ..."). */
export const NAO_SAO_SIGLA: ReadonlySet<string> = new Set([
  'URGENTE', 'OBS', 'OK', 'PDF', 'PNG', 'JPG', 'URL', 'TODO', 'NOVO', 'NOVA', 'HOJE', 'FYI', 'IMPORTANTE', 'ATENCAO', 'AVISO',
])
const SIGLA = { test: (s: string) => SIGLA_FORMATO.test(s) && !NAO_SAO_SIGLA.has(s) }
/** Começo do texto: [X] · X: (com espaço ou fim depois) · X - (hífen entre espaços). */
const INICIO: RegExp[] = [
  /^\[([^\]\n]{1,80})\]/,
  /^([^\s:[\]@][^:\n[\]@]{0,79}?)\s*:(?=\s|$)/,
  /^([^\s[\]@-][^\n[\]@]{0,79}?)\s+[-–—](?=\s|$)/,
]
const COLCHETES = /\[([^\]\n]{1,80})\]/g
const MENCAO = /(^|[\s(,;])@([\p{L}\p{N}][\p{L}\p{N}._-]*)/gu

interface Trecho { inicio: number; fim: number }

/**
 * Analisa uma linha da criação rápida. `clienteIdContexto` = o cliente de um filtro de um só cliente no quadro (o
 * marcador no texto vence). `coluna` = onde a demanda vai nascer (a pessoa da coluna entra como membro na prévia).
 */
export function analisarRapida(texto: string, ctx: ContextoRapida, opcoes: {
  clienteIdContexto?: Id | null
  coluna?: ColunaRapida | null
} = {}): AnaliseRapida {
  const marcadores: MarcadorRapida[] = []
  const remover: Trecho[] = []
  let clienteId: Id | null = null
  let siglaNova: string | null = null

  // cliente no começo
  const inicio = texto.length - texto.trimStart().length
  const resto = texto.slice(inicio)
  for (const re of INICIO) {
    const m = re.exec(resto)
    if (!m) continue
    const candidato = m[1]!.trim()
    const id = ctx.clientes.get(normalizarAlias(candidato))
    if (id) {
      clienteId = id
      marcadores.push({ tipo: 'cliente', texto: m[0], inicio, fim: inicio + m[0].length, id })
      remover.push({ inicio, fim: inicio + m[0].length })
      break
    }
    if (siglaNova === null && SIGLA.test(candidato)) siglaNova = candidato
  }
  // [HE] no meio do texto
  if (!clienteId) {
    for (const m of texto.matchAll(COLCHETES)) {
      const candidato = m[1]!.trim()
      const id = ctx.clientes.get(normalizarAlias(candidato))
      const ini = m.index!
      if (id) {
        clienteId = id
        marcadores.push({ tipo: 'cliente', texto: m[0], inicio: ini, fim: ini + m[0].length, id })
        remover.push({ inicio: ini, fim: ini + m[0].length })
        break
      }
      if (siglaNova === null && SIGLA.test(candidato)) siglaNova = candidato
    }
  }
  if (clienteId) siglaNova = null

  // @pessoas
  const membroIds: Id[] = []
  for (const m of texto.matchAll(MENCAO)) {
    const nome = m[2]!.replace(/[._-]+$/, '')
    const id = ctx.pessoas.get(chaveDeMencao(nome))
    if (!id) continue
    const ini = m.index! + m[1]!.length
    const fim = ini + 1 + nome.length
    if (!membroIds.includes(id)) membroIds.push(id)
    marcadores.push({ tipo: 'membro', texto: texto.slice(ini, fim), inicio: ini, fim, id })
    remover.push({ inicio: ini, fim })
  }
  marcadores.sort((a, b) => a.inicio - b.inicio)

  // título: o texto sem os marcadores casados
  let titulo = texto
  for (const t of [...remover].sort((a, b) => b.inicio - a.inicio)) titulo = `${titulo.slice(0, t.inicio)} ${titulo.slice(t.fim)}`
  titulo = titulo.replace(/\s+/g, ' ').replace(/^[\s:,;–—-]+/, '').replace(/[\s,;–—-]+$/, '').trim().slice(0, 500)

  const cliente = clienteId ?? opcoes.clienteIdContexto ?? null
  const todos = [...membroIds]
  const daColuna = opcoes.coluna?.responsavelId ?? null
  if (daColuna && !todos.includes(daColuna) && ctx.nomeDe(daColuna) !== null) todos.push(daColuna)

  const partes: string[] = []
  const sigla = cliente ? ctx.siglaDe(cliente) : null
  if (sigla) partes.push(sigla)
  for (const id of todos) {
    const n = ctx.nomeDe(id)
    if (n) partes.push(n)
  }
  // na coluna de uma pessoa, o nome dela já está como membro: "ICC · Caio", não "ICC · Caio · Caio"
  if (opcoes.coluna?.nome && !partes.some((p) => normalizarAlias(p) === normalizarAlias(opcoes.coluna!.nome))) partes.push(opcoes.coluna.nome)

  return { titulo, clienteId: cliente, membroIds: todos, marcadores, siglaNova, previa: partes.join(' · ') }
}

/**
 * Texto do marcador de cliente para remontar a linha a partir dos chips (o front guarda o cliente como chip e manda o
 * texto de volta ao servidor): a sigla com dois pontos, que sempre casa.
 */
export function marcadorDeCliente(sigla: string): string {
  return `${sigla}:`
}
