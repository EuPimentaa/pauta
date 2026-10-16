/**
 * Tratador do F5: mantém as chaves de cadastros (PLANO §2.1) que o núcleo não conhece. O bootstrap e o detalhe do
 * cliente aberto já são do tratador `nucleo-cadastros`/`nucleo-quadros`; aqui só se invalida o que é lista do F5
 * (as consultas inativas não buscam de novo, só ficam velhas). Demandas mexem nos contadores dos clientes e no
 * Arquivo: com um intervalo de 1,5 s para não buscar a cada arraste.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { ConfigApp, ConfigAppSaida, EventoTempoReal } from '@shared/tipos/index.ts'
import type { TratadorEventos } from '../tipos.ts'
import { chaves } from '../../api/chaves.ts'

const ESPERA_MS = 1500
const pendentes = new Map<string, ReturnType<typeof setTimeout>>()

function depois(chave: string, fn: () => void): void {
  if (pendentes.has(chave)) return
  pendentes.set(chave, setTimeout(() => { pendentes.delete(chave); fn() }, ESPERA_MS))
}

function quadroDoEvento(ev: EventoTempoReal): string | null {
  const p = ev.p as { quadroId?: string } | null
  return p?.quadroId ?? null
}

function tratar(ev: EventoTempoReal, qc: QueryClient): void {
  switch (ev.e) {
    case 'cliente': case 'cliente_contato': case 'cliente_link':
      depois('clientes', () => void qc.invalidateQueries({ queryKey: chaves.clientes }))
      return
    case 'usuario': case 'equipe':
      depois('pessoas', () => void qc.invalidateQueries({ queryKey: chaves.pessoas }))
      return
    case 'feriado':
      void qc.invalidateQueries({ queryKey: ['feriados'] })
      return
    case 'config':
      if (ev.op === 'upsert') {
        qc.setQueryData<ConfigAppSaida>(chaves.configApp, (s) => (s ? { ...s, config: { ...s.config, ...(ev.p as Partial<ConfigApp>) } } : s))
      }
      return
    case 'quadro':
      void qc.invalidateQueries({ queryKey: chaves.quadrosArquivados })
      void qc.invalidateQueries({ queryKey: chaves.quadro(ev.id) })
      return
    case 'coluna': case 'etiqueta': case 'automacao': {
      const q = quadroDoEvento(ev)
      if (q) void qc.invalidateQueries({ queryKey: chaves.quadro(q) })
      else void qc.invalidateQueries({ queryKey: ['quadro'] })
      return
    }
    case 'aprovacao':
      void qc.invalidateQueries({ predicate: (c) => c.queryKey[0] === 'cliente' && c.queryKey[2] === 'aprovacoes' })
      return
    case 'demanda':
      depois('arquivo', () => {
        void qc.invalidateQueries({ queryKey: ['arquivo'] })
        void qc.invalidateQueries({ queryKey: chaves.clientes })
      })
      return
    default:
      return
  }
}

export const tratador: TratadorEventos = {
  id: 'cadastros',
  entidades: ['cliente', 'cliente_contato', 'cliente_link', 'usuario', 'equipe', 'feriado', 'config', 'quadro', 'coluna', 'etiqueta', 'automacao', 'aprovacao', 'demanda'],
  tratar,
}
