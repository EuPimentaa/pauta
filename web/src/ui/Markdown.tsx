/**
 * Markdown seguro (docs/API.md §5.8), o ÚNICO jeito de mostrar Markdown no app:
 * - markdown-it com html:false (HTML cru vira texto), sem imagens e sem tabelas;
 * - menção `@[Nome](mencao:<id>)` vira <span data-mencao="<id>">@Nome</span> por uma regra do markdown-it, ANTES do
 *   DOMPurify, só quando o id casa ^[A-Za-z0-9-]{1,64}$ (senão fica texto); `mencao:` nunca vira link;
 * - DOMPurify com a allowlist p, br, strong, em, s, code, pre, blockquote, ul, ol, li, h1–h3, hr, a + span[data-mencao];
 *   atributos só href e data-mencao; URI só https: e mailto:; links com rel="noopener noreferrer nofollow ugc" e
 *   target="_blank".
 * O resultado (um DocumentFragment saneado) vira elementos React: nada de dangerouslySetInnerHTML.
 *
 *   <Markdown texto={demanda.descricaoMd} />
 *   <Markdown texto={comentario.textoMd} compacto euId={eu.usuario.id} />
 */
import '../estilos/markdown.css'
import { createElement, Fragment, useMemo, type ReactNode } from 'react'
import MarkdownIt, { type Token } from 'markdown-it'
import DOMPurify from 'dompurify'
import { cx } from '../lib/classes.ts'

export const RE_ID_MENCAO = /^[A-Za-z0-9-]{1,64}$/
const RE_URI = /^(https:|mailto:)/i
const TAGS = ['p', 'br', 'strong', 'em', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'hr', 'a', 'span'] as const
const REL = 'noopener noreferrer nofollow ugc'

// ─────────────────────────────── markdown-it ───────────────────────────────

const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false })
md.disable(['image', 'table'])

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Troca [Nome](mencao:id) por um token 'mencao' (com o "@" que vem antes) ou por texto. */
md.core.ruler.push('mencao', (estado) => {
  for (const bloco of estado.tokens) {
    if (bloco.type !== 'inline' || !bloco.children) continue
    const filhos = bloco.children
    const saida: Token[] = []
    for (let i = 0; i < filhos.length; i++) {
      const t = filhos[i]
      const href = t.type === 'link_open' ? String(t.attrGet('href') ?? '') : ''
      if (t.type !== 'link_open' || !/^mencao:/i.test(href)) { saida.push(t); continue }
      // junta o texto até o link_close
      let nome = ''
      let j = i + 1
      for (; j < filhos.length && filhos[j].type !== 'link_close'; j++) nome += filhos[j].content
      const id = href.slice('mencao:'.length)
      const anterior = saida[saida.length - 1]
      const comArroba = anterior?.type === 'text' && anterior.content.endsWith('@')
      if (comArroba && RE_ID_MENCAO.test(id)) {
        anterior.content = anterior.content.slice(0, -1)
        const m = new estado.Token('mencao', '', 0)
        m.meta = { id, nome }
        saida.push(m)
      } else {
        const texto = new estado.Token('text', '', 0)
        texto.content = nome
        saida.push(texto)
      }
      i = j
    }
    bloco.children = saida
  }
})
md.renderer.rules.mencao = (tokens, idx) => {
  const { id, nome } = tokens[idx].meta as { id: string; nome: string }
  return `<span data-mencao="${escapar(id)}">@${escapar(nome)}</span>`
}

// ─────────────────────────────── DOMPurify (instância própria) ───────────────────────────────

let purificador: ReturnType<typeof DOMPurify> | null = null

function sanear(html: string): DocumentFragment {
  if (!purificador) {
    purificador = DOMPurify(window)
    purificador.addHook('afterSanitizeAttributes', (no) => {
      if (no.tagName === 'A' && no.getAttribute('href')) {
        no.setAttribute('rel', REL)
        no.setAttribute('target', '_blank')
      }
      if (no.tagName === 'SPAN' && !RE_ID_MENCAO.test(no.getAttribute('data-mencao') ?? '')) no.removeAttribute('data-mencao')
    })
  }
  return purificador.sanitize(html, {
    ALLOWED_TAGS: [...TAGS],
    ALLOWED_ATTR: ['href', 'data-mencao'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: RE_URI,
    // sem isto o DOMPurify exige que o VALOR de todo atributo fora da lista de URI seguras case o ALLOWED_URI_REGEXP
    // (e o id da menção não é https:); o hook acima confere o id com RE_ID_MENCAO
    ADD_URI_SAFE_ATTR: ['data-mencao'],
    RETURN_DOM_FRAGMENT: true,
  })
}

/** Markdown → fragmento de DOM saneado (as verificações de /dev/ui inspecionam). Para exibir, use <Markdown>. */
export function markdownParaFragmento(texto: string): DocumentFragment {
  return sanear(md.render(texto))
}

/** Markdown → HTML saneado (string), para o editor carregar o texto. Para exibir, use <Markdown>. */
export function markdownParaHtmlSeguro(texto: string): string {
  const div = document.createElement('div')
  div.appendChild(markdownParaFragmento(texto))
  return div.innerHTML
}

// ─────────────────────────────── DOM saneado → React ───────────────────────────────

function paraReact(no: Node, chave: string, euId: string | undefined): ReactNode {
  if (no.nodeType === Node.TEXT_NODE) return no.textContent
  if (no.nodeType !== Node.ELEMENT_NODE) return null
  const el = no as Element
  const tag = el.tagName.toLowerCase()
  const filhos = Array.from(el.childNodes, (f, i) => paraReact(f, `${chave}.${i}`, euId))
  if (!(TAGS as readonly string[]).includes(tag)) return createElement(Fragment, { key: chave }, ...filhos)
  if (tag === 'a') {
    const href = el.getAttribute('href') ?? ''
    if (!RE_URI.test(href)) return createElement(Fragment, { key: chave }, ...filhos)
    return createElement('a', { key: chave, href, target: '_blank', rel: REL }, ...filhos)
  }
  if (tag === 'span') {
    const id = el.getAttribute('data-mencao') ?? ''
    if (!RE_ID_MENCAO.test(id)) return createElement(Fragment, { key: chave }, ...filhos)
    return createElement('span', { key: chave, className: 'ui-mencao', 'data-mencao': id, 'data-eu': id === euId || undefined }, ...filhos)
  }
  if (tag === 'br' || tag === 'hr') return createElement(tag, { key: chave })
  return createElement(tag, { key: chave }, ...filhos)
}

export interface PropsMarkdown {
  texto: string
  /** Comentários e cards: letra 12 e menos respiro. */
  compacto?: boolean
  /** Destaca as menções a mim. */
  euId?: string
  className?: string
}

export function Markdown({ texto, compacto, euId, className }: PropsMarkdown) {
  const conteudo = useMemo(() => {
    const frag = sanear(md.render(texto ?? ''))
    return Array.from(frag.childNodes, (n, i) => paraReact(n, String(i), euId))
  }, [texto, euId])
  return <div className={cx('ui-md', className)} data-compacto={compacto || undefined}>{conteudo}</div>
}
