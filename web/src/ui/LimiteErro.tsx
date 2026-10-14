/**
 * Limite de erro: uma contribuição de extensão quebrada (seção, selo, global) não derruba a tela inteira.
 *   <LimiteErro nome="selo ciclo" fallback={null}>…</LimiteErro>
 * Sem fallback, mostra um aviso discreto com "Tentar de novo".
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props { nome: string; fallback?: ReactNode; children: ReactNode }
interface Estado { erro: Error | null }

export class LimiteErro extends Component<Props, Estado> {
  state: Estado = { erro: null }

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error(`[${this.props.nome}]`, erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback
    return (
      <div role="alert" className="flex items-center gap-3 rounded-md bg-warning-bg px-3 py-2 text-meta text-warning-ink">
        <AlertTriangle className="size-4 flex-none" aria-hidden="true" />
        <span className="flex-1">Esta parte não carregou.</span>
        <button type="button" className="ui-botao" data-variante="ghost" data-tamanho="p" onClick={() => this.setState({ erro: null })}>
          Tentar de novo
        </button>
      </div>
    )
  }
}
