/**
 * Clientes (API.md §4.10, menos a trilha): apelidos normalizados (a sigla entra como apelido de origem 'sigla'),
 * responsáveis por equipe, contatos que aprovam (um padrão), links (só https), pendências calculadas na leitura e
 * contadores (abertas, com o cliente, atrasadas pelo estadoPrazo; só quadros ativos).
 */
import type {
  Cliente, ClienteContato, ClienteLink, ClienteNaLista, ClienteResumo, ContadoresCliente, CriarClienteEntrada,
  CriarContatoEntrada, CriarLinkClienteEntrada, EditarClienteEntrada, EditarContatoEntrada, EditarLinkClienteEntrada, Id,
  ResponsavelCliente,
} from '../../../shared/tipos/index.ts'
import { estadoPrazo } from '../../../shared/logica/prazo.ts'
import { comQuemEsta } from '../../../shared/logica/quadro.ts'
import { normalizarAlias } from '../../../shared/logica/texto.ts'
import type { Ator } from '../auth.ts'
import { agora, agoraData, novoId, rodar, todos, um, type Db } from '../db.ts'
import { conflito, naoEncontrado, validacao } from '../erros.ts'
import { registrarAtividade } from './atividade.ts'
import { exigirHttps } from './demandas.ts'
import { emitirDelete, emitirObjeto } from './eventos.ts'
import { mapear } from './mapear.ts'
import { exigirAtivos } from './pessoas.ts'
import { posicaoEntre } from './posicao.ts'

type Linha = Record<string, unknown>

const SQL_CLIENTE = `
  SELECT c.*, EXISTS (SELECT 1 FROM cliente_contato cc WHERE cc.cliente_id = c.id AND cc.padrao = 1 AND cc.ativo = 1)
    AS tem_contato_padrao FROM cliente c`

function agrupar<T>(linhas: { cliente_id: string }[], valor: (l: never) => T): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const l of linhas) m.set(l.cliente_id, [...(m.get(l.cliente_id) ?? []), valor(l as never)])
  return m
}

/** Todos os clientes (bootstrap e listas), em 3 consultas. */
export function clientesResumo(db: Db, onde = '1 = 1', params: unknown[] = []): ClienteResumo[] {
  const apelidos = agrupar(todos<{ cliente_id: string; alias_norm: string }>(db,
    "SELECT cliente_id, alias_norm FROM cliente_alias ORDER BY origem <> 'sigla', alias_norm"), (l: { alias_norm: string }) => l.alias_norm)
  const responsaveis = agrupar(todos<{ cliente_id: string; equipe_id: string; usuario_id: string }>(db,
    'SELECT cr.* FROM cliente_responsavel cr JOIN equipe e ON e.id = cr.equipe_id ORDER BY e.pos'),
  (l: { equipe_id: string; usuario_id: string }): ResponsavelCliente => ({ equipeId: l.equipe_id, usuarioId: l.usuario_id }))
  return todos<Linha>(db, `${SQL_CLIENTE} WHERE ${onde} ORDER BY c.sigla`, ...params)
    .map((l) => mapear.cliente(l, apelidos.get(String(l.id)) ?? [], responsaveis.get(String(l.id)) ?? []))
}

export function carregarClienteResumo(db: Db, id: Id): ClienteResumo {
  const [c] = clientesResumo(db, 'c.id = ?', [id])
  if (!c) throw naoEncontrado('Cliente não encontrado.')
  return c
}

/** Contadores por cliente: abertas, com o cliente e atrasadas (estadoPrazo), só demandas de quadros ativos. */
export function contadoresPorCliente(db: Db, clienteId?: Id): Map<Id, ContadoresCliente> {
  const linhas = todos<Linha>(db, `
    SELECT d.cliente_id, d.prazo, d.prazo_hora, d.concluida_em, d.envio_pendente_em, d.retorno_em, d.status_desde, c.papel
      FROM demanda d JOIN coluna c ON c.id = d.coluna_id JOIN quadro q ON q.id = d.quadro_id
     WHERE d.cliente_id IS NOT NULL ${clienteId ? 'AND d.cliente_id = ?' : ''} AND d.concluida_em IS NULL
       AND d.arquivado_em IS NULL AND d.excluido_em IS NULL AND q.arquivado_em IS NULL`, ...(clienteId ? [clienteId] : []))
  const agoraDt = agoraData()
  const mapa = new Map<Id, ContadoresCliente>()
  for (const l of linhas) {
    const c = mapa.get(String(l.cliente_id)) ?? { abertas: 0, comCliente: 0, atrasadas: 0 }
    const d = {
      prazo: l.prazo as string | null, prazoHora: l.prazo_hora as string | null, concluidaEm: null,
      envioPendenteEm: l.envio_pendente_em as string | null, retornoEm: l.retorno_em as string | null, statusDesde: String(l.status_desde),
    }
    const coluna = { papel: l.papel as 'normal' }
    c.abertas++
    if (comQuemEsta(d, coluna) === 'cliente') c.comCliente++
    if (estadoPrazo(d, coluna, agoraDt) === 'atrasada') c.atrasadas++
    mapa.set(String(l.cliente_id), c)
  }
  return mapa
}

export function listarClientes(db: Db): ClienteNaLista[] {
  const contadores = contadoresPorCliente(db)
  return clientesResumo(db).map((c) => ({ ...c, contadores: contadores.get(c.id) ?? { abertas: 0, comCliente: 0, atrasadas: 0 } }))
}

export function carregarCliente(db: Db, id: Id): Cliente {
  const resumo = carregarClienteResumo(db, id)
  const l = um<Linha>(db, 'SELECT observacoes, logo_arquivo_id, criado_em, atualizado_em FROM cliente WHERE id = ?', id)!
  return {
    ...resumo,
    observacoes: l.observacoes === null ? null : String(l.observacoes),
    logoArquivoId: l.logo_arquivo_id === null ? null : String(l.logo_arquivo_id),
    contatos: todos<Linha>(db, 'SELECT * FROM cliente_contato WHERE cliente_id = ? ORDER BY ativo DESC, padrao DESC, lower(nome)', id)
      .map(mapear.contato),
    links: todos<Linha>(db, 'SELECT * FROM cliente_link WHERE cliente_id = ? ORDER BY pos', id).map(mapear.clienteLink),
    contadores: contadoresPorCliente(db, id).get(id) ?? { abertas: 0, comCliente: 0, atrasadas: 0 },
    criadoEm: String(l.criado_em),
    atualizadoEm: String(l.atualizado_em),
  }
}

export function clientePorSigla(db: Db, sigla: string): Cliente {
  const l = um<{ id: string }>(db, 'SELECT id FROM cliente WHERE sigla = ?', sigla.trim().toUpperCase())
  if (!l) throw naoEncontrado('Cliente não encontrado.')
  return carregarCliente(db, l.id)
}

function emitirCliente(db: Db, id: Id, ator: Ator): void {
  emitirObjeto(db, 'cliente', id, carregarClienteResumo(db, id), ator)
}

// ─────────────────────────────── validações ───────────────────────────────

const SIGLA = /^[A-Z0-9]{1,12}$/

function exigirSiglaLivre(db: Db, sigla: string, exceto: Id | null): void {
  if (!SIGLA.test(sigla)) throw validacao('Sigla com 1 a 12 letras ou números.', { sigla: 'formato inválido' })
  const outro = um<{ id: string }>(db, 'SELECT id FROM cliente WHERE sigla = ? AND id IS NOT ?', sigla, exceto)
  if (outro) throw conflito(`A sigla ${sigla} já é de outro cliente.`, { campo: 'sigla', clienteId: outro.id })
  const alias = um<{ cliente_id: string }>(db, 'SELECT cliente_id FROM cliente_alias WHERE alias_norm = ? AND cliente_id IS NOT ?',
    normalizarAlias(sigla), exceto)
  if (alias) throw conflito(`"${sigla}" já é apelido de outro cliente.`, { campo: 'sigla', clienteId: alias.cliente_id })
}

function normalizarApelidos(lista: string[]): string[] {
  const unicos = [...new Set(lista.map(normalizarAlias).filter(Boolean))]
  if (unicos.some((a) => a.length > 80)) throw validacao('Apelido com até 80 caracteres.', { apelidos: 'longo demais' })
  return unicos
}

function exigirApelidosLivres(db: Db, apelidos: string[], clienteId: Id | null): void {
  for (const a of apelidos) {
    const dono = um<{ cliente_id: string }>(db, 'SELECT cliente_id FROM cliente_alias WHERE alias_norm = ?', a)
    if (dono && dono.cliente_id !== clienteId) throw conflito(`O apelido "${a}" já é de outro cliente.`, { campo: 'apelidos', clienteId: dono.cliente_id })
  }
}

function exigirLogo(db: Db, arquivoId: Id | null | undefined): void {
  if (!arquivoId) return
  const a = um<{ mime: string }>(db, 'SELECT mime FROM arquivo WHERE id = ? AND excluido_em IS NULL', arquivoId)
  if (!a || !['image/jpeg', 'image/png', 'image/webp'].includes(a.mime)) {
    throw validacao('O logo precisa ser uma imagem jpg, png ou webp enviada antes.', { logoArquivoId: 'não é imagem' })
  }
}

function exigirPai(db: Db, paiId: Id | null | undefined, eu: Id | null): void {
  if (!paiId) return
  if (paiId === eu) throw validacao('O cliente não pode ser o próprio grupo.', { paiId: 'o próprio cliente' })
  if (!um(db, 'SELECT 1 FROM cliente WHERE id = ?', paiId)) throw validacao('Grupo inexistente.', { paiId: 'cliente inexistente' })
}

// ─────────────────────────────── criar e editar ───────────────────────────────

/** POST /api/clientes. AM padrão: o ator, se for do atendimento (criado pela equipe: sem AM, pendência sem_am). */
export function criarCliente(db: Db, e: CriarClienteEntrada, ator: Ator): Cliente {
  const sigla = e.sigla.trim().toUpperCase()
  exigirSiglaLivre(db, sigla, null)
  const apelidos = normalizarApelidos(e.apelidos ?? []).filter((a) => a !== normalizarAlias(sigla))
  exigirApelidosLivres(db, apelidos, null)
  exigirLogo(db, e.logoArquivoId)
  exigirPai(db, e.paiId, null)
  const atendimentoId = e.atendimentoId !== undefined ? e.atendimentoId : (ator.papel === 'atendimento' ? ator.usuario!.id : null)
  if (atendimentoId) exigirAtivos(db, [atendimentoId], 'atendimentoId')
  const id = novoId()
  const instante = agora()
  rodar(db, `INSERT INTO cliente (id, nome, sigla, pai_id, status, nivel, cor, logo_arquivo_id, atendimento_id, rodadas_inclusas,
               pasta_saida, observacoes, criado_por, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, e.nome.trim(), sigla, e.paiId ?? null, e.status ?? 'recorrente', e.nivel ?? null, e.cor ?? 'azul', e.logoArquivoId ?? null,
    atendimentoId, e.rodadasInclusas ?? 2, e.pastaSaida?.trim() || null, e.observacoes?.trim() || null, ator.usuario?.id ?? null,
    instante, instante)
  rodar(db, "INSERT INTO cliente_alias (alias_norm, cliente_id, origem, criado_em) VALUES (?, ?, 'sigla', ?)", normalizarAlias(sigla), id, instante)
  for (const a of apelidos) rodar(db, "INSERT INTO cliente_alias (alias_norm, cliente_id, origem, criado_em) VALUES (?, ?, 'manual', ?)", a, id, instante)
  registrarAtividade(db, { tipo: 'cliente.criado', ator, clienteId: id, dados: { clienteId: id, sigla } })
  emitirCliente(db, id, ator)
  return carregarCliente(db, id)
}

const COLUNAS_CLIENTE: Record<keyof EditarClienteEntrada, string> = {
  sigla: 'sigla', nome: 'nome', paiId: 'pai_id', status: 'status', nivel: 'nivel', cor: 'cor', logoArquivoId: 'logo_arquivo_id',
  atendimentoId: 'atendimento_id', rodadasInclusas: 'rodadas_inclusas', pastaSaida: 'pasta_saida', observacoes: 'observacoes',
}

/** Mudar a sigla troca o apelido de origem 'sigla'. Mudar o AM não muda o AM das demandas existentes. */
export function editarCliente(db: Db, id: Id, e: EditarClienteEntrada, ator: Ator): Cliente {
  const atual = carregarCliente(db, id)
  const campos: Record<string, unknown> = {}
  const mudaram: string[] = []
  for (const k of Object.keys(e) as (keyof EditarClienteEntrada)[]) {
    if (!(k in COLUNAS_CLIENTE) || e[k] === undefined) continue
    let v: unknown = e[k]
    if (k === 'sigla') v = String(v).trim().toUpperCase()
    if (k === 'nome') v = String(v).trim()
    if ((k === 'pastaSaida' || k === 'observacoes') && typeof v === 'string') v = v.trim() || null
    if (JSON.stringify(v) === JSON.stringify((atual as unknown as Record<string, unknown>)[k] ?? null)) continue
    campos[COLUNAS_CLIENTE[k]] = v
    mudaram.push(k)
  }
  if (mudaram.length === 0) return atual
  if (campos.sigla !== undefined) exigirSiglaLivre(db, String(campos.sigla), id)
  if (campos.logo_arquivo_id !== undefined) exigirLogo(db, campos.logo_arquivo_id as Id | null)
  if (campos.pai_id !== undefined) exigirPai(db, campos.pai_id as Id | null, id)
  if (campos.atendimento_id) exigirAtivos(db, [String(campos.atendimento_id)], 'atendimentoId')
  const chaves = Object.keys(campos)
  rodar(db, `UPDATE cliente SET ${chaves.map((k) => `${k} = ?`).join(', ')}, atualizado_em = ? WHERE id = ?`,
    ...chaves.map((k) => campos[k]), agora(), id)
  if (campos.sigla !== undefined) {
    rodar(db, "DELETE FROM cliente_alias WHERE cliente_id = ? AND origem = 'sigla'", id)
    rodar(db, "INSERT OR REPLACE INTO cliente_alias (alias_norm, cliente_id, origem, criado_em) VALUES (?, ?, 'sigla', ?)",
      normalizarAlias(String(campos.sigla)), id, agora())
  }
  const antes: Record<string, unknown> = {}
  for (const k of mudaram) antes[k] = (atual as unknown as Record<string, unknown>)[k]
  registrarAtividade(db, { tipo: 'cliente.editado', ator, clienteId: id, dados: { clienteId: id, campos: mudaram }, antes })
  emitirCliente(db, id, ator)
  return carregarCliente(db, id)
}

/** Substitui os apelidos manuais (a sigla fica). */
export function definirApelidos(db: Db, id: Id, apelidos: string[], ator: Ator): Cliente {
  const atual = carregarClienteResumo(db, id)
  const sigla = normalizarAlias(atual.sigla)
  const lista = normalizarApelidos(apelidos).filter((a) => a !== sigla)
  exigirApelidosLivres(db, lista, id)
  rodar(db, "DELETE FROM cliente_alias WHERE cliente_id = ? AND origem <> 'sigla'", id)
  for (const a of lista) rodar(db, "INSERT INTO cliente_alias (alias_norm, cliente_id, origem, criado_em) VALUES (?, ?, 'manual', ?)", a, id, agora())
  emitirCliente(db, id, ator)
  return carregarCliente(db, id)
}

/** Substitui a lista (uma pessoa ativa por equipe). */
export function definirResponsaveis(db: Db, id: Id, responsaveis: ResponsavelCliente[], ator: Ator): Cliente {
  carregarClienteResumo(db, id)
  const equipes = responsaveis.map((r) => r.equipeId)
  if (new Set(equipes).size !== equipes.length) throw validacao('Um responsável por equipe.', { responsaveis: 'equipe repetida' })
  for (const r of responsaveis) {
    if (!um(db, 'SELECT 1 FROM equipe WHERE id = ?', r.equipeId)) throw validacao('Equipe inexistente.', { responsaveis: 'equipe inexistente' })
  }
  exigirAtivos(db, responsaveis.map((r) => r.usuarioId), 'responsaveis')
  rodar(db, 'DELETE FROM cliente_responsavel WHERE cliente_id = ?', id)
  for (const r of responsaveis) {
    rodar(db, 'INSERT INTO cliente_responsavel (cliente_id, equipe_id, usuario_id) VALUES (?, ?, ?)', id, r.equipeId, r.usuarioId)
  }
  rodar(db, 'UPDATE cliente SET atualizado_em = ? WHERE id = ?', agora(), id)
  emitirCliente(db, id, ator)
  return carregarCliente(db, id)
}

// ─────────────────────────────── contatos e links ───────────────────────────────

function carregarContato(db: Db, clienteId: Id, contatoId: Id): ClienteContato {
  const l = um<Linha>(db, 'SELECT * FROM cliente_contato WHERE id = ? AND cliente_id = ?', contatoId, clienteId)
  if (!l) throw naoEncontrado('Contato não encontrado.')
  return mapear.contato(l)
}

function gravarContato(db: Db, clienteId: Id, contatoId: Id, c: Omit<ClienteContato, 'id' | 'clienteId'>, ator: Ator, novo: boolean): ClienteContato {
  if (c.padrao && (!c.aprova || !c.ativo)) throw validacao('O contato padrão precisa estar ativo e aprovar.', { padrao: 'contato não aprova ou inativo' })
  if (c.padrao) {
    rodar(db, 'UPDATE cliente_contato SET padrao = 0, atualizado_em = ? WHERE cliente_id = ? AND padrao = 1 AND id <> ?', agora(), clienteId, contatoId)
  }
  if (novo) {
    rodar(db, `INSERT INTO cliente_contato (id, cliente_id, nome, cargo, whatsapp, email, aprova, padrao, ativo, criado_em, atualizado_em)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      contatoId, clienteId, c.nome, c.cargo, c.whatsapp, c.email, c.aprova, c.padrao, c.ativo, agora(), agora())
  } else {
    rodar(db, `UPDATE cliente_contato SET nome = ?, cargo = ?, whatsapp = ?, email = ?, aprova = ?, padrao = ?, ativo = ?, atualizado_em = ?
                WHERE id = ?`, c.nome, c.cargo, c.whatsapp, c.email, c.aprova, c.padrao, c.ativo, agora(), contatoId)
  }
  for (const outro of todos<Linha>(db, 'SELECT * FROM cliente_contato WHERE cliente_id = ?', clienteId)) {
    emitirObjeto(db, 'cliente_contato', String(outro.id), mapear.contato(outro), ator)
  }
  emitirCliente(db, clienteId, ator)
  return carregarContato(db, clienteId, contatoId)
}

const texto = (v: string | null | undefined) => (v?.trim() ? v.trim() : null)

export function criarContato(db: Db, clienteId: Id, e: CriarContatoEntrada, ator: Ator): ClienteContato {
  carregarClienteResumo(db, clienteId)
  return gravarContato(db, clienteId, novoId(), {
    nome: e.nome.trim(), cargo: texto(e.cargo), whatsapp: texto(e.whatsapp), email: texto(e.email)?.toLowerCase() ?? null,
    aprova: e.aprova ?? true, padrao: e.padrao ?? false, ativo: true,
  }, ator, true)
}

/** "Excluir" = ativo false (e deixa de ser o padrão). */
export function editarContato(db: Db, clienteId: Id, contatoId: Id, e: EditarContatoEntrada, ator: Ator): ClienteContato {
  const atual = carregarContato(db, clienteId, contatoId)
  const ativo = e.ativo ?? atual.ativo
  const aprova = e.aprova ?? atual.aprova
  let padrao = e.padrao ?? atual.padrao
  if (e.padrao === undefined && (!ativo || !aprova)) padrao = false
  return gravarContato(db, clienteId, contatoId, {
    nome: e.nome?.trim() ?? atual.nome, cargo: e.cargo !== undefined ? texto(e.cargo) : atual.cargo,
    whatsapp: e.whatsapp !== undefined ? texto(e.whatsapp) : atual.whatsapp,
    email: e.email !== undefined ? (texto(e.email)?.toLowerCase() ?? null) : atual.email, aprova, padrao, ativo,
  }, ator, false)
}

function carregarLink(db: Db, clienteId: Id, linkId: Id): ClienteLink {
  const l = um<Linha>(db, 'SELECT * FROM cliente_link WHERE id = ? AND cliente_id = ?', linkId, clienteId)
  if (!l) throw naoEncontrado('Link não encontrado.')
  return mapear.clienteLink(l)
}

const escopoLinks = (clienteId: Id) => ({ tabela: 'cliente_link', coluna: 'pos' as const, escopo: { coluna: 'cliente_id', valor: clienteId } })

export function criarLink(db: Db, clienteId: Id, e: CriarLinkClienteEntrada, ator: Ator): ClienteLink {
  carregarClienteResumo(db, clienteId)
  const id = novoId()
  rodar(db, 'INSERT INTO cliente_link (id, cliente_id, tipo, rotulo, url, pos, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, clienteId, e.tipo, e.rotulo.trim(), exigirHttps(e.url), posicaoEntre(db, escopoLinks(clienteId), undefined), agora())
  const link = carregarLink(db, clienteId, id)
  emitirObjeto(db, 'cliente_link', id, link, ator)
  return link
}

export function editarLink(db: Db, clienteId: Id, linkId: Id, e: EditarLinkClienteEntrada, ator: Ator): ClienteLink {
  const atual = carregarLink(db, clienteId, linkId)
  rodar(db, 'UPDATE cliente_link SET tipo = ?, rotulo = ?, url = ?, pos = ? WHERE id = ?',
    e.tipo ?? atual.tipo, e.rotulo?.trim() ?? atual.rotulo, e.url !== undefined ? exigirHttps(e.url) : atual.url,
    e.posicao ? posicaoEntre(db, escopoLinks(clienteId), e.posicao, linkId) : atual.pos, linkId)
  const link = carregarLink(db, clienteId, linkId)
  emitirObjeto(db, 'cliente_link', linkId, link, ator)
  return link
}

export function excluirLink(db: Db, clienteId: Id, linkId: Id, ator: Ator): void {
  carregarLink(db, clienteId, linkId)
  rodar(db, 'DELETE FROM cliente_link WHERE id = ?', linkId)
  emitirDelete(db, 'cliente_link', linkId, ator)
}
