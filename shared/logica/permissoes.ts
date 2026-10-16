/**
 * Permissões por papel e por campo (API.md §2). O front usa para esconder o que não pode; o servidor
 * (server/src/servicos/permissoes.ts) usa para negar com 403. Admin pode tudo.
 */
import type { Anexo, Checklist, Comentario, Demanda } from '../tipos/demandas.ts'
import type { ClienteResumo } from '../tipos/clientes.ts'
import { CAMPOS_CLIENTE_EQUIPE } from '../tipos/clientes.ts'
import { CAMPOS_SO_ATENDIMENTO } from '../tipos/demandas.ts'
import type { Versao } from '../tipos/ciclo.ts'
import type { Apontamento } from '../tipos/horas.ts'
import type { Id, Papel } from '../tipos/nucleo.ts'

export type AcaoPermissao =
  | 'quadro.administrar' | 'automacao.editar' | 'modelo.global' | 'modelos.revisados' | 'cliente.criar'
  | 'cliente.editar' | 'pessoas' | 'config' | 'versao.entregar' | 'versao.editar' | 'ciclo.cliente'
  | 'comentario.visivel_cliente' | 'comentario.editar' | 'comentario.excluir' | 'anexo.excluir'
  | 'checklist_rodada.excluir' | 'checklist_rodada.editar' | 'apontamento.editar' | 'demanda.excluir' | 'horas.outros'

export interface AlvoPermissao {
  demanda?: Pick<Demanda, 'membroIds' | 'atendimentoId'>
  cliente?: Pick<ClienteResumo, 'atendimentoId'>
  versao?: Pick<Versao, 'criadaPor'>
  comentario?: Pick<Comentario, 'autorId'>
  anexo?: Pick<Anexo, 'enviadoPor'>
  checklist?: Pick<Checklist, 'rodadaId'>
  apontamento?: Pick<Apontamento, 'usuarioId'>
}

export interface QuemPede {
  id: Id
  papel: Papel
}

const gestao = (p: Papel) => p === 'admin' || p === 'atendimento'

/**
 * - cliente.criar: todos (a equipe só com CAMPOS_CLIENTE_EQUIPE, conferido por camposProibidos);
 * - cliente.editar: admin; atendimento nos da carteira (atendimentoId = eu) e nos sem AM;
 * - versao.entregar: atendimento, admin e, da equipe, quem é membro ou o AM da demanda;
 * - versao.editar: o autor, atendimento, admin; comentario.editar: o autor; comentario.excluir: o autor ou admin;
 * - anexo.excluir: quem enviou, atendimento, admin; checklist_rodada.excluir e checklist_rodada.editar (renomear,
 *   acrescentar, mudar o texto e tirar itens; marcar e reordenar são livres): atendimento, admin (checklist comum:
 *   todos); apontamento.editar: o dono ou admin.
 */
export function pode(acao: AcaoPermissao, eu: QuemPede, alvo: AlvoPermissao = {}): boolean {
  if (eu.papel === 'admin') return acao !== 'comentario.editar' || alvo.comentario?.autorId === eu.id
  switch (acao) {
    case 'quadro.administrar': case 'modelo.global': case 'modelos.revisados': case 'pessoas': case 'config':
    case 'demanda.excluir': case 'horas.outros':
      return false
    case 'automacao.editar': case 'ciclo.cliente': case 'comentario.visivel_cliente':
      return gestao(eu.papel)
    case 'cliente.criar':
      return true
    case 'cliente.editar':
      return eu.papel === 'atendimento' && (alvo.cliente === undefined || alvo.cliente.atendimentoId === null
        || alvo.cliente.atendimentoId === eu.id)
    case 'versao.entregar':
      return gestao(eu.papel) || (alvo.demanda !== undefined
        && (alvo.demanda.atendimentoId === eu.id || alvo.demanda.membroIds.includes(eu.id)))
    case 'versao.editar':
      return gestao(eu.papel) || alvo.versao?.criadaPor === eu.id
    case 'comentario.editar': case 'comentario.excluir':
      return alvo.comentario !== undefined && alvo.comentario.autorId === eu.id
    case 'anexo.excluir':
      return gestao(eu.papel) || (alvo.anexo !== undefined && alvo.anexo.enviadoPor === eu.id)
    case 'checklist_rodada.excluir': case 'checklist_rodada.editar':
      return gestao(eu.papel) || alvo.checklist?.rodadaId === null
    case 'apontamento.editar':
      return alvo.apontamento !== undefined && alvo.apontamento.usuarioId === eu.id
  }
}

const MOTIVOS: Record<AcaoPermissao, string> = {
  'quadro.administrar': 'Só o admin cria, renomeia, arquiva e exclui quadros.',
  'automacao.editar': 'Só o atendimento e o admin mudam as automações do quadro.',
  'modelo.global': 'Só o admin cria e edita modelos de demanda globais.',
  'modelos.revisados': 'Só o admin marca os modelos como revisados.',
  'cliente.criar': 'Você não pode criar clientes.',
  'cliente.editar': 'Só o atendimento do cliente e o admin editam o cadastro.',
  pessoas: 'Só o admin cuida de pessoas, convites e equipes.',
  config: 'Só o admin muda a configuração.',
  'versao.entregar': 'Entre na demanda para entregar.',
  'versao.editar': 'Só quem entregou a versão, o atendimento e o admin editam a versão.',
  'ciclo.cliente': 'Só o atendimento fala com o cliente.',
  'comentario.visivel_cliente': 'Só o atendimento escreve comentário visível ao cliente.',
  'comentario.editar': 'Só quem escreveu edita o comentário.',
  'comentario.excluir': 'Só quem escreveu e o admin excluem o comentário.',
  'anexo.excluir': 'Só quem enviou, o atendimento e o admin excluem o anexo.',
  'checklist_rodada.excluir': 'Só o atendimento e o admin apagam o checklist de uma rodada.',
  'checklist_rodada.editar': 'O checklist da rodada é o pedido do cliente: só o atendimento e o admin mudam os itens. Marque o que fizer.',
  'apontamento.editar': 'Só o dono das horas e o admin mudam o lançamento.',
  'demanda.excluir': 'Só o admin exclui demandas.',
  'horas.outros': 'Só o admin vê as horas de outra pessoa.',
}

/** Motivo pronto para o aviso ("Só o atendimento fala com o cliente."). */
export function motivoNegado(acao: AcaoPermissao): string {
  return MOTIVOS[acao]
}

/**
 * Campos do modelo de demanda que só atendimento e admin mandam: a demanda herda `rodadasInclusas` do modelo, então a
 * equipe definir no modelo seria definir na demanda (o campo é de CAMPOS_SO_ATENDIMENTO).
 */
export const CAMPOS_MODELO_SO_ATENDIMENTO = ['rodadasInclusas'] as const

/**
 * Campos da entrada que o papel não pode mandar: na demanda, CAMPOS_SO_ATENDIMENTO para a equipe; no modelo de
 * demanda, CAMPOS_MODELO_SO_ATENDIMENTO; no cliente, tudo fora de CAMPOS_CLIENTE_EQUIPE para a equipe. Conta a chave
 * presente, qualquer que seja o valor.
 */
export function camposProibidos(entrada: object, papel: Papel, lista: 'demanda' | 'cliente' | 'modelo' = 'demanda'): string[] {
  if (papel !== 'equipe') return []
  const chaves = Object.keys(entrada).filter((k) => (entrada as Record<string, unknown>)[k] !== undefined)
  if (lista === 'cliente') return chaves.filter((k) => !(CAMPOS_CLIENTE_EQUIPE as readonly string[]).includes(k))
  if (lista === 'modelo') return chaves.filter((k) => (CAMPOS_MODELO_SO_ATENDIMENTO as readonly string[]).includes(k))
  return chaves.filter((k) => (CAMPOS_SO_ATENDIMENTO as readonly string[]).includes(k))
}
