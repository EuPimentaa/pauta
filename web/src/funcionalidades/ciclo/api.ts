/**
 * Chamadas do ciclo (F2, API.md §4.8, §4.16) e o cache que cada resposta atualiza: o evento do meu próprio trace é eco
 * e o tempo real o ignora, então quem chama põe a resposta no bootstrap (a demanda, que pode ter mudado de quadro pela
 * automação) e no detalhe aberto, e pede o detalhe de novo para o que a resposta não traz (o checklist da rodada, o
 * print de evidência, os movimentos). Os erros sobem como ErroDaApi: os diálogos mostram no próprio formulário.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query'
import type {
  AjusteInternoEntrada, AjusteInternoSaida, AnularAprovacaoSaida, AprovadoWhatsappEntrada, AutomacaoQuadro, DefinirAutomacaoEntrada,
  Demanda, EntregarVersaoEntrada, EntregarVersaoSaida, EnviarAoClienteEntrada, EnviarAoClienteSaida, GatilhoAutomacao, Id,
  LinkPublicoComUrl, LinkPublicoResumo, ModeloWhatsapp, NovoItem, RegistrarRetornoEntrada, RegistrarRetornoSaida, Rodada,
  TestarDriveSaida, TestarVersaoSaida, TextoWhatsappSaida, VersaoComItens,
} from '@shared/tipos/index.ts'
import { formatarPrazo } from '@shared/logica/datas.ts'
import { avisarErro } from '../../api/acoes.ts'
import { aplicarDemandaDoServidor, aplicarNoBootstrap, bootstrapDe, demandaConhecida, invalidarDetalhe } from '../../api/cache.ts'
import { chaves } from '../../api/chaves.ts'
import { api, type ErroDaApi } from '../../api/cliente.ts'
import { avisar } from '../../ui/avisos.tsx'
import { aplicarNoDetalhe, comAprovacao, comEnvio, comLink, comRodada, comVersao, mudarLinks } from './cache.ts'

const de = (id: Id) => `/api/demandas/${encodeURIComponent(id)}`
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** "Atendimento › Com o cliente" (o quadro só quando mudou), pelo bootstrap. */
export function lugarDe(qc: QueryClient, d: Pick<Demanda, 'quadroId' | 'colunaId'>, quadroAntes?: Id): string | null {
  const b = bootstrapDe(qc)
  const coluna = b?.colunas.find((c) => c.id === d.colunaId)
  const quadro = b?.quadros.find((q) => q.id === d.quadroId)
  if (!coluna || !quadro) return null
  return quadroAntes && quadroAntes !== d.quadroId ? `${quadro.nome} › ${coluna.nome}` : coluna.nome
}

/** A resposta muda a demanda (bootstrap e detalhe) e o detalhe busca de novo o resto. */
function aplicarDemanda(qc: QueryClient, d: Demanda): void {
  aplicarDemandaDoServidor(qc, d)
  invalidarDetalhe(qc, d.id)
}

/** O último envio de cada demanda nesta aba (o "Enviar ao soltar" sabe se a automação moveu). */
const ultimosEnvios = new Map<Id, EnviarAoClienteSaida>()
export function ultimoEnvio(demandaId: Id): EnviarAoClienteSaida | undefined {
  return ultimosEnvios.get(demandaId)
}

// ─────────────────────────────── consultas ───────────────────────────────

/** Links públicos da demanda com a URL (só atendimento e admin). */
export function useLinks(demandaId: Id, ativo: boolean) {
  return useQuery<LinkPublicoComUrl[], ErroDaApi>({
    queryKey: chaves.links(demandaId),
    queryFn: ({ signal }) => api<LinkPublicoComUrl[]>('GET', `${de(demandaId)}/links`, { sinal: signal }),
    enabled: ativo,
    staleTime: 30_000,
  })
}

export function textoWhatsapp(demandaId: Id, modelo: ModeloWhatsapp, sinal?: AbortSignal): Promise<TextoWhatsappSaida> {
  return api<TextoWhatsappSaida>('GET', `${de(demandaId)}/whatsapp?modelo=${modelo}`, { sinal })
}

export function testarLinkDrive(url: string, sinal?: AbortSignal): Promise<TestarDriveSaida> {
  return api<TestarDriveSaida>('POST', '/api/drive/testar', { corpo: { url }, sinal })
}

// ─────────────────────────────── mutações ───────────────────────────────

export function criarAcoesCiclo(qc: QueryClient) {
  async function entregar(demandaId: Id, e: EntregarVersaoEntrada): Promise<EntregarVersaoSaida> {
    const s = await api<EntregarVersaoSaida>('POST', `${de(demandaId)}/versoes`, { corpo: e })
    aplicarNoDetalhe(qc, demandaId, (det) => comVersao(det, s.versao))
    aplicarDemanda(qc, s.demanda)
    return s
  }

  async function editarVersao(v: VersaoComItens, nota: string | null): Promise<VersaoComItens> {
    const s = await api<VersaoComItens>('PATCH', `/api/versoes/${encodeURIComponent(v.id)}`, { corpo: { nota } })
    aplicarNoDetalhe(qc, v.demandaId, (det) => comVersao(det, s))
    return s
  }

  async function adicionarItens(v: Pick<VersaoComItens, 'id' | 'demandaId'>, itens: NovoItem[]): Promise<VersaoComItens> {
    const s = await api<VersaoComItens>('POST', `/api/versoes/${encodeURIComponent(v.id)}/itens`, { corpo: { itens } })
    aplicarNoDetalhe(qc, v.demandaId, (det) => comVersao(det, s))
    return s
  }

  async function testarVersao(v: Pick<VersaoComItens, 'id' | 'demandaId'>): Promise<TestarVersaoSaida> {
    const s = await api<TestarVersaoSaida>('POST', `/api/versoes/${encodeURIComponent(v.id)}/testar-drive`, {})
    invalidarDetalhe(qc, v.demandaId)
    return s
  }

  async function enviar(demandaId: Id, e: EnviarAoClienteEntrada): Promise<EnviarAoClienteSaida> {
    const s = await api<EnviarAoClienteSaida>('POST', `${de(demandaId)}/enviar`, { corpo: e })
    ultimosEnvios.set(demandaId, s)
    aplicarNoDetalhe(qc, demandaId, (det) => comEnvio(det, s.envio))
    aplicarDemanda(qc, s.demanda)
    void qc.invalidateQueries({ queryKey: chaves.links(demandaId), exact: true })
    return s
  }

  /** Depois do retorno: o aviso (com Desfazer na aprovação manual e "Marcar como extra" quando passou das inclusas). */
  function avisarRetorno(antes: Demanda | undefined, s: RegistrarRetornoSaida): void {
    const onde = s.automacao ? lugarDe(qc, s.demanda, antes?.quadroId) : null
    const movida = onde ? `Movida para ${onde}.` : undefined
    if (s.aprovacao.decisao === 'aprovado') {
      avisar('Aprovação registrada', {
        tipo: 'sucesso', descricao: movida,
        desfazer: s.aprovacao.via === 'manual' ? async () => { await anularSilencioso(s.aprovacao.id) } : undefined,
      })
      return
    }
    const r = s.rodada
    const titulo = r?.prazo ? `Ajuste registrado: rodada ${r.numero} até ${formatarPrazo(r.prazo, r.prazoHora)}` : 'Ajuste registrado'
    const extra = s.sugerirExtra && r ? `Passou das ${plural(s.demanda.rodadasInclusas, 'rodada inclusa', 'rodadas inclusas')}.` : undefined
    avisar(titulo, {
      tipo: 'sucesso', descricao: [movida, extra].filter(Boolean).join(' ') || undefined,
      acao: s.sugerirExtra && r ? { rotulo: 'Marcar como extra', executar: async () => { await marcarExtraComAviso(r, true) } } : undefined,
    })
  }

  async function registrarRetorno(demandaId: Id, e: RegistrarRetornoEntrada): Promise<RegistrarRetornoSaida> {
    const antes = demandaConhecida(qc, demandaId)
    const s = await api<RegistrarRetornoSaida>('POST', `${de(demandaId)}/retorno`, { corpo: e })
    aposRetorno(demandaId, s)
    avisarRetorno(antes, s)
    return s
  }

  function aposRetorno(demandaId: Id, s: RegistrarRetornoSaida | AjusteInternoSaida): void {
    if ('aprovacao' in s) aplicarNoDetalhe(qc, demandaId, (det) => comAprovacao(det, s.aprovacao))
    if (s.rodada) aplicarNoDetalhe(qc, demandaId, (det) => comRodada(det, s.rodada!))
    aplicarDemanda(qc, s.demanda)
  }

  /** "Aprovado pelo WhatsApp" (1 clique): o aviso traz o Desfazer (anula). Erro: aviso. */
  async function aprovadoWhatsapp(demandaId: Id, e: AprovadoWhatsappEntrada = {}): Promise<RegistrarRetornoSaida | null> {
    const antes = demandaConhecida(qc, demandaId)
    try {
      const s = await api<RegistrarRetornoSaida>('POST', `${de(demandaId)}/aprovado-whatsapp`, { corpo: e })
      aposRetorno(demandaId, s)
      avisarRetorno(antes, s)
      return s
    } catch (erro) {
      avisarErro(erro, { titulo: 'Não foi possível registrar a aprovação.' })
      return null
    }
  }

  async function anular(aprovacaoId: Id): Promise<AnularAprovacaoSaida> {
    const antes = bootstrapDe(qc)?.demandas
    const s = await api<AnularAprovacaoSaida>('POST', `/api/aprovacoes/${encodeURIComponent(aprovacaoId)}/anular`, {})
    const quadroAntes = antes?.find((d) => d.id === s.demanda.id)?.quadroId
    aplicarDemanda(qc, s.demanda)
    const onde = s.voltou ? lugarDe(qc, s.demanda, quadroAntes) : null
    avisar('Aprovação anulada', { descricao: onde ? `Voltou para ${onde}. A peça aguarda o cliente de novo.` : 'A peça aguarda o cliente de novo.' })
    return s
  }

  async function anularSilencioso(aprovacaoId: Id): Promise<void> {
    try {
      await anular(aprovacaoId)
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível desfazer.' })
    }
  }

  async function ajusteInterno(demandaId: Id, e: AjusteInternoEntrada): Promise<AjusteInternoSaida> {
    const s = await api<AjusteInternoSaida>('POST', `${de(demandaId)}/ajuste-interno`, { corpo: e })
    aposRetorno(demandaId, s)
    const r = s.rodada
    avisar(`Ajuste interno pedido: rodada ${r.numero}${r.prazo ? ` até ${formatarPrazo(r.prazo, r.prazoHora)}` : ''}`, {
      tipo: 'sucesso',
      acao: s.sugerirExtra ? { rotulo: 'Marcar como extra', executar: async () => { await marcarExtraComAviso(r, true) } } : undefined,
    })
    return s
  }

  async function marcarExtra(r: Rodada, extra: boolean): Promise<Rodada> {
    const s = await api<Rodada>('POST', `/api/rodadas/${encodeURIComponent(r.id)}/extra`, { corpo: { extra } })
    aplicarNoDetalhe(qc, r.demandaId, (det) => comRodada(det, s))
    return s
  }

  async function marcarExtraComAviso(r: Rodada, extra: boolean): Promise<void> {
    try {
      await marcarExtra(r, extra)
      avisar(extra ? `Rodada ${r.numero} marcada como extra` : `Rodada ${r.numero} desmarcada`, extra
        ? { desfazer: async () => { await marcarExtraComAviso(r, false) } } : {})
    } catch (e) {
      avisarErro(e)
    }
  }

  async function revogarLink(demandaId: Id, linkId: Id): Promise<LinkPublicoResumo> {
    const s = await api<LinkPublicoResumo>('POST', `/api/links-publicos/${encodeURIComponent(linkId)}/revogar`, {})
    mudarLinks(qc, demandaId, (l) => l.map((x) => (x.id === s.id ? { ...x, ...s } : x)))
    aplicarNoDetalhe(qc, demandaId, (det) => comLink(det, s))
    return s
  }

  async function definirAutomacao(quadroId: Id, gatilho: GatilhoAutomacao, e: DefinirAutomacaoEntrada): Promise<AutomacaoQuadro> {
    const a = await api<AutomacaoQuadro>('PUT', `/api/quadros/${encodeURIComponent(quadroId)}/automacoes/${gatilho}`, { corpo: e })
    aplicarNoBootstrap(qc, 'automacoes', 'upsert', a)
    return a
  }

  async function excluirAutomacao(quadroId: Id, gatilho: GatilhoAutomacao): Promise<void> {
    await api<void>('DELETE', `/api/quadros/${encodeURIComponent(quadroId)}/automacoes/${gatilho}`)
    aplicarNoBootstrap(qc, 'automacoes', 'delete', { id: `${quadroId}:${gatilho}` })
  }

  return {
    entregar, editarVersao, adicionarItens, testarVersao, enviar, registrarRetorno, aprovadoWhatsapp, anular, ajusteInterno,
    marcarExtra, marcarExtraComAviso, revogarLink, definirAutomacao, excluirAutomacao, anularSilencioso,
  }
}

export type AcoesCiclo = ReturnType<typeof criarAcoesCiclo>

const porCliente = new WeakMap<QueryClient, AcoesCiclo>()

/** As ações do ciclo deste QueryClient (uma instância por cliente). */
export function acoesCiclo(qc: QueryClient): AcoesCiclo {
  let a = porCliente.get(qc)
  if (!a) { a = criarAcoesCiclo(qc); porCliente.set(qc, a) }
  return a
}
