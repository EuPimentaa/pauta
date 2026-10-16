/**
 * Lógica pura do F5 no front (testada em server/test/cadastros-web-logica.test.ts; imports relativos para rodar no
 * Node): o plano de colunas do "Novo quadro" e do "Criar os quadros das equipes", o corpo do POST /api/quadros e os
 * Primeiros passos do admin (os mesmos critérios da API §4.18, calculados do bootstrap).
 */
import type {
  ClienteResumo, Cor, CriarQuadroEntrada, Equipe, FundoQuadro, GatilhoAutomacao, Id, ModeloQuadro, NovaColuna, PapelColuna,
  PassoInicial, Quadro, UsuarioResumo,
} from '../../../../shared/tipos/index.ts'
import { normalizarAlias } from '../../../../shared/logica/texto.ts'

/** Sigla como o servidor aceita: maiúsculas, A–Z e 0–9, até 12 ("hé-1" → "HE1"). */
export function limparSigla(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

/** "Criação" → "Criação 2" (ou 3, 4… se já existir um quadro com o nome, sem caixa e sem acento). */
export function nomeDaCopia(nome: string, existentes: readonly string[]): string {
  const usados = new Set(existentes.map(normalizarAlias))
  for (let i = 2; i < 100; i++) {
    const candidato = `${nome} ${i}`
    if (!usados.has(normalizarAlias(candidato))) return candidato
  }
  return `${nome} (cópia)`
}

/** Uma coluna planejada (editável antes de criar). */
export interface ColunaPlano {
  /** Chave local (estável entre edições). */
  chave: string
  nome: string
  cor: Cor | null
  papel: PapelColuna
  /** Coluna de uma pessoa (só papel normal). */
  responsavelId: Id | null
  /** De qual coluna do modelo veio (as automações do modelo seguem a coluna). */
  modeloColunaId: Id | null
  /** Desmarcada = não nasce (e a automação que levava para ela também não). */
  manter: boolean
  /** Acrescentada à mão (some em vez de desmarcar). */
  nova?: boolean
}

/** Nome da coluna de uma pessoa: o apelido ou o primeiro nome (o mesmo do servidor). */
export function nomeDaColunaDe(u: Pick<UsuarioResumo, 'nome' | 'apelido'>): string {
  return u.apelido?.trim() || u.nome.trim().split(/\s+/)[0] || u.nome
}

const colacao = new Intl.Collator('pt-BR', { sensitivity: 'base' })

/** Membros ativos da equipe, o principal primeiro e depois por nome (a ordem das colunas de pessoa). */
export function membrosAtivos(equipe: Pick<Equipe, 'membros'> | null | undefined, usuarios: readonly UsuarioResumo[]): UsuarioResumo[] {
  if (!equipe) return []
  const porId = new Map(usuarios.map((u) => [u.id, u]))
  return equipe.membros
    .map((m) => ({ m, u: porId.get(m.usuarioId) }))
    .filter((x): x is { m: Equipe['membros'][number]; u: UsuarioResumo } => !!x.u && x.u.ativo)
    .sort((a, b) => Number(b.m.principal) - Number(a.m.principal) || colacao.compare(a.u.nome, b.u.nome))
    .map((x) => x.u)
}

/** O modelo vira colunas: a "por pessoa" se expande numa coluna por membro ativo (com `responsavelId`). */
export function planejarColunas(modelo: ModeloQuadro | null | undefined, membros: readonly UsuarioResumo[]): ColunaPlano[] {
  if (!modelo) return []
  const plano: ColunaPlano[] = []
  for (const mc of [...modelo.colunas].sort((a, b) => a.pos - b.pos)) {
    if (mc.porMembro) {
      for (const u of membros) {
        plano.push({ chave: `pessoa-${u.id}`, nome: nomeDaColunaDe(u), cor: u.cor, papel: 'normal', responsavelId: u.id, modeloColunaId: null, manter: true })
      }
    } else {
      plano.push({ chave: `modelo-${mc.id}`, nome: mc.nome, cor: mc.cor, papel: mc.papel, responsavelId: null, modeloColunaId: mc.id, manter: true })
    }
  }
  return plano
}

export function temColunaPorPessoa(modelo: ModeloQuadro | null | undefined): boolean {
  return !!modelo?.colunas.some((c) => c.porMembro)
}

/** As automações do modelo que nascem com o quadro, pela coluna de destino (desmarcada: não nasce). */
export function automacoesDoPlano(modelo: ModeloQuadro | null | undefined, plano: readonly ColunaPlano[]): Map<string, GatilhoAutomacao[]> {
  const m = new Map<string, GatilhoAutomacao[]>()
  for (const a of modelo?.automacoes ?? []) {
    const coluna = plano.find((c) => c.modeloColunaId === a.destinoColunaId)
    if (!coluna) continue
    m.set(coluna.chave, [...(m.get(coluna.chave) ?? []), a.gatilho])
  }
  return m
}

export const FRASE_GATILHO: Record<GatilhoAutomacao, string> = {
  enviado_ao_cliente: 'Ao enviar ao cliente, a demanda vem para cá',
  ajuste_pedido: 'Quando o cliente pedir ajuste, ela volta para cá',
  aprovado: 'Quando o cliente aprovar, ela vem para cá',
  concluida: 'Ao marcar concluída, ela vem para cá',
}

/** Problemas que impedem criar (nome vazio). Devolve a mensagem por chave de coluna. */
export function errosDoPlano(plano: readonly ColunaPlano[]): Map<string, string> {
  const erros = new Map<string, string>()
  for (const c of plano) if (c.manter && !c.nome.trim()) erros.set(c.chave, 'Dê um nome à coluna ou desmarque.')
  return erros
}

export interface OpcoesQuadro {
  nome: string
  equipeId: Id | null
  modelo: ModeloQuadro | null
  plano: readonly ColunaPlano[]
  cor: Cor
  fundo: FundoQuadro
  descricao?: string
  colunaPorMembro: boolean
  membrosDaEquipeSeguem: boolean
}

/** O corpo do POST /api/quadros: as colunas mantidas na ordem, já com as pessoas e a `modeloColunaId` de cada uma. */
export function entradaDoQuadro(o: OpcoesQuadro): CriarQuadroEntrada {
  const colunas: NovaColuna[] = o.plano.filter((c) => c.manter).map((c) => ({
    nome: c.nome.trim(), cor: c.cor, papel: c.responsavelId ? 'normal' : c.papel,
    ...(c.responsavelId ? { responsavelId: c.responsavelId } : {}),
    ...(c.modeloColunaId ? { modeloColunaId: c.modeloColunaId } : {}),
  }))
  return {
    nome: o.nome.trim(),
    ...(o.descricao?.trim() ? { descricao: o.descricao.trim() } : {}),
    cor: o.cor, fundo: o.fundo, equipeId: o.equipeId, modeloQuadroId: o.modelo?.id ?? null, colunas,
    colunaPorMembro: o.colunaPorMembro,
    ...(o.equipeId ? { membrosDaEquipeSeguem: o.membrosDaEquipeSeguem } : {}),
  }
}

/** Equipes ativas que ainda não têm quadro ativo (uma linha cada no "Criar os quadros das equipes"). */
export function equipesSemQuadro(equipes: readonly Equipe[], quadros: readonly Pick<Quadro, 'equipeId' | 'arquivadoEm'>[]): Equipe[] {
  const comQuadro = new Set(quadros.filter((q) => q.arquivadoEm === null && q.equipeId).map((q) => q.equipeId))
  return equipes.filter((e) => e.ativa && !comQuadro.has(e.id)).sort((a, b) => a.pos - b.pos)
}

// ─────────────────────────────── Primeiros passos (API §4.18) ───────────────────────────────

export interface PassoCalculado {
  id: PassoInicial
  rotulo: string
  caminho: string
  feito: boolean
}

export interface DadosPassos {
  usuarios: readonly Pick<UsuarioResumo, 'ativo'>[]
  quadros: readonly Pick<Quadro, 'arquivadoEm'>[]
  clientes: readonly Pick<ClienteResumo, 'status' | 'pendencias'>[]
  modelosRevisadosEm: string | null
}

const ROTULO_PASSO: Record<PassoInicial, string> = {
  convidar_equipe: 'Convidar a equipe',
  criar_quadros: 'Criar os quadros das equipes',
  cadastrar_clientes: 'Cadastrar os clientes',
  revisar_modelos: 'Revisar os modelos de demanda',
}

const CAMINHO_PASSO: Record<PassoInicial, string> = {
  convidar_equipe: '/config/pessoas',
  criar_quadros: '/quadros/novo?equipes=1',
  cadastrar_clientes: '/clientes',
  revisar_modelos: '/config/modelos',
}

/**
 * Na ordem de PASSOS_INICIAIS, com o critério de `feito`: 2+ usuários ativos; 1+ quadro ativo; 1+ cliente fora de
 * 'ex' e nenhum deles sem AM; "Revisei os modelos" apertado.
 */
export function calcularPassos(d: DadosPassos): { itens: PassoCalculado[]; concluido: boolean } {
  const ativos = d.clientes.filter((c) => c.status !== 'ex')
  const feito: Record<PassoInicial, boolean> = {
    convidar_equipe: d.usuarios.filter((u) => u.ativo).length >= 2,
    criar_quadros: d.quadros.some((q) => q.arquivadoEm === null),
    cadastrar_clientes: ativos.length > 0 && ativos.every((c) => !c.pendencias.includes('sem_am')),
    revisar_modelos: d.modelosRevisadosEm !== null,
  }
  const ordem: PassoInicial[] = ['convidar_equipe', 'criar_quadros', 'cadastrar_clientes', 'revisar_modelos']
  const itens = ordem.map((id) => ({ id, rotulo: ROTULO_PASSO[id], caminho: CAMINHO_PASSO[id], feito: feito[id] }))
  return { itens, concluido: itens.every((i) => i.feito) }
}

/** "3 clientes · 1 sem AM" e afins: o resumo do passo para a tela. */
export function resumoDoPasso(id: PassoInicial, d: DadosPassos & { equipesSemQuadro: number; quadrosAtivos: number }): string {
  switch (id) {
    case 'convidar_equipe': {
      const n = d.usuarios.filter((u) => u.ativo).length
      return n <= 1 ? 'Só você por enquanto. Convide pelo link: cada pessoa define a própria senha.' : `${n} pessoas com acesso.`
    }
    case 'criar_quadros':
      if (d.quadrosAtivos === 0) return 'Um quadro por equipe, com as colunas sugeridas e uma coluna por pessoa.'
      return d.equipesSemQuadro > 0
        ? `${d.quadrosAtivos} ${d.quadrosAtivos === 1 ? 'quadro' : 'quadros'}; ${d.equipesSemQuadro} ${d.equipesSemQuadro === 1 ? 'equipe ainda sem quadro' : 'equipes ainda sem quadro'}.`
        : `${d.quadrosAtivos} ${d.quadrosAtivos === 1 ? 'quadro criado' : 'quadros criados'}.`
    case 'cadastrar_clientes': {
      const ativos = d.clientes.filter((c) => c.status !== 'ex')
      const semAm = ativos.filter((c) => c.pendencias.includes('sem_am')).length
      if (ativos.length === 0) return 'Sigla, nome, AM e o contato que aprova. Dá para criar na hora também.'
      return semAm > 0 ? `${ativos.length} ${ativos.length === 1 ? 'cliente' : 'clientes'}; ${semAm} sem AM.` : `${ativos.length} ${ativos.length === 1 ? 'cliente' : 'clientes'} com AM.`
    }
    case 'revisar_modelos':
      return d.modelosRevisadosEm ? 'Modelos revisados.' : 'Post, Carrossel, Reels…: ajuste o briefing e os prazos da agência.'
  }
}
