/**
 * Página pública de aprovação (/a/:token; API.md §4.17 e SPEC §5.4): sem login, o cliente vê só as versões enviadas
 * por aquele link e os comentários visíveis; aprova ou pede ajuste. Regras:
 * - o GET não tem efeito colateral (o robô de prévia do WhatsApp abre o link); o acesso conta pelo POST /visto;
 * - nenhuma leitura de `demanda.versao_atual_id` (trabalho interno ainda não enviado);
 * - demanda arquivada, excluída ou de outro cliente some do link; sem item que sobre: 410 link_inativo;
 * - decisão com Idempotency-Key procurada ANTES de qualquer validação (mesmo pedido → 200 sem efeito; outro → 422);
 * - texto do cliente (nome, linhas) é só texto; caminho de rede nunca aparece; arquivos por URL assinada de 10 min.
 */
import { createHash } from 'node:crypto'
import type {
  ComentarioPublico, DecisaoPublica, DecisaoPublicaEntrada, DecisaoPublicaSaida, Id, ItemAprovacaoPublico, ItemVersaoPublico,
  PaginaAprovacao, VersaoPublica,
} from '../../../shared/tipos/index.ts'
import { dataLocalDe, formatarPrazo, horaLocalDe } from '../../../shared/logica/datas.ts'
import { linhasParaItens } from '../../../shared/logica/texto.ts'
import type { Ator } from '../auth.ts'
import { config } from '../config.ts'
import { agora, rodar, todos, um, type Db } from '../db.ts'
import { ErroHttp, naoEncontrado, validacao } from '../erros.ts'
import { lerArquivo, urlAssinada } from './arquivos.ts'
import { registrarAtividade } from './atividade.ts'
import { carregarVersao, decisaoValida, nomeDoContato, registrarRetorno } from './ciclo.ts'
import { emitirLink } from './ciclo-envio.ts'
import { lerConfig } from './config-app.ts'
import { hashToken, hmac } from './cripto.ts'
import { carregarDemanda } from './demandas.ts'
import { lerLinkDrive } from './drive.ts'

type Linha = Record<string, unknown>

interface LinkLinha {
  id: string
  cliente_id: string
  contato_id: string | null
  expira_em: string
  revogado_em: string | null
}

export const TEXTO_LINK_INATIVO = 'Este link de aprovação não está mais ativo. Peça um novo ao seu atendimento.'
export const TEXTO_NAO_AGUARDA = 'Esta peça não aguarda mais sua decisão.'

const linkInativo = () => new ErroHttp(410, 'link_inativo', TEXTO_LINK_INATIVO)
const naoAguarda = () => new ErroHttp(409, 'conflito', TEXTO_NAO_AGUARDA)

/** Link pelo token (sha256 no banco). Desconhecido → 404; expirado ou revogado → 410. */
function linkAtivoPeloToken(db: Db, token: string): LinkLinha {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw naoEncontrado('Link não encontrado.')
  const l = um<LinkLinha>(db, 'SELECT id, cliente_id, contato_id, expira_em, revogado_em FROM link_publico WHERE token_hash = ?', hashToken(token))
  if (!l) throw naoEncontrado('Link não encontrado.')
  if (l.revogado_em || l.expira_em <= agora()) throw linkInativo()
  return l
}

/** Demandas do link que o cliente ainda vê: vivas, não arquivadas, do cliente do link. */
function demandasDoLink(db: Db, link: LinkLinha): Id[] {
  return todos<{ id: string }>(db, `
    SELECT d.id FROM link_publico_item i JOIN demanda d ON d.id = i.demanda_id
     WHERE i.link_id = ? AND d.arquivado_em IS NULL AND d.excluido_em IS NULL AND d.cliente_id = ?
     ORDER BY i.pos, d.numero`, link.id, link.cliente_id).map((l) => l.id)
}

/** Versões da demanda enviadas por este link (maior número primeiro), com o último envio por ele. */
function versoesDoLink(db: Db, linkId: Id, demandaId: Id): { id: string; numero: number; enviado_em: string; prazo_retorno: string | null; prazo_retorno_hora: string | null }[] {
  return todos(db, `
    SELECT v.id, v.numero, e.enviado_em, e.prazo_retorno, e.prazo_retorno_hora FROM versao v
      JOIN envio e ON e.id = (SELECT e2.id FROM envio e2 WHERE e2.versao_id = v.id AND e2.link_id = ? ORDER BY e2.enviado_em DESC, e2.rowid DESC LIMIT 1)
     WHERE v.demanda_id = ? ORDER BY v.numero DESC`, linkId, demandaId)
}

function enviadaPorEsteLink(db: Db, linkId: Id, versaoId: Id): boolean {
  return !!um(db, 'SELECT 1 FROM envio WHERE versao_id = ? AND link_id = ?', versaoId, linkId)
}

/** Arquivo, link (com prévia e embutir) — caminho de rede nunca vai ao cliente. */
function versaoPublica(db: Db, versaoId: Id, enviadaEm: string): VersaoPublica {
  const v = carregarVersao(db, versaoId)
  const minutos = lerConfig(db).linkPublicoArquivoMinutos
  const itens: ItemVersaoPublico[] = []
  for (const i of v.itens) {
    // link do Drive privado nunca vai ao cliente (veria uma tela de login): o envio só passa com um arquivo no lugar
    if (i.tipo === 'link' && i.url && i.driveStatus === 'privado') continue
    if (i.tipo === 'link' && i.url) {
      const drive = i.provedor === 'drive' ? lerLinkDrive(i.url) : null
      itens.push({
        tipo: 'link', nome: i.nome, url: i.url,
        previaUrl: i.provedor === 'drive' && i.driveStatus === 'publico' ? i.previaUrl : null,
        imagem: false,
        embutivel: drive?.tipo === 'arquivo' || i.provedor === 'youtube' || i.provedor === 'figma',
      })
    } else if (i.tipo === 'arquivo' && i.arquivo) {
      const url = urlAssinada(i.arquivo.id, minutos)
      itens.push({ tipo: 'arquivo', nome: i.nome, url, previaUrl: i.arquivo.imagem ? `${url}&inline=1` : null, imagem: i.arquivo.imagem, embutivel: false })
    }
  }
  return { id: v.id, numero: v.numero, nota: v.nota, enviadaEm, itens }
}

/** "14/10 às 14:03" (horário de São Paulo). */
function quandoCurto(instante: string): string {
  const [, m, d] = dataLocalDe(instante).split('-')
  return `${d}/${m} às ${horaLocalDe(instante)}`
}

/** Menção vira "@Nome" (a página mostra o comentário como texto, sem o renderizador de Markdown). */
const semMencoes = (md: string) => md.replace(/@\[([^\]\n]{1,80})\]\(mencao:[A-Za-z0-9-]{1,64}\)/g, '@$1')

/** O item como o cliente vê (null se a demanda não está mais no link). */
function itemPublico(db: Db, link: LinkLinha, demandaId: Id): ItemAprovacaoPublico | null {
  if (!demandasDoLink(db, link).includes(demandaId)) return null
  const d = carregarDemanda(db, demandaId)
  const versoes = versoesDoLink(db, link.id, demandaId)
  const atual = versoes[0]
  const modeloNome = d.modeloId ? um<{ nome: string }>(db, 'SELECT nome FROM modelo_demanda WHERE id = ?', d.modeloId)?.nome ?? null : null
  let decisao: DecisaoPublica | null = null
  let proximoPasso: string | null = null
  if (atual) {
    const a = decisaoValida(db, atual.id)
    if (a) {
      const nome = nomeDoContato(db, a.contatoId) ?? a.nomeInformado ?? 'a agência'
      decisao = { decisao: a.decisao, versaoNumero: atual.numero, nome, em: a.criadoEm, linhas: a.comentario ? a.comentario.split('\n') : [] }
      if (a.decisao === 'aprovado') {
        proximoPasso = `Aprovado V${atual.numero} por ${nome} em ${quandoCurto(a.criadoEm)}`
      } else {
        const r = a.rodadaAbertaId ? um<{ prazo: string | null; prazo_hora: string | null }>(db, 'SELECT prazo, prazo_hora FROM rodada WHERE id = ?', a.rodadaAbertaId) : undefined
        proximoPasso = r?.prazo
          ? `A equipe prepara a V${atual.numero + 1} até ${formatarPrazo(r.prazo, r.prazo_hora)}`
          : `A equipe prepara a V${atual.numero + 1}`
      }
    } else if (!d.envioPendenteEm || d.versaoEnviadaId !== atual.id) {
      // outra versão foi enviada por outro caminho (ou a agência já tratou): nada a decidir aqui
      proximoPasso = TEXTO_NAO_AGUARDA
    }
  }
  const anteriores = versoes.slice(1).map((v) => ({
    numero: v.numero, enviadaEm: v.enviado_em, decisao: decisaoValida(db, v.id)?.decisao ?? null,
  }))
  const comentarios: ComentarioPublico[] = todos<Linha>(db, `
    SELECT c.corpo_md, c.criado_em, c.autor_externo, u.apelido, u.nome FROM comentario c LEFT JOIN usuario u ON u.id = c.autor_id
     WHERE c.demanda_id = ? AND c.visivel_cliente = 1 AND c.excluido_em IS NULL ORDER BY c.criado_em, c.rowid`, demandaId).map((l) => ({
    autor: (l.apelido as string | null) ?? (l.nome ? String(l.nome).split(' ')[0]! : null) ?? (l.autor_externo as string | null) ?? 'Agência',
    corpoMd: semMencoes(String(l.corpo_md)),
    criadoEm: String(l.criado_em),
  }))
  return {
    demandaId, numero: d.numero, titulo: d.titulo, modeloNome,
    prazoRetorno: atual?.prazo_retorno ?? null, prazoRetornoHora: atual?.prazo_retorno_hora ?? null,
    versao: atual ? versaoPublica(db, atual.id, atual.enviado_em) : null,
    decisao, anteriores, comentarios, proximoPasso,
  }
}

/** GET /api/publico/a/:token: sem efeito colateral. */
export function paginaAprovacao(db: Db, token: string): PaginaAprovacao {
  const link = linkAtivoPeloToken(db, token)
  const itens = demandasDoLink(db, link).map((id) => itemPublico(db, link, id)).filter((i): i is ItemAprovacaoPublico => !!i)
  if (itens.length === 0) throw linkInativo()
  const c = um<{ nome: string; sigla: string; cor: string; logo_arquivo_id: string | null }>(db,
    'SELECT nome, sigla, cor, logo_arquivo_id FROM cliente WHERE id = ?', link.cliente_id)!
  let logoUrl: string | null = null
  if (c.logo_arquivo_id) {
    try {
      lerArquivo(db, c.logo_arquivo_id)
      logoUrl = `${urlAssinada(c.logo_arquivo_id, lerConfig(db).linkPublicoArquivoMinutos)}&inline=1`
    } catch {
      logoUrl = null
    }
  }
  const contato = link.contato_id
    ? um<{ id: string; nome: string }>(db, 'SELECT id, nome FROM cliente_contato WHERE id = ?', link.contato_id) ?? null
    : null
  return {
    app: { nome: config.appNome },
    cliente: { nome: c.nome, sigla: c.sigla, cor: c.cor as PaginaAprovacao['cliente']['cor'], logoUrl },
    contato: contato ? { id: contato.id, nome: contato.nome } : null,
    expiraEm: link.expira_em,
    itens,
  }
}

const SEIS_HORAS = 6 * 3_600_000

/** POST /api/publico/a/:token/visto: soma o acesso; `link.visto` no máximo a cada 6 h. */
export function registrarVisto(db: Db, token: string, ator: Ator): void {
  const link = linkAtivoPeloToken(db, token)
  const demandas = demandasDoLink(db, link)
  if (demandas.length === 0) throw linkInativo()
  const instante = agora()
  rodar(db, 'UPDATE link_publico SET acessos = acessos + 1, ultimo_acesso_em = ? WHERE id = ?', instante, link.id)
  const ultimo = um<{ m: string | null }>(db, `SELECT max(criado_em) AS m FROM atividade WHERE tipo = 'link.visto'
    AND json_extract(dados, '$.linkId') = ?`, link.id)!.m
  if (!ultimo || Date.parse(instante) - Date.parse(ultimo) >= SEIS_HORAS) {
    for (const demandaId of demandas) registrarAtividade(db, { tipo: 'link.visto', ator, demandaId, dados: { linkId: link.id } })
  }
  emitirLink(db, link.id, ator)
}

/** sha256 do pedido (API.md §4.17, passo 2): demandaId|versaoId|decisao|linhas|contatoId|nomeInformado. */
export function hashDecisao(e: DecisaoPublicaEntrada): string {
  return createHash('sha256').update([e.demandaId, e.versaoId, e.decisao, (e.linhas ?? []).join('\n'), e.contatoId ?? '',
    e.nomeInformado ?? ''].join('|'), 'utf8').digest('hex')
}

function mensagemDaDecisao(item: ItemAprovacaoPublico): string {
  if (item.decisao?.decisao === 'aprovado') return `Aprovação registrada. Obrigado, ${item.decisao.nome.split(' ')[0]}.`
  return `Ajustes enviados. ${item.proximoPasso ?? 'A equipe já recebeu'}.`
}

/** Texto puro do nome: sem caracteres de controle, espaços simples. */
function nomeLimpo(s: string | null | undefined): string {
  return (s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * POST /api/publico/a/:token/decisao (API.md §4.17), na ordem: link ativo; a chave (por link) antes de tudo; a demanda é
 * item do link, viva e do cliente dele; versão já decidida → 409 ja_decidida; sem envio pendente por este link → 409
 * "não aguarda"; versão antiga → 409 versao_desatualizada com a atual; identidade (o contato do link ou um nome);
 * ajuste com linha; então `registrarRetorno()` com via 'link'. Roda dentro da transação de quem chama.
 */
export function decidir(db: Db, token: string, chave: string, e: DecisaoPublicaEntrada, ator: Ator, userAgent: string | null): DecisaoPublicaSaida {
  const link = linkAtivoPeloToken(db, token)
  const hash = hashDecisao(e)
  const repetida = um<{ demanda_id: string; idempotency_hash: string }>(db,
    'SELECT demanda_id, idempotency_hash FROM aprovacao WHERE link_id = ? AND idempotency_key = ?', link.id, chave)
  if (repetida) {
    if (repetida.idempotency_hash !== hash) {
      throw new ErroHttp(422, 'idempotencia', 'Esta decisão já foi enviada com outro conteúdo. Recarregue a página.')
    }
    const item = itemPublico(db, link, repetida.demanda_id)
    if (!item) throw linkInativo()
    return { item, mensagem: mensagemDaDecisao(item) }
  }
  if (!demandasDoLink(db, link).includes(e.demandaId)) throw naoAguarda()
  const d = carregarDemanda(db, e.demandaId)
  if (e.versaoId === d.versaoEnviadaId && enviadaPorEsteLink(db, link.id, e.versaoId) && decisaoValida(db, e.versaoId)) {
    throw new ErroHttp(409, 'ja_decidida', 'Esta peça já recebeu uma decisão.')
  }
  if (!d.envioPendenteEm || !d.versaoEnviadaId || !enviadaPorEsteLink(db, link.id, d.versaoEnviadaId)) throw naoAguarda()
  if (e.versaoId !== d.versaoEnviadaId) {
    const atual = versoesDoLink(db, link.id, d.id)[0]!
    throw new ErroHttp(409, 'versao_desatualizada', `Chegou a V${atual.numero}. Veja a versão nova antes de decidir.`,
      { versaoAtual: versaoPublica(db, atual.id, atual.enviado_em) })
  }
  if (decisaoValida(db, e.versaoId)) throw new ErroHttp(409, 'ja_decidida', 'Esta peça já recebeu uma decisão.')
  if (e.contatoId != null && e.contatoId !== link.contato_id) {
    throw validacao('Confirme quem está decidindo.', { contatoId: 'não é o contato deste link' })
  }
  let nomeInformado: string | null = null
  if (e.contatoId == null) {
    nomeInformado = nomeLimpo(e.nomeInformado)
    if (nomeInformado.length < 1 || nomeInformado.length > 120) {
      throw validacao('Escreva o seu nome para registrar a decisão.', { nomeInformado: 'de 1 a 120 caracteres' })
    }
  }
  if (e.decisao === 'ajuste' && linhasParaItens((e.linhas ?? []).join('\n')).length === 0) {
    throw validacao('Escreva pelo menos um ajuste, um por linha.', { linhas: 'vazio' })
  }
  registrarRetorno(db, {
    demandaId: d.id, ator, via: 'link', versaoId: e.versaoId, decisao: e.decisao, linhas: e.linhas, motivo: 'cliente_mudou',
    contatoId: e.contatoId ?? null, nomeInformado, linkId: link.id, idempotencia: { chave, hash },
    ipHmac: ator.ip ? hmac(ator.ip) : null, userAgent,
  })
  const item = itemPublico(db, link, d.id)!
  return { item, mensagem: mensagemDaDecisao(item) }
}
