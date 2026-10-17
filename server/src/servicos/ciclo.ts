/**
 * Ciclo da peça (F2; API.md §4.16, §5.4, §5.5 e §5.7): versões, retorno do cliente (link e manual), "Aprovado pelo
 * WhatsApp", anular, ajuste interno e rodada extra. O envio ao cliente, o texto para WhatsApp e os links públicos ficam
 * em ciclo-envio.ts; a página pública, em ciclo-publico.ts.
 *
 * Serviço central: `registrarRetorno()` (o link e o atendimento usam o mesmo): grava a decisão, abre a rodada N+1 no
 * ajuste (abrirRodada do núcleo, com o checklist "Ajustes R{N+1}"), devolve a bola à equipe e roda a automação do
 * quadro DO ENVIO (`quadroDoEnvio`), que pode levar a demanda para outro quadro (o vaivém Criação → Atendimento ›
 * Com o cliente → Criação › Fila → Social › Fila, todo configurado na Criação).
 * Todas as funções rodam dentro da transação de quem chama (as rotas usam `tx`).
 */
import type {
  AjusteInternoEntrada, AjusteInternoSaida, AnularAprovacaoSaida, Aprovacao, Canal, ChecklistComItens, DataLocal,
  EditarVersaoEntrada, EntregarVersaoEntrada, EntregarVersaoSaida, HoraLocal, Id, MapaDadosAtividade, MotivoRodada,
  NovoItem, Provedor, RegistrarRetornoSaida, Rodada, TestarVersaoSaida, Versao, VersaoComItens,
} from '../../../shared/tipos/index.ts'
import { linhasParaItens } from '../../../shared/logica/texto.ts'
import type { Ator } from '../auth.ts'
import { agora, depoisDoCommit, novoId, rodar, todos, tx, um, type Db } from '../db.ts'
import { ErroHttp, conflito, estadoInvalido, naoEncontrado, validacao } from '../erros.ts'
import { registrarAtividade } from './atividade.ts'
import { executarAutomacao, quadroDoEnvio } from './automacoes.ts'
import { hoje } from './config-app.ts'
import {
  abrirRodada, atualizarLinhaDemanda, carregarDemanda, carregarRodada, demandaViva, detectarProvedor, exigirHttps, inserirAnexo,
} from './demandas.ts'
import { testarLinkDrive } from './drive.ts'
import { emitirMudancasDemanda, emitirObjeto } from './eventos.ts'
import { COLUNAS_ARQUIVO, mapear } from './mapear.ts'
import { mover } from './mover.ts'
import { marcarNotificacoesDoFato, nomeDoAtor, notificar, rotuloDemanda } from './notificacoes.ts'
import { exigir } from './permissoes.ts'
import { idsAtivos } from './pessoas.ts'

type Linha = Record<string, unknown>

// ─────────────────────────────── leitura ───────────────────────────────

export function carregarVersaoSemItens(db: Db, id: Id): Versao {
  const l = um<Linha>(db, 'SELECT * FROM versao WHERE id = ?', id)
  if (!l) throw naoEncontrado('Versão não encontrada.')
  return mapear.versaoSemItens(l)
}

export function carregarVersao(db: Db, id: Id): VersaoComItens {
  const v = carregarVersaoSemItens(db, id)
  const itens = todos<Linha>(db, `SELECT vi.*, ${COLUNAS_ARQUIVO} FROM versao_item vi LEFT JOIN arquivo ar ON ar.id = vi.arquivo_id
    WHERE vi.versao_id = ? ORDER BY vi.pos, vi.id`, id).map(mapear.versaoItem)
  return { ...v, itens }
}

export function emitirVersao(db: Db, id: Id, ator: Ator): VersaoComItens {
  const v = carregarVersao(db, id)
  emitirObjeto(db, 'versao', v.id, v, ator, { demandaId: v.demandaId })
  return v
}

export function carregarAprovacao(db: Db, id: Id): Aprovacao {
  const l = um<Linha>(db, 'SELECT * FROM aprovacao WHERE id = ?', id)
  if (!l) throw naoEncontrado('Decisão não encontrada.')
  return mapear.aprovacao(l)
}

/** Decisão válida (não anulada) sobre a versão, se houver. */
export function decisaoValida(db: Db, versaoId: Id): Aprovacao | null {
  const l = um<Linha>(db, 'SELECT * FROM aprovacao WHERE versao_id = ? AND anulada_em IS NULL', versaoId)
  return l ? mapear.aprovacao(l) : null
}

/** A última versão entregue (maior número), ou null. */
export function ultimaVersao(db: Db, demandaId: Id): Versao | null {
  const l = um<Linha>(db, 'SELECT * FROM versao WHERE demanda_id = ? ORDER BY numero DESC LIMIT 1', demandaId)
  return l ? mapear.versaoSemItens(l) : null
}

/** Ator sem o trace: o resultado de um trabalho em segundo plano também chega à janela de quem pediu. */
export function semTrace(ator: Ator): Ator {
  return { ...ator, traceId: null }
}

/** Contato ativo do cliente: o pedido, o padrão (undefined) ou nenhum (null). Outro cliente ou inativo → 400. */
export function contatoDoCliente(db: Db, clienteId: Id, contatoId: Id | null | undefined): Id | null {
  if (contatoId === null) return null
  if (contatoId === undefined) {
    return um<{ id: string }>(db, 'SELECT id FROM cliente_contato WHERE cliente_id = ? AND padrao = 1 AND ativo = 1', clienteId)?.id ?? null
  }
  const c = um<{ id: string }>(db, 'SELECT id FROM cliente_contato WHERE id = ? AND cliente_id = ? AND ativo = 1', contatoId, clienteId)
  if (!c) throw validacao('Escolha um contato ativo deste cliente.', { contatoId: 'contato inativo ou de outro cliente' })
  return c.id
}

export function nomeDoContato(db: Db, contatoId: Id | null): string | null {
  return contatoId ? um<{ nome: string }>(db, 'SELECT nome FROM cliente_contato WHERE id = ?', contatoId)?.nome ?? null : null
}

function versaoDesatualizada(db: Db, versaoId: Id, acao: string): ErroHttp {
  const v = carregarVersaoSemItens(db, versaoId)
  return new ErroHttp(409, 'versao_desatualizada', `Chegou a V${v.numero}. ${acao} a versão mais nova.`,
    { versaoAtualId: v.id, numero: v.numero })
}

const plural = (n: number, um_: string, varios: string) => `${n} ${n === 1 ? um_ : varios}`

/** Quem fica sabendo de uma demanda sem AM: as pessoas ativas do atendimento; sem nenhuma, os admins ativos. */
export function atendimentoSemAm(db: Db): Id[] {
  const ids = (papel: string) => todos<{ id: string }>(db, 'SELECT id FROM usuario WHERE papel = ? AND ativo = 1 ORDER BY id', papel).map((l) => l.id)
  const atendimento = ids('atendimento')
  return atendimento.length > 0 ? atendimento : ids('admin')
}

/** Quem enviou ao cliente a versão (o último envio dela), para saber da decisão mesmo sem ser o AM. */
function quemEnviou(db: Db, versaoId: Id): Id | null {
  return um<{ enviado_por: string }>(db, 'SELECT enviado_por FROM envio WHERE versao_id = ? ORDER BY enviado_em DESC, rowid DESC LIMIT 1',
    versaoId)?.enviado_por ?? null
}

// ─────────────────────────────── itens de versão ───────────────────────────────

const NOME_PROVEDOR: Partial<Record<Provedor, string>> = {
  drive: 'Arquivo no Google Drive', docs: 'Documento do Google', figma: 'Arquivo no Figma', canva: 'Design no Canva',
  wetransfer: 'WeTransfer', youtube: 'Vídeo no YouTube', vimeo: 'Vídeo no Vimeo', dropbox: 'Arquivo no Dropbox',
}

/** Nome padrão de um link: o provedor ("Arquivo no Google Drive"), senão o host. */
function nomeDoLink(url: string, provedor: Provedor): string {
  if (provedor === 'drive' && /\/folders\//.test(url)) return 'Pasta no Google Drive'
  return NOME_PROVEDOR[provedor] ?? new URL(url).hostname.replace(/^www\./, '')
}

/** Grava os itens no fim da versão (link https, caminho de rede ou arquivo enviado). Devolve os ids dos links do Drive. */
function inserirItens(db: Db, versaoId: Id, demandaId: Id, itens: NovoItem[]): Id[] {
  let pos = Number(um<{ m: number | null }>(db, 'SELECT max(pos) AS m FROM versao_item WHERE versao_id = ?', versaoId)!.m ?? 0)
  const drive: Id[] = []
  const instante = agora()
  itens.forEach((item, i) => {
    const id = novoId()
    let url: string | null = null
    let caminho: string | null = null
    let arquivoId: string | null = null
    let provedor: Provedor
    let nome = item.nome?.trim() ?? ''
    if (item.tipo === 'link') {
      url = exigirHttps(item.url, `itens.${i}.url`)
      provedor = detectarProvedor(url)
      nome ||= nomeDoLink(url, provedor)
      if (provedor === 'drive') drive.push(id)
    } else if (item.tipo === 'caminho') {
      caminho = item.caminho.trim()
      if (!caminho || caminho.length > 1000) throw validacao('Caminho inválido.', { [`itens.${i}.caminho`]: 'vazio ou longo demais' })
      provedor = 'rede'
      nome ||= caminho.split(/[\\/]/).filter(Boolean).at(-1) ?? caminho
    } else {
      const arq = um<{ nome: string; excluido_em: string | null }>(db, 'SELECT nome, excluido_em FROM arquivo WHERE id = ?', item.arquivoId)
      if (!arq || arq.excluido_em) throw validacao('Arquivo não encontrado. Envie de novo.', { [`itens.${i}.arquivoId`]: 'arquivo inexistente' })
      arquivoId = item.arquivoId
      provedor = 'arquivo'
      nome ||= arq.nome
    }
    pos += 1024
    rodar(db, `INSERT INTO versao_item (id, versao_id, demanda_id, tipo, nome, url, caminho, arquivo_id, provedor, pos, criado_em)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, versaoId, demandaId, item.tipo, nome.slice(0, 200), url, caminho, arquivoId, provedor, pos, instante)
  })
  return drive
}

// ─────────────────────────────── teste do Drive ───────────────────────────────

const testesPendentes = new Set<Promise<unknown>>()

/**
 * Testa os links do Drive da versão (todos, ou só `itemIds`), grava `driveStatus`/`previaUrl` numa transação própria
 * e emite a versão. Fora de transação (busca na rede antes de gravar).
 */
export async function testarDriveDaVersao(db: Db, versaoId: Id, ator: Ator, itemIds?: Id[]): Promise<TestarVersaoSaida> {
  const v = carregarVersao(db, versaoId)
  const alvos = v.itens.filter((i) => i.tipo === 'link' && i.provedor === 'drive' && i.url && (!itemIds || itemIds.includes(i.id)))
  const resultados = await Promise.all(alvos.map(async (i) => ({ i, r: await testarLinkDrive(i.url!) })))
  if (resultados.length > 0) {
    tx(db, () => {
      const instante = agora()
      for (const { i, r } of resultados) {
        rodar(db, 'UPDATE versao_item SET drive_status = ?, drive_testado_em = ?, previa_url = ? WHERE id = ?',
          r.status === 'nao_drive' ? 'erro' : r.status, instante, r.previaUrl, i.id)
      }
      emitirVersao(db, versaoId, ator)
    })
  }
  const depois = carregarVersao(db, versaoId)
  return {
    itens: depois.itens.map((i) => ({
      itemId: i.id,
      status: i.tipo === 'link' && i.provedor === 'drive' ? (i.driveStatus ?? 'erro') : 'nao_drive',
      previaUrl: i.previaUrl,
    })),
    bloqueiaEnvio: depois.itens.some((i) => i.driveStatus === 'privado'),
  }
}

/** Depois do commit, testa os links do Drive em segundo plano (o evento `versao` leva o resultado a todos). */
function testarEmSegundoPlano(db: Db, versaoId: Id, itemIds: Id[], ator: Ator): void {
  if (itemIds.length === 0) return
  depoisDoCommit(db, () => {
    const p: Promise<unknown> = testarDriveDaVersao(db, versaoId, semTrace(ator), itemIds)
      .catch((e) => console.error('teste do Drive em segundo plano falhou:', e))
      .finally(() => testesPendentes.delete(p))
    testesPendentes.add(p)
  })
}

/** Espera os testes do Drive em segundo plano (testes e encerramento). */
export async function aguardarTestesDrive(): Promise<void> {
  while (testesPendentes.size > 0) await Promise.all([...testesPendentes])
}

// ─────────────────────────────── versões ───────────────────────────────

/**
 * "Entregar versão" (API.md §4.16): Vn na rodada aberta, com os itens; não muda a coluna. Membros, o AM, atendimento
 * e admin. Arquivada ou concluída → 422; sem rodada aberta (a peça já foi aprovada) → 422. Notifica o AM.
 */
export function entregarVersao(db: Db, demandaId: Id, e: EntregarVersaoEntrada, ator: Ator): EntregarVersaoSaida {
  const antes = demandaViva(db, demandaId)
  exigir(ator, 'versao.entregar', { demanda: antes })
  if (antes.arquivadoEm) throw estadoInvalido('Restaure a demanda antes de entregar.')
  if (antes.concluidaEm) throw estadoInvalido('Reabra a demanda antes de entregar.')
  const rodada = um<{ id: string }>(db, 'SELECT id FROM rodada WHERE demanda_id = ? AND fechada_em IS NULL', demandaId)
  if (!rodada) {
    throw estadoInvalido('Esta peça já foi aprovada. Para outra versão, o atendimento anula a aprovação ou pede um ajuste interno.')
  }
  const numero = Number(um<{ n: number | null }>(db, 'SELECT max(numero) AS n FROM versao WHERE demanda_id = ?', demandaId)!.n ?? 0) + 1
  const versaoId = novoId()
  rodar(db, 'INSERT INTO versao (id, demanda_id, numero, rodada_id, nota, criada_por, criada_em) VALUES (?, ?, ?, ?, ?, ?, ?)',
    versaoId, demandaId, numero, rodada.id, e.nota?.trim() || null, ator.usuario!.id, agora())
  const drive = inserirItens(db, versaoId, demandaId, e.itens)
  const atividadeId = registrarAtividade(db, { tipo: 'versao.entregue', ator, demandaId, dados: { versaoId, numero, itens: e.itens.length } })
  const versao = emitirVersao(db, versaoId, ator)
  // o gatilho versao_contar_ai já pôs n_versoes e versao_atual_id; aqui o autor e o instante da mudança
  atualizarLinhaDemanda(db, demandaId, {}, ator)
  emitirMudancasDemanda(db, antes, ator)
  // sem AM (cliente criado pela equipe, só com sigla e nome), o atendimento inteiro fica sabendo (sem atendimento
  // ativo, os admins); quem enviar ao cliente passa a ser o AM da demanda (gravarEnvio)
  const resumo = `${nomeDoAtor(ator) ?? 'Alguém'} entregou a V${numero} de ${rotuloDemanda(db, demandaId)}`
  if (antes.atendimentoId) {
    notificar(db, { para: antes.atendimentoId, tipo: 'versao_entregue', demandaId, atividadeId, ator, resumo })
  } else {
    notificar(db, { para: atendimentoSemAm(db), tipo: 'versao_entregue', demandaId, atividadeId, ator, resumo: `${resumo} · sem atendimento` })
  }
  testarEmSegundoPlano(db, versaoId, drive, ator)
  return { versao, demanda: carregarDemanda(db, demandaId) }
}

/**
 * PATCH /api/versoes/:id: a nota (o autor, atendimento, admin), só enquanto a versão não foi enviada ao cliente (409
 * depois, como acrescentar itens: o que foi enviado não muda). A troca fica no histórico com a nota de antes.
 */
export function editarVersao(db: Db, versaoId: Id, e: EditarVersaoEntrada, ator: Ator): VersaoComItens {
  const v = carregarVersaoSemItens(db, versaoId)
  exigir(ator, 'versao.editar', { versao: v })
  const d = demandaViva(db, v.demandaId)
  if (d.arquivadoEm) throw estadoInvalido('Restaure a demanda antes de editar a versão.')
  if (v.enviadaClienteEm) throw conflito('Esta versão já foi enviada ao cliente. A nota não muda depois do envio.')
  const nota = e.nota === undefined ? v.nota : (e.nota?.trim() || null)
  if (nota === v.nota) return carregarVersao(db, versaoId)
  rodar(db, 'UPDATE versao SET nota = ? WHERE id = ?', nota, versaoId)
  registrarAtividade(db, { tipo: 'versao.editada', ator, demandaId: v.demandaId, dados: { versaoId, numero: v.numero }, antes: { nota: v.nota } })
  return emitirVersao(db, versaoId, ator)
}

/** POST /api/versoes/:id/itens: só enquanto a versão não foi enviada (409 depois). Testa o Drive dos novos. */
export function adicionarItens(db: Db, versaoId: Id, itens: NovoItem[], ator: Ator): VersaoComItens {
  const v = carregarVersaoSemItens(db, versaoId)
  exigir(ator, 'versao.editar', { versao: v })
  const d = demandaViva(db, v.demandaId)
  if (d.arquivadoEm) throw estadoInvalido('Restaure a demanda antes de mexer na versão.')
  if (v.enviadaClienteEm) throw conflito('Esta versão já foi enviada ao cliente. Entregue uma versão nova.')
  const drive = inserirItens(db, versaoId, v.demandaId, itens)
  registrarAtividade(db, { tipo: 'versao.itens_adicionados', ator, demandaId: v.demandaId, dados: { versaoId, numero: v.numero, itens: itens.length } })
  const versao = emitirVersao(db, versaoId, ator)
  testarEmSegundoPlano(db, versaoId, drive, ator)
  return versao
}

// ─────────────────────────────── retorno do cliente ───────────────────────────────

export interface ParametrosRetorno {
  demandaId: Id
  ator: Ator
  via: 'link' | 'manual'
  versaoId?: Id
  decisao: 'aprovado' | 'ajuste'
  linhas?: string[]
  motivo?: MotivoRodada
  motivoTexto?: string | null
  prazo?: DataLocal
  prazoHora?: HoraLocal | null
  /** Manual: o pedido, o padrão (undefined) ou nenhum (null). Link: o que a página conferiu (nulo ou o do link). */
  contatoId?: Id | null
  nomeInformado?: string | null
  canal?: Canal
  evidenciaArquivoId?: Id | null
  /** Só pelo link. */
  linkId?: Id
  idempotencia?: { chave: string; hash: string }
  ipHmac?: string | null
  userAgent?: string | null
  /** Só pelo link: pessoas com sessão interna recente na mesma rede da decisão (`pessoasDaRede`, API.md §4.17). */
  redeInterna?: Id[]
}

/** "Pri", "Pri e Gabi", "Pri, Gabi e Alice" (apelido ou primeiro nome, como nos resumos). */
function nomesDasPessoas(db: Db, ids: Id[]): string {
  const nomes = ids.map((id) => {
    const u = um<{ nome: string; apelido: string | null }>(db, 'SELECT nome, apelido FROM usuario WHERE id = ?', id)
    return u ? (u.apelido ?? u.nome.split(' ')[0]!) : 'alguém'
  })
  return nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`
}

/**
 * Registra a decisão do cliente (API.md §4.16 e §4.17; o link e o atendimento usam a mesma função):
 * - exige envio pendente (409 "Nada aguardando o cliente"); a versão é a última enviada (409 versao_desatualizada);
 *   uma decisão válida só (409 ja_decidida); contato ativo do cliente (400); ajuste com pelo menos uma linha (400);
 * - grava a `aprovacao` com o lugar de antes (quadroAntes/colunaAntes) e, no manual, o print como anexo de evidência;
 * - aprovado: aprovadaEm/aprovadaVersaoId e fecha a rodada; ajuste: abre a rodada N+1 com "Ajustes R{N+1}";
 * - limpa o envio pendente, roda a automação `aprovado`/`ajuste_pedido` DO QUADRO DO ENVIO e grava
 *   retornoEm = max(agora, statusDesde) (a bola volta à equipe mesmo sem automação, §5.4);
 * - notifica os membros e o AM de antes da decisão (quem a automação pôs recebe `membro`); pelo link vinda da mesma
 *   rede de uma sessão interna (`redeInterna`), a decisão guarda quem eram, o resumo diz "· da mesma rede que Pri" e os
 *   admins também recebem.
 */
export function registrarRetorno(db: Db, p: ParametrosRetorno): RegistrarRetornoSaida {
  const antes = demandaViva(db, p.demandaId)
  if (p.via === 'manual') exigir(p.ator, 'ciclo.cliente')
  if (antes.arquivadoEm) throw estadoInvalido('Restaure a demanda antes de registrar o retorno.')
  if (!antes.envioPendenteEm || !antes.versaoEnviadaId) throw conflito('Nada aguardando o cliente.')
  const versaoId = antes.versaoEnviadaId
  if (p.versaoId && p.versaoId !== versaoId) throw versaoDesatualizada(db, versaoId, 'Registre o retorno sobre')
  if (decisaoValida(db, versaoId)) throw new ErroHttp(409, 'ja_decidida', 'Esta versão já tem uma decisão do cliente.')
  const versao = carregarVersaoSemItens(db, versaoId)
  // pelo link, o contato que a página conferiu (o do link ou nenhum) também precisa estar ativo e ser do cliente
  const contatoId = contatoDoCliente(db, antes.clienteId!, p.via === 'manual' ? p.contatoId : (p.contatoId ?? null))
  const nomeInformado = p.nomeInformado?.trim().slice(0, 120) || null
  const itens = p.decisao === 'ajuste' ? linhasParaItens((p.linhas ?? []).join('\n')) : []
  if (p.decisao === 'ajuste' && itens.length === 0) throw validacao('Escreva pelo menos um ajuste, um por linha.', { linhas: 'vazio' })
  const quadroEnvio = quadroDoEnvio(db, versaoId)
  const quem = nomeDoContato(db, contatoId) ?? nomeInformado ?? (p.via === 'manual' ? 'o cliente' : 'o cliente pelo link')

  // o print colado vira anexo de evidência (só pelas rotas do ciclo; não sai mais, gatilho anexo_evidencia_fixa)
  let evidenciaId: Id | null = null
  if (p.evidenciaArquivoId) {
    const arq = um<{ mime: string; excluido_em: string | null }>(db, 'SELECT mime, excluido_em FROM arquivo WHERE id = ?', p.evidenciaArquivoId)
    if (!arq || arq.excluido_em) throw validacao('O print não foi encontrado. Cole de novo.', { evidenciaArquivoId: 'arquivo inexistente' })
    if (!arq.mime.startsWith('image/')) throw validacao('O print precisa ser uma imagem.', { evidenciaArquivoId: 'não é imagem' })
    evidenciaId = inserirAnexo(db, antes.id, {
      tipo: 'arquivo', arquivoId: p.evidenciaArquivoId, nome: `Print do retorno da V${versao.numero}`, finalidade: 'evidencia',
    }, p.ator).id
  }

  // ajuste: a rodada N+1 nasce antes da decisão, que guarda o id dela (a aprovação é imutável)
  let rodada: Rodada | null = null
  let checklist: ChecklistComItens | null = null
  let sugerirExtra = false
  const motivo = p.decisao === 'ajuste' ? (p.motivo ?? 'cliente_mudou') : null
  if (p.decisao === 'ajuste') {
    const r = abrirRodada(db, { demandaId: antes.id, origem: 'cliente', linhas: itens, motivo: motivo!, motivoTexto: p.motivoTexto,
      prazo: p.prazo, prazoHora: p.prazoHora, ator: p.ator, ...(p.via === 'link' ? { pedidoPor: quem } : {}) })
    rodada = r.rodada
    checklist = r.checklist
    sugerirExtra = r.sugerirExtra
  }

  const instante = agora()
  const aprovacaoId = novoId()
  // pelo link e da mesma rede de uma sessão interna recente: a decisão vale, mas fica marcada (imutável, gatilho da 090)
  const redeInterna = p.via === 'link' ? [...new Set(p.redeInterna ?? [])] : []
  rodar(db, `INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, canal, link_id, contato_id, nome_informado, registrado_por,
               comentario, motivo, rodada_aberta_id, evidencia_anexo_id, quadro_antes_id, coluna_antes_id, idempotency_key,
               idempotency_hash, ip_hmac, user_agent, rede_interna, criado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    aprovacaoId, antes.id, versaoId, p.decisao, p.via, p.via === 'manual' ? (p.canal ?? 'whatsapp') : null, p.linkId ?? null, contatoId,
    nomeInformado, p.via === 'manual' ? p.ator.usuario!.id : null, p.decisao === 'ajuste' ? itens.join('\n') : null, motivo,
    rodada?.id ?? null, evidenciaId, antes.quadroId, antes.colunaId, p.idempotencia?.chave ?? null, p.idempotencia?.hash ?? null,
    p.ipHmac ?? null, p.userAgent?.slice(0, 300) || null, redeInterna.length > 0 ? JSON.stringify(redeInterna) : null, instante)

  // a atividade vem antes da automação: anular sabe que movimento foi o da decisão (o primeiro depois dela)
  const atividadeId = registrarAtividade(db, { tipo: 'retorno.registrado', ator: p.ator, demandaId: antes.id,
    dados: { aprovacaoId, versaoNumero: versao.numero, decisao: p.decisao, via: p.via, quem, ...(redeInterna.length > 0 ? { redeInterna } : {}) } })

  const meio = carregarDemanda(db, antes.id)
  if (p.decisao === 'aprovado') {
    atualizarLinhaDemanda(db, antes.id, { aprovada_em: instante, aprovada_versao_id: versaoId, envio_pendente_em: null }, p.ator)
    const aberta = um<{ id: string }>(db, 'SELECT id FROM rodada WHERE demanda_id = ? AND fechada_em IS NULL', antes.id)
    if (aberta) {
      rodar(db, 'UPDATE rodada SET fechada_em = ? WHERE id = ?', instante, aberta.id)
      rodada = carregarRodada(db, aberta.id)
      emitirObjeto(db, 'rodada', aberta.id, rodada, p.ator, { demandaId: antes.id })
    }
  } else {
    atualizarLinhaDemanda(db, antes.id, { envio_pendente_em: null }, p.ator)
  }
  emitirMudancasDemanda(db, meio, p.ator)
  emitirObjeto(db, 'aprovacao', aprovacaoId, carregarAprovacao(db, aprovacaoId), p.ator, { demandaId: antes.id })

  const automacao = executarAutomacao(db, antes.id, p.decisao === 'aprovado' ? 'aprovado' : 'ajuste_pedido', p.ator, quadroEnvio)
  if (p.decisao === 'aprovado' && automacao) prazoAoPassarAdiante(db, antes.id, quadroEnvio, aprovacaoId, p.ator)
  const posAutomacao = carregarDemanda(db, antes.id)
  const retornoEm = instante > posAutomacao.statusDesde ? instante : posAutomacao.statusDesde
  atualizarLinhaDemanda(db, antes.id, { retorno_em: retornoEm }, p.ator)
  emitirMudancasDemanda(db, posAutomacao, p.ator)

  // membros e AM de antes da decisão, e quem enviou a versão (ficou sabendo mesmo que o AM seja outro); com a marca da
  // rede interna, também os admins, e o resumo termina com ela (cortado antes dela, se passar de 300)
  const enviou = quemEnviou(db, versaoId)
  const admins = redeInterna.length > 0
    ? todos<{ id: string }>(db, "SELECT id FROM usuario WHERE papel = 'admin' AND ativo = 1").map((l) => l.id) : []
  const para = [...antes.membroIds, ...(antes.atendimentoId ? [antes.atendimentoId] : []), ...(enviou ? [enviou] : []), ...admins]
  const rotulo = rotuloDemanda(db, antes.id)
  const Quem = quem.charAt(0).toUpperCase() + quem.slice(1)
  const base = p.decisao === 'aprovado'
    ? `${Quem} aprovou a V${versao.numero} de ${rotulo}`
    : `${Quem} pediu ${plural(itens.length, 'ajuste', 'ajustes')} na V${versao.numero} de ${rotulo}`
  const sufixo = redeInterna.length > 0 ? ` · da mesma rede que ${nomesDasPessoas(db, redeInterna)}` : ''
  notificar(db, {
    para, tipo: p.decisao === 'aprovado' ? 'aprovada' : 'ajuste_pedido', demandaId: antes.id, atividadeId, ator: p.ator,
    resumo: sufixo ? `${base.slice(0, Math.max(40, 300 - sufixo.length))}${sufixo}`.slice(0, 300) : base,
  })
  return { aprovacao: carregarAprovacao(db, aprovacaoId), demanda: carregarDemanda(db, antes.id), rodada, checklist, sugerirExtra, automacao }
}

/**
 * A aprovação levou a peça para outro quadro (ex.: Criação → Social › Fila): o prazo era o da rodada que acabou de ser
 * cumprida e não diz nada a quem recebe (ficaria atrasado lá e dispararia o aviso das 8h). Vira a publicação, se houver
 * (com a hora dela), senão nenhum. Com repetição o prazo fica (a próxima nasce dele). Não mexe na rodada (o prazo dela
 * é histórico). A atividade guarda o de antes, que anular devolve.
 */
function prazoAoPassarAdiante(db: Db, demandaId: Id, quadroEnvio: Id, aprovacaoId: Id, ator: Ator): void {
  const d = carregarDemanda(db, demandaId)
  if (d.quadroId === quadroEnvio || !d.prazo) return
  let prazo: DataLocal | null = d.publicacaoData && d.publicacaoData >= hoje() ? d.publicacaoData : null
  if (prazo && d.inicio && d.inicio > prazo) prazo = null
  if (!prazo && d.repetir !== 'nenhuma') return
  const prazoHora = prazo ? d.publicacaoHora : null
  if (prazo === d.prazo && prazoHora === d.prazoHora) return
  atualizarLinhaDemanda(db, demandaId, { prazo, prazo_hora: prazoHora }, ator)
  const campos = ['prazo', ...(prazoHora !== d.prazoHora ? ['prazoHora'] : [])]
  registrarAtividade(db, { tipo: 'demanda.editada', ator, demandaId, dados: { campos, aprovacaoId, prazoNovo: prazo },
    antes: { prazo: d.prazo, prazoHora: d.prazoHora } })
}

/** Anular devolve o prazo que a aprovação tirou, se ninguém mexeu nele depois. */
function devolverPrazoDaAprovacao(db: Db, demandaId: Id, aprovacaoId: Id, ator: Ator): void {
  const l = um<{ dados: string; antes: string | null }>(db, `SELECT dados, antes FROM atividade WHERE demanda_id = ? AND tipo = 'demanda.editada'
    AND json_extract(dados, '$.aprovacaoId') = ? ORDER BY id DESC LIMIT 1`, demandaId, aprovacaoId)
  if (!l?.antes) return
  const dados = JSON.parse(l.dados) as MapaDadosAtividade['demanda.editada']
  const era = JSON.parse(l.antes) as { prazo: DataLocal | null; prazoHora: HoraLocal | null }
  const d = carregarDemanda(db, demandaId)
  if (d.prazo !== (dados.prazoNovo ?? null)) return
  atualizarLinhaDemanda(db, demandaId, { prazo: era.prazo, prazo_hora: era.prazoHora }, ator)
  registrarAtividade(db, { tipo: 'demanda.editada', ator, demandaId, dados: { campos: ['prazo'] }, antes: { prazo: d.prazo, prazoHora: d.prazoHora } })
}

// ─────────────────────────────── anular a aprovação ───────────────────────────────

/**
 * POST /api/aprovacoes/:id/anular (o "Desfazer" do "Aprovado pelo WhatsApp"): só a aprovação válida mais recente da
 * demanda. Limpa a aprovação e o retornoEm, reabre a rodada, volta o envio pendente ao instante do envio e, se a
 * demanda não mudou de lugar depois da automação da decisão, devolve-a à coluna de antes (com os membros de antes).
 */
export function anularAprovacao(db: Db, aprovacaoId: Id, ator: Ator): AnularAprovacaoSaida {
  exigir(ator, 'ciclo.cliente')
  const a = carregarAprovacao(db, aprovacaoId)
  if (a.anuladaEm) throw conflito('Esta aprovação já foi anulada.')
  if (a.decisao !== 'aprovado') throw conflito('Só uma aprovação pode ser anulada: o pedido de ajuste já abriu a rodada seguinte.')
  const ultima = um<{ id: string }>(db, `SELECT id FROM aprovacao WHERE demanda_id = ? AND anulada_em IS NULL
    ORDER BY criado_em DESC, rowid DESC LIMIT 1`, a.demandaId)
  if (ultima?.id !== a.id) throw conflito('Só a decisão mais recente pode ser anulada.')
  const antes = demandaViva(db, a.demandaId)
  if (antes.arquivadoEm) throw estadoInvalido('Restaure a demanda antes de anular a aprovação.')
  const rodadaDaVersao = um<{ id: string }>(db, 'SELECT r.id FROM rodada r JOIN versao v ON v.rodada_id = r.id WHERE v.id = ?', a.versaoId)!
  const aberta = um<{ id: string }>(db, 'SELECT id FROM rodada WHERE demanda_id = ? AND fechada_em IS NULL', a.demandaId)
  if (aberta && aberta.id !== rodadaDaVersao.id) throw conflito('Já há uma rodada nova aberta nesta demanda.')

  const instante = agora()
  rodar(db, 'UPDATE aprovacao SET anulada_em = ?, anulada_por = ? WHERE id = ?', instante, ator.usuario!.id, a.id)
  const enviadoEm = um<{ e: string }>(db, 'SELECT max(enviado_em) AS e FROM envio WHERE versao_id = ?', a.versaoId)!.e
  atualizarLinhaDemanda(db, a.demandaId, { aprovada_em: null, aprovada_versao_id: null, retorno_em: null, envio_pendente_em: enviadoEm }, ator)
  if (!aberta) {
    rodar(db, 'UPDATE rodada SET fechada_em = NULL WHERE id = ?', rodadaDaVersao.id)
    emitirObjeto(db, 'rodada', rodadaDaVersao.id, carregarRodada(db, rodadaDaVersao.id), ator, { demandaId: a.demandaId })
  }
  emitirObjeto(db, 'aprovacao', a.id, carregarAprovacao(db, a.id), ator, { demandaId: a.demandaId })
  emitirMudancasDemanda(db, antes, ator)

  // a decisão moveu (a automação) e ninguém mexeu depois: a demanda volta para onde estava, com os membros de antes
  let voltou = false
  const registro = um<{ id: number }>(db, `SELECT id FROM atividade WHERE demanda_id = ? AND tipo = 'retorno.registrado'
    AND json_extract(dados, '$.aprovacaoId') = ?`, a.demandaId, a.id)
  if (registro) {
    const movidas = todos<{ dados: string }>(db, `SELECT dados FROM atividade WHERE demanda_id = ? AND tipo = 'demanda.movida' AND id > ?
      ORDER BY id`, a.demandaId, registro.id).map((l) => JSON.parse(l.dados) as MapaDadosAtividade['demanda.movida'])
    const daDecisao = movidas.length === 1 && movidas[0]!.via === 'automacao' && movidas[0]!.gatilho === 'aprovado' ? movidas[0]! : null
    const destinoAtivo = !!um(db, `SELECT 1 FROM coluna c JOIN quadro q ON q.id = c.quadro_id
      WHERE c.id = ? AND c.arquivada_em IS NULL AND q.arquivado_em IS NULL`, a.colunaAntesId)
    if (daDecisao && antes.colunaId === daDecisao.para.colunaId && destinoAtivo && antes.colunaId !== a.colunaAntesId) {
      const entraram = daDecisao.membrosEntraram ?? []
      const sairam = daDecisao.membrosSairam ?? []
      const ativos = idsAtivos(db)
      const membroIds = entraram.length || sairam.length
        ? [...antes.membroIds.filter((id) => !entraram.includes(id)), ...sairam.filter((id) => !antes.membroIds.includes(id) && ativos.has(id))]
        : undefined
      mover(db, { demandaId: a.demandaId, ator, colunaId: a.colunaAntesId, via: 'manual', membroIds })
      voltou = true
      const movida = carregarDemanda(db, a.demandaId)
      devolverPrazoDaAprovacao(db, a.demandaId, a.id, ator)
      emitirMudancasDemanda(db, movida, ator)
    }
  }
  const versao = carregarVersaoSemItens(db, a.versaoId)
  registrarAtividade(db, { tipo: 'aprovacao.anulada', ator, demandaId: a.demandaId, dados: { aprovacaoId: a.id, versaoNumero: versao.numero, voltou } })
  // quem recebeu "aprovou a V1" fica sabendo que ela foi anulada (aprovar de novo não deixa duas notificações iguais)
  if (registro) marcarNotificacoesDoFato(db, { atividadeId: registro.id, tipo: 'aprovada', sufixo: ` · anulada por ${nomeDoAtor(ator) ?? 'alguém'}`, ator })
  return { demanda: carregarDemanda(db, a.demandaId), voltou }
}

// ─────────────────────────────── ajuste interno e rodada extra ───────────────────────────────

/**
 * "Pedir ajuste interno" (atendimento, admin): rodada N+1 de origem interna, com checklist e prazo; não move. Exige
 * versão entregue na rodada atual (422) e nada esperando o cliente (409). Notifica `ajuste_pedido` aos membros.
 */
export function ajusteInterno(db: Db, demandaId: Id, e: AjusteInternoEntrada, ator: Ator): AjusteInternoSaida {
  exigir(ator, 'ciclo.cliente')
  const antes = demandaViva(db, demandaId)
  if (antes.arquivadoEm) throw estadoInvalido('Restaure a demanda antes de pedir ajuste.')
  if (antes.envioPendenteEm) throw conflito('Esta peça está com o cliente. Registre o retorno dele antes.')
  const entregue = um(db, `SELECT 1 FROM versao v JOIN rodada r ON r.id = v.rodada_id WHERE v.demanda_id = ? AND r.numero = ?`,
    demandaId, antes.rodadaAtual)
  if (!entregue) throw estadoInvalido('Nada entregue nesta rodada.')
  const itens = linhasParaItens(e.linhas.join('\n'))
  if (itens.length === 0) throw validacao('Escreva pelo menos um ajuste, um por linha.', { linhas: 'vazio' })
  const r = abrirRodada(db, { demandaId, origem: 'interna', linhas: itens, motivo: e.motivo, motivoTexto: e.motivoTexto,
    prazo: e.prazo, prazoHora: e.prazoHora, ator })
  notificar(db, { para: antes.membroIds, tipo: 'ajuste_pedido', demandaId, ator,
    resumo: `${nomeDoAtor(ator) ?? 'Alguém'} pediu ${plural(itens.length, 'ajuste interno', 'ajustes internos')} em ${rotuloDemanda(db, demandaId)} (R${r.rodada.numero})` })
  return { demanda: carregarDemanda(db, demandaId), rodada: r.rodada, checklist: r.checklist, sugerirExtra: r.sugerirExtra }
}

/** POST /api/rodadas/:id/extra: marcar ou desmarcar a rodada como extra (só da rodada 2 em diante). */
export function marcarExtra(db: Db, rodadaId: Id, extra: boolean, ator: Ator): Rodada {
  exigir(ator, 'ciclo.cliente')
  const r = carregarRodada(db, rodadaId)
  if (r.numero <= 1) throw estadoInvalido('A primeira rodada não é extra.')
  const d = demandaViva(db, r.demandaId)
  if (d.arquivadoEm) throw estadoInvalido('Restaure a demanda antes de mudar a rodada.')
  if (r.extra === extra) return r
  rodar(db, 'UPDATE rodada SET extra = ?, extra_marcada_por = ?, extra_marcada_em = ? WHERE id = ?',
    extra ? 1 : 0, extra ? ator.usuario!.id : null, extra ? agora() : null, rodadaId)
  registrarAtividade(db, { tipo: extra ? 'rodada.extra_marcada' : 'rodada.extra_desmarcada', ator, demandaId: r.demandaId,
    dados: { rodadaId, numero: r.numero } })
  const depois = carregarRodada(db, rodadaId)
  emitirObjeto(db, 'rodada', rodadaId, depois, ator, { demandaId: r.demandaId })
  return depois
}
