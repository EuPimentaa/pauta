/**
 * Listas do Início calculadas do bootstrap (as mesmas funções de shared/logica/paineis.ts que o servidor usa): o card
 * entra e sai do Início na hora em que muda, aqui ou em outra janela (o tempo real já aplicou no bootstrap).
 */
import { useMemo } from 'react'
import type { Bootstrap, Demanda, Id, MinhasPorPrazo, PapelColuna } from '@shared/tipos/index.ts'
import { comClienteParado, minhasPorPrazo, resumoInicio } from '@shared/logica/paineis.ts'
import { useEu } from '../../api/auth.ts'
import { useDemandas, useDoBootstrap, useFeriados } from '../../api/seletores.ts'
import { useAgora } from '../../quadro/estado.ts'

export interface DadosInicio {
  minhas: MinhasPorPrazo
  resumo: { atrasadas: number; hoje: number; comCliente: number }
  /** As do meu atendimento com o cliente há mais de N dias úteis (atendimento e admin). */
  parado: { id: Id; dias: number }[]
  /** Atendimento ou admin (vê o bloco "com o cliente há mais de N"). */
  veParado: boolean
  limiteParado: number
  porId: Map<Id, Demanda>
}

const selPapeis = (b: Bootstrap) => b.colunas
const selLimite = (b: Bootstrap) => b.config.clienteParadoDiasUteis

export function useDadosInicio(): DadosInicio {
  const eu = useEu()
  const demandas = useDemandas()
  const colunas = useDoBootstrap(selPapeis)
  const limiteParado = useDoBootstrap(selLimite) ?? 2
  const feriados = useFeriados()
  const agora = useAgora()
  const euId = eu.usuario.id
  const veParado = eu.usuario.papel === 'atendimento' || eu.usuario.papel === 'admin'
  const papelDe = useMemo(() => {
    const papeis = new Map<Id, PapelColuna>((colunas ?? []).map((c) => [c.id, c.papel]))
    return (id: Id): PapelColuna => papeis.get(id) ?? 'normal'
  }, [colunas])
  return useMemo(() => {
    const minhas = minhasPorPrazo(demandas, papelDe, euId, agora)
    return {
      minhas,
      resumo: resumoInicio(minhas, demandas, papelDe, euId),
      parado: veParado ? comClienteParado(demandas, papelDe, euId, agora, feriados, limiteParado) : [],
      veParado,
      limiteParado,
      porId: new Map(demandas.map((d) => [d.id, d])),
    }
  }, [demandas, papelDe, euId, agora, feriados, limiteParado, veParado])
}
