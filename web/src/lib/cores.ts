/** Rótulos das cores (CORES do contrato) e a cor estável de uma pessoa ou item sem cor definida. */
import { CORES, type Cor } from '@shared/tipos/index.ts'

export const ROTULO_COR: Record<Cor, string> = {
  ambar: 'Âmbar', amarelo: 'Amarelo', rosa: 'Rosa', magenta: 'Magenta', roxo: 'Roxo', berinjela: 'Berinjela',
  verde: 'Verde', turquesa: 'Turquesa', azul: 'Azul', grafite: 'Grafite',
}

/** Cor escolhida por hash do texto (ex.: id), quando o item não traz a sua. Nunca laranja (não está em CORES). */
export function corPorHash(texto: string): Cor {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619)
  return CORES[Math.abs(h) % CORES.length]
}

/** Iniciais para avatar: "Rafaela Souza" → "RS"; "Rafa" → "RA"; apelido curto tem prioridade se vier. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 0 && !/^(de|da|do|das|dos|e)$/i.test(p))
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}
