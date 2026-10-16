/**
 * Menu ··· do modal e de contexto do card (F1, ordens 100–199 do PLANO §4): Mover… (Shift+M), Copiar…, Enviar para ▸
 * (favoritos primeiro, depois por equipe; vai para o topo da coluna de entrada e, com responsável do cliente na equipe
 * do destino, passa a ele), Membros (M), Etiquetas (L), Datas (D), Capa e o cronômetro (T). Tudo por util.acoes e
 * pelos diálogos do F1.
 */
import { ArrowRightLeft, CalendarClock, CopyPlus, Image as IconeImagem, Send, Tag, Timer, Users } from 'lucide-react'
import type { Bootstrap, Quadro } from '@shared/tipos/index.ts'
import { colunaDeEntrada } from '@shared/logica/quadro.ts'
import type { ContextoDemanda, ExtensaoMenuDemanda } from '../tipos.ts'
import { bootstrapAtual } from '../../api/cache.ts'
import { abrirSeletor, alternarCronometro } from '../../funcionalidades/modal/abrir.ts'

const editavel = (ctx: ContextoDemanda) => !ctx.somenteLeitura

/** Os outros quadros ativos para o "Enviar para": favoritos (na ordem do menu) e depois por equipe. */
export function destinosEnviar(b: Bootstrap, atual: string): Quadro[] {
  const ativos = b.quadros.filter((q) => q.arquivadoEm === null && q.id !== atual)
  const fav = b.eu.favoritos.map((id) => ativos.find((q) => q.id === id)).filter((q): q is Quadro => !!q)
  const equipe = (q: Quadro) => b.equipes.find((e) => e.id === q.equipeId)?.nome ?? '￿'
  const resto = ativos.filter((q) => !fav.includes(q))
    .sort((x, y) => equipe(x).localeCompare(equipe(y), 'pt-BR') || x.pos - y.pos)
  return [...fav, ...resto]
}

export const itens: ExtensaoMenuDemanda[] = [
  {
    id: 'modal-mover', ordem: 100, rotulo: 'Mover…', icone: ArrowRightLeft, atalho: 'shift+m', visivel: editavel,
    executar: (ctx, util) => { void util.abrirDialogo('mover-demanda', { demandaId: ctx.demanda.id }) },
  },
  {
    id: 'modal-copiar', ordem: 110, rotulo: 'Copiar…', icone: CopyPlus, visivel: () => true,
    executar: (ctx, util) => { void util.abrirDialogo('copiar-demanda', { demandaId: ctx.demanda.id }) },
  },
  {
    id: 'modal-enviar', ordem: 120, rotulo: 'Enviar para', icone: Send, visivel: (ctx) => editavel(ctx) && (bootstrapAtual()?.quadros.length ?? 0) > 1,
    subitens: (ctx) => {
      const b = bootstrapAtual()
      if (!b) return []
      const fav = new Set(b.eu.favoritos)
      return destinosEnviar(b, ctx.demanda.quadroId).map((q) => ({
        id: q.id,
        rotulo: `${q.nome}${fav.has(q.id) ? ' ★' : ''}`,
        executar: async (util) => {
          const atual = bootstrapAtual()
          const entrada = atual && colunaDeEntrada(atual.colunas, q.id)
          if (!atual || !entrada) return
          const d = atual.demandas.find((x) => x.id === ctx.demanda.id) ?? ctx.demanda
          const cliente = d.clienteId ? atual.clientes.find((c) => c.id === d.clienteId) : undefined
          const resp = q.equipeId ? cliente?.responsaveis.find((r) => r.equipeId === q.equipeId) : undefined
          const ativo = resp && atual.usuarios.some((u) => u.id === resp.usuarioId && u.ativo)
          await util.acoes.mover(d, { colunaId: entrada.id, posicao: { depoisDeId: null }, ...(ativo ? { membros: 'responsavel_destino' as const } : {}) }, 'menu')
        },
      }))
    },
  },
  {
    id: 'modal-membros', ordem: 130, rotulo: 'Membros…', icone: Users, atalho: 'm', visivel: editavel,
    executar: (ctx, util) => abrirSeletor(util.abrirDialogo, 'membros', ctx.demanda),
  },
  {
    id: 'modal-etiquetas', ordem: 140, rotulo: 'Etiquetas…', icone: Tag, atalho: 'l', visivel: editavel,
    executar: (ctx, util) => abrirSeletor(util.abrirDialogo, 'etiquetas', ctx.demanda),
  },
  {
    id: 'modal-datas', ordem: 150, rotulo: 'Datas…', icone: CalendarClock, atalho: 'd', visivel: editavel,
    executar: (ctx, util) => abrirSeletor(util.abrirDialogo, 'datas', ctx.demanda),
  },
  {
    id: 'modal-capa', ordem: 160, rotulo: 'Capa…', icone: IconeImagem, visivel: editavel,
    executar: (ctx, util) => abrirSeletor(util.abrirDialogo, 'capa', ctx.demanda),
  },
  {
    id: 'modal-cronometro', ordem: 170, icone: Timer, atalho: 't', visivel: editavel,
    rotulo: (ctx) => (bootstrapAtual()?.eu.cronometro?.demandaId === ctx.demanda.id ? 'Parar o cronômetro' : 'Ligar o cronômetro'),
    executar: (ctx, util) => alternarCronometro(util.qc, ctx.demanda),
  },
]
