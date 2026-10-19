/**
 * Ferramentas de escrita do MCP (F7, API.md §F.5, linhas 7 a 15): criar, editar, mover, comentar, checklist, concluir,
 * arquivar, lançar horas e registrar retorno. Cada uma monta a entrada da API (o mesmo formato do corpo da rota) e
 * passa por `entradaDaApi()` — `exigirCamposPermitidos` + `validar(<o esquema da rota>)` — antes do serviço de sempre:
 * nenhuma regra de papel nova, os mesmos limites da tela. Rodam síncronas dentro da tx() do adaptador, que já gravou o
 * mcp_traco ("via Claude"). Nada apaga definitivamente; nada fala com o cliente.
 */
import { z } from 'zod'
import type { CriarDemandaEntrada, Demanda, EditarDemandaEntrada, Id, PosicaoRelativa } from '../../../shared/tipos/index.ts'
import { LIMITES_MCP, MOTIVOS_RODADA, PRIORIDADES, REPETICOES } from '../../../shared/tipos/index.ts'
import { ehDataLocal, ehHoraLocal, hojeSP } from '../../../shared/logica/datas.ts'
import { dataHora, duracao, plural, umaLinha } from '../../../shared/logica/mcp-texto.ts'
import { normalizarAlias } from '../../../shared/logica/texto.ts'
import { validar, type Ator } from '../auth.ts'
import { config } from '../config.ts'
import { agoraData, todos, um, type Db } from '../db.ts'
import * as esquemaNucleo from '../esquemas.ts'
import { registrarRetorno } from './ciclo.ts'
import * as esquemaCiclo from './ciclo-esquemas.ts'
import { concluir } from './concluir.ts'
import {
  adicionarEtiqueta, adicionarMembro, arquivarDemanda, atualizarDemanda, carregarDemanda, criarDemanda, origemDaProximaDesfeita,
  removerEtiqueta, removerMembro, restaurarDemanda,
} from './demandas.ts'
import { ErroMcp, escrita, ferramenta, type Ferramenta } from './mcp-comum.ts'
import { chave, Nomes } from './mcp-nomes.ts'
import { checklistsDe, criarChecklist, criarItens, editarItem } from './modal-checklists.ts'
import { criarComentario } from './modal-comentarios.ts'
import * as esquemaModal from './modal-esquemas.ts'
import { lancarTempo } from './modal-tempo.ts'
import { mover } from './mover.ts'
import { notificarLote } from './notificacoes.ts'
import { exigirCamposPermitidos, podeAtor } from './permissoes.ts'

/**
 * A entrada da API pelas mesmas portas da rota: os campos que o papel não pode mandar (403 campo_nao_permitido) e o
 * esquema zod da rota (400 validacao com o campo). O zod da ferramenta só traduziu nomes em ids. `campos`: a lista que a
 * rota confere (`demanda`, `cliente`) ou null quando a rota não confere campo por papel (colunas, etiquetas).
 */
export function entradaDaApi<T>(ator: Ator, entrada: Record<string, unknown>, esquema: z.ZodType<T>,
  campos: 'demanda' | 'cliente' | null = 'demanda'): T {
  observador?.(entrada, esquema)
  if (campos) exigirCamposPermitidos(ator, entrada, campos)
  return validar(esquema, entrada)
}

let observador: ((entrada: Record<string, unknown>, esquema: z.ZodType) => void) | null = null

/**
 * Testes: vê cada entrada montada (o teste confere que as chaves estão no esquema da rota; o zod da rota descartaria
 * em silêncio uma chave a mais). null desliga.
 */
export function observarEntradas(fn: typeof observador): void {
  observador = fn
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const hora = z.string().regex(/^\d{2}:\d{2}$/)
const numero = z.number().int().min(1)
const nome = z.string().max(80)

function exigirData(v: string | null | undefined, campo: string): void {
  if (v !== null && v !== undefined && !ehDataLocal(v)) throw new ErroMcp(`${campo}: data inválida (use AAAA-MM-DD).`)
}
function exigirHora(v: string | null | undefined, campo: string): void {
  if (v !== null && v !== undefined && !ehHoraLocal(v)) throw new ErroMcp(`${campo}: hora inválida (use HH:MM).`)
}

const link = (n: number) => `${config.appUrl}/d/${n}`

function avisosTexto(avisos: readonly string[], d?: Demanda, n?: Nomes): string[] {
  const saida: string[] = []
  if (avisos.includes('senha_detectada')) saida.push('Atenção: parece haver uma senha no texto; prefira o cofre da agência.')
  if (avisos.includes('limite_wip') && d && n) saida.push(`Atenção: a coluna ${umaLinha(n.colunaPorId(d.colunaId)?.nome, 60)} passou do limite de cards.`)
  return saida
}

// ─────────────────────────────── 7. criar_demanda ───────────────────────────────

const itemLote = z.object({
  titulo: z.string().max(500), prazo: data.optional(), prazoHora: hora.optional(), publicacao: data.optional(),
  publicacaoHora: hora.optional(), descricao: z.string().max(100000).optional(),
}).strict()

const criar = ferramenta({
  nome: 'criar_demanda', titulo: 'Criar demanda',
  descricao: 'Cria uma demanda (ou até 20 de uma vez) num quadro, com modelo, cliente, membros e prazo.',
  esquema: z.object({
    titulo: z.string().max(500).optional().describe('Ou lote.'),
    quadro: nome,
    coluna: nome.optional().describe('Padrão: a de entrada.'),
    cliente: nome.optional(),
    modelo: nome.optional(),
    descricao: z.string().max(100000).optional().describe('Markdown; padrão: o briefing do modelo.'),
    membros: z.array(nome).max(20).optional().describe('Apelidos ou eu.'),
    etiquetas: z.array(nome).max(20).optional(),
    prioridade: z.enum(PRIORIDADES).optional(),
    inicio: data.optional(),
    prazo: data.optional(),
    prazoHora: hora.optional(),
    publicacao: data.optional(),
    publicacaoHora: hora.optional(),
    estimativaMin: z.number().int().min(1).max(100000).optional(),
    repetir: z.enum(REPETICOES).optional(),
    checklist: z.array(z.string().max(2000)).max(100).optional().describe('Itens no checklist "Checklist".'),
    lote: z.array(itemLote).min(1).max(LIMITES_MCP.loteMax).optional().describe('O resto vale para todas.'),
  }).strict(),
  anotacoes: escrita(false), escrita: true,
  executar({ db, ator, usuario }, a) {
    const n = new Nomes(db, usuario.id)
    if ((a.titulo === undefined) === (a.lote === undefined)) throw new ErroMcp('Mande titulo (uma demanda) ou lote (várias), um dos dois.')
    const quadro = n.quadro(a.quadro)
    const coluna = a.coluna ? n.coluna(quadro, a.coluna) : null
    const cliente = a.cliente ? n.cliente(a.cliente) : null
    const modelo = a.modelo ? n.modelo(a.modelo, quadro.id) : null
    const membros = [...new Set((a.membros ?? []).map((m) => n.pessoa(m).id))]
    const etiquetas = [...new Set((a.etiquetas ?? []).map((e) => n.etiqueta(quadro.id, e).id))]
    const itens = a.lote ?? [{ titulo: a.titulo!, prazo: a.prazo, prazoHora: a.prazoHora, publicacao: a.publicacao,
      publicacaoHora: a.publicacaoHora, descricao: a.descricao }]
    const criadas: string[] = []
    // lote: um aviso só por pessoa no fim (revisão funcional da Fase 2, achado 11), em vez de um por demanda
    const emLote = itens.length > 1
    const idsDoLote: Id[] = []
    for (const item of itens) {
      exigirData(a.inicio, 'inicio'); exigirData(item.prazo, 'prazo'); exigirData(item.publicacao, 'publicacao')
      exigirHora(item.prazoHora, 'prazoHora'); exigirHora(item.publicacaoHora, 'publicacaoHora')
      const bruto: Record<string, unknown> = {
        quadroId: quadro.id, titulo: item.titulo, origem: 'manual',
        ...(coluna ? { colunaId: coluna.id } : {}),
        ...(cliente ? { clienteId: cliente.id } : {}),
        ...(modelo ? { modeloId: modelo.id } : {}),
        ...((item.descricao ?? a.descricao) !== undefined ? { descricaoMd: item.descricao ?? a.descricao } : {}),
        ...(membros.length ? { membroIds: membros } : {}),
        ...(etiquetas.length ? { etiquetaIds: etiquetas } : {}),
        ...(a.prioridade ? { prioridade: a.prioridade } : {}),
        ...(a.inicio ? { inicio: a.inicio } : {}),
        ...((item.prazo ?? a.prazo) ? { prazo: item.prazo ?? a.prazo } : {}),
        ...((item.prazoHora ?? a.prazoHora) ? { prazoHora: item.prazoHora ?? a.prazoHora } : {}),
        ...((item.publicacao ?? a.publicacao) ? { publicacaoData: item.publicacao ?? a.publicacao } : {}),
        ...((item.publicacaoHora ?? a.publicacaoHora) ? { publicacaoHora: item.publicacaoHora ?? a.publicacaoHora } : {}),
        ...(a.estimativaMin ? { estimativaMin: a.estimativaMin } : {}),
        ...(a.repetir ? { repetir: a.repetir } : {}),
      }
      const e = entradaDaApi(ator, bruto, esquemaNucleo.criarDemanda) as CriarDemandaEntrada
      const { demanda, avisos } = criarDemanda(db, e, ator, emLote ? { emLote: true } : {})
      idsDoLote.push(demanda.id)
      if (a.checklist?.length) {
        const existente = checklistsDe(db, demanda.id).find((c) => normalizarAlias(c.titulo) === 'checklist')
        if (existente) criarItens(db, existente.id, validar(esquemaModal.criarItens, { textos: a.checklist }), ator)
        else criarChecklist(db, demanda.id, validar(esquemaModal.criarChecklist, { titulo: 'Checklist', itens: a.checklist }), ator)
      }
      const d = carregarDemanda(db, demanda.id)
      const partes = [`Criada #${d.numero} «${umaLinha(d.titulo, 120)}» em ${n.lugar(d)}`]
      if (d.prazo) partes.push(`prazo ${dataHora(d.prazo, d.prazoHora)}`)
      if (d.membroIds.length) partes.push(d.membroIds.map((m) => n.handle(m)).join(' '))
      partes.push(link(d.numero))
      criadas.push([partes.join(' · '), ...avisosTexto(avisos, d, n)].join('\n'))
    }
    if (emLote) {
      const primeira = carregarDemanda(db, idsDoLote[0]!)
      notificarLote(db, { demandaIds: idsDoLote, membros: primeira.membroIds, quadroId: quadro.id, ator,
        colunaPapel: n.colunaPorId(primeira.colunaId)?.papel ?? 'normal' })
    }
    return criadas.join('\n')
  },
})

// ─────────────────────────────── 8. editar_demanda ───────────────────────────────

const ROTULO_CAMPO: Partial<Record<keyof Demanda, string>> = {
  titulo: 'título', clienteId: 'cliente', prioridade: 'prioridade', inicio: 'início', prazo: 'prazo', prazoHora: 'hora do prazo',
  publicacaoData: 'publicação', publicacaoHora: 'hora da publicação', estimativaMin: 'estimativa', repetir: 'repetir',
}

const editar = ferramenta({
  nome: 'editar_demanda', titulo: 'Editar demanda',
  descricao: 'Muda campos de uma demanda: título, descrição, cliente, prioridade, datas, membros e etiquetas.',
  esquema: z.object({
    numero,
    rev: z.number().int().min(1).optional().describe('O de ler_demanda; obrigatório com titulo, descricao ou acrescentarDescricao.'),
    titulo: z.string().max(500).optional(),
    descricao: z.string().max(100000).optional().describe('Substitui o texto inteiro.'),
    acrescentarDescricao: z.string().max(100000).optional().describe('Acrescenta ao fim.'),
    cliente: nome.nullable().optional(),
    prioridade: z.enum(PRIORIDADES).optional(),
    inicio: data.nullable().optional(),
    prazo: data.nullable().optional(),
    prazoHora: hora.nullable().optional(),
    publicacao: data.nullable().optional(),
    publicacaoHora: hora.nullable().optional(),
    estimativaMin: z.number().int().min(1).max(100000).nullable().optional(),
    repetir: z.enum(REPETICOES).optional(),
    membrosEntrar: z.array(nome).max(20).optional(),
    membrosSair: z.array(nome).max(20).optional(),
    etiquetasPor: z.array(nome).max(20).optional(),
    etiquetasTirar: z.array(nome).max(20).optional(),
  }).strict(),
  anotacoes: escrita(true, true), escrita: true,
  executar({ db, ator, usuario }, a) {
    const n = new Nomes(db, usuario.id)
    const antes = n.demanda(a.numero)
    const mexeTexto = a.titulo !== undefined || a.descricao !== undefined || a.acrescentarDescricao !== undefined
    if (mexeTexto && a.rev === undefined) throw new ErroMcp('Mande o rev de ler_demanda para mudar o título ou a descrição.')
    if (a.rev !== undefined && a.rev !== antes.rev) {
      throw new ErroMcp(`A demanda mudou desde a sua leitura (rev ${a.rev} → ${antes.rev}). Leia de novo.`)
    }
    if (a.descricao !== undefined && a.acrescentarDescricao !== undefined) throw new ErroMcp('Use descricao ou acrescentarDescricao, não os dois.')
    const descAtual = um<{ descricao_md: string }>(db, 'SELECT descricao_md FROM demanda WHERE id = ?', antes.id)!.descricao_md
    if (a.descricao !== undefined && descAtual.length > LIMITES_MCP.descricaoMaxCaracteres) {
      throw new ErroMcp(`A descrição tem ${descAtual.length} caracteres e a leitura corta em 4.000: use acrescentarDescricao ou edite pela tela.`)
    }
    for (const [v, c] of [[a.inicio, 'inicio'], [a.prazo, 'prazo'], [a.publicacao, 'publicacao']] as const) exigirData(v, c)
    exigirHora(a.prazoHora, 'prazoHora'); exigirHora(a.publicacaoHora, 'publicacaoHora')

    const bruto: Record<string, unknown> = {}
    if (a.titulo !== undefined) bruto.titulo = a.titulo
    if (a.descricao !== undefined) bruto.descricaoMd = a.descricao
    if (a.acrescentarDescricao !== undefined) {
      bruto.descricaoMd = descAtual.trim() ? `${descAtual}\n\n${a.acrescentarDescricao}` : a.acrescentarDescricao
    }
    if (a.cliente !== undefined) bruto.clienteId = a.cliente === null ? null : n.cliente(a.cliente).id
    if (a.prioridade !== undefined) bruto.prioridade = a.prioridade
    if (a.inicio !== undefined) bruto.inicio = a.inicio
    if (a.prazo !== undefined) bruto.prazo = a.prazo
    if (a.prazoHora !== undefined) bruto.prazoHora = a.prazoHora
    if (a.publicacao !== undefined) bruto.publicacaoData = a.publicacao
    if (a.publicacaoHora !== undefined) bruto.publicacaoHora = a.publicacaoHora
    if (a.estimativaMin !== undefined) bruto.estimativaMin = a.estimativaMin
    if (a.repetir !== undefined) bruto.repetir = a.repetir
    const entrar = (a.membrosEntrar ?? []).map((m) => n.pessoa(m).id)
    const sair = (a.membrosSair ?? []).map((m) => n.pessoa(m).id)
    const por = (a.etiquetasPor ?? []).map((e) => n.etiqueta(antes.quadroId, e))
    const tirar = (a.etiquetasTirar ?? []).map((e) => n.etiqueta(antes.quadroId, e))
    if (Object.keys(bruto).length === 0 && !entrar.length && !sair.length && !por.length && !tirar.length) {
      throw new ErroMcp('Nada para mudar: mande pelo menos um campo.')
    }

    if (Object.keys(bruto).length > 0) {
      const e = entradaDaApi(ator, bruto, esquemaNucleo.editarDemanda) as EditarDemandaEntrada
      atualizarDemanda(db, antes.id, { ...e }, ator, a.rev !== undefined ? { rev: a.rev } : {})
    }
    for (const u of entrar) adicionarMembro(db, antes.id, u, ator)
    for (const u of sair) removerMembro(db, antes.id, u, ator)
    for (const et of por) adicionarEtiqueta(db, antes.id, et.id, ator)
    for (const et of tirar) removerEtiqueta(db, antes.id, et.id, ator)

    const depois = carregarDemanda(db, antes.id)
    const mudou: string[] = []
    const valor = (k: keyof Demanda, d: Demanda): string => {
      const v = d[k]
      if (v === null || v === undefined) return '—'
      if (k === 'clienteId') return n.clientePorId(String(v))?.sigla ?? '?'
      if (k === 'titulo') return `«${umaLinha(String(v), 80)}»`
      if (k === 'estimativaMin') return duracao(Number(v))
      return String(v)
    }
    for (const k of Object.keys(ROTULO_CAMPO) as (keyof Demanda)[]) {
      if (JSON.stringify(antes[k]) !== JSON.stringify(depois[k])) mudou.push(`${ROTULO_CAMPO[k]} ${valor(k, antes)} → ${valor(k, depois)}`)
    }
    if (bruto.descricaoMd !== undefined && um<{ descricao_md: string }>(db, 'SELECT descricao_md FROM demanda WHERE id = ?', antes.id)!.descricao_md !== descAtual) {
      mudou.push(a.acrescentarDescricao !== undefined ? 'descrição acrescentada' : 'descrição trocada')
    }
    for (const u of depois.membroIds.filter((x) => !antes.membroIds.includes(x))) mudou.push(`+${n.handle(u)}`)
    for (const u of antes.membroIds.filter((x) => !depois.membroIds.includes(x))) mudou.push(`−${n.handle(u)}`)
    // a só de cor como "(verde)", o mesmo texto que a acha
    const rotEt = (id: Id) => {
      const e = n.etiquetas(depois.quadroId).find((x) => x.id === id)
      return umaLinha(e ? n.rotuloEtiqueta(e) : '(etiqueta)', 40)
    }
    for (const id of depois.etiquetaIds.filter((x) => !antes.etiquetaIds.includes(x))) mudou.push(`+${rotEt(id)}`)
    for (const id of antes.etiquetaIds.filter((x) => !depois.etiquetaIds.includes(x))) mudou.push(`−${rotEt(id)}`)
    return `#${depois.numero}: ${mudou.length ? mudou.join('; ') : 'nada mudou'} · rev ${depois.rev}`
  },
})

// ─────────────────────────────── 9. mover_demanda ───────────────────────────────

const moverDemanda = ferramenta({
  nome: 'mover_demanda', titulo: 'Mover demanda', descricao: 'Move uma demanda para outra coluna ou quadro.',
  esquema: z.object({
    numero,
    coluna: nome,
    quadro: nome.optional().describe('Padrão: o atual.'),
    posicao: z.enum(['topo', 'fim']).optional(),
    membros: z.enum(['manter', 'responsavel_destino']).optional(),
  }).strict(),
  anotacoes: escrita(true), escrita: true,
  executar({ db, ator, usuario }, a) {
    const n = new Nomes(db, usuario.id)
    const d = n.demanda(a.numero)
    const quadro = a.quadro ? n.quadro(a.quadro) : n.quadros().find((q) => q.id === d.quadroId)
    if (!quadro) throw new ErroMcp('O quadro desta demanda está arquivado.')
    const coluna = n.coluna(quadro, a.coluna)
    const posicao: PosicaoRelativa | undefined = a.posicao === 'topo' ? { depoisDeId: null } : undefined
    const e = entradaDaApi(ator, { colunaId: coluna.id, ...(posicao ? { posicao } : {}), membros: a.membros ?? 'manter' }, esquemaNucleo.mover)
    const deQuadro = d.quadroId
    const r = mover(db, { ...e, demandaId: d.id, ator, via: 'manual' })
    const depois = carregarDemanda(db, d.id)
    const partes = [`#${depois.numero} movida para ${n.lugar(depois)}`]
    if (r.etiquetasDeixadas.length) partes.push(`ficaram na ${umaLinha(n.quadroPorId(deQuadro)?.nome, 80) || 'origem'}: ${r.etiquetasDeixadas.map((x) => umaLinha(x, 40)).join(', ')}`)
    if (depois.concluidaEm && !d.concluidaEm) partes.push('concluída')
    if (r.proxima) partes.push(`próxima: #${r.proxima.numero}`)
    return [partes.join(' · '), ...avisosTexto(r.avisos, depois, n)].join('\n')
  },
})

// ─────────────────────────────── 10. comentar ───────────────────────────────

/** "@rafa" de pessoa ativa → `@[Rafa](mencao:<id>)`; o resto fica como texto. Devolve o texto e quem foi mencionado. */
function marcarMencoes(texto: string, n: Nomes): { md: string; mencionados: Id[] } {
  const mencionados: Id[] = []
  const md = texto.replace(/(^|[^\p{L}\p{N}@_\[])@([\p{L}\p{N}][\p{L}\p{N}_.-]{0,39})/gu, (inteiro, antes: string, alvo: string) => {
    const sobra = /[._-]+$/.exec(alvo)?.[0] ?? ''
    const limpo = sobra ? alvo.slice(0, -sobra.length) : alvo
    let id: Id | null = null
    try {
      id = n.pessoa(limpo).id
    } catch {
      return inteiro
    }
    if (chave(limpo) === 'eu' || chave(limpo) === 'mim') return inteiro
    const u = n.pessoaPorId(id)!
    if (!mencionados.includes(id)) mencionados.push(id)
    const rotulo = (u.apelido ?? u.nome).replace(/[\]\n\r]/g, '').slice(0, 120)
    return `${antes}@[${rotulo}](mencao:${id})${sobra}`
  })
  return { md, mencionados }
}

const comentar = ferramenta({
  nome: 'comentar', titulo: 'Comentar', descricao: 'Comenta numa demanda; @apelido menciona.',
  esquema: z.object({ numero, texto: z.string().min(1).max(5000).describe('Markdown.') }).strict(),
  anotacoes: escrita(false), escrita: true,
  executar({ db, ator, usuario }, a) {
    const n = new Nomes(db, usuario.id)
    const d = n.demanda(a.numero)
    const { md, mencionados } = marcarMencoes(a.texto, n)
    const e = entradaDaApi(ator, { corpoMd: md }, esquemaModal.criarComentario)
    const r = criarComentario(db, d.id, { corpoMd: e.corpoMd }, ator)
    const quem = r.comentario.mencoes.length ? r.comentario.mencoes : mencionados
    return [`Comentário em #${d.numero}${quem.length ? ` (mencionou ${quem.map((x) => n.handle(x)).join(' ')})` : ''}`,
      ...avisosTexto(r.avisos)].join('\n')
  },
})

// ─────────────────────────────── 11. checklist ───────────────────────────────

function textoChecklists(db: Db, demandaId: Id): string {
  return checklistsDe(db, demandaId).map((c, i) => {
    const feitos = c.itens.filter((x) => x.feitoEm).length
    const itens = c.itens.map((x, j) => `[${x.feitoEm ? 'x' : ' '}] ${i + 1}.${j + 1} ${umaLinha(x.texto, 120)}`)
    return [`${umaLinha(c.titulo, 80)} ${feitos}/${c.itens.length}`, ...itens].join('\n')
  }).join('\n') || 'Sem checklists.'
}

const checklist = ferramenta({
  nome: 'checklist', titulo: 'Checklist',
  descricao: 'Acrescenta itens e marca ou desmarca itens dos checklists de uma demanda.',
  esquema: z.object({
    numero,
    acrescentar: z.array(z.string().max(2000)).max(100).optional(),
    em: z.string().max(200).optional().describe('Título do checklist; padrão "Checklist", criado se faltar.'),
    marcar: z.array(z.string().max(2000)).max(100).optional().describe('"1.2" ou o texto do item.'),
    desmarcar: z.array(z.string().max(2000)).max(100).optional(),
  }).strict(),
  anotacoes: escrita(false), escrita: true,
  executar({ db, ator, usuario }, a) {
    const n = new Nomes(db, usuario.id)
    const d = n.demanda(a.numero)
    if (!a.acrescentar?.length && !a.marcar?.length && !a.desmarcar?.length) throw new ErroMcp('Mande acrescentar, marcar ou desmarcar.')
    if (a.acrescentar?.length) {
      const titulo = a.em?.trim() || 'Checklist'
      const alvo = checklistsDe(db, d.id).find((c) => normalizarAlias(c.titulo) === normalizarAlias(titulo))
      if (alvo) criarItens(db, alvo.id, entradaDaApi(ator, { textos: a.acrescentar }, esquemaModal.criarItens), ator)
      else criarChecklist(db, d.id, entradaDaApi(ator, { titulo, itens: a.acrescentar }, esquemaModal.criarChecklist), ator)
    }
    const achar = (ref: string): Id => {
      const lista = checklistsDe(db, d.id)
      const m = /^(\d{1,3})\.(\d{1,4})$/.exec(ref.trim())
      if (m) {
        const item = lista[Number(m[1]) - 1]?.itens[Number(m[2]) - 1]
        if (!item) throw new ErroMcp(`Não existe o item ${ref}. Itens:\n${textoChecklists(db, d.id)}`)
        return item.id
      }
      const k = normalizarAlias(ref)
      const todos = lista.flatMap((c, i) => c.itens.map((x, j) => ({ id: x.id, ref: `${i + 1}.${j + 1}`, texto: x.texto })))
      const iguais = todos.filter((x) => normalizarAlias(x.texto) === k)
      const achados = iguais.length ? iguais : todos.filter((x) => normalizarAlias(x.texto).includes(k))
      if (achados.length === 1) return achados[0]!.id
      if (achados.length > 1) throw new ErroMcp(`Mais de um item com esse texto: ${achados.slice(0, 8).map((x) => x.ref).join(', ')}. Use a referência ("1.2").`)
      throw new ErroMcp(`Nenhum item "${umaLinha(ref, 60)}". Itens:\n${textoChecklists(db, d.id)}`)
    }
    for (const ref of a.marcar ?? []) editarItem(db, achar(ref), validar(esquemaModal.editarItem, { feito: true }), ator)
    for (const ref of a.desmarcar ?? []) editarItem(db, achar(ref), validar(esquemaModal.editarItem, { feito: false }), ator)
    return `#${d.numero}\n${textoChecklists(db, d.id)}`
  },
})

// ─────────────────────────────── 12. concluir_demanda ───────────────────────────────

const concluirDemanda = ferramenta({
  nome: 'concluir_demanda', titulo: 'Concluir demanda', descricao: 'Marca a demanda como concluída, ou reabre.',
  esquema: z.object({ numero, concluida: z.boolean().optional().describe('false reabre.') }).strict(),
  anotacoes: escrita(true), escrita: true,
  executar({ db, ator, usuario }, a) {
    const n = new Nomes(db, usuario.id)
    const d = n.demanda(a.numero)
    const e = entradaDaApi(ator, { concluida: a.concluida ?? true }, esquemaNucleo.concluir)
    const r = concluir(db, { demandaId: d.id, ator, concluida: e.concluida, via: 'checkbox' })
    const depois = carregarDemanda(db, d.id)
    if (!e.concluida) return d.concluidaEm ? `#${d.numero} reaberta em ${n.lugar(depois)}` : `#${d.numero} já estava aberta`
    if (d.concluidaEm) return `#${d.numero} já estava concluída`
    const partes = [`#${d.numero} concluída`]
    if (r.proxima) partes.push(`próxima: #${r.proxima.numero} (${r.proxima.repetir}${r.proxima.prazo ? `, prazo ${dataHora(r.proxima.prazo, r.proxima.prazoHora)}` : ''})`)
    if (r.automacao) partes.push(`a automação levou para ${n.lugar(depois)}`)
    return partes.join(' · ')
  },
})

// ─────────────────────────────── 13. arquivar_demanda ───────────────────────────────

const arquivar = ferramenta({
  nome: 'arquivar_demanda', titulo: 'Arquivar demanda', descricao: 'Arquiva ou restaura uma demanda (nada é apagado).',
  esquema: z.object({ numero, arquivar: z.boolean().optional().describe('false restaura.') }).strict(),
  anotacoes: escrita(true), escrita: true,
  executar({ db, ator, usuario }, a) {
    const n = new Nomes(db, usuario.id)
    const d = n.demanda(a.numero)
    if (a.arquivar ?? true) {
      if (d.arquivadoEm) return `#${d.numero} já estava arquivada`
      arquivarDemanda(db, d.id, ator)
      return `#${d.numero} arquivada`
    }
    if (!d.arquivadoEm) return `#${d.numero} não está arquivada`
    const origem = origemDaProximaDesfeita(db, d.id)
    if (origem !== null) throw new ErroMcp(`Esta é a próxima de uma repetição desfeita. Ela volta sozinha quando a #${origem} for concluída.`)
    const r = restaurarDemanda(db, d.id, {}, ator)
    return `#${d.numero} restaurada em ${n.lugar(r)}`
  },
})

// ─────────────────────────────── 14. lancar_horas ───────────────────────────────

const lancarHoras = ferramenta({
  nome: 'lancar_horas', titulo: 'Lançar horas', descricao: 'Lança horas suas numa demanda.',
  esquema: z.object({
    numero,
    minutos: z.number().int().min(1).max(720),
    data: data.optional().describe('Padrão: hoje; nunca no futuro.'),
    nota: z.string().max(500).optional(),
  }).strict(),
  anotacoes: escrita(false), escrita: true,
  executar({ db, ator, usuario }, a) {
    const n = new Nomes(db, usuario.id)
    const d = n.demanda(a.numero)
    const hoje = hojeSP(agoraData())
    exigirData(a.data, 'data')
    if (a.data && a.data > hoje) throw new ErroMcp('Não dá para lançar horas no futuro.')
    const e = entradaDaApi(ator, { minutos: a.minutos, data: a.data ?? hoje, ...(a.nota ? { nota: a.nota } : {}) }, esquemaModal.criarApontamento)
    lancarTempo(db, d.id, e, ator)
    const total = Number(um<{ m: number }>(db, `SELECT coalesce(sum(minutos), 0) AS m FROM apontamento
      WHERE demanda_id = ? AND usuario_id = ? AND excluido_em IS NULL AND minutos IS NOT NULL`, d.id, usuario.id)!.m)
    return `Lançado ${duracao(a.minutos)} em #${d.numero} em ${e.data ?? hoje} · seu total nela: ${duracao(total)}`
  },
})

// ─────────────────────────────── 15. registrar_retorno ───────────────────────────────

const ROTULO_CANAL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'e-mail', reuniao: 'reunião', outro: 'outro canal' }

const retorno = ferramenta({
  nome: 'registrar_retorno', titulo: 'Registrar retorno',
  descricao: 'Registra o retorno do cliente sobre a última versão enviada: aprovado ou ajuste.',
  esquema: z.object({
    numero,
    decisao: z.enum(['aprovado', 'ajuste']),
    ajustes: z.array(z.string().max(2000)).max(100).optional().describe('Um por item; obrigatório no ajuste.'),
    canal: z.enum(['whatsapp', 'email', 'reuniao', 'outro']).optional(),
    contato: nome.optional().describe('Nome de um contato ativo; padrão: o padrão.'),
    prazo: data.optional().describe('Do ajuste.'),
    motivo: z.enum(MOTIVOS_RODADA).optional(),
  }).strict(),
  anotacoes: escrita(false, true), escrita: true,
  executar({ db, ator, usuario }, a) {
    if (!podeAtor(ator, 'ciclo.cliente')) throw new ErroMcp('Só o atendimento registra o retorno.')
    const n = new Nomes(db, usuario.id)
    const d = n.demanda(a.numero)
    if (a.decisao === 'ajuste' && !a.ajustes?.some((x) => x.trim())) throw new ErroMcp('No ajuste, mande os itens em ajustes (um por item).')
    exigirData(a.prazo, 'prazo')
    let contatoId: Id | undefined
    if (a.contato) {
      if (!d.clienteId) throw new ErroMcp('A demanda não tem cliente.')
      const ativos = todos<{ id: string; nome: string }>(db, 'SELECT id, nome FROM cliente_contato WHERE cliente_id = ? AND ativo = 1', d.clienteId)
      const achados = ativos.filter((c) => normalizarAlias(c.nome) === normalizarAlias(a.contato!)
        || normalizarAlias(c.nome).split(' ')[0] === normalizarAlias(a.contato!))
      if (achados.length !== 1) {
        throw new ErroMcp(`${achados.length ? 'Mais de um' : 'Nenhum'} contato "${umaLinha(a.contato, 60)}". Contatos: ${ativos.slice(0, 8).map((c) => umaLinha(c.nome, 60)).join(', ') || 'nenhum'}.`)
      }
      contatoId = achados[0]!.id
    }
    const e = entradaDaApi(ator, {
      decisao: a.decisao, canal: a.canal ?? 'whatsapp',
      ...(a.decisao === 'ajuste' ? { linhas: a.ajustes, ...(a.prazo ? { prazo: a.prazo } : {}), ...(a.motivo ? { motivo: a.motivo } : {}) } : {}),
      ...(contatoId ? { contatoId } : {}),
    }, esquemaCiclo.registrarRetorno)
    const r = registrarRetorno(db, { ...e, demandaId: d.id, ator, via: 'manual' })
    const versao = um<{ numero: number }>(db, 'SELECT numero FROM versao WHERE id = ?', r.aprovacao.versaoId)?.numero ?? '?'
    const quem = umaLinha(um<{ nome: string }>(db, 'SELECT nome FROM cliente_contato WHERE id = ?', r.aprovacao.contatoId)?.nome ?? 'o cliente', 60)
    const canal = ROTULO_CANAL[r.aprovacao.canal ?? 'outro']
    if (a.decisao === 'aprovado') {
      return `Aprovada a V${versao} de #${d.numero} (${quem}, ${canal})${r.automacao ? ` · movida para ${n.lugar(r.demanda)}` : ''}`
    }
    const rod = r.rodada
    return `Ajuste na V${versao} de #${d.numero} (${quem}, ${canal}): rodada ${rod?.numero ?? '?'} com ${plural(r.checklist?.itens.length ?? 0, 'item', 'itens')}`
      + `${rod?.prazo ? `, prazo ${dataHora(rod.prazo, rod.prazoHora)}` : ''} · R${rod?.numero ?? '?'} de ${r.demanda.rodadasInclusas} inclusas`
      + `${r.automacao ? ` · movida para ${n.lugar(r.demanda)}` : ''}`
  },
})

export const FERRAMENTAS_ESCRITA: Ferramenta[] = [
  criar, editar, moverDemanda, comentar, checklist, concluirDemanda, arquivar, lancarHoras, retorno,
] as unknown as Ferramenta[]

