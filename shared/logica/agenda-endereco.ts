/**
 * Agendas externas (API.md §F.9): o endereço secreto do Google e o link da reunião. Puro (servidor e navegador).
 * - `validarEnderecoIcal`: anti-SSRF, porque quem busca é o servidor. Só `https://calendar.google.com/calendar/ical/
 *   <id>/private-<hex>/basic.ics`, sem porta, usuário, senha, query nem fragmento; `webcal://` vira `https://`. Roda no
 *   POST, no PATCH e logo antes de cada busca (o endereço decifrado também passa por aqui).
 * - `linkReuniaoValido`: só https em Meet, Zoom e Teams, com o hostname exato (um convite forjado não ganha o botão
 *   [Entrar na reunião] para outro site). O CHECK de agenda_ocorrencia.link_reuniao repete a regra.
 */

export const HOST_AGENDA_GOOGLE = 'calendar.google.com'
const CAMINHO_ICAL = /^\/calendar\/ical\/[^/]+\/private-[0-9a-f]+\/basic\.ics$/

/** O endereço normalizado (https, como o `URL` o escreve) ou null se não for o Endereço secreto no formato iCal. */
export function validarEnderecoIcal(texto: string): string | null {
  if (typeof texto !== 'string') return null
  let bruto = texto.trim()
  if (bruto.length === 0 || bruto.length > 2000 || /\s/.test(bruto)) return null
  if (/^webcal:\/\//i.test(bruto)) bruto = `https://${bruto.slice('webcal://'.length)}`
  let u: URL
  try {
    u = new URL(bruto)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || u.hostname !== HOST_AGENDA_GOOGLE) return null
  if (u.port !== '' || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') return null
  // "?" ou "#" vazios somem do search/hash: confere no texto também
  if (/[?#]/.test(bruto)) return null
  if (!CAMINHO_ICAL.test(u.pathname)) return null
  return u.href
}

/**
 * "calendar.google.com · agencia@meltcomunicacao.com.br · …a1b2": o bastante para reconhecer a agenda, nunca o token
 * (só os 4 últimos caracteres). Até 200 caracteres.
 */
export function dicaDoEndereco(url: string): string {
  const u = new URL(url)
  const [, , , idCodificado = '', privado = ''] = u.pathname.split('/')
  let id: string
  try {
    id = decodeURIComponent(idCodificado)
  } catch {
    id = idCodificado
  }
  id = id.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
  const fim = `…${privado.replace(/^private-/, '').slice(-4)}`
  const espaco = 200 - HOST_AGENDA_GOOGLE.length - fim.length - 6
  if (id.length > espaco) id = `${id.slice(0, espaco - 1)}…`
  return `${HOST_AGENDA_GOOGLE} · ${id} · ${fim}`
}

const HOSTS_REUNIAO = new Set(['meet.google.com', 'zoom.us', 'teams.microsoft.com', 'teams.live.com'])

/** O link normalizado se for de reunião (https, Meet/Zoom/Teams, sem porta nem usuário), senão null. */
export function linkReuniaoValido(texto: string | null | undefined): string | null {
  if (!texto) return null
  let u: URL
  try {
    u = new URL(texto.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || u.port !== '' || u.username !== '' || u.password !== '') return null
  const host = u.hostname
  if (!/^[a-z0-9.-]+$/.test(host)) return null
  if (!HOSTS_REUNIAO.has(host) && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.zoom\.us$/.test(host)) return null
  const href = u.href
  return href.length <= 500 ? href : null
}

/** Primeiro link de reunião válido dentro de um texto (LOCATION ou DESCRIPTION), ou null. */
export function linkReuniaoNoTexto(texto: string | null | undefined): string | null {
  if (!texto) return null
  for (const m of texto.matchAll(/https:\/\/[^\s<>"'`]+/gi)) {
    const limpo = m[0].replace(/[.,;:!?)\]}]+$/, '')
    const ok = linkReuniaoValido(limpo)
    if (ok) return ok
  }
  return null
}
