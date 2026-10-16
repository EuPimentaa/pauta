/**
 * Pilha dos diálogos abertos e o `abrirDialogo` (contrato em extensoes/tipos.ts, AbrirDialogo). O host
 * (dialogos/Host.tsx, montado como global) desenha a pilha; aqui fica o estado, para quem roda fora do render.
 * Diálogo aberto de dentro de outro empilha; ao fechar, o foco volta para quem abriu (a camada cuida).
 * Id sem diálogo registrado (funcionalidade ainda não mergeada): aviso "Disponível em breve." e null.
 */
import { useSyncExternalStore } from 'react'
import type { AbrirDialogo, MapaDialogos } from '../extensoes/tipos.ts'
import { carregarRegistro } from '../sessao/registro.ts'
import { avisar } from '../ui/avisos.tsx'

export interface EntradaDialogo {
  chave: number
  id: keyof MapaDialogos
  params: unknown
  ancora: HTMLElement | null
  aberto: boolean
  fechar(resultado: unknown): void
}

/** Tempo da saída (a camada anima ~140 ms) antes de desmontar. */
const SAIDA_MS = 260

let pilha: readonly EntradaDialogo[] = []
let proxima = 1
const ouvintes = new Set<() => void>()
const avisar_ = () => ouvintes.forEach((f) => f())

export function useDialogosAbertos(): readonly EntradaDialogo[] {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => pilha,
    () => pilha,
  )
}

export function haDialogoAberto(): boolean {
  return pilha.some((d) => d.aberto)
}

export const abrirDialogo: AbrirDialogo = async (id, params, opcoes) => {
  const reg = await carregarRegistro()
  if (!reg.dialogos().some((d) => d.id === id)) {
    avisar('Disponível em breve.', { tipo: 'info', descricao: 'Esta parte do sistema ainda está chegando.' })
    return null
  }
  return new Promise((resolver) => {
    const chave = proxima++
    let fechado = false
    const entrada: EntradaDialogo = {
      chave, id, params, ancora: opcoes?.ancora ?? null, aberto: true,
      fechar(resultado) {
        if (fechado) return
        fechado = true
        resolver(resultado as never)
        pilha = pilha.map((d) => (d.chave === chave ? { ...d, aberto: false } : d))
        avisar_()
        setTimeout(() => { pilha = pilha.filter((d) => d.chave !== chave); avisar_() }, SAIDA_MS)
      },
    }
    pilha = [...pilha, entrada]
    avisar_()
  })
}

/** Fecha todos (sair da área autenticada). */
export function fecharTodos(): void {
  for (const d of pilha) d.fechar(null)
}

// ─────────────────────────────── navegação fora do render ───────────────────────────────

type Navegar = (caminho: string, opcoes?: { substituir?: boolean }) => void
let navegarImpl: Navegar | null = null

/** O host registra o navigate do react-router (que abre as rotas sobrepostas por cima da tela atual). */
export function definirNavegacao(n: Navegar | null): void {
  navegarImpl = n
}

/**
 * Navegar de fora do render (comandos, atalhos, interceptadores). `/d/:numero` e outras sobrepostas abrem por cima
 * da tela atual. `novaAba` abre noutra aba.
 */
export function navegar(caminho: string, opcoes?: { novaAba?: boolean; substituir?: boolean }): void {
  if (opcoes?.novaAba) {
    window.open(caminho, '_blank', 'noopener')
    return
  }
  if (navegarImpl) navegarImpl(caminho, { substituir: opcoes?.substituir })
  else window.location.assign(caminho)
}
