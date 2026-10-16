/**
 * Modal da demanda (PLANO §2, "Modal"; rota sobreposta /d/:numero por cima da tela atual).
 * - abre do cache; fora dele (arquivada, quadro arquivado, concluída antiga) espera o detalhe e monta o contexto com
 *   detalhe.quadro/detalhe.coluna, em `somenteLeitura` para arquivada ou de quadro arquivado;
 * - topo: capa, número, título editável, "na coluna Fazendo do quadro Criação" (abre o `mover-demanda` do F1),
 *   "Concluída" (POST /concluir, com o aviso da repetição), as ações (acoesDemanda(): um primário laranja, até 2
 *   secundários, o resto no ···) e o menu ··· (menuDemanda() com `onde` modal);
 * - colunas principal e lateral com secoesDemanda() (cada uma carrega sob demanda, com esqueleto);
 * - Esc fecha; ←/→ e J/K abrem a vizinha da mesma coluna (atalhos do escopo 'modal').
 */
import './modal.css'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, MoreHorizontal, X } from 'lucide-react'
import type { Bootstrap, Demanda, DemandaDetalhe } from '@shared/tipos/index.ts'
import { ehCardDaColuna } from '@shared/logica/quadro.ts'
import { useBootstrap } from '../api/bootstrap.ts'
import { useAcoes } from '../api/demandas.ts'
import { useDoBootstrap } from '../api/seletores.ts'
import { abrirDialogo } from '../dialogos/estado.ts'
import type { ContextoDemanda, ExtensaoAcaoDemanda, ExtensaoSecaoDemanda, UtilModal } from '../extensoes/tipos.ts'
import { useTituloAba } from '../lib/app.ts'
import type { Ancora } from '../lib/posicao.ts'
import { useAbrirSobreposta } from '../sessao/sobreposta.tsx'
import { useRegistro, type ModuloRegistro } from '../sessao/registro.ts'
import { definirControleModal } from '../teclado/controles.ts'
import { useEscopoAtalho } from '../teclado/escopos.ts'
import { definirModal } from '../teclado/foco.ts'
import { Botao, BotaoIcone } from '../ui/Botao.tsx'
import { Checkbox } from '../ui/Checkbox.tsx'
import { ChipEtiqueta } from '../ui/Chips.tsx'
import { EsqueletoLinhas } from '../ui/Indicadores.tsx'
import { LimiteErro } from '../ui/LimiteErro.tsx'
import { MenuFlutuante, type ItemMenuUi } from '../ui/Menu.tsx'
import { itensDoMenuDemanda, montarContextoDemanda, montarUtilModal } from './contexto.ts'
import { DescricaoSoLeitura, ResumoLateral } from './Resumo.tsx'

// ─────────────────────────────── título ───────────────────────────────

function Titulo({ ctx, editar }: { ctx: ContextoDemanda; editar(titulo: string): void }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(ctx.demanda.titulo)
  const feito = useRef(false)
  if (ctx.somenteLeitura) return <h2 className="modal-demanda-titulo">{ctx.demanda.titulo}</h2>
  if (!editando) {
    return (
      <h2 className="modal-demanda-titulo">
        <button type="button" className="modal-demanda-titulo-botao" title="Editar o título"
          onClick={() => { feito.current = false; setTexto(ctx.demanda.titulo); setEditando(true) }}>
          {ctx.demanda.titulo}
        </button>
      </h2>
    )
  }
  const salvar = () => {
    if (feito.current) return
    feito.current = true
    setEditando(false)
    const novo = texto.replace(/\s+/g, ' ').trim()
    if (novo && novo !== ctx.demanda.titulo) editar(novo)
  }
  return (
    <textarea
      className="modal-demanda-titulo-campo"
      aria-label="Título da demanda"
      value={texto}
      maxLength={300}
      rows={2}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvar() }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); feito.current = true; setEditando(false) }
      }}
    />
  )
}

// ─────────────────────────────── seções ───────────────────────────────

function Secao({ s, ctx, reg }: { s: ExtensaoSecaoDemanda; ctx: ContextoDemanda; reg: ModuloRegistro }) {
  const C = reg.componenteDe('demanda', s.id, s.carregar)
  return (
    <LimiteErro nome={`seção ${s.id}`}>
      <Suspense fallback={<div className="modal-demanda-secao" aria-busy="true"><EsqueletoLinhas linhas={3} /></div>}>
        <C ctx={ctx} />
      </Suspense>
    </LimiteErro>
  )
}

function visivel<T extends { id: string; visivel?(ctx: ContextoDemanda): boolean }>(i: T, ctx: ContextoDemanda): boolean {
  try { return !i.visivel || i.visivel(ctx) } catch (e) { console.error(`[modal] ${i.id}.visivel falhou`, e); return false }
}

// ─────────────────────────────── ações ───────────────────────────────

/** Um primário (o de menor ordem com `primaria`), até 2 secundários, o resto vai para o ···. */
export function separarAcoes(acoes: readonly ExtensaoAcaoDemanda[], ctx: ContextoDemanda) {
  const visiveis = acoes.filter((a) => { try { return a.visivel(ctx) } catch { return false } })
  const primaria = visiveis.find((a) => { try { return !!a.primaria?.(ctx) } catch { return false } }) ?? null
  const outras = visiveis.filter((a) => a !== primaria)
  return { primaria, secundarias: outras.slice(0, 2), noMenu: outras.slice(2) }
}

function BotaoAcao({ a, ctx, util, primaria }: { a: ExtensaoAcaoDemanda; ctx: ContextoDemanda; util: UtilModal; primaria?: boolean }) {
  const [rodando, setRodando] = useState(false)
  return (
    <Botao variante={primaria ? 'primario' : 'secundario'} tamanho="p" icone={a.icone} atalho={a.atalho} carregando={rodando}
      onClick={async () => { setRodando(true); try { await a.executar(ctx, util) } finally { setRodando(false) } }}>
      {a.rotulo(ctx)}
    </Botao>
  )
}

// ─────────────────────────────── modal ───────────────────────────────

const selColunas = (b: Bootstrap) => b.colunas
const selDias = (b: Bootstrap) => b.config.quadroConcluidasDias
const porPosicao = (a: Demanda, b: Demanda) => a.posicao - b.posicao || a.numero - b.numero

export interface PropsModalDemanda {
  demanda: Demanda
  detalhe: DemandaDetalhe | undefined
  fechar(): void
}

export function ConteudoModal({ demanda, detalhe, fechar }: PropsModalDemanda) {
  const reg = useRegistro()
  const qc = useQueryClient()
  const acoes = useAcoes()
  const abrirSobreposta = useAbrirSobreposta()
  const boot = useBootstrap().data
  const colunas = useDoBootstrap(selColunas)
  const dias = useDoBootstrap(selDias) ?? 7
  const [menu, setMenu] = useState<{ ancora: Ancora; itens: ItemMenuUi[] } | null>(null)
  useEscopoAtalho('modal')

  const ctx = useMemo(() => (boot ? montarContextoDemanda(boot, demanda, { detalhe, quadro: detalhe?.quadro, coluna: detalhe?.coluna }) : null),
    [boot, demanda, detalhe])
  const util = useMemo(() => montarUtilModal(qc, fechar), [qc, fechar])
  useTituloAba(`#${demanda.numero} ${demanda.titulo}`)

  useEffect(() => {
    definirModal(demanda.id, demanda.quadroId)
    return () => definirModal(null)
  }, [demanda.id, demanda.quadroId])

  // vizinhas da mesma coluna (a ordem do quadro), para ←/→ e J/K
  const vizinhas = useMemo(() => {
    if (!boot || !colunas?.some((c) => c.id === demanda.colunaId)) return []
    const agora = new Date()
    return boot.demandas.filter((d) => d.colunaId === demanda.colunaId && ehCardDaColuna(d, agora, dias)).sort(porPosicao)
  }, [boot, colunas, demanda.colunaId, dias])
  useEffect(() => definirControleModal({
    demandaId: demanda.id,
    vizinha: (passo) => {
      const i = vizinhas.findIndex((d) => d.id === demanda.id)
      const alvo = i >= 0 ? vizinhas[i + passo] : undefined
      if (alvo) abrirSobreposta(`/d/${alvo.numero}`, { substituir: true })
    },
  }), [vizinhas, demanda.id, abrirSobreposta])

  if (!ctx) return <EsqueletoModal fechar={fechar} />

  const secoes = reg.secoesDemanda().filter((s) => visivel(s, ctx))
  const principais = secoes.filter((s) => s.coluna === 'principal')
  const laterais = secoes.filter((s) => s.coluna === 'lateral')
  const { primaria, secundarias, noMenu } = separarAcoes(reg.acoesDemanda(), ctx)
  const etiquetas = boot?.etiquetas.filter((e) => demanda.etiquetaIds.includes(e.id)).sort((a, b) => a.pos - b.pos) ?? []

  function abrirMenu(ancora: HTMLElement) {
    const doMenu = itensDoMenuDemanda(reg.menuDemanda(), ctx!, util, 'modal')
    const daAcao: ItemMenuUi[] = noMenu.map((a) => ({ id: `acao-${a.id}`, rotulo: a.rotulo(ctx!), icone: a.icone, atalho: a.atalho, executar: () => a.executar(ctx!, util) }))
    const itens = [...daAcao, ...(daAcao.length && doMenu.length ? [{ tipo: 'separador' as const, id: 'sep-acoes' }] : []), ...doMenu]
    setMenu({ ancora, itens: itens.length ? itens : [{ id: 'vazio', rotulo: 'Nenhuma ação disponível', desabilitado: true }] })
  }

  return (
    <div className="modal-demanda" data-modal-demanda="" tabIndex={-1}>
      {demanda.capaUrl ? (
        <div className="modal-demanda-capa" data-imagem=""><img src={demanda.capaUrl} alt="" /></div>
      ) : demanda.capaCor ? <div className="modal-demanda-capa" data-cor={demanda.capaCor} aria-hidden="true" /> : null}
      <header className="modal-demanda-topo">
        <div className="modal-demanda-titulos">
          <div className="modal-demanda-pre">
            <span className="modal-demanda-numero">#{demanda.numero}</span>
            {etiquetas.length > 0 && <span className="flex flex-wrap gap-1">{etiquetas.map((e) => <ChipEtiqueta key={e.id} etiqueta={e} />)}</span>}
          </div>
          <Titulo ctx={ctx} editar={(titulo) => void acoes.editar(demanda, { titulo })} />
          <p className="modal-demanda-onde">
            na coluna{' '}
            <button type="button" className="modal-demanda-lugar" disabled={ctx.somenteLeitura}
              onClick={(e) => void abrirDialogo('mover-demanda', { demandaId: demanda.id }, { ancora: e.currentTarget })}>
              {ctx.coluna.nome}
            </button>
            {' '}do quadro{' '}
            <button type="button" className="modal-demanda-lugar" disabled={ctx.somenteLeitura}
              onClick={(e) => void abrirDialogo('mover-demanda', { demandaId: demanda.id, quadroId: ctx.quadro.id }, { ancora: e.currentTarget })}>
              {ctx.quadro.nome}
            </button>
          </p>
        </div>
        <div className="modal-demanda-acoes">
          <Checkbox tom="sucesso" checked={!!demanda.concluidaEm} disabled={ctx.somenteLeitura}
            onChange={(e) => void acoes.concluir(demanda, e.target.checked)}>
            Concluída
          </Checkbox>
          {!ctx.somenteLeitura && secundarias.map((a) => <BotaoAcao key={a.id} a={a} ctx={ctx} util={util} />)}
          {!ctx.somenteLeitura && primaria && <BotaoAcao a={primaria} ctx={ctx} util={util} primaria />}
          <BotaoIcone icone={MoreHorizontal} rotulo="Mais ações da demanda" aria-haspopup="menu" aria-expanded={!!menu}
            onClick={(e) => abrirMenu(e.currentTarget)} />
          <BotaoIcone icone={X} rotulo="Fechar" atalho="esc" onClick={fechar} data-foco-por-ultimo="" />
        </div>
      </header>
      {ctx.somenteLeitura && (
        <div className="modal-demanda-faixa" role="status">
          <Archive aria-hidden="true" />
          <span>{ctx.quadro.arquivadoEm ? 'O quadro desta demanda foi arquivado. Restaure o quadro para editar.' : 'Demanda arquivada. Restaure para editar.'}</span>
          {!ctx.quadro.arquivadoEm && demanda.arquivadoEm && (
            <Botao variante="secundario" tamanho="p" onClick={() => void acoes.restaurar(demanda)}>Restaurar</Botao>
          )}
        </div>
      )}
      <div className="modal-demanda-corpo">
        <div className="modal-demanda-principal">
          {principais.length ? principais.map((s) => <Secao key={s.id} s={s} ctx={ctx} reg={reg} />) : <DescricaoSoLeitura ctx={ctx} />}
        </div>
        <aside className="modal-demanda-lateral" aria-label="Detalhes da demanda">
          {laterais.length ? laterais.map((s) => <Secao key={s.id} s={s} ctx={ctx} reg={reg} />) : <ResumoLateral ctx={ctx} />}
        </aside>
      </div>
      {menu && <MenuFlutuante aberto aoFechar={() => setMenu(null)} ancora={menu.ancora} itens={menu.itens} rotulo={`Demanda #${demanda.numero}`} alinhar="fim" />}
    </div>
  )
}

export function EsqueletoModal({ fechar, mensagem }: { fechar(): void; mensagem?: React.ReactNode }) {
  return (
    <div className="modal-demanda" data-modal-demanda="" tabIndex={-1} aria-busy={!mensagem}>
      <header className="modal-demanda-topo">
        <div className="modal-demanda-titulos">
          {mensagem ?? <EsqueletoLinhas linhas={2} />}
        </div>
        <div className="modal-demanda-acoes">
          <BotaoIcone icone={X} rotulo="Fechar" atalho="esc" onClick={fechar} data-foco-por-ultimo="" />
        </div>
      </header>
      {!mensagem && (
        <div className="modal-demanda-corpo">
          <div className="modal-demanda-principal"><EsqueletoLinhas linhas={5} /></div>
          <aside className="modal-demanda-lateral"><EsqueletoLinhas linhas={4} /></aside>
        </div>
      )}
    </div>
  )
}
