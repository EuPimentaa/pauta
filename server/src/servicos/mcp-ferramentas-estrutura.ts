/**
 * Ferramentas de estrutura do MCP (API.md §F.5, 16 em diante): as colunas de um quadro, para o Claude recriar um quadro
 * do Trello. Como as de escrita: cada uma traduz nomes em ids, monta a entrada da rota e passa por `entradaDaApi()` (o
 * esquema da rota) antes do MESMO serviço da rota (`criarColuna`, `editarColuna`, `arquivarColuna`): mesmas regras,
 * mesmos eventos SSE, nenhum SQL de negócio aqui. Rodam dentro da tx() do adaptador, que já gravou o mcp_traco ("via
 * Claude"). Nada apaga: coluna só arquiva (vazia).
 */
import { z } from 'zod'
import type { Coluna, Id, PosicaoRelativa, Quadro } from '../../../shared/tipos/index.ts'
import { CORES, PAPEIS_COLUNA } from '../../../shared/tipos/index.ts'
import { plural, umaLinha } from '../../../shared/logica/mcp-texto.ts'
import { ErroHttp } from '../erros.ts'
import * as esquemaNucleo from '../esquemas.ts'
import { arquivarColuna, criarColuna, editarColuna } from './colunas.ts'
import { carregarDemanda } from './demandas.ts'
import { ErroMcp, escrita, ferramenta, type Ferramenta } from './mcp-comum.ts'
import { entradaDaApi } from './mcp-ferramentas-escrita.ts'
import { chave, Nomes } from './mcp-nomes.ts'
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

/** O MCP acha a coluna pelo nome: dois nomes iguais no quadro deixariam as duas sem como chamar. */
function exigirNomeLivre(n: Nomes, q: Quadro, texto: string, exceto: Id | null): void {
  const k = chave(texto)
  if (k && n.colunas(q.id).some((c) => c.id !== exceto && chave(c.nome) === k)) {
    throw new ErroMcp(`Já existe a coluna "${rot(texto)}" em ${q.slug}. Escolha outro nome.`)
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
  anotacoes: escrita(false), escrita: true,
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
      exigirNomeLivre(n, q, a.coluna, null)
      const e = comParametros(() => entradaDaApi(ator, { nome: a.coluna, ...bruto }, esquemaNucleo.criarColuna, null),
        { nome: 'coluna', responsavelId: 'responsavel' })
      const c = criarColuna(db, q.id, e, ator)
      return `Criada a coluna ${rot(c.nome)}${marcas(n, c)} em ${q.slug}\n${ordem(n, q)}`
    }

    if (a.acao === 'mover' && !posicao) throw new ErroMcp('Para mover, mande depoisDe ou antesDe.')
    if (a.nome !== undefined) {
      exigirNomeLivre(n, q, a.nome, atual!.id)
      bruto.nome = a.nome
    }
    if (Object.keys(bruto).length === 0) throw new ErroMcp('Nada para mudar: mande nome, cor, papel, responsavel, limiteWip, depoisDe ou antesDe.')
    const e = comParametros(() => entradaDaApi(ator, bruto, esquemaNucleo.editarColuna, null), { responsavelId: 'responsavel' })
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

export const FERRAMENTAS_ESTRUTURA: Ferramenta[] = [coluna] as unknown as Ferramenta[]
