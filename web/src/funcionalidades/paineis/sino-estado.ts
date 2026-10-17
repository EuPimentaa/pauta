/**
 * O diálogo das notificações aberto (no máximo um): o sino da barra usa para fechar ao ser clicado de novo, em vez
 * de abrir outro por cima.
 */
let fecharAberto: (() => void) | null = null

/** O diálogo registra como se fechar enquanto está montado. Devolve a função que desfaz o registro. */
export function registrarSinoAberto(fechar: () => void): () => void {
  fecharAberto = fechar
  return () => { if (fecharAberto === fechar) fecharAberto = null }
}

/** Fecha o diálogo aberto; false se não havia nenhum. */
export function fecharSinoAberto(): boolean {
  if (!fecharAberto) return false
  const f = fecharAberto
  fecharAberto = null
  f()
  return true
}

export function sinoAberto(): boolean {
  return fecharAberto !== null
}
