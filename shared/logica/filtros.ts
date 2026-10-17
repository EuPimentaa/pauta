/**
 * Filtros do quadro (e da Lista e do Calendário dele) na URL `?f=` (PLANO §2; FiltrosQuadro em shared/tipos/quadros.ts).
 * Puro: o quadro do NÚCLEO-WEB e a Lista/Calendário do F6 usam o mesmo código.
 *
 * - Campos são E entre si; listas são OU dentro do campo (`membros: [a, b]` = tem a ou b).
 * - `?f=` = base64url (sem `=`) do JSON dos filtros normalizados; filtro vazio = sem o parâmetro.
 * - JSON inválido, base64 quebrado ou valor fora das listas fechadas viram filtro vazio (ou caem só aquele campo).
 *
 *   const f = decodificarFiltros(params.get('f'))
 *   const visiveis = aplicarFiltros(demandas, f, { euId, agora, colunas, clientes })
 *   params.set('f', codificarFiltros({ ...f, soMinhas: true }))
 */
import type { ClienteResumo } from '../tipos/clientes.ts'
import type { Demanda } from '../tipos/demandas.ts'
import { PRIORIDADES, type Id, type Prioridade } from '../tipos/nucleo.ts'
import { FILTROS_PRAZO, type Coluna, type FiltroPrazo, type FiltrosQuadro } from '../tipos/quadros.ts'
import { hojeSP, segundaDaSemana, somarDias } from './datas.ts'
import { estadoPrazo } from './prazo.ts'
import { comQuemEsta, ehMinha } from './quadro.ts'
import { normalizarAlias } from './texto.ts'

export const CONCLUIDAS_FILTRO = ['mostrar', 'esconder', 'so'] as const
type FiltroConcluidas = (typeof CONCLUIDAS_FILTRO)[number]

/** Tamanho máximo do texto guardado na URL. */
export const TEXTO_FILTRO_MAX = 120
/** Itens por lista (um `?f=` gigante colado à mão não trava a tela). */
const LISTA_MAX = 200

export interface ContextoFiltros {
  /** "Só as minhas": sou membro ou o AM. */
  euId: Id
  agora: Date
  /** Papel da coluna de cada demanda (estado do prazo e "com o cliente"). Coluna desconhecida conta como 'normal'. */
  colunas: ReadonlyMap<Id, Pick<Coluna, 'papel'>>
  /** Para o texto casar a sigla e o nome do cliente. */
  clientes?: ReadonlyMap<Id, Pick<ClienteResumo, 'sigla' | 'nome'>>
}

// ─────────────────────────────── normalizar ───────────────────────────────

function listaDeTexto(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const itens = [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64))]
  return itens.length ? itens.slice(0, LISTA_MAX) : undefined
}

/**
 * Tira o que não filtra (falso, vazio, padrão) e o que não é válido. Duas formas do mesmo filtro dão o mesmo
 * objeto (a URL não muda à toa e "Limpar" sabe quando não há nada).
 */
export function normalizarFiltros(f: unknown): FiltrosQuadro {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return {}
  const e = f as Record<string, unknown>
  const saida: FiltrosQuadro = {}
  if (e.soMinhas === true) saida.soMinhas = true
  const clientes = listaDeTexto(e.clientes)
  if (clientes) saida.clientes = clientes
  const membros = listaDeTexto(e.membros)
  if (membros) saida.membros = membros
  const etiquetas = listaDeTexto(e.etiquetas)
  if (etiquetas) saida.etiquetas = etiquetas
  if (typeof e.prazo === 'string' && (FILTROS_PRAZO as readonly string[]).includes(e.prazo)) saida.prazo = e.prazo as FiltroPrazo
  if (Array.isArray(e.prioridades)) {
    const p = PRIORIDADES.filter((x) => (e.prioridades as unknown[]).includes(x))
    if (p.length) saida.prioridades = p
  }
  if (e.comCliente === true) saida.comCliente = true
  if (e.concluidas === 'esconder' || e.concluidas === 'so') saida.concluidas = e.concluidas
  if (typeof e.texto === 'string' && e.texto.trim()) saida.texto = e.texto.slice(0, TEXTO_FILTRO_MAX)
  return saida
}

/** Algum filtro ativo. */
export function temFiltros(f: FiltrosQuadro): boolean {
  return Object.keys(normalizarFiltros(f)).length > 0
}

/** Quantos campos estão filtrando (o "Filtros (3)" e o contador do Limpar). */
export function contarFiltros(f: FiltrosQuadro): number {
  return Object.keys(normalizarFiltros(f)).length
}

// ─────────────────────────────── URL ───────────────────────────────

function paraBase64Url(texto: string): string {
  let binario = ''
  for (const b of new TextEncoder().encode(texto)) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const binario = atob(b64)
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)))
}

/** `?f=`: base64url do JSON normalizado; '' quando não há filtro (tire o parâmetro). */
export function codificarFiltros(f: FiltrosQuadro): string {
  const n = normalizarFiltros(f)
  return Object.keys(n).length ? paraBase64Url(JSON.stringify(n)) : ''
}

/** Lê `?f=`. Ausente, quebrado ou inválido: filtro vazio. */
export function decodificarFiltros(s: string | null | undefined): FiltrosQuadro {
  if (!s || s.length > 8000 || !/^[A-Za-z0-9_-]+$/.test(s)) return {}
  try {
    return normalizarFiltros(JSON.parse(deBase64Url(s)))
  } catch {
    return {}
  }
}

// ─────────────────────────────── aplicar ───────────────────────────────

/**
 * Prazo (estadoPrazo, API.md §5.2), sempre sobre as abertas: 'atrasado' = estado 'atrasada' (com o cliente nunca é);
 * 'hoje' = prazo hoje; 'semana' = de hoje até domingo desta semana; 'sem_prazo' = sem prazo.
 */
function casaPrazo(d: Demanda, filtro: FiltroPrazo, coluna: Pick<Coluna, 'papel'>, agora: Date, hoje: string): boolean {
  if (d.concluidaEm) return false
  switch (filtro) {
    case 'atrasado': return estadoPrazo(d, coluna, agora) === 'atrasada'
    case 'hoje': return d.prazo === hoje
    case 'semana': return d.prazo !== null && d.prazo >= hoje && d.prazo <= somarDias(segundaDaSemana(hoje), 6)
    case 'sem_prazo': return d.prazo === null
  }
}

/** Pontuação que junta as partes de uma palavra ("e-mail", "d'água", "v1.2"). */
const JUNTA = /['’.\-]/g
/** O resto da pontuação separa ("HE: post", "post/stories"). */
const SEPARA = /[^\p{L}\p{N}#]+/u

/**
 * Termos digitados (sem acento, sem caixa): "#12" e "12" casam o número; "e-mail" vira "email"; pontuação separa
 * ("HE: carrossel" = "he" e "carrossel"). Um "#" sozinho (meio da digitação de "#12") não filtra.
 */
function termosDe(texto: string): string[] {
  return normalizarAlias(texto).replace(JUNTA, '').split(SEPARA).filter((t) => t && t !== '#')
}

/**
 * As palavras de onde os termos podem começar: o título, a sigla e o nome do cliente, com as partes de uma palavra
 * composta juntas e separadas ("pós-venda" casa "posvenda", "pos" e "venda"; "e-mail" casa "email" e "mail").
 */
function palavrasDoAlvo(texto: string): string[] {
  const base = normalizarAlias(texto)
  return [...new Set([...base.split(/[^\p{L}\p{N}]+/u), ...base.replace(JUNTA, '').split(/[^\p{L}\p{N}]+/u)].filter(Boolean))]
}

/** Cada termo começa alguma palavra (o número da demanda conta como palavra); todos os termos precisam casar. */
function casaTexto(d: Demanda, termos: string[], ctx: ContextoFiltros): boolean {
  const cliente = d.clienteId ? ctx.clientes?.get(d.clienteId) : undefined
  const palavras = palavrasDoAlvo(`${d.titulo} ${cliente ? `${cliente.sigla} ${cliente.nome}` : ''}`)
  const numero = String(d.numero)
  return termos.every((t) => {
    const n = t.startsWith('#') ? t.slice(1).replace(/#/g, '') : t.replace(/#/g, '')
    if (!n) return true
    if (/^\d+$/.test(n) && numero.startsWith(n)) return true
    return t.startsWith('#') && /^\d+$/.test(n) ? false : palavras.some((p) => p.startsWith(n))
  })
}

function casaLista(ids: readonly Id[], lista: readonly string[], nenhum: string): boolean {
  if (ids.length === 0) return lista.includes(nenhum)
  return ids.some((id) => lista.includes(id))
}

/** As demandas que passam em todos os campos, na ordem de entrada. */
export function aplicarFiltros(demandas: readonly Demanda[], filtros: FiltrosQuadro, ctx: ContextoFiltros): Demanda[] {
  const f = normalizarFiltros(filtros)
  if (Object.keys(f).length === 0) return [...demandas]
  const hoje = hojeSP(ctx.agora)
  const termos = f.texto ? termosDe(f.texto) : []
  const prioridades = f.prioridades ? new Set<Prioridade>(f.prioridades) : null
  const clientes = f.clientes ? new Set(f.clientes) : null
  const concluidas: FiltroConcluidas = f.concluidas ?? 'mostrar'
  const papel = (d: Demanda) => ctx.colunas.get(d.colunaId) ?? { papel: 'normal' as const }
  return demandas.filter((d) => {
    if (f.soMinhas && !ehMinha(d, ctx.euId)) return false
    if (clientes && !(d.clienteId && clientes.has(d.clienteId))) return false
    if (f.membros && !casaLista(d.membroIds, f.membros, 'nenhum')) return false
    if (f.etiquetas && !casaLista(d.etiquetaIds, f.etiquetas, 'nenhuma')) return false
    if (f.prazo && !casaPrazo(d, f.prazo, papel(d), ctx.agora, hoje)) return false
    if (prioridades && !prioridades.has(d.prioridade)) return false
    if (f.comCliente && comQuemEsta(d, papel(d)) !== 'cliente') return false
    if (concluidas === 'esconder' && d.concluidaEm) return false
    if (concluidas === 'so' && !d.concluidaEm) return false
    if (termos.length && !casaTexto(d, termos, ctx)) return false
    return true
  })
}
