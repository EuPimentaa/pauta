/**
 * /d/:numero: o modal da demanda (NÚCLEO-WEB), sobreposto à tela de antes. Aberta direto pela URL, a tela de baixo (e
 * o destino ao fechar ou arquivar) é o quadro da demanda, quando ela está no bootstrap.
 */
import type { Bootstrap } from '@shared/tipos/index.ts'
import type { ExtensaoRota } from '../../extensoes/tipos.ts'

export const rota: ExtensaoRota = {
  caminho: '/d/:numero',
  carregar: () => import('./TelaDemanda.tsx'),
  acesso: 'autenticada',
  layout: 'sobreposta',
  titulo: 'Demanda',
  fundo: (params, qc) => {
    const b = qc.getQueryData<Bootstrap>(['bootstrap'])
    const numero = Number(params.numero)
    const d = b?.demandas.find((x) => x.numero === numero)
    const q = d ? b?.quadros.find((x) => x.id === d.quadroId && x.arquivadoEm === null) : undefined
    return q ? `/q/${q.slug}` : null
  },
}
