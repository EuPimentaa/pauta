/**
 * Teste de "Drive público" (API.md §4.16; SPEC §5.3): o servidor busca a miniatura pública do arquivo
 * (`https://drive.google.com/thumbnail?id=<id>&sz=w400`) SEM credenciais, com 5 s de limite por passo:
 * - imagem com 200 → `publico` (a miniatura vira a prévia estática);
 * - redirecionamento para fora do Google Drive (a tela de login, accounts.google.com) ou 401/403 → `privado`
 *   (o cliente veria uma tela de login);
 * - pasta (`/drive/folders/<id>`) → `pasta` (só aviso: não dá para testar a pasta);
 * - qualquer outra coisa (404, 5xx, rede, tempo esgotado) → `erro` (não bloqueia o envio; a tela pede para conferir).
 * Medido em 16/10/2026: a miniatura sempre redireciona (302) para lh3.googleusercontent.com, que é quem responde a
 * imagem ou nega; por isso o teste segue até 3 redirecionamentos, só para drive.google.com e *.googleusercontent.com.
 * O id sai do link por regex (o servidor nunca busca a URL que veio do usuário). A busca é trocável
 * (`definirBuscaDrive`) para os testes simularem o Drive.
 */
import type { DriveStatus } from '../../../shared/tipos/index.ts'

/** O que a busca da miniatura devolve (só o que o teste precisa saber). */
export interface RespostaDrive {
  status: number
  tipo: string | null
  /** Header Location (redirecionamento). */
  local?: string | null
}

export type BuscaDrive = (url: string) => Promise<RespostaDrive>

const LIMITE_MS = 5000

const buscaPadrao: BuscaDrive = async (url) => {
  const r = await fetch(url, {
    method: 'GET', redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(LIMITE_MS),
    headers: { Accept: 'image/*' },
  })
  // o corpo não interessa: só o status e o tipo
  void r.body?.cancel().catch(() => {})
  return { status: r.status, tipo: r.headers.get('content-type'), local: r.headers.get('location') }
}

let busca: BuscaDrive = buscaPadrao

/** Troca a busca do Drive (testes); sem argumento, volta à de verdade. */
export function definirBuscaDrive(fn?: BuscaDrive): void {
  busca = fn ?? buscaPadrao
}

const ID = /^[A-Za-z0-9_-]{2,200}$/

/** O que o link do Drive aponta: arquivo (com o id), pasta, ou nada que dê para testar. */
export function lerLinkDrive(url: string): { tipo: 'arquivo'; id: string } | { tipo: 'pasta' } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || !/(^|\.)drive\.google\.com$/i.test(u.hostname)) return null
  if (/\/drive\/(u\/\d+\/)?folders\//.test(u.pathname) || /\/folderview/.test(u.pathname)) return { tipo: 'pasta' }
  const doCaminho = /\/file\/(?:u\/\d+\/)?d\/([^/]+)/.exec(u.pathname)?.[1]
  const id = doCaminho ?? u.searchParams.get('id') ?? undefined
  return id && ID.test(id) ? { tipo: 'arquivo', id } : null
}

/** Miniatura pública de 400 px (vira a `previaUrl` quando o arquivo está público). */
export function miniaturaDrive(id: string): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w400`
}

export interface ResultadoDrive {
  status: DriveStatus | 'nao_drive'
  previaUrl: string | null
  mensagem: string
}

export const MENSAGENS_DRIVE: Record<ResultadoDrive['status'], string> = {
  publico: 'O arquivo está aberto: o cliente vê a prévia sem entrar no Google.',
  privado: 'O cliente verá uma tela de login.',
  pasta: 'É uma pasta: confira se ela está compartilhada com qualquer pessoa com o link.',
  erro: 'Não foi possível testar o link agora. Tente de novo em instantes.',
  nao_drive: 'Este link não é do Google Drive: não há o que testar.',
}

/** Testa um link (qualquer um: o que não é do Drive volta `nao_drive` sem buscar nada). */
export async function testarLinkDrive(url: string): Promise<ResultadoDrive> {
  const alvo = lerLinkDrive(url)
  const r = (status: ResultadoDrive['status'], previaUrl: string | null = null): ResultadoDrive =>
    ({ status, previaUrl, mensagem: MENSAGENS_DRIVE[status] })
  if (!alvo) return r(/(^|\.)drive\.google\.com$/i.test(hostDe(url)) ? 'erro' : 'nao_drive')
  if (alvo.tipo === 'pasta') return r('pasta')
  const miniatura = miniaturaDrive(alvo.id)
  let atual = miniatura
  try {
    for (let passo = 0; passo < 4; passo++) {
      const resp = await busca(atual)
      if (resp.status === 200) return (resp.tipo ?? '').toLowerCase().startsWith('image/') ? r('publico', miniatura) : r('erro')
      if (resp.status === 401 || resp.status === 403) return r('privado')
      if (resp.status >= 300 && resp.status < 400) {
        const proximo = resp.local ? seguro(resp.local, atual) : null
        // para fora do Drive (accounts.google.com, a tela de login) ou sem destino: o cliente não veria o arquivo
        if (!proximo) return r('privado')
        atual = proximo
        continue
      }
      return r('erro')
    }
    return r('erro')
  } catch {
    return r('erro')
  }
}

/** O destino do redirecionamento, só se for https em drive.google.com ou *.googleusercontent.com. */
function seguro(local: string, base: string): string | null {
  try {
    const u = new URL(local, base)
    if (u.protocol !== 'https:') return null
    return /(^|\.)drive\.google\.com$/i.test(u.hostname) || /\.googleusercontent\.com$/i.test(u.hostname) ? u.toString() : null
  } catch {
    return null
  }
}

function hostDe(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
