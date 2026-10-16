/** Peças comuns da lista e da página do cliente (F5). */
import type { ClienteResumo, StatusCliente } from '@shared/tipos/index.ts'

export const ROTULO_STATUS: Record<StatusCliente, string> = { recorrente: 'Recorrente', pontual: 'Pontual', negociacao: 'Em negociação', ex: 'Ex-cliente' }

export function SiglaCliente({ c, tamanho }: { c: Pick<ClienteResumo, 'sigla' | 'cor' | 'logoUrl' | 'nome'>; tamanho?: 'g' }) {
  return (
    <span className="cad-sigla" data-cor={c.cor} data-tamanho={tamanho} aria-hidden="true">
      {c.logoUrl ? <img src={c.logoUrl} alt="" /> : c.sigla}
    </span>
  )
}
