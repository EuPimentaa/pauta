/**
 * Atalhos do núcleo (PLANO §2, "Teclado"): Cmd+K e /, setas e J/K entre cards, Enter abre, Esc solta o card, `,` e `.`
 * movem para a coluna anterior/próxima, Espaço entra/sai como membro, N criação rápida, Q "Só as minhas", X limpa
 * os filtros, \ recolhe a coluna (Shift+\ todas). No modal: ←/→ e J/K abrem a vizinha da mesma coluna, Espaço membro.
 */
import type { Coluna, Demanda } from '@shared/tipos/index.ts'
import type { Atalho, ContextoAtalho } from '../tipos.ts'
import { bootstrapDe } from '../../api/cache.ts'
import { alternarPaleta, abrirPaleta } from '../../paleta/estado.ts'
import { controleModal, controleQuadro, type Direcao } from '../../teclado/controles.ts'
import { lugarAtual } from '../../teclado/foco.ts'

/** A coluna vizinha (ativa) da demanda no quadro dela. */
function colunaVizinha(ctx: ContextoAtalho, d: Demanda, passo: -1 | 1): Coluna | null {
  const colunas = (bootstrapDe(ctx.qc)?.colunas ?? [])
    .filter((c) => c.quadroId === d.quadroId && c.arquivadaEm === null)
    .sort((a, b) => a.pos - b.pos)
  const i = colunas.findIndex((c) => c.id === d.colunaId)
  return i < 0 ? null : colunas[i + passo] ?? null
}

const moverParaVizinha = (passo: -1 | 1) => (ctx: ContextoAtalho) => {
  const d = ctx.demandaEmFoco
  const destino = d && colunaVizinha(ctx, d, passo)
  if (d && destino) void ctx.acoes.mover(d, { colunaId: destino.id, posicao: { depoisDeId: null } }, 'teclado')
}

const alternarMembro = (ctx: ContextoAtalho) => {
  const d = ctx.demandaEmFoco
  if (!d) return
  const eu = ctx.eu.usuario.id
  void (d.membroIds.includes(eu) ? ctx.acoes.membros.sair(d, eu) : ctx.acoes.membros.entrar(d, eu))
}

const focar = (d: Direcao) => () => controleQuadro()?.moverFoco(d)
const temQuadro = () => !!controleQuadro()
const temCard = (ctx: ContextoAtalho) => !!ctx.demandaEmFoco
const colunaDoFoco = (ctx: ContextoAtalho) => ctx.demandaEmFoco?.colunaId ?? null

export const atalhos: Atalho[] = [
  { id: 'nucleo-paleta', teclas: 'mod+k', descricao: 'Buscar e comandos', escopo: 'global', grupo: 'geral', executar: () => alternarPaleta() },
  { id: 'nucleo-paleta-barra', teclas: '/', descricao: 'Buscar e comandos', escopo: 'global', grupo: 'geral', executar: () => abrirPaleta() },

  // quadro: andar entre os cards
  { id: 'nucleo-card-baixo', teclas: 'j', descricao: 'Próximo card', escopo: 'quadro', grupo: 'quadro', quando: temQuadro, executar: focar('baixo') },
  { id: 'nucleo-card-cima', teclas: 'k', descricao: 'Card anterior', escopo: 'quadro', grupo: 'quadro', quando: temQuadro, executar: focar('cima') },
  { id: 'nucleo-seta-baixo', teclas: 'arrowdown', descricao: 'Próximo card', escopo: 'quadro', grupo: 'quadro', quando: temQuadro, executar: focar('baixo') },
  { id: 'nucleo-seta-cima', teclas: 'arrowup', descricao: 'Card anterior', escopo: 'quadro', grupo: 'quadro', quando: temQuadro, executar: focar('cima') },
  { id: 'nucleo-seta-esquerda', teclas: 'arrowleft', descricao: 'Coluna da esquerda', escopo: 'quadro', grupo: 'quadro', quando: temQuadro, executar: focar('esquerda') },
  { id: 'nucleo-seta-direita', teclas: 'arrowright', descricao: 'Coluna da direita', escopo: 'quadro', grupo: 'quadro', quando: temQuadro, executar: focar('direita') },
  { id: 'nucleo-criar-rapida', teclas: 'n', descricao: 'Adicionar demanda na coluna', escopo: 'quadro', grupo: 'quadro', quando: temQuadro,
    executar: (ctx) => { controleQuadro()?.abrirEntrada(colunaDoFoco(ctx)) } },
  { id: 'nucleo-so-minhas', teclas: 'q', descricao: 'Só as minhas', escopo: 'quadro', grupo: 'quadro', quando: temQuadro,
    executar: () => controleQuadro()?.alternarSoMinhas() },
  { id: 'nucleo-limpar-filtros', teclas: 'x', descricao: 'Limpar os filtros', escopo: 'quadro', grupo: 'quadro', quando: temQuadro,
    executar: () => controleQuadro()?.limparFiltros() },
  { id: 'nucleo-recolher', teclas: '\\', descricao: 'Recolher ou abrir a coluna', escopo: 'quadro', grupo: 'quadro', quando: temQuadro,
    executar: (ctx) => controleQuadro()?.recolher(colunaDoFoco(ctx)) },
  { id: 'nucleo-recolher-todas', teclas: 'shift+\\', descricao: 'Recolher ou abrir todas as colunas', escopo: 'quadro', grupo: 'quadro', quando: temQuadro,
    executar: () => controleQuadro()?.recolherTodas() },

  // card em foco (quadro, Lista, Início, Agenda)
  { id: 'nucleo-abrir', teclas: 'enter', descricao: 'Abrir a demanda', escopo: 'card', grupo: 'demanda', quando: temCard,
    executar: (ctx) => { if (ctx.demandaEmFoco) ctx.navegar(`/d/${ctx.demandaEmFoco.numero}`) } },
  { id: 'nucleo-soltar-card', teclas: 'escape', descricao: 'Tirar o foco do card', escopo: 'card', grupo: 'demanda',
    quando: () => !!lugarAtual().focado,
    executar: () => { (document.activeElement as HTMLElement | null)?.blur() } },
  { id: 'nucleo-coluna-anterior', teclas: ',', descricao: 'Mover para a coluna anterior', escopo: 'card', grupo: 'demanda', quando: temCard,
    executar: moverParaVizinha(-1) },
  { id: 'nucleo-coluna-proxima', teclas: '.', descricao: 'Mover para a próxima coluna', escopo: 'card', grupo: 'demanda', quando: temCard,
    executar: moverParaVizinha(1) },
  { id: 'nucleo-membro', teclas: 'space', descricao: 'Entrar ou sair da demanda', escopo: 'card', grupo: 'demanda', quando: temCard,
    executar: alternarMembro },

  // modal da demanda
  { id: 'nucleo-modal-membro', teclas: 'space', descricao: 'Entrar ou sair da demanda', escopo: 'modal', grupo: 'demanda', quando: temCard,
    executar: alternarMembro },
  { id: 'nucleo-modal-anterior', teclas: 'arrowleft', descricao: 'Demanda anterior da coluna', escopo: 'modal', grupo: 'demanda',
    quando: () => !!controleModal(), executar: () => controleModal()?.vizinha(-1) },
  { id: 'nucleo-modal-proxima', teclas: 'arrowright', descricao: 'Próxima demanda da coluna', escopo: 'modal', grupo: 'demanda',
    quando: () => !!controleModal(), executar: () => controleModal()?.vizinha(1) },
  { id: 'nucleo-modal-k', teclas: 'k', descricao: 'Demanda anterior da coluna', escopo: 'modal', grupo: 'demanda',
    quando: () => !!controleModal(), executar: () => controleModal()?.vizinha(-1) },
  { id: 'nucleo-modal-j', teclas: 'j', descricao: 'Próxima demanda da coluna', escopo: 'modal', grupo: 'demanda',
    quando: () => !!controleModal(), executar: () => controleModal()?.vizinha(1) },
]
