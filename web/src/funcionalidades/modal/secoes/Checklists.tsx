/**
 * Checklists (seção principal 200): vários por demanda, cada um com barra e porcentagem, "Esconder marcados" (no
 * aparelho), itens que se marcam, editam no lugar e se arrastam pela alça (no teclado: ↑ e ↓ na alça). O de uma
 * rodada mostra "Ajustes R2 · prazo sex, 17/10" e só atendimento e admin apagam. Colar várias linhas no campo de item
 * cria um item por linha. Converter item em demanda fica para a v1.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, EyeOff, GripVertical, ListChecks, MoreHorizontal, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { ChecklistComItens, ChecklistItem, Id, Rodada } from '@shared/tipos/index.ts'
import { pode } from '@shared/logica/permissoes.ts'
import { linhasParaItens } from '@shared/logica/texto.ts'
import { formatarPrazo } from '@shared/logica/datas.ts'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { abrirDialogo } from '../../../dialogos/estado.ts'
import { useLocal } from '../../../lib/armazenamento.ts'
import { Botao, BotaoIcone } from '../../../ui/Botao.tsx'
import { Checkbox } from '../../../ui/Checkbox.tsx'
import { BarraProgresso, EsqueletoLinhas } from '../../../ui/Indicadores.tsx'
import { Menu, type ItemMenuUi } from '../../../ui/Menu.tsx'
import { useAcoesModal, chaveLocal } from '../api.ts'
import { Secao, nomeCurto, tempoRelativo, useUsuarios } from '../comum.tsx'

// ─────────────────────────────── campo de texto que salva com Enter ───────────────────────────────

function CampoTexto({ valor, rotulo, aoSalvar, aoCancelar, classe, multiplo, placeholder }: {
  valor: string; rotulo: string; aoSalvar(texto: string): void; aoCancelar(): void; classe: string; multiplo?: boolean; placeholder?: string
}) {
  const [texto, setTexto] = useState(valor)
  const feito = useRef(false)
  const salvar = () => {
    if (feito.current) return
    feito.current = true
    aoSalvar(texto)
  }
  return (
    <textarea className={classe} aria-label={rotulo} value={texto} rows={1} autoFocus placeholder={placeholder}
      maxLength={multiplo ? 20000 : 2000}
      onFocus={(e) => { if (!multiplo) e.currentTarget.select() }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => { if (!feito.current) { feito.current = true; if (texto.trim() && texto.trim() !== valor.trim()) aoSalvar(texto); else aoCancelar() } }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvar() }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); feito.current = true; aoCancelar() }
      }} />
  )
}

// ─────────────────────────────── item ───────────────────────────────

function Item({ item, ctx, mover, podeArrastar }: { item: ChecklistItem; ctx: ContextoDemanda; mover(i: ChecklistItem, passo: -1 | 1): void; podeArrastar: boolean }) {
  const acoes = useAcoesModal()
  const usuarios = useUsuarios()
  const [editando, setEditando] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !podeArrastar })
  const { role: _papel, tabIndex: _tab, ...atributos } = attributes
  const euId = ctx.eu.usuario.id
  const quem = item.feitoPor ? usuarios.find((u) => u.id === item.feitoPor) : undefined
  const so = ctx.somenteLeitura

  function teclaNaAlca(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      mover(item, e.key === 'ArrowUp' ? -1 : 1)
    }
  }

  return (
    <li ref={setNodeRef} className="mdl-item" data-feito={item.feitoEm ? '' : undefined} data-arrastando={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}>
      {podeArrastar && !so ? (
        <button type="button" className="mdl-item-alca" aria-label={`Mover “${item.texto}”. Use as setas para cima e para baixo.`}
          {...atributos} {...listeners} onKeyDown={teclaNaAlca}>
          <GripVertical aria-hidden="true" />
        </button>
      ) : <span className="mdl-item-vaga" />}
      <Checkbox checked={!!item.feitoEm} disabled={so} aria-label={item.texto}
        onChange={(e) => void acoes.editarItem(item, { feito: e.target.checked }, euId)} />
      {editando ? (
        <CampoTexto valor={item.texto} rotulo="Texto do item" classe="mdl-item-campo"
          aoSalvar={(t) => { setEditando(false); void acoes.editarItem(item, { texto: t.replace(/\s+/g, ' ').trim() }, euId) }}
          aoCancelar={() => setEditando(false)} />
      ) : (
        <button type="button" className="mdl-item-texto" disabled={so} onClick={() => setEditando(true)} title={so ? undefined : 'Editar o item'}
          aria-label={`Editar o item ${item.texto}`}>
          {item.texto}
          {item.feitoEm && (
            <span className="mdl-item-quem">{quem ? `${nomeCurto(quem)} marcou ` : 'Marcado '}{tempoRelativo(item.feitoEm)}</span>
          )}
        </button>
      )}
      {!so && !editando ? (
        <span className="mdl-item-acoes">
          <BotaoIcone icone={Trash2} rotulo="Apagar o item" tamanho="p" onClick={() => void acoes.excluirItem(item, euId)} />
        </span>
      ) : <span />}
    </li>
  )
}

// ─────────────────────────────── checklist ───────────────────────────────

function NovoItem({ c, aberto, abrir, fechar }: { c: ChecklistComItens; aberto: boolean; abrir(): void; fechar(): void }) {
  const acoes = useAcoesModal()
  const [texto, setTexto] = useState('')
  const campo = useRef<HTMLTextAreaElement>(null)
  if (!aberto) {
    return <button type="button" className="mdl-novo-item-botao" onClick={abrir}><Plus aria-hidden="true" />Adicionar item</button>
  }
  async function adicionar() {
    const linhas = linhasParaItens(texto)
    if (!linhas.length) return
    setTexto('')
    campo.current?.focus()
    await acoes.criarItens(c, linhas)
  }
  return (
    <div className="mdl-novo-item">
      <textarea ref={campo} className="mdl-item-campo" aria-label={`Novo item em ${c.titulo}`} autoFocus rows={1} value={texto}
        placeholder="O que falta fazer? Cole várias linhas para criar vários itens." maxLength={20000}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void adicionar() }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTexto(''); fechar() }
        }} />
      <div className="flex gap-2">
        <Botao variante="secundario" tamanho="p" onClick={() => void adicionar()} disabled={!texto.trim()}>Adicionar</Botao>
        <Botao variante="ghost" tamanho="p" onClick={() => { setTexto(''); fechar() }}>Fechar</Botao>
      </div>
    </div>
  )
}

function Checklist({ c, ctx, rodada, novoAberto, abrirNovo }: {
  c: ChecklistComItens; ctx: ContextoDemanda; rodada: Rodada | undefined; novoAberto: boolean; abrirNovo(id: Id | null): void
}) {
  const acoes = useAcoesModal()
  const [esconder, setEsconder] = useLocal<boolean>(`checklist-esconder:${c.id}`, false)
  const [renomeando, setRenomeando] = useState(false)
  const feitos = c.itens.filter((i) => i.feitoEm).length
  const total = c.itens.length
  const pct = total ? Math.round((feitos / total) * 100) : 0
  const visiveis = esconder ? c.itens.filter((i) => !i.feitoEm) : c.itens
  const so = ctx.somenteLeitura
  const podeApagar = pode('checklist_rodada.excluir', { id: ctx.eu.usuario.id, papel: ctx.eu.usuario.papel }, { checklist: c })
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  )
  const ids = visiveis.map((i) => i.id)

  function moverPara(item: ChecklistItem, novaOrdem: Id[]) {
    const i = novaOrdem.indexOf(item.id)
    const rel = { depoisDeId: i === 0 ? null : novaOrdem[i - 1]! }
    const posLocal = chaveLocal(c.itens, rel, item.id)
    void acoes.editarItem(item, { posicao: rel, posLocal }, ctx.eu.usuario.id)
  }
  function aoSoltar(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const item = c.itens.find((i) => i.id === e.active.id)
    if (item) moverPara(item, arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))))
  }
  function moverUm(item: ChecklistItem, passo: -1 | 1) {
    const i = ids.indexOf(item.id)
    const j = i + passo
    if (j < 0 || j >= ids.length) return
    moverPara(item, arrayMove(ids, i, j))
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-checklist="${c.id}"] li:nth-child(${j + 1}) .mdl-item-alca`)?.focus())
  }

  const itensMenu: ItemMenuUi[] = [
    { id: 'renomear', rotulo: 'Renomear', executar: () => setRenomeando(true) },
    ...(podeApagar ? [{
      id: 'apagar', rotulo: 'Apagar o checklist…', icone: Trash2, perigo: true,
      executar: async () => {
        const ok = await abrirDialogo('confirmar', {
          titulo: `Apagar “${c.titulo}”?`,
          mensagem: total ? `Os ${total === 1 ? 'item sai' : `${total} itens saem`} junto. Não dá para desfazer.` : 'Não dá para desfazer.',
          confirmar: 'Apagar', perigo: true,
        })
        if (ok) await acoes.excluirChecklist(c)
      },
    } satisfies ItemMenuUi] : []),
  ]

  return (
    <div className="mdl-checklist" data-checklist={c.id}>
      <div className="mdl-checklist-cabeca">
        {renomeando ? (
          <CampoTexto valor={c.titulo} rotulo="Nome do checklist" classe="mdl-titulo-campo"
            aoSalvar={(t) => { setRenomeando(false); void acoes.editarChecklist(c, { titulo: t.replace(/\s+/g, ' ').trim() }) }}
            aoCancelar={() => setRenomeando(false)} />
        ) : (
          <button type="button" className="mdl-checklist-titulo" disabled={so} onClick={() => setRenomeando(true)}
            aria-label={so ? c.titulo : `Renomear o checklist ${c.titulo}`}>{c.titulo}</button>
        )}
        {rodada && (
          <span className="mdl-selo-rodada">
            <RotateCcw aria-hidden="true" />
            {`R${rodada.numero}${rodada.prazo ? ` · prazo ${formatarPrazo(rodada.prazo, rodada.prazoHora)}` : ''}`}
          </span>
        )}
        <div className="mdl-checklist-acoes">
          {feitos > 0 && (
            <Botao variante="ghost" tamanho="p" icone={esconder ? Eye : EyeOff} onClick={() => setEsconder(!esconder)} aria-pressed={esconder}>
              {esconder ? `Mostrar marcados (${feitos})` : 'Esconder marcados'}
            </Botao>
          )}
          {!so && (
            <Menu rotulo={`Checklist ${c.titulo}`} itens={itensMenu} alinhar="fim">
              {(g) => <BotaoIcone {...g} icone={MoreHorizontal} rotulo={`Mais ações do checklist ${c.titulo}`} tamanho="p" />}
            </Menu>
          )}
        </div>
      </div>
      {total > 0 && (
        <div className="mdl-progresso" data-completo={feitos === total || undefined}>
          <span className="mdl-progresso-pct" aria-hidden="true">{pct}%</span>
          <BarraProgresso valor={feitos} max={total} rotulo={`Progresso de ${c.titulo}`} mostrarRotulo />
        </div>
      )}
      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="mdl-itens" aria-label={`Itens de ${c.titulo}`}>
            {visiveis.map((i) => <Item key={i.id} item={i} ctx={ctx} mover={moverUm} podeArrastar={visiveis.length > 1} />)}
          </ul>
        </SortableContext>
      </DndContext>
      {esconder && feitos > 0 && <p className="mdl-escondidos">{feitos === 1 ? '1 item marcado escondido.' : `${feitos} itens marcados escondidos.`}</p>}
      {!so && <NovoItem c={c} aberto={novoAberto} abrir={() => abrirNovo(c.id)} fechar={() => abrirNovo(null)} />}
    </div>
  )
}

// ─────────────────────────────── seção ───────────────────────────────

function NovoChecklist({ aoCriar, aoCancelar }: { aoCriar(titulo: string): void; aoCancelar(): void }) {
  const [titulo, setTitulo] = useState('Checklist')
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (titulo.trim()) aoCriar(titulo.trim()) }}>
      <input className="mdl-titulo-campo" aria-label="Nome do novo checklist" value={titulo} autoFocus maxLength={200}
        onFocus={(e) => e.currentTarget.select()} onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); aoCancelar() } }} />
      <div className="flex gap-2">
        <Botao type="submit" variante="secundario" tamanho="p" disabled={!titulo.trim()}>Criar checklist</Botao>
        <Botao variante="ghost" tamanho="p" onClick={aoCancelar}>Cancelar</Botao>
      </div>
    </form>
  )
}

export default function Checklists({ ctx }: { ctx: ContextoDemanda }) {
  const acoes = useAcoesModal()
  const [criando, setCriando] = useState(false)
  const [novoEm, setNovoEm] = useState<Id | null>(null)
  const det = ctx.detalhe
  const rodadas = useMemo(() => new Map((det?.rodadas ?? []).map((r) => [r.id, r])), [det?.rodadas])
  useEffect(() => { setNovoEm(null); setCriando(false) }, [ctx.demanda.id])

  if (!det) return <Secao id="checklists" icone={ListChecks} titulo="Checklists"><EsqueletoLinhas linhas={3} /></Secao>
  const todos = det.checklists.flatMap((c) => c.itens)
  const feitos = todos.filter((i) => i.feitoEm).length

  async function criar(titulo: string) {
    setCriando(false)
    const c = await acoes.criarChecklist(ctx.demanda, titulo)
    if (c) setNovoEm(c.id)
  }

  return (
    <Secao id="checklists" icone={ListChecks} titulo={det.checklists.length > 1 ? 'Checklists' : 'Checklist'}
      meta={todos.length ? `${feitos}/${todos.length}` : undefined}
      acoes={!ctx.somenteLeitura && !criando ? <Botao variante="ghost" tamanho="p" icone={Plus} onClick={() => setCriando(true)}>Checklist</Botao> : undefined}>
      {det.checklists.length === 0 && !criando && (
        <p className="mdl-vazio">{ctx.somenteLeitura ? 'Sem checklist.' : 'Quebre o trabalho em passos e acompanhe o progresso aqui e no card.'}</p>
      )}
      {det.checklists.map((c) => (
        <Checklist key={c.id} c={c} ctx={ctx} rodada={c.rodadaId ? rodadas.get(c.rodadaId) : undefined} novoAberto={novoEm === c.id}
          abrirNovo={setNovoEm} />
      ))}
      {criando && <NovoChecklist aoCriar={(t) => void criar(t)} aoCancelar={() => setCriando(false)} />}
    </Secao>
  )
}
