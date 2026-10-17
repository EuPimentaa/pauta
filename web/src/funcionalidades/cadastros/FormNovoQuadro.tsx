/**
 * "Novo quadro" (/quadros/novo, sobreposta, admin; PLANO §3 F5): nome, equipe, modelo com as colunas sugeridas
 * editáveis (desmarcar, renomear, cor, papel, ordem; as das pessoas já expandidas) e as automações do modelo que
 * seguem cada coluna, cor, fundo, "uma coluna por pessoa" e seguidores. Criar abre o quadro.
 * `?equipe=<id>` já escolhe a equipe (Configurações › Equipes).
 */
import { useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Columns3, LayoutGrid, LayoutTemplate, Square, UserRound, Users } from 'lucide-react'
import type { Cor, FundoQuadro, Id, ModeloQuadro } from '@shared/tipos/index.ts'
import { useDoBootstrap, useEquipes, useUsuarios } from '../../api/seletores.ts'
import { ehErroDaApi } from '../../api/cliente.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import type { Icone } from '../../extensoes/tipos.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo, Selecao } from '../../ui/Campo.tsx'
import { Interruptor } from '../../ui/Checkbox.tsx'
import { Modal } from '../../ui/Modal.tsx'
import { SeletorCor } from '../../ui/SeletorCor.tsx'
import { criarQuadro } from './api.ts'
import { erroDoCampo, Faixa, mensagemGeral, SeletorFundo } from './comum.tsx'
import { EditorColunas } from './EditorColunas.tsx'
import {
  automacoesDoPlano, entradaDoQuadro, errosDoPlano, membrosAtivos, planejarColunas, temColunaPorPessoa, type ColunaPlano,
} from './logica.ts'

const ICONE_MODELO: Record<string, Icone> = { 'mq-kanban': Columns3, 'mq-por-pessoa': Users, 'mq-semana': LayoutTemplate, 'mq-branco': Square }
const selModelos = (b: { modelosQuadro: ModeloQuadro[] }) => [...b.modelosQuadro].sort((a, z) => a.pos - z.pos)

/** Escolha do modelo como cartões (radiogroup). */
export function SeletorModelo({ modelos, valor, aoMudar }: { modelos: ModeloQuadro[]; valor: Id | null; aoMudar(id: Id | null): void }) {
  return (
    <div role="radiogroup" aria-label="Modelo de quadro" className="cad-opcoes"
      onKeyDown={(e) => {
        const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
        if (!passo) return
        e.preventDefault()
        const grupo = e.currentTarget
        const i = modelos.findIndex((m) => m.id === valor)
        const prox = modelos[(Math.max(0, i) + passo + modelos.length) % modelos.length]!
        aoMudar(prox.id)
        requestAnimationFrame(() => grupo.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
      }}>
      {modelos.map((m, i) => {
        const I = ICONE_MODELO[m.id] ?? LayoutGrid
        const marcado = m.id === valor
        return (
          <button key={m.id} type="button" role="radio" aria-checked={marcado} tabIndex={marcado || (!valor && i === 0) ? 0 : -1}
            className="cad-opcao" onClick={() => aoMudar(m.id)}>
            <span className="cad-opcao-nome"><I aria-hidden="true" />{m.nome}</span>
            <span className="cad-opcao-texto">{m.descricao}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function FormNovoQuadro({ fechar, equipeInicial }: { fechar(): void; equipeInicial: Id | null }) {
  const qc = useQueryClient()
  const navegar = useNavigate()
  const idForm = useId()
  const equipes = useEquipes().filter((e) => e.ativa)
  const usuarios = useUsuarios()
  const modelos = useDoBootstrap(selModelos) ?? []
  const equipeIni = equipes.find((e) => e.id === equipeInicial) ?? null
  const modeloIni = modelos.find((m) => m.id === (equipeIni?.modeloQuadroId ?? 'mq-kanban')) ?? modelos[0] ?? null

  const [nome, setNome] = useState(equipeIni?.nome ?? '')
  const [nomeTocado, setNomeTocado] = useState(false)
  const [equipeId, setEquipeId] = useState<Id | null>(equipeIni?.id ?? null)
  const [modeloId, setModeloId] = useState<Id | null>(modeloIni?.id ?? null)
  const [modeloTocado, setModeloTocado] = useState(false)
  const [cor, setCor] = useState<Cor>(equipeIni?.cor ?? 'grafite')
  const [corTocada, setCorTocada] = useState(false)
  const [fundo, setFundo] = useState<FundoQuadro>('liso')
  const [porPessoa, setPorPessoa] = useState(temColunaPorPessoa(modeloIni))
  const [seguem, setSeguem] = useState(true)
  const [plano, setPlano] = useState<ColunaPlano[]>(() => planejarColunas(modeloIni, membrosAtivos(equipeIni, usuarios)))
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const [tentou, setTentou] = useState(false)
  const abrirDialogo = useAbrirDialogo()

  // formulário mexido: Esc, X e o clique fora perguntam antes de jogar fora (o Cancelar fecha direto)
  const planoInicial = useRef(JSON.stringify(plano))
  const sujo = nomeTocado || modeloTocado || corTocada || fundo !== 'liso' || equipeId !== (equipeIni?.id ?? null)
    || JSON.stringify(plano) !== planoInicial.current
  async function fecharPerguntando() {
    if (!sujo) { fechar(); return }
    const ok = await abrirDialogo('confirmar', {
      titulo: 'Descartar este quadro?', mensagem: 'O nome, o modelo e as colunas que você ajustou se perdem.', confirmar: 'Descartar', perigo: true,
    })
    if (ok) fechar()
  }

  const equipe = equipes.find((e) => e.id === equipeId) ?? null
  const modelo = modelos.find((m) => m.id === modeloId) ?? null
  const membros = membrosAtivos(equipe, usuarios)
  const automacoes = useMemo(() => automacoesDoPlano(modelo, plano), [modelo, plano])
  const erros = tentou ? errosDoPlano(plano) : undefined

  function replanejar(m: ModeloQuadro | null, eqId: Id | null) {
    const eq = equipes.find((e) => e.id === eqId) ?? null
    setPlano(planejarColunas(m, membrosAtivos(eq, usuarios)))
    setPorPessoa(temColunaPorPessoa(m))
  }

  function escolherEquipe(id: Id | null) {
    setEquipeId(id)
    const eq = equipes.find((e) => e.id === id) ?? null
    if (!nomeTocado) setNome(eq?.nome ?? '')
    if (!corTocada && eq) setCor(eq.cor)
    let m = modelo
    if (!modeloTocado && eq?.modeloQuadroId) {
      m = modelos.find((x) => x.id === eq.modeloQuadroId) ?? modelo
      setModeloId(m?.id ?? null)
    }
    replanejar(m, id)
  }

  function escolherModelo(id: Id | null) {
    setModeloId(id)
    setModeloTocado(true)
    replanejar(modelos.find((m) => m.id === id) ?? null, equipeId)
  }

  async function criar() {
    setTentou(true)
    setErro(null)
    if (!nome.trim() || errosDoPlano(plano).size > 0) return
    setEnviando(true)
    try {
      const q = await criarQuadro(qc, entradaDoQuadro({
        nome, equipeId, modelo, plano, cor, fundo, colunaPorMembro: !!equipeId && porPessoa, membrosDaEquipeSeguem: seguem,
      }))
      avisar(`Quadro ${q.quadro.nome} criado.`, { tipo: 'sucesso', descricao: q.automacoes.length ? `${q.automacoes.length} ${q.automacoes.length === 1 ? 'automação sugerida ligada' : 'automações sugeridas ligadas'}.` : undefined })
      navegar(`/q/${encodeURIComponent(q.quadro.slug)}`, { replace: true })
    } catch (e) {
      setErro(e)
    } finally {
      setEnviando(false)
    }
  }

  const conflitoNome = ehErroDaApi(erro) && erro.status === 409 && erro.detalhes?.campo === 'nome' ? erro.mensagem : undefined
  const erroNome = (tentou && !nome.trim() ? 'Dê um nome ao quadro.' : undefined) ?? conflitoNome ?? erroDoCampo(erro, 'nome')
  const geral = erro && !erroNome ? mensagemGeral(erro) : null
  const semMembros = !!equipe && temColunaPorPessoa(modelo) && membros.length === 0

  return (
    <Modal aberto aoFechar={() => void fecharPerguntando()} fecharAoClicarFora={!sujo} titulo="Novo quadro"
      descricao="Escolha um modelo e ajuste as colunas antes de criar." tamanho="g"
      rodape={(
        <>
          <Botao variante="secundario" onClick={fechar}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={enviando}>Criar quadro</Botao>
        </>
      )}>
      <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void criar() }}>
        <div className="cad-grade-2">
          <Campo rotulo="Nome" value={nome} maxLength={80} placeholder="Ex.: Vídeo" autoComplete="off" erro={erroNome} data-autofocus=""
            onChange={(e) => { setNome(e.target.value); setNomeTocado(true) }} />
          <Selecao rotulo="Equipe" value={equipeId ?? ''} vazia="Sem equipe"
            opcoes={equipes.map((e) => ({ valor: e.id, rotulo: e.nome }))}
            ajuda={equipe ? `${membros.length} ${membros.length === 1 ? 'pessoa' : 'pessoas'} na equipe.` : 'Com equipe, as pessoas dela seguem o quadro.'}
            onChange={(e) => escolherEquipe(e.target.value || null)} />
        </div>

        <fieldset className="cad-secao">
          <legend className="ui-rotulo mb-2">Modelo</legend>
          <SeletorModelo modelos={modelos} valor={modeloId} aoMudar={escolherModelo} />
        </fieldset>

        <fieldset className="cad-secao">
          <legend className="ui-rotulo mb-2">Colunas</legend>
          {semMembros && (
            <Faixa icone={UserRound}>Convide a equipe antes: quem entrar depois ganha a própria coluna.</Faixa>
          )}
          <EditorColunas plano={plano} aoMudar={setPlano} automacoes={automacoes} usuarios={usuarios} erros={erros} rotulo={nome || 'o quadro novo'} />
        </fieldset>

        <div className="cad-grade-2">
          <div className="cad-campo-cor">
            <span className="ui-rotulo" id={`${idForm}-cor`}>Cor do quadro</span>
            <SeletorCor valor={cor} rotulo="Cor do quadro" aoMudar={(c) => { if (c) { setCor(c); setCorTocada(true) } }} />
          </div>
          <div className="cad-campo-cor">
            <span className="ui-rotulo">Fundo</span>
            <SeletorFundo valor={fundo} aoMudar={setFundo} />
          </div>
        </div>

        {equipe && (
          <div className="cad-check-lista">
            <Interruptor ligado={porPessoa} aoMudar={setPorPessoa}>Uma coluna por pessoa: quem entrar na equipe depois ganha a própria coluna</Interruptor>
            <Interruptor ligado={seguem} aoMudar={setSeguem}>As pessoas da equipe seguem o quadro (avisa quando chega demanda sem ninguém da equipe)</Interruptor>
          </div>
        )}
        {geral && <Faixa tom="perigo">{geral}</Faixa>}
      </form>
    </Modal>
  )
}
