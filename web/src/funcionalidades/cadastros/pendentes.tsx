/**
 * Mudanças não salvas em Configurações (integração 3A, revisão visual 2): o formulário fica em memória por chave
 * (sobrevive a ir para outra seção, trocar o quadro do seletor e voltar; some ao salvar, descartar ou recarregar), a
 * barra do rodapé gruda na tela com "1 mudança não salva · Descartar · Salvar" e fechar a aba pergunta antes.
 * O roteador é o BrowserRouter (sem useBlocker): por isso guardar, em vez de bloquear a navegação.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Botao } from '../../ui/Botao.tsx'

const memoria = new Map<string, unknown>()

/** Estado do formulário com cópia em memória por `chave`; `esquecer` volta ao valor inicial (salvou ou descartou). */
export function useRascunhoConfig<T>(chave: string, inicial: T): [T, (v: T) => void, (novo?: T) => void] {
  const [valor, setValor] = useState<T>(() => (memoria.has(chave) ? (memoria.get(chave) as T) : inicial))
  const definir = (v: T) => { memoria.set(chave, v); setValor(v) }
  const esquecer = (novo?: T) => { memoria.delete(chave); setValor(novo ?? inicial) }
  return [valor, definir, esquecer]
}

/** Há uma cópia guardada para esta chave (a tela mostra que voltou com mudanças). */
export const temRascunhoConfig = (chave: string) => memoria.has(chave)

/** Fechar ou recarregar a aba com mudanças pendentes pergunta antes (o navegador escreve a pergunta). */
export function useAvisoAoSair(pendente: boolean): void {
  useEffect(() => {
    if (!pendente) return
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [pendente])
}

/**
 * Rodapé do formulário: com mudanças, gruda no fim da tela e diz quantas são; sem mudanças, só o botão (desabilitado
 * pelo chamador).
 */
export function RodapePendente({ mudancas, aoDescartar, children, rotulo }: {
  mudancas: number
  aoDescartar(): void
  /** O botão de salvar. */
  children: ReactNode
  /** Texto no lugar do número ("Mudanças não salvas neste quadro"). */
  rotulo?: string
}) {
  useAvisoAoSair(mudancas > 0)
  return (
    <div className="cad-rodape-form" data-pendente={mudancas > 0 || undefined}>
      {mudancas > 0 && (
        <span className="cad-pendente-texto" role="status">
          {rotulo ?? (mudancas === 1 ? '1 mudança não salva' : `${mudancas} mudanças não salvas`)}
        </span>
      )}
      {mudancas > 0 && <Botao variante="ghost" onClick={aoDescartar}>Descartar</Botao>}
      {children}
    </div>
  )
}
