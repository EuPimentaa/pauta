/**
 * Decide quais atalhos uma tecla aciona (PLANO §2, "Teclado"). Puro: o Despachante.tsx monta o estado e executa.
 * - só os escopos ativos, do mais específico para o geral (teclado/escopos.ts);
 * - dentro de campo de texto, ou com prefs.atalhos desligado, só valem os com Ctrl/Cmd ou Alt;
 * - com um botão, link ou aba em foco, Enter e Espaço são do controle (não do card sob o mouse);
 * - acorde ("g a"): a primeira tecla arma por 1,5 s; a segunda decide.
 * Os escopos são os de EscopoAtalho (extensoes/tipos.ts); aqui como texto, para rodar no Node sem o contrato do front.
 */
import { casaPasso, passosDe, temModificador, type EventoTecla } from './teclas.ts'

type EscopoAtalho = string

export const ACORDE_MS = 1500

export interface AtalhoBase {
  id: string
  teclas: string
  escopo: EscopoAtalho
}

export interface EstadoTeclado {
  escopos: readonly EscopoAtalho[]
  emCampo: boolean
  /**
   * Foco num controle que Enter e Espaço acionam (botão, link, aba, caixa de marcar...): essas duas teclas ficam com
   * ele, mesmo com um card sob o mouse (senão Enter abriria o card e Espaço poria a pessoa como membro).
   */
  emControle?: boolean
  ligados: boolean
  mac: boolean
  /** Primeira tecla de um acorde já apertada (ex.: 'g'), ainda no prazo. */
  acorde: string | null
}

const TECLAS_DE_ACIONAR = new Set(['enter', 'space'])

/** Enter ou Espaço sem Ctrl/Cmd nem Alt (com ou sem Shift): a tecla que aciona o controle focado. */
function acionaControle(teclas: string): boolean {
  const p = passosDe(teclas)
  return p.length === 1 && TECLAS_DE_ACIONAR.has(p[0].tecla) && !p[0].mod && !p[0].alt
}

export type Decisao<A extends AtalhoBase> =
  /** Candidatos em ordem de prioridade: o primeiro cujo `quando` passar executa. */
  | { tipo: 'executar'; candidatos: { atalho: A; escopo: A['escopo'] }[] }
  /** Armar o acorde com esta primeira tecla. */
  | { tipo: 'acorde'; primeira: string }
  | null

export function decidir<A extends AtalhoBase>(atalhos: readonly A[], e: EventoTecla, s: EstadoTeclado): Decisao<A> {
  const ordem = (esc: EscopoAtalho) => s.escopos.indexOf(esc)
  const permitido = (a: A) => (s.emCampo || !s.ligados ? temModificador(a.teclas) : true) && !(s.emControle && acionaControle(a.teclas))
  const validos = atalhos.filter((a) => ordem(a.escopo) >= 0 && permitido(a))
  const porPrioridade = (x: { atalho: A }, y: { atalho: A }) => ordem(x.atalho.escopo) - ordem(y.atalho.escopo)

  if (s.acorde) {
    const candidatos = validos
      .filter((a) => {
        const p = passosDe(a.teclas)
        return p.length === 2 && p[0].tecla === s.acorde && casaPasso(p[1], e, s.mac)
      })
      .map((atalho) => ({ atalho, escopo: atalho.escopo }))
      .sort(porPrioridade)
    return candidatos.length ? { tipo: 'executar', candidatos } : null
  }

  const simples = validos
    .filter((a) => { const p = passosDe(a.teclas); return p.length === 1 && casaPasso(p[0], e, s.mac) })
    .map((atalho) => ({ atalho, escopo: atalho.escopo }))
    .sort(porPrioridade)
  if (simples.length) return { tipo: 'executar', candidatos: simples }

  const inicia = validos.find((a) => { const p = passosDe(a.teclas); return p.length === 2 && casaPasso(p[0], e, s.mac) })
  return inicia ? { tipo: 'acorde', primeira: passosDe(inicia.teclas)[0].tecla } : null
}
