/**
 * As mutações do núcleo (AcoesNucleo em extensoes/tipos.ts; PLANO §2.2): aplicam no cache na hora, chamam a API,
 * corrigem com a resposta e, no erro, voltam ao estado de antes com o aviso (PLANO §4.1). Um objeto por
 * QueryClient: os hooks de api/demandas.ts, os hosts (ContextoAcao, UtilModal) e a ponte da casca usam o mesmo.
 *
 * - mover: previsão local (api/previsao.ts), interceptadores de extensoes/soltar (o primeiro cujo `quando` for true;
 *   card pendente enquanto decide; 'feito' não chama /mover; 'cancelado' devolve em 200 ms), "Movida para X ·
 *   Desfazer" (entre quadros, com as etiquetas que ficaram; o Desfazer volta com etiquetaIds e membroIds de antes);
 * - editar: If-Match com o rev de quem editou; no 409, mescla campo a campo (demanda/mesclar.ts) e manda de novo;
 * - concluir: "Concluída. A próxima fica para sex, 24/10 · Desfazer" (o Desfazer reabre, devolve ao lugar se a
 *   automação moveu e arquiva a repetição, API §5.11).
 * Dentro de um interceptador, `ctx.acoes` é a versão que não intercepta de novo.
 */
import type { QueryClient } from '@tanstack/react-query'
import type {
  ConcluirSaida, ConflitoRevDetalhes, CriarDemandaEntrada, CriarDemandaSaida, DataLocal, Demanda, DemandaDetalhe,
  DemandaSaida, EditarDemandaEntrada, EditarDemandaSaida, Id, MoverEntrada, MoverSaida, PosicaoRelativa,
} from '@shared/tipos/index.ts'
import { formatarPrazo } from '@shared/logica/datas.ts'
import type { AcoesNucleo, ContextoAcao, InterceptadorSoltar, PedidoSoltar, ResultadoSoltar } from '../extensoes/tipos.ts'
import { avisar } from '../ui/avisos.tsx'
import { mesclarEdicao } from '../demanda/mesclar.ts'
import { prepararVolta } from '../quadro/volta.ts'
import {
  aplicarDemandaDoServidor, aplicarPatchDemanda, atualizarDetalhe, bootstrapDe, demandaConhecida, demandaEmCache, inserirDemanda,
  mudarBootstrap, type MutacaoDemanda,
} from './cache.ts'
import { chaves } from './chaves.ts'
import { api, ehErroDaApi, type ErroDaApi } from './cliente.ts'
import { marcarPendente } from './pendentes.ts'
import { CAMPOS_DO_MOVER, cardsDaColuna, lugarAtual, posicaoPorChave, posicaoValida, preverMovimento } from './previsao.ts'

// ─────────────────────────────── avisos de erro (PLANO §4.1) ───────────────────────────────

/** "Não foi possível salvar." [Tentar de novo]; sem permissão: "Você não tem acesso a esta ação." + o motivo. */
export function avisarErro(e: unknown, opcoes: { tentar?: () => unknown; titulo?: string } = {}): void {
  if (e instanceof DOMException && e.name === 'AbortError') return
  const erro = ehErroDaApi(e) ? e : null
  if (erro && (erro.codigo === 'sem_permissao' || erro.codigo === 'campo_nao_permitido')) {
    avisar('Você não tem acesso a esta ação.', { tipo: 'erro', descricao: erro.mensagem })
    return
  }
  const transitorio = !erro || erro.status === 0 || erro.status >= 500
  avisar(opcoes.titulo ?? 'Não foi possível salvar.', {
    tipo: 'erro',
    descricao: erro ? erro.mensagem : 'Tente de novo em instantes.',
    acao: transitorio && opcoes.tentar ? { rotulo: 'Tentar de novo', executar: async () => { await opcoes.tentar!() } } : undefined,
  })
}

// ─────────────────────────────── base da descrição (mescla do 409) ───────────────────────────────

const descricoes = new Map<Id, { rev: number; texto: string }[]>()

/** O detalhe guarda a descrição de cada rev lido; a mescla usa a do rev que a pessoa tinha ao começar a editar. */
export function registrarDescricao(id: Id, rev: number, texto: string): void {
  const lista = (descricoes.get(id) ?? []).filter((x) => x.rev !== rev)
  lista.push({ rev, texto })
  descricoes.set(id, lista.slice(-4))
}

function descricaoBase(qc: QueryClient, id: Id, rev: number): string | null {
  const guardada = descricoes.get(id)?.find((x) => x.rev === rev)
  if (guardada) return guardada.texto
  for (const [chave, det] of qc.getQueriesData<DemandaDetalhe>({ queryKey: ['demanda'] })) {
    if (chave.length === 2 && det?.demanda.id === id && det.demanda.rev === rev) return det.descricaoMd
  }
  return null
}

// ─────────────────────────────── utilitários ───────────────────────────────

function campos<T extends object>(o: T, ks: readonly (keyof T)[]): Partial<T> {
  const saida: Partial<T> = {}
  for (const k of ks) saida[k] = o[k]
  return saida
}

const mesmoConjunto = (a: readonly Id[], b: readonly Id[]) => a.length === b.length && a.every((x) => b.includes(x))
const caminho = (id: Id) => `/api/demandas/${encodeURIComponent(id)}`
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios)

export interface DepsAcoes {
  /** O ContextoAcao de agora (eu, navegação, diálogos, foco), com estas ações. */
  contexto(acoes: AcoesNucleo): ContextoAcao
  interceptadores(): Promise<readonly InterceptadorSoltar[]>
}

interface OpcoesInternas {
  /** Sem o aviso de sucesso (o próprio Desfazer). */
  semAviso?: boolean
  /** A chave de posição de antes (Desfazer): se o vizinho guardado saiu da coluna, o card volta para perto dela. */
  posicaoReserva?: number
}

/** 400 do servidor porque o vizinho de referência não está mais na coluna (API §5.10). */
const vizinhoPerdido = (e: unknown) => ehErroDaApi(e) && e.status === 400 && e.codigo === 'validacao'
  && !!(e.detalhes?.campos as Record<string, unknown> | undefined)?.posicao

export interface AcoesCompletas extends AcoesNucleo {
  criar(e: CriarDemandaEntrada): Promise<CriarDemandaSaida | null>
  /** As mesmas, sem passar pelos interceptadores (o `ctx.acoes` dentro de um interceptador). */
  semInterceptar: AcoesNucleo
}

// ─────────────────────────────── fábrica ───────────────────────────────

export function criarAcoes(qc: QueryClient, deps: DepsAcoes): AcoesCompletas {
  const eu = () => bootstrapDe(qc)?.eu.usuario.id ?? null
  const atualDe = (d: Demanda) => demandaEmCache(qc, d.id) ?? d

  // ─────────── mover ───────────

  async function moverBase(d: Demanda, entrada: MoverEntrada, origem: PedidoSoltar['origem'], interceptar: boolean,
    op: OpcoesInternas = {}): Promise<MoverSaida | null> {
    const b = bootstrapDe(qc)
    if (!b) return null
    const antes = atualDe(d)
    const naColuna = (bx: typeof b) => cardsDaColuna(bx.demandas, entrada.colunaId, antes.id)
    if (entrada.posicao) entrada = { ...entrada, posicao: posicaoValida(naColuna(b), entrada.posicao, op.posicaoReserva ?? null) }
    const prev = preverMovimento(b, antes, entrada, new Date())
    if (!prev) {
      avisar('Esta coluna não está mais no quadro.', { tipo: 'erro' })
      return null
    }
    const quadroDe = b.quadros.find((q) => q.id === prev.de.quadroId)
    const quadroPara = b.quadros.find((q) => q.id === prev.para.quadroId)
    if (!quadroDe || !quadroPara) return null
    const lugarAntes = lugarAtual(b.demandas, antes)
    const reverter = () => {
      prepararVolta(antes.id)
      aplicarPatchDemanda(qc, antes.id, campos(antes, CAMPOS_DO_MOVER))
    }

    aplicarPatchDemanda(qc, antes.id, campos(prev.demanda, CAMPOS_DO_MOVER))
    const mutacao: MutacaoDemanda = { campos: CAMPOS_DO_MOVER, naTela: demandaConhecida(qc, antes.id) }

    let extras: Pick<MoverEntrada, 'etiquetasSemPar' | 'membros'> = {}
    if (interceptar) {
      const pedido: PedidoSoltar = {
        demanda: antes, de: { quadro: quadroDe, coluna: prev.de }, para: { quadro: quadroPara, coluna: prev.para },
        posicao: entrada.posicao ?? {}, origem, entrada,
      }
      const lista = await deps.interceptadores()
      const inter = lista.find((i) => {
        try { return i.quando(pedido, b.eu) } catch (e) { console.error(`[soltar] ${i.id}.quando falhou`, e); return false }
      })
      if (inter) {
        marcarPendente(antes.id, true)
        let r: ResultadoSoltar
        try {
          r = await inter.executar(pedido, deps.contexto(semInterceptar))
        } catch (e) {
          console.error(`[soltar] ${inter.id}.executar falhou`, e)
          avisarErro(e)
          r = { tipo: 'cancelado' }
        } finally {
          marcarPendente(antes.id, false)
        }
        if (r.tipo === 'cancelado') { reverter(); return null }
        if (r.tipo === 'feito') {
          aplicarDemandaDoServidor(qc, r.demanda)
          return { demanda: r.demanda, etiquetasDeixadas: [], etiquetasCriadas: [], proxima: null, avisos: [] }
        }
        extras = r.extras ?? {}
      }
    }

    // os eventos que esperavam o fim do arraste já entraram no cache: o vizinho de referência pode ter saído da coluna
    const posicaoAgora = () => {
      const bx = bootstrapDe(qc)
      return bx ? posicaoValida(naColuna(bx), entrada.posicao, prev.demanda.posicao) : entrada.posicao
    }
    const enviar = (posicao: MoverEntrada['posicao']) =>
      api<MoverSaida>('POST', `${caminho(antes.id)}/mover`, { corpo: { ...entrada, ...extras, posicao } satisfies MoverEntrada })

    try {
      let saida: MoverSaida
      try {
        saida = await enviar(entrada.posicao && posicaoAgora())
      } catch (e) {
        // o vizinho saiu entre a conferência e o servidor: uma tentativa pela chave de posição prevista
        const bx = bootstrapDe(qc)
        if (!entrada.posicao || !vizinhoPerdido(e) || !bx) throw e
        saida = await enviar(posicaoPorChave(naColuna(bx), prev.demanda.posicao))
      }
      aplicarDemandaDoServidor(qc, saida.demanda, mutacao)
      if (saida.proxima) inserirDemanda(qc, saida.proxima)
      if (!op.semAviso && prev.mudaColuna) {
        avisarMovida(antes, saida, { quadroDe: quadroDe.nome, quadroPara: quadroPara.nome, coluna: prev.para.nome, mudaQuadro: prev.mudaQuadro,
          limite: prev.para.limiteWip }, lugarAntes)
      }
      return saida
    } catch (e) {
      reverter()
      avisarErro(e, { tentar: () => moverBase(atualDe(antes), entrada, origem, false, op) })
      return null
    }
  }

  function avisarMovida(antes: Demanda, saida: MoverSaida, nomes: { quadroDe: string; quadroPara: string; coluna: string; mudaQuadro: boolean; limite: number | null },
    lugarAntes: { colunaId: Id; posicao: PosicaoRelativa }) {
    const desfazer = async () => {
      const volta: MoverEntrada = { colunaId: lugarAntes.colunaId, posicao: lugarAntes.posicao }
      if (nomes.mudaQuadro) { volta.etiquetaIds = antes.etiquetaIds; volta.membroIds = antes.membroIds }
      else if (!mesmoConjunto(antes.membroIds, saida.demanda.membroIds)) volta.membroIds = antes.membroIds
      const r = await moverBase(atualDe(saida.demanda), volta, 'menu', false, { semAviso: true, posicaoReserva: antes.posicao })
      if (r && saida.proxima) await arquivarBase(atualDe(saida.proxima), { semAviso: true })
    }
    const detalhes: string[] = []
    if (saida.etiquetasDeixadas.length) {
      const n = saida.etiquetasDeixadas.length
      detalhes.push(`${n} ${plural(n, 'etiqueta ficou', 'etiquetas ficaram')} no quadro ${nomes.quadroDe}.`)
    }
    if (saida.avisos.includes('limite_wip') && nomes.limite !== null) detalhes.push(`A coluna ${nomes.coluna} passou do limite de ${nomes.limite}.`)
    if (saida.proxima?.prazo) {
      avisar(`Concluída. A próxima fica para ${formatarPrazo(saida.proxima.prazo, null)}.`, { tipo: 'sucesso', desfazer, descricao: detalhes.join(' ') || undefined })
      return
    }
    const destino = nomes.mudaQuadro ? `${nomes.quadroPara} › ${nomes.coluna}` : nomes.coluna
    avisar(`Movida para ${destino}`, { desfazer, descricao: detalhes.join(' ') || undefined })
  }

  // ─────────── editar e prazo ───────────

  async function editarBase(d: Demanda, mudancas: EditarDemandaEntrada): Promise<EditarDemandaSaida | null> {
    let base = atualDe(d)
    let baseDescricao = mudancas.descricaoMd !== undefined ? descricaoBase(qc, d.id, d.rev) : null
    const descricaoAntes = baseDescricao
    const { descricaoMd, ...simples } = mudancas
    const otimista: Partial<Demanda> = { ...simples }
    if (mudancas.capaAnexoId) otimista.capaCor = null
    if (mudancas.capaCor) { otimista.capaAnexoId = null; otimista.capaUrl = null }
    if (mudancas.capaAnexoId === null) otimista.capaUrl = null
    const antes = campos(base, Object.keys(otimista) as (keyof Demanda)[])
    aplicarPatchDemanda(qc, d.id, otimista)
    if (descricaoMd !== undefined) atualizarDetalhe(qc, d.id, (det) => ({ ...det, descricaoMd }))
    const camposEditados: (keyof Demanda)[] = [...(Object.keys(otimista) as (keyof Demanda)[]), 'descricaoAtualizadaEm', 'prazo', 'prazoHora']
    let naTela = demandaConhecida(qc, d.id)

    let corpo: EditarDemandaEntrada = mudancas
    let rev = d.rev
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const saida = await api<EditarDemandaSaida>('PATCH', caminho(d.id), { corpo, ifMatch: rev })
        aplicarDemandaDoServidor(qc, saida.demanda, { campos: camposEditados, naTela })
        if (corpo.descricaoMd !== undefined) {
          registrarDescricao(d.id, saida.demanda.rev, corpo.descricaoMd)
          atualizarDetalhe(qc, d.id, (det) => ({ ...det, descricaoMd: corpo.descricaoMd! }))
        }
        if (tentativa > 0) avisar('Alguém mudou esta demanda ao mesmo tempo. Juntamos as mudanças.', { tipo: 'info' })
        if (saida.avisos.includes('senha_detectada')) {
          avisar('Parece que há uma senha no texto.', { tipo: 'aviso', descricao: 'Guarde senhas no cofre e deixe aqui só o caminho ou o link.' })
        }
        return saida
      } catch (e) {
        const erro = e as ErroDaApi
        const atual = ehErroDaApi(e) && erro.codigo === 'conflito_rev' ? (erro.detalhes?.atual as ConflitoRevDetalhes | undefined) : undefined
        if (atual) {
          const mesclado = mesclarEdicao(base, baseDescricao, corpo, atual)
          const semTexto: Partial<Demanda> = { ...mesclado } as Partial<Demanda>
          delete (semTexto as EditarDemandaEntrada).descricaoMd
          inserirDemanda(qc, { ...atual.demanda, ...semTexto })
          naTela = demandaConhecida(qc, d.id)
          registrarDescricao(d.id, atual.demanda.rev, atual.descricaoMd)
          atualizarDetalhe(qc, d.id, (det) => ({ ...det, descricaoMd: mesclado.descricaoMd ?? atual.descricaoMd }))
          if (Object.keys(mesclado).length === 0) {
            avisar('Alguém mudou esta demanda ao mesmo tempo. Juntamos as mudanças.', { tipo: 'info' })
            return { demanda: atual.demanda, avisos: [] }
          }
          base = atual.demanda
          baseDescricao = atual.descricaoMd
          corpo = mesclado
          rev = atual.demanda.rev
          continue
        }
        prepararVolta(d.id)
        aplicarPatchDemanda(qc, d.id, antes)
        if (descricaoMd !== undefined && descricaoAntes !== null) atualizarDetalhe(qc, d.id, (det) => ({ ...det, descricaoMd: descricaoAntes }))
        avisarErro(e, { tentar: () => editarBase(atualDe(d), mudancas) })
        return null
      }
    }
    avisar('Não foi possível salvar.', { tipo: 'erro', descricao: 'A demanda mudou várias vezes seguidas. Abra de novo e confira.' })
    return null
  }

  async function mudarPrazo(d: Demanda, prazo: DataLocal): Promise<Demanda | null> {
    const antes = atualDe(d)
    if (antes.prazo === prazo) return antes
    const saida = await editarBase(antes, { prazo })
    if (!saida) return null
    avisar(`Prazo: ${formatarPrazo(prazo, saida.demanda.prazoHora)}`, {
      desfazer: async () => { await editarBase(atualDe(saida.demanda), { prazo: antes.prazo }) },
    })
    return saida.demanda
  }

  // ─────────── concluir ───────────

  async function concluirBase(d: Demanda, concluida: boolean, op: OpcoesInternas = {}): Promise<ConcluirSaida | null> {
    const b = bootstrapDe(qc)
    const antes = atualDe(d)
    const lugarAntes = b ? lugarAtual(b.demandas, antes) : null
    aplicarPatchDemanda(qc, antes.id, concluida ? { concluidaEm: new Date().toISOString(), concluidaPor: eu() } : { concluidaEm: null, concluidaPor: null })
    const mutacao: MutacaoDemanda = { campos: ['concluidaEm', 'concluidaPor', ...CAMPOS_DO_MOVER], naTela: demandaConhecida(qc, antes.id) }
    try {
      const saida = await api<ConcluirSaida>('POST', `${caminho(antes.id)}/concluir`, { corpo: { concluida } })
      aplicarDemandaDoServidor(qc, saida.demanda, mutacao)
      if (saida.proxima) inserirDemanda(qc, saida.proxima)
      if (concluida && !op.semAviso && (saida.proxima || saida.automacao)) {
        const desfazer = async () => {
          let atual = atualDe(saida.demanda)
          if (saida.automacao && lugarAntes && atual.colunaId !== antes.colunaId) {
            const volta: MoverEntrada = { colunaId: lugarAntes.colunaId, posicao: lugarAntes.posicao }
            if (atual.quadroId !== antes.quadroId) { volta.etiquetaIds = antes.etiquetaIds; volta.membroIds = antes.membroIds }
            const r = await moverBase(atual, volta, 'menu', false, { semAviso: true, posicaoReserva: antes.posicao })
            if (!r) return
            atual = r.demanda
          }
          if (atual.concluidaEm) await concluirBase(atual, false, { semAviso: true })
          if (saida.proxima) await arquivarBase(atualDe(saida.proxima), { semAviso: true })
        }
        const b2 = bootstrapDe(qc)
        const col = b2?.colunas.find((c) => c.id === saida.demanda.colunaId)
        const q = b2?.quadros.find((x) => x.id === saida.demanda.quadroId)
        const moveu = saida.automacao && col && q ? ` Movida para ${q.id !== antes.quadroId ? `${q.nome} › ` : ''}${col.nome}.` : ''
        const proxima = saida.proxima?.prazo ? ` A próxima fica para ${formatarPrazo(saida.proxima.prazo, null)}.` : ''
        avisar(`Concluída.${proxima}${moveu}`, { tipo: 'sucesso', desfazer })
      }
      return saida
    } catch (e) {
      prepararVolta(antes.id)
      aplicarPatchDemanda(qc, antes.id, { concluidaEm: antes.concluidaEm, concluidaPor: antes.concluidaPor })
      avisarErro(e, { tentar: () => concluirBase(atualDe(antes), concluida, op) })
      return null
    }
  }

  // ─────────── membros e etiquetas ───────────

  async function conjunto(d: Demanda, campo: 'membroIds' | 'etiquetaIds', id: Id, por: boolean): Promise<Demanda | null> {
    const antes = atualDe(d)
    const lista = antes[campo]
    if (por === lista.includes(id)) return antes
    aplicarPatchDemanda(qc, antes.id, { [campo]: por ? [...lista, id] : lista.filter((x) => x !== id) })
    const mutacao: MutacaoDemanda = { campos: [campo], naTela: demandaConhecida(qc, antes.id) }
    const rota = campo === 'membroIds' ? 'membros' : 'etiquetas'
    try {
      const saida = por
        ? await api<DemandaSaida>('POST', `${caminho(antes.id)}/${rota}`, { corpo: campo === 'membroIds' ? { usuarioId: id } : { etiquetaId: id } })
        : await api<DemandaSaida>('DELETE', `${caminho(antes.id)}/${rota}/${encodeURIComponent(id)}`)
      aplicarDemandaDoServidor(qc, saida.demanda, mutacao)
      return saida.demanda
    } catch (e) {
      // volta só este item (outra pessoa pode ter mexido no resto do conjunto)
      const agora = atualDe(antes)[campo]
      aplicarPatchDemanda(qc, antes.id, { [campo]: por ? agora.filter((x) => x !== id) : [...agora, id] })
      avisarErro(e, { tentar: () => conjunto(atualDe(antes), campo, id, por) })
      return null
    }
  }

  // ─────────── arquivar e restaurar ───────────

  async function arquivarBase(d: Demanda, op: OpcoesInternas = {}): Promise<Demanda | null> {
    const antes = atualDe(d)
    if (antes.arquivadoEm) return antes
    aplicarPatchDemanda(qc, antes.id, { arquivadoEm: new Date().toISOString() })
    try {
      const saida = await api<DemandaSaida>('POST', `${caminho(antes.id)}/arquivar`)
      aplicarDemandaDoServidor(qc, saida.demanda)
      // o servidor para o cronômetro ligado nela; o evento do apontamento é eco (ignorado)
      mudarBootstrap(qc, (b) => (b.eu.cronometro?.demandaId === antes.id ? { ...b, eu: { ...b.eu, cronometro: null } } : b))
      if (!op.semAviso) avisar('Arquivada', { desfazer: async () => { await restaurarBase(saida.demanda, antes.colunaId, { semAviso: true }) } })
      return saida.demanda
    } catch (e) {
      inserirDemanda(qc, antes)
      avisarErro(e, { tentar: () => arquivarBase(antes, op) })
      return null
    }
  }

  async function restaurarBase(d: Demanda, colunaId?: Id, op: OpcoesInternas = {}): Promise<Demanda | null> {
    try {
      const saida = await api<DemandaSaida>('POST', `${caminho(d.id)}/restaurar`, { corpo: colunaId ? { colunaId } : {} })
      inserirDemanda(qc, saida.demanda)
      if (!op.semAviso) avisar('Restaurada', { tipo: 'sucesso' })
      return saida.demanda
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível restaurar.' })
      return null
    }
  }

  // ─────────── criar ───────────

  async function criar(e: CriarDemandaEntrada): Promise<CriarDemandaSaida | null> {
    try {
      const saida = await api<CriarDemandaSaida>('POST', '/api/demandas', { corpo: e })
      inserirDemanda(qc, saida.demanda)
      if (saida.avisos.includes('senha_detectada')) {
        avisar('Parece que há uma senha no texto.', { tipo: 'aviso', descricao: 'Guarde senhas no cofre e deixe aqui só o caminho ou o link.' })
      }
      return saida
    } catch (erro) {
      avisarErro(erro, { titulo: 'Não foi possível criar a demanda.' })
      return null
    }
  }

  // ─────────── montagem ───────────

  function montar(interceptar: boolean): AcoesNucleo {
    return {
      mover: (d, entrada, origem) => moverBase(d, entrada, origem, interceptar),
      editar: editarBase,
      mudarPrazo,
      concluir: (d, concluida) => concluirBase(d, concluida),
      membros: { entrar: (d, u) => conjunto(d, 'membroIds', u, true), sair: (d, u) => conjunto(d, 'membroIds', u, false) },
      etiquetas: { por: (d, e) => conjunto(d, 'etiquetaIds', e, true), tirar: (d, e) => conjunto(d, 'etiquetaIds', e, false) },
      arquivar: (d) => arquivarBase(d),
      restaurar: (d, colunaId) => restaurarBase(d, colunaId),
    }
  }

  const semInterceptar = montar(false)
  return { ...montar(true), criar, semInterceptar }
}

// ─────────────────────────────── uma por QueryClient ───────────────────────────────

const porCliente = new WeakMap<QueryClient, AcoesCompletas>()
let depsPadrao: DepsAcoes | null = null

/** O host de diálogos registra como montar o ContextoAcao (eu, navegação, foco) e de onde vêm os interceptadores. */
export function definirDepsAcoes(d: DepsAcoes): void {
  depsPadrao = d
}

export function acoesDe(qc: QueryClient): AcoesCompletas {
  let a = porCliente.get(qc)
  if (!a) {
    a = criarAcoes(qc, {
      contexto: (acoes) => {
        if (!depsPadrao) throw new Error('acoesDe: o host de diálogos ainda não montou.')
        return depsPadrao.contexto(acoes)
      },
      interceptadores: () => (depsPadrao ? depsPadrao.interceptadores() : Promise.resolve([])),
    })
    porCliente.set(qc, a)
  }
  return a
}

/** Lê o detalhe do cache (o modal abre do cache e espera só o que falta). */
export function detalheEmCache(qc: QueryClient, numero: number): DemandaDetalhe | undefined {
  return qc.getQueryData<DemandaDetalhe>(chaves.detalhe(numero))
}
