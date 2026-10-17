/**
 * Regras de tela do ciclo da peça (F2), puras: em que passo a peça está, quais ações aparecem e qual é o primário
 * laranja do modal (sem versão → Entregar; versão não enviada → Enviar; envio pendente → Registrar retorno; depois de
 * um ajuste → Entregar de novo), o selo do card e os textos curtos. Testadas no Node (server/test/ciclo-web-logica):
 * por isso só caminhos relativos para shared e `import type`.
 */
import type { Aprovacao, Envio, Rodada, VersaoComItens } from '../../../../shared/tipos/ciclo.ts'
import type { Demanda, DemandaDetalhe } from '../../../../shared/tipos/demandas.ts'
import type { Papel } from '../../../../shared/tipos/nucleo.ts'

/** Passo do ciclo, a partir só da demanda (o card e o modal antes do detalhe chegar). */
export type PassoCiclo =
  /** Nenhuma versão entregue. */
  | 'sem_versao'
  /** A última versão entregue ainda não foi enviada. */
  | 'nao_enviada'
  /** Envio sem decisão: a bola está com o cliente. */
  | 'com_cliente'
  /** Aprovada (a aprovação válida está na demanda). */
  | 'aprovada'
  /** O cliente (ou o atendimento) pediu ajuste: a equipe prepara a versão seguinte. */
  | 'ajuste'

export type DemandaCiclo = Pick<Demanda, 'nVersoes' | 'versaoAtualId' | 'versaoEnviadaId' | 'envioPendenteEm' | 'aprovadaEm' |
  'aprovadaVersaoId' | 'rodadaAtual' | 'rodadasInclusas' | 'concluidaEm' | 'arquivadoEm' | 'clienteId' | 'membroIds' | 'atendimentoId'>

export function passoCiclo(d: DemandaCiclo): PassoCiclo {
  if (d.envioPendenteEm) return 'com_cliente'
  if (d.nVersoes === 0 || !d.versaoAtualId) return 'sem_versao'
  if (d.aprovadaEm && d.aprovadaVersaoId === d.versaoAtualId) return 'aprovada'
  if (d.versaoAtualId !== d.versaoEnviadaId) return 'nao_enviada'
  return 'ajuste'
}

export interface Quem {
  id: string
  papel: Papel
}

const gestao = (p: Papel) => p === 'admin' || p === 'atendimento'

/** Entregar versão: atendimento, admin e, da equipe, quem é membro ou o AM (como o servidor). */
export function podeEntregar(d: DemandaCiclo, eu: Quem): boolean {
  return gestao(eu.papel) || d.membroIds.includes(eu.id) || d.atendimentoId === eu.id
}

export type AcaoCiclo = 'retorno' | 'enviar' | 'ajuste_interno' | 'entregar' | 'aprovado_whatsapp' | 'copiar_whatsapp' | 'anular'

/**
 * As ações visíveis no topo do modal e o primário. `rodadaAberta`: do detalhe quando já chegou (sem ele, supõe aberta
 * se a peça não foi aprovada). `temEnvio`: algum envio já feito (para o "Copiar para WhatsApp").
 */
export function acoesDoCiclo(d: DemandaCiclo, eu: Quem, extra: { rodadaAberta?: boolean; entregueNaRodada?: boolean } = {}):
  { visiveis: AcaoCiclo[]; primaria: AcaoCiclo | null } {
  if (d.arquivadoEm) return { visiveis: [], primaria: null }
  const passo = passoCiclo(d)
  const atendimento = gestao(eu.papel)
  const aberta = extra.rodadaAberta ?? !d.aprovadaEm
  const visiveis: AcaoCiclo[] = []
  if (atendimento && passo === 'com_cliente') visiveis.push('retorno')
  if (atendimento && passo === 'nao_enviada' && !d.concluidaEm) visiveis.push('enviar')
  const entregue = extra.entregueNaRodada ?? passo === 'nao_enviada'
  if (atendimento && passo !== 'com_cliente' && passo !== 'sem_versao' && aberta && entregue) visiveis.push('ajuste_interno')
  // com o cliente, a próxima versão espera o retorno (o servidor aceita; a tela não oferece no topo)
  if (podeEntregar(d, eu) && aberta && !d.concluidaEm && passo !== 'aprovada' && passo !== 'com_cliente') visiveis.push('entregar')
  if (atendimento && passo === 'com_cliente') visiveis.push('aprovado_whatsapp')
  if (atendimento && d.versaoEnviadaId) visiveis.push('copiar_whatsapp')
  if (atendimento && passo === 'aprovada') visiveis.push('anular')
  let primaria: AcaoCiclo | null = null
  if (passo === 'com_cliente' && visiveis.includes('retorno')) primaria = 'retorno'
  else if (passo === 'nao_enviada' && visiveis.includes('enviar')) primaria = 'enviar'
  else if ((passo === 'sem_versao' || passo === 'ajuste') && visiveis.includes('entregar')) primaria = 'entregar'
  return { visiveis, primaria }
}

/** O selo do card: "V2" com o estado, e a rodada extra quando o sinal do núcleo não a mostra. */
export interface SeloCiclo {
  versao: number
  estado: 'entregue' | 'com_cliente' | 'aprovada' | 'ajuste'
  dica: string
}

export function seloDoCard(d: DemandaCiclo): SeloCiclo | null {
  if (d.nVersoes === 0) return null
  const v = d.nVersoes
  switch (passoCiclo(d)) {
    case 'com_cliente': return { versao: v, estado: 'com_cliente', dica: `V${v} com o cliente` }
    case 'aprovada': return { versao: v, estado: 'aprovada', dica: `V${v} aprovada pelo cliente` }
    case 'nao_enviada': return { versao: v, estado: 'entregue', dica: `V${v} entregue, ainda não enviada ao cliente` }
    case 'ajuste': return { versao: v, estado: 'ajuste', dica: `Ajuste pedido na V${v}: a equipe prepara a V${v + 1}` }
    case 'sem_versao': return null
  }
}

/** "R3/2" quando a rodada atual passou das inclusas (o card mostra só se o sinal do núcleo for outro). */
export function rodadaExtra(d: Pick<Demanda, 'rodadaAtual' | 'rodadasInclusas'>): string | null {
  return d.rodadaAtual > d.rodadasInclusas ? `R${d.rodadaAtual}/${d.rodadasInclusas}` : null
}

// ─────────────────────────────── linha do tempo (detalhe) ───────────────────────────────

export interface VersaoNaLinha {
  versao: VersaoComItens
  envios: Envio[]
  /** Todas as decisões sobre a versão (as anuladas também, riscadas). */
  decisoes: Aprovacao[]
}

export interface RodadaNaLinha {
  rodada: Rodada
  versoes: VersaoNaLinha[]
}

/** Rodadas (mais nova primeiro) com as versões de cada uma (mais nova primeiro), os envios e as decisões. */
export function linhaDoTempo(det: Pick<DemandaDetalhe, 'rodadas' | 'versoes' | 'envios' | 'aprovacoes'>): RodadaNaLinha[] {
  const porRodada = new Map<string, VersaoNaLinha[]>()
  for (const v of [...det.versoes].sort((a, b) => b.numero - a.numero)) {
    const lista = porRodada.get(v.rodadaId) ?? []
    lista.push({
      versao: v,
      envios: det.envios.filter((e) => e.versaoId === v.id).sort((a, b) => a.enviadoEm.localeCompare(b.enviadoEm)),
      decisoes: det.aprovacoes.filter((a) => a.versaoId === v.id).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    })
    porRodada.set(v.rodadaId, lista)
  }
  return [...det.rodadas].sort((a, b) => b.numero - a.numero).map((r) => ({ rodada: r, versoes: porRodada.get(r.id) ?? [] }))
}

/** A decisão válida mais recente da demanda (a que se pode anular, se for aprovação). */
export function ultimaDecisao(aprovacoes: readonly Aprovacao[]): Aprovacao | null {
  const validas = aprovacoes.filter((a) => !a.anuladaEm)
  return validas.length ? validas.reduce((x, y) => (y.criadoEm >= x.criadoEm ? y : x)) : null
}

/** A rodada aberta (a atual), se houver. */
export function rodadaAberta(rodadas: readonly Rodada[]): Rodada | null {
  return rodadas.find((r) => !r.fechadaEm) ?? null
}

/** Já há versão entregue na rodada aberta? (o "Pedir ajuste interno" exige.) */
export function entregueNaRodada(det: Pick<DemandaDetalhe, 'rodadas' | 'versoes'>): boolean {
  const r = rodadaAberta(det.rodadas)
  return !!r && det.versoes.some((v) => v.rodadaId === r.id)
}

/** Link ou caminho de rede digitado (M:\…, \\servidor\…); null = nenhum dos dois. */
export function lerEndereco(texto: string): { tipo: 'link'; url: string } | { tipo: 'caminho'; caminho: string } | null {
  const t = texto.trim()
  if (/^https:\/\/[^\s]+$/i.test(t)) return { tipo: 'link', url: t }
  if (/^[a-z]:\\/i.test(t) || /^\\\\[^\\]+\\/.test(t)) return { tipo: 'caminho', caminho: t }
  return null
}

export { enderecoEmbutido } from './embutir.ts'
