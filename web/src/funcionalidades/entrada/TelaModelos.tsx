/**
 * Configurações › Modelos de demanda (/config/modelos e ?quadro=<id>; F4). Globais (só o admin edita) e por quadro
 * (qualquer pessoa): nome, linha de ajuda, ícone, briefing em Markdown (o editor mostra formatado; "Ver como fica na
 * demanda" mostra a prévia exata), checklists (um item por linha), etiquetas padrão, prazo em dias úteis,
 * prioridade, estimativa e rodadas; desativar e reativar. O admin tem o "Revisei os modelos" dos Primeiros passos.
 */
import './modelos.css'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Eye, EyeOff, LayoutTemplate, Lock, Plus, Trash2, X } from 'lucide-react'
import {
  PRIORIDADES, ROTULO_PRIORIDADE, type Cor, type Id, type ModeloDemanda, type ModeloDemandaEtiqueta, type Prioridade,
} from '@shared/tipos/index.ts'
import { linhasParaItens } from '@shared/logica/texto.ts'
import { dataLocalDe, formatarPrazo } from '@shared/logica/datas.ts'
import { useEu } from '../../api/auth.ts'
import { ehErroDaApi, mensagemDeErro } from '../../api/cliente.ts'
import { useConfig, useQuadros } from '../../api/seletores.ts'
import { useTituloAba } from '../../lib/app.ts'
import { ehCelular } from '../../lib/midia.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao, BotaoIcone } from '../../ui/Botao.tsx'
import { AreaTexto, Campo, Selecao } from '../../ui/Campo.tsx'
import { EditorMarkdown } from '../../ui/EditorMarkdown.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import { SeletorCor } from '../../ui/SeletorCor.tsx'
import { criarModelo, editarModelo, marcarRevisados, useModelosTodos } from './api.ts'
import { minutosDeTexto, textoDeMinutos } from './formulario.ts'
import { ICONES_MODELO, iconeDoModelo } from './icones.ts'

const Markdown = lazy(() => import('../../ui/Markdown.tsx').then((m) => ({ default: m.Markdown })))

interface GrupoItens { nome: string; texto: string }

interface Rascunho {
  id: Id | null
  quadroId: Id | null
  nome: string
  descricao: string
  icone: string | null
  briefingMd: string
  grupos: GrupoItens[]
  etiquetas: ModeloDemandaEtiqueta[]
  prazoDiasUteis: string
  prioridade: Prioridade | ''
  estimativa: string
  rodadasInclusas: string
}

function rascunhoDe(m: ModeloDemanda | null, quadroId: Id | null): Rascunho {
  const grupos = new Map<string, string[]>()
  for (const i of m?.itens ?? []) grupos.set(i.checklist, [...(grupos.get(i.checklist) ?? []), i.texto])
  return {
    id: m?.id ?? null,
    quadroId: m ? m.quadroId : quadroId,
    nome: m?.nome ?? '',
    descricao: m?.descricao ?? '',
    icone: m?.icone ?? 'file-text',
    briefingMd: m?.briefingMd ?? '## Objetivo\n\n## Referências\n',
    grupos: grupos.size ? [...grupos].map(([nome, itens]) => ({ nome, texto: itens.join('\n') })) : [{ nome: 'Checklist', texto: '' }],
    etiquetas: m?.etiquetas ?? [],
    prazoDiasUteis: m?.prazoDiasUteis == null ? '' : String(m.prazoDiasUteis),
    prioridade: m?.prioridade ?? '',
    estimativa: textoDeMinutos(m?.estimativaMin ?? null),
    rodadasInclusas: m?.rodadasInclusas == null ? '' : String(m.rodadasInclusas),
  }
}

/** Corpo do POST/PATCH a partir do rascunho (as listas substituem). */
function corpoDe(r: Rascunho, podeRodadas: boolean) {
  const prazo = r.prazoDiasUteis.trim() === '' ? null : Number(r.prazoDiasUteis)
  return {
    nome: r.nome.trim(),
    descricao: r.descricao.trim(),
    icone: r.icone,
    briefingMd: r.briefingMd,
    prazoDiasUteis: prazo,
    prioridade: r.prioridade || null,
    estimativaMin: minutosDeTexto(r.estimativa) ?? null,
    ...(podeRodadas ? { rodadasInclusas: r.rodadasInclusas === '' ? null : Number(r.rodadasInclusas) } : {}),
    itens: r.grupos.flatMap((g) => linhasParaItens(g.texto).map((texto) => ({ checklist: g.nome.trim() || 'Checklist', texto }))),
    etiquetas: r.etiquetas.filter((e) => e.nome.trim()),
  }
}

export default function TelaModelos() {
  useTituloAba('Modelos de demanda · Configurações')
  const qc = useQueryClient()
  const eu = useEu()
  const config = useConfig()
  const quadros = useQuadros()
  const admin = eu.usuario.papel === 'admin'
  const podeRodadas = admin || eu.usuario.papel === 'atendimento'
  const [params, setParams] = useSearchParams()
  const quadroId = params.get('quadro') && quadros.some((q) => q.id === params.get('quadro')) ? params.get('quadro') : null
  const { data: todos, isPending, error } = useModelosTodos()
  const doEscopo = useMemo(() => (todos ?? []).filter((m) => m.quadroId === quadroId)
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.pos - b.pos), [todos, quadroId])
  const [selecionado, setSelecionado] = useState<Id | 'novo' | null>(null)
  const atual = selecionado === 'novo' ? null : doEscopo.find((m) => m.id === selecionado) ?? null
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [revisando, setRevisando] = useState(false)
  const podeEditar = quadroId !== null || admin

  // escolhe o primeiro do escopo ao trocar de escopo
  useEffect(() => {
    if (selecionado === 'novo' || (selecionado && doEscopo.some((m) => m.id === selecionado))) return
    setSelecionado(doEscopo[0]?.id ?? null)
  }, [doEscopo, selecionado])
  useEffect(() => {
    setRascunho(selecionado === 'novo' ? rascunhoDe(null, quadroId) : atual ? rascunhoDe(atual, quadroId) : null)
    setErro(null)
  }, [selecionado, atual?.atualizadoEm])

  /** No celular o editor fica embaixo da lista: escolher leva até ele. */
  function escolher(id: Id | 'novo') {
    setSelecionado(id)
    if (ehCelular()) requestAnimationFrame(() => document.querySelector('.modelos-editor')?.scrollIntoView({ block: 'start' }))
  }

  function mudarEscopo(id: string) {
    setParams(id ? { quadro: id } : {}, { replace: true })
    setSelecionado(null)
  }

  async function salvar() {
    if (!rascunho || !podeEditar) return
    if (!rascunho.nome.trim()) { setErro('Dê um nome ao modelo.'); return }
    if (minutosDeTexto(rascunho.estimativa) === undefined) { setErro('Estimativa: use 45 min, 2h ou 1h30.'); return }
    setSalvando(true)
    setErro(null)
    try {
      const corpo = corpoDe(rascunho, podeRodadas)
      const m = rascunho.id ? await editarModelo(qc, rascunho.id, corpo) : await criarModelo(qc, { ...corpo, quadroId: rascunho.quadroId })
      setSelecionado(m.id)
      avisar(rascunho.id ? 'Modelo salvo.' : `Modelo ${m.nome} criado.`, { tipo: 'sucesso' })
    } catch (e) {
      setErro(ehErroDaApi(e) ? e.mensagem : mensagemDeErro(e))
    } finally {
      setSalvando(false)
    }
  }

  async function mudarAtivo(m: ModeloDemanda, ativo: boolean) {
    try {
      await editarModelo(qc, m.id, { ativo })
      avisar(ativo ? `${m.nome} voltou para a Nova demanda.` : `${m.nome} saiu da Nova demanda.`, {
        tipo: 'sucesso', desfazer: ativo ? undefined : async () => { await editarModelo(qc, m.id, { ativo: true }) },
      })
    } catch (e) {
      avisar('Não foi possível mudar o modelo.', { tipo: 'erro', descricao: mensagemDeErro(e) })
    }
  }

  async function revisei() {
    setRevisando(true)
    try {
      await marcarRevisados(qc)
      avisar('Modelos marcados como revisados.', { tipo: 'sucesso' })
    } catch (e) {
      avisar('Não foi possível marcar.', { tipo: 'erro', descricao: mensagemDeErro(e) })
    } finally {
      setRevisando(false)
    }
  }

  const quadrosAtivos = [...quadros].filter((q) => q.arquivadoEm === null).sort((a, b) => a.pos - b.pos)
  const nomeEscopo = quadroId ? quadros.find((q) => q.id === quadroId)?.nome ?? 'Quadro' : 'Globais'

  return (
    <section className="modelos" aria-labelledby="modelos-titulo">
      <header className="modelos-cabeca">
        <div>
          <h2 id="modelos-titulo" className="modelos-titulo">Modelos de demanda</h2>
          <p className="modelos-sub">
            O modelo preenche a Nova demanda: o briefing vira a descrição, com o checklist, as etiquetas e o prazo em dias úteis.
          </p>
        </div>
        <div className="modelos-cabeca-acoes">
          {admin && (
            <div className="modelos-revisado">
              <span>{config.modelosRevisadosEm ? `Revisados em ${formatarPrazo(dataLocalDe(config.modelosRevisadosEm), null)}.` : 'Ainda não revisados.'}</span>
              <Botao variante="ghost" tamanho="p" icone={Check} carregando={revisando} onClick={() => void revisei()}>Revisei os modelos</Botao>
            </div>
          )}
          {podeEditar && <Botao variante="secundario" icone={Plus} onClick={() => escolher('novo')}>Novo modelo</Botao>}
        </div>
      </header>

      <div className="modelos-barra">
        <Selecao rotulo="Modelos de" tamanho="p" value={quadroId ?? ''} classeGrupo="modelos-escopo"
          opcoes={[{ valor: '', rotulo: 'Todos os quadros (globais)' }, ...quadrosAtivos.map((q) => ({ valor: q.id, rotulo: `Quadro ${q.nome}` }))]}
          onChange={(e) => mudarEscopo(e.target.value)} />
      </div>
      {!podeEditar && (
        <p className="modelos-nota"><Lock aria-hidden="true" /> Só o admin edita os modelos globais. Os de cada quadro, qualquer pessoa.</p>
      )}

      {isPending ? <EsqueletoLinhas linhas={6} /> : error ? (
        <EstadoVazio icone={LayoutTemplate} titulo="Não foi possível carregar os modelos." texto={error.mensagem} />
      ) : (
        <div className="modelos-corpo">
          <ul className="modelos-lista" aria-label={`Modelos: ${nomeEscopo}`}>
            {doEscopo.length === 0 && selecionado !== 'novo' && (
              <li className="modelos-vazio">
                Nenhum modelo {quadroId ? 'só deste quadro' : 'global'} ainda.{quadroId ? ' Os globais também aparecem na Nova demanda deste quadro.' : ''}
              </li>
            )}
            {selecionado === 'novo' && (
              <li><button type="button" className="modelos-item" aria-current="true"><Plus aria-hidden="true" /><span className="modelos-item-nome">Novo modelo</span></button></li>
            )}
            {doEscopo.map((m) => {
              const I = iconeDoModelo(m.icone)
              const n = m.itens.length
              return (
                <li key={m.id}>
                  <button type="button" className="modelos-item" aria-current={selecionado === m.id ? 'true' : undefined}
                    data-inativo={!m.ativo || undefined} onClick={() => escolher(m.id)}>
                    <I aria-hidden="true" />
                    <span className="modelos-item-textos">
                      <span className="modelos-item-nome">{m.nome}{!m.ativo && <span className="modelos-item-inativo"> · desativado</span>}</span>
                      <span className="modelos-item-meta">
                        {[m.prazoDiasUteis != null ? `${m.prazoDiasUteis} ${m.prazoDiasUteis === 1 ? 'dia útil' : 'dias úteis'}` : 'sem prazo',
                          n ? `${n} ${n === 1 ? 'item' : 'itens'}` : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {rascunho ? (
            <Editor
              key={rascunho.id ?? 'novo'}
              r={rascunho}
              mudar={(f) => setRascunho((x) => (x ? f(x) : x))}
              somenteLeitura={!podeEditar}
              podeRodadas={podeRodadas}
              erro={erro}
              salvando={salvando}
              salvar={() => void salvar()}
              cancelar={() => { setSelecionado(atual?.id ?? doEscopo[0]?.id ?? null); setRascunho(atual ? rascunhoDe(atual, quadroId) : null) }}
              modelo={atual}
              mudarAtivo={(ativo) => atual && void mudarAtivo(atual, ativo)}
            />
          ) : (
            <EstadoVazio icone={LayoutTemplate} titulo="Escolha um modelo" texto={podeEditar ? 'Ou crie um novo para este escopo.' : undefined} />
          )}
        </div>
      )}
    </section>
  )
}

interface PropsEditor {
  r: Rascunho
  mudar(f: (r: Rascunho) => Rascunho): void
  somenteLeitura: boolean
  podeRodadas: boolean
  erro: string | null
  salvando: boolean
  salvar(): void
  cancelar(): void
  modelo: ModeloDemanda | null
  mudarAtivo(ativo: boolean): void
}

function Editor({ r, mudar, somenteLeitura, podeRodadas, erro, salvando, salvar, cancelar, modelo, mudarAtivo }: PropsEditor) {
  const [previa, setPrevia] = useState(false)
  const ro = somenteLeitura
  const estimativaRuim = minutosDeTexto(r.estimativa) === undefined
  return (
    <form className="modelos-editor" aria-label={r.id ? `Editar ${r.nome}` : 'Novo modelo'}
      onSubmit={(e) => { e.preventDefault(); salvar() }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar() } }}>
      <div className="modelos-par">
        <Campo rotulo="Nome" value={r.nome} maxLength={60} disabled={ro} required
          onChange={(e) => { const v = e.target.value; mudar((x) => ({ ...x, nome: v })) }} />
        <Campo rotulo="Linha de ajuda" opcional value={r.descricao} maxLength={200} disabled={ro} placeholder="Aparece na grade da Nova demanda."
          onChange={(e) => { const v = e.target.value; mudar((x) => ({ ...x, descricao: v })) }} />
      </div>

      <fieldset className="modelos-icones" disabled={ro}>
        <legend className="ui-rotulo">Ícone</legend>
        <div role="radiogroup" aria-label="Ícone do modelo" className="modelos-icones-grade"
          onKeyDown={(e) => {
            const i = ICONES_MODELO.findIndex((x) => x.nome === r.icone)
            const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
            if (!passo) return
            e.preventDefault()
            const prox = ICONES_MODELO[(Math.max(0, i) + passo + ICONES_MODELO.length) % ICONES_MODELO.length]!
            mudar((x) => ({ ...x, icone: prox.nome }))
            const grade = e.currentTarget
            requestAnimationFrame(() => grade.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
          }}>
          {ICONES_MODELO.map(({ nome, rotulo, Icone }) => (
            <button key={nome} type="button" role="radio" aria-checked={r.icone === nome} aria-label={rotulo} title={rotulo}
              tabIndex={r.icone === nome || (!ICONES_MODELO.some((x) => x.nome === r.icone) && nome === 'file-text') ? 0 : -1}
              className="modelos-icone" onClick={() => mudar((x) => ({ ...x, icone: nome }))}>
              <Icone aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="ui-campo-grupo">
        <div className="modelos-rotulo-linha">
          <span className="ui-rotulo">Briefing</span>
          <Botao variante="ghost" tamanho="p" icone={previa ? EyeOff : Eye} onClick={() => setPrevia((p) => !p)} aria-pressed={previa}>
            {previa ? 'Voltar a editar' : 'Ver como fica na demanda'}
          </Botao>
        </div>
        {previa ? (
          <div className="modelos-previa" aria-label="Prévia do briefing">
            <Suspense fallback={<EsqueletoLinhas linhas={4} />}><Markdown texto={r.briefingMd} /></Suspense>
          </div>
        ) : (
          <EditorMarkdown rotulo="Briefing do modelo" valor={r.briefingMd} desabilitado={ro} minLinhas={8}
            aoMudar={(md) => mudar((x) => ({ ...x, briefingMd: md }))} aoSalvar={salvar}
            placeholder="Os títulos (## Objetivo) guiam quem pede." />
        )}
        <p className="ui-campo-ajuda">Vira a descrição da demanda. Use títulos para guiar quem pede.</p>
      </div>

      <div className="ui-campo-grupo">
        <span className="ui-rotulo">Checklist</span>
        {r.grupos.map((g, i) => (
          <div key={i} className="modelos-grupo">
            {r.grupos.length > 1 && (
              <Campo rotulo={`Nome do checklist ${i + 1}`} rotuloOculto tamanho="p" value={g.nome} maxLength={200} disabled={ro}
                onChange={(e) => { const v = e.target.value; mudar((x) => ({ ...x, grupos: x.grupos.map((y, j) => (j === i ? { ...y, nome: v } : y)) })) }} />
            )}
            <AreaTexto rotulo={r.grupos.length > 1 ? `Itens de ${g.nome || 'Checklist'}` : 'Itens do checklist'} rotuloOculto linhas={4}
              value={g.texto} disabled={ro} placeholder="Um item por linha"
              onChange={(e) => { const v = e.target.value; mudar((x) => ({ ...x, grupos: x.grupos.map((y, j) => (j === i ? { ...y, texto: v } : y)) })) }} />
            {r.grupos.length > 1 && !ro && (
              <Botao variante="ghost" tamanho="p" icone={Trash2} className="modelos-tirar"
                onClick={() => mudar((x) => ({ ...x, grupos: x.grupos.filter((_, j) => j !== i) }))}>Tirar este checklist</Botao>
            )}
          </div>
        ))}
        {!ro && (
          <Botao variante="ghost" tamanho="p" icone={Plus} className="modelos-tirar"
            onClick={() => mudar((x) => ({ ...x, grupos: [...x.grupos, { nome: `Checklist ${x.grupos.length + 1}`, texto: '' }] }))}>
            Outro checklist
          </Botao>
        )}
      </div>

      <div className="ui-campo-grupo">
        <span className="ui-rotulo">Etiquetas padrão</span>
        <p className="ui-campo-ajuda">Casam pelo nome com as do quadro; se o quadro não tiver, nascem com esta cor.</p>
        {r.etiquetas.map((et, i) => (
          <div key={i} className="modelos-etiqueta">
            <Campo rotulo={`Etiqueta ${i + 1}`} rotuloOculto tamanho="p" value={et.nome} maxLength={40} disabled={ro}
              onChange={(e) => { const v = e.target.value; mudar((x) => ({ ...x, etiquetas: x.etiquetas.map((y, j) => (j === i ? { ...y, nome: v } : y)) })) }} />
            <SeletorCor rotulo={`Cor da etiqueta ${et.nome || i + 1}`} valor={et.cor}
              aoMudar={(c) => mudar((x) => ({ ...x, etiquetas: x.etiquetas.map((y, j) => (j === i ? { ...y, cor: (c ?? 'grafite') as Cor } : y)) }))} />
            {!ro && (
              <BotaoIcone icone={X} rotulo={`Tirar a etiqueta ${et.nome || i + 1}`} tamanho="p"
                onClick={() => mudar((x) => ({ ...x, etiquetas: x.etiquetas.filter((_, j) => j !== i) }))} />
            )}
          </div>
        ))}
        {!ro && r.etiquetas.length < 20 && (
          <Botao variante="ghost" tamanho="p" icone={Plus} className="modelos-tirar"
            onClick={() => mudar((x) => ({ ...x, etiquetas: [...x.etiquetas, { nome: '', cor: 'azul' }] }))}>Adicionar etiqueta</Botao>
        )}
      </div>

      <div className="modelos-quatro">
        <Campo rotulo="Prazo (dias úteis)" tamanho="p" type="number" min={0} max={120} inputMode="numeric" value={r.prazoDiasUteis} disabled={ro}
          placeholder="Sem prazo" ajuda="A partir do dia da criação."
          onChange={(e) => { const v = e.target.value; mudar((x) => ({ ...x, prazoDiasUteis: v })) }} />
        <Selecao rotulo="Prioridade" tamanho="p" value={r.prioridade} disabled={ro}
          opcoes={[{ valor: '', rotulo: 'Média (padrão)' }, ...PRIORIDADES.map((p) => ({ valor: p, rotulo: ROTULO_PRIORIDADE[p] }))]}
          onChange={(e) => { const v = e.target.value as Prioridade | ''; mudar((x) => ({ ...x, prioridade: v })) }} />
        <Campo rotulo="Estimativa" tamanho="p" value={r.estimativa} disabled={ro} placeholder="1h30"
          erro={estimativaRuim ? 'Use 45 min, 2h ou 1h30.' : undefined}
          onChange={(e) => { const v = e.target.value; mudar((x) => ({ ...x, estimativa: v })) }} />
        {podeRodadas && (
          <Selecao rotulo="Rodadas inclusas" tamanho="p" value={r.rodadasInclusas} disabled={ro}
            opcoes={[{ valor: '', rotulo: 'As do cliente' }, ...Array.from({ length: 11 }, (_, n) => ({ valor: String(n), rotulo: String(n) }))]}
            onChange={(e) => { const v = e.target.value; mudar((x) => ({ ...x, rodadasInclusas: v })) }} />
        )}
      </div>

      {erro && <p className="ui-campo-erro" role="alert">{erro}</p>}
      {!ro && (
        <div className="modelos-acoes">
          {modelo && (modelo.ativo
            ? <Botao variante="perigo" tamanho="p" onClick={() => mudarAtivo(false)}>Desativar</Botao>
            : <Botao variante="secundario" tamanho="p" onClick={() => mudarAtivo(true)}>Reativar</Botao>)}
          <span className="modelos-acoes-espaco" />
          <Botao variante="ghost" onClick={cancelar}>Descartar</Botao>
          <Botao type="submit" variante="primario" carregando={salvando}>{r.id ? 'Salvar' : 'Criar modelo'}</Botao>
        </div>
      )}
    </form>
  )
}
