/**
 * Ciclo da peça por SQL, sem o código do F2 (que chega na Onda 3). A fixture dos testes (`criarDemanda({ ate })`,
 * PLANO §1.1.1) e o seed de demonstração levam demandas a entregue, enviada, aprovada, anulada e "ajuste pedido"
 * gravando as linhas que os serviços do ciclo gravariam (fora ids e instantes; o F2 confere em
 * test/ciclo-paridade.test.ts). Nada aqui roda automação: o seed chama executarAutomacao() quando quer o vaivém.
 * Todas as funções rodam dentro da transação de quem chama; todo instante vem de agora().
 */
import type { DataLocal, Id } from '../../shared/tipos/index.ts'
import type { Ator } from '../src/auth.ts'
import { agora, agoraData, novoId, rodar, um, type Db } from '../src/db.ts'
import { lerConfig } from '../src/servicos/config-app.ts'
import { cifrar, gerarToken } from '../src/servicos/cripto.ts'
import { abrirRodada } from '../src/servicos/demandas.ts'

export type Ate = 'entregue' | 'enviada' | 'aprovada' | 'anulada'

interface LinhaDemanda {
  quadro_id: string
  coluna_id: string
  cliente_id: string | null
}

function demanda(db: Db, demandaId: Id): LinhaDemanda {
  const d = um<LinhaDemanda>(db, 'SELECT quadro_id, coluna_id, cliente_id FROM demanda WHERE id = ?', demandaId)
  if (!d) throw new Error(`demanda ${demandaId} não existe`)
  return d
}

function contatoPadrao(db: Db, clienteId: string | null): Id | null {
  if (!clienteId) return null
  return um<{ id: string }>(db, 'SELECT id FROM cliente_contato WHERE cliente_id = ? AND padrao = 1 AND ativo = 1', clienteId)?.id ?? null
}

function ultimaVersao(db: Db, demandaId: Id, enviada: boolean): Id {
  const v = um<{ id: string }>(db, `SELECT id FROM versao WHERE demanda_id = ? ${enviada ? 'AND enviada_cliente_em IS NOT NULL' : ''}
    ORDER BY numero DESC LIMIT 1`, demandaId)
  if (!v) throw new Error(`demanda ${demandaId} sem versão ${enviada ? 'enviada' : 'entregue'}`)
  return v.id
}

/** Entrega Vn na rodada aberta com um link do Drive público (os gatilhos põem n_versoes e versao_atual_id). */
export function entregarPorSql(db: Db, demandaId: Id, autorId: Id,
  item: { nome: string; url: string } = { nome: 'Arte final', url: 'https://drive.google.com/file/d/arte-v1/view' }): Id {
  const instante = agora()
  const rodada = um<{ id: string }>(db, 'SELECT id FROM rodada WHERE demanda_id = ? AND fechada_em IS NULL', demandaId)
  if (!rodada) throw new Error(`demanda ${demandaId} sem rodada aberta`)
  const numero = Number(um<{ n: number | null }>(db, 'SELECT max(numero) AS n FROM versao WHERE demanda_id = ?', demandaId)!.n ?? 0) + 1
  const versao = novoId()
  rodar(db, 'INSERT INTO versao (id, demanda_id, numero, rodada_id, criada_por, criada_em) VALUES (?, ?, ?, ?, ?, ?)',
    versao, demandaId, numero, rodada.id, autorId, instante)
  rodar(db, `INSERT INTO versao_item (id, versao_id, demanda_id, tipo, nome, url, provedor, drive_status, drive_testado_em, pos, criado_em)
             VALUES (?, ?, ?, 'link', ?, ?, 'drive', 'publico', ?, 1024, ?)`,
    novoId(), versao, demandaId, item.nome, item.url, instante, instante)
  return versao
}

/**
 * Envia a última versão entregue: por fora (WhatsApp, contato padrão) ou por link (gera link_publico com token
 * cifrado e o item). Grava `envio` com o quadro atual, o primeiro envio da versão e `envioPendenteEm = agora`.
 */
export function enviarPorSql(db: Db, demandaId: Id, p: { atendimentoId: Id; via?: 'fora' | 'link' }): { envioId: Id; linkId: Id | null } {
  const instante = agora()
  const via = p.via ?? 'fora'
  const d = demanda(db, demandaId)
  const versao = ultimaVersao(db, demandaId, false)
  const contato = contatoPadrao(db, d.cliente_id)
  rodar(db, 'UPDATE versao SET enviada_cliente_em = ?, enviada_via = ? WHERE id = ? AND enviada_cliente_em IS NULL', instante, via, versao)
  let linkId: Id | null = null
  if (via === 'link') {
    if (!d.cliente_id) throw new Error('envio por link exige cliente')
    const { token, hash } = gerarToken()
    linkId = novoId()
    const expira = new Date(agoraData().getTime() + lerConfig(db).linkPublicoValidadeDias * 86_400_000).toISOString()
    rodar(db, `INSERT INTO link_publico (id, token_hash, token_cifrado, cliente_id, contato_id, expira_em, criado_por, criado_em)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, linkId, hash, cifrar(token), d.cliente_id, contato, expira, p.atendimentoId, instante)
    rodar(db, 'INSERT INTO link_publico_item (link_id, demanda_id, pos) VALUES (?, ?, 1024)', linkId, demandaId)
  }
  const envioId = novoId()
  rodar(db, `INSERT INTO envio (id, demanda_id, quadro_id, versao_id, via, canal, link_id, contato_id, enviado_por, enviado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    envioId, demandaId, d.quadro_id, versao, via, via === 'fora' ? 'whatsapp' : null, linkId, contato, p.atendimentoId, instante)
  rodar(db, 'UPDATE demanda SET envio_pendente_em = ?, atualizado_por = ?, atualizado_em = ? WHERE id = ?',
    instante, p.atendimentoId, instante, demandaId)
  return { envioId, linkId }
}

/** Retorno "aprovado" manual (WhatsApp, contato padrão) da última versão enviada; fecha a rodada aberta. */
export function aprovarPorSql(db: Db, demandaId: Id, atendimentoId: Id): Id {
  const instante = agora()
  const d = demanda(db, demandaId)
  const versao = ultimaVersao(db, demandaId, true)
  const aprovacao = novoId()
  rodar(db, `INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, canal, contato_id, registrado_por, quadro_antes_id,
               coluna_antes_id, criado_em) VALUES (?, ?, ?, 'aprovado', 'manual', 'whatsapp', ?, ?, ?, ?, ?)`,
    aprovacao, demandaId, versao, contatoPadrao(db, d.cliente_id), atendimentoId, d.quadro_id, d.coluna_id, instante)
  rodar(db, `UPDATE demanda SET aprovada_em = ?, aprovada_versao_id = ?, envio_pendente_em = NULL, retorno_em = ?, atualizado_por = ?,
               atualizado_em = ? WHERE id = ?`, instante, versao, instante, atendimentoId, instante, demandaId)
  rodar(db, 'UPDATE rodada SET fechada_em = ? WHERE demanda_id = ? AND fechada_em IS NULL', instante, demandaId)
  return aprovacao
}

/** Anula a aprovação: limpa a aprovação da demanda, volta o envio pendente ao instante do envio e reabre a rodada. */
export function anularPorSql(db: Db, aprovacaoId: Id, atendimentoId: Id): void {
  const instante = agora()
  const a = um<{ demanda_id: string; versao_id: string }>(db, 'SELECT demanda_id, versao_id FROM aprovacao WHERE id = ?', aprovacaoId)
  if (!a) throw new Error(`aprovação ${aprovacaoId} não existe`)
  const enviadoEm = um<{ e: string }>(db, 'SELECT max(enviado_em) AS e FROM envio WHERE versao_id = ?', a.versao_id)!.e
  rodar(db, 'UPDATE aprovacao SET anulada_em = ?, anulada_por = ? WHERE id = ?', instante, atendimentoId, aprovacaoId)
  rodar(db, `UPDATE demanda SET aprovada_em = NULL, aprovada_versao_id = NULL, retorno_em = NULL, envio_pendente_em = ?, atualizado_por = ?,
               atualizado_em = ? WHERE id = ?`, enviadoEm, atendimentoId, instante, a.demanda_id)
  const rodada = um<{ id: string }>(db, `SELECT r.id FROM rodada r JOIN versao v ON v.rodada_id = r.id WHERE v.id = ?`, a.versao_id)!
  rodar(db, 'UPDATE rodada SET fechada_em = NULL WHERE id = ?', rodada.id)
}

/**
 * Retorno "ajuste" manual da última versão enviada: abre a rodada N+1 (abrirRodada do núcleo, com o checklist
 * "Ajustes R{N+1}"), grava a decisão com as linhas e devolve a bola à equipe. `extra: true` marca a rodada como extra.
 */
export function pedirAjustePorSql(db: Db, demandaId: Id, p: { ator: Ator; linhas: string[]; prazo?: DataLocal; extra?: boolean }):
  { aprovacaoId: Id; rodadaId: Id; sugerirExtra: boolean } {
  const atendimentoId = p.ator.usuario!.id
  const d = demanda(db, demandaId)
  const versao = ultimaVersao(db, demandaId, true)
  const { rodada, sugerirExtra } = abrirRodada(db, { demandaId, origem: 'cliente', linhas: p.linhas, motivo: 'cliente_mudou',
    prazo: p.prazo, ator: p.ator })
  const instante = agora()
  if (p.extra) {
    rodar(db, 'UPDATE rodada SET extra = 1, extra_marcada_por = ?, extra_marcada_em = ? WHERE id = ?', atendimentoId, instante, rodada.id)
  }
  const aprovacao = novoId()
  rodar(db, `INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, canal, contato_id, registrado_por, comentario, motivo,
               rodada_aberta_id, quadro_antes_id, coluna_antes_id, criado_em)
             VALUES (?, ?, ?, 'ajuste', 'manual', 'whatsapp', ?, ?, ?, 'cliente_mudou', ?, ?, ?, ?)`,
    aprovacao, demandaId, versao, contatoPadrao(db, d.cliente_id), atendimentoId, p.linhas.join('\n'), rodada.id, d.quadro_id, d.coluna_id,
    instante)
  rodar(db, 'UPDATE demanda SET envio_pendente_em = NULL, retorno_em = ?, atualizado_por = ?, atualizado_em = ? WHERE id = ?',
    instante, atendimentoId, instante, demandaId)
  return { aprovacaoId: aprovacao, rodadaId: rodada.id, sugerirExtra }
}

/**
 * A fixture `criarDemanda({ ate })` (PLANO §1.1.1): entregue (V1 + link do Drive, por `autorId`); enviada (por fora,
 * WhatsApp, contato padrão, por `atendimentoId`); aprovada (manual); anulada. Nenhuma automação roda.
 */
export function completarAte(db: Db, demandaId: Id, ate: Ate, p: { autorId: Id; atendimentoId: Id }): void {
  entregarPorSql(db, demandaId, p.autorId)
  if (ate === 'entregue') return
  enviarPorSql(db, demandaId, { atendimentoId: p.atendimentoId, via: 'fora' })
  if (ate === 'enviada') return
  const aprovacao = aprovarPorSql(db, demandaId, p.atendimentoId)
  if (ate === 'aprovada') return
  anularPorSql(db, aprovacao, p.atendimentoId)
}
