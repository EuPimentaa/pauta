/**
 * O que só os testes do ciclo (F2) usam: o Drive simulado (sem rede), um PNG mínimo, entregar e enviar pelas rotas,
 * o token do link a partir da URL e o cliente sem sessão da página pública (com X-Trace-Id e Origin, como o
 * navegador manda).
 */
import { randomUUID } from 'node:crypto'
import type { Demanda, EntregarVersaoSaida, EnviarAoClienteSaida, NovoItem, PaginaAprovacao, Usuario } from '../../shared/tipos/index.ts'
import { tx } from '../src/db.ts'
import { salvarUpload } from '../src/servicos/arquivos.ts'
import { aguardarTestesDrive } from '../src/servicos/ciclo.ts'
import { definirBuscaDrive } from '../src/servicos/drive.ts'
import { ORIGEM, ambiente as ambienteBase, type Ambiente, type Resposta } from './ajuda.ts'

/** Situação de cada arquivo do Drive simulado, pelo id do link (o resto: público). */
export type SituacaoDrive = 'publico' | 'privado' | 'erro'
const situacoes = new Map<string, SituacaoDrive>()
export const buscasDrive: string[] = []

/** Drive simulado: miniatura → 302 para lh3; lh3 responde a imagem (público), 403 (privado) ou 500 (erro). */
export function driveSimulado(): void {
  definirBuscaDrive(async (url) => {
    buscasDrive.push(url)
    const u = new URL(url)
    if (u.hostname === 'drive.google.com') {
      const id = u.searchParams.get('id')!
      return { status: 302, tipo: 'application/binary', local: `https://lh3.googleusercontent.com/d/${id}=w400` }
    }
    const id = /\/d\/([^=]+)=/.exec(u.pathname)?.[1] ?? ''
    const s = situacoes.get(id) ?? 'publico'
    if (s === 'publico') return { status: 200, tipo: 'image/png' }
    if (s === 'privado') return { status: 403, tipo: 'text/html' }
    return { status: 500, tipo: 'text/html' }
  })
}

export function situacaoDrive(id: string, s: SituacaoDrive): void {
  situacoes.set(id, s)
}

/** Ambiente da fixture com o Drive simulado (tudo público até `situacaoDrive`). */
export async function ambiente(): Promise<Ambiente> {
  await aguardarTestesDrive()
  situacoes.clear()
  buscasDrive.length = 0
  driveSimulado()
  return ambienteBase()
}

export const linkDrive = (id: string) => `https://drive.google.com/file/d/${id}/view?usp=sharing`

export const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

/** Envia um PNG pelo serviço do núcleo (o mesmo do POST /api/arquivos). */
export function enviarPng(a: Ambiente, quem: Usuario, nome = 'print.png'): string {
  return tx(a.db, () => salvarUpload(a.db, PNG_1X1, nome, a.ator(quem))).id
}

/** Entrega uma versão pela rota (padrão: o design, com um link do Drive) e espera o teste do Drive. */
export async function entregar(a: Ambiente, d: Demanda, p: { como?: Usuario; itens?: NovoItem[]; nota?: string } = {}): Promise<EntregarVersaoSaida> {
  const r = await a.como(p.como ?? a.pessoas.design).post(`/api/demandas/${d.id}/versoes`, {
    nota: p.nota, itens: p.itens ?? [{ tipo: 'link', url: linkDrive(`arte-${randomUUID().slice(0, 12)}`) }],
  })
  if (r.status !== 201) throw new Error(`entregar: ${r.status} ${r.texto}`)
  await aguardarTestesDrive()
  return r.corpo
}

/** Envia ao cliente pela rota (padrão: o AM, por link). */
export async function enviarAoCliente(a: Ambiente, d: Demanda, p: { como?: Usuario; via?: 'link' | 'fora'; contatoId?: string | null } = {}):
  Promise<EnviarAoClienteSaida> {
  const via = p.via ?? 'link'
  const r = await a.como(p.como ?? a.pessoas.am).post(`/api/demandas/${d.id}/enviar`, {
    via, ...(via === 'fora' ? { canal: 'whatsapp' } : {}), ...(p.contatoId !== undefined ? { contatoId: p.contatoId } : {}),
  })
  if (r.status !== 200) throw new Error(`enviar: ${r.status} ${r.texto}`)
  return r.corpo
}

/** O token do link público a partir da URL (…/a/<token>). */
export const tokenDe = (url: string) => url.slice(url.lastIndexOf('/a/') + 3)

/** Cliente sem sessão da página pública: GET sem nada; POST com X-Trace-Id e Origin (o anti-CSRF vale aqui também). */
export function publico(a: Ambiente, ip = '200.1.1.1') {
  const enviar = async (metodo: string, caminho: string, corpo?: unknown, headers: Record<string, string> = {}): Promise<Resposta> => {
    const r = await a.app.request(caminho, {
      method: metodo,
      headers: {
        'x-forwarded-for': ip,
        ...(metodo !== 'GET' ? { 'X-Trace-Id': randomUUID(), Origin: ORIGEM } : {}),
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await r.text()
    const json = (r.headers.get('content-type') ?? '').includes('application/json') && texto ? JSON.parse(texto) : texto
    return { status: r.status, corpo: json, texto, headers: r.headers }
  }
  return {
    pagina: (token: string) => enviar('GET', `/api/publico/a/${token}`) as Promise<Resposta<PaginaAprovacao>>,
    visto: (token: string) => enviar('POST', `/api/publico/a/${token}/visto`),
    decidir: (token: string, corpo: Record<string, unknown>, chave: string | null = randomUUID()) =>
      enviar('POST', `/api/publico/a/${token}/decisao`, corpo, chave ? { 'Idempotency-Key': chave } : {}),
    get: (caminho: string) => enviar('GET', caminho),
  }
}
