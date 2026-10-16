/**
 * API dos diálogos para as funcionalidades (PLANO §2.2):
 *   const abrir = useAbrirDialogo(); const r = await abrir('mover-demanda', { demandaId }, { ancora })
 *   const ctx = useContextoAcao()          // eu, navegar, abrirDialogo, demandaEmFoco, quadroAtual, qc, acoes
 *   <MolduraDialogo titulo="…">…</MolduraDialogo>   // dentro do componente de um diálogo registrado
 * Id sem diálogo registrado: "Disponível em breve" e null.
 */
import type { AbrirDialogo } from '../extensoes/tipos.ts'
import { abrirDialogo } from './estado.ts'

export { useContextoAcao, contextoAcaoAgora } from './contexto.ts'
export { abrirDialogo, navegar } from './estado.ts'
export { MolduraDialogo } from './Moldura.tsx'

/** Estável (a mesma função em todo o app). */
export function useAbrirDialogo(): AbrirDialogo {
  return abrirDialogo
}
