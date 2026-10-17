/**
 * Lista e Calendário do quadro (F6), regras puras (sem React nem DOM; os testes do servidor importam):
 * - ordenar a Lista pelo cabeçalho (nulos sempre no fim; empate = a ordem do quadro);
 * - agrupar por coluna, membro, cliente, prioridade ou prazo (com o total sem filtro de cada grupo: "1 de 2");
 * - as linhas da tabela virtualizada (grupos recolhíveis) e a janela que aparece na rolagem;
 * - onde o card cai ao soltar entre os grupos de coluna;
 * - os itens do Calendário (prazo, início, publicação) e a faixa "Sem prazo";
 * - ordem e agrupamento na URL (`?ordem=-prazo&agrupar=membro`);
 * - os chips dos filtros ativos no cabeçalho.
 */
import type {
  CampoAgenda, ClienteResumo, Coluna, DataLocal, Demanda, Etiqueta, FiltroPrazo, FiltrosQuadro, HoraLocal, Id, PapelColuna,
  PosicaoRelativa, Prioridade, UsuarioResumo,
} from '../../../../shared/tipos/index.ts'
import { HORA_PADRAO_PRAZO, ROTULO_PRIORIDADE } from '../../../../shared/tipos/index.ts'
import { hojeSP, segundaDaSemana, somarDias } from '../../../../shared/logica/datas.ts'
import { estadoPrazo } from '../../../../shared/logica/prazo.ts'

// ─────────────────────────────── contexto ───────────────────────────────

export interface ContextoLista {
  /** Ativas, em ordem. */
  colunas: readonly Coluna[]
  clientes: ReadonlyMap<Id, Pick<ClienteResumo, 'sigla' | 'nome' | 'cor'>>
  usuarios: ReadonlyMap<Id, Pick<UsuarioResumo, 'nome' | 'apelido' | 'cor' | 'ativo'>>
  /** Do quadro (a ordem `pos` vale para ordenar por etiqueta). */
  etiquetas: readonly Etiqueta[]
  agora: Date
}

const colator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })
const comparar = (a: string, b: string) => colator.compare(a, b)

/** Nome curto da pessoa (apelido; senão o primeiro nome). */
export function nomeCurto(u: Pick<UsuarioResumo, 'nome' | 'apelido'>): string {
  return u.apelido?.trim() || u.nome.trim().split(/\s+/)[0] || u.nome
}

function papelDe(ctx: ContextoLista, colunaId: Id): Pick<Coluna, 'papel'> {
  return ctx.colunas.find((c) => c.id === colunaId) ?? { papel: 'normal' as PapelColuna }
}

// ─────────────────────────────── ordenar ───────────────────────────────

export const CAMPOS_ORDEM = [
  'posicao', 'numero', 'titulo', 'cliente', 'coluna', 'membros', 'etiquetas', 'prioridade', 'inicio', 'prazo', 'concluida',
] as const
export type CampoOrdem = (typeof CAMPOS_ORDEM)[number]

export interface OrdemLista {
  campo: CampoOrdem
  /** 'asc' = a ordem natural do campo (prazo mais cedo, prioridade urgente primeiro, A→Z). */
  direcao: 'asc' | 'desc'
}

export const ORDEM_PADRAO: OrdemLista = { campo: 'posicao', direcao: 'asc' }

export const ROTULO_CAMPO_ORDEM: Record<CampoOrdem, string> = {
  posicao: 'Ordem do quadro', numero: 'Número', titulo: 'Título', cliente: 'Cliente', coluna: 'Coluna', membros: 'Membros',
  etiquetas: 'Etiquetas', prioridade: 'Prioridade', inicio: 'Início', prazo: 'Prazo', concluida: 'Concluída',
}

const PESO_PRIORIDADE: Record<Prioridade, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 }

/** A chave de cada campo; null = sem valor (fica no fim nas duas direções). */
function chave(d: Demanda, campo: CampoOrdem, ctx: ContextoLista, posColuna: ReadonlyMap<Id, number>, posEtiqueta: ReadonlyMap<Id, number>): string | number | null {
  switch (campo) {
    case 'posicao': return null
    case 'numero': return d.numero
    case 'titulo': return d.titulo
    case 'cliente': {
      const c = d.clienteId ? ctx.clientes.get(d.clienteId) : undefined
      return c ? c.sigla : null
    }
    case 'coluna': return posColuna.get(d.colunaId) ?? Number.MAX_SAFE_INTEGER
    case 'membros': {
      const nomes = d.membroIds.map((id) => ctx.usuarios.get(id)).filter((u) => !!u).map((u) => nomeCurto(u!)).sort(comparar)
      return nomes[0] ?? null
    }
    case 'etiquetas': {
      const pos = d.etiquetaIds.map((id) => posEtiqueta.get(id)).filter((p): p is number => p !== undefined)
      return pos.length ? Math.min(...pos) : null
    }
    case 'prioridade': return PESO_PRIORIDADE[d.prioridade]
    case 'inicio': return d.inicio ? `${d.inicio}T${d.inicioHora ?? '00:00'}` : null
    case 'prazo': return d.prazo ? `${d.prazo}T${d.prazoHora ?? HORA_PADRAO_PRAZO}` : null
    case 'concluida': return d.concluidaEm
  }
}

/** A ordem do quadro: coluna (pos), depois a posição no quadro, depois o número. */
function ordemDoQuadro(posColuna: ReadonlyMap<Id, number>) {
  return (a: Demanda, b: Demanda) =>
    (posColuna.get(a.colunaId) ?? Number.MAX_SAFE_INTEGER) - (posColuna.get(b.colunaId) ?? Number.MAX_SAFE_INTEGER)
    || a.posicao - b.posicao || a.numero - b.numero
}

/** Ordena uma cópia. Nulos no fim nas duas direções; empate = a ordem do quadro. */
export function ordenarDemandas(lista: readonly Demanda[], ordem: OrdemLista, ctx: ContextoLista): Demanda[] {
  const posColuna = new Map(ctx.colunas.map((c, i) => [c.id, i]))
  const posEtiqueta = new Map(ctx.etiquetas.map((e, i) => [e.id, i]))
  const base = ordemDoQuadro(posColuna)
  if (ordem.campo === 'posicao') {
    const r = [...lista].sort(base)
    return ordem.direcao === 'desc' ? r.reverse() : r
  }
  const sinal = ordem.direcao === 'desc' ? -1 : 1
  const chaves = new Map(lista.map((d) => [d.id, chave(d, ordem.campo, ctx, posColuna, posEtiqueta)]))
  return [...lista].sort((a, b) => {
    const ka = chaves.get(a.id) ?? null
    const kb = chaves.get(b.id) ?? null
    if (ka === null || kb === null) {
      if (ka !== kb) return ka === null ? 1 : -1
      return base(a, b)
    }
    const r = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : comparar(String(ka), String(kb))
    return r * sinal || base(a, b)
  })
}

// ─────────────────────────────── agrupar ───────────────────────────────

export const AGRUPAMENTOS = ['coluna', 'membro', 'cliente', 'prioridade', 'prazo', 'nenhum'] as const
export type Agrupamento = (typeof AGRUPAMENTOS)[number]

export const ROTULO_AGRUPAMENTO: Record<Agrupamento, string> = {
  coluna: 'Coluna', membro: 'Membro', cliente: 'Cliente', prioridade: 'Prioridade', prazo: 'Prazo', nenhum: 'Sem agrupar',
}

export const FAIXAS_PRAZO = ['atrasadas', 'hoje', 'semana', 'depois', 'sem_prazo', 'com_cliente', 'concluidas'] as const
export type FaixaPrazo = (typeof FAIXAS_PRAZO)[number]
export const ROTULO_FAIXA_PRAZO: Record<FaixaPrazo, string> = {
  atrasadas: 'Atrasadas', hoje: 'Hoje', semana: 'Esta semana', depois: 'Depois', sem_prazo: 'Sem prazo',
  com_cliente: 'Com o cliente', concluidas: 'Concluídas',
}

/**
 * A faixa de prazo de uma demanda (estadoPrazo, API §5.2): concluída; com o cliente (nunca atrasada); atrasada; hoje;
 * de amanhã até domingo; depois; sem prazo.
 */
export function faixaDePrazo(d: Demanda, coluna: Pick<Coluna, 'papel'>, agora: Date): FaixaPrazo {
  const estado = estadoPrazo(d, coluna, agora)
  if (estado === 'concluida') return 'concluidas'
  if (estado === 'pausado') return 'com_cliente'
  if (estado === 'sem_prazo') return 'sem_prazo'
  if (estado === 'atrasada') return 'atrasadas'
  if (estado === 'hoje') return 'hoje'
  const hoje = hojeSP(agora)
  return d.prazo! <= somarDias(segundaDaSemana(hoje), 6) ? 'semana' : 'depois'
}

export interface GrupoLista {
  /** 'coluna:<id>', 'membro:<id>' | 'membro:nenhum', 'cliente:<id>' | 'cliente:nenhum', 'prioridade:<p>', 'prazo:<faixa>', 'todas'. */
  id: string
  rotulo: string
  /** Cor do ponto (coluna, cliente, pessoa); null = sem ponto. */
  cor: string | null
  /** Só nos grupos de coluna (soltar = mover para ela). */
  colunaId: Id | null
  /** Visíveis (com os filtros), já na ordem pedida. */
  demandas: Demanda[]
  /** Do grupo sem os filtros (o "1 de 2"). */
  total: number
  /** Prioridade dos grupos de prioridade (o ícone da bandeira). */
  prioridade?: Prioridade
}

/** Em que grupos uma demanda entra (por membro: um por pessoa; sem membros: o grupo "nenhum"). */
function chavesDoGrupo(d: Demanda, agrupar: Agrupamento, ctx: ContextoLista): string[] {
  switch (agrupar) {
    case 'coluna': return [`coluna:${d.colunaId}`]
    case 'membro': return d.membroIds.length ? d.membroIds.map((id) => `membro:${id}`) : ['membro:nenhum']
    case 'cliente': return [`cliente:${d.clienteId ?? 'nenhum'}`]
    case 'prioridade': return [`prioridade:${d.prioridade}`]
    case 'prazo': return [`prazo:${faixaDePrazo(d, papelDe(ctx, d.colunaId), ctx.agora)}`]
    case 'nenhum': return ['todas']
  }
}

/**
 * Os grupos na ordem de leitura. Coluna: todas as colunas ativas (inclusive vazias, que recebem o card arrastado).
 * Membro: "Sem membros" primeiro, depois as pessoas pelo nome. Cliente: pela sigla, "Sem cliente" no fim. Prioridade:
 * urgente → baixa. Prazo: atrasadas, hoje, esta semana, depois, sem prazo, com o cliente, concluídas. Fora de coluna,
 * grupos sem nenhuma visível não aparecem. `visiveis` já vem ordenada (ordenarDemandas); `todas` = sem filtro.
 */
export function agruparDemandas(visiveis: readonly Demanda[], todas: readonly Demanda[], agrupar: Agrupamento, ctx: ContextoLista): GrupoLista[] {
  const porChave = new Map<string, Demanda[]>()
  for (const d of visiveis) for (const k of chavesDoGrupo(d, agrupar, ctx)) porChave.set(k, [...(porChave.get(k) ?? []), d])
  const totais = new Map<string, number>()
  for (const d of todas) for (const k of chavesDoGrupo(d, agrupar, ctx)) totais.set(k, (totais.get(k) ?? 0) + 1)
  const grupo = (id: string, rotulo: string, cor: string | null, extra: Partial<GrupoLista> = {}): GrupoLista => ({
    id, rotulo, cor, colunaId: null, demandas: porChave.get(id) ?? [], total: totais.get(id) ?? 0, ...extra,
  })
  const comAlguma = (g: GrupoLista) => g.demandas.length > 0

  switch (agrupar) {
    case 'coluna':
      return ctx.colunas.map((c) => grupo(`coluna:${c.id}`, c.nome, c.cor ?? 'nenhuma', { colunaId: c.id }))
    case 'membro': {
      const ids = [...new Set(visiveis.flatMap((d) => d.membroIds))]
      const pessoas = ids.map((id) => ({ id, u: ctx.usuarios.get(id) }))
        .sort((a, b) => comparar(a.u ? nomeCurto(a.u) : '~', b.u ? nomeCurto(b.u) : '~'))
      return [
        grupo('membro:nenhum', 'Sem membros', null),
        ...pessoas.map(({ id, u }) => grupo(`membro:${id}`, u ? (u.ativo ? nomeCurto(u) : `${nomeCurto(u)} (desativada)`) : 'Pessoa removida', u?.cor ?? null)),
      ].filter(comAlguma)
    }
    case 'cliente': {
      const ids = [...new Set(visiveis.map((d) => d.clienteId).filter((id): id is Id => !!id))]
      const clientes = ids.map((id) => ({ id, c: ctx.clientes.get(id) }))
        .sort((a, b) => comparar(a.c?.sigla ?? '~', b.c?.sigla ?? '~'))
      return [
        ...clientes.map(({ id, c }) => grupo(`cliente:${id}`, c ? `${c.sigla} · ${c.nome}` : 'Cliente removido', c?.cor ?? null)),
        grupo('cliente:nenhum', 'Sem cliente', null),
      ].filter(comAlguma)
    }
    case 'prioridade':
      return (['urgente', 'alta', 'media', 'baixa'] as const)
        .map((p) => grupo(`prioridade:${p}`, ROTULO_PRIORIDADE[p], null, { prioridade: p })).filter(comAlguma)
    case 'prazo':
      return FAIXAS_PRAZO.map((f) => grupo(`prazo:${f}`, ROTULO_FAIXA_PRAZO[f], null)).filter(comAlguma)
    case 'nenhum':
      return [grupo('todas', 'Todas', null)]
  }
}

// ─────────────────────────────── linhas da tabela (virtualizada) ───────────────────────────────

export type LinhaLista =
  | { tipo: 'grupo'; chave: string; grupo: GrupoLista; recolhido: boolean }
  | { tipo: 'demanda'; chave: string; grupo: GrupoLista; demanda: Demanda; indice: number }
  /** Grupo de coluna aberto e sem nenhuma visível: a vaga onde se solta. */
  | { tipo: 'vazio'; chave: string; grupo: GrupoLista }

/** Achata os grupos em linhas. Sem agrupar, não há linha de grupo. */
export function linhasDaLista(grupos: readonly GrupoLista[], recolhidos: ReadonlySet<string>, agrupar: Agrupamento): LinhaLista[] {
  const linhas: LinhaLista[] = []
  for (const g of grupos) {
    const recolhido = agrupar !== 'nenhum' && recolhidos.has(g.id)
    if (agrupar !== 'nenhum') linhas.push({ tipo: 'grupo', chave: `g:${g.id}`, grupo: g, recolhido })
    if (recolhido) continue
    if (g.demandas.length === 0 && g.colunaId) linhas.push({ tipo: 'vazio', chave: `v:${g.id}`, grupo: g })
    g.demandas.forEach((d, indice) => linhas.push({ tipo: 'demanda', chave: `${g.id}|${d.id}`, grupo: g, demanda: d, indice }))
  }
  return linhas
}

/** Topo de cada linha e a altura total (alturas fixas por tipo). */
export function deslocamentos(linhas: readonly LinhaLista[], alturas: Record<LinhaLista['tipo'], number>): { topos: number[]; total: number } {
  const topos: number[] = []
  let y = 0
  for (const l of linhas) { topos.push(y); y += alturas[l.tipo] }
  return { topos, total: y }
}

/** As linhas que aparecem entre `topo` e `topo + altura`, com `folga` linhas a mais de cada lado: [inicio, fim). */
export function janelaVisivel(topos: readonly number[], total: number, topo: number, altura: number, folga = 8): [number, number] {
  const n = topos.length
  if (n === 0) return [0, 0]
  const primeira = (y: number) => {
    let lo = 0, hi = n - 1
    while (lo < hi) {
      const meio = (lo + hi + 1) >> 1
      if (topos[meio] <= y) lo = meio
      else hi = meio - 1
    }
    return lo
  }
  const ini = primeira(Math.max(0, Math.min(topo, total)))
  const fim = primeira(Math.max(0, Math.min(topo + altura, total))) + 1
  return [Math.max(0, ini - folga), Math.min(n, fim + folga)]
}

// ─────────────────────────────── soltar entre os grupos de coluna ───────────────────────────────

export interface AlvoSoltar {
  colunaId: Id
  /** A linha de referência (null = o cabeçalho do grupo ou a vaga vazia: topo da coluna). */
  referenciaId: Id | null
  lado: 'antes' | 'depois'
}

/**
 * O destino do card solto na Lista. Na ordem do quadro, cai exatamente onde a linha indicou (antes ou depois dela);
 * com outra ordem (prazo, título...), a posição na coluna não aparece na tela, então vai para o topo da coluna.
 * Devolve null quando nada muda (mesma coluna e mesmo lugar, ou soltou sobre si mesmo).
 * `colunaAtual` = as demandas da coluna de destino em ordem de posição (todas, inclusive as escondidas por filtro).
 */
export function destinoAoSoltar(d: Demanda, alvo: AlvoSoltar, porPosicao: boolean, colunaAtual: readonly Pick<Demanda, 'id'>[]):
  { colunaId: Id; posicao: PosicaoRelativa } | null {
  const mesma = d.colunaId === alvo.colunaId
  if (!porPosicao || alvo.referenciaId === null) {
    if (mesma && (!porPosicao || colunaAtual[0]?.id === d.id)) return null
    return { colunaId: alvo.colunaId, posicao: { depoisDeId: null } }
  }
  if (alvo.referenciaId === d.id) return null
  const sem = colunaAtual.filter((x) => x.id !== d.id)
  const i = sem.findIndex((x) => x.id === alvo.referenciaId)
  if (i < 0) return { colunaId: alvo.colunaId, posicao: { depoisDeId: null } }
  const posicao: PosicaoRelativa = alvo.lado === 'depois' ? { depoisDeId: alvo.referenciaId } : { antesDeId: alvo.referenciaId }
  if (mesma) {
    // já está ali: logo antes da referência (soltando "antes") ou logo depois (soltando "depois")?
    const atual = colunaAtual.findIndex((x) => x.id === d.id)
    const ref = colunaAtual.findIndex((x) => x.id === alvo.referenciaId)
    if ((alvo.lado === 'antes' && atual === ref - 1) || (alvo.lado === 'depois' && atual === ref + 1)) return null
  }
  return { colunaId: alvo.colunaId, posicao }
}

// ─────────────────────────────── calendário ───────────────────────────────

export interface ItemCalendarioLista {
  demanda: Demanda
  campo: CampoAgenda
  data: DataLocal
  hora: HoraLocal | null
}

/** Um item por campo pedido que a demanda tem (prazo, início, publicação). */
export function itensDoCalendario(demandas: readonly Demanda[], campos: readonly CampoAgenda[]): ItemCalendarioLista[] {
  const itens: ItemCalendarioLista[] = []
  for (const d of demandas) {
    if (campos.includes('prazo') && d.prazo) itens.push({ demanda: d, campo: 'prazo', data: d.prazo, hora: d.prazoHora })
    if (campos.includes('inicio') && d.inicio) itens.push({ demanda: d, campo: 'inicio', data: d.inicio, hora: d.inicioHora })
    if (campos.includes('publicacao') && d.publicacaoData) itens.push({ demanda: d, campo: 'publicacao', data: d.publicacaoData, hora: d.publicacaoHora })
  }
  return itens
}

/** A faixa "Sem prazo": as abertas sem prazo, na ordem do quadro (arrastar para um dia dá o prazo). */
export function semPrazo(demandas: readonly Demanda[], colunas: readonly Coluna[]): Demanda[] {
  const pos = new Map(colunas.map((c, i) => [c.id, i]))
  return demandas.filter((d) => !d.prazo && !d.concluidaEm).sort(ordemDoQuadro(pos))
}

/** Quantos itens caem no período [de, ate] (o aviso "nada neste mês" da faixa). */
export function itensNoPeriodo(itens: readonly ItemCalendarioLista[], de: DataLocal, ate: DataLocal): number {
  return itens.filter((i) => i.data >= de && i.data <= ate).length
}

// ─────────────────────────────── URL ───────────────────────────────

/** `?ordem=prazo` (asc) ou `?ordem=-prazo` (desc); inválido = null. */
export function lerOrdem(s: string | null | undefined): OrdemLista | null {
  if (!s) return null
  const desc = s.startsWith('-')
  const campo = desc ? s.slice(1) : s
  return (CAMPOS_ORDEM as readonly string[]).includes(campo) ? { campo: campo as CampoOrdem, direcao: desc ? 'desc' : 'asc' } : null
}

export function escreverOrdem(o: OrdemLista): string {
  return `${o.direcao === 'desc' ? '-' : ''}${o.campo}`
}

export function lerAgrupamento(s: string | null | undefined): Agrupamento | null {
  return s && (AGRUPAMENTOS as readonly string[]).includes(s) ? (s as Agrupamento) : null
}

/** Clicar no cabeçalho: o mesmo campo inverte; outro campo começa na ordem natural; a 3ª vez volta à do quadro. */
export function proximaOrdem(atual: OrdemLista, campo: CampoOrdem): OrdemLista {
  if (atual.campo !== campo) return { campo, direcao: 'asc' }
  if (atual.direcao === 'asc') return { campo, direcao: 'desc' }
  return ORDEM_PADRAO
}

// ─────────────────────────────── chips dos filtros ───────────────────────────────

export const ROTULO_FILTRO_PRAZO: Record<FiltroPrazo, string> = {
  atrasado: 'Atrasadas', hoje: 'Para hoje', semana: 'Esta semana', sem_prazo: 'Sem prazo',
}

/** Campos que o painel de filtros controla (texto e "Só as minhas" ficam no cabeçalho do núcleo e no campo de busca). */
export type CampoChip = 'clientes' | 'membros' | 'etiquetas' | 'prazo' | 'prioridades' | 'comCliente' | 'concluidas' | 'texto' | 'soMinhas'

export interface ChipFiltro {
  campo: CampoChip
  /** "Cliente: HE", "Membros: Bia, Léo", "Prazo: atrasadas". */
  rotulo: string
  /** O que o leitor de tela diz no × ("Tirar o filtro de cliente"). */
  tirar: string
}

export interface ContextoChips {
  clientes: ReadonlyMap<Id, Pick<ClienteResumo, 'sigla'>>
  usuarios: ReadonlyMap<Id, Pick<UsuarioResumo, 'nome' | 'apelido'>>
  etiquetas: ReadonlyMap<Id, Pick<Etiqueta, 'nome' | 'cor'>>
}

/** "HE", "HE e CLA", "HE, CLA e mais 2". */
export function juntarNomes(nomes: readonly string[], max = 2): string {
  if (nomes.length <= max) return nomes.length === 2 ? `${nomes[0]} e ${nomes[1]}` : nomes.join('')
  return `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`
}

/**
 * Os chips dos filtros ativos, na ordem do painel. `incluir` escolhe quais (no desktop o texto já aparece no campo e
 * "Só as minhas" no botão do núcleo; no celular o texto vira chip). Id que não existe mais vira "1 removido".
 */
export function chipsDosFiltros(f: FiltrosQuadro, ctx: ContextoChips, incluir: ReadonlySet<CampoChip>): ChipFiltro[] {
  const chips: ChipFiltro[] = []
  const lista = (ids: readonly string[], nenhum: string, rotuloNenhum: string, nome: (id: string) => string | undefined) => {
    const nomes: string[] = []
    let removidos = 0
    for (const id of ids) {
      if (id === nenhum) nomes.unshift(rotuloNenhum)
      else {
        const n = nome(id)
        if (n === undefined) removidos++
        else nomes.push(n)
      }
    }
    if (removidos) nomes.push(removidos === 1 ? '1 removido' : `${removidos} removidos`)
    return juntarNomes(nomes)
  }
  if (incluir.has('texto') && f.texto?.trim()) chips.push({ campo: 'texto', rotulo: `“${f.texto.trim()}”`, tirar: 'Tirar a busca por texto' })
  if (incluir.has('soMinhas') && f.soMinhas) chips.push({ campo: 'soMinhas', rotulo: 'Só as minhas', tirar: 'Tirar o filtro Só as minhas' })
  if (incluir.has('clientes') && f.clientes?.length) {
    chips.push({
      campo: 'clientes', tirar: 'Tirar o filtro de cliente',
      rotulo: `${f.clientes.length === 1 ? 'Cliente' : 'Clientes'}: ${lista(f.clientes, '', '', (id) => ctx.clientes.get(id)?.sigla)}`,
    })
  }
  if (incluir.has('membros') && f.membros?.length) {
    const so = f.membros.length === 1 && f.membros[0] === 'nenhum'
    chips.push({
      campo: 'membros', tirar: 'Tirar o filtro de membro',
      rotulo: so ? 'Sem membros' : `${f.membros.length === 1 ? 'Membro' : 'Membros'}: ${lista(f.membros, 'nenhum', 'sem membros', (id) => {
        const u = ctx.usuarios.get(id)
        return u ? nomeCurto(u) : undefined
      })}`,
    })
  }
  if (incluir.has('etiquetas') && f.etiquetas?.length) {
    const so = f.etiquetas.length === 1 && f.etiquetas[0] === 'nenhuma'
    chips.push({
      campo: 'etiquetas', tirar: 'Tirar o filtro de etiqueta',
      rotulo: so ? 'Sem etiquetas' : `${f.etiquetas.length === 1 ? 'Etiqueta' : 'Etiquetas'}: ${lista(f.etiquetas, 'nenhuma', 'sem etiquetas', (id) => {
        const e = ctx.etiquetas.get(id)
        return e ? e.nome.trim() || 'sem nome' : undefined
      })}`,
    })
  }
  if (incluir.has('prazo') && f.prazo) chips.push({ campo: 'prazo', rotulo: `Prazo: ${ROTULO_FILTRO_PRAZO[f.prazo].toLowerCase()}`, tirar: 'Tirar o filtro de prazo' })
  if (incluir.has('prioridades') && f.prioridades?.length) {
    const nomes = (['urgente', 'alta', 'media', 'baixa'] as const).filter((p) => f.prioridades!.includes(p)).map((p) => ROTULO_PRIORIDADE[p].toLowerCase())
    chips.push({ campo: 'prioridades', rotulo: `Prioridade: ${juntarNomes(nomes, 3)}`, tirar: 'Tirar o filtro de prioridade' })
  }
  if (incluir.has('comCliente') && f.comCliente) chips.push({ campo: 'comCliente', rotulo: 'Com o cliente', tirar: 'Tirar o filtro Com o cliente' })
  if (incluir.has('concluidas') && f.concluidas && f.concluidas !== 'mostrar') {
    chips.push({ campo: 'concluidas', rotulo: f.concluidas === 'so' ? 'Só as concluídas' : 'Sem as concluídas', tirar: 'Tirar o filtro de concluídas' })
  }
  return chips
}

/** O filtro sem um campo (o × do chip). */
export function semCampo(f: FiltrosQuadro, campo: CampoChip): FiltrosQuadro {
  const novo = { ...f }
  delete novo[campo]
  return novo
}

/** Quantos campos do painel estão ligados (o número no botão "Filtros"; texto e "Só as minhas" ficam de fora). */
export function contarNoPainel(f: FiltrosQuadro): number {
  let n = 0
  if (f.clientes?.length) n++
  if (f.membros?.length) n++
  if (f.etiquetas?.length) n++
  if (f.prazo) n++
  if (f.prioridades?.length) n++
  if (f.comCliente) n++
  if (f.concluidas && f.concluidas !== 'mostrar') n++
  return n
}

/** Liga ou desliga um valor numa lista do filtro (lista vazia sai do filtro). */
export function alternarNaLista<T extends string>(lista: readonly T[] | undefined, valor: T): T[] | undefined {
  const atual = lista ?? []
  const nova = atual.includes(valor) ? atual.filter((x) => x !== valor) : [...atual, valor]
  return nova.length ? nova : undefined
}
