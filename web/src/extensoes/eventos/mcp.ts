/**
 * Tempo real do F7 (API.md §F.10): `conexao` (a dona e os admins) troca a linha nas listas de Conexões em cache —
 * criada na troca do código, revogada pela tela, pelo sistema (senha, papel, desativação) ou substituída.
 */
import type { ConexaoMcp } from '@shared/tipos/index.ts'
import type { TratadorEventos } from '../tipos.ts'
import { euEmCache } from '../../api/auth.ts'
import { aplicarConexao } from '../../funcionalidades/mcp/api.ts'

export const tratador: TratadorEventos = {
  id: 'mcp',
  entidades: ['conexao'],
  tratar(ev, qc) {
    if (ev.e !== 'conexao' || ev.op !== 'upsert') return
    aplicarConexao(qc, ev.p as ConexaoMcp, euEmCache(qc)?.usuario.id ?? null)
  },
}
