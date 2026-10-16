/**
 * O quadro aberto para quem roda sem o ContextoAcao (fontes da paleta): /q/:slug, ou o quadro da demanda de /d/:numero.
 */
import type { Bootstrap, Id } from '../../../../shared/tipos/index.ts'

export function quadroAtualDaUrl(b: Bootstrap, caminho: string = window.location.pathname): Id | null {
  const q = /^\/q\/([^/?#]+)/.exec(caminho)
  if (q) return b.quadros.find((x) => x.slug === decodeURIComponent(q[1]!))?.id ?? null
  const d = /^\/d\/(\d+)/.exec(caminho)
  if (d) return b.demandas.find((x) => x.numero === Number(d[1]))?.quadroId ?? null
  return null
}
