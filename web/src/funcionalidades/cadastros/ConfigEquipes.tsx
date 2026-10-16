/**
 * Configurações › Equipes (admin; PLANO §3 F5): membros (com o principal e a função), o modelo sugerido nos Primeiros
 * passos, cor, ativa, e o atalho para criar o quadro da equipe. Entrar na equipe = seguir os quadros dela e ganhar a
 * própria coluna nos quadros com "uma coluna por pessoa" (API §4.3); sair não arquiva a coluna.
 */
import { useId, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { LayoutGrid, Pencil, Plus, Star, UserPlus, Users } from 'lucide-react'
import type { Bootstrap, Cor, Equipe, EquipeMembro, Id } from '@shared/tipos/index.ts'
import { slugDe } from '@shared/logica/quadro.ts'
import { useDoBootstrap, useEquipes, useQuadros, useUsuarios } from '../../api/seletores.ts'
import { ehErroDaApi } from '../../api/cliente.ts'
import { useAbrirSobreposta } from '../../sessao/sobreposta.tsx'
import { Avatar } from '../../ui/Avatar.tsx'
import { avisar } from '../../ui/avisos.tsx'
import { Botao, propsBotao } from '../../ui/Botao.tsx'
import { Campo, Selecao } from '../../ui/Campo.tsx'
import { Checkbox, Interruptor } from '../../ui/Checkbox.tsx'
import { EstadoVazio } from '../../ui/Indicadores.tsx'
import { Modal } from '../../ui/Modal.tsx'
import { SeletorCor } from '../../ui/SeletorCor.tsx'
import { criarEquipe, definirMembros, editarEquipe } from './api.ts'
import { erroDoCampo, Faixa, mensagemGeral, nomeCurto, Painel, Pilula } from './comum.tsx'

const colacao = new Intl.Collator('pt-BR', { sensitivity: 'base' })
const selModelos = (b: Bootstrap) => [...b.modelosQuadro].sort((a, z) => a.pos - z.pos)

function DialogoEquipe({ equipe, aoFechar }: { equipe: Equipe | null; aoFechar(): void }) {
  const qc = useQueryClient()
  const idForm = useId()
  const modelos = useDoBootstrap(selModelos) ?? []
  const [nome, setNome] = useState(equipe?.nome ?? '')
  const [slug, setSlug] = useState(equipe?.slug ?? '')
  const [slugTocado, setSlugTocado] = useState(false)
  const [cor, setCor] = useState<Cor>(equipe?.cor ?? 'azul')
  const [modeloId, setModeloId] = useState<Id | null>(equipe?.modeloQuadroId ?? 'mq-kanban')
  const [ativa, setAtiva] = useState(equipe?.ativa ?? true)
  const [erro, setErro] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)
  const [tentou, setTentou] = useState(false)
  const slugFinal = equipe ? equipe.slug : (slugTocado ? slug : slugDe(nome).replace(/^[^a-z]+/, '').slice(0, 40).replace(/-+$/, ''))

  async function salvar() {
    setTentou(true)
    setErro(null)
    if (!nome.trim()) return
    setEnviando(true)
    try {
      if (equipe) await editarEquipe(qc, equipe, { nome: nome.trim(), cor, modeloQuadroId: modeloId, ativa })
      else await criarEquipe(qc, { nome: nome.trim(), slug: slugFinal, cor, modeloQuadroId: modeloId })
      avisar(equipe ? `Equipe ${nome.trim()} salva.` : `Equipe ${nome.trim()} criada.`, { tipo: 'sucesso' })
      aoFechar()
    } catch (e) {
      setErro(e)
    } finally {
      setEnviando(false)
    }
  }

  const conflito = ehErroDaApi(erro) && erro.status === 409 ? erro.mensagem : undefined
  return (
    <Modal aberto aoFechar={aoFechar} titulo={equipe ? `Editar ${equipe.nome}` : 'Nova equipe'} tamanho="m"
      rodape={(
        <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={enviando}>{equipe ? 'Salvar' : 'Criar equipe'}</Botao>
        </>
      )}>
      <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        <Campo rotulo="Nome" value={nome} maxLength={60} placeholder="Vídeo" data-autofocus="" onChange={(e) => setNome(e.target.value)}
          erro={tentou && !nome.trim() ? 'Escreva o nome.' : conflito ?? erroDoCampo(erro, 'nome')} />
        {!equipe && (
          <Campo rotulo="Identificador" value={slugFinal} maxLength={40} onChange={(e) => { setSlug(e.target.value); setSlugTocado(true) }}
            ajuda="Letras minúsculas, números e hífens. Não muda depois." erro={erroDoCampo(erro, 'slug')} />
        )}
        <Selecao rotulo="Modelo de quadro sugerido" value={modeloId ?? ''} vazia="Nenhum"
          opcoes={modelos.map((m) => ({ valor: m.id, rotulo: m.nome }))} onChange={(e) => setModeloId(e.target.value || null)}
          ajuda='É o que o "Criar os quadros das equipes" usa para esta equipe.' />
        <div className="cad-campo-cor">
          <span className="ui-rotulo">Cor</span>
          <SeletorCor valor={cor} rotulo="Cor da equipe" aoMudar={(c) => c && setCor(c)} />
        </div>
        {equipe && <Interruptor ligado={ativa} aoMudar={setAtiva}>Equipe ativa (desligada, some das sugestões e do "Criar os quadros")</Interruptor>}
        {erro && !conflito && !erroDoCampo(erro, 'nome') && !erroDoCampo(erro, 'slug') ? <Faixa tom="perigo">{mensagemGeral(erro)}</Faixa> : null}
      </form>
    </Modal>
  )
}

function DialogoMembros({ equipe, aoFechar }: { equipe: Equipe; aoFechar(): void }) {
  const qc = useQueryClient()
  const idForm = useId()
  const usuarios = useUsuarios()
  const ativos = useMemo(() => usuarios.filter((u) => u.ativo || equipe.membros.some((m) => m.usuarioId === u.id))
    .sort((a, b) => colacao.compare(a.nome, b.nome)), [usuarios, equipe.membros])
  const [membros, setMembros] = useState<Map<Id, EquipeMembro>>(new Map(equipe.membros.map((m) => [m.usuarioId, m])))
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const entram = [...membros.keys()].filter((id) => !equipe.membros.some((m) => m.usuarioId === id)).length
  const saem = equipe.membros.filter((m) => !membros.has(m.usuarioId)).length

  const mudar = (id: Id, m: EquipeMembro | null) => setMembros((atual) => {
    const n = new Map(atual)
    if (m) n.set(id, m); else n.delete(id)
    return n
  })

  async function salvar() {
    setErro(null)
    setEnviando(true)
    try {
      await definirMembros(qc, equipe, [...membros.values()].map((m) => ({ ...m, funcao: m.funcao?.trim() || null })))
      avisar(`Membros de ${equipe.nome} salvos.`, {
        tipo: 'sucesso', descricao: entram ? 'Quem entrou já segue os quadros da equipe e ganhou a própria coluna onde o quadro tem uma por pessoa.' : undefined,
      })
      aoFechar()
    } catch (e) {
      setErro(e)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Membros de ${equipe.nome}`} tamanho="m"
      descricao="Quem entra segue os quadros da equipe e ganha a própria coluna nos quadros com uma coluna por pessoa."
      rodape={(
        <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={enviando}>Salvar membros</Botao>
        </>
      )}>
      <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        {ativos.length <= 1 && (
          <Faixa icone={UserPlus} acoes={<Link {...propsBotao({ tamanho: 'p' })} to="/config/pessoas">Convidar pessoas</Link>}>
            Ainda não há outras pessoas. Convide em Pessoas e marque a equipe lá mesmo.
          </Faixa>
        )}
        <ul className="cad-lista" aria-label="Pessoas">
          {ativos.map((u) => {
            const m = membros.get(u.id)
            return (
              <li key={u.id} className="cad-membro">
                <span className="cad-membro-check">
                  <Checkbox checked={!!m} aria-label={`${u.nome} na equipe`}
                    onChange={(e) => mudar(u.id, e.target.checked ? { usuarioId: u.id, funcao: null, principal: false } : null)} />
                </span>
                <span className="cad-pessoa cad-membro-pessoa"><Avatar pessoa={u} tamanho={26} /><span>{u.nome}{!u.ativo ? ' (sem acesso)' : ''}</span></span>
                {m ? (
                  <Campo classeGrupo="cad-membro-funcao" rotulo={`Função de ${u.nome}`} rotuloOculto tamanho="p" placeholder="Função (opcional)"
                    value={m.funcao ?? ''} maxLength={40} onChange={(e) => mudar(u.id, { ...m, funcao: e.target.value })} />
                ) : <span className="cad-membro-funcao" />}
                <span className="cad-membro-principal">
                  {m && <Checkbox checked={m.principal} onChange={(e) => mudar(u.id, { ...m, principal: e.target.checked })}>Principal</Checkbox>}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="cad-nota">
          O principal vem primeiro nas colunas por pessoa.{saem ? ' Quem sai continua com a própria coluna: mova os cards e arquive a coluna.' : ''}
        </p>
        {erro ? <Faixa tom="perigo">{mensagemGeral(erro)}</Faixa> : null}
      </form>
    </Modal>
  )
}

export default function ConfigEquipes() {
  const equipes = useEquipes()
  const usuarios = useUsuarios()
  const quadros = useQuadros()
  const modelos = useDoBootstrap(selModelos) ?? []
  const abrir = useAbrirSobreposta()
  const [editando, setEditando] = useState<Equipe | null | 'nova'>(null)
  const [membrosDe, setMembrosDe] = useState<Equipe | null>(null)
  const lista = [...equipes].sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.pos - b.pos)

  return (
    <div className="cad-secao">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h2 className="cad-titulo">Equipes</h2>
          <p className="cad-subtitulo">Cada equipe tem o seu quadro e o modelo que o "Criar os quadros das equipes" sugere.</p>
        </div>
        <Botao variante="primario" icone={Plus} onClick={() => setEditando('nova')}>Nova equipe</Botao>
      </header>
      {lista.length === 0 && <EstadoVazio icone={Users} titulo="Nenhuma equipe." acoes={<Botao variante="secundario" onClick={() => setEditando('nova')}>Nova equipe</Botao>} />}
      {lista.map((e) => {
        const pessoas = e.membros.map((m) => ({ m, u: usuarios.find((u) => u.id === m.usuarioId) }))
          .filter((x) => !!x.u).sort((a, b) => Number(b.m.principal) - Number(a.m.principal) || colacao.compare(a.u!.nome, b.u!.nome))
        const doTime = quadros.filter((q) => q.equipeId === e.id)
        const modelo = modelos.find((m) => m.id === e.modeloQuadroId)
        return (
          <Painel key={e.id} id={`cad-eq-${e.id}`} titulo={(
            <span className="inline-flex items-center gap-2"><span className="cad-ponto" data-cor={e.cor} data-tamanho="g" aria-hidden="true" />{e.nome}{!e.ativa && <Pilula tom="perigo">Inativa</Pilula>}</span>
          )} acoes={(
            <>
              <Botao tamanho="p" variante="secundario" icone={Users} onClick={() => setMembrosDe(e)}>Membros</Botao>
              <Botao tamanho="p" variante="ghost" icone={Pencil} onClick={() => setEditando(e)}>Editar</Botao>
            </>
          )}>
            <div className="cad-painel-corpo">
              <div className="cad-linha-meta">
                <span><LayoutGrid aria-hidden="true" />Modelo sugerido: {modelo?.nome ?? 'nenhum'}</span>
                {doTime.length > 0
                  ? doTime.map((q) => <Link key={q.id} className="cad-link-linha" to={`/q/${encodeURIComponent(q.slug)}`}><span className="cad-ponto" data-cor={q.cor} aria-hidden="true" /> Quadro {q.nome}</Link>)
                  : e.ativa && <Botao tamanho="p" variante="ghost" icone={Plus} onClick={() => abrir(`/quadros/novo?equipe=${encodeURIComponent(e.id)}`)}>Criar o quadro da equipe</Botao>}
              </div>
              {pessoas.length === 0 ? (
                <p className="cad-nota">Ninguém na equipe ainda.</p>
              ) : (
                <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label={`Membros de ${e.nome}`}>
                  {pessoas.map(({ m, u }) => (
                    <li key={u!.id} className="cad-pessoa">
                      <Avatar pessoa={u!} tamanho={24} />
                      <span>{nomeCurto(u!)}{m.funcao ? <span className="cad-texto-2"> · {m.funcao}</span> : null}</span>
                      {m.principal && <Star className="text-fg-3" width={13} height={13} aria-label="principal" />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Painel>
        )
      })}
      {editando && <DialogoEquipe equipe={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />}
      {membrosDe && <DialogoMembros equipe={membrosDe} aoFechar={() => setMembrosDe(null)} />}
    </div>
  )
}
