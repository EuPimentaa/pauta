/**
 * Convidar ou editar uma pessoa (Configurações › Pessoas; admin). Convidar devolve o link (7 dias, uso único) já
 * pronto para copiar e mandar no WhatsApp, no próprio diálogo. As equipes marcadas fazem a pessoa seguir os quadros
 * delas e ganhar a própria coluna nos quadros com "uma coluna por pessoa" (API §4.3).
 */
import { useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Briefcase, Shield, UserPlus, Users } from 'lucide-react'
import { CORES, type Cor, type CriarPessoaSaida, type Papel, type ParticipacaoEquipe, type Usuario } from '@shared/tipos/index.ts'
import { useEquipes } from '../../api/seletores.ts'
import { ehErroDaApi } from '../../api/cliente.ts'
import type { Icone } from '../../extensoes/tipos.ts'
import { useNomeApp } from '../../lib/app.ts'
import { corPorHash } from '../../lib/cores.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo } from '../../ui/Campo.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { Modal } from '../../ui/Modal.tsx'
import { SeletorCor } from '../../ui/SeletorCor.tsx'
import { convidarPessoa, editarPessoa } from './api.ts'
import { erroDoCampo, Faixa, LinkConvite, mensagemGeral } from './comum.tsx'

export const ROTULO_PAPEL: Record<Papel, string> = { equipe: 'Equipe', atendimento: 'Atendimento', admin: 'Admin' }
const PAPEIS_UI: { id: Papel; icone: Icone; texto: string }[] = [
  { id: 'equipe', icone: Users, texto: 'Cria, move e entrega demandas.' },
  { id: 'atendimento', icone: Briefcase, texto: 'Também cuida dos clientes e fala com eles: envio e retorno.' },
  { id: 'admin', icone: Shield, texto: 'Tudo, inclusive pessoas, quadros e configurações.' },
]

export function DialogoPessoa({ pessoa, aoFechar }: { pessoa: Usuario | null; aoFechar(): void }) {
  const qc = useQueryClient()
  const appNome = useNomeApp()
  const equipes = useEquipes().filter((e) => e.ativa || pessoa?.equipeIds.includes(e.id))
  const idForm = useId()
  const [nome, setNome] = useState(pessoa?.nome ?? '')
  const [apelido, setApelido] = useState(pessoa?.apelido ?? '')
  const [email, setEmail] = useState(pessoa?.email ?? '')
  const [papel, setPapel] = useState<Papel>(pessoa?.papel ?? 'equipe')
  const [cor, setCor] = useState<Cor | null>(pessoa?.cor ?? null)
  const [doEquipes, setDoEquipes] = useState<Set<string>>(new Set(pessoa?.equipeIds ?? []))
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const [convite, setConvite] = useState<CriarPessoaSaida | null>(null)
  const [tentou, setTentou] = useState(false)

  const corFinal: Cor = cor ?? corPorHash(email.trim().toLowerCase() || nome || 'pessoa')
  const nomeVazio = tentou && !nome.trim()
  const emailInvalido = tentou && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  function limpar() {
    setNome(''); setApelido(''); setEmail(''); setPapel('equipe'); setCor(null); setDoEquipes(new Set()); setErro(null); setConvite(null); setTentou(false)
  }

  async function salvar() {
    setTentou(true)
    setErro(null)
    if (!nome.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return
    const participacoes: ParticipacaoEquipe[] = [...doEquipes].map((equipeId) => ({ equipeId }))
    setEnviando(true)
    try {
      if (pessoa) {
        await editarPessoa(qc, pessoa, {
          nome: nome.trim(), apelido: apelido.trim() || null, email: email.trim(), papel, cor: corFinal, equipes: participacoes,
        })
        avisar(`Dados de ${nome.trim()} salvos.`, { tipo: 'sucesso' })
        aoFechar()
      } else {
        const saida = await convidarPessoa(qc, {
          nome: nome.trim(), apelido: apelido.trim() || null, email: email.trim(), papel, cor: corFinal, equipes: participacoes,
        })
        setConvite(saida)
      }
    } catch (e) {
      setErro(e)
    } finally {
      setEnviando(false)
    }
  }

  const conflito = ehErroDaApi(erro) && erro.status === 409 ? erro.mensagem : null
  const erroEmail = emailInvalido ? 'Confira o e-mail.' : erroDoCampo(erro, 'email') ?? (conflito && /e-mail/i.test(conflito) ? conflito : undefined)
  const erroApelido = erroDoCampo(erro, 'apelido') ?? (conflito && /apelido/i.test(conflito) ? conflito : undefined)
  const geral = erro && !erroEmail && !erroApelido && !erroDoCampo(erro, 'nome') ? mensagemGeral(erro) : null

  if (convite) {
    return (
      <Modal aberto aoFechar={aoFechar} titulo="Convite pronto" tamanho="m"
        descricao="Mande o link para a pessoa. Ela abre, define a senha e já entra."
        rodape={(
          <>
            <Botao variante="secundario" icone={UserPlus} onClick={limpar}>Convidar outra pessoa</Botao>
            <Botao variante="primario" onClick={aoFechar}>Pronto</Botao>
          </>
        )}>
        <LinkConvite nome={convite.usuario.nome} appNome={appNome} link={convite.convite} finalidade="convite" />
      </Modal>
    )
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={pessoa ? `Editar ${pessoa.nome}` : 'Convidar pessoa'} tamanho="m"
      descricao={pessoa ? undefined : 'Você recebe um link para mandar no WhatsApp. Sem e-mail automático.'}
      rodape={(
        <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={enviando}>{pessoa ? 'Salvar' : 'Convidar'}</Botao>
        </>
      )}>
      <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        <div className="cad-grade-2">
          <Campo rotulo="Nome" value={nome} maxLength={120} autoComplete="off" placeholder="Rafaela Souza" data-autofocus=""
            erro={nomeVazio ? 'Escreva o nome.' : erroDoCampo(erro, 'nome')} onChange={(e) => setNome(e.target.value)} />
          <Campo rotulo="Apelido" opcional value={apelido} maxLength={40} autoComplete="off" placeholder="Rafa" erro={erroApelido}
            ajuda="Nome da coluna dela e das @menções." onChange={(e) => setApelido(e.target.value)} />
        </div>
        <Campo rotulo="E-mail" type="email" value={email} maxLength={200} autoComplete="off" placeholder="rafa@meltcomunicacao.com.br"
          erro={erroEmail} ajuda={pessoa ? 'Trocar o e-mail cancela os links pendentes.' : 'É o login dela.'} onChange={(e) => setEmail(e.target.value)} />

        <fieldset className="cad-secao">
          <legend className="ui-rotulo mb-2">Papel</legend>
          <div role="radiogroup" aria-label="Papel" className="cad-opcoes">
            {PAPEIS_UI.map(({ id, icone: I, texto }) => (
              <button key={id} type="button" role="radio" aria-checked={papel === id} tabIndex={papel === id ? 0 : -1} className="cad-opcao"
                onClick={() => setPapel(id)}
                onKeyDown={(e) => {
                  const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
                  if (!passo) return
                  e.preventDefault()
                  const grupo = e.currentTarget.parentElement
                  const i = PAPEIS_UI.findIndex((p) => p.id === papel)
                  setPapel(PAPEIS_UI[(i + passo + PAPEIS_UI.length) % PAPEIS_UI.length]!.id)
                  requestAnimationFrame(() => grupo?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
                }}>
                <span className="cad-opcao-nome"><I aria-hidden="true" />{ROTULO_PAPEL[id]}</span>
                <span className="cad-opcao-texto">{texto}</span>
              </button>
            ))}
          </div>
          {pessoa && papel !== pessoa.papel && <p className="cad-nota">Mudar o papel encerra as sessões dela: ela entra de novo.</p>}
        </fieldset>

        {equipes.length > 0 && (
          <fieldset className="cad-secao">
            <legend className="ui-rotulo mb-2">Equipes</legend>
            <div className="cad-grade">
              {equipes.map((e) => (
                <Checkbox key={e.id} checked={doEquipes.has(e.id)}
                  onChange={(ev) => setDoEquipes((s) => { const n = new Set(s); if (ev.target.checked) n.add(e.id); else n.delete(e.id); return n })}>
                  <span className="inline-flex items-center gap-2"><span className="cad-ponto" data-cor={e.cor} aria-hidden="true" />{e.nome}</span>
                </Checkbox>
              ))}
            </div>
            <p className="cad-nota">Ela segue os quadros da equipe e ganha a própria coluna nos quadros com uma coluna por pessoa.</p>
          </fieldset>
        )}

        <div className="cad-campo-cor">
          <span className="ui-rotulo">Cor</span>
          <SeletorCor valor={corFinal} rotulo="Cor da pessoa" aoMudar={(c) => setCor(c ?? CORES[0])} />
        </div>
        {geral && <Faixa tom="perigo">{geral}</Faixa>}
      </form>
    </Modal>
  )
}
