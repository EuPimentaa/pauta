/**
 * Comentários | Atividade (seção principal 500). O compositor tem @menção, Ctrl+Enter, prints colados (Ctrl+V vira
 * anexo do comentário) e "Visível ao cliente" só para atendimento e admin; o rascunho fica no aparelho. Comentários
 * mais novos primeiro, com Responder, Editar (o autor) e Excluir (o autor ou o admin). A aba Atividade é o histórico
 * tipado ("Rafa moveu de Fazendo para Revisão · há 2 h"), paginado.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react'
import {
  Archive, ArrowRightLeft, CheckCircle2, CircleCheck, Clock3, Eye, FileText, History, Layers, ListChecks, MessageSquare, Paperclip, Pencil,
  Send, Sparkles, Tag, Upload, Users, Wrench, X, type LucideIcon,
} from 'lucide-react'
import type { Anexo, Bootstrap, Comentario, Id } from '@shared/tipos/index.ts'
import { pode } from '@shared/logica/permissoes.ts'
import { fraseAtividade, type FraseAtividade } from '@shared/logica/modal-atividade.ts'
import { useQueryClient } from '@tanstack/react-query'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { chaves } from '../../../api/chaves.ts'
import { useDoBootstrap } from '../../../api/seletores.ts'
import { enviarArquivo, limiteUpload } from '../../../api/arquivos.ts'
import { abrirDialogo } from '../../../dialogos/estado.ts'
import { formatarData } from '../../../lib/datas.ts'
import { useLocal } from '../../../lib/armazenamento.ts'
import { Abas, painelAba } from '../../../ui/Abas.tsx'
import { Avatar } from '../../../ui/Avatar.tsx'
import { avisar } from '../../../ui/avisos.tsx'
import { Botao, BotaoIcone } from '../../../ui/Botao.tsx'
import { Checkbox } from '../../../ui/Checkbox.tsx'
import { EditorMarkdown } from '../../../ui/EditorMarkdown.tsx'
import { EsqueletoLinhas } from '../../../ui/Indicadores.tsx'
import { Kbd } from '../../../ui/Kbd.tsx'
import { useAcoesModal, useComentarios, useHistorico } from '../api.ts'
import { Secao, nomeCurto, quandoPorExtenso, tempoRelativo, useBuscarPessoas, useEscLocal, useNomeDaPessoa, useUsuarios } from '../comum.tsx'

const Markdown = lazy(() => import('../../../ui/Markdown.tsx').then((m) => ({ default: m.Markdown })))

const ICONES: Record<FraseAtividade['grupo'], LucideIcon> = {
  criacao: Sparkles, edicao: Pencil, movimento: ArrowRightLeft, conclusao: CircleCheck, pessoas: Users, etiquetas: Tag,
  arquivo: Archive, ciclo: Layers, entrega: Upload, envio: Send, visto: Eye, aprovacao: CheckCircle2, ajuste: Wrench,
  comentario: MessageSquare, anexo: Paperclip, checklist: ListChecks, tempo: Clock3,
}

// ─────────────────────────────── compositor ───────────────────────────────

function Compositor({ ctx, aberto, abrir, fechar, prefixo }: {
  ctx: ContextoDemanda; aberto: boolean; abrir(): void; fechar(): void; prefixo: string | null
}) {
  const acoes = useAcoesModal()
  const qc = useQueryClient()
  const buscarPessoas = useBuscarPessoas()
  // o id de quem escreve na chave: no mesmo navegador, outra pessoa não vê o rascunho (e o Sair apaga todos)
  const [rascunho, setRascunho] = useLocal<string>(`rascunho-comentario:${ctx.eu.usuario.id}:${ctx.demanda.id}`, '')
  const [visivel, setVisivel] = useState(false)
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [enviando, setEnviando] = useState(false)
  const [subindo, setSubindo] = useState(0)
  const eu = ctx.eu.usuario
  const podeCliente = pode('comentario.visivel_cliente', { id: eu.id, papel: eu.papel })
  // Esc fecha o compositor; o rascunho fica guardado
  useEscLocal(aberto, fechar)

  // "Responder": começa com a menção a quem escreveu
  useEffect(() => {
    // o espaço depois da menção é não separável: o Markdown carregado no editor perderia um espaço comum no fim
    if (prefixo && !rascunho.includes(prefixo)) setRascunho(`${prefixo}\u00a0${rascunho.trim()}`)
  }, [prefixo])

  async function colar(e: ClipboardEvent<HTMLDivElement>) {
    const arquivos = Array.from(e.clipboardData?.files ?? []).filter((f) => f.size > 0)
    if (!arquivos.length || e.clipboardData.getData('text/plain')) return
    e.preventDefault()
    setSubindo((n) => n + arquivos.length)
    for (const f of arquivos) {
      try {
        const info = await enviarArquivo(f, undefined, limiteUpload(qc))
        const a = await acoes.criarAnexo(ctx.demanda, { tipo: 'arquivo', arquivoId: info.id, nome: f.name || info.nome })
        if (a) setAnexos((l) => [...l, a])
      } catch (erro) {
        avisar('Não foi possível anexar o print.', { tipo: 'erro', descricao: (erro as Error).message })
      } finally {
        setSubindo((n) => n - 1)
      }
    }
  }

  async function comentar() {
    const corpo = rascunho.trim()
    if (!corpo || enviando) return
    setEnviando(true)
    const c = await acoes.comentar(ctx.demanda, corpo, { visivelCliente: visivel || undefined, anexoIds: anexos.map((a) => a.id) })
    setEnviando(false)
    if (c) {
      setRascunho('')
      setAnexos([])
      setVisivel(false)
      fechar()
    }
  }

  if (!aberto) {
    return (
      <div className="mdl-compositor">
        <Avatar pessoa={eu} tamanho={32} dica={false} />
        <button type="button" className="mdl-compositor-falso" onClick={abrir}>
          {rascunho.trim() ? 'Continuar o comentário…' : 'Escreva um comentário… Use @ para chamar alguém.'}
        </button>
      </div>
    )
  }
  return (
    <div className="mdl-compositor" onPaste={(e) => void colar(e)}>
      <Avatar pessoa={eu} tamanho={32} dica={false} />
      <div className="mdl-compositor-corpo">
        <EditorMarkdown valor={rascunho} aoMudar={setRascunho} aoSalvar={() => void comentar()} aoCancelar={fechar} autoFoco
          buscarPessoas={buscarPessoas} rotulo="Novo comentário" placeholder="Escreva um comentário… Use @ para chamar alguém." minLinhas={3} semBarra />
        {(anexos.length > 0 || subindo > 0) && (
          <div className="mdl-pendentes" aria-label="Anexos do comentário">
            {anexos.map((a) => (
              <span key={a.id} className="mdl-pendente">
                <Paperclip className="size-3.5 flex-none" aria-hidden="true" />
                <span>{a.nome}</span>
                <BotaoIcone icone={X} rotulo={`Tirar ${a.nome} do comentário`} tamanho="p" semDica
                  onClick={() => setAnexos((l) => l.filter((x) => x.id !== a.id))} />
              </span>
            ))}
            {subindo > 0 && <span className="mdl-pendente"><span>Enviando…</span></span>}
          </div>
        )}
        <div className="mdl-editor-rodape">
          <Botao variante="secundario" tamanho="p" icone={Send} onClick={() => void comentar()} carregando={enviando}
            disabled={!rascunho.trim() || subindo > 0} atalho="mod+enter">Comentar</Botao>
          <Botao variante="ghost" tamanho="p" onClick={fechar}>Fechar</Botao>
          {podeCliente && (
            <Checkbox checked={visivel} onChange={(e) => setVisivel(e.target.checked)} descricao="O cliente vê na página de aprovação.">
              Visível ao cliente
            </Checkbox>
          )}
          <span className="mdl-editor-dica">Cole um print com <Kbd teclas="mod+v" /></span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────── comentário ───────────────────────────────

function UmComentario({ c, ctx, responder }: { c: Comentario; ctx: ContextoDemanda; responder(c: Comentario): void }) {
  const acoes = useAcoesModal()
  const usuarios = useUsuarios()
  const buscarPessoas = useBuscarPessoas()
  const nomeDaPessoa = useNomeDaPessoa()
  const [editando, setEditando] = useState<string | null>(null)
  useEscLocal(editando !== null, () => setEditando(null))
  const autor = c.autorId ? usuarios.find((u) => u.id === c.autorId) : undefined
  const eu = ctx.eu.usuario
  const nome = autor ? autor.nome : (c.autorExterno ? `${c.autorExterno} (cliente)` : 'Alguém')
  const podeEditar = !ctx.somenteLeitura && pode('comentario.editar', { id: eu.id, papel: eu.papel }, { comentario: c })
  const podeExcluir = !ctx.somenteLeitura && pode('comentario.excluir', { id: eu.id, papel: eu.papel }, { comentario: c })

  async function salvar() {
    if (editando === null) return
    const t = editando.trim()
    setEditando(null)
    if (t && t !== c.corpoMd) await acoes.editarComentario(c, t)
  }

  async function excluir() {
    const ok = await abrirDialogo('confirmar', { titulo: 'Excluir este comentário?', mensagem: 'Não dá para desfazer.', confirmar: 'Excluir', perigo: true })
    if (ok) await acoes.excluirComentario(c)
  }

  return (
    <li className="mdl-comentario" data-cliente={c.visivelCliente || undefined} data-excluido={c.excluidoEm ? '' : undefined}>
      <Avatar pessoa={autor ?? { nome: c.autorExterno ?? '?', cor: 'grafite' }} tamanho={32} />
      <div className="min-w-0">
        <div className="mdl-comentario-cabeca">
          <span className="mdl-comentario-autor">{nome}</span>
          <span className="mdl-comentario-quando" title={quandoPorExtenso(c.criadoEm)}>
            {tempoRelativo(c.criadoEm)}{c.editadoEm && !c.excluidoEm ? ' · editado' : ''}
          </span>
          {c.visivelCliente && !c.excluidoEm && <span className="mdl-selo-cliente"><Eye aria-hidden="true" />Visível ao cliente</span>}
        </div>
        {c.excluidoEm ? (
          <div className="mdl-comentario-balao">Comentário excluído.</div>
        ) : editando !== null ? (
          <div className="mt-1 flex flex-col gap-2">
            <EditorMarkdown valor={editando} aoMudar={setEditando} aoSalvar={() => void salvar()} aoCancelar={() => setEditando(null)}
              buscarPessoas={buscarPessoas} rotulo="Editar comentário" autoFoco minLinhas={2} semBarra />
            <div className="mdl-editor-rodape">
              <Botao variante="secundario" tamanho="p" onClick={() => void salvar()}>Salvar</Botao>
              <Botao variante="ghost" tamanho="p" onClick={() => setEditando(null)}>Cancelar</Botao>
            </div>
          </div>
        ) : (
          <div className="mdl-comentario-balao">
            <Suspense fallback={<EsqueletoLinhas linhas={1} />}><Markdown texto={c.corpoMd} euId={eu.id} nomeDaPessoa={nomeDaPessoa} nivelBase={4} /></Suspense>
            {c.anexos.length > 0 && (
              <div className="mdl-comentario-anexos">
                {c.anexos.map((a) => (a.arquivo?.imagem ? (
                  <a key={a.id} href={a.arquivo.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${a.nome}`}>
                    <img src={a.arquivo.url} alt="" loading="lazy" />
                  </a>
                ) : (
                  <span key={a.id} className="mdl-pendente"><FileText className="size-3.5 flex-none" aria-hidden="true" /><span>{a.nome}</span></span>
                )))}
              </div>
            )}
          </div>
        )}
        {!c.excluidoEm && editando === null && !ctx.somenteLeitura && (
          <div className="mdl-comentario-acoes">
            {c.autorId && c.autorId !== eu.id && <button type="button" className="mdl-link" onClick={() => responder(c)}>Responder</button>}
            {podeEditar && <button type="button" className="mdl-link" onClick={() => setEditando(c.corpoMd)}>Editar</button>}
            {podeExcluir && <button type="button" className="mdl-link" data-perigo="" onClick={() => void excluir()}>Excluir</button>}
          </div>
        )}
      </div>
    </li>
  )
}

function ListaComentarios({ ctx, responder }: { ctx: ContextoDemanda; responder(c: Comentario): void }) {
  const q = useComentarios(ctx.demanda.id)
  const lista = useMemo(() => [...(q.data ?? [])].reverse(), [q.data])
  if (q.isPending) return <EsqueletoLinhas linhas={3} />
  if (q.isError) return <p className="mdl-vazio">Não foi possível carregar os comentários. <button type="button" className="mdl-link" onClick={() => void q.refetch()}>Tentar de novo</button></p>
  if (!lista.length) return <p className="mdl-vazio">Nenhum comentário ainda.</p>
  return <ul className="mdl-comentarios" aria-label="Comentários">{lista.map((c) => <UmComentario key={c.id} c={c} ctx={ctx} responder={responder} />)}</ul>
}

// ─────────────────────────────── atividade ───────────────────────────────

const selColunas = (b: Bootstrap) => b.colunas
const selQuadros = (b: Bootstrap) => b.quadros

function ListaAtividade({ ctx }: { ctx: ContextoDemanda }) {
  const q = useHistorico(ctx.demanda.id)
  const qc = useQueryClient()
  // a demanda mudou (aqui ou em outra janela): o histórico busca de novo, juntando as mudanças de 600 ms
  const primeira = useRef(true)
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return }
    const t = window.setTimeout(() => { void qc.invalidateQueries({ queryKey: chaves.historico(ctx.demanda.id) }) }, 600)
    return () => window.clearTimeout(t)
  }, [ctx.demanda, qc])
  const usuarios = useUsuarios()
  const colunas = useDoBootstrap(selColunas) ?? []
  const quadros = useDoBootstrap(selQuadros) ?? []
  const nomes = useMemo(() => {
    const pessoas = new Map(usuarios.map((u) => [u.id, nomeCurto(u)]))
    const cols = new Map(colunas.map((c) => [c.id, c.nome]))
    cols.set(ctx.coluna.id, ctx.coluna.nome)
    const qs = new Map(quadros.map((x) => [x.id, x.nome]))
    qs.set(ctx.quadro.id, ctx.quadro.nome)
    return {
      pessoa: (id: Id) => pessoas.get(id) ?? null, coluna: (id: Id) => cols.get(id) ?? null, quadro: (id: Id) => qs.get(id) ?? null,
      data: (d: string) => formatarData(d), eu: ctx.eu.usuario.id,
    }
  }, [usuarios, colunas, quadros, ctx.coluna, ctx.quadro, ctx.eu.usuario.id])

  if (q.isPending) return <EsqueletoLinhas linhas={4} />
  if (q.isError) return <p className="mdl-vazio">Não foi possível carregar a atividade. <button type="button" className="mdl-link" onClick={() => void q.refetch()}>Tentar de novo</button></p>
  const itens = q.data.pages.flatMap((p) => p.itens)
  return (
    <>
      <ul className="mdl-atividades" aria-label="Atividade da demanda">
        {itens.map((a) => {
          const f = fraseAtividade(a, nomes)
          const Icone = ICONES[f.grupo]
          return (
            <li key={a.id} className="mdl-atividade">
              <span className="mdl-atividade-icone" aria-hidden="true"><Icone /></span>
              <p className="mdl-atividade-texto">
                <strong>{f.ator}</strong> {f.texto}
                <span className="mdl-atividade-quando" title={quandoPorExtenso(a.criadoEm)}> · {tempoRelativo(a.criadoEm)}</span>
              </p>
            </li>
          )
        })}
      </ul>
      {q.hasNextPage && (
        <Botao variante="ghost" tamanho="p" className="self-start" carregando={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          Mostrar mais
        </Botao>
      )}
    </>
  )
}

// ─────────────────────────────── seção ───────────────────────────────

export default function Atividade({ ctx }: { ctx: ContextoDemanda }) {
  const [aba, setAba] = useLocal<'comentarios' | 'atividade'>('modal-aba-atividade', 'comentarios')
  const [compondo, setCompondo] = useState(false)
  const [prefixo, setPrefixo] = useState<string | null>(null)
  const usuarios = useUsuarios()
  const base = 'mdl-aba'
  const topo = useRef<HTMLDivElement>(null)
  useEffect(() => { setCompondo(false); setPrefixo(null) }, [ctx.demanda.id])

  function responder(c: Comentario) {
    const autor = usuarios.find((u) => u.id === c.autorId)
    if (!autor) return
    setPrefixo(`@[${nomeCurto(autor)}](mencao:${autor.id})`)
    setCompondo(true)
    topo.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  return (
    <Secao id="atividade" icone={aba === 'comentarios' ? MessageSquare : History} titulo="Comentários e atividade"
      acoes={(
        <Abas idBase={base} rotulo="Comentários ou atividade" ativa={aba} aoMudar={setAba}
          abas={[{ id: 'comentarios', rotulo: 'Comentários', contador: ctx.demanda.nComentarios || undefined }, { id: 'atividade', rotulo: 'Atividade' }]} />
      )}>
      <div ref={topo} {...painelAba(base, 'comentarios', aba)} tabIndex={-1} className="flex flex-col gap-4">
        {aba === 'comentarios' && (
          <>
            {!ctx.somenteLeitura && (
              <Compositor ctx={ctx} aberto={compondo} abrir={() => setCompondo(true)} fechar={() => { setCompondo(false); setPrefixo(null) }} prefixo={prefixo} />
            )}
            <ListaComentarios ctx={ctx} responder={responder} />
          </>
        )}
      </div>
      <div {...painelAba(base, 'atividade', aba)} tabIndex={-1} className="flex flex-col gap-2">
        {aba === 'atividade' && <ListaAtividade ctx={ctx} />}
      </div>
    </Secao>
  )
}
