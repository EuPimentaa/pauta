/**
 * Nomes em vez de ids nas ferramentas do MCP (F7, API.md §F.5): demanda pelo número; quadro pelo slug ou nome; coluna
 * pelo nome dentro do quadro (a de uma pessoa também pelo @apelido); cliente pela sigla ou um apelido; pessoa pelo
 * apelido (com ou sem @) ou `eu`; modelo pelo nome; etiqueta pelo nome no quadro. Sem acento e sem caixa. Nada achado
 * ou mais de um → ErroMcp com até 8 opções. Também monta a linha de demanda (a mesma em todas as listas).
 */
import type {
  ClienteResumo, Coluna, Demanda, Etiqueta, Id, ModeloDemanda, Quadro, UsuarioResumo,
} from '../../../shared/tipos/index.ts'
import { linhaDemanda, umaLinha } from '../../../shared/logica/mcp-texto.ts'
import { estadoPrazo } from '../../../shared/logica/prazo.ts'
import { paradoHa } from '../../../shared/logica/quadro.ts'
import { normalizarAlias, semInvisiveis } from '../../../shared/logica/texto.ts'
import { agoraData, um, type Db } from '../db.ts'
import { clientesResumo } from './clientes.ts'
import { feriados } from './config-app.ts'
import { carregarDemanda } from './demandas.ts'
import { ErroMcp } from './mcp-comum.ts'
import { usuariosResumo } from './pessoas.ts'
import { colunasDoQuadro, etiquetasDoQuadro, listarQuadros, modelosDemandaAtivos } from './quadros.ts'

/** Sem acento, sem caixa, sem espaço e sem invisível: "@Rafa Lima" → "rafalima"; "Fila\u200B" → "fila". */
export function chave(s: string): string {
  return normalizarAlias(semInvisiveis(s).replace(/^@/, '')).replace(/[\s._-]+/g, '')
}

/** Até 8 nomes, cada um numa linha só (um nome de coluna com quebra e "#999 …" não forja linha na resposta). */
function opcoes(lista: string[]): string {
  const unicas = [...new Set(lista.map((x) => umaLinha(x, 60)))]
  return unicas.length > 8 ? `${unicas.slice(0, 8).join(', ')}…` : unicas.join(', ')
}

/** "Nenhuma coluna", "Mais de uma pessoa", "Nenhum quadro". */
const FEMININOS = /^(coluna|pessoa|etiqueta)\b/

/**
 * Uma escolha entre candidatos: exatamente um. Senão ErroMcp com as opções. Mais de um com o mesmo rótulo (duas
 * "Arquivo" feitas pela tela): cada uma com a posição no quadro (`todos`), e o pedido de renomear uma na tela.
 */
function escolher<T>(tipo: string, texto: string, achados: T[], rotulo: (x: T) => string, todos: T[]): T {
  if (achados.length === 1) return achados[0]!
  const fem = FEMININOS.test(tipo)
  if (achados.length > 1) {
    const nomes = achados.map((x) => umaLinha(rotulo(x), 60))
    const repetidos = new Set(nomes).size < nomes.length
    const lista = repetidos ? achados.map((x, i) => `${nomes[i]} (${todos.indexOf(x) + 1}ª)`) : nomes
    throw new ErroMcp(`Mais de ${fem ? 'uma' : 'um'} ${tipo} com esse nome: ${opcoes(lista)}.`
      + `${repetidos ? ` Renomeie ${fem ? 'uma delas' : 'um deles'} na tela.` : ''}`)
  }
  const parecidos = todos.filter((x) => chave(rotulo(x)).includes(chave(texto)))
  const lista = (parecidos.length ? parecidos : todos).map(rotulo)
  throw new ErroMcp(`${fem ? 'Nenhuma' : 'Nenhum'} ${tipo} "${umaLinha(texto, 60)}".${lista.length ? ` Opções: ${opcoes(lista)}.` : ''} Use listar.`)
}

/**
 * Os nomes de uma chamada: carrega sob demanda (quadros, colunas, clientes, pessoas, modelos) e guarda na chamada.
 * `eu` = a pessoa que conectou.
 */
export class Nomes {
  readonly db: Db
  readonly euId: Id
  private _quadros: Quadro[] | null = null
  private _pessoas: UsuarioResumo[] | null = null
  private _handles: Map<Id, string> | null = null
  private _clientes: ClienteResumo[] | null = null
  private _modelos: ModeloDemanda[] | null = null
  private readonly _colunas = new Map<Id, Coluna[]>()
  private readonly _etiquetas = new Map<Id, Etiqueta[]>()
  private readonly _colunaPorId = new Map<Id, Coluna>()
  private _feriados: ReadonlySet<string> | null = null

  constructor(db: Db, euId: Id) {
    this.db = db
    this.euId = euId
  }

  // ─── listas ───

  /** Quadros ativos, na ordem do menu. */
  quadros(): Quadro[] {
    return (this._quadros ??= listarQuadros(this.db, false))
  }

  quadroPorId(id: Id): Quadro | null {
    const q = this.quadros().find((x) => x.id === id)
    if (q) return q
    const l = um<{ slug: string; nome: string }>(this.db, 'SELECT slug, nome FROM quadro WHERE id = ?', id)
    return l ? ({ id, slug: l.slug, nome: l.nome } as Quadro) : null
  }

  colunas(quadroId: Id): Coluna[] {
    let c = this._colunas.get(quadroId)
    if (!c) {
      c = colunasDoQuadro(this.db, quadroId)
      this._colunas.set(quadroId, c)
    }
    return c
  }

  colunaPorId(id: Id): Coluna | null {
    let c = this._colunaPorId.get(id)
    if (!c) {
      const l = um<{ quadro_id: string }>(this.db, 'SELECT quadro_id FROM coluna WHERE id = ?', id)
      if (!l) return null
      c = colunasDoQuadro(this.db, l.quadro_id, true).find((x) => x.id === id)
      if (!c) return null
      this._colunaPorId.set(id, c)
    }
    return c
  }

  etiquetas(quadroId: Id): Etiqueta[] {
    let e = this._etiquetas.get(quadroId)
    if (!e) {
      e = etiquetasDoQuadro(this.db, quadroId)
      this._etiquetas.set(quadroId, e)
    }
    return e
  }

  /** Todas as pessoas (inativas também, para os nomes do histórico). */
  pessoas(): UsuarioResumo[] {
    return (this._pessoas ??= usuariosResumo(this.db))
  }

  pessoaPorId(id: Id): UsuarioResumo | null {
    return this.pessoas().find((p) => p.id === id) ?? null
  }

  /**
   * "@rafa": o apelido (ou o primeiro nome) sem acento, sem caixa e sem espaço. Duas pessoas ativas com o mesmo:
   * as duas ficam com o nome inteiro ("@rafaellima").
   */
  handle(id: Id | null): string {
    if (!id) return '@?'
    if (!this._handles) {
      const base = (u: UsuarioResumo) => chave(u.apelido ?? u.nome.split(' ')[0]!)
      const contagem = new Map<string, number>()
      for (const u of this.pessoas()) if (u.ativo) contagem.set(base(u), (contagem.get(base(u)) ?? 0) + 1)
      this._handles = new Map(this.pessoas().map((u) => [u.id, (contagem.get(base(u)) ?? 0) > 1 ? chave(u.nome) : base(u)]))
    }
    return `@${this._handles.get(id) ?? '?'}`
  }

  /** "Rafa" (apelido ou primeiro nome), para frases. */
  nomeCurto(id: Id | null): string | null {
    const u = id ? this.pessoaPorId(id) : null
    return u ? (u.apelido ?? u.nome.split(' ')[0]!) : null
  }

  clientes(): ClienteResumo[] {
    return (this._clientes ??= clientesResumo(this.db))
  }

  clientePorId(id: Id | null): ClienteResumo | null {
    return id ? this.clientes().find((c) => c.id === id) ?? null : null
  }

  modelos(): ModeloDemanda[] {
    return (this._modelos ??= modelosDemandaAtivos(this.db))
  }

  feriados(): ReadonlySet<string> {
    return (this._feriados ??= feriados(this.db))
  }

  // ─── resolver nomes ───

  quadro(texto: string): Quadro {
    const k = chave(texto)
    const todos = this.quadros()
    const porSlug = todos.filter((q) => chave(q.slug) === k)
    if (porSlug.length === 1) return porSlug[0]!
    return escolher('quadro', texto, porSlug.length ? porSlug : todos.filter((q) => chave(q.nome) === k), (q) => q.slug, todos)
  }

  /** Primeiro o nome igual (sem caixa e sem acento: "---" ≠ "...", "Fila" ≠ "Fila\u200B"); depois pela chave. */
  coluna(quadro: Quadro, texto: string): Coluna {
    const k = chave(texto)
    const todas = this.colunas(quadro.id)
    const exato = todas.filter((c) => normalizarAlias(c.nome) === normalizarAlias(texto))
    if (exato.length === 1) return exato[0]!
    const porNome = exato.length || !k ? exato : todas.filter((c) => chave(c.nome) === k)
    const achadas = porNome.length || !k ? porNome
      : todas.filter((c) => c.responsavelId && (this.handle(c.responsavelId) === `@${k}` || chave(this.nomeCurto(c.responsavelId) ?? '') === k))
    return escolher(`coluna em ${quadro.slug}`, texto, achadas, (c) => c.nome, todas)
  }

  /** Pela sigla; senão o apelido ou o nome igual (sem caixa e sem acento: "Super Mercado" ≠ "Super-Mercado"); senão pela chave. */
  cliente(texto: string): ClienteResumo {
    const k = chave(texto)
    const todos = this.clientes().filter((c) => c.status !== 'ex')
    const porSigla = this.clientes().filter((c) => chave(c.sigla) === k)
    if (porSigla.length === 1) return porSigla[0]!
    const alvo = normalizarAlias(texto)
    const exato = todos.filter((c) => c.apelidos.some((a) => normalizarAlias(a) === alvo) || normalizarAlias(c.nome) === alvo)
    if (exato.length === 1) return exato[0]!
    const porApelido = todos.filter((c) => c.apelidos.some((a) => chave(a) === k))
    const achados = porApelido.length ? porApelido : todos.filter((c) => chave(c.nome) === k)
    return escolher('cliente', texto, achados, (c) => c.sigla, todos)
  }

  /** Pessoa ativa pelo @apelido, apelido, primeiro nome, nome ou `eu`. */
  pessoa(texto: string): UsuarioResumo {
    const k = chave(texto)
    const ativas = this.pessoas().filter((p) => p.ativo)
    if (k === 'eu' || k === 'mim') return this.pessoaPorId(this.euId)!
    const porHandle = ativas.filter((p) => this.handle(p.id) === `@${k}`)
    if (porHandle.length === 1) return porHandle[0]!
    const porApelido = ativas.filter((p) => p.apelido && chave(p.apelido) === k)
    const porNome = porApelido.length ? porApelido
      : ativas.filter((p) => chave(p.nome.split(' ')[0]!) === k || chave(p.nome) === k)
    return escolher('pessoa', texto, porNome, (p) => this.handle(p.id), ativas)
  }

  /** Modelo ativo pelo nome (globais e, com `quadroId`, os do quadro). */
  modelo(texto: string, quadroId: Id | null): ModeloDemanda {
    const k = chave(texto)
    const validos = this.modelos().filter((m) => m.quadroId === null || m.quadroId === quadroId)
    return escolher('modelo', texto, validos.filter((m) => chave(m.nome) === k), (m) => m.nome, validos)
  }

  /**
   * Etiqueta do quadro: primeiro o nome igual (sem caixa e sem acento: "Em revisão" ≠ "Em-revisão"), depois pela chave;
   * a só de cor pela cor ("verde"), ou só ela com "(verde)", "verde (sem nome)" ou "(sem nome) (verde)" (as formas das
   * respostas), mesmo havendo uma etiqueta chamada "verde".
   */
  etiqueta(quadroId: Id, texto: string): Etiqueta {
    const todas = this.etiquetas(quadroId)
    const rotulo = (e: Etiqueta) => this.rotuloEtiqueta(e)
    const exato = todas.filter((e) => e.nome && normalizarAlias(e.nome) === normalizarAlias(texto))
    if (exato.length === 1) return exato[0]!
    const semNome = /\(sem nome\)/i.test(texto)
    const resto = texto.replace(/\(sem nome\)/gi, '').trim()
    const entre = /^\((.+)\)$/.exec(resto)
    if (!exato.length && (semNome || entre)) {
      const cor = chave(entre ? entre[1]! : resto)
      return escolher('etiqueta', texto, todas.filter((e) => !e.nome && chave(e.cor) === cor), rotulo, todas)
    }
    const k = chave(texto)
    const porNome = exato.length || !k ? exato : todas.filter((e) => e.nome && chave(e.nome) === k)
    const achadas = porNome.length || !k ? porNome : todas.filter((e) => !e.nome && chave(e.cor) === k)
    return escolher('etiqueta', texto, achadas, rotulo, todas)
  }

  rotuloEtiqueta(e: Etiqueta): string {
    return e.nome || `(${e.cor})`
  }

  /** Demanda viva pelo número (aceita "#123"). */
  demanda(numero: number | string): Demanda {
    const n = Number(String(numero).replace(/^#/, ''))
    if (!Number.isInteger(n) || n < 1) throw new ErroMcp('Número de demanda inválido.')
    const l = um<{ id: string; excluido_em: string | null }>(this.db, 'SELECT id, excluido_em FROM demanda WHERE numero = ?', n)
    if (!l || l.excluido_em) throw new ErroMcp(`Não existe a demanda #${n}.`)
    return carregarDemanda(this.db, l.id)
  }

  // ─── a linha de demanda ───

  /** "atrasada", "hoje", "com o cliente há 3 d.u.", "concluída", "arquivada" ou null. */
  estado(d: Demanda): string | null {
    if (d.arquivadoEm) return 'arquivada'
    if (d.concluidaEm) return 'concluída'
    const coluna = this.colunaPorId(d.colunaId) ?? { papel: 'normal' as const }
    const agora = agoraData()
    const e = estadoPrazo(d, coluna, agora)
    if (e === 'atrasada') return 'atrasada'
    if (e === 'hoje') return 'hoje'
    if (e === 'pausado') {
      const { dias } = paradoHa(d, coluna as Coluna, agora, this.feriados())
      return `com o cliente há ${dias} d.u.`
    }
    return null
  }

  /** `#123 Título · CLA · criacao › Fazendo · prazo … · @rafa · alta · atrasada`. */
  linha(d: Demanda): string {
    return linhaDemanda({
      numero: d.numero, titulo: d.titulo, cliente: this.clientePorId(d.clienteId)?.sigla ?? null,
      quadro: this.quadroPorId(d.quadroId)?.slug ?? '?', coluna: this.colunaPorId(d.colunaId)?.nome ?? '?',
      prazo: d.prazo, prazoHora: d.prazoHora, membros: d.membroIds.map((m) => this.handle(m)), prioridade: d.prioridade,
      estado: this.estado(d),
    })
  }

  /** "Criação › Fila" (nome do quadro e da coluna, cada um numa linha só). */
  lugar(d: Pick<Demanda, 'quadroId' | 'colunaId'>): string {
    return `${umaLinha(this.quadroPorId(d.quadroId)?.nome, 80) || '?'} › ${umaLinha(this.colunaPorId(d.colunaId)?.nome, 60) || '?'}`
  }
}
