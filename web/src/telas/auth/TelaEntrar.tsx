/** /entrar: e-mail e senha (API §4.2). Depois de entrar, volta para onde estava (?volta=) ou para o Início. */
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowRight, Mail } from 'lucide-react'
import { useEntrar } from '../../api/auth.ts'
import { useNomeApp } from '../../lib/app.ts'
import { focoNaCarga } from '../../lib/foco.ts'
import { aplicarTema } from '../../lib/tema.ts'
import { Botao } from '../../ui/Botao.tsx'
import { Campo } from '../../ui/Campo.tsx'
import { AlertaErro, CampoSenha, mensagemAcesso, voltaSegura } from './comum.tsx'
import { LayoutAuth } from './LayoutAuth.tsx'

export default function TelaEntrar() {
  const nome = useNomeApp()
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const entrar = useEntrar()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [tentou, setTentou] = useState(false)

  const erroEmail = tentou && !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Informe o e-mail.' : undefined
  const erroSenha = tentou && !senha ? 'Informe a senha.' : undefined

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTentou(true)
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || !senha) return
    try {
      const eu = await entrar.mutateAsync({ email: email.trim().toLowerCase(), senha })
      if (eu.prefs.tema) aplicarTema(eu.prefs.tema)
      navegar(voltaSegura(params.get('volta')) ?? eu.rotaInicial, { replace: true })
    } catch {
      setSenha('')
    }
  }

  // vindo da conexão do Claude (/oauth/autorizar sem sessão → /entrar?volta=/autorizar…): a tela diz para quê
  const doClaude = (voltaSegura(params.get('volta')) ?? '').startsWith('/autorizar')
  return (
    <LayoutAuth
      titulo="Entrar"
      subtitulo={doClaude
        ? <>Entre para conectar o Claude ao {nome}. Use o e-mail e a senha da sua conta.</>
        : <>Use o e-mail e a senha da sua conta no {nome}.</>}
      rodape="Esqueceu a senha? Peça ao admin um link de redefinição. Primeiro acesso: use o link de convite que você recebeu."
    >
      <form className="auth-form" onSubmit={enviar} noValidate>
        {entrar.error && <AlertaErro>{mensagemAcesso(entrar.error)}</AlertaErro>}
        <Campo rotulo="E-mail" type="email" icone={Mail} autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
          value={email} onChange={(e) => setEmail(e.target.value)} erro={erroEmail} autoFocus={focoNaCarga()} required />
        <CampoSenha rotulo="Senha" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)}
          erro={erroSenha} required />
        <Botao type="submit" variante="primario" tamanho="g" larguraTotal iconeDireita={ArrowRight} carregando={entrar.isPending}>
          Entrar
        </Botao>
      </form>
    </LayoutAuth>
  )
}
