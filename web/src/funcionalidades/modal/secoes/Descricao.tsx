/**
 * Descrição (seção principal 100): Markdown seguro para ler; clique (ou Enter) edita no EditorMarkdown com @menção.
 * Salva com Ctrl+Enter, no "Salvar" ou ao sair do editor; Esc descarta. Edita sobre o rev de quando começou: se outra
 * pessoa salvou no meio, o núcleo mescla (409) e avisa. "Texto original (WhatsApp)" fica recolhido, como texto puro.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ChevronRight, MessageSquareText, TextQuote } from 'lucide-react'
import type { Demanda } from '@shared/tipos/index.ts'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { useAcoes } from '../../../api/demandas.ts'
import { Botao } from '../../../ui/Botao.tsx'
import { EditorMarkdown } from '../../../ui/EditorMarkdown.tsx'
import { EsqueletoLinhas } from '../../../ui/Indicadores.tsx'
import { Kbd } from '../../../ui/Kbd.tsx'
import { TextoPuro } from '../../../ui/Texto.tsx'
import { Secao, useBuscarPessoas, useEscLocal } from '../comum.tsx'

const Markdown = lazy(() => import('../../../ui/Markdown.tsx').then((m) => ({ default: m.Markdown })))

/** O foco saiu para fora do bloco (e não para uma camada aberta por ele, como o popover de link do editor). */
function saiuDe(bloco: HTMLElement | null, alvo: EventTarget | null): boolean {
  if (!(alvo instanceof Node)) return true
  if (bloco?.contains(alvo)) return false
  return !(alvo instanceof Element && alvo.closest('.ui-popover, .ui-lista, .ui-folha'))
}

export default function Descricao({ ctx }: { ctx: ContextoDemanda }) {
  const acoes = useAcoes()
  const buscarPessoas = useBuscarPessoas()
  const [editando, setEditando] = useState<{ base: Demanda; texto: string } | null>(null)
  const bloco = useRef<HTMLDivElement>(null)
  const salvando = useRef(false)
  const texto = ctx.detalhe?.descricaoMd ?? ''

  // outra demanda (←/→ no modal): descarta a edição desta
  useEffect(() => { setEditando(null) }, [ctx.demanda.id])
  // Esc salva e fecha o editor (como sair dele); "Cancelar" descarta
  const salvarRef = useRef(async () => {})
  useEscLocal(!!editando, () => { void salvarRef.current() })

  if (!ctx.detalhe) {
    return <Secao id="descricao" icone={TextQuote} titulo="Descrição"><EsqueletoLinhas linhas={3} /></Secao>
  }

  function comecar() {
    if (ctx.somenteLeitura) return
    salvando.current = false
    setEditando({ base: ctx.demanda, texto })
  }

  salvarRef.current = salvar
  async function salvar() {
    if (!editando || salvando.current) return
    salvando.current = true
    const novo = editando.texto.replace(/\s+$/, '')
    setEditando(null)
    if (novo !== texto.replace(/\s+$/, '')) await acoes.editar(editando.base, { descricaoMd: novo })
  }

  return (
    <Secao id="descricao" icone={TextQuote} titulo="Descrição"
      acoes={!editando && !ctx.somenteLeitura && texto.trim() ? <Botao variante="ghost" tamanho="p" onClick={comecar}>Editar</Botao> : undefined}>
      {editando ? (
        <div ref={bloco} className="flex flex-col gap-2"
          onBlur={(e) => { if (saiuDe(bloco.current, e.relatedTarget)) void salvar() }}>
          <EditorMarkdown valor={editando.texto} aoMudar={(md) => setEditando((x) => (x ? { ...x, texto: md } : x))}
            aoSalvar={() => void salvar()}
            buscarPessoas={buscarPessoas} rotulo="Descrição" autoFoco minLinhas={6}
            placeholder="Briefing, referências e o que precisa ficar pronto. Use @ para chamar alguém." />
          <div className="mdl-editor-rodape">
            <Botao variante="secundario" tamanho="p" onMouseDown={(e) => e.preventDefault()} onClick={() => void salvar()}>Salvar</Botao>
            <Botao variante="ghost" tamanho="p" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { salvando.current = true; setEditando(null) }}>Cancelar</Botao>
            <span className="mdl-editor-dica"><Kbd teclas="mod+enter" /> ou <Kbd teclas="esc" /> salvam</span>
          </div>
        </div>
      ) : texto.trim() ? (
        ctx.somenteLeitura ? (
          <Suspense fallback={<EsqueletoLinhas linhas={3} />}><Markdown texto={texto} euId={ctx.eu.usuario.id} /></Suspense>
        ) : (
          // clique no texto edita (como no Trello); os links do texto continuam abrindo. No teclado: o "Editar" do topo
          <div className="mdl-descricao-ler" title="Clique para editar"
            onClick={(e) => { if (!(e.target as Element).closest('a') && !window.getSelection()?.toString()) comecar() }}>
            <Suspense fallback={<EsqueletoLinhas linhas={3} />}><Markdown texto={texto} euId={ctx.eu.usuario.id} /></Suspense>
          </div>
        )
      ) : ctx.somenteLeitura ? (
        <p className="mdl-vazio">Sem descrição.</p>
      ) : (
        <button type="button" className="mdl-descricao-vazia" onClick={comecar}>
          Adicione o briefing, as referências e o que precisa ficar pronto. Use @ para chamar alguém.
        </button>
      )}
      {ctx.detalhe.origemTexto && (
        <details className="mdl-original">
          <summary>
            <ChevronRight className="mdl-seta" aria-hidden="true" />
            <MessageSquareText aria-hidden="true" />
            Texto original (WhatsApp)
          </summary>
          <TextoPuro texto={ctx.detalhe.origemTexto} />
        </details>
      )}
    </Secao>
  )
}
