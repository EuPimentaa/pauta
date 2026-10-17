/**
 * Sino da barra superior (F3; direita, ordem 200): o número de não lidas em tempo real e o diálogo `notificacoes`
 * ancorado nele (clicar de novo fecha). A contagem vem da lista do sino (['notificacoes']) e, antes dela, do bootstrap.
 */
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { chaves } from '../../api/chaves.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { Tooltip } from '../../ui/Tooltip.tsx'
import { useNaoLidas, useSeqDoBootstrap } from './api.ts'
import { fecharSinoAberto, sinoAberto } from './sino-estado.ts'
import './paineis.css'

/** "3 não lidas" / "99+". */
export function textoNaoLidas(n: number): string {
  return n === 0 ? 'Nenhuma não lida' : `${n} ${n === 1 ? 'não lida' : 'não lidas'}`
}

/**
 * Relê a lista do sino quando o bootstrap é recarregado (resync do tempo real: os eventos de notificação daquele
 * intervalo não chegaram). Quem mostra a contagem chama (a barra no desktop, a aba Sino no celular).
 */
export function useRelerSinoNoResync(): void {
  const qc = useQueryClient()
  const seq = useSeqDoBootstrap()
  const visto = useRef(seq)
  useEffect(() => {
    if (visto.current === seq) return
    visto.current = seq
    void qc.invalidateQueries({ queryKey: chaves.notificacoes })
    void qc.invalidateQueries({ queryKey: chaves.inicio })
  }, [qc, seq])
}

/** Anuncia ao leitor de tela quando chega notificação nova (o número subiu). */
function useAnuncio(n: number): string {
  const anterior = useRef(n)
  const [texto, setTexto] = useState('')
  useEffect(() => {
    if (n > anterior.current) setTexto(n - anterior.current === 1 ? 'Nova notificação.' : `${n - anterior.current} notificações novas.`)
    anterior.current = n
  }, [n])
  return texto
}

export function SinoTopo() {
  const n = useNaoLidas()
  const abrir = useAbrirDialogo()
  const botao = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  const anuncio = useAnuncio(n)
  useRelerSinoNoResync()

  async function alternar() {
    if (sinoAberto()) { fecharSinoAberto(); return }
    setAberto(true)
    try { await abrir('notificacoes', {}, { ancora: botao.current }) } finally { setAberto(false) }
  }

  const rotulo = `Notificações: ${textoNaoLidas(n)}`
  return (
    <Tooltip texto={n > 0 ? `Notificações (${n})` : 'Notificações'}>
      <button ref={botao} type="button" className="pnl-sino-botao" aria-label={rotulo} aria-haspopup="dialog" aria-expanded={aberto}
        data-novas={n > 0 || undefined} onClick={() => void alternar()}>
        <Bell aria-hidden="true" />
        {n > 0 && <span className="pnl-sino-num tabular" aria-hidden="true">{n > 99 ? '99+' : n}</span>}
        <span className="sr-only" aria-live="polite">{anuncio}</span>
      </button>
    </Tooltip>
  )
}
