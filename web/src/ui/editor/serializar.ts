/**
 * JSON do editor (ProseMirror, nós do StarterKit + Mention) → Markdown, o formato guardado no banco (ADAPTACOES).
 * Cobre o que o componente Markdown mostra: parágrafo, títulos 1–3, negrito, itálico, riscado, código, bloco de
 * código, citação, listas, régua, quebra de linha, link e menção `@[Nome](mencao:<id>)`.
 */
export interface NoJson {
  type: string
  attrs?: Record<string, unknown>
  content?: NoJson[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

/** Escapa o que o markdown-it leria como sintaxe dentro de texto corrido. */
export function escaparTexto(t: string): string {
  return t.replace(/([\\`*_[\]~])/g, '\\$1')
}

/** Escapa marcadores que só valem no começo da linha (#, >, -, +, 1.). */
function escaparInicio(linha: string): string {
  return linha
    .replace(/^(\s*)([#>+-])(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, '$1$2\\$3')
}

const ORDEM_MARCAS = ['link', 'bold', 'italic', 'strike', 'code'] as const
const ABRE: Record<string, string> = { bold: '**', italic: '*', strike: '~~' }

function inline(nos: NoJson[] | undefined): string {
  if (!nos) return ''
  let saida = ''
  let abertas: { type: string; attrs?: Record<string, unknown> }[] = []
  const fechar = (ate: number) => {
    while (abertas.length > ate) {
      const m = abertas.pop()!
      if (m.type === 'link') saida += `](${String(m.attrs?.href ?? '').replace(/[()\s]/g, (c) => (c === '(' ? '%28' : c === ')' ? '%29' : '%20'))})`
      else saida += ABRE[m.type] ?? ''
    }
  }
  for (const no of nos) {
    if (no.type === 'hardBreak') { fechar(0); saida += '\n'; continue }
    if (no.type === 'mention') {
      fechar(0)
      const id = String(no.attrs?.id ?? '')
      const nome = String(no.attrs?.label ?? id).replace(/[[\]]/g, '')
      saida += `@[${nome}](mencao:${id})`
      continue
    }
    if (no.type !== 'text' || !no.text) continue
    const marcas = (no.marks ?? [])
      .filter((m) => (ORDEM_MARCAS as readonly string[]).includes(m.type))
      .sort((a, b) => ORDEM_MARCAS.indexOf(a.type as never) - ORDEM_MARCAS.indexOf(b.type as never))
    const codigo = marcas.some((m) => m.type === 'code')
    const semCodigo = marcas.filter((m) => m.type !== 'code')
    // mantém o prefixo comum de marcas abertas; fecha o resto
    let comum = 0
    while (comum < abertas.length && comum < semCodigo.length && abertas[comum].type === semCodigo[comum].type
      && (abertas[comum].type !== 'link' || abertas[comum].attrs?.href === semCodigo[comum].attrs?.href)) comum++
    fechar(comum)
    for (const m of semCodigo.slice(comum)) {
      saida += m.type === 'link' ? '[' : ABRE[m.type] ?? ''
      abertas.push(m)
    }
    if (codigo) {
      const crases = no.text.includes('`') ? '``' : '`'
      saida += `${crases}${no.text}${crases}`
    } else {
      saida += escaparTexto(no.text)
    }
  }
  fechar(0)
  abertas = []
  return saida
}

function bloco(no: NoJson, prefixoLista = ''): string {
  switch (no.type) {
    case 'paragraph':
      return inline(no.content).split('\n').map(escaparInicio).join('\n')
    case 'heading': {
      const nivel = Math.min(3, Math.max(1, Number(no.attrs?.level ?? 1)))
      return `${'#'.repeat(nivel)} ${inline(no.content).replace(/\n/g, ' ')}`
    }
    case 'blockquote':
      return blocos(no.content).split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')
    case 'codeBlock': {
      const texto = (no.content ?? []).map((t) => t.text ?? '').join('')
      const cerca = texto.includes('```') ? '~~~' : '```'
      return `${cerca}${String(no.attrs?.language ?? '')}\n${texto}\n${cerca}`
    }
    case 'horizontalRule':
      return '---'
    case 'bulletList':
    case 'orderedList': {
      const inicio = Number(no.attrs?.start ?? 1)
      return (no.content ?? []).map((item, i) => {
        const marcador = no.type === 'bulletList' ? '- ' : `${inicio + i}. `
        const recuo = ' '.repeat(marcador.length)
        const corpo = blocos(item.content, prefixoLista + recuo)
        return corpo.split('\n').map((l, j) => (j === 0 ? marcador + l : l ? recuo + l : l)).join('\n')
      }).join('\n')
    }
    default:
      return inline(no.content)
  }
}

function blocos(nos: NoJson[] | undefined, prefixoLista = ''): string {
  if (!nos) return ''
  return nos.map((n) => bloco(n, prefixoLista)).join('\n\n')
}

/** Documento do editor → Markdown (sem espaços sobrando no fim). */
export function paraMarkdown(doc: NoJson): string {
  return blocos(doc.content).replace(/\n{3,}/g, '\n\n').trimEnd()
}
