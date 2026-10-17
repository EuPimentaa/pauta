/**
 * Cache dos painéis fora dos hooks (o tratador do tempo real e as ações usam; os testes do servidor importam: só
 * caminhos relativos e imports de tipo).
 */
import type { QueryClient } from '@tanstack/react-query'
import type { InicioSaida, Notificacao } from '../../../../shared/tipos/index.ts'
import { chaves } from '../../api/chaves.ts'

/** As menções do Início com o mesmo "lida" da lista do sino. */
export function marcarMencoes(qc: QueryClient, lida: (m: Notificacao) => string | null): void {
  qc.setQueryData<InicioSaida>(chaves.inicio, (ini) => (ini ? { ...ini, mencoes: ini.mencoes.map((m) => {
    const lidaEm = lida(m)
    return lidaEm === m.lidaEm ? m : { ...m, lidaEm }
  }) } : ini))
}
