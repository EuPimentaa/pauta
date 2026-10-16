/**
 * Menu ··· do modal e de contexto do card, itens do núcleo (PLANO §4: copiar link 300, arquivar/restaurar 900, excluir
 * 950). Excluir é só do admin e pede o número digitado (anonimiza; bloqueado com versão, envio ou aprovação).
 */
import { Archive, ArchiveRestore, Link2, Trash2 } from 'lucide-react'
import { pode } from '@shared/logica/permissoes.ts'
import type { ExtensaoMenuDemanda } from '../tipos.ts'
import { avisarErro } from '../../api/acoes.ts'
import { removerDemanda } from '../../api/cache.ts'
import { api } from '../../api/cliente.ts'
import { avisar } from '../../ui/avisos.tsx'
import { copiarParaAreaDeTransferencia } from '../../ui/Texto.tsx'

export const itens: ExtensaoMenuDemanda[] = [
  {
    id: 'nucleo-copiar-link', ordem: 300, rotulo: 'Copiar link', icone: Link2,
    visivel: () => true,
    executar: async (ctx) => {
      const ok = await copiarParaAreaDeTransferencia(`${window.location.origin}/d/${ctx.demanda.numero}`)
      avisar(ok ? `Link da demanda #${ctx.demanda.numero} copiado.` : 'Não foi possível copiar o link.', { tipo: ok ? 'sucesso' : 'erro' })
    },
  },
  {
    id: 'nucleo-arquivar', ordem: 900, rotulo: 'Arquivar', icone: Archive,
    visivel: (ctx) => !ctx.demanda.arquivadoEm && !ctx.quadro.arquivadoEm,
    executar: async (ctx, util) => {
      const r = await util.acoes.arquivar(ctx.demanda)
      if (r) util.fechar()
    },
  },
  {
    id: 'nucleo-restaurar', ordem: 900, rotulo: 'Restaurar', icone: ArchiveRestore,
    visivel: (ctx) => !!ctx.demanda.arquivadoEm && !ctx.quadro.arquivadoEm,
    executar: async (ctx, util) => { await util.acoes.restaurar(ctx.demanda) },
  },
  {
    id: 'nucleo-excluir', ordem: 950, rotulo: 'Excluir…', icone: Trash2, perigo: true,
    visivel: (ctx) => pode('demanda.excluir', { id: ctx.eu.usuario.id, papel: ctx.eu.usuario.papel }),
    executar: async (ctx, util) => {
      const d = ctx.demanda
      const ok = await util.abrirDialogo('confirmar', {
        titulo: `Excluir a demanda #${d.numero}?`,
        mensagem: 'O título, a descrição, os comentários e os anexos são apagados de vez. Não dá para desfazer.\n'
          + 'Demanda que já teve versão, envio ou aprovação não sai: arquive.',
        confirmar: 'Excluir',
        perigo: true,
        digitar: String(d.numero),
      })
      if (!ok) return
      try {
        await api<void>('POST', `/api/demandas/${encodeURIComponent(d.id)}/excluir`, { corpo: { confirmarNumero: d.numero } })
        removerDemanda(util.qc, d.id)
        util.fechar()
        avisar(`Demanda #${d.numero} excluída.`)
      } catch (e) {
        avisarErro(e, { titulo: 'Não foi possível excluir.' })
      }
    },
  },
]
