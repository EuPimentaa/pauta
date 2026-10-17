/**
 * "Enviar ao cliente" (API.md §4.16), o texto para WhatsApp (§6) e os links públicos da demanda (listar, revogar).
 * Enviar por link testa o Drive ANTES da transação (busca na rede) e confere tudo de novo dentro dela.
 */
import type {
  DataLocal, Demanda, EnviarAoClienteEntrada, EnviarAoClienteSaida, Envio, Id, LinkPublicoComUrl, LinkPublicoResumo,
  ModeloWhatsapp, TextoWhatsappSaida, VersaoComItens,
} from '../../../shared/tipos/index.ts'
import { prazoRetornoPadrao as prazoRetornoPuro } from '../../../shared/logica/ciclo-prazos.ts'
import { textoWhatsapp } from '../../../shared/logica/texto-whatsapp.ts'
import type { Ator } from '../auth.ts'
import { config } from '../config.ts'
import { agora, agoraData, novoId, rodar, todos, tx, um, type Db } from '../db.ts'
import { ErroHttp, conflito, estadoInvalido, naoEncontrado } from '../erros.ts'
import { registrarAtividade } from './atividade.ts'
import { executarAutomacao } from './automacoes.ts'
import {
  carregarVersao, carregarVersaoSemItens, contatoDoCliente, decisaoValida, emitirVersao, nomeDoContato, semTrace,
  testarDriveDaVersao, ultimaVersao,
} from './ciclo.ts'
import { feriados, hoje, lerConfig } from './config-app.ts'
import { cifrar, decifrar, gerarToken } from './cripto.ts'
import { atualizarLinhaDemanda, carregarDemanda, demandaViva } from './demandas.ts'
import { emitirMudancasDemanda, emitirObjeto } from './eventos.ts'
import { mapear } from './mapear.ts'
import { exigir } from './permissoes.ts'

type Linha = Record<string, unknown>

// ─────────────────────────────── links ───────────────────────────────

/** Endereço público do link: APP_URL/a/<token> (o token sai do cifrado; null se não der para decifrar). */
export function urlDoToken(token: string): string {
  return `${config.appUrl.replace(/\/+$/, '')}/a/${token}`
}

function urlDoLink(l: Linha): string | null {
  try {
    return urlDoToken(decifrar(String(l.token_cifrado)))
  } catch {
    return null
  }
}

export function carregarLink(db: Db, id: Id): LinkPublicoResumo {
  const l = um<Linha>(db, 'SELECT * FROM link_publico WHERE id = ?', id)
  if (!l) throw naoEncontrado('Link não encontrado.')
  return mapear.linkPublico(l, todos<{ demanda_id: string }>(db, 'SELECT demanda_id FROM link_publico_item WHERE link_id = ? ORDER BY pos', id)
    .map((x) => x.demanda_id))
}

/** Emite o link (público gestão: a equipe não recebe) para a demanda de cada item. */
export function emitirLink(db: Db, id: Id, ator: Ator): LinkPublicoResumo {
  const link = carregarLink(db, id)
  emitirObjeto(db, 'link_publico', id, link, ator, { publico: 'gestao', demandaId: link.demandaIds[0] ?? null })
  return link
}

/** O link ativo da demanda para o contato (o mais novo), se houver. */
function linkAtivo(db: Db, d: Demanda, contatoId: Id | null): Linha | undefined {
  return um<Linha>(db, `
    SELECT l.* FROM link_publico l JOIN link_publico_item i ON i.link_id = l.id
     WHERE i.demanda_id = ? AND l.cliente_id = ? AND l.revogado_em IS NULL AND l.expira_em > ? AND l.contato_id IS ?
     ORDER BY l.criado_em DESC, l.rowid DESC LIMIT 1`, d.id, d.clienteId, agora(), contatoId)
}

// ─────────────────────────────── enviar ───────────────────────────────

/** O que a página pública mostra de um item (ciclo-publico.ts): link que não é Drive privado, ou arquivo. */
export function visivelAoCliente(i: VersaoComItens['itens'][number]): boolean {
  return (i.tipo === 'link' && !!i.url && i.driveStatus !== 'privado') || (i.tipo === 'arquivo' && !!i.arquivo)
}

interface Preparado {
  d: Demanda
  versao: VersaoComItens
  contatoId: Id | null
}

/** O que vale antes e dentro da transação: papel, demanda viva e aberta, cliente, versão, decisão e contato. */
function preparar(db: Db, demandaId: Id, e: EnviarAoClienteEntrada, ator: Ator): Preparado {
  exigir(ator, 'ciclo.cliente')
  const d = demandaViva(db, demandaId)
  if (d.arquivadoEm) throw estadoInvalido('Restaure a demanda antes de enviar.')
  if (d.concluidaEm) throw estadoInvalido('Reabra a demanda antes de enviar.')
  if (!d.clienteId) throw estadoInvalido('Escolha o cliente antes de enviar.')
  const ultima = ultimaVersao(db, demandaId)
  if (!ultima) throw estadoInvalido('Entregue uma versão antes de enviar.')
  if (e.versaoId && e.versaoId !== ultima.id) {
    throw new ErroHttp(409, 'versao_desatualizada', `Chegou a V${ultima.numero}. Envie a versão mais nova.`,
      { versaoAtualId: ultima.id, numero: ultima.numero })
  }
  if (decisaoValida(db, ultima.id)) throw new ErroHttp(409, 'ja_decidida', `A V${ultima.numero} já tem uma decisão do cliente.`)
  const contatoId = contatoDoCliente(db, d.clienteId, e.contatoId)
  return { d, versao: carregarVersao(db, ultima.id), contatoId }
}

/** Prazo de retorno padrão: hoje + retornoPrazoDiasUteis, sem passar da véspera útil da publicação (nem antes de hoje). */
export function prazoRetornoPadrao(db: Db, d: Pick<Demanda, 'publicacaoData'>): DataLocal {
  return prazoRetornoPuro(hoje(), lerConfig(db).retornoPrazoDiasUteis, d.publicacaoData, feriados(db))
}

/**
 * POST /api/demandas/:id/enviar (atendimento, admin). Por link: testa o Drive dos itens antes (algum privado → 422
 * drive_privado com os itens), reaproveita o link ativo da demanda para o mesmo contato ou gera um novo. Grava o
 * envio com o quadro de ANTES da automação, o primeiro envio da versão e envioPendenteEm; roda `enviado_ao_cliente`.
 */
export async function enviarAoCliente(db: Db, demandaId: Id, e: EnviarAoClienteEntrada, ator: Ator): Promise<EnviarAoClienteSaida> {
  const { versao } = preparar(db, demandaId, e, ator)
  if (e.via === 'link') await testarDriveDaVersao(db, versao.id, semTrace(ator))
  return tx(db, () => gravarEnvio(db, demandaId, e, ator))
}

function gravarEnvio(db: Db, demandaId: Id, e: EnviarAoClienteEntrada, ator: Ator): EnviarAoClienteSaida {
  const { d, versao, contatoId } = preparar(db, demandaId, e, ator)
  if (e.via === 'link') {
    // Drive privado bloqueia, a não ser que a versão tenha um arquivo enviado pelo app ("[Enviar arquivo (até 10 MB)]"
    // do diálogo): a página pública mostra o arquivo e deixa de fora o link que pediria login
    const privados = versao.itens.filter((i) => i.driveStatus === 'privado')
    if (privados.length > 0 && !versao.itens.some((i) => i.tipo === 'arquivo')) {
      throw new ErroHttp(422, 'drive_privado', 'O cliente verá uma tela de login: abra o compartilhamento do Drive, envie o arquivo pelo app ou mande por fora.',
        { itens: privados.map((i) => ({ itemId: i.id, nome: i.nome, url: i.url })) })
    }
    // caminho de rede nunca vai ao cliente: sem nenhum link ou arquivo, ele aprovaria sem ver a peça
    if (!versao.itens.some(visivelAoCliente)) {
      throw new ErroHttp(422, 'estado_invalido', 'Pelo link o cliente não veria nada: esta versão só tem caminhos de rede. Acrescente o link do Drive ou o arquivo, ou envie por fora.',
        { motivo: 'sem_itens_visiveis' })
    }
  }
  const instante = agora()
  const cfg = lerConfig(db)
  const prazoRetorno = e.prazoRetorno === undefined ? prazoRetornoPadrao(db, d) : e.prazoRetorno
  const prazoRetornoHora = prazoRetorno ? (e.prazoRetornoHora ?? null) : null

  let link: EnviarAoClienteSaida['link'] = null
  let linkId: Id | null = null
  if (e.via === 'link') {
    const novaExpiracao = new Date(agoraData().getTime() + cfg.linkPublicoValidadeDias * 86_400_000).toISOString()
    const existente = linkAtivo(db, d, contatoId)
    let url: string | null = null
    if (existente) url = urlDoLink(existente)
    if (existente && url) {
      linkId = String(existente.id)
      // reenviar pelo mesmo link dá ao cliente o prazo inteiro de novo
      if (String(existente.expira_em) < novaExpiracao) rodar(db, 'UPDATE link_publico SET expira_em = ? WHERE id = ?', novaExpiracao, linkId)
    } else {
      const { token, hash } = gerarToken()
      linkId = novoId()
      url = urlDoToken(token)
      rodar(db, `INSERT INTO link_publico (id, token_hash, token_cifrado, cliente_id, contato_id, titulo, expira_em, criado_por, criado_em)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        linkId, hash, cifrar(token), d.clienteId, contatoId, `#${d.numero} ${d.titulo}`.slice(0, 200), novaExpiracao, ator.usuario!.id, instante)
      rodar(db, 'INSERT INTO link_publico_item (link_id, demanda_id, pos) VALUES (?, ?, 1024)', linkId, d.id)
      registrarAtividade(db, { tipo: 'link.gerado', ator, demandaId: d.id, dados: { linkId } })
    }
    const l = emitirLink(db, linkId, ator)
    link = { id: linkId, url: url!, expiraEm: l.expiraEm }
  }

  // demanda sem AM (cliente criado pela equipe, só com sigla e nome): quem envia ao cliente vira o AM dela, para
  // receber a decisão e ver a peça parada no Início ("Com o cliente há mais de 2 dias úteis")
  if (!d.atendimentoId) {
    atualizarLinhaDemanda(db, d.id, { atendimento_id: ator.usuario!.id }, ator)
    registrarAtividade(db, { tipo: 'demanda.editada', ator, demandaId: d.id, dados: { campos: ['atendimentoId'] }, antes: { atendimentoId: null } })
  }

  const envioId = novoId()
  rodar(db, `INSERT INTO envio (id, demanda_id, quadro_id, versao_id, via, canal, link_id, contato_id, prazo_retorno, prazo_retorno_hora,
               enviado_por, enviado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    envioId, d.id, d.quadroId, versao.id, e.via, e.via === 'fora' ? e.canal! : null, linkId, contatoId, prazoRetorno, prazoRetornoHora,
    ator.usuario!.id, instante)
  rodar(db, 'UPDATE versao SET enviada_cliente_em = ?, enviada_via = ? WHERE id = ? AND enviada_cliente_em IS NULL', instante, e.via, versao.id)
  atualizarLinhaDemanda(db, d.id, { envio_pendente_em: instante }, ator)
  registrarAtividade(db, { tipo: 'versao.enviada', ator, demandaId: d.id,
    dados: { versaoId: versao.id, numero: versao.numero, via: e.via, canal: e.via === 'fora' ? e.canal! : null, contatoId } })
  const envio = carregarEnvio(db, envioId)
  emitirObjeto(db, 'envio', envioId, envio, ator, { demandaId: d.id })
  emitirVersao(db, versao.id, ator)
  emitirMudancasDemanda(db, d, ator)

  const automacao = executarAutomacao(db, d.id, 'enviado_ao_cliente', ator)
  const texto = textoWhatsapp('envio', {
    contatoNome: nomeDoContato(db, contatoId), titulo: d.titulo, versao: versao.numero,
    url: link?.url ?? null, prazoRetorno, prazoRetornoHora,
  })
  return { envio, demanda: carregarDemanda(db, d.id), link, textoWhatsapp: texto, automacao }
}

export function carregarEnvio(db: Db, id: Id): Envio {
  const l = um<Linha>(db, 'SELECT * FROM envio WHERE id = ?', id)
  if (!l) throw naoEncontrado('Envio não encontrado.')
  return mapear.envio(l)
}

// ─────────────────────────────── texto para WhatsApp ───────────────────────────────

/**
 * GET /api/demandas/:id/whatsapp?modelo= (atendimento, admin): envio e lembrete pelo último envio (o lembrete reusa o
 * link; envio por fora usa um link ativo da demanda para o mesmo contato, se houver); aprovado e ajuste pela última
 * decisão válida desse tipo. Sem envio ou sem decisão → 409.
 */
export function textoParaWhatsapp(db: Db, demandaId: Id, modelo: ModeloWhatsapp, ator: Ator): TextoWhatsappSaida {
  exigir(ator, 'ciclo.cliente')
  const d = demandaViva(db, demandaId)
  if (modelo === 'envio' || modelo === 'lembrete') {
    const l = um<Linha>(db, 'SELECT * FROM envio WHERE demanda_id = ? ORDER BY enviado_em DESC, rowid DESC LIMIT 1', demandaId)
    if (!l) throw conflito('Esta demanda ainda não foi enviada ao cliente.')
    const envio = mapear.envio(l)
    const versao = carregarVersaoSemItens(db, envio.versaoId)
    let url: string | null = null
    if (envio.linkId) {
      const lk = um<Linha>(db, 'SELECT * FROM link_publico WHERE id = ? AND revogado_em IS NULL AND expira_em > ?', envio.linkId, agora())
      if (lk) url = urlDoLink(lk)
    }
    if (!url && modelo === 'lembrete' && d.clienteId) {
      const lk = linkAtivo(db, d, envio.contatoId)
      if (lk) url = urlDoLink(lk)
    }
    if (modelo === 'envio' && envio.via === 'fora') url = null
    const texto = textoWhatsapp(modelo, {
      contatoNome: nomeDoContato(db, envio.contatoId), titulo: d.titulo, versao: versao.numero, url,
      prazoRetorno: envio.prazoRetorno, prazoRetornoHora: envio.prazoRetornoHora,
    })
    return { modelo, texto, linkUrl: url }
  }
  const l = um<Linha>(db, `SELECT * FROM aprovacao WHERE demanda_id = ? AND decisao = ? AND anulada_em IS NULL
    ORDER BY criado_em DESC, rowid DESC LIMIT 1`, demandaId, modelo)
  if (!l) throw conflito(modelo === 'aprovado' ? 'Esta demanda ainda não tem aprovação registrada.' : 'Esta demanda ainda não tem pedido de ajuste registrado.')
  const a = mapear.aprovacao(l)
  const versao = carregarVersaoSemItens(db, a.versaoId)
  const rodada = a.rodadaAbertaId ? um<{ prazo: string | null; prazo_hora: string | null }>(db,
    'SELECT prazo, prazo_hora FROM rodada WHERE id = ?', a.rodadaAbertaId) : undefined
  const texto = textoWhatsapp(modelo, {
    contatoNome: nomeDoContato(db, a.contatoId) ?? a.nomeInformado, titulo: d.titulo, versao: versao.numero,
    prazoAjuste: rodada?.prazo ?? null, prazoAjusteHora: rodada?.prazo_hora ?? null,
  })
  return { modelo, texto, linkUrl: null }
}

// ─────────────────────────────── links da demanda ───────────────────────────────

/** GET /api/demandas/:id/links (atendimento, admin): os links que levam a demanda, mais novos primeiro, com a URL. */
export function linksDaDemanda(db: Db, demandaId: Id, ator: Ator): LinkPublicoComUrl[] {
  exigir(ator, 'ciclo.cliente')
  demandaViva(db, demandaId)
  return todos<Linha>(db, `SELECT l.* FROM link_publico l JOIN link_publico_item i ON i.link_id = l.id WHERE i.demanda_id = ?
    ORDER BY l.criado_em DESC, l.rowid DESC`, demandaId).map((l) => ({ ...carregarLink(db, String(l.id)), url: urlDoLink(l) ?? '' }))
}

/** Revoga (o link ainda não revogado): grava quem e quando, `link.revogado` em cada demanda e o evento para a gestão. */
function revogar(db: Db, link: LinkPublicoResumo, ator: Ator): LinkPublicoResumo {
  rodar(db, 'UPDATE link_publico SET revogado_em = ?, revogado_por = ? WHERE id = ?', agora(), ator.usuario!.id, link.id)
  for (const demandaId of link.demandaIds) registrarAtividade(db, { tipo: 'link.revogado', ator, demandaId, dados: { linkId: link.id } })
  return emitirLink(db, link.id, ator)
}

/** POST /api/links-publicos/:id/revogar (atendimento, admin). Já revogado → 409. */
export function revogarLink(db: Db, linkId: Id, ator: Ator): LinkPublicoResumo {
  exigir(ator, 'ciclo.cliente')
  const link = carregarLink(db, linkId)
  if (link.revogadoEm) throw conflito('Este link já foi revogado.')
  return revogar(db, link, ator)
}

/**
 * Desativar ("excluir") um contato revoga os links ativos dele, na transação de quem desativa (API.md §4.10): o link
 * pergunta "Você é Luíza?" e a decisão sairia no nome de quem não aprova mais. Quem pode editar o cliente (atendimento
 * da carteira, admin) já pode revogar. Devolve quantos revogou.
 */
export function revogarLinksDoContato(db: Db, contatoId: Id, ator: Ator): number {
  const ids = todos<{ id: string }>(db, 'SELECT id FROM link_publico WHERE contato_id = ? AND revogado_em IS NULL AND expira_em > ?',
    contatoId, agora()).map((l) => l.id)
  for (const id of ids) revogar(db, carregarLink(db, id), ator)
  return ids.length
}
