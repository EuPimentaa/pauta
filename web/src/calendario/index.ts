/**
 * Calendário de demandas para a Agenda (F3) e o Calendário do quadro (F6) (PLANO §2.2):
 *   <CalendarioDemandas modo="mes" inicio={d} mudarPeriodo={...} itens={[{ demanda, campo: 'prazo', data, hora }]}
 *     feriados={feriados} semPrazo={semPrazo} mostrarQuadro abrir={(n) => navegar(`/d/${n}`)} />
 */
export { CalendarioDemandas, type ItemCalendarioDemanda, type PropsCalendarioDemandas } from './CalendarioDemandas.tsx'
