/**
 * Demandas da demonstração (PLANO §1.1.3): Atendimento 20, Criação `demandasCriacao` (SEED_DEMANDAS, padrão 300),
 * Social 40, Web, Tráfego e Produção 15 cada. Toda coluna fica com pelo menos 1 card; entre eles: atrasadas, para
 * hoje, com o cliente por link e por fora (uma parada há 3 dias úteis), aprovadas (a automação leva ao Social), em
 * rodada 3 (extra), repetição semanal, concluídas há mais de 7 dias (só no Arquivo), horas lançadas na semana e o
 * cronômetro do admin ligado. Passos do ciclo por SQL (scripts/ciclo-sql.ts); mover, concluir e automações pelos
 * serviços do núcleo. O que aconteceu "antes" roda com o relógio do app voltado (dias úteis atrás, 10h).
 */
import type { Cliente, Coluna, CriarDemandaEntrada, DataLocal, Demanda, HoraLocal, Id, Prioridade } from '../../../shared/tipos/index.ts'
import { diaUtilAnterior, diaUtilOuProximo, hojeSP, instanteSP, segundaDaSemana, somarDias, somarDiasUteis } from '../../../shared/logica/datas.ts'
import { atorDe, type Ator } from '../../src/auth.ts'
import { agora, agoraData, fixarRelogio, novoId, relogioFixado, rodar, todos, type Db } from '../../src/db.ts'
import { executarAutomacao, quadroDoEnvio } from '../../src/servicos/automacoes.ts'
import { concluir } from '../../src/servicos/concluir.ts'
import { feriados as lerFeriados } from '../../src/servicos/config-app.ts'
import { carregarDemanda, criarDemanda } from '../../src/servicos/demandas.ts'
import { lancarApontamento } from '../../src/servicos/horas.ts'
import { mover } from '../../src/servicos/mover.ts'
import { aprovarPorSql, entregarPorSql, enviarPorSql, pedirAjustePorSql } from '../ciclo-sql.ts'
import type { ContextoDemo, PessoaDemo, QuadroDemo } from '../seed-demo.ts'

const PECAS = ['Post', 'Carrossel', 'Stories', 'Banner', 'Folder', 'Cartaz', 'Convite', 'Apresentação', 'Anúncio', 'Capa de destaque',
  'E-mail marketing', 'Cardápio', 'Panfleto', 'Assinatura de e-mail'] as const
const TEMAS = ['Dia das Crianças', 'Outubro Rosa', 'Black Friday', 'Natal', 'institucional', 'vacinação', 'inauguração',
  'aniversário da marca', 'promoção de novembro', 'vagas abertas', 'evento de fim de ano', 'nova unidade', 'volta às aulas',
  'Novembro Azul', 'depoimentos', 'bastidores'] as const
const TITULOS: Record<Exclude<QuadroDemo, 'criacao'>, readonly string[]> = {
  atendimento: ['Reunião de pauta', 'Orçamento de campanha', 'Briefing do mês', 'Aprovar cronograma', 'Contrato de renovação',
    'Apresentar planejamento', 'Relatório mensal', 'Alinhar calendário de posts'],
  social: ['Legendas da semana', 'Agendar posts', 'Responder comentários', 'Relatório de engajamento', 'Pauta de stories',
    'Calendário editorial', 'Reels de bastidores', 'Enquete nos stories', 'Collab com influenciadora'],
  web: ['Ajuste no site', 'Landing page da campanha', 'Formulário de contato', 'SEO da página inicial', 'Atualizar plugins',
    'Página de vagas', 'Pixel de conversão', 'Velocidade do site'],
  trafego: ['Campanha de conversão', 'Relatório de anúncios', 'Públicos semelhantes', 'Pesquisa no Google', 'Teste A/B de criativo',
    'Remarketing', 'Orçamento de mídia'],
  producao: ['Vídeo institucional', 'Fotos da equipe', 'Edição de reels', 'Captação no evento', 'Motion do logo', 'Vinheta de abertura',
    'Ensaio de produtos'],
}
const PRIORIDADES_SORTEIO: Prioridade[] = ['media', 'media', 'media', 'baixa', 'alta']

/** PRNG determinístico (mulberry32): o mesmo seed gera o mesmo quadro. */
function sorteador(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

type Extra = Partial<CriarDemandaEntrada> & { cliente?: Cliente }

class Demo {
  private readonly ctx: ContextoDemo
  private readonly db: Db
  private readonly sorte = sorteador(20261014)
  private readonly feriados: Set<string>
  private readonly hoje: DataLocal
  private proximoCliente = 0
  private readonly clientes: Cliente[]

  constructor(ctx: ContextoDemo) {
    this.ctx = ctx
    this.db = ctx.db
    this.feriados = lerFeriados(this.db)
    this.hoje = hojeSP(agoraData())
    this.clientes = Object.values(ctx.clientes)
  }

  // ───────── utilidades ─────────

  escolher<T>(lista: readonly T[]): T {
    return lista[Math.floor(this.sorte() * lista.length)]!
  }

  ator(p: PessoaDemo): Ator {
    return atorDe(this.ctx.pessoas[p])
  }

  atorPorId(id: Id): Ator {
    const p = Object.values(this.ctx.pessoas).find((x) => x.id === id)
    if (!p) throw new Error(`pessoa ${id} não é da demonstração`)
    return atorDe(p)
  }

  /** Ator da pessoa dona da coluna. */
  atorDaColuna(c: Coluna): Ator {
    return this.atorPorId(c.responsavelId!)
  }

  /** Ator do AM do cliente (quem cria e envia as demandas dele). */
  atorDoAm(c: Cliente): Ator {
    return c.atendimentoId ? this.atorPorId(c.atendimentoId) : this.ator('am')
  }

  coluna(q: QuadroDemo, nome: string): Id {
    const c = this.ctx.quadros[q].colunas.find((x) => x.nome === nome)
    if (!c) throw new Error(`coluna ${nome} não existe em ${q}`)
    return c.id
  }

  /** Colunas de pessoa do quadro, na ordem. */
  colunasDePessoa(q: QuadroDemo): Coluna[] {
    return this.ctx.quadros[q].colunas.filter((c) => c.responsavelId)
  }

  etiqueta(q: QuadroDemo, nome: string): Id {
    const e = this.ctx.quadros[q].etiquetas.find((x) => x.nome === nome)
    if (!e) throw new Error(`etiqueta ${nome} não existe em ${q}`)
    return e.id
  }

  /** Dia útil a `n` dias úteis de hoje (negativo = antes; 0 = hoje ou o próximo útil). */
  util(n: number): DataLocal {
    if (n === 0) return diaUtilOuProximo(this.hoje, this.feriados)
    if (n > 0) return somarDiasUteis(this.hoje, n, this.feriados)
    let d = this.hoje
    for (let i = 0; i < -n; i++) d = diaUtilAnterior(d, this.feriados)
    return d
  }

  /** Roda `fn` com o relógio do app em `dias` dias úteis atrás, às 10h de São Paulo; depois volta como estava. */
  antes<T>(dias: number, fn: () => T): T {
    const como = relogioFixado()
    fixarRelogio(instanteSP(this.util(-dias), '10:00').toISOString())
    try {
      return fn()
    } finally {
      fixarRelogio(como)
    }
  }

  titulo(q: QuadroDemo): string {
    if (q === 'criacao') return `${this.escolher(PECAS)} ${this.escolher(TEMAS)}`
    return this.escolher(TITULOS[q])
  }

  /** Prazo sorteado: 75% com prazo nos próximos 10 dias úteis (metade com hora), o resto sem. */
  prazoSorteado(): { prazo: DataLocal | null; prazoHora: HoraLocal | null } {
    if (this.sorte() > 0.75) return { prazo: null, prazoHora: null }
    const prazo = this.util(1 + Math.floor(this.sorte() * 10))
    return { prazo, prazoHora: this.sorte() > 0.5 ? this.escolher(['10:00', '12:00', '15:00', '18:00'] as const) : null }
  }

  nova(q: QuadroDemo, colunaId: Id, extra: Extra = {}): Demanda {
    const { cliente: escolhido, ...resto } = extra
    const cliente = escolhido ?? this.clientes[this.proximoCliente++ % this.clientes.length]!
    const entrada: CriarDemandaEntrada = {
      quadroId: this.ctx.quadros[q].quadro.id, colunaId, titulo: this.titulo(q), clienteId: cliente.id,
      prioridade: this.escolher(PRIORIDADES_SORTEIO), ...this.prazoSorteado(), ...resto,
    }
    return criarDemanda(this.db, entrada, this.atorDoAm(cliente)).demanda
  }

  moverPara(d: Demanda, colunaId: Id, quem: Ator): void {
    mover(this.db, { demandaId: d.id, ator: quem, colunaId })
  }

  /** Entrega Vn (por quem está na demanda, ou o AM), envia (link ou por fora) e roda a automação "enviado ao cliente". */
  entregarEEnviar(d: Demanda, via: 'link' | 'fora', dias: { entrega: number; envio: number }): void {
    const am = this.atorDoAm(this.ctx.clientes[this.siglaDe(d)]!)
    const autor = carregarDemanda(this.db, d.id).membroIds[0] ?? am.usuario!.id
    this.quando(dias.entrega, () => entregarPorSql(this.db, d.id, autor))
    this.quando(dias.envio, () => {
      enviarPorSql(this.db, d.id, { atendimentoId: am.usuario!.id, via })
      executarAutomacao(this.db, d.id, 'enviado_ao_cliente', am)
    })
  }

  /** `dias` > 0: no passado; 0: agora. */
  quando<T>(dias: number, fn: () => T): T {
    return dias > 0 ? this.antes(dias, fn) : fn()
  }

  siglaDe(d: Demanda): string {
    return this.clientes.find((c) => c.id === d.clienteId)!.sigla.toLowerCase()
  }

  ultimaVersao(d: Demanda): Id {
    return carregarDemanda(this.db, d.id).versaoAtualId!
  }

  // ───────── quadros ─────────

  atendimento(total: number): void {
    const q: QuadroDemo = 'atendimento'
    const [aFazer, fazendo, revisao, concluido] = ['A fazer', 'Fazendo', 'Revisão', 'Concluído'].map((n) => this.coluna(q, n)) as [Id, Id, Id, Id]
    let n = 0
    const conta = <T>(v: T) => { n++; return v }
    // atrasada
    conta(this.antes(4, () => this.nova(q, fazendo, { titulo: 'Orçamento de campanha', prazo: this.util(-1), prazoHora: '18:00',
      prioridade: 'alta', etiquetaIds: [this.etiqueta(q, 'Urgente')] })))
    // com o cliente (o próprio AM entrega e envia; o Kanban leva a Com o cliente)
    const apresentacao = conta(this.antes(3, () => this.nova(q, revisao, { titulo: 'Apresentar planejamento de 2027', prazo: this.util(2) })))
    this.entregarEEnviar(apresentacao, 'fora', { entrega: 2, envio: 1 })
    // cliente pediu ajuste: o Kanban devolve a Fazendo
    const ajuste = conta(this.antes(5, () => this.nova(q, revisao, { titulo: 'Cronograma de posts de novembro', prazo: this.util(1) })))
    this.entregarEEnviar(ajuste, 'fora', { entrega: 4, envio: 3 })
    this.antes(1, () => {
      const am = this.atorDoAm(this.ctx.clientes[this.siglaDe(ajuste)]!)
      const versao = this.ultimaVersao(ajuste)
      pedirAjustePorSql(this.db, ajuste.id, { ator: am, linhas: ['Trocar a data do sorteio para dia 20', 'Incluir o post do Dia do Médico'] })
      executarAutomacao(this.db, ajuste.id, 'ajuste_pedido', am, quadroDoEnvio(this.db, versao))
    })
    // concluídas: duas recentes e uma há mais de 7 dias (só no Arquivo)
    for (let i = 0; i < 2; i++) {
      const d = conta(this.antes(3, () => this.nova(q, revisao)))
      this.antes(1, () => this.moverPara(d, concluido, this.atorDoAm(this.ctx.clientes[this.siglaDe(d)]!)))
    }
    const velha = conta(this.antes(14, () => this.nova(q, revisao, { titulo: 'Relatório mensal de setembro' })))
    this.antes(10, () => this.moverPara(velha, concluido, this.ator('am')))
    // o resto em rodízio, com o AM como membro de metade delas
    const rodizio = [aFazer, fazendo, revisao]
    for (let i = 0; n < total; i++) {
      const cliente = this.clientes[i % this.clientes.length]!
      conta(this.nova(q, rodizio[i % rodizio.length]!, { cliente, membroIds: i % 2 ? [cliente.atendimentoId!] : [],
        etiquetaIds: i % 5 === 0 ? [this.etiqueta(q, 'Orçamento')] : [] }))
    }
  }

  criacao(total: number): void {
    const q: QuadroDemo = 'criacao'
    const pessoas = this.colunasDePessoa(q)
    const [fila, pronto, concluido] = ['Fila', 'Pronto', 'Concluído'].map((x) => this.coluna(q, x)) as [Id, Id, Id]
    const [urgente, alteracao, video, campanha] = ['Urgente', 'Alteração', 'Vídeo', 'Campanha'].map((x) => this.etiqueta(q, x)) as [Id, Id, Id, Id]
    let n = 0
    const conta = <T>(v: T) => { n++; return v }
    const pessoa = (i: number) => pessoas[i % pessoas.length]!.id

    // atrasadas e para hoje, nas colunas das pessoas
    for (let i = 0; i < 2; i++) {
      conta(this.antes(5, () => this.nova(q, pessoa(i), { prazo: this.util(-(i + 1)), prazoHora: '18:00', prioridade: 'alta',
        etiquetaIds: [urgente] })))
    }
    conta(this.nova(q, pessoa(2), { prazo: this.util(0), prazoHora: '17:00', etiquetaIds: [campanha] }))
    conta(this.nova(q, pessoa(0), { prazo: this.util(0), prazoHora: null }))
    // entregue, esperando o AM enviar
    const entregue = conta(this.antes(2, () => this.nova(q, pessoa(1), { prazo: this.util(1) })))
    this.antes(1, () => {
      entregarPorSql(this.db, entregue.id, pessoas[1 % pessoas.length]!.responsavelId!)
      this.moverPara(entregue, pronto, this.atorDaColuna(pessoas[1 % pessoas.length]!))
    })
    // com o cliente: por fora, por link e uma parada há 3 dias úteis (a automação leva ao Atendimento; "Urgente" fica
    // guardada na Criação e "Alteração" também, porque o Atendimento não tem etiqueta com esse nome)
    const comCliente: [via: 'fora' | 'link', envio: number][] = [['fora', 0], ['link', 0], ['fora', 3]]
    comCliente.forEach(([via, envio], i) => {
      const d = conta(this.antes(envio + 3, () => this.nova(q, pessoa(i), { prazo: this.util(1), etiquetaIds: i === 0 ? [urgente, alteracao] : [] })))
      this.entregarEEnviar(d, via, { entrega: envio + 1, envio })
    })
    // aprovadas: a automação "aprovado" leva ao Social › Fila com o responsável do cliente no Social
    for (let i = 0; i < 2; i++) {
      const d = conta(this.antes(6, () => this.nova(q, pessoa(i + 1), { titulo: `Carrossel ${this.escolher(TEMAS)}`, modeloId: 'md-carrossel' })))
      this.entregarEEnviar(d, i === 0 ? 'link' : 'fora', { entrega: 4, envio: 3 })
      this.antes(1, () => {
        const am = this.atorDoAm(this.ctx.clientes[this.siglaDe(d)]!)
        const versao = this.ultimaVersao(d)
        aprovarPorSql(this.db, d.id, am.usuario!.id)
        executarAutomacao(this.db, d.id, 'aprovado', am, quadroDoEnvio(this.db, versao))
      })
    }
    // rodada 3 (extra): dois ajustes do cliente; a automação devolve à Fila da Criação a cada um
    const extra = conta(this.antes(9, () => this.nova(q, pessoa(2), { titulo: 'Folder da nova unidade', etiquetaIds: [alteracao],
      prazo: this.util(-3) })))
    const amExtra = this.atorDoAm(this.ctx.clientes[this.siglaDe(extra)]!)
    const ajustar = (dias: number, linhas: string[], marcarExtra: boolean) => this.antes(dias, () => {
      const versao = this.ultimaVersao(extra)
      pedirAjustePorSql(this.db, extra.id, { ator: amExtra, linhas, extra: marcarExtra })
      executarAutomacao(this.db, extra.id, 'ajuste_pedido', amExtra, quadroDoEnvio(this.db, versao))
    })
    this.entregarEEnviar(extra, 'fora', { entrega: 8, envio: 7 })
    ajustar(6, ['Trocar a foto da fachada', 'Telefone novo: (41) 3333-0000'], false)
    this.antes(5, () => this.moverPara(extra, pessoa(2), this.atorDaColuna(pessoas[2 % pessoas.length]!)))
    this.entregarEEnviar(extra, 'link', { entrega: 4, envio: 3 })
    ajustar(1, ['Logo maior na capa', 'Tirar o QR code', 'Revisar o mapa'], true)
    // repetição semanal
    conta(this.nova(q, pessoa(2), { titulo: 'Post semanal de dicas', repetir: 'semanal', prazo: this.util(2), prazoHora: '12:00',
      modeloId: 'md-post' }))
    // concluídas: recentes e há mais de 7 dias (Arquivo)
    for (let i = 0; i < Math.max(1, Math.round(total * 0.08)); i++) {
      const d = conta(this.antes(4, () => this.nova(q, pessoa(i))))
      this.antes(1 + (i % 3), () => this.moverPara(d, concluido, this.atorDaColuna(pessoas[i % pessoas.length]!)))
    }
    for (let i = 0; i < Math.max(1, Math.round(total * 0.04)); i++) {
      const d = conta(this.antes(14, () => this.nova(q, pessoa(i))))
      this.antes(10, () => this.moverPara(d, concluido, this.atorDaColuna(pessoas[i % pessoas.length]!)))
    }
    // o resto: 45% na Fila, 40% com as pessoas, 15% em Pronto
    for (let i = 0; n < total; i++) {
      const sorteio = this.sorte()
      const destino = sorteio < 0.45 ? fila : sorteio < 0.85 ? pessoa(i) : pronto
      const etiquetas = this.sorte() < 0.3 ? [this.escolher([urgente, alteracao, video, campanha])] : []
      const modelo = this.sorte() < 0.2 ? { modeloId: this.escolher(['md-post', 'md-carrossel', 'md-stories', 'md-grafico']) } : {}
      conta(this.nova(q, destino, { etiquetaIds: etiquetas, ...modelo }))
    }
  }

  social(total: number): void {
    const q: QuadroDemo = 'social'
    const pessoas = this.colunasDePessoa(q)
    const [fila, agendado, publicado] = ['Fila', 'Agendado', 'Publicado'].map((x) => this.coluna(q, x)) as [Id, Id, Id]
    const [reels, patrocinado] = ['Reels', 'Patrocinado'].map((x) => this.etiqueta(q, x)) as [Id, Id]
    let n = 0
    const conta = <T>(v: T) => { n++; return v }
    const pessoa = (i: number) => pessoas[i % pessoas.length]!.id
    // semanal concluída pelo checkbox: a automação leva a Publicado e a próxima nasce na Fila
    const semanal = conta(this.antes(8, () => this.nova(q, pessoa(0), { titulo: 'Post semanal de dicas', repetir: 'semanal',
      prazo: this.util(-2), prazoHora: '12:00' })))
    this.antes(2, () => concluir(this.db, { demandaId: semanal.id, ator: this.atorDaColuna(pessoas[0]!), concluida: true, via: 'checkbox' }))
    // agendados com data de publicação
    for (let i = 0; i < 4; i++) {
      conta(this.nova(q, agendado, { titulo: `Post ${this.escolher(TEMAS)}`, publicacaoData: this.util(1 + i), publicacaoHora: '12:00',
        prazo: this.util(1 + i), membroIds: [pessoas[i % pessoas.length]!.responsavelId!] }))
    }
    // atrasada
    conta(this.antes(3, () => this.nova(q, pessoa(1), { titulo: 'Relatório de engajamento', prazo: this.util(-1) })))
    // publicados: recentes e um antigo
    for (let i = 0; i < 3; i++) {
      const d = conta(this.antes(3, () => this.nova(q, pessoa(i), { etiquetaIds: i === 0 ? [reels] : [] })))
      this.antes(1, () => this.moverPara(d, publicado, this.atorDaColuna(pessoas[i % pessoas.length]!)))
    }
    const antigo = conta(this.antes(14, () => this.nova(q, pessoa(0))))
    this.antes(10, () => this.moverPara(antigo, publicado, this.atorDaColuna(pessoas[0]!)))
    for (let i = 0; n < total; i++) {
      const destino = i % 3 === 0 ? fila : pessoa(i)
      conta(this.nova(q, destino, { etiquetaIds: this.sorte() < 0.25 ? [this.escolher([reels, patrocinado])] : [] }))
    }
  }

  kanban(q: Extract<QuadroDemo, 'web' | 'trafego' | 'producao'>, total: number): void {
    const [aFazer, fazendo, revisao, concluido] = ['A fazer', 'Fazendo', 'Revisão', 'Concluído'].map((x) => this.coluna(q, x)) as [Id, Id, Id, Id]
    const dono = this.ctx.pessoas[q].id
    let n = 0
    const conta = <T>(v: T) => { n++; return v }
    const comCliente = conta(this.antes(4, () => this.nova(q, revisao, { membroIds: [dono], prazo: this.util(1) })))
    this.entregarEEnviar(comCliente, 'fora', { entrega: 2, envio: 1 })
    const feita = conta(this.antes(3, () => this.nova(q, revisao, { membroIds: [dono] })))
    this.antes(1, () => this.moverPara(feita, concluido, atorDe(this.ctx.pessoas[q])))
    conta(this.antes(4, () => this.nova(q, fazendo, { membroIds: [dono], prazo: this.util(-1), prioridade: 'alta' })))
    const rodizio = [aFazer, fazendo, revisao]
    for (let i = 0; n < total; i++) {
      const coluna = rodizio[i % rodizio.length]!
      conta(this.nova(q, coluna, { membroIds: coluna === aFazer ? [] : [dono] }))
    }
  }

  /** Lançamentos da semana (até hoje) de quem está nas demandas, para a tela de horas ter o que mostrar. */
  horas(): void {
    const segunda = segundaDaSemana(this.hoje)
    const dias = Array.from({ length: 5 }, (_, i) => somarDias(segunda, i)).filter((d) => d <= this.hoje)
    for (const chave of ['design', 'design2', 'design3', 'social', 'social2', 'web'] as const) {
      const eu = this.ctx.pessoas[chave]
      const minhas = todos<{ id: string }>(this.db, `SELECT d.id FROM demanda d JOIN demanda_membro m ON m.demanda_id = d.id
        WHERE m.usuario_id = ? AND d.concluida_em IS NULL AND d.arquivado_em IS NULL ORDER BY d.numero LIMIT 4`, eu.id)
      minhas.forEach((d, i) => {
        lancarApontamento(this.db, { demandaId: d.id, ator: atorDe(eu),
          entrada: { minutos: 30 + 15 * ((i * 7) % 9), data: dias[i % dias.length]!, nota: i === 0 ? 'Primeira versão' : null } })
      })
    }
  }

  /** O cronômetro do admin ligado há 25 minutos numa demanda de uma coluna de pessoa da Criação. */
  cronometroDoAdmin(): void {
    const coluna = this.colunasDePessoa('criacao')[0]!
    const d = todos<{ id: string; cliente_id: string | null }>(this.db, `SELECT id, cliente_id FROM demanda WHERE coluna_id = ?
      AND concluida_em IS NULL ORDER BY posicao LIMIT 1`, coluna.id)[0]!
    const inicio = new Date(agoraData().getTime() - 25 * 60_000).toISOString()
    rodar(this.db, `INSERT INTO apontamento (id, usuario_id, demanda_id, cliente_id, data, iniciado_em, origem, criado_em, atualizado_em)
                    VALUES (?, ?, ?, ?, ?, ?, 'cronometro', ?, ?)`,
    novoId(), this.ctx.pessoas.admin.id, d.id, d.cliente_id, hojeSP(new Date(inicio)), inicio, inicio, agora())
  }

  /** Deixa só as 5 notificações mais novas de cada pessoa sem ler (o seed gera centenas de "chegou"). */
  notificacoesLidas(): void {
    rodar(this.db, `UPDATE notificacao SET lida_em = ? WHERE lida_em IS NULL AND id NOT IN (
      SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY usuario_id ORDER BY id DESC) AS n FROM notificacao) WHERE n <= 5)`, agora())
  }
}

export function semear(ctx: ContextoDemo): void {
  const demo = new Demo(ctx)
  demo.atendimento(20)
  demo.criacao(ctx.demandasCriacao)
  demo.social(40)
  demo.kanban('web', 15)
  demo.kanban('trafego', 15)
  demo.kanban('producao', 15)
  demo.horas()
  demo.cronometroDoAdmin()
  demo.notificacoesLidas()
}
