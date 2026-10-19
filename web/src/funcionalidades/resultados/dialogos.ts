/**
 * Diálogos que só o F8 abre (extensoes/tipos.ts permite aumentar o MapaDialogos com `declare module` nesse caso):
 * `resultados-ligar-conta` (Configurações do cliente → Contas de resultados, e o "Ligar contas" da aba vazia).
 */
import type { ConectorWindsor, ContaLigada, Id } from '@shared/tipos/index.ts'

declare module '../../extensoes/tipos.ts' {
  interface MapaDialogos {
    /** F8. Busca na lista da Windsor (com os clientes que já usam cada conta) ou "Digitar o id"; liga ao cliente. */
    'resultados-ligar-conta': { clienteId: Id; conector?: ConectorWindsor }
  }
  interface MapaResultadosDialogos {
    'resultados-ligar-conta': { conta: ContaLigada }
  }
}

export {}
