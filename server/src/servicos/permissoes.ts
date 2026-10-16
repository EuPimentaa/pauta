/**
 * Camada única de permissões do servidor (API.md §2): usa shared/logica/permissoes.ts e nega com 403. Nenhuma rota
 * decide papel fora daqui (nem as das funcionalidades).
 */
import { camposProibidos, motivoNegado, pode, type AcaoPermissao, type AlvoPermissao } from '../../../shared/logica/permissoes.ts'
import type { Ator } from '../auth.ts'
import { ErroHttp } from '../erros.ts'

/** 403 sem_permissao com o motivo ("Só o atendimento fala com o cliente."). Cliente e sistema nunca passam. */
export function exigir(ator: Ator, acao: AcaoPermissao, alvo?: AlvoPermissao): void {
  if (!ator.usuario || !ator.papel || !pode(acao, { id: ator.usuario.id, papel: ator.papel }, alvo)) {
    throw new ErroHttp(403, 'sem_permissao', motivoNegado(acao), { acao })
  }
}

/** true se o ator pode (sem lançar). */
export function podeAtor(ator: Ator, acao: AcaoPermissao, alvo?: AlvoPermissao): boolean {
  return !!ator.usuario && !!ator.papel && pode(acao, { id: ator.usuario.id, papel: ator.papel }, alvo)
}

/**
 * Demanda: CAMPOS_SO_ATENDIMENTO só para atendimento e admin; modelo de demanda: CAMPOS_MODELO_SO_ATENDIMENTO idem;
 * cliente: o papel equipe só manda CAMPOS_CLIENTE_EQUIPE. Outro campo → 403 campo_nao_permitido com `detalhes.campo`.
 */
export function exigirCamposPermitidos(ator: Ator, entrada: object, lista: 'demanda' | 'cliente' | 'modelo' = 'demanda'): void {
  if (!ator.papel) return
  const proibidos = camposProibidos(entrada, ator.papel, lista)
  if (proibidos.length > 0) {
    throw new ErroHttp(403, 'campo_nao_permitido', lista === 'cliente'
      ? 'Você cria o cliente só com sigla e nome. O atendimento completa o cadastro.'
      : lista === 'modelo'
        ? 'Só o atendimento e o admin definem as rodadas inclusas do modelo.'
        : 'Só o atendimento e o admin mudam este campo.', { campo: proibidos[0], campos: proibidos })
  }
}
