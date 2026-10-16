/**
 * Chips da criação rápida (puro; os testes do servidor importam). O campo guarda o texto livre e os marcadores já
 * reconhecidos viram chips quando a pessoa digita o espaço depois deles (`HE: `, `@rafa `): assim um apelido que ainda
 * está sendo digitado (`@raf`) não vira chip antes da hora, e o marcador devolvido pelo Backspace volta como texto.
 * A linha enviada ao servidor é remontada dos chips (marcadores que sempre casam) e do texto.
 */
import type { Id } from '../../../../shared/tipos/index.ts'
import { chaveDeMencao, type ContextoRapida } from '../../../../shared/logica/rapida.ts'
import { normalizarAlias } from '../../../../shared/logica/texto.ts'

export interface ChipRapida {
  tipo: 'cliente' | 'membro'
  id: Id
  /** Texto que volta ao campo no Backspace e que vai na linha ao servidor ("HE:", "@rafa"). */
  marcador: string
}

/** Linha para POST /api/demandas/rapida: o cliente na frente, o texto, as pessoas no fim. */
export function comporLinha(chips: readonly ChipRapida[], texto: string): string {
  const cliente = chips.find((c) => c.tipo === 'cliente')
  const pessoas = chips.filter((c) => c.tipo === 'membro')
  return [cliente?.marcador ?? '', texto.trim(), ...pessoas.map((p) => p.marcador)].filter(Boolean).join(' ')
}

/** Marcador de pessoa que casa (a chave do contexto); null para quem não tem chave única (dois "Bruno" sem apelido). */
export function marcadorDaPessoa(ctx: ContextoRapida, id: Id): string | null {
  for (const [chave, pessoa] of ctx.pessoas) if (pessoa === id) return `@${chave}`
  return null
}

export function marcadorDoCliente(ctx: ContextoRapida, id: Id): string | null {
  const sigla = ctx.siglaDe(id)
  return sigla ? `${sigla}:` : null
}

const CLIENTE_ANTES: RegExp[] = [
  /^(\s*)\[([^\]\n]{1,80})\]$/,
  /^(\s*)([^\s:[\]@][^:\n[\]@]{0,79}?)\s*:$/,
  /^(\s*)([^\s[\]@-][^\n[\]@]{0,79}?)\s+[-–—]$/,
]
const COLCHETE_ANTES = /(^|\s)\[([^\]\n]{1,80})\]$/
const PESSOA_ANTES = /(^|[\s(,;])@([\p{L}\p{N}][\p{L}\p{N}._-]*)$/u

export interface Reconhecido {
  chip: ChipRapida
  /** O texto sem o marcador e o cursor no lugar dele. */
  texto: string
  cursor: number
}

/**
 * A pessoa acabou de digitar um espaço em `cursor - 1`: o que está logo antes é um marcador completo? Pessoa em
 * qualquer lugar; cliente só no começo do texto (ou entre colchetes) e só se ainda não há chip de cliente.
 */
export function reconhecerAoDigitarEspaco(texto: string, cursor: number, ctx: ContextoRapida, jaTemCliente: boolean): Reconhecido | null {
  if (cursor < 1 || !/\s/.test(texto[cursor - 1] ?? '')) return null
  const antes = texto.slice(0, cursor - 1)
  const depois = texto.slice(cursor)
  const p = PESSOA_ANTES.exec(antes)
  if (p) {
    const nome = p[2]!.replace(/[._-]+$/, '')
    const id = ctx.pessoas.get(chaveDeMencao(nome))
    if (!id) return null
    const ini = p.index + p[1]!.length
    return { chip: { tipo: 'membro', id, marcador: `@${chaveDeMencao(nome)}` }, texto: antes.slice(0, ini) + depois, cursor: ini }
  }
  if (jaTemCliente) return null
  for (const re of CLIENTE_ANTES) {
    const m = re.exec(antes)
    if (!m) continue
    const id = ctx.clientes.get(normalizarAlias(m[2]!))
    if (!id) continue
    return { chip: { tipo: 'cliente', id, marcador: marcadorDoCliente(ctx, id) ?? `${m[2]!.trim()}:` }, texto: depois.replace(/^\s+/, ''), cursor: 0 }
  }
  const c = COLCHETE_ANTES.exec(antes)
  if (c) {
    const id = ctx.clientes.get(normalizarAlias(c[2]!))
    if (id) {
      const ini = c.index + c[1]!.length
      return { chip: { tipo: 'cliente', id, marcador: marcadorDoCliente(ctx, id) ?? `[${c[2]}]` }, texto: antes.slice(0, ini) + depois, cursor: ini }
    }
  }
  return null
}

/** "@ra|" com o cursor logo depois: o começo da menção (posição do @) e o que já foi digitado. */
export function mencaoEmAndamento(texto: string, cursor: number): { inicio: number; termo: string } | null {
  const m = /(^|[\s(,;])@([\p{L}\p{N}._-]*)$/u.exec(texto.slice(0, cursor))
  if (!m) return null
  return { inicio: m.index + m[1]!.length, termo: m[2]! }
}

/**
 * Cliente sendo digitado no começo ("he|", "hosp|"): os clientes cujo apelido ou sigla começa assim (Tab completa).
 * Só antes de qualquer espaço e sem chip de cliente.
 */
export function clientesEmAndamento(texto: string, cursor: number, clientes: readonly { id: Id; sigla: string; nome: string; apelidos: readonly string[] }[]):
  { id: Id; sigla: string; nome: string }[] {
  const antes = texto.slice(0, cursor)
  if (!/^\S{2,12}$/.test(antes) || antes !== texto.trimEnd().slice(0, cursor) || /[@:[\]]/.test(antes)) return []
  const n = normalizarAlias(antes)
  return clientes.filter((c) => [normalizarAlias(c.sigla), ...c.apelidos].some((a) => a.startsWith(n))).slice(0, 5)
}

/** Linhas não vazias de um texto colado (várias linhas = uma demanda por linha). */
export function linhasColadas(texto: string): string[] {
  return texto.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•–]|\d{1,3}[.)])\s+/u, '').trim()).filter(Boolean)
}
