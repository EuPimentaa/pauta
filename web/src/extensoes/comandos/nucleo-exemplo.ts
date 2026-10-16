/**
 * Só DEV (/dev/extensoes): comando da paleta que roda fora do render e chama ctx.acoes.mover (o quadro muda na hora,
 * sem esperar o tempo real): leva o card em foco para a próxima coluna.
 */
import { ArrowRight } from 'lucide-react'
import type { Comando } from '../tipos.ts'
import { bootstrapDe } from '../../api/cache.ts'
import { anotar } from '../../telas/dev-extensoes/exemplos.ts'

export const comandos: Comando[] = [{
  id: 'nucleo-exemplo-mover',
  rotulo: 'Exemplo: mover o card em foco para a próxima coluna',
  secao: 'acoes',
  icone: ArrowRight,
  palavras: ['exemplo'],
  visivel: (ctx) => !!ctx.demandaEmFoco,
  executar(ctx) {
    const d = ctx.demandaEmFoco!
    const colunas = (bootstrapDe(ctx.qc)?.colunas ?? []).filter((c) => c.quadroId === d.quadroId && !c.arquivadaEm).sort((a, b) => a.pos - b.pos)
    const proxima = colunas[colunas.findIndex((c) => c.id === d.colunaId) + 1]
    if (!proxima) { anotar('comando: não há próxima coluna'); return }
    anotar(`comando: #${d.numero} para ${proxima.nome} (ctx.acoes.mover)`)
    void ctx.acoes.mover(d, { colunaId: proxima.id, posicao: { depoisDeId: null } }, 'menu')
  },
}]
