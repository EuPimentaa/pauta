/**
 * Rótulos de tecla para Tooltip, Kbd e menus. Notação do contrato (extensoes/tipos.ts, Atalho.teclas):
 * 'shift+n', 'mod+k' (Ctrl ou Cmd), ',', 'g a' (acorde), 'space'. Também aceita o texto livre "Shift+R".
 */
export const EH_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const NOMES: Record<string, string> = {
  mod: EH_MAC ? '⌘' : 'Ctrl', ctrl: EH_MAC ? '⌃' : 'Ctrl', cmd: '⌘', meta: EH_MAC ? '⌘' : 'Win', alt: EH_MAC ? '⌥' : 'Alt',
  shift: EH_MAC ? '⇧' : 'Shift', enter: 'Enter', esc: 'Esc', escape: 'Esc', space: 'Espaço', espaco: 'Espaço',
  tab: 'Tab', backspace: '⌫', delete: 'Del', up: '↑', down: '↓', left: '←', right: '→',
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
}

/** Sequência de acordes, cada um com as teclas: 'g a' → [['G'], ['A']]; 'mod+k' → [['Ctrl', 'K']]. */
export function partesTecla(teclas: string): string[][] {
  return teclas.trim().split(/\s+/).map((acorde) =>
    acorde.split('+').filter(Boolean).map((t) => {
      const n = NOMES[t.toLowerCase()]
      if (n) return n
      return t.length === 1 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1)
    }),
  )
}

/** Texto corrido para aria-keyshortcuts e leitores de tela: "Ctrl+K", "G depois A". */
export function rotuloTecla(teclas: string): string {
  return partesTecla(teclas).map((a) => a.join('+')).join(' depois ')
}

/** Para aria-keyshortcuts (formato da especificação: "Control+K"). */
export function ariaTecla(teclas: string): string {
  return teclas.trim().split(/\s+/).map((acorde) => acorde.split('+').map((t) => {
    const l = t.toLowerCase()
    if (l === 'mod') return EH_MAC ? 'Meta' : 'Control'
    if (l === 'shift') return 'Shift'
    if (l === 'alt') return 'Alt'
    if (l === 'space') return 'Space'
    return t.length === 1 ? t.toUpperCase() : t
  }).join('+')).join(' ')
}

/** Campo de texto em foco: atalhos de uma letra não valem aqui. */
export function emCampoDeTexto(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const tipo = (el as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(tipo)
  }
  return el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'textbox'
}
