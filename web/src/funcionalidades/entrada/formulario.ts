/**
 * Regras puras da Nova demanda (sem React; os testes do servidor importam): quadro e coluna de partida, modelos do
 * quadro, membro sugerido pelo cliente, prazo do modelo, estimativa digitada ("1h30"), a descrição automática
 * (briefing do modelo + o trecho do WhatsApp) e o corpo de POST /api/demandas.
 */
import type {
  ClienteResumo, Coluna, CriarDemandaEntrada, DataLocal, HoraLocal, Id, ModeloDemanda, Prioridade, Quadro, Repeticao,
} from '../../../../shared/tipos/index.ts'
import { prazoDoModelo } from '../../../../shared/logica/prazo.ts'
import { colunaDeEntrada } from '../../../../shared/logica/quadro.ts'

/**
 * Quadro de partida: o pedido; senão o aberto; senão o último usado no aparelho; senão o primeiro favorito; senão o
 * da minha equipe (o que sigo primeiro); senão um que sigo; senão o primeiro do menu. Assim, no primeiro dia ou num
 * celular novo, a demanda de um designer nasce na Criação, não no Atendimento (o primeiro por posição).
 */
export function quadroInicial(quadros: readonly Quadro[], p: {
  pedido?: Id | null; aberto?: Id | null; ultimo?: Id | null; favoritos?: readonly Id[]; seguindo?: readonly Id[]; equipeIds?: readonly Id[]
}): Quadro | null {
  const ativos = [...quadros.filter((q) => q.arquivadoEm === null)].sort((a, b) => a.pos - b.pos)
  const achar = (id: Id | null | undefined) => (id ? ativos.find((q) => q.id === id) : undefined)
  const seguindo = new Set(p.seguindo ?? [])
  const daEquipe = (p.equipeIds ?? []).flatMap((e) => ativos.filter((q) => q.equipeId === e))
  return achar(p.pedido) ?? achar(p.aberto) ?? achar(p.ultimo) ?? (p.favoritos ?? []).map(achar).find(Boolean)
    ?? daEquipe.find((q) => seguindo.has(q.id)) ?? daEquipe[0] ?? ativos.find((q) => seguindo.has(q.id)) ?? ativos[0] ?? null
}

/** Coluna de partida: a pedida (se é deste quadro e está ativa); senão a coluna de entrada. */
export function colunaInicial(colunas: readonly Coluna[], quadroId: Id, pedida?: Id | null): Coluna | null {
  const doQuadro = colunas.filter((c) => c.quadroId === quadroId && c.arquivadaEm === null).sort((a, b) => a.pos - b.pos)
  return doQuadro.find((c) => c.id === pedida) ?? colunaDeEntrada(doQuadro, quadroId)
}

/** Modelos que valem no quadro: globais primeiro, depois os do quadro; ativos, em ordem. */
export function modelosDoQuadro(modelos: readonly ModeloDemanda[], quadroId: Id | null): ModeloDemanda[] {
  return modelos
    .filter((m) => m.ativo && (m.quadroId === null || m.quadroId === quadroId))
    .sort((a, b) => (a.quadroId === null ? 0 : 1) - (b.quadroId === null ? 0 : 1) || a.pos - b.pos)
}

/** O responsável do cliente na equipe do quadro ("na Criação, o HE é do Rafa"), se for uma pessoa ativa. */
export function membroSugerido(cliente: Pick<ClienteResumo, 'responsaveis'> | null, quadro: Pick<Quadro, 'equipeId'> | null,
  ativos: ReadonlySet<Id>): Id | null {
  if (!cliente || !quadro?.equipeId) return null
  const r = cliente.responsaveis.find((x) => x.equipeId === quadro.equipeId)
  return r && ativos.has(r.usuarioId) ? r.usuarioId : null
}

/** Prazo que o modelo sugere (hoje + dias úteis) ou null. */
export function prazoSugerido(modelo: Pick<ModeloDemanda, 'prazoDiasUteis'> | null, hoje: DataLocal, feriados: ReadonlySet<string>): DataLocal | null {
  return modelo ? prazoDoModelo(hoje, modelo.prazoDiasUteis, feriados) : null
}

/** "1h30", "1:30", "90", "90min", "2h", "1,5h" → minutos; vazio → null; inválido → undefined. */
export function minutosDeTexto(texto: string): number | null | undefined {
  const t = texto.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  let m: RegExpExecArray | null
  if ((m = /^(\d{1,4})(?:m|min|mins|minutos?)?$/.exec(t))) return Number(m[1]) || undefined
  if ((m = /^(\d{1,3})(?:[.,](\d{1,2}))?h(?:oras?)?$/.exec(t))) {
    return Math.round((Number(m[1]) + (m[2] ? Number(`0.${m[2]}`) : 0)) * 60) || undefined
  }
  if ((m = /^(\d{1,3})(?:h|:)(\d{1,2})(?:m|min)?$/.exec(t)) && Number(m[2]) < 60) return Number(m[1]) * 60 + Number(m[2]) || undefined
  return undefined
}

/** 90 → "1h30"; 45 → "45 min"; 120 → "2h". */
export function textoDeMinutos(min: number | null): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const r = min % 60
  if (h === 0) return `${r} min`
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`
}

/** A descrição que a Nova demanda escreve sozinha: o briefing do modelo e, embaixo, o pedido colado do WhatsApp. */
export function descricaoAutomatica(modelo: Pick<ModeloDemanda, 'briefingMd'> | null, trechoWhatsapp: string): string {
  return [modelo?.briefingMd.trim() ?? '', trechoWhatsapp.trim()].filter(Boolean).join('\n\n')
}

export interface EstadoNovaDemanda {
  quadroId: Id
  colunaId: Id
  titulo: string
  modeloId: Id | null
  clienteId: Id | null
  membroIds: Id[]
  /** null = não mexeu: o servidor aplica as etiquetas padrão do modelo (por nome). */
  etiquetaIds: Id[] | null
  descricaoMd: string
  prioridade: Prioridade
  inicio: DataLocal | null
  prazo: DataLocal | null
  prazoHora: HoraLocal | null
  publicacaoData: DataLocal | null
  publicacaoHora: HoraLocal | null
  estimativaMin: number | null
  repetir: Repeticao
  /** undefined = não mexeu (o servidor põe o AM do cliente); só atendimento e admin mandam. */
  atendimentoId?: Id | null
  origemTexto: string | null
}

/** O corpo de POST /api/demandas. A pessoa da coluna o servidor põe sozinho. */
export function entradaDaNovaDemanda(e: EstadoNovaDemanda, opcoes: { podeAm: boolean; responsavelDaColuna: Id | null }): CriarDemandaEntrada {
  const corpo: CriarDemandaEntrada = {
    quadroId: e.quadroId,
    colunaId: e.colunaId,
    titulo: e.titulo.trim(),
    modeloId: e.modeloId,
    clienteId: e.clienteId,
    membroIds: e.membroIds.filter((id) => id !== opcoes.responsavelDaColuna),
    descricaoMd: e.descricaoMd,
    prioridade: e.prioridade,
    inicio: e.inicio,
    prazo: e.prazo,
    prazoHora: e.prazo ? e.prazoHora : null,
    publicacaoData: e.publicacaoData,
    publicacaoHora: e.publicacaoData ? e.publicacaoHora : null,
    estimativaMin: e.estimativaMin,
    repetir: e.prazo ? e.repetir : 'nenhuma',
  }
  if (e.etiquetaIds !== null) corpo.etiquetaIds = e.etiquetaIds
  if (opcoes.podeAm && e.atendimentoId !== undefined) corpo.atendimentoId = e.atendimentoId
  if (e.origemTexto) {
    corpo.origemTexto = e.origemTexto
    corpo.origem = 'whatsapp'
  }
  return corpo
}

/** O que impede criar, na ordem em que a pessoa resolve (null = pode). */
export function motivoParaNaoCriar(e: Pick<EstadoNovaDemanda, 'titulo' | 'quadroId' | 'colunaId' | 'inicio' | 'prazo'>): string | null {
  if (!e.quadroId) return 'Escolha o quadro.'
  if (!e.colunaId) return 'Este quadro ainda não tem colunas.'
  if (!e.titulo.trim()) return 'Escreva um título.'
  if (e.inicio && e.prazo && e.inicio > e.prazo) return 'O início vem depois do prazo.'
  return null
}
