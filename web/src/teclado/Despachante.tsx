/**
 * Despachante de atalhos (global `nucleo-teclado`; PLANO §2, "Teclado"): uma escuta de teclado para o app inteiro,
 * com os atalhos de extensoes/atalhos (atalhos()) por escopo, o acorde G de 1,5 s com o indicador "G…", nada de
 * atalho de uma letra dentro de campo de texto e o desligamento por prefs.atalhos.
 * Com uma camada aberta (menu, popover, diálogo, paleta) só vale o que a própria camada trata; o modal da demanda é a
 * exceção: dentro dele valem os atalhos do escopo 'modal'. Durante um arraste, as teclas são do dnd-kit.
 */
import './teclado.css'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { bootstrapDe } from '../api/cache.ts'
import { contextoAcaoAgora } from '../dialogos/contexto.ts'
import { haCamadaAberta, raizCamadas } from '../lib/camadas.ts'
import { EH_MAC, emCampoDeTexto } from '../lib/teclas.ts'
import { useRegistro } from '../sessao/registro.ts'
import { Kbd } from '../ui/Kbd.tsx'
import { ACORDE_MS, decidir } from './despachar.ts'
import { escopoLigado, escoposAtivos } from './escopos.ts'

const REPETE = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'j', 'k', 'J', 'K'])

/** Pode haver atalho agora? Sem camada aberta, sim; com camadas, só dentro do modal da demanda. */
function livre(e: KeyboardEvent): boolean {
  if (!haCamadaAberta()) return true
  if (!escopoLigado('modal')) return false
  const alvo = e.target instanceof Element ? e.target : null
  return !!alvo?.closest('[data-modal-demanda]')
}

export default function Despachante() {
  const reg = useRegistro()
  const qc = useQueryClient()
  const [acorde, setAcorde] = useState<string | null>(null)

  useEffect(() => {
    let armado: { tecla: string; ate: number } | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const desarmar = () => { armado = null; clearTimeout(timer); setAcorde(null) }

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      if (e.repeat && !REPETE.has(e.key)) return
      if (document.documentElement.hasAttribute('data-arrastando')) return
      if (!livre(e)) return
      const b = bootstrapDe(qc)
      if (!b) return
      const pendente = armado && Date.now() < armado.ate ? armado.tecla : null
      const decisao = decidir(reg.atalhos(), e, {
        escopos: escoposAtivos(), emCampo: emCampoDeTexto(e.target), ligados: b.eu.prefs.atalhos !== false, mac: EH_MAC, acorde: pendente,
      })
      if (pendente) desarmar()
      if (!decisao) return
      if (decisao.tipo === 'acorde') {
        e.preventDefault()
        armado = { tecla: decisao.primeira, ate: Date.now() + ACORDE_MS }
        setAcorde(decisao.primeira)
        clearTimeout(timer)
        timer = setTimeout(desarmar, ACORDE_MS)
        return
      }
      const base = contextoAcaoAgora(qc)
      for (const { atalho, escopo } of decisao.candidatos) {
        const ctx = { ...base, escopo }
        let vale = true
        try { vale = !atalho.quando || atalho.quando(ctx) } catch (erro) { console.error(`[atalhos] ${atalho.id}.quando falhou`, erro); vale = false }
        if (!vale) continue
        e.preventDefault()
        try { atalho.executar(ctx, e) } catch (erro) { console.error(`[atalhos] ${atalho.id} falhou`, erro) }
        return
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      clearTimeout(timer)
    }
  }, [reg, qc])

  if (!acorde) return null
  return createPortal(
    <div className="teclado-acorde" role="status" aria-live="polite">
      <Kbd teclas={acorde} /><span aria-hidden="true">…</span>
      <span className="sr-only">Acorde {acorde.toUpperCase()}: aperte a próxima tecla</span>
    </div>,
    raizCamadas(),
  )
}
