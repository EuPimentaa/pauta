/**
 * Ajuda dos testes da agenda externa (F9): as fixtures do iCal, um iCal montado à mão, o servidor falso local que serve
 * as fixtures (e os casos de erro) por HTTP de verdade, a busca apontada para ele e a captura do log.
 */
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import type { AddressInfo } from 'node:net'
import { definirBuscaAgenda, lerIcalHttp, type BuscaAgenda } from '../src/servicos/agenda-busca.ts'
import { lerIcal, type LeituraIcal, type OcorrenciaIcal } from '../src/servicos/agenda-ical.ts'

const PASTA = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'agenda')

/** Relógio dos casos do google-2026.ics (seg, 10:00 em SP) e do google-2018.ics. */
export const RELOGIO_2026 = '2026-10-19T13:00:00.000Z'
export const RELOGIO_2018 = '2018-11-01T12:00:00.000Z'

/** Endereço secreto de teste (o formato do Google; nada real). */
export const URL_TESTE = 'https://calendar.google.com/calendar/ical/agencia%40melt.test/private-0123456789abcdef0123456789abcdef/basic.ics'
export const URL_OUTRA = 'https://calendar.google.com/calendar/ical/c_1a2b3c%40group.calendar.google.com/private-fedcba9876543210/basic.ics'

export function fixture(nome: 'google-2026.ics' | 'google-2018.ics'): Buffer {
  return readFileSync(join(PASTA, nome))
}

export function ler2026(): LeituraIcal {
  return lerIcal(fixture('google-2026.ics'), { hoje: '2026-10-19' })
}

export function ler2018(): LeituraIcal {
  return lerIcal(fixture('google-2018.ics'), { hoje: '2018-11-01' })
}

/** Ocorrências de um caso (o UID começa com o id do caso: "d1-", "e-serie@"). */
export function doCaso(l: LeituraIcal, prefixo: string): OcorrenciaIcal[] {
  return l.ocorrencias.filter((o) => o.chave.startsWith(prefixo))
}

/** Hora de São Paulo de um instante ISO ("10:00"). */
export function horaSP(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(iso))
}

/** Um iCal no formato do Google (CRLF) com os VEVENT dados (cada um, as linhas de dentro). */
export function ical(...eventos: string[][]): Buffer {
  const linhas = ['BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'VERSION:2.0',
    'X-WR-TIMEZONE:America/Sao_Paulo']
  eventos.forEach((e, i) => linhas.push('BEGIN:VEVENT', 'DTSTAMP:20261019T130000Z', ...(e.some((l) => l.startsWith('UID')) ? [] : [`UID:t${i}@pauta.teste`]), ...e, 'END:VEVENT'))
  linhas.push('END:VCALENDAR')
  return Buffer.from(`${linhas.join('\r\n')}\r\n`, 'utf8')
}

// ─────────────────────────────── servidor falso ───────────────────────────────

export interface ServidorFalso {
  base: string
  /** Quantas requisições chegaram por rota. */
  pedidos: Map<string, number>
  /** Troca o corpo servido em /ical (padrão: google-2026.ics). */
  servir(corpo: Buffer): void
  fechar(): Promise<void>
}

/**
 * Servidor HTTP local (127.0.0.1, porta livre) que se comporta como o Google:
 * /ical (o corpo de `servir`, text/calendar), /ical-gzip (o mesmo com Content-Encoding gzip), /404 (text/html),
 * /html (200 com a página de login), /500, /429, /302 (para accounts.google.com), /lento (não responde a tempo),
 * /bomba (gzip pequeno que passa de 32 MB descomprimido) e /grande (texto em fluxo, sem fim).
 */
export async function servidorFalso(): Promise<ServidorFalso> {
  let corpo = fixture('google-2026.ics')
  const pedidos = new Map<string, number>()
  let bomba: Buffer | null = null
  const servidor: Server = createServer((req, res) => {
    const rota = (req.url ?? '/').split('?')[0]!
    pedidos.set(rota, (pedidos.get(rota) ?? 0) + 1)
    switch (rota) {
      case '/ical':
        res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate' })
        res.end(corpo)
        return
      case '/ical-gzip':
        res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Encoding': 'gzip' })
        res.end(gzipSync(corpo))
        return
      case '/404':
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body>Não encontrado</body></html>')
        return
      case '/html':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<!doctype html><html><head><title>Fazer login</title></head><body>Entre com sua conta</body></html>')
        return
      case '/500': case '/429':
        res.writeHead(Number(rota.slice(1)), { 'Content-Type': 'text/plain' })
        res.end('erro')
        return
      case '/302':
        res.writeHead(302, { Location: 'https://accounts.google.com/ServiceLogin' })
        res.end()
        return
      case '/lento':
        res.writeHead(200, { 'Content-Type': 'text/calendar' })
        res.write('BEGIN:VCALENDAR\r\n')
        // nunca termina: o tempo esgota
        return
      case '/bomba':
        bomba ??= gzipSync(Buffer.concat([Buffer.from('BEGIN:VCALENDAR\r\n'), Buffer.alloc(33 * 1024 * 1024, 0x58)]))
        res.writeHead(200, { 'Content-Type': 'text/calendar', 'Content-Encoding': 'gzip' })
        res.end(bomba)
        return
      case '/grande': {
        res.writeHead(200, { 'Content-Type': 'text/calendar' })
        res.write('BEGIN:VCALENDAR\r\n')
        const pedaco = Buffer.alloc(64 * 1024, 0x58)
        const escrever = () => { while (!res.destroyed && res.write(pedaco)) { /* até o buffer encher */ } }
        res.on('drain', escrever)
        escrever()
        return
      }
      default:
        res.writeHead(404)
        res.end()
    }
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  const { port } = servidor.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    pedidos,
    servir: (c) => { corpo = c },
    fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(() => ok()) }),
  }
}

/**
 * Aponta a busca para uma rota do servidor falso (o endereço do Google que chega é trocado pelo local; a leitura HTTP
 * é a de verdade, com os tetos). Devolve os endereços que a busca recebeu.
 */
export function apontarPara(s: ServidorFalso, rota: string | (() => string), o: { tetoBytes?: number; tempoMs?: number } = {}): string[] {
  const recebidos: string[] = []
  const fn: BuscaAgenda = (url) => {
    recebidos.push(url)
    return lerIcalHttp(`${s.base}${typeof rota === 'function' ? rota() : rota}`, o)
  }
  definirBuscaAgenda(fn)
  return recebidos
}

// ─────────────────────────────── log ───────────────────────────────

/** Junta tudo o que foi para console.log/error/warn (os mocks são desfeitos pelo `t` no fim do teste). */
export function capturarLog(t: { mock: { method: (o: object, m: never, f: (...a: unknown[]) => void) => unknown } }): string[] {
  const linhas: string[] = []
  for (const m of ['log', 'error', 'warn', 'info'] as const) {
    t.mock.method(console, m as never, (...a: unknown[]) => {
      linhas.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}\n${x.stack ?? ''}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
    })
  }
  return linhas
}
