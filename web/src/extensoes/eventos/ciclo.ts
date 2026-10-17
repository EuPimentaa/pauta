/**
 * Tempo real do ciclo (F2): versões, rodadas, envios, decisões e links públicos no detalhe aberto e na lista de links
 * (['demanda', id, 'links'], só gestão). Idempotente: o objeto inteiro substitui pelo id, o parcial mescla com o que o
 * cache tem; detalhe que não está aberto não muda (ele vem inteiro ao abrir). O `link_publico` só chega a atendimento
 * e admin (público gestão, filtrado no servidor).
 */
import type { Aprovacao, Envio, EventoTempoReal, LinkPublicoResumo, Rodada, VersaoComItens } from '@shared/tipos/index.ts'
import type { TratadorEventos } from '../tipos.ts'
import { aplicarNoDetalhe, comAprovacao, comEnvio, comLink, comRodada, comVersao, mesclarNoDetalhe, mudarLinks } from '../../funcionalidades/ciclo/cache.ts'

function tratar(ev: EventoTempoReal, qc: Parameters<TratadorEventos['tratar']>[1]): void {
  const demandaId = ev.d
  if (!demandaId || ev.op === 'delete') return
  switch (ev.e) {
    case 'versao':
      aplicarNoDetalhe(qc, demandaId, (det) => (ev.c === null ? comVersao(det, ev.p as VersaoComItens)
        : mesclarNoDetalhe(det, 'versoes', ev.id, ev.p as Partial<VersaoComItens>)))
      return
    case 'rodada':
      aplicarNoDetalhe(qc, demandaId, (det) => (ev.c === null ? comRodada(det, ev.p as Rodada)
        : mesclarNoDetalhe(det, 'rodadas', ev.id, ev.p as Partial<Rodada>)))
      return
    case 'envio':
      aplicarNoDetalhe(qc, demandaId, (det) => (ev.c === null ? comEnvio(det, ev.p as Envio) : det))
      return
    case 'aprovacao':
      aplicarNoDetalhe(qc, demandaId, (det) => (ev.c === null ? comAprovacao(det, ev.p as Aprovacao)
        : mesclarNoDetalhe(det, 'aprovacoes', ev.id, ev.p as Partial<Aprovacao>)))
      return
    case 'link_publico': {
      if (ev.c !== null) return
      const l = ev.p as LinkPublicoResumo
      aplicarNoDetalhe(qc, demandaId, (det) => comLink(det, l))
      mudarLinks(qc, demandaId, (lista) => (lista.some((x) => x.id === l.id)
        ? lista.map((x) => (x.id === l.id ? { ...x, ...l } : x))
        : lista))
      // link novo (sem a URL no evento): a lista busca de novo
      if (!qc.getQueryData<LinkPublicoResumo[]>(['demanda', demandaId, 'links'])?.some((x) => x.id === l.id)) {
        void qc.invalidateQueries({ queryKey: ['demanda', demandaId, 'links'], exact: true })
      }
      return
    }
    default:
  }
}

export const tratador: TratadorEventos = {
  id: 'ciclo',
  entidades: ['versao', 'rodada', 'envio', 'aprovacao', 'link_publico'],
  tratar,
}
