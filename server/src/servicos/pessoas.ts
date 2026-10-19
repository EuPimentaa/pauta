/**
 * Pessoas, convites/redefinições e equipes (API.md §4.3 e §4.4). "Entrar numa equipe" = seguir os quadros ativos
 * dela e ganhar a própria coluna nos quadros com `colunaPorMembro` (servicos/quadros.ts).
 */
import type {
  CriarEquipeEntrada, CriarPessoaEntrada, CriarPessoaSaida, EditarEquipeEntrada, EditarPessoaEntrada, Equipe,
  EquipeMembro, Eu, Id, LinkAcesso, Prefs, Usuario, UsuarioResumo,
} from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { revogarSessoes } from '../auth.ts'
import { config } from '../config.ts'
import { agora, depoisDoCommit, marcadores, novoId, rodar, todos, um, type Db } from '../db.ts'
import { conflito, naoEncontrado, validacao } from '../erros.ts'
import { fecharConexoesDe } from '../tempo-real.ts'
import { lerConfig } from './config-app.ts'
import { gerarToken } from './cripto.ts'
import { emitirObjeto } from './eventos.ts'
import { pararCronometros } from './horas.ts'
import { mapear } from './mapear.ts'
import { revogarConexoesDe } from './oauth.ts'
import { posicaoEntre } from './posicao.ts'
import { criarColunasDaPessoa, seguirQuadrosDaEquipe } from './quadros.ts'

type Linha = Record<string, unknown>

/** SELECT de usuario com `equipe_ids` e `convite_expira_em`. O primeiro parâmetro é o instante atual. */
const SQL_USUARIO = `
  SELECT u.*,
    (SELECT json_group_array(equipe_id) FROM (
       SELECT em.equipe_id FROM equipe_membro em JOIN equipe e ON e.id = em.equipe_id
        WHERE em.usuario_id = u.id ORDER BY em.principal DESC, e.pos)) AS equipe_ids,
    (SELECT max(t.expira_em) FROM token_acesso t
      WHERE t.usuario_id = u.id AND t.finalidade = 'convite' AND t.usado_em IS NULL AND t.revogado_em IS NULL
        AND t.expira_em > ?) AS convite_expira_em
  FROM usuario u`

export function carregarUsuario(db: Db, id: Id): Usuario {
  const l = um<Linha>(db, `${SQL_USUARIO} WHERE u.id = ?`, agora(), id)
  if (!l) throw naoEncontrado('Pessoa não encontrada.')
  return mapear.usuario(l)
}

export function listarUsuarios(db: Db): Usuario[] {
  return todos<Linha>(db, `${SQL_USUARIO} ORDER BY u.ativo DESC, lower(u.nome)`, agora()).map(mapear.usuario)
}

export function usuariosResumo(db: Db): UsuarioResumo[] {
  return todos<Linha>(db, `${SQL_USUARIO} ORDER BY lower(u.nome)`, agora()).map(mapear.usuarioResumo)
}

/** Pessoas ativas (Set de ids). */
export function idsAtivos(db: Db): Set<Id> {
  return new Set(todos<{ id: string }>(db, 'SELECT id FROM usuario WHERE ativo = 1').map((l) => l.id))
}

/** 400 se algum id não for de pessoa ativa. */
export function exigirAtivos(db: Db, ids: Id[], campo: string): void {
  if (ids.length === 0) return
  const unicos = [...new Set(ids)]
  const n = um<{ n: number }>(db, `SELECT count(*) AS n FROM usuario WHERE ativo = 1 AND id IN (${marcadores(unicos.length)})`, ...unicos)!.n
  if (n !== unicos.length) throw validacao('Escolha pessoas ativas.', { [campo]: 'pessoa inexistente ou inativa' })
}

export function montarEu(db: Db, usuarioId: Id): Eu {
  const usuario = carregarUsuario(db, usuarioId)
  const prefs = JSON.parse(um<{ prefs: string }>(db, 'SELECT prefs FROM usuario WHERE id = ?', usuarioId)!.prefs) as Prefs
  const marcas = todos<{ quadro_id: string; favorito_pos: number | null; seguindo: number }>(db, `
    SELECT qu.quadro_id, qu.favorito_pos, qu.seguindo FROM quadro_usuario qu JOIN quadro q ON q.id = qu.quadro_id
     WHERE qu.usuario_id = ? AND q.arquivado_em IS NULL ORDER BY qu.favorito_pos, q.pos`, usuarioId)
  const cronometro = um<Linha>(db, `
    SELECT * FROM apontamento WHERE usuario_id = ? AND origem = 'cronometro' AND parado_em IS NULL AND excluido_em IS NULL`,
    usuarioId)
  return {
    usuario,
    prefs,
    favoritos: marcas.filter((m) => m.favorito_pos !== null).map((m) => m.quadro_id),
    seguindo: marcas.filter((m) => m.seguindo === 1).map((m) => m.quadro_id),
    cronometro: cronometro ? mapear.apontamento(cronometro) : null,
    rotaInicial: '/inicio',
  }
}

function emitirUsuario(db: Db, id: Id, ator: Ator): void {
  const u = carregarUsuario(db, id)
  const resumo: UsuarioResumo = {
    id: u.id, nome: u.nome, apelido: u.apelido, papel: u.papel, cor: u.cor, ativo: u.ativo, equipeIds: u.equipeIds,
  }
  emitirObjeto(db, 'usuario', id, resumo, ator)
}

// ─────────────────────────────── convite e redefinição ───────────────────────────────

/**
 * Gera o link de uso único. Revoga os links pendentes da pessoa, das duas finalidades: uma redefinição nova invalida
 * o convite que ainda circula (e vice-versa), então nunca há dois links que trocam a senha da mesma pessoa. O token vai
 * só no fragmento da URL.
 */
export function gerarLinkAcesso(db: Db, usuarioId: Id, finalidade: 'convite' | 'redefinicao', ator: Ator): LinkAcesso {
  const cfg = lerConfig(db)
  const instante = agora()
  revogarTokens(db, usuarioId)
  const validadeMs = finalidade === 'convite' ? cfg.conviteValidadeDias * 86_400_000 : cfg.redefinicaoValidadeHoras * 3_600_000
  const expiraEm = new Date(Date.parse(instante) + validadeMs).toISOString()
  const { token, hash } = gerarToken()
  rodar(db, `INSERT INTO token_acesso (id, usuario_id, finalidade, token_hash, expira_em, criado_por, criado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, novoId(), usuarioId, finalidade, hash, expiraEm, ator.usuario?.id ?? null, instante)
  return { url: `${config.appUrl}/${finalidade === 'convite' ? 'convite' : 'redefinir'}#${token}`, expiraEm }
}

/** Revoga todos os links pendentes (convite e redefinição) da pessoa. */
export function revogarTokens(db: Db, usuarioId: Id): void {
  rodar(db, 'UPDATE token_acesso SET revogado_em = ? WHERE usuario_id = ? AND usado_em IS NULL AND revogado_em IS NULL',
    agora(), usuarioId)
}

// ─────────────────────────────── pessoas ───────────────────────────────

function exigirEmailLivre(db: Db, email: string, exceto: Id | null): void {
  const l = um<{ id: string }>(db, 'SELECT id FROM usuario WHERE email = ? AND id IS NOT ?', email, exceto)
  if (l) throw conflito('Este e-mail já está cadastrado.', { campo: 'email' })
}

function exigirApelidoLivre(db: Db, apelido: string | null, exceto: Id | null): void {
  if (!apelido) return
  const l = um<{ id: string }>(db, 'SELECT id FROM usuario WHERE ativo = 1 AND lower(apelido) = lower(?) AND id IS NOT ?', apelido, exceto)
  if (l) throw conflito(`O apelido "${apelido}" já é de outra pessoa.`, { campo: 'apelido' })
}

function exigirEquipesExistem(db: Db, ids: Id[]): void {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return
  const n = um<{ n: number }>(db, `SELECT count(*) AS n FROM equipe WHERE id IN (${marcadores(unicos.length)})`, ...unicos)!.n
  if (n !== unicos.length) throw validacao('Equipe inexistente.', { equipes: 'equipe inexistente' })
}

/**
 * Entrar numa equipe (API.md §4.3): segue os quadros ativos dela e ganha a própria coluna nos quadros com
 * `colunaPorMembro` (pessoa ativa). Emite quadro_usuario e coluna.
 */
export function entrarNaEquipe(db: Db, usuarioId: Id, equipeId: Id, ator: Ator): void {
  const ativo = um<{ ativo: number }>(db, 'SELECT ativo FROM usuario WHERE id = ?', usuarioId)?.ativo === 1
  if (!ativo) return
  seguirQuadrosDaEquipe(db, usuarioId, equipeId, ator)
  criarColunasDaPessoa(db, usuarioId, equipeId, ator)
}

export function criarPessoa(db: Db, e: CriarPessoaEntrada, ator: Ator): CriarPessoaSaida {
  const email = e.email.trim().toLowerCase()
  const apelido = e.apelido?.trim() || null
  exigirEmailLivre(db, email, null)
  exigirApelidoLivre(db, apelido, null)
  const equipes = e.equipes ?? []
  exigirEquipesExistem(db, equipes.map((p) => p.equipeId))
  const id = novoId()
  const instante = agora()
  rodar(db, `INSERT INTO usuario (id, nome, apelido, email, papel, cor, criado_por, criado_em, atualizado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, e.nome.trim(), apelido, email, e.papel, e.cor ?? 'azul', ator.usuario?.id ?? null, instante, instante)
  for (const p of equipes) {
    rodar(db, 'INSERT OR REPLACE INTO equipe_membro (equipe_id, usuario_id, funcao, principal) VALUES (?, ?, ?, ?)',
      p.equipeId, id, p.funcao ?? null, p.principal ?? false)
  }
  const convite = gerarLinkAcesso(db, id, 'convite', ator)
  emitirUsuario(db, id, ator)
  for (const equipeId of new Set(equipes.map((p) => p.equipeId))) {
    emitirObjeto(db, 'equipe', equipeId, carregarEquipe(db, equipeId), ator)
    entrarNaEquipe(db, id, equipeId, ator)
  }
  return { usuario: carregarUsuario(db, id), convite }
}

function adminsAtivos(db: Db): number {
  return um<{ n: number }>(db, "SELECT count(*) AS n FROM usuario WHERE papel = 'admin' AND ativo = 1")!.n
}

export function editarPessoa(db: Db, id: Id, e: EditarPessoaEntrada, ator: Ator): Usuario {
  const atual = carregarUsuario(db, id)
  const email = e.email?.trim().toLowerCase()
  const apelido = e.apelido === undefined ? atual.apelido : (e.apelido?.trim() || null)
  const ativo = e.ativo ?? atual.ativo
  const papel = e.papel ?? atual.papel
  if (email !== undefined && email !== atual.email) exigirEmailLivre(db, email, id)
  if (ativo && (apelido !== atual.apelido || !atual.ativo)) exigirApelidoLivre(db, apelido, id)
  const perdeAdmin = atual.papel === 'admin' && atual.ativo && (papel !== 'admin' || !ativo)
  if (perdeAdmin && adminsAtivos(db) <= 1) throw conflito('É preciso ter pelo menos um admin ativo.')
  if (e.equipes) exigirEquipesExistem(db, e.equipes.map((p) => p.equipeId))

  rodar(db, `UPDATE usuario SET nome = ?, apelido = ?, email = ?, papel = ?, cor = ?, ativo = ?, atualizado_em = ? WHERE id = ?`,
    e.nome?.trim() ?? atual.nome, apelido, email ?? atual.email, papel, e.cor ?? atual.cor, ativo, agora(), id)

  const desativou = atual.ativo && !ativo
  const trocouPapel = papel !== atual.papel
  if (desativou || (email !== undefined && email !== atual.email)) revogarTokens(db, id)
  if (desativou) pararCronometros(db, { usuarioId: id }, ator)
  if (desativou || trocouPapel) {
    revogarSessoes(db, id)
    // as conexões do Claude seguem as sessões (API.md §F.4): um token antigo não ganha o papel novo
    revogarConexoesDe(db, id, desativou ? 'desativacao' : 'papel')
    depoisDoCommit(db, () => fecharConexoesDe(db, id))
  }

  const mexidas = new Set<Id>()
  if (e.equipes) {
    const antes = new Set(atual.equipeIds)
    const depois = new Map(e.equipes.map((p) => [p.equipeId, p]))
    for (const equipeId of antes) {
      if (!depois.has(equipeId)) {
        rodar(db, 'DELETE FROM equipe_membro WHERE equipe_id = ? AND usuario_id = ?', equipeId, id)
        mexidas.add(equipeId)
      }
    }
    for (const [equipeId, p] of depois) {
      const ja = um<{ funcao: string | null; principal: number }>(db,
        'SELECT funcao, principal FROM equipe_membro WHERE equipe_id = ? AND usuario_id = ?', equipeId, id)
      const funcao = p.funcao === undefined ? (ja?.funcao ?? null) : p.funcao
      const principal = p.principal === undefined ? ja?.principal === 1 : p.principal
      if (!ja || ja.funcao !== funcao || (ja.principal === 1) !== principal) {
        rodar(db, 'INSERT OR REPLACE INTO equipe_membro (equipe_id, usuario_id, funcao, principal) VALUES (?, ?, ?, ?)',
          equipeId, id, funcao, principal)
        mexidas.add(equipeId)
      }
    }
    emitirUsuario(db, id, ator)
    for (const equipeId of mexidas) emitirObjeto(db, 'equipe', equipeId, carregarEquipe(db, equipeId), ator)
    for (const equipeId of depois.keys()) if (!antes.has(equipeId)) entrarNaEquipe(db, id, equipeId, ator)
  } else {
    emitirUsuario(db, id, ator)
  }
  return carregarUsuario(db, id)
}

// ─────────────────────────────── equipes ───────────────────────────────

function membrosDe(db: Db, equipeId: Id): EquipeMembro[] {
  return todos<Linha>(db, `
    SELECT em.* FROM equipe_membro em JOIN usuario u ON u.id = em.usuario_id
     WHERE em.equipe_id = ? ORDER BY em.principal DESC, lower(u.nome)`, equipeId).map(mapear.equipeMembro)
}

export function carregarEquipe(db: Db, id: Id): Equipe {
  const l = um<Linha>(db, 'SELECT * FROM equipe WHERE id = ?', id)
  if (!l) throw naoEncontrado('Equipe não encontrada.')
  return mapear.equipe(l, membrosDe(db, id))
}

export function listarEquipes(db: Db): Equipe[] {
  return todos<Linha>(db, 'SELECT * FROM equipe ORDER BY pos').map((l) => mapear.equipe(l, membrosDe(db, String(l.id))))
}

function exigirModeloQuadro(db: Db, id: Id | null | undefined): void {
  if (id && !um(db, 'SELECT 1 FROM modelo_quadro WHERE id = ?', id)) {
    throw validacao('Modelo de quadro inexistente.', { modeloQuadroId: 'modelo inexistente' })
  }
}

function exigirNomeEquipeLivre(db: Db, nome: string, exceto: Id | null): void {
  if (um(db, 'SELECT 1 FROM equipe WHERE lower(nome) = lower(?) AND id IS NOT ?', nome, exceto)) {
    throw conflito(`Já existe a equipe "${nome}".`, { campo: 'nome' })
  }
}

export function criarEquipe(db: Db, e: CriarEquipeEntrada, ator: Ator): Equipe {
  const nome = e.nome.trim()
  exigirNomeEquipeLivre(db, nome, null)
  if (um(db, 'SELECT 1 FROM equipe WHERE slug = ?', e.slug)) throw conflito('Este slug já é de outra equipe.', { campo: 'slug' })
  exigirModeloQuadro(db, e.modeloQuadroId)
  const id = novoId()
  const pos = posicaoEntre(db, { tabela: 'equipe', coluna: 'pos' }, undefined)
  const instante = agora()
  rodar(db, `INSERT INTO equipe (id, nome, slug, cor, modelo_quadro_id, pos, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, nome, e.slug, e.cor ?? 'grafite', e.modeloQuadroId ?? null, pos, instante, instante)
  const equipe = carregarEquipe(db, id)
  emitirObjeto(db, 'equipe', id, equipe, ator)
  return equipe
}

export function editarEquipe(db: Db, id: Id, e: EditarEquipeEntrada, ator: Ator): Equipe {
  const atual = carregarEquipe(db, id)
  const nome = e.nome?.trim() ?? atual.nome
  if (nome !== atual.nome) exigirNomeEquipeLivre(db, nome, id)
  if (e.modeloQuadroId !== undefined) exigirModeloQuadro(db, e.modeloQuadroId)
  const pos = e.posicao ? posicaoEntre(db, { tabela: 'equipe', coluna: 'pos' }, e.posicao, id) : atual.pos
  rodar(db, 'UPDATE equipe SET nome = ?, cor = ?, modelo_quadro_id = ?, ativa = ?, pos = ?, atualizado_em = ? WHERE id = ?',
    nome, e.cor ?? atual.cor, e.modeloQuadroId === undefined ? atual.modeloQuadroId : e.modeloQuadroId,
    e.ativa ?? atual.ativa, pos, agora(), id)
  const equipe = carregarEquipe(db, id)
  emitirObjeto(db, 'equipe', id, equipe, ator)
  return equipe
}

/** Substitui os membros (API.md §4.4). Quem entra segue os quadros e ganha a coluna; quem sai continua seguindo. */
export function definirMembros(db: Db, equipeId: Id, membros: EquipeMembro[], ator: Ator): Equipe {
  const atual = carregarEquipe(db, equipeId)
  const ids = membros.map((m) => m.usuarioId)
  if (new Set(ids).size !== ids.length) throw validacao('Pessoa repetida na equipe.', { membros: 'pessoa repetida' })
  if (ids.length > 0) {
    const n = um<{ n: number }>(db, `SELECT count(*) AS n FROM usuario WHERE id IN (${marcadores(ids.length)})`, ...ids)!.n
    if (n !== ids.length) throw validacao('Pessoa inexistente.', { membros: 'pessoa inexistente' })
  }
  const antes = new Set(atual.membros.map((m) => m.usuarioId))
  rodar(db, 'DELETE FROM equipe_membro WHERE equipe_id = ?', equipeId)
  for (const m of membros) {
    rodar(db, 'INSERT INTO equipe_membro (equipe_id, usuario_id, funcao, principal) VALUES (?, ?, ?, ?)',
      equipeId, m.usuarioId, m.funcao ?? null, m.principal ?? false)
  }
  emitirObjeto(db, 'equipe', equipeId, carregarEquipe(db, equipeId), ator)
  const depois = new Set(ids)
  for (const usuarioId of new Set([...antes, ...depois])) {
    if (antes.has(usuarioId) !== depois.has(usuarioId)) emitirUsuario(db, usuarioId, ator)
  }
  for (const usuarioId of ids) if (!antes.has(usuarioId)) entrarNaEquipe(db, usuarioId, equipeId, ator)
  return carregarEquipe(db, equipeId)
}
