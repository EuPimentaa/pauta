/**
 * Configurações › Sua conta (todos; integração 3A, revisão visual 15 e funcional 14): nome, apelido e cor (como você
 * aparece nas colunas, nos membros e nas @menções) e trocar a senha. Antes ficava dentro de Aparência, onde ninguém
 * procurava "senha". O menu do avatar também leva para cá. As mudanças não salvas ficam guardadas (pendentes.tsx).
 */
import { useState } from 'react'
import { KeyRound, UserRound } from 'lucide-react'
import type { Cor } from '@shared/tipos/index.ts'
import { useEditarEu, useEu, useTrocarSenha } from '../../api/auth.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo } from '../../ui/Campo.tsx'
import { SeletorCor } from '../../ui/SeletorCor.tsx'
import { erroDoCampo, mensagemGeral, Painel } from './comum.tsx'
import { RodapePendente, useRascunhoConfig } from './pendentes.tsx'

interface Dados { nome: string; apelido: string; cor: Cor }

function SeusDados() {
  const eu = useEu()
  const editar = useEditarEu()
  const inicial: Dados = { nome: eu.usuario.nome, apelido: eu.usuario.apelido ?? '', cor: eu.usuario.cor }
  const [d, definir, esquecer] = useRascunhoConfig<Dados>(`config:conta:${eu.usuario.id}`, inicial)
  const [salvando, setSalvando] = useState(false)
  const mudancas = [d.nome.trim() !== eu.usuario.nome, (d.apelido.trim() || null) !== eu.usuario.apelido, d.cor !== eu.usuario.cor]
    .filter(Boolean).length

  async function salvar() {
    if (!d.nome.trim()) return
    setSalvando(true)
    const r = await editar({ nome: d.nome.trim(), apelido: d.apelido.trim() || null, cor: d.cor })
    setSalvando(false)
    if (r) {
      esquecer({ nome: d.nome.trim(), apelido: d.apelido.trim(), cor: d.cor })
      avisar('Seus dados foram salvos.', { tipo: 'sucesso' })
    }
  }

  return (
    <form className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
      <div className="cad-grade-2">
        <Campo rotulo="Nome" value={d.nome} maxLength={120} autoComplete="name" erro={!d.nome.trim() ? 'Escreva o seu nome.' : undefined}
          ajuda="Como você aparece para todos." onChange={(e) => definir({ ...d, nome: e.target.value })} />
        <Campo rotulo="Apelido" opcional value={d.apelido} maxLength={40} autoComplete="nickname" ajuda="Nome da sua coluna e das @menções."
          onChange={(e) => definir({ ...d, apelido: e.target.value })} />
      </div>
      <div className="cad-campo-cor">
        <span className="ui-rotulo">Sua cor</span>
        <SeletorCor valor={d.cor} rotulo="Sua cor" aoMudar={(c) => c && definir({ ...d, cor: c })} />
      </div>
      <RodapePendente mudancas={mudancas} aoDescartar={() => esquecer()}>
        <Botao type="submit" variante="primario" carregando={salvando} disabled={mudancas === 0 || !d.nome.trim()}>Salvar meus dados</Botao>
      </RodapePendente>
    </form>
  )
}

function Senha() {
  const trocar = useTrocarSenha()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [erro, setErro] = useState<unknown>(null)
  const curta = nova.length > 0 && nova.length < 10

  async function enviar() {
    setErro(null)
    try {
      await trocar.mutateAsync({ senhaAtual: atual, senhaNova: nova })
      setAtual(''); setNova('')
      avisar('Senha trocada.', { tipo: 'sucesso', descricao: 'As suas outras sessões foram encerradas.' })
    } catch (e) {
      setErro(e)
    }
  }

  const codigo = (erro as { codigo?: string } | null)?.codigo
  return (
    <form className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); if (atual && nova.length >= 10) void enviar() }}>
      <div className="cad-grade-2">
        <Campo rotulo="Senha atual" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)}
          erro={codigo === 'credenciais_invalidas' ? 'A senha atual não confere.' : undefined} />
        <Campo rotulo="Senha nova" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)}
          ajuda="Pelo menos 10 caracteres." erro={curta ? 'Pelo menos 10 caracteres.' : codigo === 'senha_fraca' ? mensagemGeral(erro) : erroDoCampo(erro, 'senhaNova')} />
      </div>
      {erro && codigo !== 'credenciais_invalidas' && codigo !== 'senha_fraca' ? <p className="ui-campo-erro">{mensagemGeral(erro)}</p> : null}
      <div className="cad-rodape-form">
        <Botao type="submit" variante="secundario" carregando={trocar.isPending} disabled={!atual || nova.length < 10}>Trocar a senha</Botao>
      </div>
    </form>
  )
}

export default function ConfigConta() {
  const eu = useEu()
  return (
    <div className="cad-secao">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h2 className="cad-titulo">Sua conta</h2>
          <p className="cad-subtitulo">Entra com {eu.usuario.email}. O e-mail e o papel ficam com o admin, em Pessoas.</p>
        </div>
      </header>
      <Painel titulo="Seus dados" icone={UserRound} id="cad-conta">
        <div className="cad-painel-corpo"><SeusDados /></div>
      </Painel>
      <Painel titulo="Senha" icone={KeyRound} id="cad-senha">
        <div className="cad-painel-corpo"><Senha /></div>
      </Painel>
    </div>
  )
}
