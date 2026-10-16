/**
 * Editor de Markdown com TipTap (StarterKit + Mention), carregado sob demanda por ui/EditorMarkdown.tsx.
 * Entra Markdown (convertido pelo mesmo caminho seguro do componente Markdown) e sai Markdown (editor/serializar.ts).
 * injectCSS: false — o CSS fica em estilos/editor.css, que viaja neste chunk.
 */
import '../../estilos/editor.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import { Bold, Code, Heading2, Italic, Link2, List, ListOrdered, Quote, Strikethrough } from 'lucide-react'
import { raizCamadas } from '../../lib/camadas.ts'
import { cx } from '../../lib/classes.ts'
import { calcularPosicao } from '../../lib/posicao.ts'
import { Avatar } from '../Avatar.tsx'
import { BotaoIcone } from '../Botao.tsx'
import { Campo } from '../Campo.tsx'
import { Popover } from '../Popover.tsx'
import { markdownParaHtmlSeguro, RE_ID_MENCAO } from '../Markdown.tsx'
import type { PessoaMencao, PropsEditorMarkdown } from '../EditorMarkdown.tsx'
import { paraMarkdown, type NoJson } from './serializar.ts'

const RE_URL = /^(https:|mailto:)/i

interface EstadoSugestao {
  itens: PessoaMencao[]
  comando: (p: { id: string; label: string }) => void
  retangulo: DOMRect | null
}

const MencaoMelt = Mention.extend({
  parseHTML() {
    return [{
      tag: 'span[data-mencao]',
      getAttrs: (el) => {
        const id = (el as HTMLElement).getAttribute('data-mencao') ?? ''
        if (!RE_ID_MENCAO.test(id)) return false
        return { id, label: ((el as HTMLElement).textContent ?? '').replace(/^@/, '') }
      },
    }]
  },
})

export default function EditorInterno({
  valor, aoMudar, aoSalvar, aoCancelar, buscarPessoas, placeholder = 'Escreva aqui…', rotulo, autoFoco, desabilitado,
  semBarra, minLinhas = 4, className,
}: PropsEditorMarkdown) {
  const [sugestao, setSugestao] = useState<EstadoSugestao | null>(null)
  const [ativa, setAtiva] = useState(0)
  const estadoSug = useRef({ sugestao, ativa })
  estadoSug.current = { sugestao, ativa }
  const ultimoMd = useRef(valor)
  const callbacks = useRef({ aoMudar, aoSalvar, aoCancelar, buscarPessoas })
  callbacks.current = { aoMudar, aoSalvar, aoCancelar, buscarPessoas }

  const extensoes = useMemo(() => [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      underline: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https', isAllowedUri: (url) => RE_URL.test(url) },
    }),
    MencaoMelt.configure({
      HTMLAttributes: { class: 'ui-mencao' },
      renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
      renderHTML: ({ node }) => ['span', { class: 'ui-mencao', 'data-mencao': node.attrs.id }, `@${node.attrs.label ?? node.attrs.id}`],
      suggestion: {
        char: '@',
        items: async ({ query }) => (await callbacks.current.buscarPessoas?.(query)) ?? [],
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, [
            { type: 'mention', attrs: { id: props.id, label: props.label } }, { type: 'text', text: ' ' },
          ]).run()
        },
        render: () => ({
          onStart: (p: SuggestionProps<PessoaMencao>) => { setAtiva(0); setSugestao({ itens: p.items, comando: p.command as EstadoSugestao['comando'], retangulo: p.clientRect?.() ?? null }) },
          onUpdate: (p: SuggestionProps<PessoaMencao>) => { setAtiva(0); setSugestao({ itens: p.items, comando: p.command as EstadoSugestao['comando'], retangulo: p.clientRect?.() ?? null }) },
          onKeyDown: ({ event }: SuggestionKeyDownProps) => {
            const { sugestao: s, ativa: a } = estadoSug.current
            if (!s || s.itens.length === 0) return false
            if (event.key === 'ArrowDown') { setAtiva((a + 1) % s.itens.length); return true }
            if (event.key === 'ArrowUp') { setAtiva((a - 1 + s.itens.length) % s.itens.length); return true }
            if (event.key === 'Enter' || event.key === 'Tab') { escolherPessoa(s, s.itens[a]); return true }
            if (event.key === 'Escape') { setSugestao(null); return true }
            return false
          },
          onExit: () => setSugestao(null),
        }),
      },
    }),
  ], [])

  const editor = useEditor({
    extensions: extensoes,
    injectCSS: false,
    editable: !desabilitado,
    autofocus: autoFoco ? 'end' : false,
    content: markdownParaHtmlSeguro(valor),
    editorProps: {
      attributes: {
        class: 'ui-editor-texto',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': rotulo,
        style: `--min-linhas: ${minLinhas}`,
      },
      handleKeyDown: (_view, e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { callbacks.current.aoSalvar?.(); return true }
        if (e.key === 'Escape' && !estadoSug.current.sugestao && callbacks.current.aoCancelar) { callbacks.current.aoCancelar(); return true }
        return false
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = paraMarkdown(ed.getJSON() as NoJson)
      ultimoMd.current = md
      callbacks.current.aoMudar(md)
    },
  })

  // valor trocado de fora (outra pessoa salvou, mescla do 409): recarrega sem perder o foco
  useEffect(() => {
    if (!editor || valor === ultimoMd.current) return
    ultimoMd.current = valor
    editor.commands.setContent(markdownParaHtmlSeguro(valor), { emitUpdate: false })
  }, [editor, valor])

  useEffect(() => { editor?.setEditable(!desabilitado) }, [editor, desabilitado])

  function escolherPessoa(s: EstadoSugestao, p: PessoaMencao | undefined) {
    if (!p) return
    s.comando({ id: p.id, label: p.apelido || p.nome.split(' ')[0] })
    setSugestao(null)
  }

  // lido a cada transação (inclusive o setContent do valor trocado de fora, que não emite update nem renderiza): sem
  // isso o texto de ajuda ficava por cima do texto novo até a próxima tecla
  const vazioNoEditor = useEditorState({ editor, selector: ({ editor: ed }) => ed?.isEmpty ?? null })
  const vazio = vazioNoEditor ?? !valor
  return (
    <div className={cx('ui-editor', className)} data-desabilitado={desabilitado || undefined}>
      {!semBarra && editor && <Barra editor={editor} />}
      <div className="ui-editor-area">
        {vazio && <div className="ui-editor-placeholder" aria-hidden="true">{placeholder}</div>}
        <EditorContent editor={editor} />
      </div>
      {sugestao && sugestao.retangulo && createPortal(
        <ListaPessoas estado={sugestao} ativa={ativa} aoEscolher={(p) => escolherPessoa(sugestao, p)} aoApontar={setAtiva} />,
        raizCamadas(),
      )}
    </div>
  )
}

function ListaPessoas({ estado, ativa, aoEscolher, aoApontar }: { estado: EstadoSugestao; ativa: number; aoEscolher(p: PessoaMencao): void; aoApontar(i: number): void }) {
  const r = estado.retangulo!
  const pos = calcularPosicao({ x: r.left, y: r.top, largura: r.width, altura: r.height }, { largura: 260, altura: Math.min(280, 44 * Math.max(1, estado.itens.length) + 10) })
  return (
    <div className="ui-popover ui-lista vidro" role="listbox" aria-label="Pessoas para mencionar" style={{ left: pos.x, top: pos.y, width: 260 }}>
      {estado.itens.length === 0 && <div className="ui-lista-vazia">Ninguém com esse nome.</div>}
      {estado.itens.map((p, i) => (
        <div key={p.id} role="option" aria-selected={i === ativa} className="ui-opcao" data-ativa={i === ativa || undefined}
          onPointerDown={(e) => e.preventDefault()} onPointerMove={() => aoApontar(i)} onClick={() => aoEscolher(p)}>
          <Avatar pessoa={p} tamanho={24} dica={false} />
          <span className="min-w-0 truncate">{p.nome}</span>
          {p.apelido && <span className="ui-opcao-detalhe">@{p.apelido}</span>}
        </div>
      ))}
    </div>
  )
}

function Barra({ editor }: { editor: Editor }) {
  const [, forcar] = useState(0)
  useEffect(() => {
    const atualizar = () => forcar((n) => n + 1)
    editor.on('transaction', atualizar)
    return () => { editor.off('transaction', atualizar) }
  }, [editor])
  const [link, setLink] = useState<{ aberto: boolean; url: string }>({ aberto: false, url: '' })
  const [ancoraLink, setAncoraLink] = useState<HTMLButtonElement | null>(null)
  const botoes = [
    { rotulo: 'Negrito', icone: Bold, atalho: 'mod+b', ativo: editor.isActive('bold'), acao: () => editor.chain().focus().toggleBold().run() },
    { rotulo: 'Itálico', icone: Italic, atalho: 'mod+i', ativo: editor.isActive('italic'), acao: () => editor.chain().focus().toggleItalic().run() },
    { rotulo: 'Riscado', icone: Strikethrough, atalho: 'mod+shift+s', ativo: editor.isActive('strike'), acao: () => editor.chain().focus().toggleStrike().run() },
    { rotulo: 'Código', icone: Code, atalho: 'mod+e', ativo: editor.isActive('code'), acao: () => editor.chain().focus().toggleCode().run() },
    { rotulo: 'Título', icone: Heading2, ativo: editor.isActive('heading'), acao: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { rotulo: 'Lista', icone: List, atalho: 'mod+shift+8', ativo: editor.isActive('bulletList'), acao: () => editor.chain().focus().toggleBulletList().run() },
    { rotulo: 'Lista numerada', icone: ListOrdered, atalho: 'mod+shift+7', ativo: editor.isActive('orderedList'), acao: () => editor.chain().focus().toggleOrderedList().run() },
    { rotulo: 'Citação', icone: Quote, atalho: 'mod+shift+b', ativo: editor.isActive('blockquote'), acao: () => editor.chain().focus().toggleBlockquote().run() },
  ]
  const urlValida = RE_URL.test(link.url.trim())
  function aplicarLink() {
    if (!urlValida) return
    editor.chain().focus().extendMarkRange('link').setLink({ href: link.url.trim() }).run()
    setLink({ aberto: false, url: '' })
  }
  return (
    <div className="ui-editor-barra" role="toolbar" aria-label="Formatação">
      {botoes.map((b) => (
        <BotaoIcone key={b.rotulo} icone={b.icone} rotulo={b.rotulo} atalho={b.atalho} tamanho="p" aria-pressed={b.ativo}
          onMouseDown={(e) => e.preventDefault()} onClick={b.acao} />
      ))}
      <BotaoIcone ref={setAncoraLink} icone={Link2} rotulo={editor.isActive('link') ? 'Tirar link' : 'Link'} tamanho="p"
        aria-pressed={editor.isActive('link')} onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (editor.isActive('link')) editor.chain().focus().unsetLink().run()
          else setLink({ aberto: true, url: 'https://' })
        }} />
      <Popover aberto={link.aberto} aoFechar={() => setLink({ aberto: false, url: '' })} ancora={ancoraLink} titulo="Link" largura={320}>
        <form className="ui-popover-corpo flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); aplicarLink() }}>
          <Campo rotulo="Endereço" value={link.url} onChange={(e) => setLink({ aberto: true, url: e.target.value })} data-autofocus
            erro={link.url && link.url !== 'https://' && !urlValida ? 'Use um endereço https:// ou mailto:.' : undefined} />
          <div className="flex justify-end">
            <button type="submit" className="ui-botao" data-variante="secundario" data-tamanho="p" disabled={!urlValida}>Aplicar</button>
          </div>
        </form>
      </Popover>
    </div>
  )
}
