/**
 * Menu de ações (padrão ARIA menu button), com submenu, separadores, grupos, teclas e busca por letra.
 * No celular vira Folha (submenu abre por cima, com "Voltar").
 *
 *   <Menu rotulo="Ações da coluna" itens={itens}>
 *     {(gatilho) => <BotaoIcone {...gatilho} icone={MoreHorizontal} rotulo="Ações da coluna" />}
 *   </Menu>
 *   <MenuFlutuante aberto={a} aoFechar={f} ancora={{ x, y }} itens={itens} rotulo="Demanda #12" />   // botão direito
 *
 * Teclas: ↑ ↓ Home End movem; Enter/Espaço executam; → abre o submenu e ← volta; Esc fecha um nível; Tab fecha tudo.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Icone } from '../extensoes/tipos.ts'
import { raizCamadas, useCamada } from '../lib/camadas.ts'
import { cx } from '../lib/classes.ts'
import { useArmadilhaFoco } from '../lib/foco.ts'
import { useCelular } from '../lib/midia.ts'
import { usePosicao, type Alinhamento, type Ancora, type Lado } from '../lib/posicao.ts'
import { usePresenca } from '../lib/presenca.ts'
import { Kbd } from './Kbd.tsx'
import { Folha } from './Modal.tsx'

export interface ItemAcaoMenu {
  tipo?: 'item'
  id: string
  rotulo: string
  icone?: Icone
  /** Só exibe a tecla (o atalho é registrado em extensoes/atalhos). */
  atalho?: string
  perigo?: boolean
  desabilitado?: boolean
  /** Item de escolha: mostra o check (menuitemcheckbox). */
  marcado?: boolean
  executar?: () => void | Promise<void>
  subitens?: ItemMenuUi[]
}
export type ItemMenuUi = ItemAcaoMenu | { tipo: 'separador'; id: string } | { tipo: 'grupo'; id: string; rotulo: string }

const acionavel = (i: ItemMenuUi): i is ItemAcaoMenu => (i.tipo === undefined || i.tipo === 'item') && !(i as ItemAcaoMenu).desabilitado

export interface PropsGatilhoMenu {
  ref: (el: HTMLElement | null) => void
  onClick: () => void
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string | undefined
}

export interface PropsMenu {
  itens: ItemMenuUi[]
  /** Nome acessível do menu (e título da folha no celular). */
  rotulo: string
  children: (gatilho: PropsGatilhoMenu) => ReactNode
  lado?: Lado
  alinhar?: Alinhamento
  /** Avisado ao abrir e fechar (ex.: manter o card "em foco" enquanto o menu dele está aberto). */
  aoMudar?(aberto: boolean): void
}

export function Menu({ itens, rotulo, children, lado = 'baixo', alinhar = 'inicio', aoMudar }: PropsMenu) {
  const [aberto, setAberto] = useState(false)
  const [foco, setFoco] = useState<'primeiro' | 'ultimo'>('primeiro')
  const [ancora, setAncora] = useState<HTMLElement | null>(null)
  const id = useId()
  const mudar = (a: boolean) => { setAberto(a); aoMudar?.(a) }
  return (
    <>
      {children({
        ref: setAncora,
        onClick: () => { setFoco('primeiro'); mudar(!aberto) },
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setFoco(e.key === 'ArrowUp' ? 'ultimo' : 'primeiro')
            mudar(true)
          }
        },
        'aria-haspopup': 'menu',
        'aria-expanded': aberto,
        'aria-controls': aberto ? id : undefined,
      })}
      <MenuFlutuante id={id} aberto={aberto} aoFechar={() => mudar(false)} ancora={ancora} itens={itens} rotulo={rotulo}
        lado={lado} alinhar={alinhar} focoInicial={foco} />
    </>
  )
}

export interface PropsMenuFlutuante {
  aberto: boolean
  aoFechar(): void
  ancora: Ancora
  itens: ItemMenuUi[]
  rotulo: string
  lado?: Lado
  alinhar?: Alinhamento
  focoInicial?: 'primeiro' | 'ultimo'
  id?: string
}

/** Menu controlado (menu de contexto no ponto do clique, menu do avatar...). */
export function MenuFlutuante(p: PropsMenuFlutuante) {
  const celular = useCelular()
  if (celular) return <MenuFolha {...p} />
  return <ListaMenu {...p} nivel={0} />
}

// ─────────────────────────────── desktop ───────────────────────────────

interface PropsLista extends PropsMenuFlutuante {
  nivel: number
  /** Submenu: fecha só este nível (← ou Esc). */
  aoVoltar?(): void
}

function ListaMenu({ aberto, aoFechar, aoVoltar, ancora, itens, rotulo, lado = 'baixo', alinhar = 'inicio', focoInicial = 'primeiro', nivel, id }: PropsLista) {
  const { montado, estado } = usePresenca(aberto, 100)
  const ref = useRef<HTMLDivElement>(null)
  const elementos = useRef(new Map<string, HTMLElement>())
  const [ativo, setAtivo] = useState<string | null>(null)
  const [sub, setSub] = useState<string | null>(null)
  const timerSub = useRef(0)
  const busca = useRef({ texto: '', ate: 0 })
  const acionaveis = useMemo(() => itens.filter(acionavel), [itens])

  useCamada(aberto, { aoEsc: nivel === 0 ? aoFechar : aoVoltar })
  useArmadilhaFoco(ref, aberto && montado, false)
  const { estilo, medindo } = usePosicao(ancora, ref, montado, { lado, alinhar, distancia: nivel === 0 ? 6 : -2 })

  // foco inicial: primeiro ou último item
  useEffect(() => {
    if (!aberto) { setAtivo(null); setSub(null); return }
    const alvo = focoInicial === 'ultimo' ? acionaveis[acionaveis.length - 1] : acionaveis[0]
    setAtivo(alvo?.id ?? null)
  }, [aberto, focoInicial, acionaveis])

  useEffect(() => {
    if (ativo && !medindo) elementos.current.get(ativo)?.focus({ preventScroll: false })
  }, [ativo, medindo])

  // clique fora do menu (e da âncora) fecha tudo; o submenu está noutra camada e cuida de si
  useEffect(() => {
    if (!aberto || nivel > 0) return
    const aoApertar = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (ref.current?.contains(alvo) || (ancora instanceof HTMLElement && ancora.contains(alvo))) return
      if (alvo instanceof Element && alvo.closest('[data-submenu-de]')) return
      aoFechar()
    }
    document.addEventListener('pointerdown', aoApertar, true)
    return () => document.removeEventListener('pointerdown', aoApertar, true)
  }, [aberto, nivel, ancora, aoFechar])

  function mover(delta: number) {
    if (acionaveis.length === 0) return
    const i = acionaveis.findIndex((x) => x.id === ativo)
    const prox = acionaveis[(i + delta + acionaveis.length) % acionaveis.length]
    setAtivo(prox.id)
  }

  function acionar(item: ItemAcaoMenu) {
    if (item.subitens?.length) { setSub(item.id); return }
    aoFechar()
    void item.executar?.()
  }

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const item = acionaveis.find((x) => x.id === ativo)
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); mover(1); return
      case 'ArrowUp': e.preventDefault(); mover(-1); return
      case 'Home': e.preventDefault(); setAtivo(acionaveis[0]?.id ?? null); return
      case 'End': e.preventDefault(); setAtivo(acionaveis[acionaveis.length - 1]?.id ?? null); return
      case 'Enter': case ' ': e.preventDefault(); if (item) acionar(item); return
      case 'ArrowRight': if (item?.subitens?.length) { e.preventDefault(); setSub(item.id) } return
      case 'ArrowLeft': if (nivel > 0) { e.preventDefault(); aoVoltar?.() } return
      case 'Tab': e.preventDefault(); aoFechar(); return
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const agora = Date.now()
      busca.current = { texto: (agora < busca.current.ate ? busca.current.texto : '') + e.key.toLowerCase(), ate: agora + 700 }
      const i = acionaveis.findIndex((x) => x.id === ativo)
      const ordem = [...acionaveis.slice(i + 1), ...acionaveis.slice(0, i + 1)]
      const achou = ordem.find((x) => x.rotulo.toLowerCase().startsWith(busca.current.texto))
      if (achou) setAtivo(achou.id)
    }
  }

  if (!montado) return null
  const itemSub = sub ? acionaveis.find((x) => x.id === sub) : undefined
  return createPortal(
    <>
      <div
        ref={ref}
        id={id}
        role="menu"
        aria-label={rotulo}
        tabIndex={-1}
        className="ui-popover ui-menu vidro"
        style={estilo}
        data-estado={estado}
        data-medindo={medindo || undefined}
        data-submenu-de={nivel > 0 ? 'sim' : undefined}
        onKeyDown={aoTeclar}
      >
        {itens.map((item) => {
          if (item.tipo === 'separador') return <div key={item.id} role="separator" className="ui-menu-separador" />
          if (item.tipo === 'grupo') return <div key={item.id} role="presentation" className="ui-menu-grupo">{item.rotulo}</div>
          const I = item.icone
          const temSub = !!item.subitens?.length
          return (
            <div
              key={item.id}
              ref={(el) => { if (el) elementos.current.set(item.id, el); else elementos.current.delete(item.id) }}
              role={item.marcado !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={item.marcado !== undefined ? item.marcado : undefined}
              aria-disabled={item.desabilitado || undefined}
              aria-haspopup={temSub ? 'menu' : undefined}
              aria-expanded={temSub ? sub === item.id : undefined}
              tabIndex={-1}
              className="ui-menu-item"
              data-ativo={ativo === item.id || undefined}
              data-perigo={item.perigo || undefined}
              onPointerMove={() => {
                if (item.desabilitado || ativo === item.id) return
                setAtivo(item.id)
                window.clearTimeout(timerSub.current)
                timerSub.current = window.setTimeout(() => setSub(temSub ? item.id : null), 140)
              }}
              onClick={() => { if (!item.desabilitado) acionar(item) }}
            >
              {item.marcado !== undefined
                ? <Check className="ui-menu-marca" style={{ opacity: item.marcado ? 1 : 0 }} aria-hidden="true" />
                : I && <I aria-hidden="true" />}
              <span className="ui-menu-item-rotulo">{item.rotulo}</span>
              {item.atalho && <Kbd teclas={item.atalho} />}
              {temSub && <ChevronRight className="ui-menu-seta" aria-hidden="true" />}
            </div>
          )
        })}
      </div>
      {itemSub?.subitens && (
        <ListaMenu
          aberto={aberto && !!sub}
          aoFechar={aoFechar}
          aoVoltar={() => { const v = sub; setSub(null); if (v) elementos.current.get(v)?.focus() }}
          ancora={elementos.current.get(itemSub.id) ?? null}
          itens={itemSub.subitens}
          rotulo={itemSub.rotulo}
          lado="direita"
          alinhar="inicio"
          nivel={nivel + 1}
        />
      )}
    </>,
    raizCamadas(),
  )
}

// ─────────────────────────────── celular ───────────────────────────────

function MenuFolha({ aberto, aoFechar, itens, rotulo }: PropsMenuFlutuante) {
  const [pilha, setPilha] = useState<ItemAcaoMenu[]>([])
  useEffect(() => { if (!aberto) setPilha([]) }, [aberto])
  const atual = pilha[pilha.length - 1]
  const lista = atual?.subitens ?? itens
  const ref = useRef<HTMLDivElement>(null)

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const botoes = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])
    const i = botoes.indexOf(document.activeElement as HTMLElement)
    botoes[(i + (e.key === 'ArrowDown' ? 1 : -1) + botoes.length) % botoes.length]?.focus()
  }

  return (
    <Folha aberto={aberto} aoFechar={aoFechar} titulo={atual?.rotulo ?? rotulo}>
      <div ref={ref} role="menu" aria-label={atual?.rotulo ?? rotulo} onKeyDown={aoTeclar} className="pb-2">
        {atual && (
          <button type="button" role="menuitem" className="ui-menu-item" onClick={() => setPilha((p) => p.slice(0, -1))}>
            <ChevronLeft aria-hidden="true" />
            <span className="ui-menu-item-rotulo">Voltar</span>
          </button>
        )}
        {lista.map((item) => {
          if (item.tipo === 'separador') return <div key={item.id} role="separator" className="ui-menu-separador" />
          if (item.tipo === 'grupo') return <div key={item.id} role="presentation" className="ui-menu-grupo">{item.rotulo}</div>
          const I = item.icone
          const temSub = !!item.subitens?.length
          return (
            <button
              key={item.id}
              type="button"
              role={item.marcado !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={item.marcado !== undefined ? item.marcado : undefined}
              aria-disabled={item.desabilitado || undefined}
              className={cx('ui-menu-item')}
              data-perigo={item.perigo || undefined}
              onClick={() => {
                if (item.desabilitado) return
                if (temSub) { setPilha((p) => [...p, item]); return }
                aoFechar()
                void item.executar?.()
              }}
            >
              {item.marcado !== undefined
                ? <Check className="ui-menu-marca" style={{ opacity: item.marcado ? 1 : 0 }} aria-hidden="true" />
                : I && <I aria-hidden="true" />}
              <span className="ui-menu-item-rotulo">{item.rotulo}</span>
              {temSub && <ChevronRight className="ui-menu-seta" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </Folha>
  )
}
