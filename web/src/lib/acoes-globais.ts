/**
 * Ponte para a casca (DESIGN-SYSTEM-WEB) chamar diálogos e ações do NÚCLEO-WEB sem importar código dele: o host de
 * diálogos do NÚCLEO-WEB registra as implementações com definirAcoesGlobais() quando monta. Antes disso (ou sem ele),
 * abrir um diálogo mostra "Disponível em breve." e as ações devolvem null.
 */
import type { AbrirDialogo, AcoesNucleo } from '../extensoes/tipos.ts'
import { avisar } from '../ui/avisos.tsx'

let impl: { abrirDialogo?: AbrirDialogo; acoes?: AcoesNucleo } = {}

export function definirAcoesGlobais(i: { abrirDialogo?: AbrirDialogo; acoes?: AcoesNucleo }): () => void {
  impl = { ...impl, ...i }
  return () => {
    if (i.abrirDialogo && impl.abrirDialogo === i.abrirDialogo) impl = { ...impl, abrirDialogo: undefined }
    if (i.acoes && impl.acoes === i.acoes) impl = { ...impl, acoes: undefined }
  }
}

function emBreve<T>(): Promise<T | null> {
  avisar('Disponível em breve.', { tipo: 'info' })
  return Promise.resolve(null)
}

export const abrirDialogoGlobal: AbrirDialogo = (id, params, opcoes) =>
  impl.abrirDialogo ? impl.abrirDialogo(id, params, opcoes) : emBreve()

export const acoesGlobais: AcoesNucleo = {
  mover: (...a) => impl.acoes?.mover(...a) ?? emBreve(),
  editar: (...a) => impl.acoes?.editar(...a) ?? emBreve(),
  mudarPrazo: (...a) => impl.acoes?.mudarPrazo(...a) ?? emBreve(),
  concluir: (...a) => impl.acoes?.concluir(...a) ?? emBreve(),
  membros: {
    entrar: (...a) => impl.acoes?.membros.entrar(...a) ?? emBreve(),
    sair: (...a) => impl.acoes?.membros.sair(...a) ?? emBreve(),
  },
  etiquetas: {
    por: (...a) => impl.acoes?.etiquetas.por(...a) ?? emBreve(),
    tirar: (...a) => impl.acoes?.etiquetas.tirar(...a) ?? emBreve(),
  },
  arquivar: (...a) => impl.acoes?.arquivar(...a) ?? emBreve(),
  restaurar: (...a) => impl.acoes?.restaurar(...a) ?? emBreve(),
}
