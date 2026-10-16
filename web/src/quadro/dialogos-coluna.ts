/**
 * Diálogos que só o menu da coluna do núcleo abre (o contrato permite aumentar MapaDialogos para diálogos próprios):
 * "Limite WIP…" e "Mover todos os cards…". Eles mesmos fazem a mudança e devolvem { feito: true }.
 */
import type { Id } from '@shared/tipos/index.ts'

declare module '../extensoes/tipos.ts' {
  interface MapaDialogos {
    'nucleo-limite-wip': { colunaId: Id }
    'nucleo-mover-cards': { colunaId: Id }
  }
  interface MapaResultadosDialogos {
    'nucleo-limite-wip': { feito: true }
    'nucleo-mover-cards': { feito: true }
  }
}

export {}
