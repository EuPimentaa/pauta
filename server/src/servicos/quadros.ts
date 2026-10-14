/**
 * Quadros (API.md §4.5): criar com modelo (coluna por membro expandida, automações do modelo), copiar, editar,
 * arquivar, restaurar, excluir vazio, estrela e seguir. Também "entrar na equipe": seguir os quadros dela e ganhar a
 * própria coluna nos quadros com `colunaPorMembro` (§4.3). Modelos de quadro e de demanda (leitura).
 */
import type {
  AutomacaoQuadro, Coluna, CopiarQuadroEntrada, CriarQuadroEntrada, EditarQuadroEntrada, Etiqueta, FavoritoEntrada,
  Id, ModeloDemanda, ModeloQuadro, NovaColuna, Quadro, QuadroCompleto, QuadroUsuario,
} from '../../../shared/tipos/index.ts'
import { slugDe } from '../../../shared/logica/quadro.ts'
import { entre } from '../../../shared/logica/posicao.ts'
import { normalizarAlias } from '../../../shared/logica/texto.ts'
import type { Ator } from '../auth.ts'
import { agora, novoId, rodar, todos, um, type Db } from '../db.ts'
import { conflito, naoEncontrado, validacao } from '../erros.ts'
import { desligarAutomacoesPara, gravarAutomacao } from './automacoes.ts'
import { emitirDelete, emitirObjeto } from './eventos.ts'
import { pararCronometros } from './horas.ts'
import { mapear } from './mapear.ts'
import { posicaoEntre } from './posicao.ts'

type Linha = Record<string, unknown>

// ─────────────────────────────── leitura ───────────────────────────────

/** Por id (ou pelo slug, para quem só tem a URL). 404 se não existe. */
export function carregarQuadro(db: Db, idOuSlug: Id): Quadro {
  const l = um<Linha>(db, 'SELECT * FROM quadro WHERE id = ?', idOuSlug) ?? um<Linha>(db, 'SELECT * FROM quadro WHERE slug = ?', idOuSlug)
  if (!l) throw naoEncontrado('Quadro não encontrado.')
  return mapear.quadro(l)
}

export function listarQuadros(db: Db, arquivados: boolean): Quadro[] {
  return todos<Linha>(db, `SELECT * FROM quadro WHERE arquivado_em IS ${arquivados ? 'NOT NULL' : 'NULL'} ORDER BY pos`)
    .map(mapear.quadro)
}

export function carregarColuna(db: Db, id: Id): Coluna {
  const l = um<Linha>(db, 'SELECT * FROM coluna WHERE id = ?', id)
  if (!l) throw naoEncontrado('Coluna não encontrada.')
  return mapear.coluna(l)
}

export function colunasDoQuadro(db: Db, quadroId: Id, incluirArquivadas = false): Coluna[] {
  return todos<Linha>(db, `SELECT * FROM coluna WHERE quadro_id = ? ${incluirArquivadas ? '' : 'AND arquivada_em IS NULL'}
    ORDER BY arquivada_em IS NOT NULL, pos`, quadroId).map(mapear.coluna)
}

export function carregarEtiqueta(db: Db, id: Id): Etiqueta {
  const l = um<Linha>(db, 'SELECT * FROM etiqueta WHERE id = ?', id)
  if (!l) throw naoEncontrado('Etiqueta não encontrada.')
  return mapear.etiqueta(l)
}

export function etiquetasDoQuadro(db: Db, quadroId: Id): Etiqueta[] {
  return todos<Linha>(db, 'SELECT * FROM etiqueta WHERE quadro_id = ? ORDER BY pos', quadroId).map(mapear.etiqueta)
}

export function automacoesDoQuadro(db: Db, quadroId: Id): AutomacaoQuadro[] {
  return todos<Linha>(db, 'SELECT * FROM automacao_quadro WHERE quadro_id = ? ORDER BY gatilho', quadroId).map(mapear.automacao)
}

export function quadroCompleto(db: Db, idOuSlug: Id): QuadroCompleto {
  const quadro = carregarQuadro(db, idOuSlug)
  return {
    quadro,
    colunas: colunasDoQuadro(db, quadro.id, true),
    etiquetas: etiquetasDoQuadro(db, quadro.id),
    automacoes: automacoesDoQuadro(db, quadro.id),
  }
}

export function modelosQuadro(db: Db): ModeloQuadro[] {
  return todos<Linha>(db, 'SELECT * FROM modelo_quadro ORDER BY pos').map((m) => mapear.modeloQuadro(m,
    todos<Linha>(db, 'SELECT * FROM modelo_quadro_coluna WHERE modelo_id = ? ORDER BY pos', m.id),
    todos<Linha>(db, 'SELECT * FROM modelo_quadro_automacao WHERE modelo_id = ? ORDER BY gatilho', m.id)))
}

function montarModeloDemanda(db: Db, l: Linha): ModeloDemanda {
  return mapear.modeloDemanda(l,
    todos<Linha>(db, 'SELECT * FROM modelo_demanda_item WHERE modelo_id = ? ORDER BY pos', l.id),
    todos<Linha>(db, 'SELECT * FROM modelo_demanda_etiqueta WHERE modelo_id = ? ORDER BY nome', l.id))
}

export function carregarModeloDemanda(db: Db, id: Id): ModeloDemanda {
  const l = um<Linha>(db, 'SELECT * FROM modelo_demanda WHERE id = ?', id)
  if (!l) throw naoEncontrado('Modelo de demanda não encontrado.')
  return montarModeloDemanda(db, l)
}

/** Ativos: globais e dos quadros ativos (bootstrap). */
export function modelosDemandaAtivos(db: Db): ModeloDemanda[] {
  return todos<Linha>(db, `
    SELECT m.* FROM modelo_demanda m LEFT JOIN quadro q ON q.id = m.quadro_id
     WHERE m.ativo = 1 AND (m.quadro_id IS NULL OR q.arquivado_em IS NULL) ORDER BY m.quadro_id IS NOT NULL, m.pos`)
    .map((l) => montarModeloDemanda(db, l))
}

// ─────────────────────────────── validações comuns ───────────────────────────────

const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/

/** Nome de quadro ATIVO repetido (sem caixa e sem acento) → 409. */
export function exigirNomeQuadroLivre(db: Db, nome: string, exceto: Id | null): void {
  const alvo = normalizarAlias(nome)
  const ativos = todos<{ id: string; nome: string }>(db, 'SELECT id, nome FROM quadro WHERE arquivado_em IS NULL AND id IS NOT ?', exceto)
  if (ativos.some((q) => normalizarAlias(q.nome) === alvo)) throw conflito(`Já existe um quadro chamado "${nome}".`, { campo: 'nome' })
}

function exigirSlug(db: Db, slug: string, exceto: Id | null): string {
  if (!SLUG.test(slug)) throw validacao('Use só letras minúsculas, números e hífens no endereço.', { slug: 'formato inválido' })
  if (um(db, 'SELECT 1 FROM quadro WHERE slug = ? AND id IS NOT ?', slug, exceto)) {
    throw conflito('Este endereço já é de outro quadro.', { campo: 'slug' })
  }
  return slug
}

/** Slug do nome com -2, -3… se repetir. */
function slugUnico(db: Db, nome: string): string {
  const base = slugDe(nome)
  let slug = base
  for (let i = 2; um(db, 'SELECT 1 FROM quadro WHERE slug = ?', slug); i++) slug = `${base.slice(0, 56)}-${i}`
  return slug
}

function exigirEquipe(db: Db, equipeId: Id | null | undefined): void {
  if (equipeId && !um(db, 'SELECT 1 FROM equipe WHERE id = ?', equipeId)) {
    throw validacao('Equipe inexistente.', { equipeId: 'equipe inexistente' })
  }
}

/** Nome da coluna de uma pessoa: o apelido ou o primeiro nome. */
export function nomeDaColunaDe(u: { nome: string; apelido: string | null }): string {
  return (u.apelido ?? u.nome.trim().split(/\s+/)[0]!).slice(0, 60)
}

function emitirQuadroUsuario(db: Db, quadroId: Id, usuarioId: Id, ator: Ator): QuadroUsuario {
  const l = um<Linha>(db, 'SELECT * FROM quadro_usuario WHERE quadro_id = ? AND usuario_id = ?', quadroId, usuarioId)
  const qu: QuadroUsuario = l ? mapear.quadroUsuario(l) : { quadroId, favoritoPos: null, seguindo: false }
  emitirObjeto(db, 'quadro_usuario', quadroId, qu, ator, { publico: 'usuario', usuarioId })
  return qu
}

/** Liga o "Seguir" (mantém a estrela). Emite quadro_usuario se mudou. */
function seguir(db: Db, quadroId: Id, usuarioId: Id, ator: Ator): void {
  const atual = um<{ seguindo: number }>(db, 'SELECT seguindo FROM quadro_usuario WHERE quadro_id = ? AND usuario_id = ?', quadroId, usuarioId)
  if (atual?.seguindo === 1) return
  rodar(db, `INSERT INTO quadro_usuario (usuario_id, quadro_id, seguindo, atualizado_em) VALUES (?, ?, 1, ?)
             ON CONFLICT (usuario_id, quadro_id) DO UPDATE SET seguindo = 1, atualizado_em = excluded.atualizado_em`,
    usuarioId, quadroId, agora())
  emitirQuadroUsuario(db, quadroId, usuarioId, ator)
}

function membrosAtivosDaEquipe(db: Db, equipeId: Id): { id: string; nome: string; apelido: string | null; cor: string }[] {
  return todos(db, `
    SELECT u.id, u.nome, u.apelido, u.cor FROM equipe_membro em JOIN usuario u ON u.id = em.usuario_id
     WHERE em.equipe_id = ? AND u.ativo = 1 ORDER BY em.principal DESC, lower(u.nome)`, equipeId)
}

// ─────────────────────────────── criar e copiar ───────────────────────────────

interface ColunaPlanejada extends NovaColuna {
  /** Id antigo (cópia) para remapear as automações. */
  origemId?: Id
}

function inserirColunas(db: Db, quadroId: Id, colunas: ColunaPlanejada[], ator: Ator): { porModelo: Map<Id, Id>; porOrigem: Map<Id, Id> } {
  const porModelo = new Map<Id, Id>()
  const porOrigem = new Map<Id, Id>()
  const responsaveis = colunas.map((c) => c.responsavelId).filter((r): r is string => !!r)
  if (new Set(responsaveis).size !== responsaveis.length) {
    throw validacao('Cada pessoa tem uma coluna só.', { colunas: 'responsavelId repetido' })
  }
  if (responsaveis.length > 0) {
    const ativos = new Set(todos<{ id: string }>(db, 'SELECT id FROM usuario WHERE ativo = 1').map((l) => l.id))
    if (responsaveis.some((r) => !ativos.has(r))) throw validacao('A coluna é de uma pessoa inativa.', { colunas: 'responsavelId inativo' })
  }
  colunas.forEach((c, i) => {
    const papel = c.papel ?? 'normal'
    if (c.responsavelId && papel !== 'normal') throw validacao('Coluna de pessoa é sempre de papel normal.', { [`colunas.${i}.papel`]: 'papel inválido' })
    const id = novoId()
    const instante = agora()
    rodar(db, `INSERT INTO coluna (id, quadro_id, nome, cor, papel, responsavel_id, limite_wip, pos, criado_em, atualizado_em)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, quadroId, c.nome.trim(), c.cor ?? null, papel, c.responsavelId ?? null, c.limiteWip ?? null, (i + 1) * 1024, instante, instante)
    if (c.modeloColunaId) porModelo.set(c.modeloColunaId, id)
    if (c.origemId) porOrigem.set(c.origemId, id)
    emitirObjeto(db, 'coluna', id, carregarColuna(db, id), ator)
  })
  return { porModelo, porOrigem }
}

function inserirQuadro(db: Db, q: {
  nome: string; slug: string; descricao: string; cor: string; fundo: string; equipeId: Id | null; modeloQuadroId: Id | null
  colunaPorMembro: boolean; pos: number
}, ator: Ator): Id {
  const id = novoId()
  const instante = agora()
  rodar(db, `INSERT INTO quadro (id, nome, slug, descricao, cor, fundo, equipe_id, modelo_quadro_id, coluna_por_membro, pos,
                                 criado_por, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, q.nome, q.slug, q.descricao, q.cor, q.fundo, q.equipeId, q.modeloQuadroId, q.colunaPorMembro, q.pos,
    ator.usuario?.id ?? null, instante, instante)
  emitirObjeto(db, 'quadro', id, carregarQuadro(db, id), ator)
  return id
}

function seguidoresIniciais(db: Db, quadroId: Id, equipeId: Id | null, seguem: boolean | undefined, ator: Ator): void {
  if (!equipeId || seguem === false) return
  for (const u of membrosAtivosDaEquipe(db, equipeId)) seguir(db, quadroId, u.id, ator)
}

/**
 * POST /api/quadros (API.md §4.5). Colunas: as do corpo; senão as do modelo, com a coluna por_membro virando uma
 * coluna por membro ativo da equipe (principal primeiro, depois por nome); sem nenhum dos dois, vazio.
 */
export function criarQuadro(db: Db, e: CriarQuadroEntrada, ator: Ator): QuadroCompleto {
  const nome = e.nome.trim()
  exigirNomeQuadroLivre(db, nome, null)
  const slug = e.slug ? exigirSlug(db, e.slug, null) : slugUnico(db, nome)
  exigirEquipe(db, e.equipeId)
  const modelo = e.modeloQuadroId ? modelosQuadro(db).find((m) => m.id === e.modeloQuadroId) : null
  if (e.modeloQuadroId && !modelo) throw validacao('Modelo de quadro inexistente.', { modeloQuadroId: 'modelo inexistente' })

  let planejadas: ColunaPlanejada[] = []
  let modeloTemPorMembro = false
  if (e.colunas) {
    planejadas = e.colunas
  } else if (modelo) {
    for (const mc of modelo.colunas) {
      if (mc.porMembro) {
        modeloTemPorMembro = true
        const membros = e.equipeId ? membrosAtivosDaEquipe(db, e.equipeId) : []
        for (const u of membros) planejadas.push({ nome: nomeDaColunaDe(u), cor: u.cor as Coluna['cor'], papel: 'normal', responsavelId: u.id })
      } else {
        planejadas.push({ nome: mc.nome, cor: mc.cor, papel: mc.papel, modeloColunaId: mc.id })
      }
    }
  }
  const colunaPorMembro = e.colunaPorMembro ?? (modeloTemPorMembro || planejadas.some((c) => !!c.responsavelId))
  const pos = posicaoEntre(db, { tabela: 'quadro', coluna: 'pos' }, e.posicao)
  const id = inserirQuadro(db, {
    nome, slug, descricao: e.descricao?.trim() ?? '', cor: e.cor ?? 'grafite', fundo: e.fundo ?? 'liso',
    equipeId: e.equipeId ?? null, modeloQuadroId: e.modeloQuadroId ?? null, colunaPorMembro, pos,
  }, ator)
  const { porModelo } = inserirColunas(db, id, planejadas, ator)
  for (const a of modelo?.automacoes ?? []) {
    const destino = porModelo.get(a.destinoColunaId)
    if (destino) gravarAutomacao(db, { quadroId: id, gatilho: a.gatilho, destinoColunaId: destino, ator })
  }
  seguidoresIniciais(db, id, e.equipeId ?? null, e.membrosDaEquipeSeguem, ator)
  return quadroCompleto(db, id)
}

/**
 * "Copiar quadro" (API.md §4.5): colunas ativas na ordem (com o responsável ainda ativo), colunaPorMembro,
 * etiquetas, automações (as que apontam para o próprio quadro passam a apontar para a cópia; as que levam a outro
 * quadro continuam iguais; as de destino arquivado ficam de fora) e modelos de demanda ativos do quadro. Sem cards,
 * estrelas nem seguidores (os membros da equipe do quadro novo passam a seguir).
 */
export function copiarQuadro(db: Db, origemId: Id, e: CopiarQuadroEntrada, ator: Ator): QuadroCompleto {
  const origem = carregarQuadro(db, origemId)
  const nome = e.nome.trim()
  exigirNomeQuadroLivre(db, nome, null)
  const slug = e.slug ? exigirSlug(db, e.slug, null) : slugUnico(db, nome)
  const equipeId = e.equipeId === undefined ? origem.equipeId : e.equipeId
  exigirEquipe(db, equipeId)
  const ativos = new Set(todos<{ id: string }>(db, 'SELECT id FROM usuario WHERE ativo = 1').map((l) => l.id))
  const colunas = colunasDoQuadro(db, origem.id).map((c): ColunaPlanejada => ({
    nome: c.nome, cor: c.cor, papel: c.papel, limiteWip: c.limiteWip, origemId: c.id,
    responsavelId: c.responsavelId && ativos.has(c.responsavelId) ? c.responsavelId : null,
  }))
  const pos = posicaoEntre(db, { tabela: 'quadro', coluna: 'pos' }, e.posicao)
  const id = inserirQuadro(db, {
    nome, slug, descricao: e.descricao?.trim() ?? origem.descricao, cor: e.cor ?? origem.cor, fundo: e.fundo ?? origem.fundo,
    equipeId, modeloQuadroId: origem.modeloQuadroId, colunaPorMembro: origem.colunaPorMembro, pos,
  }, ator)
  const { porOrigem } = inserirColunas(db, id, colunas, ator)
  for (const et of etiquetasDoQuadro(db, origem.id)) {
    const novaId = novoId()
    rodar(db, 'INSERT INTO etiqueta (id, quadro_id, nome, cor, pos, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
      novaId, id, et.nome, et.cor, et.pos, agora())
    emitirObjeto(db, 'etiqueta', novaId, carregarEtiqueta(db, novaId), ator)
  }
  for (const a of automacoesDoQuadro(db, origem.id)) {
    const destino = a.destinoQuadroId === origem.id ? porOrigem.get(a.destinoColunaId) : a.destinoColunaId
    if (!destino) continue
    const destinoAtivo = um(db, `SELECT 1 FROM coluna c JOIN quadro q ON q.id = c.quadro_id
                                  WHERE c.id = ? AND c.arquivada_em IS NULL AND q.arquivado_em IS NULL`, destino)
    if (!destinoAtivo) continue
    gravarAutomacao(db, { quadroId: id, gatilho: a.gatilho, destinoColunaId: destino, membros: a.membros, ativa: a.ativa, ator })
  }
  const modelos = todos<Linha>(db, 'SELECT * FROM modelo_demanda WHERE quadro_id = ? AND ativo = 1 ORDER BY pos', origem.id)
  for (const m of modelos) {
    const novoModelo = novoId()
    const instante = agora()
    rodar(db, `INSERT INTO modelo_demanda (id, quadro_id, nome, descricao, icone, briefing_md, prazo_dias_uteis, prioridade,
                 estimativa_min, rodadas_inclusas, ativo, pos, criado_por, criado_em, atualizado_em)
               SELECT ?, ?, nome, descricao, icone, briefing_md, prazo_dias_uteis, prioridade, estimativa_min, rodadas_inclusas,
                 1, pos, ?, ?, ? FROM modelo_demanda WHERE id = ?`,
      novoModelo, id, ator.usuario?.id ?? null, instante, instante, m.id)
    for (const item of todos<Linha>(db, 'SELECT * FROM modelo_demanda_item WHERE modelo_id = ? ORDER BY pos', m.id)) {
      rodar(db, 'INSERT INTO modelo_demanda_item (id, modelo_id, checklist, texto, pos) VALUES (?, ?, ?, ?, ?)',
        novoId(), novoModelo, item.checklist, item.texto, item.pos)
    }
    rodar(db, 'INSERT INTO modelo_demanda_etiqueta (modelo_id, nome, cor) SELECT ?, nome, cor FROM modelo_demanda_etiqueta WHERE modelo_id = ?',
      novoModelo, m.id)
    emitirObjeto(db, 'modelo_demanda', novoModelo, carregarModeloDemanda(db, novoModelo), ator)
  }
  seguidoresIniciais(db, id, equipeId, e.membrosDaEquipeSeguem, ator)
  return quadroCompleto(db, id)
}

// ─────────────────────────────── editar, arquivar, restaurar, excluir ───────────────────────────────

export function editarQuadro(db: Db, id: Id, e: EditarQuadroEntrada, ator: Ator): Quadro {
  const atual = carregarQuadro(db, id)
  const nome = e.nome?.trim() ?? atual.nome
  if (atual.arquivadoEm === null && normalizarAlias(nome) !== normalizarAlias(atual.nome)) exigirNomeQuadroLivre(db, nome, atual.id)
  const slug = e.slug !== undefined && e.slug !== atual.slug ? exigirSlug(db, e.slug, atual.id) : atual.slug
  if (e.equipeId !== undefined) exigirEquipe(db, e.equipeId)
  const pos = e.posicao ? posicaoEntre(db, { tabela: 'quadro', coluna: 'pos' }, e.posicao, atual.id) : atual.pos
  rodar(db, `UPDATE quadro SET nome = ?, slug = ?, descricao = ?, cor = ?, fundo = ?, equipe_id = ?, coluna_por_membro = ?, pos = ?,
               atualizado_em = ? WHERE id = ?`,
    nome, slug, e.descricao?.trim() ?? atual.descricao, e.cor ?? atual.cor, e.fundo ?? atual.fundo,
    e.equipeId === undefined ? atual.equipeId : e.equipeId, e.colunaPorMembro ?? atual.colunaPorMembro, pos, agora(), atual.id)
  const quadro = carregarQuadro(db, atual.id)
  emitirObjeto(db, 'quadro', quadro.id, quadro, ator)
  return quadro
}

/**
 * Arquivar (API.md §4.5): as demandas saem do bootstrap junto com o quadro (não mudam); desliga as automações de
 * outros quadros que apontam para ele; para os cronômetros ligados nas demandas dele.
 */
export function arquivarQuadro(db: Db, id: Id, ator: Ator): Quadro {
  const atual = carregarQuadro(db, id)
  if (atual.arquivadoEm) throw conflito('Este quadro já está arquivado.')
  rodar(db, 'UPDATE quadro SET arquivado_em = ?, arquivado_por = ?, atualizado_em = ? WHERE id = ?',
    agora(), ator.usuario?.id ?? null, agora(), atual.id)
  desligarAutomacoesPara(db, { quadroId: atual.id, excetoQuadroId: atual.id }, ator)
  pararCronometros(db, { quadroId: atual.id }, ator)
  const quadro = carregarQuadro(db, atual.id)
  emitirObjeto(db, 'quadro', quadro.id, quadro, ator)
  return quadro
}

export function restaurarQuadro(db: Db, id: Id, ator: Ator): QuadroCompleto {
  const atual = carregarQuadro(db, id)
  if (!atual.arquivadoEm) throw conflito('Este quadro não está arquivado.')
  exigirNomeQuadroLivre(db, atual.nome, atual.id)
  rodar(db, 'UPDATE quadro SET arquivado_em = NULL, arquivado_por = NULL, atualizado_em = ? WHERE id = ?', agora(), atual.id)
  const quadro = carregarQuadro(db, atual.id)
  emitirObjeto(db, 'quadro', quadro.id, quadro, ator)
  return quadroCompleto(db, atual.id)
}

/**
 * Só se o quadro nunca teve demanda (gatilho quadro_com_historico → 409). Leva colunas, etiquetas, estrelas,
 * automações (as dele e as que apontavam para ele) e modelos do quadro.
 */
export function excluirQuadro(db: Db, id: Id, ator: Ator): void {
  const atual = carregarQuadro(db, id)
  const colunas = todos<{ id: string }>(db, 'SELECT id FROM coluna WHERE quadro_id = ?', atual.id)
  const etiquetas = todos<{ id: string }>(db, 'SELECT id FROM etiqueta WHERE quadro_id = ?', atual.id)
  const automacoes = todos<{ quadro_id: string; gatilho: string }>(db,
    'SELECT quadro_id, gatilho FROM automacao_quadro WHERE quadro_id = ? OR destino_quadro_id = ?', atual.id, atual.id)
  const modelos = todos<{ id: string }>(db, 'SELECT id FROM modelo_demanda WHERE quadro_id = ?', atual.id)
  const usuarios = todos<{ usuario_id: string }>(db, 'SELECT usuario_id FROM quadro_usuario WHERE quadro_id = ?', atual.id)
  rodar(db, 'DELETE FROM quadro WHERE id = ?', atual.id)
  for (const a of automacoes) emitirDelete(db, 'automacao', `${a.quadro_id}:${a.gatilho}`, ator)
  for (const m of modelos) emitirDelete(db, 'modelo_demanda', m.id, ator)
  for (const et of etiquetas) emitirDelete(db, 'etiqueta', et.id, ator)
  for (const c of colunas) emitirDelete(db, 'coluna', c.id, ator)
  for (const u of usuarios) emitirDelete(db, 'quadro_usuario', atual.id, ator, { publico: 'usuario', usuarioId: u.usuario_id })
  emitirDelete(db, 'quadro', atual.id, ator)
}

// ─────────────────────────────── estrela e seguir ───────────────────────────────

/** Sem estrela e sem seguir, a linha sai. */
function gravarQuadroUsuario(db: Db, quadroId: Id, usuarioId: Id, favoritoPos: number | null, seguindo: boolean, ator: Ator): QuadroUsuario {
  if (favoritoPos === null && !seguindo) {
    rodar(db, 'DELETE FROM quadro_usuario WHERE quadro_id = ? AND usuario_id = ?', quadroId, usuarioId)
  } else {
    rodar(db, `INSERT INTO quadro_usuario (usuario_id, quadro_id, favorito_pos, seguindo, atualizado_em) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (usuario_id, quadro_id) DO UPDATE SET favorito_pos = excluded.favorito_pos,
                 seguindo = excluded.seguindo, atualizado_em = excluded.atualizado_em`,
      usuarioId, quadroId, favoritoPos, seguindo, agora())
  }
  return emitirQuadroUsuario(db, quadroId, usuarioId, ator)
}

export function definirFavorito(db: Db, quadroId: Id, e: FavoritoEntrada, ator: Ator): QuadroUsuario {
  const quadro = carregarQuadro(db, quadroId)
  const eu = ator.usuario!.id
  const atual = um<{ favorito_pos: number | null; seguindo: number }>(db,
    'SELECT favorito_pos, seguindo FROM quadro_usuario WHERE quadro_id = ? AND usuario_id = ?', quadro.id, eu)
  let pos: number | null = null
  if (e.favorito) {
    const outros = todos<{ quadro_id: string; favorito_pos: number }>(db, `
      SELECT quadro_id, favorito_pos FROM quadro_usuario
       WHERE usuario_id = ? AND favorito_pos IS NOT NULL AND quadro_id <> ? ORDER BY favorito_pos`, eu, quadro.id)
    const depoisDe = e.posicao?.depoisDeQuadroId
    if (depoisDe === undefined) {
      pos = atual?.favorito_pos ?? entre(outros.at(-1)?.favorito_pos ?? null, null)
    } else if (depoisDe === null) {
      pos = entre(null, outros[0]?.favorito_pos ?? null)
    } else {
      const i = outros.findIndex((o) => o.quadro_id === depoisDe)
      if (i < 0) throw validacao('Esse quadro não está nos seus favoritos.', { posicao: 'quadro fora dos favoritos' })
      pos = entre(outros[i]!.favorito_pos, outros[i + 1]?.favorito_pos ?? null)
    }
    if (outros.some((o, i) => i > 0 && Math.abs(o.favorito_pos - outros[i - 1]!.favorito_pos) < 1e-6)
      || outros.some((o) => Math.abs(o.favorito_pos - pos!) < 1e-6)) {
      // folga esgotada: renumera os favoritos da pessoa e recalcula
      outros.forEach((o, i) => rodar(db, 'UPDATE quadro_usuario SET favorito_pos = ? WHERE usuario_id = ? AND quadro_id = ?',
        (i + 1) * 1024, eu, o.quadro_id))
      outros.forEach((o) => emitirQuadroUsuario(db, o.quadro_id, eu, ator))
      return definirFavorito(db, quadroId, e, ator)
    }
  }
  return gravarQuadroUsuario(db, quadro.id, eu, pos, atual?.seguindo === 1, ator)
}

export function definirSeguir(db: Db, quadroId: Id, seguindo: boolean, ator: Ator): QuadroUsuario {
  const quadro = carregarQuadro(db, quadroId)
  const eu = ator.usuario!.id
  const atual = um<{ favorito_pos: number | null }>(db,
    'SELECT favorito_pos FROM quadro_usuario WHERE quadro_id = ? AND usuario_id = ?', quadro.id, eu)
  return gravarQuadroUsuario(db, quadro.id, eu, atual?.favorito_pos ?? null, seguindo, ator)
}

// ─────────────────────────────── entrar na equipe ───────────────────────────────

/** A pessoa passa a seguir os quadros ativos da equipe. */
export function seguirQuadrosDaEquipe(db: Db, usuarioId: Id, equipeId: Id, ator: Ator): void {
  for (const q of todos<{ id: string }>(db, 'SELECT id FROM quadro WHERE equipe_id = ? AND arquivado_em IS NULL', equipeId)) {
    seguir(db, q.id, usuarioId, ator)
  }
}

/**
 * A própria coluna em cada quadro ativo da equipe com `colunaPorMembro` onde a pessoa ainda não tem coluna ativa:
 * nome = apelido ou primeiro nome, cor = a da pessoa, papel normal, logo depois da última coluna com responsável
 * (sem nenhuma, logo depois da coluna de entrada). API.md §4.3.
 */
export function criarColunasDaPessoa(db: Db, usuarioId: Id, equipeId: Id, ator: Ator): Coluna[] {
  const u = um<{ nome: string; apelido: string | null; cor: string; ativo: number }>(db,
    'SELECT nome, apelido, cor, ativo FROM usuario WHERE id = ?', usuarioId)
  if (!u || u.ativo !== 1) return []
  const criadas: Coluna[] = []
  const quadros = todos<{ id: string }>(db, `
    SELECT id FROM quadro WHERE equipe_id = ? AND arquivado_em IS NULL AND coluna_por_membro = 1 ORDER BY pos`, equipeId)
  for (const q of quadros) {
    if (um(db, 'SELECT 1 FROM coluna WHERE quadro_id = ? AND responsavel_id = ? AND arquivada_em IS NULL', q.id, usuarioId)) continue
    const colunas = colunasDoQuadro(db, q.id)
    const ultimaDePessoa = colunas.filter((c) => c.responsavelId !== null).at(-1)
    const ancora = ultimaDePessoa ?? colunas.find((c) => c.papel === 'normal') ?? colunas[0]
    const pos = posicaoEntre(db, { tabela: 'coluna', coluna: 'pos', escopo: { coluna: 'quadro_id', valor: q.id } },
      ancora ? { depoisDeId: ancora.id } : undefined)
    const id = novoId()
    const instante = agora()
    rodar(db, `INSERT INTO coluna (id, quadro_id, nome, cor, papel, responsavel_id, pos, criado_em, atualizado_em)
               VALUES (?, ?, ?, ?, 'normal', ?, ?, ?, ?)`, id, q.id, nomeDaColunaDe(u), u.cor, usuarioId, pos, instante, instante)
    const coluna = carregarColuna(db, id)
    emitirObjeto(db, 'coluna', id, coluna, ator)
    criadas.push(coluna)
  }
  return criadas
}
