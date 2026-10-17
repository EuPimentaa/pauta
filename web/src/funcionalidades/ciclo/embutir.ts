/**
 * Endereço para embutir (iframe com sandbox) os hosts conhecidos que a CSP libera em frame-src: Drive (/preview),
 * YouTube (youtube-nocookie) e Figma (embed). Qualquer outro: null (vira cartão de link). Usado no modal e na página
 * pública (módulo pequeno de propósito: vai junto da página pública).
 */
export function enderecoEmbutido(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  if (host === 'drive.google.com') {
    const id = /\/file\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/.exec(u.pathname)?.[1] ?? u.searchParams.get('id')
    return id && /^[A-Za-z0-9_-]+$/.test(id) ? `https://drive.google.com/file/d/${id}/preview` : null
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : (u.searchParams.get('v') ?? /\/(?:shorts|embed)\/([^/?]+)/.exec(u.pathname)?.[1])
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }
  if (host === 'figma.com' && /^\/(file|design|proto)\//.test(u.pathname)) {
    return `https://www.figma.com/embed?embed_host=pauta&url=${encodeURIComponent(u.toString())}`
  }
  return null
}
