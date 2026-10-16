/**
 * Dados e mutações do modal (F1, API.md §4.15). Consultas: comentários e histórico (chaves da PLANO §2.1). Mutações
 * num objeto por QueryClient (`acoesModal(qc)`, como o `acoesDe` do núcleo): as frequentes (marcar item, editar item,
 * reordenar) aplicam na hora e voltam com aviso no erro; as que criam algo esperam a resposta. Toda resposta atualiza o
 * cache aqui (o evento do meu trace é eco e o tempo real o ignora).
 */
import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  Anexo, Apontamento, Atividade, Checklist, ChecklistComItens, ChecklistItem, Comentario, ComentarioSaida,
  CopiarDemandaEntrada, CriarAnexoEntrada, CriarApontamentoEntrada, CriarDemandaSaida, CronometroSaida, Demanda, Id,
  Pagina, PosicaoRelativa,
} from '@shared/tipos/index.ts'
import { entre } from '@shared/logica/posicao.ts'
import { formatarDuracao } from '@shared/logica/modal-texto.ts'
import { avisarErro } from '../../api/acoes.ts'
import { enviarArquivo } from '../../api/arquivos.ts'
import { aplicarPatchDemanda, atualizarDetalhe, bootstrapDe, demandaConhecida, inserirDemanda } from '../../api/cache.ts'
import { chaves } from '../../api/chaves.ts'
import { api, comConsulta, type ErroDaApi } from '../../api/cliente.ts'
import { navegar } from '../../dialogos/estado.ts'
import { avisar } from '../../ui/avisos.tsx'
import {
  comAnexo, comChecklist, comComentario, comItem, definirCronometro, detalheDe, mudarComentarios, mudarDetalhe,
  semAnexo, semChecklist, semItem,
} from './cache.ts'

const de = (id: Id) => `/api/demandas/${encodeURIComponent(id)}`
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

// ─────────────────────────────── consultas ───────────────────────────────

export function useComentarios(demandaId: Id) {
  return useQuery<Comentario[], ErroDaApi>({
    queryKey: chaves.comentarios(demandaId),
    queryFn: ({ signal }) => api<Comentario[]>('GET', `${de(demandaId)}/comentarios`, { sinal: signal }),
    staleTime: 30_000,
  })
}

export function useHistorico(demandaId: Id, ativo = true) {
  return useInfiniteQuery<Pagina<Atividade>, ErroDaApi>({
    queryKey: chaves.historico(demandaId),
    queryFn: ({ pageParam, signal }) => api<Pagina<Atividade>>('GET',
      comConsulta(`${de(demandaId)}/historico`, { cursor: pageParam as string | undefined, limite: 40 }), { sinal: signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.proximo ?? undefined,
    staleTime: 15_000,
    enabled: ativo,
  })
}

// ─────────────────────────────── mutações ───────────────────────────────

/** Item como está no cache agora (o objeto da tela pode ser de um render antigo). */
function itemAtual(qc: QueryClient, i: ChecklistItem): ChecklistItem {
  return detalheDe(qc, i.demandaId)?.checklists.flatMap((c) => c.itens).find((x) => x.id === i.id) ?? i
}

/** A chave local de uma posição relativa dentro de uma lista ordenada (a mesma conta do servidor). */
export function chaveLocal<T extends { id: Id; pos: number }>(lista: readonly T[], rel: PosicaoRelativa, excluir: Id): number {
  const outros = lista.filter((x) => x.id !== excluir)
  if (rel.depoisDeId === null) return entre(null, outros[0]?.pos ?? null)
  if (rel.depoisDeId) {
    const i = outros.findIndex((x) => x.id === rel.depoisDeId)
    return entre(outros[i]?.pos ?? null, outros[i + 1]?.pos ?? null)
  }
  if (rel.antesDeId) {
    const i = outros.findIndex((x) => x.id === rel.antesDeId)
    return entre(outros[i - 1]?.pos ?? null, outros[i]?.pos ?? null)
  }
  return entre(outros.at(-1)?.pos ?? null, null)
}

function criarAcoes(qc: QueryClient) {
  // ─────────── checklists ───────────

  async function criarChecklist(d: Demanda, titulo: string, itens: string[] = []): Promise<ChecklistComItens | null> {
    try {
      const c = await api<ChecklistComItens>('POST', `${de(d.id)}/checklists`, { corpo: { titulo, itens } })
      mudarDetalhe(qc, d.id, (det) => comChecklist(det, c))
      return c
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível criar o checklist.' })
      return null
    }
  }

  async function editarChecklist(c: Checklist, mudancas: { titulo?: string; posicao?: PosicaoRelativa; posLocal?: number }): Promise<boolean> {
    const det = detalheDe(qc, c.demandaId)
    const antes = det?.checklists.find((x) => x.id === c.id)
    const otimista: Partial<Checklist> = {}
    if (mudancas.titulo !== undefined) otimista.titulo = mudancas.titulo
    if (mudancas.posLocal !== undefined) otimista.pos = mudancas.posLocal
    if (antes) mudarDetalhe(qc, c.demandaId, (x) => comChecklist(x, { ...antes, ...otimista, itens: antes.itens }))
    try {
      const salvo = await api<ChecklistComItens>('PATCH', `/api/checklists/${encodeURIComponent(c.id)}`,
        { corpo: { titulo: mudancas.titulo, posicao: mudancas.posicao } })
      mudarDetalhe(qc, c.demandaId, (x) => comChecklist(x, salvo))
      return true
    } catch (e) {
      if (antes) mudarDetalhe(qc, c.demandaId, (x) => comChecklist(x, antes))
      avisarErro(e, { tentar: () => editarChecklist(c, mudancas) })
      return false
    }
  }

  async function excluirChecklist(c: ChecklistComItens): Promise<boolean> {
    mudarDetalhe(qc, c.demandaId, (x) => semChecklist(x, c.id))
    try {
      await api<void>('DELETE', `/api/checklists/${encodeURIComponent(c.id)}`)
      avisar(`Checklist “${c.titulo}” apagado.`)
      return true
    } catch (e) {
      mudarDetalhe(qc, c.demandaId, (x) => comChecklist(x, c))
      avisarErro(e, { titulo: 'Não foi possível apagar o checklist.' })
      return false
    }
  }

  async function criarItens(c: Checklist, textos: string[], posicao?: PosicaoRelativa): Promise<ChecklistItem[] | null> {
    try {
      const itens = await api<ChecklistItem[]>('POST', `/api/checklists/${encodeURIComponent(c.id)}/itens`, { corpo: { textos, posicao } })
      mudarDetalhe(qc, c.demandaId, (det) => itens.reduce(comItem, det))
      return itens
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível adicionar o item.' })
      return null
    }
  }

  async function editarItem(i: ChecklistItem, mudancas: { texto?: string; feito?: boolean; posicao?: PosicaoRelativa; posLocal?: number },
    euId: Id | null): Promise<ChecklistItem | null> {
    const antes = itemAtual(qc, i)
    const otimista: ChecklistItem = { ...antes }
    if (mudancas.texto !== undefined) otimista.texto = mudancas.texto
    if (mudancas.feito !== undefined) {
      otimista.feitoEm = mudancas.feito ? new Date().toISOString() : null
      otimista.feitoPor = mudancas.feito ? euId : null
    }
    if (mudancas.posLocal !== undefined) otimista.pos = mudancas.posLocal
    mudarDetalhe(qc, i.demandaId, (det) => comItem(det, otimista))
    try {
      const salvo = await api<ChecklistItem>('PATCH', `/api/checklist-itens/${encodeURIComponent(i.id)}`,
        { corpo: { texto: mudancas.texto, feito: mudancas.feito, posicao: mudancas.posicao } })
      mudarDetalhe(qc, i.demandaId, (det) => comItem(det, salvo))
      return salvo
    } catch (e) {
      mudarDetalhe(qc, i.demandaId, (det) => comItem(det, antes))
      avisarErro(e, { tentar: () => editarItem(itemAtual(qc, i), mudancas, euId) })
      return null
    }
  }

  async function excluirItem(i: ChecklistItem, euId: Id | null): Promise<boolean> {
    const det = detalheDe(qc, i.demandaId)
    const c = det?.checklists.find((x) => x.id === i.checklistId)
    const anterior = c ? c.itens[c.itens.findIndex((x) => x.id === i.id) - 1] : undefined
    mudarDetalhe(qc, i.demandaId, (x) => semItem(x, i.id))
    try {
      await api<void>('DELETE', `/api/checklist-itens/${encodeURIComponent(i.id)}`)
      avisar('Item apagado', {
        desfazer: async () => {
          if (!c) return
          const [novo] = (await criarItens(c, [i.texto], { depoisDeId: anterior?.id ?? null })) ?? []
          if (novo && i.feitoEm) await editarItem(novo, { feito: true }, euId)
        },
      })
      return true
    } catch (e) {
      mudarDetalhe(qc, i.demandaId, (x) => comItem(x, i))
      avisarErro(e, { titulo: 'Não foi possível apagar o item.' })
      return false
    }
  }

  // ─────────── anexos ───────────

  async function criarAnexo(d: Demanda, e: CriarAnexoEntrada, silencioso = false): Promise<Anexo | null> {
    try {
      const a = await api<Anexo>('POST', `${de(d.id)}/anexos`, { corpo: e })
      mudarDetalhe(qc, d.id, (det) => comAnexo(det, a))
      return a
    } catch (erro) {
      if (!silencioso) avisarErro(erro, { titulo: 'Não foi possível anexar.' })
      else throw erro
      return null
    }
  }

  /** Envia os arquivos (até 10 MB cada) e anexa à demanda, na ordem; devolve os anexos criados. */
  async function enviarArquivos(d: Demanda, arquivos: File[]): Promise<Anexo[]> {
    if (arquivos.length === 0) return []
    const id = avisar(arquivos.length === 1 ? `Enviando ${arquivos[0]!.name || 'o arquivo'}…` : `Enviando ${arquivos.length} arquivos…`,
      { duracao: 60_000 })
    const feitos: Anexo[] = []
    const falhas: string[] = []
    for (const f of arquivos) {
      try {
        const info = await enviarArquivo(f)
        const a = await criarAnexo(d, { tipo: 'arquivo', arquivoId: info.id, nome: f.name || info.nome }, true)
        if (a) feitos.push(a)
      } catch (e) {
        const erro = e as ErroDaApi
        falhas.push(erro?.codigo === 'arquivo_grande' ? `${f.name}: passa de 10 MB`
          : erro?.codigo === 'tipo_arquivo' ? `${f.name}: use imagem, PDF ou ZIP` : `${f.name}: ${erro?.mensagem ?? 'falhou'}`)
      }
    }
    if (falhas.length) avisar(feitos.length ? `${plural(feitos.length, 'arquivo anexado', 'arquivos anexados')}; ${falhas.length} não.` : 'Não foi possível anexar.',
      { id, tipo: 'erro', descricao: falhas.join(' · ') })
    else avisar(feitos.length === 1 ? 'Arquivo anexado.' : `${feitos.length} arquivos anexados.`, { id, tipo: 'sucesso', duracao: 3000 })
    return feitos
  }

  async function renomearAnexo(a: Anexo, nome: string): Promise<boolean> {
    mudarDetalhe(qc, a.demandaId, (det) => comAnexo(det, { ...a, nome }))
    try {
      const salvo = await api<Anexo>('PATCH', `/api/anexos/${encodeURIComponent(a.id)}`, { corpo: { nome } })
      mudarDetalhe(qc, a.demandaId, (det) => comAnexo(det, salvo))
      return true
    } catch (e) {
      mudarDetalhe(qc, a.demandaId, (det) => comAnexo(det, a))
      avisarErro(e, { tentar: () => renomearAnexo(a, nome) })
      return false
    }
  }

  async function excluirAnexo(a: Anexo): Promise<boolean> {
    const d = demandaConhecida(qc, a.demandaId)
    const eraCapa = d?.capaAnexoId === a.id
    mudarDetalhe(qc, a.demandaId, (det) => semAnexo(det, a.id))
    if (eraCapa) aplicarPatchDemanda(qc, a.demandaId, { capaAnexoId: null, capaUrl: null })
    try {
      await api<void>('DELETE', `/api/anexos/${encodeURIComponent(a.id)}`)
      avisar(`Anexo “${a.nome}” removido.`)
      return true
    } catch (e) {
      mudarDetalhe(qc, a.demandaId, (det) => comAnexo(det, a))
      if (eraCapa && d) aplicarPatchDemanda(qc, a.demandaId, { capaAnexoId: d.capaAnexoId, capaUrl: d.capaUrl })
      avisarErro(e, { titulo: 'Não foi possível remover o anexo.' })
      return false
    }
  }

  // ─────────── comentários ───────────

  function avisosDoComentario(s: ComentarioSaida) {
    if (s.avisos.includes('senha_detectada')) {
      avisar('Parece que há uma senha no comentário.', { tipo: 'aviso', descricao: 'Guarde senhas no cofre e deixe aqui só o caminho ou o link.' })
    }
  }

  async function comentar(d: Demanda, corpoMd: string, opcoes: { visivelCliente?: boolean; anexoIds?: Id[] } = {}): Promise<Comentario | null> {
    try {
      const s = await api<ComentarioSaida>('POST', `${de(d.id)}/comentarios`, { corpo: { corpoMd, ...opcoes } })
      mudarComentarios(qc, d.id, (l) => comComentario(l, s.comentario), 1)
      for (const a of s.comentario.anexos) mudarDetalhe(qc, d.id, (det) => comAnexo(det, a))
      avisosDoComentario(s)
      return s.comentario
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível comentar.' })
      return null
    }
  }

  async function editarComentario(c: Comentario, corpoMd: string): Promise<Comentario | null> {
    mudarComentarios(qc, c.demandaId, (l) => comComentario(l, { ...c, corpoMd, editadoEm: new Date().toISOString() }))
    try {
      const s = await api<ComentarioSaida>('PATCH', `/api/comentarios/${encodeURIComponent(c.id)}`, { corpo: { corpoMd } })
      mudarComentarios(qc, c.demandaId, (l) => comComentario(l, s.comentario))
      avisosDoComentario(s)
      return s.comentario
    } catch (e) {
      mudarComentarios(qc, c.demandaId, (l) => comComentario(l, c))
      avisarErro(e, { titulo: 'Não foi possível salvar o comentário.' })
      return null
    }
  }

  async function excluirComentario(c: Comentario): Promise<boolean> {
    mudarComentarios(qc, c.demandaId, (l) => comComentario(l, { ...c, corpoMd: '', excluidoEm: new Date().toISOString(), anexos: [] }), -1)
    try {
      await api<void>('DELETE', `/api/comentarios/${encodeURIComponent(c.id)}`)
      avisar('Comentário excluído.')
      return true
    } catch (e) {
      mudarComentarios(qc, c.demandaId, (l) => comComentario(l, c), 1)
      avisarErro(e, { titulo: 'Não foi possível excluir o comentário.' })
      return false
    }
  }

  // ─────────── copiar ───────────

  async function copiar(d: Demanda, e: CopiarDemandaEntrada): Promise<CriarDemandaSaida | null> {
    try {
      const s = await api<CriarDemandaSaida>('POST', `${de(d.id)}/copiar`, { corpo: e })
      inserirDemanda(qc, s.demanda)
      avisar(`Cópia criada: #${s.demanda.numero}`, { tipo: 'sucesso', acao: { rotulo: 'Abrir', executar: () => navegar(`/d/${s.demanda.numero}`) } })
      return s
    } catch (erro) {
      avisarErro(erro, { titulo: 'Não foi possível copiar a demanda.' })
      return null
    }
  }

  // ─────────── tempo ───────────

  /** O tempo da demanda antes da chamada (o retrato que somarMeus usa). */
  function retratoTempo(demandaId: Id | null | undefined) {
    if (!demandaId) return null
    const det = detalheDe(qc, demandaId)
    return {
      demandaId, registrados: demandaConhecida(qc, demandaId)?.minutosRegistrados ?? null,
      total: det?.tempo.totalMin ?? null, meus: det?.tempo.meusMin ?? null,
    }
  }

  /**
   * Soma os minutos meus à demanda e ao detalhe aberto a partir do retrato de antes da chamada. O evento da demanda
   * (minutosRegistrados absoluto, sem trace, que não é eco) pode chegar antes da resposta: somar ao valor da hora
   * contava os minutos duas vezes ("Total 6 min · meu 3 min" com 3 gravados).
   */
  function somarMeus(demandaId: Id, minutos: number, antes: ReturnType<typeof retratoTempo>) {
    const base = antes?.demandaId === demandaId ? antes : null
    const mais = (atual: number, deAntes: number | null | undefined) => (deAntes == null ? atual + minutos : Math.max(atual, deAntes + minutos))
    atualizarDetalhe(qc, demandaId, (det) => ({
      ...det, tempo: { totalMin: mais(det.tempo.totalMin, base?.total), meusMin: mais(det.tempo.meusMin, base?.meus) },
    }))
    const d = demandaConhecida(qc, demandaId)
    if (d) aplicarPatchDemanda(qc, demandaId, { minutosRegistrados: mais(d.minutosRegistrados, base?.registrados) })
  }

  function avisarParado(parado: Apontamento, avisos: CronometroSaida['avisos'], ligouOutro: boolean) {
    const numero = demandaConhecida(qc, parado.demandaId)?.numero
    const onde = numero ? ` em #${numero}` : ''
    const texto = ligouOutro ? `O cronômetro anterior parou com ${formatarDuracao(parado.minutos ?? 0)}${onde}.`
      : `Cronômetro parado: ${formatarDuracao(parado.minutos ?? 0)}${onde}.`
    avisar(texto, avisos.includes('cronometro_longo')
      ? { tipo: 'aviso', descricao: 'Passou do limite do dia: gravamos o limite. Confira em Horas.' }
      : { tipo: 'sucesso', duracao: 3500 })
  }

  async function iniciarCronometro(d: Demanda): Promise<CronometroSaida | null> {
    let anterior: Apontamento | null = null
    const provisorio: Apontamento = {
      id: `provisorio-${d.id}`, usuarioId: '', demandaId: d.id, clienteId: d.clienteId, data: '', minutos: null,
      iniciadoEm: new Date().toISOString(), paradoEm: null, origem: 'cronometro', nota: null, criadoEm: new Date().toISOString(),
    }
    const antes = retratoTempo(bootstrapDe(qc)?.eu.cronometro?.demandaId)
    definirCronometro(qc, (atual, euId) => { anterior = atual; return { ...provisorio, usuarioId: euId } })
    try {
      const s = await api<CronometroSaida>('POST', `${de(d.id)}/cronometro`)
      definirCronometro(qc, () => s.ativo)
      if (s.parado) {
        somarMeus(s.parado.demandaId, s.parado.minutos ?? 0, antes)
        avisarParado(s.parado, s.avisos, true)
      }
      return s
    } catch (e) {
      definirCronometro(qc, () => anterior)
      avisarErro(e, { titulo: 'Não foi possível ligar o cronômetro.' })
      return null
    }
  }

  async function pararCronometro(): Promise<CronometroSaida | null> {
    let anterior: Apontamento | null = null
    const antes = retratoTempo(bootstrapDe(qc)?.eu.cronometro?.demandaId)
    definirCronometro(qc, (atual) => { anterior = atual; return null })
    try {
      const s = await api<CronometroSaida>('POST', '/api/cronometro/parar')
      if (s.parado) {
        somarMeus(s.parado.demandaId, s.parado.minutos ?? 0, antes)
        avisarParado(s.parado, s.avisos, false)
      }
      return s
    } catch (e) {
      definirCronometro(qc, () => anterior)
      avisarErro(e, { titulo: 'Não foi possível parar o cronômetro.' })
      return null
    }
  }

  async function lancarTempo(d: Demanda, e: CriarApontamentoEntrada): Promise<Apontamento | null> {
    const antes = retratoTempo(d.id)
    try {
      const a = await api<Apontamento>('POST', `${de(d.id)}/apontamentos`, { corpo: e })
      somarMeus(d.id, a.minutos ?? 0, antes)
      avisar(`${formatarDuracao(a.minutos ?? 0)} lançados em #${d.numero}.`, { tipo: 'sucesso' })
      return a
    } catch (erro) {
      avisarErro(erro, { titulo: 'Não foi possível lançar o tempo.' })
      return null
    }
  }

  return {
    criarChecklist, editarChecklist, excluirChecklist, criarItens, editarItem, excluirItem,
    criarAnexo, enviarArquivos, renomearAnexo, excluirAnexo,
    comentar, editarComentario, excluirComentario, copiar,
    iniciarCronometro, pararCronometro, lancarTempo,
  }
}

export type AcoesModal = ReturnType<typeof criarAcoes>

const porCliente = new WeakMap<QueryClient, AcoesModal>()

export function acoesModal(qc: QueryClient): AcoesModal {
  let a = porCliente.get(qc)
  if (!a) {
    a = criarAcoes(qc)
    porCliente.set(qc, a)
  }
  return a
}

export function useAcoesModal(): AcoesModal {
  return acoesModal(useQueryClient())
}

