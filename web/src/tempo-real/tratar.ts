/**
 * Tratadores do núcleo (PLANO §2, "Tempo real"): aplicam os eventos no cache, idempotentes. Os arquivos de
 * extensoes/eventos/nucleo*.ts só ligam estas funções; a regra do eco (qual evento com o meu trace ainda importa) também
 * mora aqui, para o cliente SSE e os testes usarem a mesma.
 */
import type { QueryClient } from '@tanstack/react-query'
import type {
  Bootstrap, Cliente, ClienteContato, ClienteLink, ClienteResumo, Coluna, ConfigApp, Demanda, Entidade, Equipe, Etiqueta, Eu,
  EventoDe, EventoTempoReal, Feriado, Id, AutomacaoQuadro, ModeloDemanda, Quadro, QuadroUsuario, UsuarioResumo,
} from '../../../shared/tipos/index.ts'
import {
  bootstrapDe, comDemanda, comItem, comPatchDemanda, invalidarDetalhe, inserirOuAtualizar, mudarBootstrap, pertenceAoBootstrap,
  semDemanda, semQuadro, atualizarDetalhe,
} from '../api/cache.ts'
import { chaves } from '../api/chaves.ts'
import { marcarRecebido } from './estado.ts'

// ─────────────────────────────── eco ───────────────────────────────

/** Entidades que vivem no bootstrap: o eco de um objeto inteiro que o cache ainda não tem é aplicado (não pisca nada). */
const NO_BOOTSTRAP: Partial<Record<Entidade, (b: Bootstrap, id: string) => boolean>> = {
  quadro: (b, id) => b.quadros.some((x) => x.id === id),
  coluna: (b, id) => b.colunas.some((x) => x.id === id),
  etiqueta: (b, id) => b.etiquetas.some((x) => x.id === id),
  automacao: (b, id) => b.automacoes.some((x) => x.id === id),
  modelo_demanda: (b, id) => b.modelosDemanda.some((x) => x.id === id),
  demanda: (b, id) => b.demandas.some((x) => x.id === id),
  cliente: (b, id) => b.clientes.some((x) => x.id === id),
  usuario: (b, id) => b.usuarios.some((x) => x.id === id),
  equipe: (b, id) => b.equipes.some((x) => x.id === id),
  feriado: (b, id) => b.feriados.some((x) => x.data === id),
}

/**
 * O próprio eco é ignorado (quem mudou já aplicou pela resposta da API), com uma exceção segura: o objeto inteiro de
 * algo do bootstrap que o cache não tem (etiqueta criada no destino ao mover, quadro restaurado, a repetição): não há
 * estado anterior para piscar, e a resposta da mutação não traz esses objetos.
 */
export function ecoIgnorado(qc: QueryClient, ev: EventoTempoReal, meuTrace: (t: string | null) => boolean): boolean {
  if (!meuTrace(ev.t)) return false
  const existe = NO_BOOTSTRAP[ev.e]
  if (!existe || ev.op !== 'upsert' || ev.c !== null) return true
  const b = bootstrapDe(qc)
  return !b || existe(b, ev.id)
}

// ─────────────────────────────── recarga do bootstrap ───────────────────────────────

let recarga: ReturnType<typeof setTimeout> | null = null

/** Recarrega o bootstrap (quadro restaurado ou criado; o cliente SSE pede no `resync`). Junta pedidos de 300 ms. */
export function agendarRecarga(qc: QueryClient, atrasoMs = 300): void {
  if (recarga) return
  recarga = setTimeout(() => {
    recarga = null
    void qc.invalidateQueries({ queryKey: chaves.bootstrap, refetchType: 'all' })
  }, atrasoMs)
}

// ─────────────────────────────── demanda ───────────────────────────────

const euIdDe = (qc: QueryClient) => bootstrapDe(qc)?.eu.usuario.id ?? null

export function tratarDemanda(ev: EventoDe<'demanda'>, qc: QueryClient): void {
  if (ev.op === 'delete') {
    mudarBootstrap(qc, (b) => semDemanda(b, ev.id))
    return
  }
  const b = bootstrapDe(qc)
  if (!b) return
  const antes = b.demandas.find((d) => d.id === ev.id)
  const deOutraPessoa = ev.a !== euIdDe(qc)

  if (ev.c === null) {
    const d = ev.p as Demanda
    mudarBootstrap(qc, (x) => comDemanda(x, d))
    atualizarDetalhe(qc, d.id, (det) => ({ ...det, demanda: d }))
    const chegou = !antes || antes.colunaId !== d.colunaId || antes.quadroId !== d.quadroId
    if (deOutraPessoa && chegou && pertenceAoBootstrap(b, d)) marcarRecebido(d.id)
    return
  }

  const patch = ev.p as Partial<Demanda>
  if (antes) {
    mudarBootstrap(qc, (x) => comPatchDemanda(x, ev.id, patch))
    const mudouDeLugar = (patch.colunaId !== undefined && patch.colunaId !== antes.colunaId)
      || (patch.quadroId !== undefined && patch.quadroId !== antes.quadroId)
    if (deOutraPessoa && mudouDeLugar) marcarRecebido(ev.id)
  }
  // patch de id desconhecido no bootstrap: só o detalhe aberto (demanda arquivada no modal) muda
  atualizarDetalhe(qc, ev.id, (det) => ({ ...det, demanda: { ...det.demanda, ...patch, id: ev.id } }))
  if (ev.c.includes('descricaoAtualizadaEm')) invalidarDetalhe(qc, ev.id)
}

// ─────────────────────────────── quadros, colunas, etiquetas, automações, modelos ───────────────────────────────

const quadroAtivo = (b: Bootstrap, id: Id | null) => id !== null && b.quadros.some((q) => q.id === id)

/** Mescla um patch (c não nulo) sobre o objeto do cache; objeto inteiro passa direto. */
function objetoDo<T extends { id: unknown }>(ev: { c: unknown[] | null; p: unknown }, atual: T | undefined): T | null {
  if (ev.c === null) return ev.p as T
  return atual ? { ...atual, ...(ev.p as Partial<T>) } : null
}

export interface DepsQuadros {
  /** GET /api/auth/eu (as estrelas e o "seguir" chegam por quadro_usuario, sem a ordem dos favoritos). */
  buscarEu(): Promise<Eu>
}

let buscaEu: ReturnType<typeof setTimeout> | null = null

function atualizarFavoritos(qc: QueryClient, deps: DepsQuadros): void {
  if (buscaEu) clearTimeout(buscaEu)
  buscaEu = setTimeout(() => {
    buscaEu = null
    deps.buscarEu().then((eu) => {
      const fn = (atual: Eu): Eu => ({ ...atual, favoritos: eu.favoritos, seguindo: eu.seguindo })
      qc.setQueryData<Bootstrap>(chaves.bootstrap, (b) => (b ? { ...b, eu: fn(b.eu) } : b))
      qc.setQueryData<Eu>(['eu'], (atual) => (atual ? fn(atual) : atual))
    }).catch(() => { /* sem conexão: o próximo evento ou o resync acertam */ })
  }, 150)
}

export function tratarQuadros(ev: EventoTempoReal, qc: QueryClient, deps: DepsQuadros): void {
  const b = bootstrapDe(qc)
  if (!b) return
  switch (ev.e) {
    case 'quadro': {
      if (ev.op === 'delete') return mudarBootstrap(qc, (x) => semQuadro(x, ev.id))
      const q = objetoDo<Quadro>(ev, b.quadros.find((x) => x.id === ev.id))
      if (!q) return
      if (q.arquivadoEm) return mudarBootstrap(qc, (x) => semQuadro(x, q.id))
      const conhecido = quadroAtivo(b, q.id)
      mudarBootstrap(qc, (x) => comItem(x, 'quadros', 'upsert', q))
      // quadro restaurado (ou criado): colunas, etiquetas e demandas dele vêm com o bootstrap
      if (!conhecido) agendarRecarga(qc)
      return
    }
    case 'coluna': {
      if (ev.op === 'delete') return mudarBootstrap(qc, (x) => comItem(x, 'colunas', 'delete', { id: ev.id }))
      const c = objetoDo<Coluna>(ev, b.colunas.find((x) => x.id === ev.id))
      if (!c) return
      const fica = c.arquivadaEm === null && quadroAtivo(b, c.quadroId)
      return mudarBootstrap(qc, (x) => comItem(x, 'colunas', fica ? 'upsert' : 'delete', fica ? c : { id: c.id }))
    }
    case 'etiqueta': {
      if (ev.op === 'delete') return mudarBootstrap(qc, (x) => comItem(x, 'etiquetas', 'delete', { id: ev.id }))
      const e = objetoDo<Etiqueta>(ev, b.etiquetas.find((x) => x.id === ev.id))
      if (e && quadroAtivo(b, e.quadroId)) mudarBootstrap(qc, (x) => comItem(x, 'etiquetas', 'upsert', e))
      return
    }
    case 'automacao': {
      if (ev.op === 'delete') return mudarBootstrap(qc, (x) => comItem(x, 'automacoes', 'delete', { id: ev.id }))
      const a = objetoDo<AutomacaoQuadro>(ev, b.automacoes.find((x) => x.id === ev.id))
      if (a && quadroAtivo(b, a.quadroId)) mudarBootstrap(qc, (x) => comItem(x, 'automacoes', 'upsert', a))
      return
    }
    case 'modelo_demanda': {
      if (ev.op === 'delete') return mudarBootstrap(qc, (x) => comItem(x, 'modelosDemanda', 'delete', { id: ev.id }))
      const m = objetoDo<ModeloDemanda>(ev, b.modelosDemanda.find((x) => x.id === ev.id))
      if (!m) return
      const fica = m.ativo && (m.quadroId === null || quadroAtivo(b, m.quadroId))
      return mudarBootstrap(qc, (x) => comItem(x, 'modelosDemanda', fica ? 'upsert' : 'delete', fica ? m : { id: m.id }))
    }
    case 'quadro_usuario': {
      // sem estrela e sem seguir a linha some (delete). O "seguir" e a estrela tirada valem na hora; a ordem dos
      // favoritos (favoritoPos dos outros quadros não vem no evento) é relida do servidor
      const qu: Partial<QuadroUsuario> = ev.op === 'delete' ? { seguindo: false, favoritoPos: null } : (ev.p as Partial<QuadroUsuario>)
      const fn = (eu: Eu): Eu => ({
        ...eu,
        seguindo: qu.seguindo === undefined ? eu.seguindo
          : qu.seguindo ? (eu.seguindo.includes(ev.id) ? eu.seguindo : [...eu.seguindo, ev.id]) : eu.seguindo.filter((id) => id !== ev.id),
        favoritos: qu.favoritoPos === null ? eu.favoritos.filter((id) => id !== ev.id) : eu.favoritos,
      })
      qc.setQueryData<Bootstrap>(chaves.bootstrap, (x) => (x ? { ...x, eu: fn(x.eu) } : x))
      qc.setQueryData<Eu>(['eu'], (x) => (x ? fn(x) : x))
      atualizarFavoritos(qc, deps)
      return
    }
    default:
      return
  }
}

// ─────────────────────────────── cadastros ───────────────────────────────

/** Atualiza o Cliente aberto (['cliente', sigla]) que tem este id. */
function noClienteAberto(qc: QueryClient, clienteId: Id, fn: (c: Cliente) => Cliente): void {
  for (const [chave, c] of qc.getQueriesData<Cliente>({ queryKey: ['cliente'] })) {
    if (chave.length === 2 && typeof chave[1] === 'string' && c && c.id === clienteId) qc.setQueryData<Cliente>(chave, fn(c))
  }
}

export function tratarCadastros(ev: EventoTempoReal, qc: QueryClient): void {
  const b = bootstrapDe(qc)
  if (!b) return
  switch (ev.e) {
    case 'cliente': {
      if (ev.op === 'delete') {
        mudarBootstrap(qc, (x) => ({ ...x, clientes: x.clientes.filter((c) => c.id !== ev.id) }))
        return
      }
      const atual = b.clientes.find((x) => x.id === ev.id)
      const c = objetoDo<ClienteResumo>(ev, atual)
      if (!c) return
      mudarBootstrap(qc, (x) => ({ ...x, clientes: inserirOuAtualizar(x.clientes, c) }))
      noClienteAberto(qc, c.id, (aberto) => ({ ...aberto, ...c }))
      // a sigla mudou: o detalhe guardado pela sigla antiga fica velho
      if (atual && atual.sigla !== c.sigla) void qc.invalidateQueries({ queryKey: chaves.cliente(atual.sigla), exact: true })
      return
    }
    case 'cliente_contato': {
      if (ev.op === 'delete') return
      const ct = ev.p as Partial<ClienteContato> & { id: Id; clienteId?: Id }
      const clienteId = ct.clienteId
      if (!clienteId) return
      noClienteAberto(qc, clienteId, (c) => {
        const atual = c.contatos.find((x) => x.id === ev.id)
        const novo = ev.c === null ? (ev.p as ClienteContato) : atual ? { ...atual, ...ct } : null
        return novo ? { ...c, contatos: inserirOuAtualizar(c.contatos, novo) } : c
      })
      return
    }
    case 'cliente_link': {
      for (const [chave, c] of qc.getQueriesData<Cliente>({ queryKey: ['cliente'] })) {
        if (chave.length !== 2 || typeof chave[1] !== 'string' || !c) continue
        if (ev.op === 'delete') {
          if (c.links.some((l) => l.id === ev.id)) qc.setQueryData<Cliente>(chave, { ...c, links: c.links.filter((l) => l.id !== ev.id) })
          continue
        }
        const l = ev.p as ClienteLink
        if (l.clienteId !== c.id) continue
        const atual = c.links.find((x) => x.id === ev.id)
        const novo = ev.c === null ? l : atual ? { ...atual, ...l } : null
        if (novo) qc.setQueryData<Cliente>(chave, { ...c, links: inserirOuAtualizar(c.links, novo).sort((a, z) => a.pos - z.pos) })
      }
      return
    }
    case 'usuario': {
      if (ev.op === 'delete') return
      const u = objetoDo<UsuarioResumo>(ev, b.usuarios.find((x) => x.id === ev.id))
      if (!u) return
      mudarBootstrap(qc, (x) => ({
        ...x,
        usuarios: inserirOuAtualizar(x.usuarios, u),
        eu: x.eu.usuario.id === u.id ? { ...x.eu, usuario: { ...x.eu.usuario, ...u } } : x.eu,
      }))
      return
    }
    case 'equipe': {
      if (ev.op === 'delete') {
        mudarBootstrap(qc, (x) => ({ ...x, equipes: x.equipes.filter((e) => e.id !== ev.id) }))
        return
      }
      const e = objetoDo<Equipe>(ev, b.equipes.find((x) => x.id === ev.id))
      if (e) mudarBootstrap(qc, (x) => ({ ...x, equipes: inserirOuAtualizar(x.equipes, e) }))
      return
    }
    case 'feriado': {
      if (ev.op === 'delete') {
        mudarBootstrap(qc, (x) => ({ ...x, feriados: x.feriados.filter((f) => f.data !== ev.id) }))
        return
      }
      const f = { ...(b.feriados.find((x) => x.data === ev.id) ?? {}), ...(ev.p as Partial<Feriado>), data: ev.id } as Feriado
      mudarBootstrap(qc, (x) => ({
        ...x,
        feriados: [...x.feriados.filter((y) => y.data !== f.data), f].sort((a, z) => (a.data < z.data ? -1 : 1)),
      }))
      return
    }
    case 'config': {
      // sempre o objeto inteiro (PATCH /api/config/app e "Revisei os modelos")
      if (ev.op === 'delete') return
      const config = { ...b.config, ...(ev.p as Partial<ConfigApp>) }
      mudarBootstrap(qc, (x) => ({ ...x, config }))
      return
    }
    default:
      return
  }
}
