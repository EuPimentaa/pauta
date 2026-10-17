/**
 * "Criar os quadros das equipes" (/quadros/novo?equipes=1; Primeiros passos, API §4.18): uma linha por equipe ativa
 * sem quadro, com o modelo sugerido da equipe e as colunas para desmarcar, renomear e colorir (as das pessoas já
 * expandidas, com `responsavelId`; a `modeloColunaId` em cada coluna do modelo, para as automações seguirem). Equipe
 * sem membros num modelo por pessoa: o aviso da §4.1. Um POST /api/quadros por linha, em sequência, com o estado de
 * cada uma (erro numa linha não para as outras; "Tentar de novo" refaz só as que faltam).
 */
import { useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronUp, LayoutGrid, Loader2, TriangleAlert, UserPlus, UserRound, Zap } from 'lucide-react'
import type { Bootstrap, Equipe, Id, ModeloQuadro, QuadroCompleto } from '@shared/tipos/index.ts'
import { bootstrapDe } from '../../api/cache.ts'
import { useAbrirSobreposta } from '../../sessao/sobreposta.tsx'
import { useDoBootstrap, useUsuarios } from '../../api/seletores.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo, Selecao } from '../../ui/Campo.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { EstadoVazio } from '../../ui/Indicadores.tsx'
import { Modal } from '../../ui/Modal.tsx'
import { criarQuadro } from './api.ts'
import { Faixa, mensagemGeral } from './comum.tsx'
import { EditorColunas } from './EditorColunas.tsx'
import {
  automacoesDoPlano, entradaDoQuadro, equipesSemQuadro, errosDoPlano, membrosAtivos, planejarColunas, temColunaPorPessoa,
  type ColunaPlano,
} from './logica.ts'

interface Linha {
  equipe: Equipe
  criar: boolean
  nome: string
  modeloId: Id | null
  plano: ColunaPlano[]
  aberto: boolean
  estado: 'pronto' | 'criando' | 'criado' | 'erro'
  erro?: unknown
  quadro?: QuadroCompleto
}

const selModelos = (b: Bootstrap) => [...b.modelosQuadro].sort((a, z) => a.pos - z.pos)
const selAtivos = (b: Bootstrap) => b.usuarios.filter((u) => u.ativo).length

export default function QuadrosDasEquipes({ fechar }: { fechar(): void }) {
  const qc = useQueryClient()
  const navegar = useNavigate()
  const abrir = useAbrirSobreposta()
  const idForm = useId()
  const usuarios = useUsuarios()
  const modelos = useDoBootstrap(selModelos) ?? []
  const pessoasAtivas = useDoBootstrap(selAtivos) ?? 0
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [linhas, setLinhas] = useState<Linha[]>(() => {
    const b = bootstrapDe(qc)
    if (!b) return []
    return equipesSemQuadro(b.equipes, b.quadros).map((equipe) => {
      const modelo = b.modelosQuadro.find((m) => m.id === equipe.modeloQuadroId) ?? null
      return {
        equipe, criar: true, nome: equipe.nome, modeloId: modelo?.id ?? null, aberto: false, estado: 'pronto',
        plano: planejarColunas(modelo, membrosAtivos(equipe, b.usuarios)),
      }
    })
  })

  const mudar = (equipeId: Id, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.equipe.id === equipeId ? { ...l, ...patch } : l)))
  const modeloDe = (l: Linha): ModeloQuadro | null => modelos.find((m) => m.id === l.modeloId) ?? null
  const pendentes = linhas.filter((l) => l.criar && l.estado !== 'criado')
  const criados = linhas.filter((l) => l.estado === 'criado')
  const terminou = criados.length > 0 && pendentes.length === 0
  const invalida = (l: Linha) => !l.nome.trim() || errosDoPlano(l.plano).size > 0

  async function criarTodos() {
    setTentou(true)
    const fila = linhas.filter((l) => l.criar && l.estado !== 'criado')
    if (fila.some(invalida)) {
      setLinhas((ls) => ls.map((l) => (l.criar && invalida(l) ? { ...l, aberto: true } : l)))
      return
    }
    setEnviando(true)
    let ok = 0
    for (const l of fila) {
      mudar(l.equipe.id, { estado: 'criando', erro: undefined })
      const modelo = modeloDe(l)
      try {
        const quadro = await criarQuadro(qc, entradaDoQuadro({
          nome: l.nome, equipeId: l.equipe.id, modelo, plano: l.plano, cor: l.equipe.cor, fundo: 'liso',
          colunaPorMembro: temColunaPorPessoa(modelo), membrosDaEquipeSeguem: true,
        }))
        mudar(l.equipe.id, { estado: 'criado', quadro, aberto: false })
        ok++
      } catch (e) {
        mudar(l.equipe.id, { estado: 'erro', erro: e, aberto: true })
      }
    }
    setEnviando(false)
    if (ok > 0) avisar(`${ok} ${ok === 1 ? 'quadro criado' : 'quadros criados'}.`, { tipo: 'sucesso', descricao: 'Cada pessoa já segue o quadro da própria equipe.' })
  }

  if (linhas.length === 0) {
    return (
      <Modal aberto aoFechar={fechar} titulo="Criar os quadros das equipes" tamanho="m">
        <EstadoVazio icone={LayoutGrid} titulo="Todas as equipes ativas já têm quadro." texto="Para mais um quadro, use o Novo quadro."
          acoes={<Botao variante="secundario" onClick={() => abrir('/quadros/novo')}>Novo quadro</Botao>} />
      </Modal>
    )
  }

  const primeiro = criados[0]?.quadro?.quadro
  return (
    <Modal aberto aoFechar={fechar} titulo="Criar os quadros das equipes" tamanho="g"
      descricao="Um quadro por equipe, com o modelo sugerido. Desmarque, renomeie ou ajuste as colunas antes de criar."
      rodape={terminou ? (
        <>
          <Botao variante="secundario" onClick={fechar}>Fechar</Botao>
          {primeiro && <Botao variante="primario" onClick={() => navegar(`/q/${encodeURIComponent(primeiro.slug)}`, { replace: true })}>Abrir {primeiro.nome}</Botao>}
        </>
      ) : (
        <>
          <Botao variante="secundario" onClick={fechar}>{criados.length ? 'Fechar' : 'Cancelar'}</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={enviando} disabled={pendentes.length === 0}>
            {pendentes.length === 1 ? 'Criar 1 quadro' : `Criar ${pendentes.length} quadros`}
          </Botao>
        </>
      )}>
      <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); if (!enviando) void criarTodos() }}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault() }}>
        {pessoasAtivas < 2 && !terminou && (
          <Faixa tom="info" icone={UserPlus} acoes={<Botao tamanho="p" variante="secundario" onClick={() => navegar('/config/pessoas')}>Convidar pessoas</Botao>}>
            Só você tem acesso por enquanto. Convidando antes, as colunas das pessoas já nascem nos quadros; quem entrar depois também ganha a sua.
          </Faixa>
        )}
        {terminou && (
          <Faixa tom="sucesso" icone={Check}>
            {criados.length === 1 ? '1 quadro criado' : `${criados.length} quadros criados`}. Eles já estão no menu, para todos.
          </Faixa>
        )}
        <div className="cad-equipes">
          {linhas.map((l) => <LinhaEquipe key={l.equipe.id} l={l} modelos={modelos} usuarios={usuarios} tentou={tentou}
            mudar={(p) => mudar(l.equipe.id, p)} modelo={modeloDe(l)} bloqueada={enviando} />)}
        </div>
      </form>
    </Modal>
  )
}

function LinhaEquipe({ l, modelos, modelo, usuarios, tentou, mudar, bloqueada }: {
  l: Linha; modelos: ModeloQuadro[]; modelo: ModeloQuadro | null; usuarios: ReturnType<typeof useUsuarios>; tentou: boolean
  mudar(p: Partial<Linha>): void; bloqueada: boolean
}) {
  const idEditor = useId()
  const membros = membrosAtivos(l.equipe, usuarios)
  const automacoes = useMemo(() => automacoesDoPlano(modelo, l.plano), [modelo, l.plano])
  const nAuto = [...automacoes.entries()].filter(([chave]) => l.plano.find((c) => c.chave === chave)?.manter).reduce((s, [, g]) => s + g.length, 0)
  const mantidas = l.plano.filter((c) => c.manter)
  const criado = l.estado === 'criado'
  const semMembros = temColunaPorPessoa(modelo) && membros.length === 0
  const erroNome = tentou && l.criar && !l.nome.trim() ? 'Dê um nome ao quadro.' : undefined
  const desabilitada = bloqueada || criado

  return (
    <div className="cad-equipe" data-desmarcada={l.criar ? undefined : ''}>
      <div className="cad-equipe-topo">
        <span className="cad-equipe-nome">
          {criado
            ? <span className="cad-ponto" data-cor={l.equipe.cor} data-tamanho="g" aria-hidden="true" />
            : <Checkbox tom="neutro" checked={l.criar} disabled={desabilitada} onChange={(e) => mudar({ criar: e.target.checked })} aria-label={`Criar o quadro da equipe ${l.equipe.nome}`} />}
          {l.equipe.nome}
          <span className="cad-nota">{membros.length === 0 ? 'sem pessoas' : `${membros.length} ${membros.length === 1 ? 'pessoa' : 'pessoas'}`}</span>
        </span>
        <Estado l={l} />
      </div>
      {l.criar && !criado && (
        <>
          <div className="cad-grade-2">
            <Campo rotulo="Nome do quadro" tamanho="p" value={l.nome} maxLength={80} disabled={desabilitada} erro={erroNome}
              onChange={(e) => mudar({ nome: e.target.value })} />
            <Selecao rotulo="Modelo" tamanho="p" value={l.modeloId ?? ''} vazia="Sem modelo (vazio)" disabled={desabilitada}
              opcoes={modelos.map((m) => ({ valor: m.id, rotulo: m.nome }))}
              onChange={(e) => {
                const m = modelos.find((x) => x.id === e.target.value) ?? null
                mudar({ modeloId: m?.id ?? null, plano: planejarColunas(m, membros) })
              }} />
          </div>
          {semMembros && <Faixa icone={UserRound}>Convide a equipe antes: quem entrar depois ganha a própria coluna.</Faixa>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="cad-linha-meta">
              <span>{mantidas.length === 0 ? 'Sem colunas' : mantidas.map((c) => c.nome.trim() || '(sem nome)').join(' · ')}</span>
              {nAuto > 0 && <span><Zap aria-hidden="true" />{nAuto === 1 ? '1 automação sugerida' : `${nAuto} automações sugeridas`}</span>}
            </span>
            <Botao tamanho="p" variante="ghost" iconeDireita={l.aberto ? ChevronUp : ChevronDown} aria-expanded={l.aberto} aria-controls={idEditor}
              disabled={desabilitada} onClick={() => mudar({ aberto: !l.aberto })}>
              {l.aberto ? 'Fechar as colunas' : 'Ajustar colunas'}
            </Botao>
          </div>
          {l.aberto && (
            <div id={idEditor}>
              <EditorColunas plano={l.plano} aoMudar={(plano) => mudar({ plano })} automacoes={automacoes} usuarios={usuarios}
                erros={tentou ? errosDoPlano(l.plano) : undefined} rotulo={l.nome || l.equipe.nome} />
            </div>
          )}
        </>
      )}
      {l.estado === 'erro' && <Faixa tom="perigo" icone={TriangleAlert}>{mensagemGeral(l.erro)}</Faixa>}
    </div>
  )
}

function Estado({ l }: { l: Linha }) {
  if (l.estado === 'criando') return <span className="cad-equipe-estado" role="status"><Loader2 className="ui-giro" aria-hidden="true" />Criando…</span>
  if (l.estado === 'criado') {
    return (
      <span className="cad-equipe-estado" data-tom="sucesso" role="status">
        <Check aria-hidden="true" />
        Criado: {l.quadro?.colunas.length ?? 0} colunas{l.quadro?.automacoes.length ? ` e ${l.quadro.automacoes.length} automações` : ''}
      </span>
    )
  }
  if (l.estado === 'erro') return <span className="cad-equipe-estado" data-tom="perigo"><TriangleAlert aria-hidden="true" />Não foi criado</span>
  if (!l.criar) return <span className="cad-equipe-estado">Não criar agora</span>
  return null
}
