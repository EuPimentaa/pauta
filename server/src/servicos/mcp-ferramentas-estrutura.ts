/**
 * Ferramentas de estrutura do MCP (API.md §F.5, 16 a 18): colunas e etiquetas de um quadro e a criação de cliente, para
 * o Claude recriar um quadro do Trello. Como as de escrita: cada uma traduz nomes em ids, monta a entrada da rota e passa
 * por `entradaDaApi()` (o esquema da rota e, no cliente, os campos do papel) antes do MESMO serviço da rota
 * (`criarColuna`, `editarColuna`, `arquivarColuna`, `criarEtiqueta`, `editarEtiqueta`, `criarCliente`): mesmas regras,
 * mesmos eventos SSE, nenhum SQL de negócio aqui. Rodam dentro da tx() do adaptador, que já gravou o mcp_traco ("via
 * Claude"). Nada apaga: coluna só arquiva (vazia), etiqueta não se exclui por aqui.
 */
import { z } from 'zod'
import type { Coluna, Cor, Etiqueta, Id, PosicaoRelativa, Quadro } from '../../../shared/tipos/index.ts'
import { CORES, PAPEIS_COLUNA } from '../../../shared/tipos/index.ts'
import { plural, umaLinha } from '../../../shared/logica/mcp-texto.ts'
import { normalizarAlias } from '../../../shared/logica/texto.ts'
import { config } from '../config.ts'
import { ErroHttp } from '../erros.ts'
import * as esquemaNucleo from '../esquemas.ts'
import { criarCliente } from './clientes.ts'
import { arquivarColuna, criarColuna, editarColuna } from './colunas.ts'
import { carregarDemanda } from './demandas.ts'
import { criarEtiqueta, editarEtiqueta } from './etiquetas.ts'
import { ErroMcp, escrita, ferramenta, type Ferramenta } from './mcp-comum.ts'
import { entradaDaApi } from './mcp-ferramentas-escrita.ts'
import { chave, Nomes } from './mcp-nomes.ts'
import { exigir } from './permissoes.ts'
import { colunasDoQuadro } from './quadros.ts'

const nome = z.string().max(80)
const cor = z.enum(CORES)
const ROTULO_PAPEL = { normal: 'normal', aguardando_cliente: 'aguardando o cliente', concluida: 'concluída' } as const

/** "Briefing" ou "(sem nome)". */
const rot = (texto: string, max = 60) => umaLinha(texto, max) || '(sem nome)'

/** A ordem das colunas ativas do quadro, lida depois da mudança (a de Nomes guarda a de antes). */
function ordem(n: Nomes, q: Quadro): string {
  return `Ordem: ${colunasDoQuadro(n.db, q.id).map((c) => rot(c.nome, 40)).join(' · ')}`
}

/** O que a coluna tem além do nome: "(azul, @rafa, concluída, WIP 5)". */
function marcas(n: Nomes, c: Coluna): string {
  const m = [c.cor ?? '', c.responsavelId ? n.handle(c.responsavelId) : '', c.papel !== 'normal' ? ROTULO_PAPEL[c.papel] : '',
    c.limiteWip ? `WIP ${c.limiteWip}` : ''].filter(Boolean)
  return m.length ? ` (${m.join(', ')})` : ''
}

/**
 * O esquema da rota fala do campo da API ("nome", "responsavelId"); o modelo mandou o parâmetro da ferramenta. A
 * mensagem de validação sai com o nome que ele usou ('Confira "coluna": …').
 */
function comParametros<T>(fn: () => T, mapa: Record<string, string>): T {
  try {
    return fn()
  } catch (e) {
    if (!(e instanceof ErroHttp) || e.codigo !== 'validacao') throw e
    let m = e.message
    for (const [api, param] of Object.entries(mapa)) m = m.replace(`"${api}"`, `"${param}"`)
    throw new ErroMcp(m)
  }
}

/**
 * Mesmo nome para o MCP: a mesma chave (sem caixa, acento, espaço, ponto, hífen e invisível); nome só de pontuação
 * ("---", chave vazia): o nome sem caixa.
 */
function mesmoNome(texto: string): (x: string) => boolean {
  const k = chave(texto)
  return k ? (x) => chave(x) === k : (x) => normalizarAlias(umaLinha(x)) === normalizarAlias(umaLinha(texto))
}

/** O MCP acha a coluna pelo nome: dois nomes iguais no quadro deixariam as duas sem como chamar. */
function exigirNomeLivre(n: Nomes, q: Quadro, texto: string, exceto: Id | null): void {
  const igual = mesmoNome(texto)
  if (n.colunas(q.id).some((c) => c.id !== exceto && igual(c.nome))) {
    throw new ErroMcp(`Já existe a coluna "${rot(texto)}" em ${q.slug}. Escolha outro nome.`)
  }
}

/**
 * O MCP acha a etiqueta pelo nome e a só de cor pela cor: um nome igual ao de outra do quadro (mesmoNome; a rota só
 * compara sem caixa e sem acento) ou uma segunda só de cor da mesma cor deixariam as duas sem como chamar.
 */
function exigirEtiquetaLivre(n: Nomes, q: Quadro, nome: string, cor: Cor, exceto: Id | null): void {
  const outras = n.etiquetas(q.id).filter((e) => e.id !== exceto)
  const limpo = umaLinha(nome, 40)
  if (limpo) {
    const igual = mesmoNome(limpo)
    if (outras.some((e) => e.nome && igual(e.nome))) throw new ErroMcp(`Já existe a etiqueta "${limpo}" neste quadro.`)
  } else if (outras.some((e) => !e.nome && e.cor === cor)) {
    throw new ErroMcp(`Já existe uma etiqueta ${cor} sem nome em ${q.slug}. Dê um nome a esta.`)
  }
}

// ─────────────────────────────── 16. coluna ───────────────────────────────

const coluna = ferramenta({
  nome: 'coluna', titulo: 'Coluna',
  descricao: 'Cria, edita, move ou arquiva (só vazia) uma coluna de um quadro.',
  esquema: z.object({
    acao: z.enum(['criar', 'editar', 'mover', 'arquivar']),
    quadro: nome,
    coluna: nome.describe('Em criar, o nome da nova.'),
    nome: nome.optional().describe('Novo nome (editar).'),
    cor: cor.nullable().optional(),
    papel: z.enum(PAPEIS_COLUNA).optional(),
    responsavel: nome.nullable().optional().describe('Apelido; coluna da pessoa.'),
    limiteWip: z.number().int().min(1).max(99).nullable().optional(),
    depoisDe: nome.optional().describe('Coluna; padrão: no fim.'),
    antesDe: nome.optional(),
  }).strict(),
  anotacoes: escrita(false, true), escrita: true,
  executar({ db, ator, usuario }, a) {
    const n = new Nomes(db, usuario.id)
    const q = n.quadro(a.quadro)
    const atual = a.acao === 'criar' ? null : n.coluna(q, a.coluna)
    if (a.depoisDe !== undefined && a.antesDe !== undefined) throw new ErroMcp('Use depoisDe ou antesDe, não os dois.')
    const ref = a.depoisDe ?? a.antesDe
    const vizinha = ref !== undefined ? n.coluna(q, ref) : null
    if (vizinha && atual && vizinha.id === atual.id) throw new ErroMcp('Escolha outra coluna em depoisDe ou antesDe.')
    const posicao: PosicaoRelativa | undefined = vizinha ? (a.depoisDe !== undefined ? { depoisDeId: vizinha.id } : { antesDeId: vizinha.id }) : undefined

    if (a.acao === 'arquivar') {
      const r = arquivarColuna(db, atual!.id, ator)
      const partes = [`Coluna ${rot(r.coluna.nome)} arquivada em ${q.slug}`]
      if (r.concluidasArquivadas.length) partes.push(`${plural(r.concluidasArquivadas.length, 'concluída antiga arquivada', 'concluídas antigas arquivadas')} junto`)
      if (r.automacoesDesligadas.length) {
        partes.push(`automações desligadas: ${r.automacoesDesligadas.map((x) => `${n.quadroPorId(x.quadroId)?.slug ?? '?'} (${x.gatilho})`).join(', ')}`)
      }
      return `${partes.join(' · ')}\n${ordem(n, q)}`
    }

    const bruto: Record<string, unknown> = {}
    if (a.cor !== undefined) bruto.cor = a.cor
    if (a.papel !== undefined) bruto.papel = a.papel
    if (a.responsavel !== undefined) bruto.responsavelId = a.responsavel === null ? null : n.pessoa(a.responsavel).id
    if (a.limiteWip !== undefined) bruto.limiteWip = a.limiteWip
    if (posicao) bruto.posicao = posicao

    if (a.acao === 'criar') {
      if (a.nome !== undefined) throw new ErroMcp('Em criar, o nome vai em coluna (nome é para renomear).')
      const e = comParametros(() => entradaDaApi(ator, { nome: a.coluna, ...bruto }, esquemaNucleo.criarColuna, null),
        { nome: 'coluna', responsavelId: 'responsavel' })
      exigirNomeLivre(n, q, e.nome, null)
      const c = criarColuna(db, q.id, e, ator)
      return `Criada a coluna ${rot(c.nome)}${marcas(n, c)} em ${q.slug}\n${ordem(n, q)}`
    }

    if (a.acao === 'mover' && !posicao) throw new ErroMcp('Para mover, mande depoisDe ou antesDe.')
    if (a.nome !== undefined) bruto.nome = a.nome
    if (Object.keys(bruto).length === 0) throw new ErroMcp('Nada para mudar: mande nome, cor, papel, responsavel, limiteWip, depoisDe ou antesDe.')
    const e = comParametros(() => entradaDaApi(ator, bruto, esquemaNucleo.editarColuna, null), { responsavelId: 'responsavel' })
    if (e.nome !== undefined) exigirNomeLivre(n, q, e.nome, atual!.id)
    const antes = atual!
    const { coluna: depois, concluidas } = editarColuna(db, antes.id, e, ator)
    const mudou: string[] = []
    if (antes.nome !== depois.nome) mudou.push(`nome ${rot(antes.nome)} → ${rot(depois.nome)}`)
    if (antes.cor !== depois.cor) mudou.push(`cor ${antes.cor ?? '—'} → ${depois.cor ?? '—'}`)
    if (antes.papel !== depois.papel) mudou.push(`papel ${ROTULO_PAPEL[antes.papel]} → ${ROTULO_PAPEL[depois.papel]}`)
    if (antes.responsavelId !== depois.responsavelId) {
      mudou.push(`pessoa ${antes.responsavelId ? n.handle(antes.responsavelId) : '—'} → ${depois.responsavelId ? n.handle(depois.responsavelId) : '—'}`)
    }
    if (antes.limiteWip !== depois.limiteWip) mudou.push(`WIP ${antes.limiteWip ?? '—'} → ${depois.limiteWip ?? '—'}`)
    if (antes.pos !== depois.pos) mudou.push('movida')
    if (concluidas.length) {
      const numeros = concluidas.slice(0, 10).map((id) => `#${carregarDemanda(db, id).numero}`)
      mudou.push(`${plural(concluidas.length, 'demanda concluída', 'demandas concluídas')}: ${numeros.join(' ')}${concluidas.length > 10 ? ' …' : ''}`)
    }
    return `Coluna ${rot(depois.nome)} em ${q.slug}: ${mudou.length ? mudou.join('; ') : 'nada mudou'}${antes.pos !== depois.pos ? `\n${ordem(n, q)}` : ''}`
  },
})

// ─────────────────────────────── 17. etiqueta ───────────────────────────────

/** "Urgente (rosa)"; a só de cor: "verde (sem nome)". */
const rotEtiqueta = (e: Pick<Etiqueta, 'nome' | 'cor'>) => e.nome ? `${umaLinha(e.nome, 40)} (${e.cor})` : `${e.cor} (sem nome)`

const etiqueta = ferramenta({
  nome: 'etiqueta', titulo: 'Etiqueta', descricao: 'Cria ou edita uma etiqueta de um quadro.',
  esquema: z.object({
    acao: z.enum(['criar', 'editar']),
    quadro: nome,
    etiqueta: nome.optional().describe('Criar: o nome (sem ele, só cor); editar: a atual.'),
    nome: z.string().max(40).optional().describe('Novo nome (editar).'),
    cor: cor.optional().describe('Obrigatória em criar.'),
  }).strict(),
  anotacoes: escrita(false), escrita: true,
  executar({ db, ator, usuario }, a) {
    const n = new Nomes(db, usuario.id)
    const q = n.quadro(a.quadro)
    if (a.acao === 'criar') {
      if (!a.cor) throw new ErroMcp('Em criar, mande a cor.')
      const e = comParametros(() => entradaDaApi(ator, { ...(a.etiqueta ? { nome: a.etiqueta } : {}), cor: a.cor },
        esquemaNucleo.criarEtiqueta, null), { nome: 'etiqueta' })
      exigirEtiquetaLivre(n, q, e.nome ?? '', e.cor, null)
      return `Criada a etiqueta ${rotEtiqueta(criarEtiqueta(db, q.id, e, ator))} em ${q.slug}`
    }
    if (!a.etiqueta) throw new ErroMcp('Em editar, mande a etiqueta atual (o nome, ou a cor se ela não tem nome).')
    const antes = n.etiqueta(q.id, a.etiqueta)
    if (a.nome === undefined && a.cor === undefined) throw new ErroMcp('Nada para mudar: mande nome ou cor.')
    const e = entradaDaApi(ator, { ...(a.nome !== undefined ? { nome: a.nome } : {}), ...(a.cor ? { cor: a.cor } : {}) },
      esquemaNucleo.editarEtiqueta, null)
    const nome = e.nome !== undefined ? umaLinha(e.nome, 40) : antes.nome
    const cor = e.cor ?? antes.cor
    if (normalizarAlias(nome) !== normalizarAlias(antes.nome) || (!nome && cor !== antes.cor)) exigirEtiquetaLivre(n, q, nome, cor, antes.id)
    const depois = editarEtiqueta(db, antes.id, e, ator)
    const mudou: string[] = []
    if (antes.nome !== depois.nome) mudou.push(`nome ${umaLinha(antes.nome, 40) || '—'} → ${umaLinha(depois.nome, 40) || '—'}`)
    if (antes.cor !== depois.cor) mudou.push(`cor ${antes.cor} → ${depois.cor}`)
    return `Etiqueta ${rotEtiqueta(depois)} em ${q.slug}: ${mudou.length ? mudou.join('; ') : 'nada mudou'}`
  },
})

// ─────────────────────────────── 18. criar_cliente ───────────────────────────────

const criarClienteMcp = ferramenta({
  nome: 'criar_cliente', titulo: 'Criar cliente',
  descricao: 'Cria um cliente com sigla e nome; o resto do cadastro fica na tela.',
  esquema: z.object({
    sigla: z.string().max(20).describe('Até 12 letras ou números.'),
    nome: z.string().max(200),
    apelidos: z.array(z.string().max(80)).max(50).optional().describe('Só atendimento e admin.'),
  }).strict(),
  anotacoes: escrita(false), escrita: true,
  executar({ db, ator, usuario }, a) {
    exigir(ator, 'cliente.criar')
    const n = new Nomes(db, usuario.id)
    const bruto = { sigla: a.sigla, nome: a.nome, ...(a.apelidos?.length ? { apelidos: a.apelidos } : {}) }
    const e = entradaDaApi(ator, bruto, esquemaNucleo.criarCliente, 'cliente')
    const c = criarCliente(db, e, ator)
    const partes = [`Criado o cliente ${c.sigla} · ${umaLinha(c.nome, 80)}`,
      c.atendimentoId ? `AM ${n.handle(c.atendimentoId)}` : 'sem AM (o atendimento completa o cadastro)']
    const apelidos = c.apelidos.filter((x) => chave(x) !== chave(c.sigla))
    if (apelidos.length) partes.push(`apelidos: ${apelidos.map((x) => umaLinha(x, 40)).join(', ')}`)
    partes.push(`${config.appUrl}/clientes/${c.sigla}`)
    return partes.join(' · ')
  },
})

export const FERRAMENTAS_ESTRUTURA: Ferramenta[] = [coluna, etiqueta, criarClienteMcp] as unknown as Ferramenta[]
