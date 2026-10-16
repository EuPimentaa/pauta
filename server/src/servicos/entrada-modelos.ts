/**
 * Modelos de demanda (API.md §4.9): globais (quadroId nulo; só o admin cria e edita) e de um quadro (qualquer
 * pessoa). Nome único entre os ativos do mesmo escopo (sem caixa e sem acento). "Excluir" = desativar (as demandas
 * criadas com ele continuam com o modeloId). `itens` e `etiquetas` substituem as listas. Cada mudança emite
 * `modelo_demanda` com o objeto inteiro (o tratador do núcleo tira do bootstrap o inativo).
 * "Revisei os modelos" (Primeiros passos): grava o instante em `configuracao` (só o admin; sem SSE).
 */
import type {
  CriarModeloDemandaEntrada, EditarModeloDemandaEntrada, Id, ModeloDemanda, ModeloDemandaEtiqueta, ModelosRevisadosSaida,
} from '../../../shared/tipos/index.ts'
import { normalizarAlias } from '../../../shared/logica/texto.ts'
import type { Ator } from '../auth.ts'
import { agora, novoId, rodar, todos, um, type Db } from '../db.ts'
import { conflito, estadoInvalido, naoEncontrado, validacao } from '../erros.ts'
import { gravarConfig, lerConfig } from './config-app.ts'
import { emitirObjeto } from './eventos.ts'
import { exigir, exigirCamposPermitidos } from './permissoes.ts'
import { posicaoEntre } from './posicao.ts'
import { carregarModeloDemanda } from './quadros.ts'

/** GET /api/modelos-demanda: os ativos (globais e de quadros ativos); com `inativos`, também os desativados. */
export function listarModelos(db: Db, inativos: boolean): ModeloDemanda[] {
  const linhas = todos<{ id: string }>(db, `
    SELECT m.id FROM modelo_demanda m LEFT JOIN quadro q ON q.id = m.quadro_id
     WHERE (m.quadro_id IS NULL OR q.arquivado_em IS NULL) ${inativos ? '' : 'AND m.ativo = 1'}
     ORDER BY m.quadro_id IS NOT NULL, m.quadro_id, m.pos, m.id`)
  return linhas.map((l) => carregarModeloDemanda(db, l.id))
}

/** Quadro do modelo: existe (400) e está ativo (422). */
function exigirQuadroAtivo(db: Db, quadroId: Id): void {
  const q = um<{ arquivado_em: string | null }>(db, 'SELECT arquivado_em FROM quadro WHERE id = ?', quadroId)
  if (!q) throw validacao('Quadro inexistente.', { quadroId: 'quadro inexistente' })
  if (q.arquivado_em) throw estadoInvalido('Este quadro está arquivado.')
}

/** Global: só o admin (`modelo.global`); de um quadro: qualquer pessoa. */
function exigirEscopo(ator: Ator, quadroId: Id | null): void {
  if (quadroId === null) exigir(ator, 'modelo.global')
}

/** Nome livre entre os ativos do escopo (sem caixa e sem acento) → 409. */
function exigirNomeLivre(db: Db, quadroId: Id | null, nome: string, exceto: Id | null): void {
  const alvo = normalizarAlias(nome)
  const ativos = todos<{ id: string; nome: string }>(db,
    'SELECT id, nome FROM modelo_demanda WHERE ativo = 1 AND quadro_id IS ? AND id IS NOT ?', quadroId, exceto)
  if (ativos.some((m) => normalizarAlias(m.nome) === alvo)) {
    throw conflito(`Já existe um modelo chamado "${nome}" ${quadroId ? 'neste quadro' : 'entre os globais'}.`, { campo: 'nome' })
  }
}

/** Etiquetas padrão: nome sem espaço nas pontas, sem repetir (sem caixa e sem acento; fica a primeira). */
function etiquetasLimpas(lista: ModeloDemandaEtiqueta[]): ModeloDemandaEtiqueta[] {
  const vistas = new Set<string>()
  const saida: ModeloDemandaEtiqueta[] = []
  for (const e of lista) {
    const nome = e.nome.trim().slice(0, 40)
    const chave = normalizarAlias(nome)
    if (!chave || vistas.has(chave)) continue
    vistas.add(chave)
    saida.push({ nome, cor: e.cor })
  }
  return saida
}

function gravarItens(db: Db, modeloId: Id, itens: { checklist?: string; texto: string }[]): void {
  rodar(db, 'DELETE FROM modelo_demanda_item WHERE modelo_id = ?', modeloId)
  itens.map((i) => ({ checklist: i.checklist?.trim() || 'Checklist', texto: i.texto.trim() })).filter((i) => i.texto)
    .forEach((i, n) => {
      rodar(db, 'INSERT INTO modelo_demanda_item (id, modelo_id, checklist, texto, pos) VALUES (?, ?, ?, ?, ?)',
        novoId(), modeloId, i.checklist.slice(0, 200), i.texto.slice(0, 2000), (n + 1) * 1024)
    })
}

function gravarEtiquetas(db: Db, modeloId: Id, etiquetas: ModeloDemandaEtiqueta[]): void {
  rodar(db, 'DELETE FROM modelo_demanda_etiqueta WHERE modelo_id = ?', modeloId)
  for (const e of etiquetasLimpas(etiquetas)) {
    rodar(db, 'INSERT INTO modelo_demanda_etiqueta (modelo_id, nome, cor) VALUES (?, ?, ?)', modeloId, e.nome, e.cor)
  }
}

function emitirModelo(db: Db, id: Id, ator: Ator): ModeloDemanda {
  const m = carregarModeloDemanda(db, id)
  emitirObjeto(db, 'modelo_demanda', id, m, ator)
  return m
}

/** POST /api/modelos-demanda. */
export function criarModelo(db: Db, e: CriarModeloDemandaEntrada, ator: Ator): ModeloDemanda {
  const quadroId = e.quadroId ?? null
  exigirEscopo(ator, quadroId)
  exigirCamposPermitidos(ator, e, 'modelo')
  if (quadroId) exigirQuadroAtivo(db, quadroId)
  const nome = e.nome.trim()
  exigirNomeLivre(db, quadroId, nome, null)
  const id = novoId()
  const instante = agora()
  const pos = posicaoEntre(db, { tabela: 'modelo_demanda', coluna: 'pos', escopo: { coluna: 'quadro_id', valor: quadroId } }, undefined)
  rodar(db, `INSERT INTO modelo_demanda (id, quadro_id, nome, descricao, icone, briefing_md, prazo_dias_uteis, prioridade,
               estimativa_min, rodadas_inclusas, ativo, pos, criado_por, criado_em, atualizado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    id, quadroId, nome, e.descricao?.trim() ?? '', e.icone ?? null, e.briefingMd ?? '', e.prazoDiasUteis ?? null, e.prioridade ?? null,
    e.estimativaMin ?? null, e.rodadasInclusas ?? null, pos, ator.usuario?.id ?? null, instante, instante)
  if (e.itens) gravarItens(db, id, e.itens)
  if (e.etiquetas) gravarEtiquetas(db, id, e.etiquetas)
  return emitirModelo(db, id, ator)
}

const PARA_COLUNA = {
  nome: 'nome', descricao: 'descricao', icone: 'icone', briefingMd: 'briefing_md', prazoDiasUteis: 'prazo_dias_uteis',
  prioridade: 'prioridade', estimativaMin: 'estimativa_min', rodadasInclusas: 'rodadas_inclusas',
} as const satisfies Partial<Record<keyof EditarModeloDemandaEntrada, string>>

/** PATCH /api/modelos-demanda/:id (`ativo: false` desativa; reativar confere o nome de novo). */
export function editarModelo(db: Db, id: Id, e: EditarModeloDemandaEntrada, ator: Ator): ModeloDemanda {
  const l = um<{ id: string; quadro_id: string | null; nome: string; ativo: number }>(db,
    'SELECT id, quadro_id, nome, ativo FROM modelo_demanda WHERE id = ?', id)
  if (!l) throw naoEncontrado('Modelo de demanda não encontrado.')
  exigirEscopo(ator, l.quadro_id)
  exigirCamposPermitidos(ator, e, 'modelo')
  if (l.quadro_id) exigirQuadroAtivo(db, l.quadro_id)

  const campos: Record<string, unknown> = {}
  for (const [k, coluna] of Object.entries(PARA_COLUNA) as [keyof typeof PARA_COLUNA, string][]) {
    const v = e[k]
    if (v === undefined) continue
    campos[coluna] = typeof v === 'string' && k !== 'briefingMd' ? v.trim() : v
  }
  const nome = (campos.nome as string | undefined) ?? l.nome
  const ativo = e.ativo ?? l.ativo === 1
  if (ativo && (campos.nome !== undefined || (e.ativo === true && l.ativo === 0))) exigirNomeLivre(db, l.quadro_id, nome, id)
  if (e.ativo !== undefined) campos.ativo = e.ativo ? 1 : 0
  if (e.posicao) {
    campos.pos = posicaoEntre(db, { tabela: 'modelo_demanda', coluna: 'pos', escopo: { coluna: 'quadro_id', valor: l.quadro_id } }, e.posicao, id)
  }
  campos.atualizado_em = agora()
  const chaves = Object.keys(campos)
  rodar(db, `UPDATE modelo_demanda SET ${chaves.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...chaves.map((k) => campos[k]), id)
  if (e.itens) gravarItens(db, id, e.itens)
  if (e.etiquetas) gravarEtiquetas(db, id, e.etiquetas)
  return emitirModelo(db, id, ator)
}

/** POST /api/modelos-demanda/revisados (admin). */
export function marcarRevisados(db: Db, ator: Ator): ModelosRevisadosSaida {
  exigir(ator, 'modelos.revisados')
  const instante = agora()
  gravarConfig(db, 'modelosRevisadosEm', instante, ator.usuario?.id ?? null)
  // as outras janelas veem o passo "Revisar os modelos" feito (entidade config, integração da Onda 3)
  emitirObjeto(db, 'config', 'app', lerConfig(db), ator)
  return { modelosRevisadosEm: instante }
}
