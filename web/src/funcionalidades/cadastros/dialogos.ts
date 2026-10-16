/**
 * Diálogos que só o F5 abre (extensoes/tipos.ts permite aumentar o MapaDialogos com `declare module` nesse caso):
 * `copiar-quadro` ("Copiar quadro" do menu ··· do quadro e de Configurações › Quadros).
 */
import type { Id, QuadroCompleto } from '@shared/tipos/index.ts'

declare module '../../extensoes/tipos.ts' {
  interface MapaDialogos {
    /** F5. Nome (padrão "<nome> 2"), equipe e seguidores; copia colunas, etiquetas, automações e modelos, sem cards. */
    'copiar-quadro': { quadroId: Id }
  }
  interface MapaResultadosDialogos {
    'copiar-quadro': { quadro: QuadroCompleto }
  }
}

export {}
