/**
 * Tempo real (API.md §3): SSE em /api/eventos (retomada por Last-Event-ID ou ?desde=, resync, ping de 25 s que
 * revalida a sessão, filtro de público), /api/sync (polling) e /api/bootstrap. Os três usam o mesmo filtro.
 */
import type { EventoPing, EventoResync, SyncSaida } from '../../../shared/tipos/index.ts'
import { exigirUsuario, sessaoDaRequisicao, type App } from '../auth.ts'
import { validacao } from '../erros.ts'
import { montarBootstrap } from '../servicos/bootstrap.ts'
import {
  barramento, blocoSse, eventosDesde, intervaloPingMs, linhaParaEvento, motivoResync, registrarConexao, revalidar, seqAtual,
  visivelPara, type ConexaoSse, type EventoPublicado,
} from '../tempo-real.ts'

function lerSeq(valor: string | undefined): number | null {
  if (valor === undefined || valor === '') return null
  if (!/^\d{1,15}$/.test(valor.trim())) throw validacao('Seq inválido.', { desde: 'inteiro não negativo' })
  return Number(valor)
}

export function registrar(app: App): void {
  app.get('/api/eventos', exigirUsuario, (c) => {
    const db = c.get('db')
    const usuario = c.get('ator').usuario!
    const sessao = sessaoDaRequisicao(c)!
    const desde = lerSeq(c.req.header('last-event-id') ?? c.req.query('desde'))
    const codificador = new TextEncoder()
    let fechado = false
    let saida: ReadableStreamDefaultController<Uint8Array> | null = null
    let soltar: (() => void)[] = []

    const conexao: ConexaoSse = {
      usuarioId: usuario.id,
      papel: usuario.papel,
      sessaoId: sessao.id,
      escrever(texto) {
        if (fechado || !saida) return
        try {
          saida.enqueue(codificador.encode(texto))
        } catch {
          conexao.fechar()
        }
      },
      fechar() {
        if (fechado) return
        fechado = true
        for (const f of soltar) f()
        soltar = []
        try {
          saida?.close()
        } catch {
          // já fechado pelo cliente
        }
      },
    }
    const entregar = (p: EventoPublicado) => {
      if (visivelPara(p.publico, p.usuarioId, { id: conexao.usuarioId, papel: conexao.papel })) {
        conexao.escrever(blocoSse('d', p.evento, p.evento.s))
      }
    }

    const fluxo = new ReadableStream<Uint8Array>({
      start(controle) {
        saida = controle
        conexao.escrever('retry: 1000\n\n')
        // retomada e inscrição no mesmo tick síncrono: nenhum evento entra entre a releitura e o ao vivo
        if (desde !== null) {
          const motivo = motivoResync(db, desde)
          if (motivo) {
            conexao.escrever(blocoSse('resync', { motivo } satisfies EventoResync))
          } else {
            let ultimo = desde
            for (let lote = eventosDesde(db, ultimo, 1000); lote.length > 0; lote = eventosDesde(db, ultimo, 1000)) {
              for (const l of lote) entregar(linhaParaEvento(l))
              ultimo = lote.at(-1)!.seq
            }
          }
        }
        soltar.push(barramento(db).inscrever(entregar))
        soltar.push(registrarConexao(db, conexao))
        const ping = setInterval(() => {
          const r = revalidar(db, conexao)
          if (r === 'fechar') return conexao.fechar()
          if (r === 'resync') conexao.escrever(blocoSse('resync', { motivo: 'papel_alterado' } satisfies EventoResync))
          conexao.escrever(blocoSse('ping', { seq: seqAtual(db) } satisfies EventoPing))
        }, intervaloPingMs())
        ping.unref()
        soltar.push(() => clearInterval(ping))
      },
      cancel() {
        conexao.fechar()
      },
    })
    c.req.raw.signal.addEventListener('abort', () => conexao.fechar(), { once: true })
    return new Response(fluxo, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
    })
  })

  app.get('/api/sync', exigirUsuario, (c) => {
    const db = c.get('db')
    const u = c.get('ator').usuario!
    const desde = lerSeq(c.req.query('desde'))
    if (desde === null) throw validacao('Informe ?desde=<seq>.', { desde: 'obrigatório' })
    if (motivoResync(db, desde)) return c.json({ resync: true, seq: seqAtual(db) } satisfies SyncSaida)
    const linhas = eventosDesde(db, desde, 500)
    const eventos = linhas.map(linhaParaEvento).filter((p) => visivelPara(p.publico, p.usuarioId, { id: u.id, papel: u.papel }))
      .map((p) => p.evento)
    const seq = linhas.length === 500 ? linhas.at(-1)!.seq : seqAtual(db)
    return c.json({ resync: false, seq, eventos } satisfies SyncSaida)
  })

  app.get('/api/bootstrap', exigirUsuario, (c) => c.json(montarBootstrap(c.get('db'), c.get('ator'))))
}
