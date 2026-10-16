/**
 * /convite e /redefinir: o token chega no fragmento (#…), é apagado da URL na hora e vai só no corpo (API §4.2).
 * Confere o link, mostra de quem é, pede a senha (10 caracteres ou mais) e já entra.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Check, Circle, LinkIcon } from 'lucide-react'
import { useConsultarToken, useDefinirSenha, type FinalidadeToken } from '../../api/auth.ts'
import { useNomeApp } from '../../lib/app.ts'
import { aplicarTema } from '../../lib/tema.ts'
import { Avatar } from '../../ui/Avatar.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Esqueleto } from '../../ui/Indicadores.tsx'
import { AlertaErro, CampoSenha, mensagemAcesso, tokenDoFragmento } from './comum.tsx'
import { LayoutAuth } from './LayoutAuth.tsx'

const MINIMO = 10

const TEXTOS: Record<FinalidadeToken, { titulo: string; sub: (app: string) => string; botao: string; invalido: string; invalidoTexto: string }> = {
  convite: {
    titulo: 'Boas-vindas',
    sub: (app) => `Defina uma senha para entrar no ${app}.`,
    botao: 'Definir a senha e entrar',
    invalido: 'Este convite não vale mais.',
    invalidoTexto: 'Ele pode ter sido usado, ter passado dos 7 dias ou ter sido trocado por um novo. Peça um link novo ao admin.',
  },
  redefinicao: {
    titulo: 'Nova senha',
    sub: () => 'Escolha uma senha nova. As sessões abertas em outros aparelhos serão encerradas.',
    botao: 'Salvar a senha e entrar',
    invalido: 'Este link de redefinição não vale mais.',
    invalidoTexto: 'Ele pode ter sido usado ou ter passado de 1 hora. Peça um link novo ao admin.',
  },
}

export function TelaDefinirSenha({ finalidade }: { finalidade: FinalidadeToken }) {
  const app = useNomeApp()
  const t = TEXTOS[finalidade]
  const navegar = useNavigate()
  const [token, setToken] = useState(tokenDoFragmento)
  const consulta = useConsultarToken(finalidade, token)
  const definir = useDefinirSenha(finalidade)
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [tentou, setTentou] = useState(false)

  // link novo colado nesta mesma aba (só o # muda, a página não recarrega): lê o token de novo e recomeça
  const { reset } = definir
  useEffect(() => {
    const aoMudar = () => {
      if (!window.location.hash) return
      setToken(tokenDoFragmento())
      reset()
      setTentou(false)
    }
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [reset])

  const tamanhoOk = senha.length >= MINIMO
  const iguais = senha.length > 0 && senha === confirmacao
  const erroSenhaFraca = definir.error?.codigo === 'senha_fraca' ? definir.error.mensagem : undefined

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTentou(true)
    if (!token || !tamanhoOk || !iguais) return
    try {
      const eu = await definir.mutateAsync({ token, senha })
      if (eu.prefs.tema) aplicarTema(eu.prefs.tema)
      navegar(eu.rotaInicial, { replace: true })
    } catch {
      // o erro aparece no formulário
    }
  }

  const invalido = !token || consulta.error?.codigo === 'token_invalido' || definir.error?.codigo === 'token_invalido'
  if (invalido) {
    return (
      <LayoutAuth titulo={token ? t.invalido : 'O link chegou incompleto.'}
        subtitulo={token ? t.invalidoTexto : 'Abra o endereço exatamente como você recebeu (com tudo depois do #), ou peça um link novo ao admin.'}
        rodape="O admin gera um link novo em Configurações › Pessoas.">
        <div className="mt-6 flex items-center gap-3 rounded-md bg-sunken p-3 text-meta text-fg-2">
          <LinkIcon className="size-4 flex-none" aria-hidden="true" />
          Links de acesso valem uma vez só, por segurança.
        </div>
      </LayoutAuth>
    )
  }

  return (
    <LayoutAuth titulo={t.titulo} subtitulo={t.sub(app)} rodape="Use uma senha que você não usa em outro lugar. Um gerenciador de senhas ajuda.">
      {consulta.isPending ? (
        <div className="auth-pessoa" aria-hidden="true"><Esqueleto largura={40} altura={40} raio={999} /><div className="flex flex-1 flex-col gap-2"><Esqueleto largura="55%" /><Esqueleto largura="75%" altura={11} /></div></div>
      ) : consulta.data ? (
        <div className="auth-pessoa">
          <Avatar pessoa={{ nome: consulta.data.nome }} tamanho={40} dica={false} />
          <div className="min-w-0"><strong className="truncate">{consulta.data.nome}</strong><span className="block truncate">{consulta.data.email}</span></div>
        </div>
      ) : null}
      <form className="auth-form" onSubmit={enviar} noValidate>
        {consulta.error && consulta.error.codigo !== 'token_invalido' && <AlertaErro>{mensagemAcesso(consulta.error)}</AlertaErro>}
        {definir.error && !erroSenhaFraca && definir.error.codigo !== 'token_invalido' && <AlertaErro>{mensagemAcesso(definir.error)}</AlertaErro>}
        {/* o e-mail ajuda o gerenciador de senhas a guardar a conta certa */}
        {consulta.data && <input type="email" name="username" autoComplete="username" value={consulta.data.email} readOnly hidden />}
        <CampoSenha rotulo="Senha" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus
          erro={erroSenhaFraca ?? (tentou && !tamanhoOk ? `Use pelo menos ${MINIMO} caracteres.` : undefined)} aria-describedby="regras-senha" />
        <CampoSenha rotulo="Repita a senha" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)}
          erro={tentou && tamanhoOk && !iguais ? 'As duas senhas estão diferentes.' : undefined} />
        <div id="regras-senha" className="auth-regras" aria-live="polite">
          <span className="auth-regra" data-ok={tamanhoOk}>{tamanhoOk ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}{MINIMO} caracteres ou mais</span>
          <span className="auth-regra" data-ok={iguais}>{iguais ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}As duas senhas iguais</span>
        </div>
        <Botao type="submit" variante="primario" tamanho="g" larguraTotal iconeDireita={ArrowRight} carregando={definir.isPending}
          disabled={consulta.isPending}>
          {t.botao}
        </Botao>
      </form>
    </LayoutAuth>
  )
}
