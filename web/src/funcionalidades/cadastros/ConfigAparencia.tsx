/**
 * Configurações › Aparência (todos; PLANO §3 F5): tema (Igual ao sistema, Claro, Escuro; prefs.tema, vale nos outros
 * aparelhos) e atalhos de uma tecla (prefs.atalhos). Também a própria conta: nome, apelido, cor e trocar a senha.
 */
import { useId, useState } from 'react'
import { Keyboard, Monitor, Moon, Palette, Sun, UserRound } from 'lucide-react'
import type { Cor } from '@shared/tipos/index.ts'
import { useEditarEu, useEu, useTrocarSenha } from '../../api/auth.ts'
import { useTema, type PreferenciaTema } from '../../lib/tema.ts'
import { useMudarTema } from '../../sessao/tema.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo } from '../../ui/Campo.tsx'
import { Interruptor } from '../../ui/Checkbox.tsx'
import { SeletorCor } from '../../ui/SeletorCor.tsx'
import { erroDoCampo, mensagemGeral, Painel } from './comum.tsx'

const TEMAS: { valor: PreferenciaTema; rotulo: string; texto: string; icone: typeof Sun }[] = [
  { valor: 'sistema', rotulo: 'Igual ao sistema', texto: 'Acompanha o claro e o escuro do aparelho.', icone: Monitor },
  { valor: 'claro', rotulo: 'Claro', texto: 'Fundo claro o tempo todo.', icone: Sun },
  { valor: 'escuro', rotulo: 'Escuro', texto: 'Fundo escuro o tempo todo.', icone: Moon },
]

function Tema() {
  const { preferencia } = useTema()
  const mudar = useMudarTema()
  return (
    <div role="radiogroup" aria-label="Tema" className="cad-opcoes"
      onKeyDown={(e) => {
        const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
        if (!passo) return
        e.preventDefault()
        const grupo = e.currentTarget
        const i = TEMAS.findIndex((t) => t.valor === preferencia)
        mudar(TEMAS[(i + passo + TEMAS.length) % TEMAS.length]!.valor)
        requestAnimationFrame(() => grupo.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
      }}>
      {TEMAS.map(({ valor, rotulo, texto, icone: I }) => (
        <button key={valor} type="button" role="radio" aria-checked={preferencia === valor} tabIndex={preferencia === valor ? 0 : -1}
          className="cad-opcao" onClick={() => mudar(valor)}>
          <span className="cad-opcao-nome"><I aria-hidden="true" />{rotulo}</span>
          <span className="cad-opcao-texto">{texto}</span>
        </button>
      ))}
    </div>
  )
}

function Conta() {
  const eu = useEu()
  const editar = useEditarEu()
  const idForm = useId()
  const [nome, setNome] = useState(eu.usuario.nome)
  const [apelido, setApelido] = useState(eu.usuario.apelido ?? '')
  const [cor, setCor] = useState<Cor>(eu.usuario.cor)
  const [salvando, setSalvando] = useState(false)
  const mudou = nome.trim() !== eu.usuario.nome || (apelido.trim() || null) !== eu.usuario.apelido || cor !== eu.usuario.cor

  async function salvar() {
    if (!nome.trim()) return
    setSalvando(true)
    const r = await editar({ nome: nome.trim(), apelido: apelido.trim() || null, cor })
    setSalvando(false)
    if (r) avisar('Seus dados foram salvos.', { tipo: 'sucesso' })
  }

  return (
    <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
      <div className="cad-grade-2">
        <Campo rotulo="Nome" value={nome} maxLength={120} autoComplete="name" erro={!nome.trim() ? 'Escreva o seu nome.' : undefined}
          onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo="Apelido" opcional value={apelido} maxLength={40} autoComplete="nickname" ajuda="Nome da sua coluna e das @menções."
          onChange={(e) => setApelido(e.target.value)} />
      </div>
      <div className="cad-campo-cor">
        <span className="ui-rotulo">Sua cor</span>
        <SeletorCor valor={cor} rotulo="Sua cor" aoMudar={(c) => c && setCor(c)} />
      </div>
      <div className="cad-rodape-form">
        <Botao type="submit" variante="secundario" carregando={salvando} disabled={!mudou || !nome.trim()}>Salvar meus dados</Botao>
      </div>
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

export default function ConfigAparencia() {
  const eu = useEu()
  const editar = useEditarEu()
  const atalhos = eu.prefs.atalhos !== false
  return (
    <div className="cad-secao">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h1 className="cad-titulo">Aparência</h1>
          <p className="cad-subtitulo">Vale para você, em todos os aparelhos em que entrar.</p>
        </div>
      </header>
      <Painel titulo="Tema" icone={Palette} id="cad-tema">
        <div className="cad-painel-corpo"><Tema /></div>
      </Painel>
      <Painel titulo="Atalhos de teclado" icone={Keyboard} id="cad-atalhos">
        <div className="cad-painel-corpo">
          <Interruptor ligado={atalhos} aoMudar={(v) => void editar({ prefs: { atalhos: v } })}>
            Atalhos de uma tecla (N, Q, Espaço, J e K…)
          </Interruptor>
          <p className="cad-nota">Desligados, sobram só os com Ctrl ou Cmd, como Ctrl+K. A lista completa abre com ?.</p>
        </div>
      </Painel>
      <Painel titulo="Sua conta" icone={UserRound} id="cad-conta">
        <div className="cad-painel-corpo">
          <Conta />
          <hr className="border-line" />
          <Senha />
        </div>
      </Painel>
    </div>
  )
}
