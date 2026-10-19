/**
 * Leitura do iCal (RFC 5545 §3.1–§3.3; docs/fase2/pesquisa-ical.md §5.2): bytes → linhas lógicas → componentes.
 * - Desdobra EM BYTES antes de decodificar o UTF-8: o Google dobra em 75 octetos, às vezes no meio de um "ã"; decodificar
 *   linha a linha daria U+FFFD (caso G1). Aceita CRLF, LF solto e BOM.
 * - Parâmetros com aspas (podem ter `:` `;` `,`), valores TEXT desescapados à parte (`textoIcal`).
 * - Tolerante: linha sem `:`, `END` sem `BEGIN` e componente aberto no fim viram `avisos`, nunca exceção.
 * Puro: não conhece banco, rede nem relógio.
 */

export interface Propriedade {
  /** Em maiúsculas (SUMMARY, DTSTART, X-GOOGLE-CONFERENCE). */
  nome: string
  /** Nome do parâmetro em maiúsculas → valores (TZID, VALUE, RANGE...). */
  params: Record<string, string[]>
  /** Valor cru (sem desescapar). */
  valor: string
}

export interface Componente {
  /** Em maiúsculas (VCALENDAR, VEVENT, VTIMEZONE, STANDARD, VALARM...). */
  nome: string
  props: Propriedade[]
  filhos: Componente[]
}

export interface LeituraComponentes {
  /** Componentes de nível mais alto (normalmente um VCALENDAR). */
  raiz: Componente[]
  avisos: number
}

const LF = 0x0a
const CR = 0x0d
const ESPACO = 0x20
const TAB = 0x09
const decodificador = new TextDecoder('utf-8')

/** Linhas lógicas: dobras desfeitas nos bytes e só então decodificadas. */
export function desdobrar(bytes: Uint8Array): string[] {
  let i = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0
  const linhas: string[] = []
  let partes: Uint8Array[] = []
  const fechar = () => {
    if (partes.length === 0) return
    linhas.push(decodificador.decode(partes.length === 1 ? partes[0] : Buffer.concat(partes)))
    partes = []
  }
  while (i < bytes.length) {
    let fim = bytes.indexOf(LF, i)
    if (fim < 0) fim = bytes.length
    let ate = fim
    if (ate > i && bytes[ate - 1] === CR) ate--
    const primeiro = bytes[i]
    if ((primeiro === ESPACO || primeiro === TAB) && partes.length > 0) {
      // continuação: o primeiro espaço (ou tab) é da dobra, não do conteúdo
      if (ate > i + 1) partes.push(bytes.subarray(i + 1, ate))
    } else {
      fechar()
      if (ate > i) partes.push(bytes.subarray(i, ate))
    }
    i = fim + 1
  }
  fechar()
  return linhas
}

/** Uma linha lógica → propriedade (null: sem `:` ou com aspas sem fechar). */
export function lerLinha(linha: string): Propriedade | null {
  const n = linha.length
  let i = 0
  while (i < n && linha[i] !== ';' && linha[i] !== ':') i++
  if (i >= n) return null
  const nome = linha.slice(0, i).trim().toUpperCase()
  if (!nome) return null
  const params: Record<string, string[]> = {}
  while (linha[i] === ';') {
    i++
    const inicio = i
    while (i < n && linha[i] !== '=' && linha[i] !== ';' && linha[i] !== ':') i++
    const nomeParam = linha.slice(inicio, i).trim().toUpperCase()
    const valores: string[] = []
    if (linha[i] === '=') {
      i++
      for (;;) {
        if (linha[i] === '"') {
          const fecha = linha.indexOf('"', i + 1)
          if (fecha < 0) return null
          valores.push(linha.slice(i + 1, fecha))
          i = fecha + 1
        } else {
          const comeco = i
          while (i < n && linha[i] !== ',' && linha[i] !== ';' && linha[i] !== ':') i++
          valores.push(linha.slice(comeco, i))
        }
        if (linha[i] === ',') { i++; continue }
        break
      }
    }
    if (nomeParam) params[nomeParam] = valores
  }
  if (linha[i] !== ':') return null
  return { nome, params, valor: linha.slice(i + 1) }
}

/** Bytes do arquivo → árvore de componentes. */
export function lerComponentes(bytes: Uint8Array): LeituraComponentes {
  const raiz: Componente[] = []
  const pilha: Componente[] = []
  let avisos = 0
  for (const linha of desdobrar(bytes)) {
    if (linha.trim() === '') continue
    const p = lerLinha(linha)
    if (!p) { avisos++; continue }
    if (p.nome === 'BEGIN') {
      pilha.push({ nome: p.valor.trim().toUpperCase(), props: [], filhos: [] })
      continue
    }
    if (p.nome === 'END') {
      const nome = p.valor.trim().toUpperCase()
      const topo = pilha[pilha.length - 1]
      if (!topo || topo.nome !== nome) {
        // END sem BEGIN (ou fora de ordem): se o componente estiver aberto mais embaixo, fecha até ele
        const k = pilha.map((c) => c.nome).lastIndexOf(nome)
        avisos++
        if (k < 0) continue
        while (pilha.length > k + 1) fecharTopo(pilha, raiz)
      }
      fecharTopo(pilha, raiz)
      continue
    }
    const atual = pilha[pilha.length - 1]
    if (!atual) { avisos++; continue }
    atual.props.push(p)
  }
  while (pilha.length > 0) { avisos++; fecharTopo(pilha, raiz) }
  return { raiz, avisos }
}

function fecharTopo(pilha: Componente[], raiz: Componente[]): void {
  const c = pilha.pop()!
  const pai = pilha[pilha.length - 1]
  if (pai) pai.filhos.push(c)
  else raiz.push(c)
}

/** RFC §3.3.11: `\\` `\;` `\,` `\n`/`\N`. */
export function textoIcal(valor: string): string {
  return valor.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

/** A primeira propriedade com o nome (ou undefined). */
export function prop(c: Componente, nome: string): Propriedade | undefined {
  return c.props.find((p) => p.nome === nome)
}

/** Todas as propriedades com o nome. */
export function props(c: Componente, nome: string): Propriedade[] {
  return c.props.filter((p) => p.nome === nome)
}

/** O primeiro valor do parâmetro (ou undefined). */
export function param(p: Propriedade, nome: string): string | undefined {
  return p.params[nome]?.[0]
}

/** Todos os componentes com o nome, em qualquer profundidade dentro dos VCALENDAR (sem entrar em VEVENT). */
export function componentesDo(raiz: Componente[], nome: string): Componente[] {
  const saida: Componente[] = []
  for (const cal of raiz) {
    if (cal.nome !== 'VCALENDAR') continue
    for (const f of cal.filhos) if (f.nome === nome) saida.push(f)
  }
  return saida
}
