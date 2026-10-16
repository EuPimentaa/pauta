/**
 * Notação das teclas dos atalhos (extensoes/tipos.ts, Atalho.teclas) e o casamento com o KeyboardEvent:
 *   'shift+n'   'mod+k' (Ctrl, ou Cmd no Mac)   ','   'g a' (acorde: g e depois a)   'space'   '?'   'shift+\\'
 * Letras e teclas com nome (enter, escape, arrowup...) conferem Shift; símbolos (?, /, ",", ".") valem do jeito que o
 * teclado os produz (o "?" pede Shift em quase todo layout). A barra invertida casa pela posição física (no ABNT2 ela
 * fica ao lado do Z). Puro: sem DOM, para os testes.
 */

export interface Passo {
  tecla: string
  shift: boolean
  mod: boolean
  alt: boolean
}

/** O que o casamento lê do KeyboardEvent. */
export interface EventoTecla {
  key: string
  code: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

const NOMES: Record<string, string> = {
  esc: 'escape', espaco: 'space', ' ': 'space', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright',
  return: 'enter', del: 'delete',
}

/** 'g a' → [{tecla: 'g'}, {tecla: 'a'}]; 'mod+shift+k' → [{tecla: 'k', mod, shift}]. */
export function passosDe(teclas: string): Passo[] {
  return teclas.trim().split(/\s+/).map((acorde) => {
    // "shift++" e "+" não são usados; o "+" separa modificadores
    const partes = acorde.toLowerCase().split('+').filter(Boolean)
    const tecla = partes.at(-1) ?? ''
    const mods = new Set(partes.slice(0, -1))
    return { tecla: NOMES[tecla] ?? tecla, shift: mods.has('shift'), mod: mods.has('mod') || mods.has('ctrl') || mods.has('cmd'), alt: mods.has('alt') }
  })
}

const CODIGOS_BARRA = new Set(['Backslash', 'IntlBackslash', 'IntlRo'])
const ehLetraOuNome = (t: string) => /^[a-z0-9]$/.test(t) || t.length > 1

/** Nome normalizado da tecla do evento: 'n', 'space', 'arrowup', ',' etc. */
export function teclaDo(e: EventoTecla): string {
  if (e.code === 'Space' || e.key === ' ') return 'space'
  if (CODIGOS_BARRA.has(e.code) && (e.key === '\\' || e.key === '|')) return '\\'
  return e.key.toLowerCase()
}

export function casaPasso(p: Passo, e: EventoTecla, mac: boolean): boolean {
  const mod = mac ? e.metaKey : e.ctrlKey
  if (p.mod !== mod) return false
  if (!mac && e.metaKey && !p.mod) return false
  if (mac && e.ctrlKey) return false
  if (p.alt !== e.altKey) return false
  const t = teclaDo(e)
  if (p.tecla === '\\') return t === '\\' && p.shift === e.shiftKey
  if (ehLetraOuNome(p.tecla)) return t === p.tecla && p.shift === e.shiftKey
  // símbolo: vale como saiu do teclado
  return t === p.tecla
}

/** O primeiro passo usa Ctrl/Cmd ou Alt (vale até dentro de campo de texto e com os atalhos de uma tecla desligados). */
export function temModificador(teclas: string): boolean {
  const p = passosDe(teclas)[0]
  return !!p && (p.mod || p.alt)
}
