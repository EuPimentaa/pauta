/**
 * Quadros, colunas e etiquetas (PLANO §2.2; API §4.5 a §4.7). Colunas e etiquetas são otimistas; tudo atualiza o
 * ['bootstrap'] pela resposta (o eco do SSE é ignorado). As funções são estáveis entre renders.
 *
 *   const colunas = useColunasMutacoes(); await colunas.editar(c, { cor: 'rosa' })
 */
import { useMemo } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  ArquivarCardsSaida, ArquivarColunaSaida, Bootstrap, Coluna, CopiarQuadroEntrada, CriarColunaEntrada, CriarEtiquetaEntrada,
  Demanda, EditarColunaEntrada, EditarColunaSaida, EditarEtiquetaEntrada, EditarQuadroEntrada, Etiqueta, Id, MoverCardsEntrada,
  MoverCardsSaida, OrdemColuna, OrdenarColunaSaida, PosicaoRelativa, Quadro, QuadroCompleto,
} from '@shared/tipos/index.ts'
import { entre } from '@shared/logica/posicao.ts'
import { ehCardDaColuna } from '@shared/logica/quadro.ts'
import { avisar } from '../ui/avisos.tsx'
import { avisarErro } from './acoes.ts'
import { atualizarEu, euEmCache } from './auth.ts'
import { recarregarBootstrap } from './bootstrap.ts'
import { aplicarNoBootstrap, bootstrapDe, comItem, inserirDemanda, mudarBootstrap } from './cache.ts'
import { chaves } from './chaves.ts'
import { api } from './cliente.ts'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Chave de ordem local entre irmãos (a mesma conta do servidor, API §5.10). */
function posLocal<T extends { id: Id; pos: number }>(irmaos: readonly T[], item: Id, rel: PosicaoRelativa | undefined): number {
  const lista = irmaos.filter((x) => x.id !== item).sort((a, b) => a.pos - b.pos)
  if (rel?.depoisDeId !== undefined) {
    if (rel.depoisDeId === null) return entre(null, lista[0]?.pos ?? null)
    const i = lista.findIndex((x) => x.id === rel.depoisDeId)
    return i < 0 ? entre(lista.at(-1)?.pos ?? null, null) : entre(lista[i].pos, lista[i + 1]?.pos ?? null)
  }
  if (rel?.antesDeId) {
    const i = lista.findIndex((x) => x.id === rel.antesDeId)
    if (i >= 0) return entre(lista[i - 1]?.pos ?? null, lista[i].pos)
  }
  return entre(lista.at(-1)?.pos ?? null, null)
}

/** Os cards da coluna (API §4.6): não arquivados e abertos ou concluídos há no máximo N dias. */
export function cardsDaColuna(b: Bootstrap, colunaId: Id): Demanda[] {
  const agora = new Date()
  return b.demandas.filter((d) => d.colunaId === colunaId && ehCardDaColuna(d, agora, b.config.quadroConcluidasDias))
}

const PESO_PRIORIDADE = { urgente: 0, alta: 1, media: 2, baixa: 3 } as const
const colacao = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

/** A ordem do "Ordenar por…" (o servidor grava; aqui é só a previsão da tela). */
export function ordenarLocal(b: Bootstrap, cards: Demanda[], por: OrdemColuna): Demanda[] {
  const sigla = (d: Demanda) => (d.clienteId ? b.clientes.find((c) => c.id === d.clienteId)?.sigla ?? '' : '')
  const cmp: Record<OrdemColuna, (a: Demanda, z: Demanda) => number> = {
    prazo: (a, z) => (a.prazo === null ? 1 : 0) - (z.prazo === null ? 1 : 0) || (a.prazo ?? '').localeCompare(z.prazo ?? '')
      || (a.prazoHora ?? '18:00').localeCompare(z.prazoHora ?? '18:00'),
    prioridade: (a, z) => PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[z.prioridade],
    criacao: (a, z) => a.criadoEm.localeCompare(z.criadoEm),
    titulo: (a, z) => colacao.compare(a.titulo, z.titulo),
    cliente: (a, z) => (sigla(a) === '' ? 1 : 0) - (sigla(z) === '' ? 1 : 0) || colacao.compare(sigla(a), sigla(z)),
  }
  return [...cards].sort((a, z) => cmp[por](a, z) || a.posicao - z.posicao)
}

function patchColuna(qc: QueryClient, id: Id, patch: Partial<Coluna>) {
  mudarBootstrap(qc, (b) => {
    const c = b.colunas.find((x) => x.id === id)
    return c ? comItem(b, 'colunas', 'upsert', { ...c, ...patch }) : b
  })
}

function patchDemandas(qc: QueryClient, ids: readonly Id[], fn: (d: Demanda) => Partial<Demanda>) {
  if (!ids.length) return
  const conjunto = new Set(ids)
  mudarBootstrap(qc, (b) => {
    const demandas = b.demandas
      .map((d) => (conjunto.has(d.id) ? { ...d, ...fn(d) } : d))
      .filter((d) => d.arquivadoEm === null)
    return { ...b, demandas }
  })
}

export interface MutacoesColunas {
  criar(quadroId: Id, e: CriarColunaEntrada): Promise<Coluna | null>
  editar(c: Coluna, e: EditarColunaEntrada): Promise<EditarColunaSaida | null>
  arquivar(c: Coluna): Promise<ArquivarColunaSaida | null>
  restaurar(c: Coluna): Promise<Coluna | null>
  moverCards(c: Coluna, e: MoverCardsEntrada): Promise<MoverCardsSaida | null>
  arquivarCards(c: Coluna): Promise<ArquivarCardsSaida | null>
  ordenar(c: Coluna, por: OrdemColuna): Promise<OrdenarColunaSaida | null>
}

export function colunasMutacoes(qc: QueryClient): MutacoesColunas {
  const rota = (c: Coluna) => `/api/colunas/${encodeURIComponent(c.id)}`
  const atual = (c: Coluna) => bootstrapDe(qc)?.colunas.find((x) => x.id === c.id) ?? c

  async function editar(c: Coluna, e: EditarColunaEntrada): Promise<EditarColunaSaida | null> {
    const antes = atual(c)
    const b = bootstrapDe(qc)
    const { posicao, ...campos } = e
    const otimista: Partial<Coluna> = { ...campos }
    if (posicao && b) otimista.pos = posLocal(b.colunas.filter((x) => x.quadroId === antes.quadroId && x.arquivadaEm === null), antes.id, posicao)
    patchColuna(qc, antes.id, otimista)
    try {
      const saida = await api<EditarColunaSaida>('PATCH', rota(antes), { corpo: e })
      aplicarNoBootstrap(qc, 'colunas', 'upsert', saida.coluna)
      // a coluna virou `concluida`: o servidor concluiu as abertas (os eventos delas são o nosso eco)
      const eu = bootstrapDe(qc)?.eu.usuario.id ?? null
      const agora = new Date().toISOString()
      patchDemandas(qc, saida.concluidas, (d) => (d.concluidaEm ? {} : { concluidaEm: agora, concluidaPor: eu }))
      if (saida.concluidas.length) avisar(`${plural(saida.concluidas.length, 'demanda concluída', 'demandas concluídas')} nesta coluna.`, { tipo: 'sucesso' })
      return saida
    } catch (erro) {
      patchColuna(qc, antes.id, antes)
      avisarErro(erro, { tentar: () => editar(atual(antes), e) })
      return null
    }
  }

  async function criar(quadroId: Id, e: CriarColunaEntrada): Promise<Coluna | null> {
    try {
      const col = await api<Coluna>('POST', `/api/quadros/${encodeURIComponent(quadroId)}/colunas`, { corpo: e })
      aplicarNoBootstrap(qc, 'colunas', 'upsert', col)
      return col
    } catch (erro) {
      avisarErro(erro, { titulo: 'Não foi possível criar a coluna.' })
      return null
    }
  }

  async function arquivar(c: Coluna): Promise<ArquivarColunaSaida | null> {
    const antes = atual(c)
    aplicarNoBootstrap(qc, 'colunas', 'delete', { id: antes.id })
    try {
      const saida = await api<ArquivarColunaSaida>('POST', `${rota(antes)}/arquivar`)
      const desligadas = new Set(saida.automacoesDesligadas.map((a) => `${a.quadroId}:${a.gatilho}`))
      mudarBootstrap(qc, (b) => ({ ...b, automacoes: b.automacoes.map((a) => (desligadas.has(a.id) ? { ...a, ativa: false } : a)) }))
      const extra = saida.automacoesDesligadas.length
        ? `${plural(saida.automacoesDesligadas.length, 'automação que levava para ela foi desligada', 'automações que levavam para ela foram desligadas')}.`
        : undefined
      avisar(`Coluna ${antes.nome} arquivada`, {
        descricao: extra,
        desfazer: async () => { await restaurar(saida.coluna) },
      })
      return saida
    } catch (erro) {
      aplicarNoBootstrap(qc, 'colunas', 'upsert', antes)
      avisarErro(erro, { titulo: 'Não foi possível arquivar a coluna.', tentar: () => arquivar(antes) })
      return null
    }
  }

  async function restaurar(c: Coluna): Promise<Coluna | null> {
    try {
      const col = await api<Coluna>('POST', `${rota(c)}/restaurar`)
      aplicarNoBootstrap(qc, 'colunas', 'upsert', col)
      return col
    } catch (erro) {
      avisarErro(erro, { titulo: 'Não foi possível restaurar a coluna.' })
      return null
    }
  }

  async function moverCards(c: Coluna, e: MoverCardsEntrada): Promise<MoverCardsSaida | null> {
    try {
      const saida = await api<MoverCardsSaida>('POST', `${rota(c)}/mover-cards`, { corpo: e })
      for (const p of saida.proximas) inserirDemanda(qc, p)
      // cada card passou pelo mover() do servidor (membros, etiquetas, concluir): o bootstrap novo traz o resultado
      // inteiro (os eventos de cada card são o nosso eco)
      void qc.invalidateQueries({ queryKey: chaves.bootstrap, refetchType: 'all' })
      const b = bootstrapDe(qc)
      const destino = b?.colunas.find((x) => x.id === e.destinoColunaId)
      avisar(`${plural(saida.movidas.length, 'demanda movida', 'demandas movidas')} para ${destino?.nome ?? 'a outra coluna'}.`, { tipo: 'sucesso' })
      return saida
    } catch (erro) {
      avisarErro(erro, { titulo: 'Não foi possível mover os cards.' })
      return null
    }
  }

  async function arquivarCards(c: Coluna): Promise<ArquivarCardsSaida | null> {
    const b = bootstrapDe(qc)
    const antes = b ? cardsDaColuna(b, c.id) : []
    const agora = new Date().toISOString()
    patchDemandas(qc, antes.map((d) => d.id), () => ({ arquivadoEm: agora }))
    try {
      const saida = await api<ArquivarCardsSaida>('POST', `${rota(c)}/arquivar-cards`)
      avisar(`${plural(saida.arquivadas.length, 'demanda arquivada', 'demandas arquivadas')}`, {
        desfazer: async () => {
          for (const id of saida.arquivadas) {
            try {
              const r = await api<{ demanda: Demanda }>('POST', `/api/demandas/${encodeURIComponent(id)}/restaurar`, { corpo: {} })
              inserirDemanda(qc, r.demanda)
            } catch (erro) {
              avisarErro(erro, { titulo: 'Nem todas voltaram.' })
              return
            }
          }
        },
      })
      return saida
    } catch (erro) {
      for (const d of antes) inserirDemanda(qc, d)
      avisarErro(erro, { tentar: () => arquivarCards(c) })
      return null
    }
  }

  async function ordenar(c: Coluna, por: OrdemColuna): Promise<OrdenarColunaSaida | null> {
    const b = bootstrapDe(qc)
    const cards = b ? cardsDaColuna(b, c.id) : []
    const posicoesAntes = new Map(cards.map((d) => [d.id, d.posicao]))
    const aplicar = (ids: readonly Id[]) => {
      const nova = new Map(ids.map((id, i) => [id, (i + 1) * 1024]))
      patchDemandas(qc, ids, (d) => ({ posicao: nova.get(d.id)! }))
    }
    if (b) aplicar(ordenarLocal(b, cards, por).map((d) => d.id))
    try {
      const saida = await api<OrdenarColunaSaida>('POST', `${rota(c)}/ordenar`, { corpo: { por } })
      aplicar(saida.ordem)
      return saida
    } catch (erro) {
      patchDemandas(qc, [...posicoesAntes.keys()], (d) => ({ posicao: posicoesAntes.get(d.id)! }))
      avisarErro(erro, { tentar: () => ordenar(c, por) })
      return null
    }
  }

  return { criar, editar, arquivar, restaurar, moverCards, arquivarCards, ordenar }
}

export interface MutacoesEtiquetas {
  criar(quadroId: Id, e: CriarEtiquetaEntrada): Promise<Etiqueta | null>
  editar(et: Etiqueta, e: EditarEtiquetaEntrada): Promise<Etiqueta | null>
  excluir(et: Etiqueta): Promise<boolean>
}

export function etiquetasMutacoes(qc: QueryClient): MutacoesEtiquetas {
  const rota = (et: Etiqueta) => `/api/etiquetas/${encodeURIComponent(et.id)}`
  return {
    async criar(quadroId, e) {
      try {
        const et = await api<Etiqueta>('POST', `/api/quadros/${encodeURIComponent(quadroId)}/etiquetas`, { corpo: e })
        aplicarNoBootstrap(qc, 'etiquetas', 'upsert', et)
        return et
      } catch (erro) {
        avisarErro(erro, { titulo: 'Não foi possível criar a etiqueta.' })
        return null
      }
    },
    async editar(et, e) {
      const b = bootstrapDe(qc)
      const { posicao, ...campos } = e
      const otimista: Etiqueta = { ...et, ...campos }
      if (posicao && b) otimista.pos = posLocal(b.etiquetas.filter((x) => x.quadroId === et.quadroId), et.id, posicao)
      aplicarNoBootstrap(qc, 'etiquetas', 'upsert', otimista)
      try {
        const nova = await api<Etiqueta>('PATCH', rota(et), { corpo: e })
        aplicarNoBootstrap(qc, 'etiquetas', 'upsert', nova)
        return nova
      } catch (erro) {
        aplicarNoBootstrap(qc, 'etiquetas', 'upsert', et)
        avisarErro(erro)
        return null
      }
    },
    async excluir(et) {
      const b = bootstrapDe(qc)
      const comEla = b ? b.demandas.filter((d) => d.etiquetaIds.includes(et.id)).map((d) => d.id) : []
      aplicarNoBootstrap(qc, 'etiquetas', 'delete', { id: et.id })
      patchDemandas(qc, comEla, (d) => ({ etiquetaIds: d.etiquetaIds.filter((x) => x !== et.id) }))
      try {
        await api<void>('DELETE', rota(et))
        return true
      } catch (erro) {
        aplicarNoBootstrap(qc, 'etiquetas', 'upsert', et)
        patchDemandas(qc, comEla, (d) => ({ etiquetaIds: [...d.etiquetaIds, et.id] }))
        avisarErro(erro, { titulo: 'Não foi possível excluir a etiqueta.' })
        return false
      }
    },
  }
}

const cacheColunas = new WeakMap<QueryClient, MutacoesColunas>()
const cacheEtiquetas = new WeakMap<QueryClient, MutacoesEtiquetas>()

export function useColunasMutacoes(): MutacoesColunas {
  const qc = useQueryClient()
  return useMemo(() => {
    let m = cacheColunas.get(qc)
    if (!m) { m = colunasMutacoes(qc); cacheColunas.set(qc, m) }
    return m
  }, [qc])
}

export function useEtiquetasMutacoes(): MutacoesEtiquetas {
  const qc = useQueryClient()
  return useMemo(() => {
    let m = cacheEtiquetas.get(qc)
    if (!m) { m = etiquetasMutacoes(qc); cacheEtiquetas.set(qc, m) }
    return m
  }, [qc])
}

/** PATCH /api/quadros/:id (admin): nome, slug, cor, fundo, equipe, "uma coluna por pessoa", ordem no menu. */
export function editarQuadro(qc: QueryClient) {
  return async (q: Quadro, e: EditarQuadroEntrada): Promise<Quadro | null> => {
    const b = bootstrapDe(qc)
    const { posicao, ...campos } = e
    const otimista: Quadro = { ...q, ...campos }
    if (posicao && b) otimista.pos = posLocal(b.quadros, q.id, posicao)
    aplicarNoBootstrap(qc, 'quadros', 'upsert', otimista)
    try {
      const novo = await api<Quadro>('PATCH', `/api/quadros/${encodeURIComponent(q.id)}`, { corpo: e })
      aplicarNoBootstrap(qc, 'quadros', 'upsert', novo)
      return novo
    } catch (erro) {
      aplicarNoBootstrap(qc, 'quadros', 'upsert', q)
      avisarErro(erro)
      return null
    }
  }
}

export function useEditarQuadro(): (q: Quadro, e: EditarQuadroEntrada) => Promise<Quadro | null> {
  const qc = useQueryClient()
  return useMemo(() => editarQuadro(qc), [qc])
}

/**
 * "Seguir"/"Deixar de seguir" fora do render (menu ··· do quadro), com o mesmo efeito do useSeguir do DS: otimista
 * sobre eu.seguindo, PUT /api/quadros/:id/seguir, volta e avisa no erro.
 */
export async function seguirQuadro(qc: QueryClient, quadroId: Id, seguindo: boolean): Promise<boolean> {
  const antes = euEmCache(qc)?.seguindo
  atualizarEu(qc, (eu) => ({
    ...eu,
    seguindo: seguindo ? (eu.seguindo.includes(quadroId) ? eu.seguindo : [...eu.seguindo, quadroId]) : eu.seguindo.filter((x) => x !== quadroId),
  }))
  try {
    await api('PUT', `/api/quadros/${encodeURIComponent(quadroId)}/seguir`, { corpo: { seguindo } })
    avisar(seguindo ? 'Você está seguindo este quadro.' : 'Você deixou de seguir este quadro.', {
      descricao: seguindo ? 'Avisamos quando chegar demanda sem ninguém da equipe.' : undefined,
    })
    return true
  } catch (erro) {
    if (antes) atualizarEu(qc, (eu) => ({ ...eu, seguindo: antes }))
    avisarErro(erro)
    return false
  }
}

/** POST /api/quadros/:id/copiar (admin; o F5 usa no menu do quadro). O quadro novo entra no bootstrap com o resto. */
export function useCopiarQuadro(): (q: Quadro, e: CopiarQuadroEntrada) => Promise<QuadroCompleto | null> {
  const qc = useQueryClient()
  return useMemo(() => async (q: Quadro, e: CopiarQuadroEntrada) => {
    try {
      const novo = await api<QuadroCompleto>('POST', `/api/quadros/${encodeURIComponent(q.id)}/copiar`, { corpo: e })
      mudarBootstrap(qc, (b) => {
        let x = comItem(b, 'quadros', 'upsert', novo.quadro)
        for (const c of novo.colunas.filter((c) => c.arquivadaEm === null)) x = comItem(x, 'colunas', 'upsert', c)
        for (const et of novo.etiquetas) x = comItem(x, 'etiquetas', 'upsert', et)
        for (const a of novo.automacoes) x = comItem(x, 'automacoes', 'upsert', a)
        return x
      })
      // os modelos de demanda copiados e o "seguindo" do quadro novo não vêm no QuadroCompleto (e os eventos deles
      // são o nosso eco): o bootstrap novo traz tudo
      void recarregarBootstrap(qc)
      return novo
    } catch (erro) {
      avisarErro(erro, { titulo: 'Não foi possível copiar o quadro.' })
      return null
    }
  }, [qc])
}
