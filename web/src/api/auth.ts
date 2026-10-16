/**
 * Sessão e conta (API §4.2). `useEu` é a única fonte de "quem sou eu": lê ['bootstrap'].eu quando há bootstrap e,
 * fora da área autenticada, GET /api/auth/eu (chave ['eu']).
 *
 *   const eu = useEu()                        // dentro da área autenticada (sempre definido)
 *   const { eu, carregando } = useSessao()    // em qualquer lugar (eu nulo = sem sessão)
 */
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import type {
  Bootstrap, DefinirSenhaEntrada, EditarEuEntrada, Eu, LoginEntrada, TokenAcessoInfo, TrocarSenhaEntrada,
} from '@shared/tipos/index.ts'
import { apagarRascunhosLocais } from '../lib/armazenamento.ts'
import { avisar } from '../ui/avisos.tsx'
import { api, mensagemDeErro, type ErroDaApi } from './cliente.ts'
import { CHAVE_BOOTSTRAP, opcoesBootstrap } from './bootstrap.ts'

export const CHAVE_EU = ['eu'] as const

/** Atualiza o `eu` nos dois lugares em que ele mora (bootstrap e ['eu']). */
export function atualizarEu(qc: QueryClient, fn: (eu: Eu) => Eu): void {
  qc.setQueryData<Bootstrap>(CHAVE_BOOTSTRAP, (b) => (b ? { ...b, eu: fn(b.eu) } : b))
  qc.setQueryData<Eu>(CHAVE_EU, (eu) => (eu ? fn(eu) : eu))
}

export function euEmCache(qc: QueryClient): Eu | undefined {
  return qc.getQueryData<Bootstrap>(CHAVE_BOOTSTRAP)?.eu ?? qc.getQueryData<Eu>(CHAVE_EU)
}

/** Eu da sessão ou nulo. `buscar: false` não consulta o servidor (só lê o cache). */
export function useSessao(opcoes: { buscar?: boolean } = {}): { eu: Eu | null; carregando: boolean; erro: ErroDaApi | null } {
  const boot = useQuery<Bootstrap, ErroDaApi>({ ...opcoesBootstrap, enabled: false })
  const temBoot = !!boot.data
  const consulta = useQuery<Eu, ErroDaApi>({
    queryKey: CHAVE_EU,
    queryFn: ({ signal }) => api<Eu>('GET', '/api/auth/eu', { sinal: signal, redirecionar401: false }),
    enabled: !temBoot && opcoes.buscar !== false,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
  if (boot.data) return { eu: boot.data.eu, carregando: false, erro: null }
  return { eu: consulta.data ?? null, carregando: consulta.isPending && consulta.fetchStatus !== 'idle', erro: consulta.error }
}

/** Quem sou eu, na área autenticada (a casca só renderiza depois do bootstrap). */
export function useEu(): Eu {
  const { eu } = useSessao({ buscar: false })
  if (!eu) throw new Error('useEu() fora da área autenticada: use useSessao() em telas públicas.')
  return eu
}

export function useEntrar() {
  const qc = useQueryClient()
  return useMutation<Eu, ErroDaApi, LoginEntrada>({
    mutationFn: (e) => api<Eu>('POST', '/api/auth/login', { corpo: e }),
    onSuccess: (eu) => {
      qc.removeQueries({ queryKey: CHAVE_BOOTSTRAP })
      qc.setQueryData(CHAVE_EU, eu)
    },
  })
}

/** Sai e recarrega em /entrar (fecha o SSE e limpa todo o cache). */
export function useSair(): () => Promise<void> {
  const qc = useQueryClient()
  return async () => {
    try { await api('POST', '/api/auth/logout', { redirecionar401: false }) } catch { /* já sem sessão */ }
    qc.clear()
    // rascunhos não enviados não ficam para a próxima pessoa deste navegador
    apagarRascunhosLocais()
    window.location.assign('/entrar')
  }
}

export type FinalidadeToken = 'convite' | 'redefinicao'

/** Confere o token do link (não consome). Erro 410 token_invalido = usado, revogado ou expirado. */
export function useConsultarToken(finalidade: FinalidadeToken, token: string | null): UseQueryResult<TokenAcessoInfo, ErroDaApi> {
  return useQuery<TokenAcessoInfo, ErroDaApi>({
    queryKey: ['token-acesso', finalidade, token],
    queryFn: () => api<TokenAcessoInfo>('POST', `/api/auth/${finalidade}/consultar`, { corpo: { token } }),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

/** Define a senha pelo convite ou pela redefinição; já entra (cookie) e devolve o Eu. */
export function useDefinirSenha(finalidade: FinalidadeToken) {
  const qc = useQueryClient()
  return useMutation<Eu, ErroDaApi, DefinirSenhaEntrada>({
    mutationFn: (e) => api<Eu>('POST', `/api/auth/${finalidade}`, { corpo: e }),
    onSuccess: (eu) => {
      qc.removeQueries({ queryKey: CHAVE_BOOTSTRAP })
      qc.setQueryData(CHAVE_EU, eu)
    },
  })
}

export function useTrocarSenha() {
  return useMutation<void, ErroDaApi, TrocarSenhaEntrada>({
    mutationFn: (e) => api<void>('POST', '/api/auth/senha', { corpo: e }),
  })
}

/**
 * PATCH /api/auth/eu otimista (nome, apelido, cor, prefs mescladas). Reverte e avisa no erro; devolve null aí.
 * `silencioso`: sem aviso de erro (preferências de interface, como o menu recolhido).
 */
export function useEditarEu(): (e: EditarEuEntrada, opcoes?: { silencioso?: boolean }) => Promise<Eu | null> {
  const qc = useQueryClient()
  // estável entre renders: quem guarda em useCallback/useEffect (menu recolhido, tecla [) não re-registra à toa
  return useCallback(async (e: EditarEuEntrada, opcoes?: { silencioso?: boolean }) => {
    const antes = euEmCache(qc)
    atualizarEu(qc, (eu) => ({
      ...eu,
      prefs: e.prefs ? { ...eu.prefs, ...e.prefs } : eu.prefs,
      usuario: {
        ...eu.usuario,
        ...(e.nome !== undefined ? { nome: e.nome } : {}),
        ...(e.apelido !== undefined ? { apelido: e.apelido } : {}),
        ...(e.cor !== undefined ? { cor: e.cor } : {}),
      },
    }))
    try {
      const eu = await api<Eu>('PATCH', '/api/auth/eu', { corpo: e })
      atualizarEu(qc, (atual) => ({ ...atual, usuario: eu.usuario, prefs: eu.prefs }))
      return eu
    } catch (erro) {
      if (antes) atualizarEu(qc, () => antes)
      if (!opcoes?.silencioso) avisar(mensagemDeErro(erro), { tipo: 'erro' })
      return null
    }
  }, [qc])
}
