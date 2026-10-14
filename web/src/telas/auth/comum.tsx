/** Peças das telas de acesso: campo de senha com mostrar/ocultar, alerta de erro, `volta` seguro e o token do link. */
import { useId, useState, type InputHTMLAttributes } from 'react'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import type { ErroDaApi } from '../../api/cliente.ts'
import { BotaoIcone } from '../../ui/Botao.tsx'
import { Campo } from '../../ui/Campo.tsx'

export function CampoSenha({ rotulo, erro, ajuda, ...input }: { rotulo: string; erro?: string; ajuda?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [ver, setVer] = useState(false)
  return (
    <Campo
      rotulo={rotulo}
      type={ver ? 'text' : 'password'}
      erro={erro}
      ajuda={ajuda}
      spellCheck={false}
      autoCapitalize="none"
      sufixo={<BotaoIcone icone={ver ? EyeOff : Eye} rotulo={ver ? 'Ocultar a senha' : 'Mostrar a senha'} tamanho="p" aria-pressed={ver} onClick={() => setVer(!ver)} />}
      {...input}
    />
  )
}

export function AlertaErro({ children }: { children: string }) {
  const id = useId()
  return <div id={id} role="alert" className="auth-alerta"><AlertCircle aria-hidden="true" /><span>{children}</span></div>
}

/** Texto do erro de acesso, com o tempo de espera do 429. */
export function mensagemAcesso(e: ErroDaApi): string {
  if (e.codigo === 'muitas_tentativas') {
    const s = Number(e.detalhes?.tenteEmSegundos ?? 0)
    const quando = s >= 90 ? `${Math.ceil(s / 60)} minutos` : s > 0 ? `${s} segundos` : 'alguns minutos'
    return `Muitas tentativas seguidas. Tente de novo em ${quando}.`
  }
  if (e.codigo === 'credenciais_invalidas') return 'E-mail ou senha incorretos.'
  if (e.codigo === 'rede') return 'Sem conexão com o servidor. Confira a internet e tente de novo.'
  return e.mensagem
}

/** Só caminhos internos ("/q/criacao"), nunca "//outro.site" nem "https://…" (redirecionamento aberto). */
export function voltaSegura(volta: string | null): string | null {
  if (!volta || !volta.startsWith('/') || volta.startsWith('//') || volta.startsWith('/\\')) return null
  if (/^\/(entrar|convite|redefinir)(\/|\?|#|$)/.test(volta)) return null
  return volta
}

let tokenLido: string | null | undefined

/**
 * Lê o token do fragmento (/convite#<token>) uma vez e apaga o fragmento da URL (history.replaceState), para ele não
 * ficar no histórico nem em print de tela.
 */
export function tokenDoFragmento(): string | null {
  const bruto = window.location.hash.replace(/^#/, '').trim()
  if (!bruto) return tokenLido ?? null
  tokenLido = /^[A-Za-z0-9_-]{16,200}$/.test(bruto) ? bruto : null
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  return tokenLido
}
