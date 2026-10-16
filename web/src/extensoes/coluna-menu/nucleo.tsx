/**
 * Menu ··· da coluna, itens do núcleo (PLANO §2, ordens da §4): Renomear 100, Cor 110, Papel 120, Limite WIP 130,
 * Ordenar por… 200, Mover todos os cards… 300, Arquivar todos os cards 800, Arquivar coluna 900.
 * Qualquer pessoa interna mexe nas colunas (API §2).
 */
import {
  Archive, ArchiveX, ArrowDownWideNarrow, ArrowRightLeft, CircleDot, Gauge, Palette, Pencil,
} from 'lucide-react'
import { CORES, ORDENS_COLUNA, PAPEIS_COLUNA, ROTULO_PAPEL_COLUNA, type OrdemColuna, type PapelColuna } from '@shared/tipos/index.ts'
import '../../quadro/dialogos-coluna.ts'
import { bootstrapDe } from '../../api/cache.ts'
import { cardsDaColuna, colunasMutacoes } from '../../api/quadros.ts'
import { ROTULO_COR } from '../../lib/cores.ts'
import { editarNomeDaColuna } from '../../quadro/estado.ts'
import type { ItemColunaNucleo } from '../../quadro/menu-coluna.ts'
import type { ContextoAcao, ContextoColuna } from '../tipos.ts'

const ROTULO_ORDEM: Record<OrdemColuna, string> = {
  prazo: 'Prazo (sem prazo por último)',
  prioridade: 'Prioridade (urgente primeiro)',
  criacao: 'Data de criação (mais antigas primeiro)',
  titulo: 'Título (A a Z)',
  cliente: 'Cliente (pela sigla)',
}

const nada = () => {}
const quantosCards = (ctx: ContextoColuna, acao: ContextoAcao) => {
  const b = bootstrapDe(acao.qc)
  return b ? cardsDaColuna(b, ctx.coluna.id).length : ctx.demandas.length
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

async function mudarPapel(ctx: ContextoColuna, acao: ContextoAcao, papel: PapelColuna) {
  if (papel === ctx.coluna.papel) return
  if (papel === 'concluida') {
    const b = bootstrapDe(acao.qc)
    const abertas = b ? cardsDaColuna(b, ctx.coluna.id).filter((d) => !d.concluidaEm).length : 0
    if (abertas > 0) {
      const ok = await acao.abrirDialogo('confirmar', {
        titulo: `Marcar ${ctx.coluna.nome} como coluna de concluídas?`,
        mensagem: `${plural(abertas, 'demanda aberta dela vai ser concluída', 'demandas abertas dela vão ser concluídas')} agora, sem criar repetições. Tirar um card daqui depois reabre a demanda.`,
        confirmar: 'Marcar como concluídas',
      })
      if (!ok) return
    }
  }
  await colunasMutacoes(acao.qc).editar(ctx.coluna, { papel })
}

export const itens: ItemColunaNucleo[] = [
  { id: 'nucleo-renomear', ordem: 100, rotulo: 'Renomear', icone: Pencil, executar: (ctx) => editarNomeDaColuna(ctx.coluna.id) },
  {
    id: 'nucleo-cor', ordem: 110, rotulo: 'Cor', icone: Palette, executar: nada,
    subitens: (ctx, acao) => [
      { id: 'sem-cor', rotulo: 'Sem cor', marcado: ctx.coluna.cor === null, executar: () => void colunasMutacoes(acao.qc).editar(ctx.coluna, { cor: null }) },
      ...CORES.map((cor) => ({
        id: cor, rotulo: ROTULO_COR[cor], marcado: ctx.coluna.cor === cor,
        executar: () => void colunasMutacoes(acao.qc).editar(ctx.coluna, { cor }),
      })),
    ],
  },
  {
    id: 'nucleo-papel', ordem: 120, rotulo: 'Papel', icone: CircleDot, executar: nada,
    subitens: (ctx, acao) => PAPEIS_COLUNA.map((papel) => ({
      id: papel,
      // coluna de uma pessoa é sempre normal (API §4.6)
      rotulo: papel !== 'normal' && ctx.coluna.responsavelId ? `${ROTULO_PAPEL_COLUNA[papel]} (só em coluna sem pessoa)` : ROTULO_PAPEL_COLUNA[papel],
      marcado: ctx.coluna.papel === papel,
      desabilitado: papel !== 'normal' && !!ctx.coluna.responsavelId,
      executar: () => mudarPapel(ctx, acao, papel),
    })),
  },
  {
    id: 'nucleo-wip', ordem: 130, rotulo: 'Limite WIP…', icone: Gauge,
    executar: (ctx, acao) => { void acao.abrirDialogo('nucleo-limite-wip', { colunaId: ctx.coluna.id }) },
  },
  {
    id: 'nucleo-ordenar', ordem: 200, rotulo: 'Ordenar por…', icone: ArrowDownWideNarrow, executar: nada,
    subitens: (ctx, acao) => ORDENS_COLUNA.map((por) => ({
      id: por, rotulo: ROTULO_ORDEM[por], executar: () => void colunasMutacoes(acao.qc).ordenar(ctx.coluna, por),
    })),
  },
  {
    id: 'nucleo-mover-todos', ordem: 300, rotulo: 'Mover todos os cards…', icone: ArrowRightLeft,
    executar: (ctx, acao) => { void acao.abrirDialogo('nucleo-mover-cards', { colunaId: ctx.coluna.id }) },
  },
  {
    id: 'nucleo-arquivar-todos', ordem: 800, rotulo: 'Arquivar todos os cards', icone: Archive,
    executar: async (ctx, acao) => {
      const n = quantosCards(ctx, acao)
      if (n === 0) return
      const ok = await acao.abrirDialogo('confirmar', {
        titulo: `Arquivar os cards de ${ctx.coluna.nome}?`,
        mensagem: `${plural(n, 'demanda sai', 'demandas saem')} do quadro e ${n === 1 ? 'continua' : 'continuam'} no Arquivo, com o histórico. Dá para desfazer logo depois.`,
        confirmar: 'Arquivar',
      })
      if (ok) await colunasMutacoes(acao.qc).arquivarCards(ctx.coluna)
    },
  },
  {
    id: 'nucleo-arquivar-coluna', ordem: 900, rotulo: 'Arquivar coluna', icone: ArchiveX, perigo: true,
    executar: async (ctx, acao) => { await colunasMutacoes(acao.qc).arquivar(ctx.coluna) },
  },
]
