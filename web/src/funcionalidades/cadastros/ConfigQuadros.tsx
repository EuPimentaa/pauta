/**
 * Configurações › Quadros (PLANO §3 F5): os quadros ativos (por equipe) e os arquivados; de cada um, os dados (nome,
 * endereço, descrição, equipe, cor, fundo, "uma coluna por pessoa": admin), as colunas (cor, papel, pessoa, limite
 * WIP, ordem, arquivar e restaurar: todos), as etiquetas (todos), as automações (o diálogo `automacoes-quadro` do F2,
 * atendimento e admin), copiar, arquivar, restaurar e excluir o que nunca teve demanda (admin).
 * `?quadro=<slug>` escolhe o quadro (o "Editar quadro" do menu ··· do quadro vem para cá).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronDown, Copy, ExternalLink, LayoutGrid, Plus, Settings2, Tag, Trash2, TriangleAlert, Zap,
} from 'lucide-react'
import {
  GATILHOS_AUTOMACAO, PAPEIS_COLUNA, ROTULO_GATILHO, ROTULO_PAPEL_COLUNA, type Bootstrap, type Coluna, type Cor, type Etiqueta, type FundoQuadro,
  type PapelColuna, type Quadro,
} from '@shared/tipos/index.ts'
import { slugDe } from '@shared/logica/quadro.ts'
import { avisarErro } from '../../api/acoes.ts'
import { useEu } from '../../api/auth.ts'
import { useColunasMutacoes, useEditarQuadro, useEtiquetasMutacoes } from '../../api/quadros.ts'
import { useAutomacoes, useColunas, useDemandas, useDoBootstrap, useEquipes, useEtiquetas, useQuadros, useUsuarios } from '../../api/seletores.ts'
import { chaves } from '../../api/chaves.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { useAbrirSobreposta } from '../../sessao/sobreposta.tsx'
import { avisar } from '../../ui/avisos.tsx'
import { Botao, BotaoIcone, propsBotao } from '../../ui/Botao.tsx'
import { AreaTexto, Campo, Selecao } from '../../ui/Campo.tsx'
import { Interruptor } from '../../ui/Checkbox.tsx'
import { ChipEtiqueta } from '../../ui/Chips.tsx'
import { EstadoVazio } from '../../ui/Indicadores.tsx'
import { SeletorCor } from '../../ui/SeletorCor.tsx'
import { arquivarQuadro, excluirQuadro, restaurarQuadro, useQuadroCompleto, useQuadrosArquivados } from './api.ts'
import { BotaoCor, Faixa, nomeCurto, Painel, Pilula, SeletorFundo, usePode } from './comum.tsx'
import './dialogos.ts'
import { RodapePendente, useRascunhoConfig } from './pendentes.tsx'

const colacao = new Intl.Collator('pt-BR', { sensitivity: 'base' })
const OPCOES_PAPEL = PAPEIS_COLUNA.map((p) => ({ valor: p, rotulo: ROTULO_PAPEL_COLUNA[p] }))

// ─────────────────────────────── dados do quadro (admin) ───────────────────────────────

interface DadosQuadro { nome: string; slug: string; descricao: string; equipeId: string | null; cor: Cor; fundo: FundoQuadro; porPessoa: boolean }

/** Os dados do quadro (admin). As mudanças não salvas ficam guardadas por quadro: trocar o seletor e voltar não as perde. */
function PainelDados({ quadro }: { quadro: Quadro }) {
  const editar = useEditarQuadro()
  const equipes = useEquipes()
  const [d, definir, esquecer] = useRascunhoConfig<DadosQuadro>(`config:quadro:${quadro.id}`, {
    nome: quadro.nome, slug: quadro.slug, descricao: quadro.descricao, equipeId: quadro.equipeId, cor: quadro.cor, fundo: quadro.fundo,
    porPessoa: quadro.colunaPorMembro,
  })
  const { nome, slug, descricao, equipeId, cor, fundo, porPessoa } = d
  const setNome = (v: string) => definir({ ...d, nome: v })
  const setSlug = (v: string) => definir({ ...d, slug: v })
  const setDescricao = (v: string) => definir({ ...d, descricao: v })
  const setEquipeId = (v: string | null) => definir({ ...d, equipeId: v })
  const setCor = (v: Cor) => definir({ ...d, cor: v })
  const setFundo = (v: FundoQuadro) => definir({ ...d, fundo: v })
  const setPorPessoa = (v: boolean) => definir({ ...d, porPessoa: v })
  const [salvando, setSalvando] = useState(false)
  const slugValido = /^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)
  const mudancas = [nome.trim() !== quadro.nome, slug !== quadro.slug, descricao.trim() !== quadro.descricao, equipeId !== quadro.equipeId,
    cor !== quadro.cor, fundo !== quadro.fundo, porPessoa !== quadro.colunaPorMembro].filter(Boolean).length
  const mudou = mudancas > 0

  async function salvar() {
    if (!nome.trim() || !slugValido) return
    setSalvando(true)
    const r = await editar(quadro, {
      ...(nome.trim() !== quadro.nome ? { nome: nome.trim() } : {}), ...(slug !== quadro.slug ? { slug } : {}),
      ...(descricao.trim() !== quadro.descricao ? { descricao: descricao.trim() } : {}), ...(equipeId !== quadro.equipeId ? { equipeId } : {}),
      ...(cor !== quadro.cor ? { cor } : {}), ...(fundo !== quadro.fundo ? { fundo } : {}),
      ...(porPessoa !== quadro.colunaPorMembro ? { colunaPorMembro: porPessoa } : {}),
    })
    setSalvando(false)
    if (r) {
      esquecer({ nome: r.nome, slug: r.slug, descricao: r.descricao, equipeId: r.equipeId, cor: r.cor, fundo: r.fundo, porPessoa: r.colunaPorMembro })
      avisar(`Quadro ${r.nome} salvo.`, { tipo: 'sucesso' })
    }
  }

  return (
    <form className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
      <div className="cad-grade">
        <Campo rotulo="Nome" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} erro={!nome.trim() ? 'Dê um nome ao quadro.' : undefined} />
        <Campo rotulo="Endereço" value={slug} maxLength={60} onChange={(e) => setSlug(e.target.value.toLowerCase())}
          sufixo={slug !== slugDe(nome) && nome.trim() ? <button type="button" className="cad-nota underline" onClick={() => setSlug(slugDe(nome))}>usar do nome</button> : undefined}
          ajuda={`/q/${slug || '…'}`} erro={!slugValido ? 'Letras minúsculas, números e hífens.' : undefined} />
        <Selecao rotulo="Equipe" value={equipeId ?? ''} vazia="Sem equipe" onChange={(e) => setEquipeId(e.target.value || null)}
          opcoes={equipes.filter((e) => e.ativa || e.id === quadro.equipeId).map((e) => ({ valor: e.id, rotulo: e.nome }))} />
      </div>
      {slug !== quadro.slug && slugValido && <Faixa icone={TriangleAlert}>Os links antigos para /q/{quadro.slug} param de abrir.</Faixa>}
      <AreaTexto rotulo="Descrição" opcional linhas={1} value={descricao} maxLength={500} onChange={(e) => setDescricao(e.target.value)}
        ajuda="Aparece embaixo do nome, no quadro." />
      <div className="cad-grade-2">
        <div className="cad-campo-cor"><span className="ui-rotulo">Cor</span><SeletorCor valor={cor} rotulo="Cor do quadro" aoMudar={(c) => c && setCor(c)} /></div>
        <div className="cad-campo-cor"><span className="ui-rotulo">Fundo</span><SeletorFundo valor={fundo} aoMudar={setFundo} /></div>
      </div>
      <Interruptor ligado={porPessoa} aoMudar={setPorPessoa}>Uma coluna por pessoa: quem entrar na equipe ganha a própria coluna (desligar não apaga as que existem)</Interruptor>
      <RodapePendente mudancas={mudancas} aoDescartar={() => esquecer()}
        rotulo={mudancas === 1 ? '1 mudança não salva neste quadro' : `${mudancas} mudanças não salvas neste quadro`}>
        <Botao type="submit" variante="primario" carregando={salvando} disabled={!mudou || !nome.trim() || !slugValido}>Salvar quadro</Botao>
      </RodapePendente>
    </form>
  )
}

// ─────────────────────────────── colunas ───────────────────────────────

/** Texto que salva ao sair do campo ou no Enter (Esc volta ao valor salvo). */
function CampoAoSair({ valor, salvar, rotulo, tipo = 'text', ...resto }: {
  valor: string; salvar(v: string): void; rotulo: string; tipo?: 'text' | 'number'; placeholder?: string; min?: number; maxLength?: number
}) {
  const [texto, setTexto] = useState(valor)
  useEffect(() => setTexto(valor), [valor])
  const confirmar = () => { if (texto.trim() !== valor) salvar(texto.trim()) }
  return (
    <Campo rotulo={rotulo} rotuloOculto tamanho="p" type={tipo} value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirmar() }
        if (e.key === 'Escape' && texto !== valor) { e.stopPropagation(); setTexto(valor) }
      }} {...resto} />
  )
}

function PainelColunas({ quadro }: { quadro: Quadro }) {
  const qc = useQueryClient()
  const abrirDialogo = useAbrirDialogo()
  const colunas = useColunas(quadro.id)
  const usuarios = useUsuarios()
  const demandas = useDemandas()
  const m = useColunasMutacoes()
  const completo = useQuadroCompleto(quadro.id)
  const [nova, setNova] = useState('')
  const arquivadas = (completo.data?.colunas ?? []).filter((c) => c.arquivadaEm !== null)
  const pessoas = useMemo(() => usuarios.filter((u) => u.ativo).sort((a, b) => colacao.compare(a.nome, b.nome)), [usuarios])
  const atualizar = () => void qc.invalidateQueries({ queryKey: chaves.quadro(quadro.id) })

  async function mudarPapel(c: Coluna, papel: PapelColuna) {
    if (papel === 'concluida') {
      const abertas = demandas.filter((d) => d.colunaId === c.id && !d.concluidaEm).length
      if (abertas > 0) {
        const ok = await abrirDialogo('confirmar', {
          titulo: `${c.nome} vira coluna de concluídas?`, confirmar: 'Mudar o papel',
          mensagem: `${abertas === 1 ? 'A demanda aberta desta coluna será marcada' : `As ${abertas} demandas abertas desta coluna serão marcadas`} como concluída${abertas === 1 ? '' : 's'}, sem criar repetições.`,
        })
        if (!ok) return
      }
    }
    await m.editar(c, { papel, ...(papel !== 'normal' && c.responsavelId ? { responsavelId: null } : {}) })
  }

  async function mover(i: number, passo: -1 | 1) {
    const c = colunas[i]!
    const depois = passo === -1 ? (colunas[i - 2]?.id ?? null) : colunas[i + 1]!.id
    await m.editar(c, { posicao: { depoisDeId: depois } })
  }

  async function adicionar() {
    const nome = nova.trim()
    if (!nome) return
    const c = await m.criar(quadro.id, { nome })
    if (c) { setNova(''); atualizar() }
  }

  return (
    <div className="cad-colunas">
      {colunas.length === 0 && <p className="cad-nota">Este quadro ainda não tem colunas.</p>}
      {colunas.map((c, i) => {
        const pessoa = c.responsavelId ? usuarios.find((u) => u.id === c.responsavelId) : undefined
        return (
          <div key={c.id} className="cad-coluna cad-coluna-config" data-cor={c.cor ?? undefined}>
            <span className="cad-coluna-num" aria-hidden="true">{i + 1}</span>
            <BotaoCor valor={c.cor} rotulo={`Cor da coluna ${c.nome}`} permitirSemCor aoMudar={(cor) => void m.editar(c, { cor })} />
            <CampoAoSair rotulo={`Nome da coluna ${c.nome}`} valor={c.nome} maxLength={60} salvar={(nome) => { if (nome) void m.editar(c, { nome }) }} />
            <div className="cad-coluna-papel flex gap-2 min-w-0">
              <Selecao classeGrupo="flex-1 min-w-0" rotulo={`Papel da coluna ${c.nome}`} rotuloOculto tamanho="p" opcoes={OPCOES_PAPEL} value={c.papel}
                onChange={(e) => void mudarPapel(c, e.target.value as PapelColuna)} />
              <Selecao classeGrupo="flex-1 min-w-0" rotulo={`Pessoa da coluna ${c.nome}`} rotuloOculto tamanho="p" value={c.responsavelId ?? ''} vazia="Sem pessoa"
                disabled={c.papel !== 'normal'} title={c.papel !== 'normal' ? 'Só coluna de papel normal tem pessoa.' : undefined}
                opcoes={(pessoa && !pessoa.ativo ? [pessoa, ...pessoas] : pessoas).map((u) => ({ valor: u.id, rotulo: `Coluna de ${nomeCurto(u)}` }))}
                onChange={(e) => void m.editar(c, { responsavelId: e.target.value || null })} />
            </div>
            <span className="cad-coluna-fim">
              <span className="w-20"><CampoAoSair rotulo={`Limite WIP da coluna ${c.nome}`} tipo="number" min={1} placeholder="WIP" valor={c.limiteWip ? String(c.limiteWip) : ''}
                salvar={(v) => void m.editar(c, { limiteWip: v ? Math.max(1, Math.round(Number(v))) : null })} /></span>
              <BotaoIcone icone={ArrowUp} rotulo={`Subir ${c.nome}`} tamanho="p" disabled={i === 0} onClick={() => void mover(i, -1)} />
              <BotaoIcone icone={ArrowDown} rotulo={`Descer ${c.nome}`} tamanho="p" disabled={i === colunas.length - 1} onClick={() => void mover(i, 1)} />
              <BotaoIcone icone={Archive} rotulo={`Arquivar a coluna ${c.nome}`} tamanho="p" onClick={async () => { if (await m.arquivar(c)) atualizar() }} />
            </span>
          </div>
        )
      })}
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void adicionar() }}>
        <Campo classeGrupo="flex-1" rotulo="Nova coluna" rotuloOculto tamanho="p" placeholder="+ Adicionar coluna (nome e Enter)" value={nova}
          maxLength={60} onChange={(e) => setNova(e.target.value)} />
        <Botao type="submit" tamanho="p" variante="secundario" icone={Plus} disabled={!nova.trim()}>Adicionar</Botao>
      </form>
      <p className="cad-nota">Arquivar só vale para coluna sem cards. O limite WIP só avisa ("6/5"), nunca bloqueia.</p>
      {arquivadas.length > 0 && (
        <details className="cad-secao">
          <summary className="ui-rotulo cursor-pointer">Colunas arquivadas ({arquivadas.length})</summary>
          <ul className="cad-lista">
            {arquivadas.map((c) => (
              <li key={c.id} className="cad-linha">
                <span className="cad-ponto" data-cor={c.cor ?? undefined} aria-hidden="true" />
                <span className="flex-1 min-w-0">{c.nome}</span>
                <Botao tamanho="p" variante="ghost" icone={ArchiveRestore} onClick={async () => { if (await m.restaurar(c)) atualizar() }}>Restaurar</Botao>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

// ─────────────────────────────── etiquetas ───────────────────────────────

function PainelEtiquetas({ quadro }: { quadro: Quadro }) {
  const etiquetas = useEtiquetas(quadro.id)
  const demandas = useDemandas()
  const abrirDialogo = useAbrirDialogo()
  const m = useEtiquetasMutacoes()
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState<Cor>('azul')

  async function excluir(et: Etiqueta) {
    const n = demandas.filter((d) => d.etiquetaIds.includes(et.id)).length
    const ok = await abrirDialogo('confirmar', {
      titulo: `Excluir a etiqueta ${et.nome || 'sem nome'}?`, confirmar: 'Excluir etiqueta', perigo: true,
      mensagem: n ? `Ela sai de ${n === 1 ? '1 demanda' : `${n} demandas`} deste quadro (e das que a guardam em outro quadro).` : 'Nenhuma demanda usa esta etiqueta agora.',
    })
    if (ok) await m.excluir(et)
  }

  return (
    <div className="cad-etiquetas">
      {etiquetas.length === 0 && <p className="cad-nota">Nenhuma etiqueta. Etiquetas são do quadro: cada quadro tem as suas.</p>}
      {etiquetas.map((et) => (
        <div key={et.id} className="cad-etiqueta">
          <BotaoCor valor={et.cor} rotulo={`Cor da etiqueta ${et.nome}`} aoMudar={(c) => { if (c) void m.editar(et, { cor: c }) }} />
          <CampoAoSair rotulo={`Nome da etiqueta ${et.nome}`} valor={et.nome} maxLength={40} placeholder="Só a cor" salvar={(v) => void m.editar(et, { nome: v })} />
          <ChipEtiqueta etiqueta={{ nome: et.nome, cor: et.cor }} />
          <BotaoIcone icone={Trash2} rotulo={`Excluir a etiqueta ${et.nome}`} tamanho="p" onClick={() => void excluir(et)} />
        </div>
      ))}
      <form className="cad-etiqueta" onSubmit={async (e) => {
        e.preventDefault()
        const et = await m.criar(quadro.id, { nome: nome.trim(), cor })
        if (et) setNome('')
      }}>
        <BotaoCor valor={cor} rotulo="Cor da etiqueta nova" aoMudar={(c) => c && setCor(c)} />
        <Campo rotulo="Nome da etiqueta nova" rotuloOculto tamanho="p" placeholder="Nova etiqueta (vazio = só cor)" value={nome} maxLength={40}
          onChange={(e) => setNome(e.target.value)} />
        <ChipEtiqueta etiqueta={{ nome: nome.trim(), cor }} />
        <Botao type="submit" tamanho="p" variante="secundario" icone={Plus}>Criar</Botao>
      </form>
    </div>
  )
}

// ─────────────────────────────── automações ───────────────────────────────

function PainelAutomacoes({ quadro }: { quadro: Quadro }) {
  const automacoes = useAutomacoes(quadro.id)
  const quadros = useQuadros()
  const abrirDialogo = useAbrirDialogo()
  const podeEditar = usePode('automacao.editar')
  const colunasDe = useColunasDeTodos()
  return (
    <div className="cad-secao">
      <ul className="cad-lista">
        {GATILHOS_AUTOMACAO.map((g) => {
          const a = automacoes.find((x) => x.gatilho === g)
          const destinoQuadro = a ? quadros.find((q) => q.id === a.destinoQuadroId) : undefined
          const destinoColuna = a ? colunasDe.get(a.destinoColunaId) : undefined
          return (
            <li key={g} className="cad-automacao" data-inativa={!a || !a.ativa ? '' : undefined}>
              <Zap aria-hidden="true" />
              <span>{ROTULO_GATILHO[g]}</span>
              {a ? (
                <strong>{destinoQuadro && destinoQuadro.id !== quadro.id ? `${destinoQuadro.nome} › ` : ''}{destinoColuna?.nome ?? 'uma coluna arquivada'}</strong>
              ) : <span className="cad-nota">não move</span>}
              {a && !a.ativa && <Pilula tom="aviso">desligada: o destino foi arquivado</Pilula>}
              {a && a.membros === 'responsavel_destino' && destinoQuadro?.id !== quadro.id && <Pilula>responsável do cliente no destino</Pilula>}
            </li>
          )
        })}
      </ul>
      {podeEditar
        ? <div><Botao tamanho="p" variante="secundario" icone={Settings2} onClick={() => void abrirDialogo('automacoes-quadro', { quadroId: quadro.id })}>Configurar automações</Botao></div>
        : <p className="cad-nota">Só o atendimento e o admin mudam as automações.</p>}
    </div>
  )
}

const selColunasTodas = (b: Bootstrap) => b.colunas
function useColunasDeTodos(): Map<string, Coluna> {
  const lista = useDoBootstrap(selColunasTodas)
  return useMemo(() => new Map((lista ?? []).map((c) => [c.id, c])), [lista])
}

// ─────────────────────────────── ações do quadro ───────────────────────────────

function AcoesQuadro({ quadro, aoArquivar }: { quadro: Quadro; aoArquivar(): void }) {
  const qc = useQueryClient()
  const abrirDialogo = useAbrirDialogo()
  async function arquivar() {
    const ok = await abrirDialogo('confirmar', {
      titulo: `Arquivar ${quadro.nome}?`, confirmar: 'Arquivar quadro', perigo: true,
      mensagem: 'O quadro e as demandas dele saem do menu, do Início e da Agenda (nada se perde). As automações de outros quadros que levavam para ele são desligadas. Dá para restaurar aqui.',
    })
    if (!ok) return
    try {
      await arquivarQuadro(qc, quadro)
      avisar(`Quadro ${quadro.nome} arquivado.`, { desfazer: async () => { await restaurarQuadro(qc, quadro) } })
      aoArquivar()
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível arquivar o quadro.' })
    }
  }
  return (
    <div className="cad-acoes">
      <Link {...propsBotao({ tamanho: 'p' })} to={`/q/${encodeURIComponent(quadro.slug)}`}><ExternalLink aria-hidden="true" /><span>Abrir quadro</span></Link>
      <Botao tamanho="p" variante="secundario" icone={Copy} onClick={() => void abrirDialogo('copiar-quadro', { quadroId: quadro.id })}>Copiar quadro</Botao>
      <Botao tamanho="p" variante="perigo" icone={Archive} onClick={() => void arquivar()}>Arquivar</Botao>
    </div>
  )
}

function QuadroArquivado({ quadro, aoSair }: { quadro: Quadro; aoSair(slug: string | null): void }) {
  const qc = useQueryClient()
  const abrirDialogo = useAbrirDialogo()
  const completo = useQuadroCompleto(quadro.id)
  async function restaurar() {
    try {
      const r = await restaurarQuadro(qc, quadro)
      avisar(`Quadro ${r.quadro.nome} restaurado.`, { tipo: 'sucesso', descricao: 'As demandas dele voltaram junto.' })
      aoSair(r.quadro.slug)
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível restaurar o quadro.' })
    }
  }
  async function excluir() {
    const ok = await abrirDialogo('confirmar', {
      titulo: `Excluir ${quadro.nome} de vez?`, confirmar: 'Excluir quadro', perigo: true, digitar: quadro.nome,
      mensagem: 'Só dá para excluir um quadro que nunca teve demanda. Vão junto as colunas, as etiquetas, as automações e os modelos dele.',
    })
    if (!ok) return
    try {
      await excluirQuadro(qc, quadro)
      avisar(`Quadro ${quadro.nome} excluído.`, { tipo: 'sucesso' })
      aoSair(null)
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível excluir o quadro.' })
    }
  }
  return (
    <Painel titulo={<>{quadro.nome} <Pilula tom="aviso">Arquivado</Pilula></>} icone={Archive} id="cad-arquivado" acoes={(
      <>
        <Botao tamanho="p" variante="secundario" icone={Copy} onClick={() => void abrirDialogo('copiar-quadro', { quadroId: quadro.id })}>Copiar</Botao>
        <Botao tamanho="p" variante="primario" icone={ArchiveRestore} onClick={() => void restaurar()}>Restaurar</Botao>
      </>
    )}>
      <div className="cad-painel-corpo">
        <p className="cad-texto-2">Arquivado em {new Date(quadro.arquivadoEm!).toLocaleDateString('pt-BR')}. As demandas dele estão guardadas e voltam ao restaurar.</p>
        {completo.data && (
          <p className="cad-linha-meta">
            <span>{completo.data.colunas.filter((c) => !c.arquivadaEm).map((c) => c.nome).join(' · ') || 'Sem colunas'}</span>
          </p>
        )}
        <div><Botao tamanho="p" variante="perigo" icone={Trash2} onClick={() => void excluir()}>Excluir de vez</Botao></div>
      </div>
    </Painel>
  )
}

// ─────────────────────────────── tela ───────────────────────────────

export default function ConfigQuadros() {
  const eu = useEu()
  const admin = eu.usuario.papel === 'admin'
  const quadros = useQuadros()
  const equipes = useEquipes()
  const arquivados = useQuadrosArquivados()
  const abrir = useAbrirSobreposta()
  const [busca, setBusca] = useSearchParams()
  const slug = busca.get('quadro')
  const ativo = quadros.find((q) => q.slug === slug) ?? (slug ? undefined : quadros[0])
  const arquivado = !ativo && slug ? arquivados.data?.find((q) => q.slug === slug) : undefined
  const escolher = (s: string | null) => setBusca((b) => { const n = new URLSearchParams(b); if (s) n.set('quadro', s); else n.delete('quadro'); return n }, { replace: true })

  const grupos = useMemo(() => {
    const porEquipe = new Map<string, Quadro[]>()
    for (const q of quadros) porEquipe.set(q.equipeId ?? '', [...(porEquipe.get(q.equipeId ?? '') ?? []), q])
    return [...porEquipe.entries()].map(([id, lista]) => ({ id, rotulo: equipes.find((e) => e.id === id)?.nome ?? 'Sem equipe', lista, pos: equipes.find((e) => e.id === id)?.pos ?? 1e9 }))
      .sort((a, b) => a.pos - b.pos)
  }, [quadros, equipes])

  if (quadros.length === 0 && !arquivado && (arquivados.data?.length ?? 0) === 0) {
    return (
      <div className="cad-secao">
        <header className="cad-cabecalho"><div className="cad-cabecalho-texto"><h2 className="cad-titulo">Quadros</h2></div></header>
        <EstadoVazio icone={LayoutGrid} titulo="Nenhum quadro ainda."
          texto={admin ? 'Crie um quadro por equipe, com as colunas sugeridas e uma coluna por pessoa.' : 'Peça ao admin para criar os quadros.'}
          acoes={admin ? <Botao variante="primario" icone={LayoutGrid} onClick={() => abrir('/quadros/novo?equipes=1')}>Criar os quadros das equipes</Botao> : undefined} />
      </div>
    )
  }

  return (
    <div className="cad-secao">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h2 className="cad-titulo">Quadros</h2>
          <p className="cad-subtitulo">Colunas e etiquetas são de todos; nome, endereço, equipe e arquivar ficam com o admin.</p>
        </div>
        {admin && <Botao variante="secundario" icone={Plus} onClick={() => abrir('/quadros/novo')}>Novo quadro</Botao>}
      </header>
      <div className="cad-quadros-escolha">
        <label className="ui-rotulo" htmlFor="cad-escolha-quadro">Quadro</label>
        <div className="ui-entrada" data-tamanho="m">
          <select id="cad-escolha-quadro" value={arquivado?.slug ?? ativo?.slug ?? ''} onChange={(e) => escolher(e.target.value || null)}>
            {grupos.map((g) => (
              <optgroup key={g.id || 'sem'} label={g.rotulo}>
                {g.lista.map((q) => <option key={q.id} value={q.slug}>{q.nome}</option>)}
              </optgroup>
            ))}
            {(arquivados.data ?? []).length > 0 && (
              <optgroup label="Arquivados">
                {arquivados.data!.map((q) => <option key={q.id} value={q.slug}>{q.nome} (arquivado)</option>)}
              </optgroup>
            )}
            {!ativo && !arquivado && <option value="">Escolha um quadro</option>}
          </select>
          <ChevronDown className="ui-selecao-seta" aria-hidden="true" />
        </div>
        <span className="cad-nota">
          {quadros.length === 1 ? '1 quadro ativo' : `${quadros.length} quadros ativos`}
          {' · '}
          {arquivados.isPending ? '…' : (arquivados.data ?? []).length === 0 ? 'Nenhum quadro arquivado.' : (arquivados.data ?? []).length === 1 ? '1 arquivado' : `${arquivados.data!.length} arquivados`}
        </span>
      </div>
      <div className="cad-quadros">
        <div className="cad-secao">
          {arquivado ? (
            <QuadroArquivado key={arquivado.id} quadro={arquivado} aoSair={escolher} />
          ) : ativo ? (
            <>
              <Painel id="cad-q-dados" titulo={<span className="inline-flex items-center gap-2"><span className="cad-ponto" data-cor={ativo.cor} data-tamanho="g" aria-hidden="true" />{ativo.nome}</span>}
                acoes={admin ? <AcoesQuadro quadro={ativo} aoArquivar={() => escolher(null)} /> : (
                  <Link {...propsBotao({ tamanho: 'p' })} to={`/q/${encodeURIComponent(ativo.slug)}`}><ExternalLink aria-hidden="true" /><span>Abrir quadro</span></Link>
                )}>
                <div className="cad-painel-corpo">
                  {admin ? <PainelDados key={`${ativo.id}:${ativo.nome}:${ativo.slug}:${ativo.cor}:${ativo.fundo}:${ativo.equipeId}:${ativo.colunaPorMembro}`} quadro={ativo} /> : (
                    <p className="cad-texto-2">{ativo.descricao || 'Sem descrição.'} {equipes.find((e) => e.id === ativo.equipeId)?.nome ? `Equipe ${equipes.find((e) => e.id === ativo.equipeId)!.nome}.` : ''}</p>
                  )}
                </div>
              </Painel>
              <Painel id="cad-q-colunas" titulo="Colunas" icone={LayoutGrid}>
                <div className="cad-painel-corpo"><PainelColunas quadro={ativo} /></div>
              </Painel>
              <Painel id="cad-q-etiquetas" titulo="Etiquetas" icone={Tag}>
                <div className="cad-painel-corpo"><PainelEtiquetas quadro={ativo} /></div>
              </Painel>
              <Painel id="cad-q-automacoes" titulo="Automações" icone={Zap}>
                <div className="cad-painel-corpo"><PainelAutomacoes quadro={ativo} /></div>
              </Painel>
            </>
          ) : (
            <EstadoVazio icone={LayoutGrid} titulo="Quadro não encontrado." texto="Ele pode ter mudado de endereço ou sido excluído."
              acoes={<Botao variante="secundario" onClick={() => escolher(null)}>Ver os quadros</Botao>} />
          )}
        </div>
      </div>
    </div>
  )
}
