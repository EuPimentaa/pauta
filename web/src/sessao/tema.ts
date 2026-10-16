/**
 * Tema entre aparelhos: prefs.tema (servidor) manda; o localStorage guarda para pintar antes do login.
 *   useSincronizarTema()   montado na área autenticada: aplica o prefs.tema que chegou no bootstrap
 *   const mudar = useMudarTema(); mudar('escuro')
 */
import { useCallback, useEffect } from 'react'
import { useEditarEu, useSessao } from '../api/auth.ts'
import { aplicarTema, lerPreferenciaTema, type PreferenciaTema } from '../lib/tema.ts'

export function useSincronizarTema(): void {
  const { eu } = useSessao({ buscar: false })
  const doServidor = eu?.prefs.tema
  useEffect(() => {
    if (doServidor && doServidor !== lerPreferenciaTema()) aplicarTema(doServidor)
  }, [doServidor])
}

export function useMudarTema(): (p: PreferenciaTema) => void {
  const editar = useEditarEu()
  const comSessao = !!useSessao({ buscar: false }).eu
  return useCallback((p: PreferenciaTema) => {
    aplicarTema(p)
    if (comSessao) void editar({ prefs: { tema: p } }, { silencioso: true })
  }, [comSessao, editar])
}
