/**
 * Demandas (API.md §4.12): leitura (card e detalhe), criar (com modelo), editar com If-Match, membros, etiquetas,
 * arquivar, restaurar, excluir (anonimizar), rodadas (§5.7) e contadores. Trocar de coluna/quadro é só pelo
 * `mover()` (servicos/mover.ts); concluir e repetir, pelo `concluir()`.
 *
 * Toda UPDATE em demanda passa por `atualizarLinhaDemanda()`: grava atualizado_por/atualizado_em pelo relógio do app e
 * sobe o `rev` na própria UPDATE quando muda um campo do PATCH (assim o gatilho demanda_rev não roda).
 */
import type {
  Anexo, Checklist, ChecklistComItens, Coluna, Cor, CriarDemandaEntrada, CriarDemandaSaida, DataLocal, Demanda,
  DemandaDetalhe, EditarDemandaEntrada, EditarDemandaSaida, HoraLocal, Id, MotivoRodada, NovoItem, OrigemDemanda,
  Provedor, Rodada,
} from '../../../shared/tipos/index.ts'
import { ehDataLocal, somarDiasUteis } from '../../../shared/logica/datas.ts'
import { prazoDoModelo } from '../../../shared/logica/prazo.ts'
import { colunaDeEntrada as entradaPura, ehCardDaColuna, passouWip } from '../../../shared/logica/quadro.ts'
import { extrairMencoes, linhasParaItens, normalizarAlias } from '../../../shared/logica/texto.ts'
import { detectarSenha } from '../../../shared/logica/senha.ts'
import type { Ator } from '../auth.ts'
import { agora, agoraData, depoisDe, marcadores, novoId, rodar, todos, um, type Db } from '../db.ts'
import { ErroHttp, conflito, estadoInvalido, naoEncontrado, validacao } from '../erros.ts'
import { registrarAtividade } from './atividade.ts'
import { feriados, hoje, lerConfig } from './config-app.ts'
import { emitir, emitirDelete, emitirMudancasDemanda, emitirObjeto } from './eventos.ts'
import { pararCronometros } from './horas.ts'
import { COLUNAS_ARQUIVO, mapear } from './mapear.ts'
import { nomeDoAtor, notificar, notificarChegou, rotuloDemanda } from './notificacoes.ts'
import { exigirAtivos } from './pessoas.ts'
import { posicaoEntre } from './posicao.ts'
import { carregarColuna, carregarEtiqueta, carregarModeloDemanda, carregarQuadro, colunasDoQuadro } from './quadros.ts'

type Linha = Record<string, unknown>

// ─────────────────────────────── leitura ───────────────────────────────

const SELECT_DEMANDA = `
  SELECT d.*, ca.arquivo_id AS capa_arquivo_id
    FROM demanda d LEFT JOIN anexo ca ON ca.id = d.capa_anexo_id AND ca.excluido_em IS NULL`

/**
 * Demandas pelo WHERE (sobre o alias `d`), com membros (na ordem em que entraram) e etiquetas do quadro atual (na
 * ordem do quadro), em 3 consultas.
 */
export function carregarDemandas(db: Db, onde: string, params: unknown[] = [], ordem = 'd.numero'): Demanda[] {
  const linhas = todos<Linha>(db, `${SELECT_DEMANDA} WHERE ${onde} ORDER BY ${ordem}`, ...params)
  if (linhas.length === 0) return []
  const sub = `SELECT d.id FROM demanda d WHERE ${onde}`
  const membros = new Map<string, string[]>()
  for (const l of todos<{ demanda_id: string; usuario_id: string }>(db, `
      SELECT demanda_id, usuario_id FROM demanda_membro WHERE demanda_id IN (${sub}) ORDER BY adicionado_em, rowid`, ...params)) {
    const lista = membros.get(l.demanda_id) ?? []
    lista.push(l.usuario_id)
    membros.set(l.demanda_id, lista)
  }
  const etiquetas = new Map<string, string[]>()
  for (const l of todos<{ demanda_id: string; etiqueta_id: string }>(db, `
      SELECT de.demanda_id, de.etiqueta_id FROM demanda_etiqueta de
        JOIN demanda dd ON dd.id = de.demanda_id AND dd.quadro_id = de.quadro_id
        JOIN etiqueta e ON e.id = de.etiqueta_id
       WHERE de.demanda_id IN (${sub}) ORDER BY e.pos, e.id`, ...params)) {
    const lista = etiquetas.get(l.demanda_id) ?? []
    lista.push(l.etiqueta_id)
    etiquetas.set(l.demanda_id, lista)
  }
  return linhas.map((l) => mapear.demanda(l, membros.get(String(l.id)) ?? [], etiquetas.get(String(l.id)) ?? []))
}

/** A demanda (inclusive arquivada ou anonimizada). 404 se não existe. */
export function carregarDemanda(db: Db, id: Id): Demanda {
  const [d] = carregarDemandas(db, 'd.id = ?', [id])
  if (!d) throw naoEncontrado('Demanda não encontrada.')
  return d
}

/** Demanda viva (não excluída) pelo id: 404 se não existe ou foi excluída. */
export function demandaViva(db: Db, id: Id): Demanda {
  const d = carregarDemanda(db, id)
  if (um(db, 'SELECT 1 FROM demanda WHERE id = ? AND excluido_em IS NOT NULL', id)) throw naoEncontrado('Demanda não encontrada.')
  return d
}

/** Está no conjunto do bootstrap (API.md §3): quadro ativo, não arquivada, aberta ou concluída há pouco. */
export function naBootstrap(d: Pick<Demanda, 'arquivadoEm' | 'concluidaEm'>, quadroAtivo: boolean, agoraDt: Date, concluidasDias: number): boolean {
  return quadroAtivo && ehCardDaColuna(d, agoraDt, concluidasDias)
}

/** naBootstrap lendo do banco o quadro e a configuração. */
export function estaNoBootstrap(db: Db, d: Demanda): boolean {
  if (um(db, 'SELECT 1 FROM demanda WHERE id = ? AND excluido_em IS NOT NULL', d.id)) return false
  const ativo = !!um(db, 'SELECT 1 FROM quadro WHERE id = ? AND arquivado_em IS NULL', d.quadroId)
  return naBootstrap(d, ativo, agoraData(), lerConfig(db).quadroConcluidasDias)
}

/**
 * "Cards da coluna" (API.md §4.6): não arquivados e abertos ou concluídos há no máximo quadroConcluidasDias, na ordem
 * da coluna.
 */
export function cardsDaColuna(db: Db, colunaId: Id): Id[] {
  const limite = new Date(agoraData().getTime() - lerConfig(db).quadroConcluidasDias * 86_400_000).toISOString()
  return todos<{ id: string }>(db, `
    SELECT id FROM demanda WHERE coluna_id = ? AND arquivado_em IS NULL AND excluido_em IS NULL
       AND (concluida_em IS NULL OR concluida_em > ?) ORDER BY posicao, numero`, colunaId, limite).map((l) => l.id)
}

/** A coluna de entrada do quadro (primeira ativa de papel normal; sem nenhuma, a primeira ativa). 422 sem colunas. */
export function colunaDeEntrada(db: Db, quadroId: Id): Coluna {
  const c = entradaPura(colunasDoQuadro(db, quadroId), quadroId)
  if (!c) throw estadoInvalido('Crie uma coluna antes.')
  return c
}

function carregarChecklists(db: Db, demandaId: Id, onde = '1 = 1', params: unknown[] = []): ChecklistComItens[] {
  const itens = todos<Linha>(db, 'SELECT * FROM checklist_item WHERE demanda_id = ? ORDER BY pos, id', demandaId).map(mapear.checklistItem)
  return todos<Linha>(db, `SELECT * FROM checklist WHERE demanda_id = ? AND ${onde} ORDER BY pos, id`, demandaId, ...params)
    .map((l) => ({ ...mapear.checklist(l), itens: itens.filter((i) => i.checklistId === l.id) }))
}

export function carregarChecklistComItens(db: Db, id: Id): ChecklistComItens {
  const l = um<Linha>(db, 'SELECT * FROM checklist WHERE id = ?', id)
  if (!l) throw naoEncontrado('Checklist não encontrado.')
  return carregarChecklists(db, String(l.demanda_id), 'id = ?', [id])[0]!
}

export function carregarAnexo(db: Db, id: Id): Anexo {
  const l = um<Linha>(db, `SELECT a.*, ${COLUNAS_ARQUIVO} FROM anexo a LEFT JOIN arquivo ar ON ar.id = a.arquivo_id WHERE a.id = ?`, id)
  if (!l) throw naoEncontrado('Anexo não encontrado.')
  return mapear.anexo(l)
}

export function carregarRodada(db: Db, id: Id): Rodada {
  const l = um<Linha>(db, `SELECT r.*, d.rodadas_inclusas AS inclusas FROM rodada r JOIN demanda d ON d.id = r.demanda_id WHERE r.id = ?`, id)
  if (!l) throw naoEncontrado('Rodada não encontrada.')
  return mapear.rodada(l, Number(l.inclusas))
}

/** GET /api/demandas/:numero (API.md §4.12): tudo o que o modal mostra, numa ida. */
export function carregarDetalhe(db: Db, numero: number, ator: Ator): DemandaDetalhe {
  const base = um<{ id: string; descricao_md: string; origem_texto: string | null; excluido_em: string | null }>(db,
    'SELECT id, descricao_md, origem_texto, excluido_em FROM demanda WHERE numero = ?', numero)
  if (!base || base.excluido_em) throw naoEncontrado('Demanda não encontrada.')
  const demanda = carregarDemanda(db, base.id)
  const gestao = ator.papel === 'admin' || ator.papel === 'atendimento'
  const itensVersao = todos<Linha>(db, `
    SELECT vi.*, ${COLUNAS_ARQUIVO} FROM versao_item vi LEFT JOIN arquivo ar ON ar.id = vi.arquivo_id
     WHERE vi.demanda_id = ? ORDER BY vi.pos, vi.id`, base.id).map(mapear.versaoItem)
  const links = gestao ? todos<Linha>(db, `
    SELECT l.* FROM link_publico l JOIN link_publico_item i ON i.link_id = l.id WHERE i.demanda_id = ? ORDER BY l.criado_em`, base.id) : []
  const eu = ator.usuario?.id ?? null
  return {
    demanda,
    quadro: carregarQuadro(db, demanda.quadroId),
    coluna: carregarColuna(db, demanda.colunaId),
    descricaoMd: base.descricao_md,
    origemTexto: base.origem_texto,
    mencoes: todos<{ usuario_id: string }>(db, 'SELECT usuario_id FROM demanda_mencao WHERE demanda_id = ?', base.id).map((l) => l.usuario_id),
    checklists: carregarChecklists(db, base.id),
    anexos: todos<Linha>(db, `
      SELECT a.*, ${COLUNAS_ARQUIVO} FROM anexo a LEFT JOIN arquivo ar ON ar.id = a.arquivo_id
       WHERE a.demanda_id = ? AND a.excluido_em IS NULL ORDER BY a.pos, a.id`, base.id).map(mapear.anexo),
    rodadas: todos<Linha>(db, 'SELECT * FROM rodada WHERE demanda_id = ? ORDER BY numero', base.id)
      .map((l) => mapear.rodada(l, demanda.rodadasInclusas)),
    versoes: todos<Linha>(db, 'SELECT * FROM versao WHERE demanda_id = ? ORDER BY numero', base.id)
      .map((l) => mapear.versao(l, itensVersao.filter((i) => i.versaoId === l.id))),
    envios: todos<Linha>(db, 'SELECT * FROM envio WHERE demanda_id = ? ORDER BY enviado_em, rowid', base.id).map(mapear.envio),
    aprovacoes: todos<Linha>(db, 'SELECT * FROM aprovacao WHERE demanda_id = ? ORDER BY criado_em, rowid', base.id).map(mapear.aprovacao),
    linksPublicos: links.map((l) => mapear.linkPublico(l, todos<{ demanda_id: string }>(db,
      'SELECT demanda_id FROM link_publico_item WHERE link_id = ? ORDER BY pos', l.id).map((x) => x.demanda_id))),
    movimentos: todos<Linha>(db, 'SELECT * FROM demanda_movimento WHERE demanda_id = ? ORDER BY id', base.id).map(mapear.movimento),
    tempo: {
      totalMin: demanda.minutosRegistrados,
      meusMin: eu === null ? 0 : Number(um<{ m: number }>(db, `SELECT coalesce(sum(minutos), 0) AS m FROM apontamento
        WHERE demanda_id = ? AND usuario_id = ? AND excluido_em IS NULL AND minutos IS NOT NULL`, base.id, eu)!.m),
    },
  }
}

// ─────────────────────────────── escrita da linha ───────────────────────────────

/** Colunas que o PATCH edita: mudar uma delas sobe o rev (as outras, não). */
const COLUNAS_REV = new Set([
  'titulo', 'descricao_md', 'cliente_id', 'atendimento_id', 'prioridade', 'inicio', 'inicio_hora', 'prazo', 'prazo_hora',
  'publicacao_data', 'publicacao_hora', 'estimativa_min', 'repetir', 'capa_cor', 'capa_anexo_id', 'rodadas_inclusas',
])

/**
 * UPDATE da demanda com `atualizado_por` (o usuário do ator; NULL para cliente e sistema) e `atualizado_em = agora()`.
 * Sobe o rev na mesma UPDATE se algum campo do PATCH mudou de valor.
 */
export function atualizarLinhaDemanda(db: Db, id: Id, campos: Record<string, unknown>, ator: Ator): void {
  const chaves = Object.keys(campos)
  if (chaves.some((k) => !/^[a-z_]+$/.test(k))) throw new Error(`coluna inválida em ${chaves.join(',')}`)
  const atual = um<Linha>(db, `SELECT ${['rev', ...chaves].join(', ')} FROM demanda WHERE id = ?`, id)
  if (!atual) throw naoEncontrado('Demanda não encontrada.')
  const normal = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null))
  const sobeRev = chaves.some((k) => COLUNAS_REV.has(k) && normal(atual[k]) !== normal(campos[k]))
  const sets = chaves.map((k) => `${k} = ?`)
  sets.push('atualizado_por = ?', 'atualizado_em = ?')
  if (sobeRev) sets.push('rev = rev + 1')
  rodar(db, `UPDATE demanda SET ${sets.join(', ')} WHERE id = ?`, ...chaves.map((k) => campos[k]), ator.usuario?.id ?? null, agora(), id)
}

/**
 * Re-lê `n_*` e `minutosRegistrados` (mantidos por gatilho) e emite o patch: os contadores com o ator, os minutos num
 * evento à parte com ator e trace nulos (não revela quem lançou). `antes` limita aos que mudaram.
 */
export function emitirContadores(db: Db, demandaId: Id, ator: Ator, antes?: Demanda): void {
  // toda UPDATE em demanda grava atualizado_por e atualizado_em (001_base.sql); atualizado_por não sai no DTO
  rodar(db, 'UPDATE demanda SET atualizado_por = ?, atualizado_em = ? WHERE id = ?', ator.usuario?.id ?? null, agora(), demandaId)
  const d = carregarDemanda(db, demandaId)
  const contadores = (['nVersoes', 'nAnexos', 'nCheckTotal', 'nCheckFeitos', 'nComentarios', 'versaoAtualId', 'capaAnexoId', 'capaUrl'] as const)
    .filter((k) => !antes || antes[k] !== d[k])
  if (contadores.length > 0) {
    const patch: Partial<Demanda> = {}
    for (const k of contadores) (patch as Record<string, unknown>)[k] = d[k]
    emitir(db, { entidade: 'demanda', id: d.id, demandaId: d.id, op: 'upsert', patch, campos: contadores, ator })
  }
  if (!antes || antes.minutosRegistrados !== d.minutosRegistrados) {
    emitir(db, { entidade: 'demanda', id: d.id, demandaId: d.id, op: 'upsert', patch: { minutosRegistrados: d.minutosRegistrados },
      campos: ['minutosRegistrados'], ator, anonimo: true })
  }
}

// ─────────────────────────────── anexos e menções ───────────────────────────────

const PROVEDORES: [RegExp, Provedor][] = [
  [/(^|\.)drive\.google\.com$/, 'drive'], [/(^|\.)docs\.google\.com$/, 'docs'], [/(^|\.)figma\.com$/, 'figma'],
  [/(^|\.)canva\.com$/, 'canva'], [/(^|\.)(wetransfer\.com|we\.tl)$/, 'wetransfer'],
  [/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/, 'youtube'], [/(^|\.)vimeo\.com$/, 'vimeo'],
  [/(^|\.)dropbox\.com$/, 'dropbox'],
]

/** Provedor pelo host do link https. */
export function detectarProvedor(url: string): Provedor {
  const host = new URL(url).hostname.toLowerCase()
  return PROVEDORES.find(([re]) => re.test(host))?.[1] ?? 'outro'
}

/** Só https (API.md §5.8): 400 para outro esquema ou URL inválida. */
export function exigirHttps(url: string, campo = 'url'): string {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    throw validacao('Link inválido.', { [campo]: 'URL inválida' })
  }
  if (u.protocol !== 'https:') throw validacao('Use um link https.', { [campo]: 'só https' })
  return u.toString()
}

/** Anexo de referência (link https, caminho de rede ou arquivo enviado). Emite `anexo`. */
export function inserirAnexo(db: Db, demandaId: Id, item: NovoItem & { finalidade?: Anexo['finalidade']; comentarioId?: Id | null },
  ator: Ator): Anexo {
  const id = novoId()
  let url: string | null = null
  let caminho: string | null = null
  let arquivoId: string | null = null
  let provedor: Provedor
  let nome = item.nome?.trim() || ''
  if (item.tipo === 'link') {
    url = exigirHttps(item.url)
    provedor = detectarProvedor(url)
    nome ||= url
  } else if (item.tipo === 'caminho') {
    caminho = item.caminho.trim()
    if (!caminho || caminho.length > 1000) throw validacao('Caminho inválido.', { caminho: 'vazio ou longo demais' })
    provedor = 'rede'
    nome ||= caminho.split(/[\\/]/).filter(Boolean).at(-1) ?? caminho
  } else {
    const arq = um<{ nome: string }>(db, 'SELECT nome FROM arquivo WHERE id = ?', item.arquivoId)
    if (!arq) throw validacao('Arquivo inexistente.', { arquivoId: 'arquivo inexistente' })
    arquivoId = item.arquivoId
    provedor = 'arquivo'
    nome ||= arq.nome
  }
  const pos = posicaoEntre(db, { tabela: 'anexo', coluna: 'pos', escopo: { coluna: 'demanda_id', valor: demandaId } }, undefined)
  rodar(db, `INSERT INTO anexo (id, demanda_id, comentario_id, finalidade, tipo, nome, url, caminho, arquivo_id, provedor, pos,
                                enviado_por, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, demandaId, item.comentarioId ?? null, item.finalidade ?? 'referencia', item.tipo, nome.slice(0, 200), url, caminho, arquivoId,
    provedor, pos, ator.usuario?.id ?? null, agora())
  const anexo = carregarAnexo(db, id)
  emitirObjeto(db, 'anexo', id, anexo, ator, { demandaId })
  return anexo
}

/** Menções válidas (pessoas ativas) do Markdown. */
export function mencoesValidas(db: Db, md: string): Id[] {
  const ids = extrairMencoes(md)
  if (ids.length === 0) return []
  const ativos = new Set(todos<{ id: string }>(db, `SELECT id FROM usuario WHERE ativo = 1 AND id IN (${marcadores(ids.length)})`, ...ids)
    .map((l) => l.id))
  return ids.filter((id) => ativos.has(id))
}

/** Regrava `demanda_mencao` com as menções atuais da descrição; devolve as NOVAS (que notificam). */
function gravarMencoesDescricao(db: Db, demandaId: Id, md: string): Id[] {
  const atuais = mencoesValidas(db, md)
  const antes = new Set(todos<{ usuario_id: string }>(db, 'SELECT usuario_id FROM demanda_mencao WHERE demanda_id = ?', demandaId)
    .map((l) => l.usuario_id))
  rodar(db, 'DELETE FROM demanda_mencao WHERE demanda_id = ?', demandaId)
  for (const u of atuais) rodar(db, 'INSERT INTO demanda_mencao (demanda_id, usuario_id) VALUES (?, ?)', demandaId, u)
  return atuais.filter((u) => !antes.has(u))
}

// ─────────────────────────────── criar ───────────────────────────────

function exigirData(v: DataLocal | null | undefined, campo: string): void {
  if (v !== null && v !== undefined && !ehDataLocal(v)) throw validacao('Data inválida.', { [campo]: 'data inválida' })
}

/** Datas coerentes (API.md §4.12): hora só com data, início até o prazo, repetir só com prazo. */
function exigirDatasCoerentes(d: {
  inicio: DataLocal | null; inicioHora: HoraLocal | null; prazo: DataLocal | null; prazoHora: HoraLocal | null
  publicacaoData: DataLocal | null; publicacaoHora: HoraLocal | null; repetir: string
}): void {
  exigirData(d.inicio, 'inicio')
  exigirData(d.prazo, 'prazo')
  exigirData(d.publicacaoData, 'publicacaoData')
  if (d.inicioHora && !d.inicio) throw validacao('Hora de início sem data.', { inicioHora: 'falta a data de início' })
  if (d.prazoHora && !d.prazo) throw validacao('Hora do prazo sem data.', { prazoHora: 'falta a data do prazo' })
  if (d.publicacaoHora && !d.publicacaoData) throw validacao('Hora de publicação sem data.', { publicacaoHora: 'falta a data' })
  if (d.inicio && d.prazo && d.inicio > d.prazo) throw validacao('O início vem depois do prazo.', { inicio: 'depois do prazo' })
  if (d.repetir !== 'nenhuma' && !d.prazo) throw validacao('Para repetir, a demanda precisa de prazo.', { repetir: 'sem prazo' })
}

function proximoNumero(db: Db): number {
  const max = Number(um<{ m: number | null }>(db, 'SELECT max(numero) AS m FROM demanda')!.m ?? 0)
  return Math.max(max + 1, lerConfig(db).demandaNumeroInicial)
}

/** Opções internas: o F1 (copiar), a repetição e o seed usam. */
export interface OpcoesCriacao {
  /** Notificar membros, `chegou` e menções (padrão true). */
  notificar?: boolean
  /** criado_por quando o ator não é usuário (repetição criada pelo cliente ou pelo sistema). */
  criadoPor?: Id
}

/**
 * Cria a demanda (API.md §4.12). Com `modeloId`, o que o corpo não trouxer sai do modelo (descrição, prazo em dias
 * úteis, prioridade, estimativa, rodadas, checklists, etiquetas por nome — criadas no quadro se não houver par).
 * Não confere CAMPOS_SO_ATENDIMENTO (a rota confere; o "Copiar" do F1 leva os valores da original).
 */
export function criarDemanda(db: Db, e: Omit<CriarDemandaEntrada, 'origem'> & { origem?: OrigemDemanda; origemDemandaId?: Id }, ator: Ator,
  opcoes: OpcoesCriacao = {}): CriarDemandaSaida {
  const quadro = um<{ id: string; arquivado_em: string | null }>(db, 'SELECT id, arquivado_em FROM quadro WHERE id = ?', e.quadroId)
  if (!quadro) throw validacao('Quadro inexistente.', { quadroId: 'quadro inexistente' })
  if (quadro.arquivado_em) throw estadoInvalido('Este quadro está arquivado.')
  let coluna: Coluna
  if (e.colunaId) {
    const l = um<Linha>(db, 'SELECT * FROM coluna WHERE id = ?', e.colunaId)
    if (!l || l.quadro_id !== quadro.id) throw validacao('A coluna não é deste quadro.', { colunaId: 'coluna de outro quadro' })
    coluna = mapear.coluna(l)
    if (coluna.arquivadaEm) throw estadoInvalido('Esta coluna está arquivada.')
  } else {
    coluna = colunaDeEntrada(db, quadro.id)
  }

  const modelo = e.modeloId ? carregarModeloDemanda(db, e.modeloId) : null
  if (modelo && (!modelo.ativo || (modelo.quadroId !== null && modelo.quadroId !== quadro.id))) {
    throw validacao('Este modelo não vale para este quadro.', { modeloId: 'modelo inativo ou de outro quadro' })
  }
  const cliente = e.clienteId
    ? um<{ id: string; atendimento_id: string | null; rodadas_inclusas: number }>(db,
      'SELECT id, atendimento_id, rodadas_inclusas FROM cliente WHERE id = ?', e.clienteId)
    : null
  if (e.clienteId && !cliente) throw validacao('Cliente inexistente.', { clienteId: 'cliente inexistente' })
  if (e.atendimentoId) exigirAtivos(db, [e.atendimentoId], 'atendimentoId')
  const membrosPedidos = [...new Set(e.membroIds ?? [])]
  exigirAtivos(db, membrosPedidos, 'membroIds')
  const etiquetasPedidas = [...new Set(e.etiquetaIds ?? [])]
  if (etiquetasPedidas.length > 0) {
    const n = um<{ n: number }>(db, `SELECT count(*) AS n FROM etiqueta WHERE quadro_id = ? AND id IN (${marcadores(etiquetasPedidas.length)})`,
      quadro.id, ...etiquetasPedidas)!.n
    if (n !== etiquetasPedidas.length) throw validacao('Etiqueta de outro quadro.', { etiquetaIds: 'etiqueta de outro quadro' })
  }
  const titulo = e.titulo.trim()
  if (!titulo) throw validacao('Escreva um título.', { titulo: 'vazio' })

  const fer = feriados(db)
  const prazo = e.prazo !== undefined ? e.prazo : (modelo ? prazoDoModelo(hoje(), modelo.prazoDiasUteis, fer) : null)
  const datas = {
    inicio: e.inicio ?? null, inicioHora: e.inicioHora ?? null, prazo, prazoHora: prazo ? (e.prazoHora ?? null) : null,
    publicacaoData: e.publicacaoData ?? null, publicacaoHora: e.publicacaoHora ?? null, repetir: e.repetir ?? 'nenhuma',
  }
  exigirDatasCoerentes(datas)
  const atendimentoId = e.atendimentoId !== undefined ? e.atendimentoId
    : (cliente?.atendimento_id ?? (ator.papel === 'atendimento' ? ator.usuario!.id : null))
  const rodadasInclusas = e.rodadasInclusas ?? modelo?.rodadasInclusas ?? cliente?.rodadas_inclusas ?? 2
  const descricaoMd = e.descricaoMd ?? modelo?.briefingMd ?? ''
  const criadoPor = ator.usuario?.id ?? opcoes.criadoPor
  if (!criadoPor) throw new Error('criarDemanda sem usuário: passe opcoes.criadoPor')

  const id = novoId()
  const instante = agora()
  const numero = proximoNumero(db)
  const posicao = posicaoEntre(db, { tabela: 'demanda', coluna: 'posicao', escopo: { coluna: 'coluna_id', valor: coluna.id } }, e.posicao)
  const concluida = coluna.papel === 'concluida'
  rodar(db, `
    INSERT INTO demanda (id, numero, quadro_id, coluna_id, posicao, titulo, descricao_md, descricao_atualizada_em, cliente_id,
      atendimento_id, modelo_id, prioridade, inicio, inicio_hora, prazo, prazo_hora, publicacao_data, publicacao_hora,
      estimativa_min, repetir, capa_cor, concluida_em, concluida_por, status_desde, rodadas_inclusas, origem, origem_demanda_id,
      origem_texto, criado_por, atualizado_por, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, numero, quadro.id, coluna.id, posicao, titulo.slice(0, 500), descricaoMd, e.clienteId ?? null, atendimentoId,
    modelo?.id ?? null, e.prioridade ?? modelo?.prioridade ?? 'media', datas.inicio, datas.inicioHora, datas.prazo, datas.prazoHora,
    datas.publicacaoData, datas.publicacaoHora, e.estimativaMin ?? modelo?.estimativaMin ?? null, datas.repetir, e.capaCor ?? null,
    concluida ? instante : null, concluida ? (ator.usuario?.id ?? null) : null, instante, rodadasInclusas,
    e.origem ?? 'manual', e.origemDemandaId ?? null, e.origemTexto ?? null, criadoPor, ator.usuario?.id ?? null, instante, instante)

  // membros: os pedidos + a pessoa da coluna (coluna de pessoa)
  const membros = [...membrosPedidos]
  if (coluna.responsavelId && !membros.includes(coluna.responsavelId)
    && um(db, 'SELECT 1 FROM usuario WHERE id = ? AND ativo = 1', coluna.responsavelId)) membros.push(coluna.responsavelId)
  for (const u of membros) {
    rodar(db, 'INSERT INTO demanda_membro (demanda_id, usuario_id, adicionado_por, adicionado_em) VALUES (?, ?, ?, ?)',
      id, u, ator.usuario?.id ?? null, instante)
  }

  // etiquetas: as pedidas + as do modelo por nome (sem par: criadas no quadro com a cor do modelo)
  const etiquetas = new Set(etiquetasPedidas)
  const criadas: Id[] = []
  if (modelo && e.etiquetaIds === undefined) {
    const doQuadro = todos<{ id: string; nome: string }>(db, 'SELECT id, nome FROM etiqueta WHERE quadro_id = ?', quadro.id)
    for (const me of modelo.etiquetas) {
      const par = doQuadro.find((et) => et.nome !== '' && normalizarAlias(et.nome) === normalizarAlias(me.nome))
      if (par) {
        etiquetas.add(par.id)
      } else {
        const nova = novoId()
        const pos = posicaoEntre(db, { tabela: 'etiqueta', coluna: 'pos', escopo: { coluna: 'quadro_id', valor: quadro.id } }, undefined)
        rodar(db, 'INSERT INTO etiqueta (id, quadro_id, nome, cor, pos, criado_em) VALUES (?, ?, ?, ?, ?, ?)', nova, quadro.id, me.nome, me.cor, pos, instante)
        doQuadro.push({ id: nova, nome: me.nome })
        criadas.push(nova)
        etiquetas.add(nova)
      }
    }
  }
  for (const et of etiquetas) {
    rodar(db, 'INSERT INTO demanda_etiqueta (demanda_id, etiqueta_id, quadro_id) VALUES (?, ?, ?)', id, et, quadro.id)
  }

  // rodada 1, checklists do modelo, anexos dos links, menções
  const rodadaId = novoId()
  rodar(db, `INSERT INTO rodada (id, demanda_id, numero, origem, prazo, prazo_hora, prazo_original, aberta_em, aberta_por)
             VALUES (?, ?, 1, 'inicial', ?, ?, ?, ?, ?)`, rodadaId, id, datas.prazo, datas.prazoHora, datas.prazo, instante, ator.usuario?.id ?? null)
  const checklists: Id[] = []
  if (modelo && modelo.itens.length > 0) {
    const grupos = new Map<string, string[]>()
    for (const item of modelo.itens) grupos.set(item.checklist, [...(grupos.get(item.checklist) ?? []), item.texto])
    let pos = 0
    for (const [tituloChecklist, textos] of grupos) {
      checklists.push(inserirChecklist(db, id, tituloChecklist, textos, null, (pos += 1024), ator))
    }
  }
  const mencoes = gravarMencoesDescricao(db, id, descricaoMd)

  registrarAtividade(db, { tipo: 'demanda.criada', ator, demandaId: id,
    dados: { origem: e.origem ?? 'manual', quadroId: quadro.id, colunaId: coluna.id, modeloId: modelo?.id ?? null } })
  for (const et of criadas) emitirObjeto(db, 'etiqueta', et, carregarEtiqueta(db, et), ator)
  const demanda = carregarDemanda(db, id)
  emitirObjeto(db, 'demanda', id, demanda, ator, { demandaId: id })
  emitirObjeto(db, 'rodada', rodadaId, carregarRodada(db, rodadaId), ator, { demandaId: id })
  for (const c of checklists) emitirChecklist(db, c, ator)
  for (const link of e.links ?? []) inserirAnexo(db, id, link, ator)

  if (opcoes.notificar !== false) {
    const rotulo = `#${numero} ${titulo}`
    const quem = nomeDoAtor(ator)
    const notificados = notificar(db, { para: membros, tipo: 'membro', demandaId: id, ator,
      resumo: quem ? `${quem} pôs você em ${rotulo}` : `Você entrou em ${rotulo}` })
    const chegou = notificarChegou(db, { demandaId: id, quadroId: quadro.id, ator, via: 'criacao', colunaPapel: coluna.papel, exceto: notificados })
    notificar(db, { para: mencoes, tipo: 'mencao', demandaId: id, ator, exceto: [...notificados, ...chegou],
      resumo: quem ? `${quem} mencionou você em ${rotulo}` : `Você foi mencionado em ${rotulo}` })
  }
  const final = e.links?.length ? carregarDemanda(db, id) : demanda
  const avisos: CriarDemandaSaida['avisos'] = []
  if (detectarSenha(`${titulo}\n${descricaoMd}`)) avisos.push('senha_detectada')
  if (passouWip(coluna, cardsDaColuna(db, coluna.id).length)) avisos.push('limite_wip')
  return { demanda: final, avisos }
}

/** Checklist com itens (sem eventos). Devolve o id. */
export function inserirChecklist(db: Db, demandaId: Id, titulo: string, textos: string[], rodadaId: Id | null, pos: number, ator: Ator): Id {
  const id = novoId()
  const instante = agora()
  rodar(db, 'INSERT INTO checklist (id, demanda_id, titulo, rodada_id, pos, criado_por, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, demandaId, titulo.trim().slice(0, 200) || 'Checklist', rodadaId, pos, ator.usuario?.id ?? null, instante)
  textos.forEach((texto, i) => {
    rodar(db, 'INSERT INTO checklist_item (id, checklist_id, demanda_id, texto, pos, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
      novoId(), id, demandaId, texto.trim().slice(0, 2000), (i + 1) * 1024, instante)
  })
  return id
}

/** Emite `checklist` e um `checklist_item` por item. */
export function emitirChecklist(db: Db, checklistId: Id, ator: Ator): ChecklistComItens {
  const c = carregarChecklistComItens(db, checklistId)
  const { itens, ...checklist } = c
  emitirObjeto(db, 'checklist', c.id, checklist satisfies Checklist, ator, { demandaId: c.demandaId })
  for (const item of itens) emitirObjeto(db, 'checklist_item', item.id, item, ator, { demandaId: c.demandaId })
  return c
}

// ─────────────────────────────── editar (PATCH) ───────────────────────────────

const PARA_COLUNA: Record<keyof EditarDemandaEntrada, string> = {
  titulo: 'titulo', descricaoMd: 'descricao_md', clienteId: 'cliente_id', atendimentoId: 'atendimento_id',
  prioridade: 'prioridade', inicio: 'inicio', inicioHora: 'inicio_hora', prazo: 'prazo', prazoHora: 'prazo_hora',
  publicacaoData: 'publicacao_data', publicacaoHora: 'publicacao_hora', estimativaMin: 'estimativa_min', repetir: 'repetir',
  capaCor: 'capa_cor', capaAnexoId: 'capa_anexo_id', rodadasInclusas: 'rodadas_inclusas',
}

export function conflitoRev(db: Db, d: Demanda): ErroHttp {
  const descricaoMd = um<{ descricao_md: string }>(db, 'SELECT descricao_md FROM demanda WHERE id = ?', d.id)!.descricao_md
  return new ErroHttp(409, 'conflito_rev', 'Alguém mudou esta demanda ao mesmo tempo.', { atual: { demanda: d, descricaoMd } })
}

/**
 * PATCH (API.md §4.12): rev diferente → 409 conflito_rev com a demanda e a descrição; trocar o cliente troca o AM
 * quando o AM era o do cliente antigo (ou nenhum) e as horas acompanham (gatilho); cliente fixo depois do envio →
 * 409; prazo acompanha a rodada atual (§5.7); capa por anexo de imagem desta demanda (limpa a cor e vice-versa);
 * descrição → menções novas notificam. `semPermissao` pula a checagem de campos (uso interno).
 */
export function atualizarDemanda(db: Db, id: Id, mudancas: EditarDemandaEntrada & Record<string, unknown>, ator: Ator,
  opcoes: { rev?: number; semPermissao?: boolean } = {}): EditarDemandaSaida {
  const antes = demandaViva(db, id)
  if (opcoes.rev !== undefined && opcoes.rev !== antes.rev) throw conflitoRev(db, antes)
  if (antes.arquivadoEm) throw estadoInvalido('Demanda arquivada. Restaure para editar.')
  const linhaAntes = um<{ descricao_md: string }>(db, 'SELECT descricao_md FROM demanda WHERE id = ?', id)!
  const m = { ...mudancas } as EditarDemandaEntrada
  for (const k of Object.keys(m) as (keyof EditarDemandaEntrada)[]) if (!(k in PARA_COLUNA) || m[k] === undefined) delete m[k]

  if (m.titulo !== undefined) {
    m.titulo = m.titulo.trim()
    if (!m.titulo) throw validacao('Escreva um título.', { titulo: 'vazio' })
  }
  if (m.clienteId !== undefined && m.clienteId !== antes.clienteId) {
    if (antes.versaoEnviadaId) throw conflito('Esta demanda já foi enviada ao cliente. Para outro cliente, copie a demanda.')
    const novo = m.clienteId ? um<{ atendimento_id: string | null }>(db, 'SELECT atendimento_id FROM cliente WHERE id = ?', m.clienteId) : null
    if (m.clienteId && !novo) throw validacao('Cliente inexistente.', { clienteId: 'cliente inexistente' })
    const amAntigo = antes.clienteId
      ? um<{ atendimento_id: string | null }>(db, 'SELECT atendimento_id FROM cliente WHERE id = ?', antes.clienteId)?.atendimento_id ?? null
      : null
    if (m.atendimentoId === undefined && (antes.atendimentoId === null || antes.atendimentoId === amAntigo)) {
      m.atendimentoId = novo?.atendimento_id ?? null
    }
  }
  if (m.atendimentoId) exigirAtivos(db, [m.atendimentoId], 'atendimentoId')
  if (m.capaAnexoId !== undefined && m.capaAnexoId !== null) {
    const capa = um<{ mime: string | null }>(db, `SELECT ar.mime FROM anexo a LEFT JOIN arquivo ar ON ar.id = a.arquivo_id
      WHERE a.id = ? AND a.demanda_id = ? AND a.excluido_em IS NULL`, m.capaAnexoId, id)
    if (!capa || !capa.mime?.startsWith('image/')) {
      throw validacao('A capa precisa ser uma imagem anexada a esta demanda.', { capaAnexoId: 'não é imagem desta demanda' })
    }
    if (m.capaCor === undefined) m.capaCor = null
  }
  if (m.capaCor !== undefined && m.capaCor !== null && m.capaAnexoId === undefined) m.capaAnexoId = null
  if (m.rodadasInclusas !== undefined && (!Number.isInteger(m.rodadasInclusas) || m.rodadasInclusas < 0 || m.rodadasInclusas > 20)) {
    throw validacao('Rodadas inclusas de 0 a 20.', { rodadasInclusas: 'fora da faixa' })
  }
  const final = {
    inicio: m.inicio !== undefined ? m.inicio : antes.inicio,
    inicioHora: m.inicioHora !== undefined ? m.inicioHora : (m.inicio === null ? null : antes.inicioHora),
    prazo: m.prazo !== undefined ? m.prazo : antes.prazo,
    prazoHora: m.prazoHora !== undefined ? m.prazoHora : (m.prazo === null ? null : antes.prazoHora),
    publicacaoData: m.publicacaoData !== undefined ? m.publicacaoData : antes.publicacaoData,
    publicacaoHora: m.publicacaoHora !== undefined ? m.publicacaoHora : (m.publicacaoData === null ? null : antes.publicacaoHora),
    repetir: m.repetir ?? antes.repetir,
  }
  exigirDatasCoerentes(final)
  if (m.inicio === null) m.inicioHora = null
  if (m.prazo === null) m.prazoHora = null
  if (m.publicacaoData === null) m.publicacaoHora = null

  const campos: Record<string, unknown> = {}
  for (const k of Object.keys(m) as (keyof EditarDemandaEntrada)[]) campos[PARA_COLUNA[k]] = m[k]
  const mudouDescricao = m.descricaoMd !== undefined && m.descricaoMd !== linhaAntes.descricao_md
  if (mudouDescricao) campos.descricao_atualizada_em = agora()
  if (Object.keys(campos).length === 0) return { demanda: antes, avisos: [] }
  atualizarLinhaDemanda(db, id, campos, ator)

  // o prazo acompanha a rodada atual (§5.7): a 1, ou a renegociação da rodada aberta
  if (m.prazo !== undefined || m.prazoHora !== undefined) {
    const r = um<{ id: string }>(db, 'SELECT id FROM rodada WHERE demanda_id = ? AND numero = ?', id, antes.rodadaAtual)
    if (r) {
      rodar(db, 'UPDATE rodada SET prazo = ?, prazo_hora = ? WHERE id = ?', final.prazo, final.prazoHora, r.id)
      emitirObjeto(db, 'rodada', r.id, carregarRodada(db, r.id), ator, { demandaId: id })
    }
  }
  const mencoesNovas = mudouDescricao ? gravarMencoesDescricao(db, id, m.descricaoMd!) : []
  const mudaram = (Object.keys(m) as (keyof EditarDemandaEntrada)[]).filter((k) =>
    k === 'descricaoMd' ? mudouDescricao : JSON.stringify(m[k] ?? null) !== JSON.stringify((antes as unknown as Record<string, unknown>)[k] ?? null))
  if (mudaram.length > 0) {
    const anteriores: Record<string, unknown> = {}
    for (const k of mudaram) anteriores[k] = k === 'descricaoMd' ? linhaAntes.descricao_md : (antes as unknown as Record<string, unknown>)[k]
    registrarAtividade(db, { tipo: 'demanda.editada', ator, demandaId: id, dados: { campos: mudaram }, antes: anteriores })
  }
  emitirMudancasDemanda(db, antes, ator)
  if (mencoesNovas.length > 0) {
    const quem = nomeDoAtor(ator)
    notificar(db, { para: mencoesNovas, tipo: 'mencao', demandaId: id, ator,
      resumo: `${quem ?? 'Alguém'} mencionou você em ${rotuloDemanda(db, id)}` })
  }
  const avisos: EditarDemandaSaida['avisos'] = []
  if ((m.descricaoMd !== undefined || m.titulo !== undefined) && detectarSenha(`${m.titulo ?? ''}\n${m.descricaoMd ?? ''}`)) {
    avisos.push('senha_detectada')
  }
  return { demanda: carregarDemanda(db, id), avisos }
}

// ─────────────────────────────── membros e etiquetas ───────────────────────────────

function exigirEditavel(db: Db, id: Id): Demanda {
  const d = demandaViva(db, id)
  if (d.arquivadoEm) throw estadoInvalido('Demanda arquivada. Restaure para editar.')
  return d
}

/** Idempotente. Pessoa inativa → 400. Notifica `membro` se não foi ela mesma. */
export function adicionarMembro(db: Db, demandaId: Id, usuarioId: Id, ator: Ator): Demanda {
  const antes = exigirEditavel(db, demandaId)
  exigirAtivos(db, [usuarioId], 'usuarioId')
  if (antes.membroIds.includes(usuarioId)) return antes
  rodar(db, 'INSERT INTO demanda_membro (demanda_id, usuario_id, adicionado_por, adicionado_em) VALUES (?, ?, ?, ?)',
    demandaId, usuarioId, ator.usuario?.id ?? null, agora())
  atualizarLinhaDemanda(db, demandaId, {}, ator)
  const atividadeId = registrarAtividade(db, { tipo: 'demanda.membro_adicionado', ator, demandaId, dados: { usuarioId } })
  emitirMudancasDemanda(db, antes, ator)
  const quem = nomeDoAtor(ator)
  notificar(db, { para: usuarioId, tipo: 'membro', demandaId, atividadeId, ator,
    resumo: `${quem ?? 'Alguém'} pôs você em ${rotuloDemanda(db, demandaId)}` })
  return carregarDemanda(db, demandaId)
}

export function removerMembro(db: Db, demandaId: Id, usuarioId: Id, ator: Ator): Demanda {
  const antes = exigirEditavel(db, demandaId)
  if (!antes.membroIds.includes(usuarioId)) return antes
  rodar(db, 'DELETE FROM demanda_membro WHERE demanda_id = ? AND usuario_id = ?', demandaId, usuarioId)
  atualizarLinhaDemanda(db, demandaId, {}, ator)
  registrarAtividade(db, { tipo: 'demanda.membro_removido', ator, demandaId, dados: { usuarioId } })
  emitirMudancasDemanda(db, antes, ator)
  return carregarDemanda(db, demandaId)
}

/** A etiqueta precisa ser do quadro da demanda (400). Idempotente. */
export function adicionarEtiqueta(db: Db, demandaId: Id, etiquetaId: Id, ator: Ator): Demanda {
  const antes = exigirEditavel(db, demandaId)
  const et = um<Linha>(db, 'SELECT * FROM etiqueta WHERE id = ?', etiquetaId)
  if (!et || et.quadro_id !== antes.quadroId) throw validacao('A etiqueta é de outro quadro.', { etiquetaId: 'etiqueta de outro quadro' })
  if (antes.etiquetaIds.includes(etiquetaId)) return antes
  rodar(db, 'INSERT OR IGNORE INTO demanda_etiqueta (demanda_id, etiqueta_id, quadro_id) VALUES (?, ?, ?)', demandaId, etiquetaId, antes.quadroId)
  atualizarLinhaDemanda(db, demandaId, {}, ator)
  registrarAtividade(db, { tipo: 'demanda.etiqueta_adicionada', ator, demandaId,
    dados: { etiquetaId, nome: String(et.nome), cor: et.cor as Cor } })
  emitirMudancasDemanda(db, antes, ator)
  return carregarDemanda(db, demandaId)
}

export function removerEtiqueta(db: Db, demandaId: Id, etiquetaId: Id, ator: Ator): Demanda {
  const antes = exigirEditavel(db, demandaId)
  const et = um<Linha>(db, 'SELECT * FROM etiqueta WHERE id = ?', etiquetaId)
  if (!et) return antes
  const r = rodar(db, 'DELETE FROM demanda_etiqueta WHERE demanda_id = ? AND etiqueta_id = ?', demandaId, etiquetaId)
  if (r.changes === 0) return antes
  atualizarLinhaDemanda(db, demandaId, {}, ator)
  registrarAtividade(db, { tipo: 'demanda.etiqueta_removida', ator, demandaId,
    dados: { etiquetaId, nome: String(et.nome), cor: et.cor as Cor } })
  emitirMudancasDemanda(db, antes, ator)
  return carregarDemanda(db, demandaId)
}

// ─────────────────────────────── arquivar, restaurar, excluir ───────────────────────────────

/** Não muda coluna nem quadro; para os cronômetros ligados nela. */
export function arquivarDemanda(db: Db, id: Id, ator: Ator): Demanda {
  const antes = demandaViva(db, id)
  if (antes.arquivadoEm) throw conflito('Esta demanda já está arquivada.')
  atualizarLinhaDemanda(db, id, { arquivado_em: agora(), arquivado_por: ator.usuario?.id ?? null }, ator)
  pararCronometros(db, { demandaId: id }, ator)
  registrarAtividade(db, { tipo: 'demanda.arquivada', ator, demandaId: id, dados: {} })
  emitirMudancasDemanda(db, antes, ator)
  return carregarDemanda(db, id)
}

/**
 * Restaurar (API.md §4.12): quadro arquivado → 422; coluna = a pedida ?? a de antes (se ativa) ?? a de entrada;
 * trocar de coluna grava status_desde como o mover; coluna `concluida` conclui (sem repetição). `posicao` padrão:
 * o fim da coluna nova (na mesma coluna, mantém).
 */
export function restaurarDemanda(db: Db, id: Id, e: { colunaId?: Id; posicao?: { depoisDeId?: Id | null } }, ator: Ator): Demanda {
  const antes = demandaViva(db, id)
  if (!antes.arquivadoEm) throw conflito('Esta demanda não está arquivada.')
  const quadro = carregarQuadro(db, antes.quadroId)
  if (quadro.arquivadoEm) throw estadoInvalido('Restaure o quadro antes.')
  let coluna: Coluna
  if (e.colunaId) {
    const l = um<Linha>(db, 'SELECT * FROM coluna WHERE id = ?', e.colunaId)
    if (!l || l.quadro_id !== quadro.id) throw validacao('A coluna não é do quadro da demanda.', { colunaId: 'coluna de outro quadro' })
    coluna = mapear.coluna(l)
    if (coluna.arquivadaEm) throw estadoInvalido('Esta coluna está arquivada.')
  } else {
    const anterior = carregarColuna(db, antes.colunaId)
    coluna = anterior.arquivadaEm ? colunaDeEntrada(db, quadro.id) : anterior
  }
  const campos: Record<string, unknown> = { arquivado_em: null, arquivado_por: null }
  if (coluna.id !== antes.colunaId || e.posicao) {
    campos.posicao = posicaoEntre(db, { tabela: 'demanda', coluna: 'posicao', escopo: { coluna: 'coluna_id', valor: coluna.id } }, e.posicao, id)
  }
  if (coluna.id !== antes.colunaId) {
    campos.coluna_id = coluna.id
    campos.status_desde = depoisDe(antes.statusDesde)
  }
  const concluir = coluna.papel === 'concluida' && !antes.concluidaEm
  if (concluir) {
    campos.concluida_em = agora()
    campos.concluida_por = ator.usuario?.id ?? null
  }
  atualizarLinhaDemanda(db, id, campos, ator)
  registrarAtividade(db, { tipo: 'demanda.restaurada', ator, demandaId: id, dados: { quadroId: quadro.id, colunaId: coluna.id } })
  if (concluir) registrarAtividade(db, { tipo: 'demanda.concluida', ator, demandaId: id, dados: { via: 'coluna' } })
  emitirMudancasDemanda(db, antes, ator, { inteira: true })
  return carregarDemanda(db, id)
}

/**
 * Excluir = anonimizar (admin; API.md §4.12). Bloqueado com versão, envio ou aprovação (409). Limpa textos,
 * comentários, checklists, anexos (o arquivo vai para o lixo se ninguém mais usar), notas, histórico e eventos
 * guardados; revoga os links; arquiva e marca excluido_em. Depois disso, detalhe, comentários e histórico → 404.
 */
export function excluirDemanda(db: Db, id: Id, confirmarNumero: number, ator: Ator): void {
  const antes = demandaViva(db, id)
  if (confirmarNumero !== antes.numero) throw validacao('O número digitado não confere.', { confirmarNumero: 'diferente do número da demanda' })
  const trilha = um<{ n: number }>(db, `SELECT (SELECT count(*) FROM versao WHERE demanda_id = ?) + (SELECT count(*) FROM envio WHERE demanda_id = ?)
    + (SELECT count(*) FROM aprovacao WHERE demanda_id = ?) AS n`, id, id, id)!.n
  if (trilha > 0) throw conflito('Esta demanda tem versões ou decisões do cliente. Arquive em vez de excluir.')
  const instante = agora()
  const quem = ator.usuario?.id ?? null
  pararCronometros(db, { demandaId: id }, ator)
  const anonimo: Record<string, unknown> = {
    titulo: 'Demanda excluída', descricao_md: '', origem_texto: null, capa_cor: null, capa_anexo_id: null, excluido_em: instante,
  }
  if (!antes.arquivadoEm) Object.assign(anonimo, { arquivado_em: instante, arquivado_por: quem })
  atualizarLinhaDemanda(db, id, anonimo, ator)
  rodar(db, 'DELETE FROM demanda_mencao WHERE demanda_id = ?', id)
  rodar(db, 'DELETE FROM comentario_mencao WHERE comentario_id IN (SELECT id FROM comentario WHERE demanda_id = ?)', id)
  rodar(db, `UPDATE comentario SET corpo_md = '', excluido_em = coalesce(excluido_em, ?) WHERE demanda_id = ?`, instante, id)
  rodar(db, `UPDATE checklist SET titulo = '—' WHERE demanda_id = ?`, id)
  rodar(db, `UPDATE checklist_item SET texto = '—' WHERE demanda_id = ?`, id)
  const arquivos = todos<{ arquivo_id: string }>(db, 'SELECT DISTINCT arquivo_id FROM anexo WHERE demanda_id = ? AND arquivo_id IS NOT NULL', id)
  rodar(db, `UPDATE anexo SET excluido_em = coalesce(excluido_em, ?), nome = 'Anexo removido', url = NULL, caminho = NULL,
               arquivo_id = NULL WHERE demanda_id = ?`, instante, id)
  for (const a of arquivos) mandarParaLixoSeSemUso(db, a.arquivo_id)
  rodar(db, 'UPDATE rodada SET motivo_texto = NULL WHERE demanda_id = ?', id)
  rodar(db, 'UPDATE apontamento SET nota = NULL WHERE demanda_id = ?', id)
  rodar(db, `UPDATE atividade SET dados = '{}', antes = NULL WHERE demanda_id = ?`, id)
  rodar(db, `UPDATE notificacao SET resumo = 'Demanda excluída' WHERE demanda_id = ?`, id)
  rodar(db, `UPDATE evento SET patch = '{}' WHERE demanda_id = ? AND patch IS NOT NULL`, id)
  rodar(db, `UPDATE link_publico SET revogado_em = ?, revogado_por = ?
              WHERE revogado_em IS NULL AND id IN (SELECT link_id FROM link_publico_item WHERE demanda_id = ?)`, instante, quem, id)
  registrarAtividade(db, { tipo: 'demanda.excluida', ator, demandaId: id, dados: {} })
  emitirDelete(db, 'demanda', id, ator, { demandaId: id })
}

/** Marca o arquivo como excluído (lixo) se nada mais o usa (lista da API §4.14). Devolve se marcou. */
export function mandarParaLixoSeSemUso(db: Db, arquivoId: Id): boolean {
  const emUso = um(db, `SELECT 1 WHERE EXISTS (SELECT 1 FROM versao_item WHERE arquivo_id = ?)
    OR EXISTS (SELECT 1 FROM cliente WHERE logo_arquivo_id = ?)
    OR EXISTS (SELECT 1 FROM anexo WHERE arquivo_id = ? AND excluido_em IS NULL)`, arquivoId, arquivoId, arquivoId)
  if (emUso) return false
  return rodar(db, 'UPDATE arquivo SET excluido_em = ? WHERE id = ? AND excluido_em IS NULL', agora(), arquivoId).changes === 1
}

// ─────────────────────────────── rodadas ───────────────────────────────

/**
 * Abre a rodada N+1 (API.md §5.7; o F2 chama no ajuste do cliente e no ajuste interno): fecha a atual, cria a nova
 * com prazo (padrão: hoje + ajustePrazoDiasUteis) e prazo original, `rodadaAtual = N+1`, `demanda.prazo = prazo`
 * (o início vai junto se ficaria depois do prazo) e o checklist "Ajustes R{N+1}" (uma linha por item).
 * `sugerirExtra` se N+1 passou das inclusas. Não notifica nem move (quem chama faz).
 */
export function abrirRodada(db: Db, p: {
  demandaId: Id; origem: 'cliente' | 'interna'; linhas: string[]; motivo: MotivoRodada; motivoTexto?: string | null
  prazo?: DataLocal; prazoHora?: HoraLocal | null; ator: Ator
}): { rodada: Rodada; checklist: ChecklistComItens; sugerirExtra: boolean } {
  const antes = demandaViva(db, p.demandaId)
  exigirData(p.prazo, 'prazo')
  const instante = agora()
  const prazo = p.prazo ?? somarDiasUteis(hoje(), lerConfig(db).ajustePrazoDiasUteis, feriados(db))
  const prazoHora = p.prazoHora ?? null
  const numero = antes.rodadaAtual + 1
  const aberta = um<{ id: string }>(db, 'SELECT id FROM rodada WHERE demanda_id = ? AND fechada_em IS NULL', p.demandaId)
  if (aberta) rodar(db, 'UPDATE rodada SET fechada_em = ? WHERE id = ?', instante, aberta.id)
  const rodadaId = novoId()
  rodar(db, `INSERT INTO rodada (id, demanda_id, numero, origem, motivo, motivo_texto, prazo, prazo_hora, prazo_original, aberta_em, aberta_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    rodadaId, p.demandaId, numero, p.origem, p.motivo, p.motivoTexto?.trim() || null, prazo, prazoHora, prazo, instante,
    p.ator.usuario?.id ?? null)
  const campos: Record<string, unknown> = { rodada_atual: numero, prazo, prazo_hora: prazoHora }
  if (antes.inicio && antes.inicio > prazo) {
    campos.inicio = prazo
    campos.inicio_hora = null
  }
  atualizarLinhaDemanda(db, p.demandaId, campos, p.ator)
  const itens = linhasParaItens(p.linhas.join('\n'))
  const posMax = Number(um<{ m: number | null }>(db, 'SELECT max(pos) AS m FROM checklist WHERE demanda_id = ?', p.demandaId)!.m ?? 0)
  const checklistId = inserirChecklist(db, p.demandaId, `Ajustes R${numero}`, itens, rodadaId, posMax + 1024, p.ator)
  const sugerirExtra = numero > antes.rodadasInclusas
  registrarAtividade(db, { tipo: 'rodada.aberta', ator: p.ator, demandaId: p.demandaId,
    dados: { rodadaId, numero, origem: p.origem, motivo: p.motivo, prazo, itens: itens.length, extra: false } })
  if (aberta) emitirObjeto(db, 'rodada', aberta.id, carregarRodada(db, aberta.id), p.ator, { demandaId: p.demandaId })
  const rodada = carregarRodada(db, rodadaId)
  emitirObjeto(db, 'rodada', rodadaId, rodada, p.ator, { demandaId: p.demandaId })
  const checklist = emitirChecklist(db, checklistId, p.ator)
  emitirMudancasDemanda(db, antes, p.ator)
  return { rodada, checklist, sugerirExtra }
}
