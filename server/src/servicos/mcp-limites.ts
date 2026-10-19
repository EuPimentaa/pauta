/**
 * Limites em memória do MCP e do OAuth (F7, API.md §F.3 e §F.5): janela deslizante por chave, no relógio do app
 * (`agora()`, que os testes fixam). Um processo só, como o `limite()` do auth.ts; um deploy zera as janelas, o que só
 * folga o limite por alguns minutos. Nunca por IP no /mcp: todo o Claude chega pela mesma faixa da Anthropic.
 */
import { agora } from '../db.ts'

const janelas = new Map<string, { ms: number; marcas: number[] }>()

/** Zera tudo (testes). */
export function zerarLimitesMcp(): void {
  janelas.clear()
}

function vivas(chave: string, janelaMs: number, agoraMs: number): number[] {
  return (janelas.get(chave)?.marcas ?? []).filter((t) => t > agoraMs - janelaMs)
}

function gravar(chave: string, janelaMs: number, marcas: number[], agoraMs: number): void {
  janelas.set(chave, { ms: janelaMs, marcas })
  if (janelas.size > 20_000) {
    for (const [k, j] of janelas) if (j.marcas.every((t) => t <= agoraMs - j.ms)) janelas.delete(k)
  }
}

/**
 * Conta uma vez e diz se passou: `ok: false` quando já houve `max` na janela (a marca não entra), com os segundos até
 * a mais antiga sair da janela.
 */
export function usar(chave: string, max: number, janelaSeg: number): { ok: boolean; esperaSeg: number } {
  const agoraMs = Date.parse(agora())
  const janelaMs = janelaSeg * 1000
  const marcas = vivas(chave, janelaMs, agoraMs)
  if (marcas.length >= max) {
    gravar(chave, janelaMs, marcas, agoraMs)
    return { ok: false, esperaSeg: Math.max(1, Math.ceil((marcas[0]! + janelaMs - agoraMs) / 1000)) }
  }
  marcas.push(agoraMs)
  gravar(chave, janelaMs, marcas, agoraMs)
  return { ok: true, esperaSeg: 0 }
}

/** Quantas marcas a chave tem na janela (sem contar uma nova). */
export function usados(chave: string, janelaSeg: number): number {
  return vivas(chave, janelaSeg * 1000, Date.parse(agora())).length
}

/** IPv4 dentro de uma faixa CIDR ("160.79.104.0/21"); aceita o "::ffff:" do IPv4 mapeado. IPv6 e lixo: false. */
export function ipNaFaixa(ip: string, faixa: string): boolean {
  const paraNumero = (s: string): number | null => {
    const m = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(s.trim())
    if (!m) return null
    const partes = m.slice(1).map(Number)
    if (partes.some((p) => p > 255)) return null
    return ((partes[0]! << 24) >>> 0) + (partes[1]! << 16) + (partes[2]! << 8) + partes[3]!
  }
  const [base, bitsTexto] = faixa.split('/') as [string, string]
  const n = paraNumero(ip)
  const b = paraNumero(base)
  const bits = Number(bitsTexto)
  if (n === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return ((n & mascara) >>> 0) === ((b & mascara) >>> 0)
}
