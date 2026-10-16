/**
 * Diálogo `nova-demanda` (PLANO §3, F4): Shift+N, o botão laranja da barra, o "+" do celular e a paleta.
 *
 * O caminho mais curto é Shift+N → Ctrl+V → Ctrl+Enter: colar uma conversa do WhatsApp (em qualquer lugar do
 * diálogo, até no título) lê a conversa no servidor e preenche o cliente, o modelo, o título e o briefing (o pedido
 * do cliente vai, escapado, para o fim da descrição; o texto original fica em `origemTexto`). Quadro e coluna partem
 * do quadro aberto e da coluna de entrada. O modelo preenche o que a pessoa ainda não mexeu (descrição, prazo em dias
 * úteis, prioridade, estimativa) e o cliente sugere o responsável dele na equipe do quadro como membro.
 * Ctrl+Enter cria; Ctrl+Shift+Enter cria e abre. "Criar cliente XYZ" abre o diálogo `criar-cliente` (F5).
 */
import './nova-demanda.css'
import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { AlertTriangle, ClipboardPaste, Loader2, MessageSquareText, Plus, X } from 'lucide-react'
import {
  PRIORIDADES, REPETICOES, ROTULO_PRIORIDADE, ROTULO_REPETICAO, type AnaliseTexto, type ClienteResumo, type Id, type Prioridade,
  type Repeticao,
} from '@shared/tipos/index.ts'
import { dataLocalDe, hojeSP, horaLocalDe } from '@shared/logica/datas.ts'
import { lerConversa, prazoDaConversa, trechoDaConversa } from '@shared/logica/colar-whatsapp.ts'
import { normalizarAlias } from '@shared/logica/texto.ts'
import { useBootstrap } from '../../api/bootstrap.ts'
import { mensagemDeErro } from '../../api/cliente.ts'
import { useCriarDemanda } from '../../api/demandas.ts'
import { useListaFeriados } from '../../api/seletores.ts'
import { MolduraDialogo, useContextoAcao } from '../../dialogos/index.ts'
import type { PropsDialogo } from '../../extensoes/tipos.ts'
import { gravarLocal, lerLocal } from '../../lib/armazenamento.ts'
import { focoNaCarga } from '../../lib/foco.ts'
import { formatarData } from '../../lib/datas.ts'
import { EH_MAC } from '../../lib/teclas.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { AreaTexto, Campo, GrupoCampo, Selecao } from '../../ui/Campo.tsx'
import { Combobox, normalizarBusca } from '../../ui/Combobox.tsx'
import { EditorMarkdown } from '../../ui/EditorMarkdown.tsx'
import { Kbd } from '../../ui/Kbd.tsx'
import { SeletorData } from '../../ui/SeletorData.tsx'
import { analisarTexto } from './api.ts'
import { GradeModelos, Segmentos, SeletorEtiquetas, SeletorPessoas } from './componentes.tsx'
import {
  colunaInicial, descricaoAutomatica, entradaDaNovaDemanda, membroSugerido, minutosDeTexto, modelosDoQuadro, motivoParaNaoCriar,
  prazoSugerido, quadroInicial, textoDeMinutos, type EstadoNovaDemanda,
} from './formulario.ts'

const CHAVE_ULTIMO_QUADRO = 'entrada-ultimo-quadro'
const SIGLA = /^[A-Za-z0-9]{1,12}$/

type Mexido = 'titulo' | 'cliente' | 'modelo' | 'membros' | 'prazo' | 'prioridade' | 'estimativa'

interface Colagem {
  texto: string
  autor: string | null
  recebidoEm: string | null
  mensagens: number
}

interface Estado extends EstadoNovaDemanda {
  mexidos: ReadonlySet<Mexido>
  /** A última descrição escrita sozinha: enquanto a descrição for igual a ela, a pessoa não mexeu. */
  descricaoAuto: string
  trecho: string
  colagem: Colagem | null
  siglaNova: string | null
  senhaNoTexto: boolean
  /** "para sexta" na conversa: vence o prazo do modelo (enquanto a pessoa não mexe). */
  prazoConversa: { data: string; casou: string } | null
  modeloSugerido: Id | null
  membroSugeridoId: Id | null
  estimativaTexto: string
  /**
   * Sobe quando a descrição é trocada sozinha (modelo, colagem): o editor monta de novo com o texto novo. Trocar o
   * valor por fora deixava o "placeholder" do editor por cima do texto (docs/pedidos/entrada.md).
   */
  versaoDescricao: number
}

/** Texto que parece conversa do WhatsApp (cabeçalho) ou que tem várias linhas: vai para o Colar. */
function pareceConversa(texto: string): boolean {
  return /^\s*\[?\d{1,2}[:/]\d{1,2}/m.test(texto) && /:\s/.test(texto) || texto.trim().split(/\n/).length >= 3
}

const ehCampoDeTexto = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text'))

export default function NovaDemanda({ params, fechar }: PropsDialogo<'nova-demanda'>) {
  const ctx = useContextoAcao()
  const b = useBootstrap().data!
  const criar = useCriarDemanda()
  const feriadosLista = useListaFeriados()
  const feriados = useMemo(() => new Set(feriadosLista.map((f) => f.data)), [feriadosLista])
  const hoje = hojeSP()
  const eu = ctx.eu
  const podeAm = eu.usuario.papel === 'admin' || eu.usuario.papel === 'atendimento'

  const ativos = useMemo(() => new Set(b.usuarios.filter((u) => u.ativo).map((u) => u.id)), [b.usuarios])
  const modeloPorId = useMemo(() => new Map(b.modelosDemanda.map((m) => [m.id, m])), [b.modelosDemanda])
  const clientePorId = useMemo(() => new Map(b.clientes.map((c) => [c.id, c])), [b.clientes])

  /** Recalcula o que a pessoa não mexeu: descrição, prazo, prioridade, estimativa e o membro sugerido. */
  function recalcular(e: Estado): Estado {
    const modelo = e.modeloId ? modeloPorId.get(e.modeloId) ?? null : null
    const quadro = b.quadros.find((q) => q.id === e.quadroId) ?? null
    const cliente = e.clienteId ? clientePorId.get(e.clienteId) ?? clienteExtra.current ?? null : null
    const auto = descricaoAutomatica(modelo, e.trecho)
    const x: Estado = { ...e, descricaoAuto: auto }
    if (e.descricaoMd === e.descricaoAuto && e.descricaoMd !== auto) { x.descricaoMd = auto; x.versaoDescricao = e.versaoDescricao + 1 }
    if (!e.mexidos.has('prazo')) { x.prazo = e.prazoConversa?.data ?? prazoSugerido(modelo, hoje, feriados); x.prazoHora = null }
    if (!e.mexidos.has('prioridade')) x.prioridade = modelo?.prioridade ?? 'media'
    if (!e.mexidos.has('estimativa')) { x.estimativaMin = modelo?.estimativaMin ?? null; x.estimativaTexto = textoDeMinutos(x.estimativaMin) }
    const sugerido = membroSugerido(cliente, quadro, ativos)
    if (!e.mexidos.has('membros')) x.membroIds = sugerido ? [sugerido] : []
    x.membroSugeridoId = sugerido
    return x
  }

  const clienteExtra = useRef<ClienteResumo | null>(null)
  const [estado, setEstado] = useState<Estado>(() => {
    const quadro = quadroInicial(b.quadros, {
      pedido: params.quadroId, aberto: ctx.quadroAtual?.id, ultimo: lerLocal<string | null>(CHAVE_ULTIMO_QUADRO, null), favoritos: eu.favoritos,
    })
    const coluna = quadro ? colunaInicial(b.colunas, quadro.id, params.colunaId) : null
    const modelo = params.modeloId && modelosDoQuadro(b.modelosDemanda, quadro?.id ?? null).some((m) => m.id === params.modeloId) ? params.modeloId : null
    const base: Estado = {
      quadroId: quadro?.id ?? '', colunaId: coluna?.id ?? '', titulo: '', modeloId: modelo, clienteId: params.clienteId ?? null,
      membroIds: [], etiquetaIds: null, descricaoMd: '', prioridade: 'media', inicio: null, prazo: null, prazoHora: null,
      publicacaoData: null, publicacaoHora: null, estimativaMin: null, repetir: 'nenhuma', origemTexto: null,
      mexidos: new Set(), descricaoAuto: '', trecho: '', colagem: null, siglaNova: null, senhaNoTexto: false,
      modeloSugerido: null, membroSugeridoId: null, estimativaTexto: '', versaoDescricao: 0, prazoConversa: null,
    }
    return recalcular(base)
  })
  const mudar = (fn: (e: Estado) => Estado) => setEstado((e) => recalcular(fn(e)))
  const mexer = (e: Estado, ...campos: Mexido[]): ReadonlySet<Mexido> => new Set([...e.mexidos, ...campos])

  const quadro = b.quadros.find((q) => q.id === estado.quadroId) ?? null
  const colunas = useMemo(() => b.colunas.filter((c) => c.quadroId === estado.quadroId && c.arquivadaEm === null).sort((x, y) => x.pos - y.pos),
    [b.colunas, estado.quadroId])
  const coluna = colunas.find((c) => c.id === estado.colunaId) ?? null
  const etiquetas = useMemo(() => b.etiquetas.filter((e) => e.quadroId === estado.quadroId).sort((x, y) => x.pos - y.pos),
    [b.etiquetas, estado.quadroId])
  const modelos = useMemo(() => modelosDoQuadro(b.modelosDemanda, estado.quadroId || null), [b.modelosDemanda, estado.quadroId])
  const modelo = estado.modeloId ? modeloPorId.get(estado.modeloId) ?? null : null
  const cliente = estado.clienteId ? clientePorId.get(estado.clienteId) ?? (clienteExtra.current?.id === estado.clienteId ? clienteExtra.current : null) : null
  const clientes = useMemo(() => [...b.clientes].sort((x, y) => (x.status === 'ex' ? 1 : 0) - (y.status === 'ex' ? 1 : 0) || x.sigla.localeCompare(y.sigla)), [b.clientes])
  const atendimentos = b.usuarios.filter((u) => u.ativo && (u.papel === 'atendimento' || u.papel === 'admin'))

  // etiquetas: sem mexer, as do modelo (as que o quadro tem por nome, e as novas que nascem com a demanda)
  const daEtiquetaModelo = useMemo(() => {
    const nomes = new Map((modelo?.etiquetas ?? []).map((e) => [normalizarAlias(e.nome), e]))
    const existentes = etiquetas.filter((e) => e.nome && nomes.has(normalizarAlias(e.nome)))
    const novas = [...nomes.entries()].filter(([n]) => !existentes.some((e) => normalizarAlias(e.nome) === n)).map(([, e]) => e)
    return { ids: existentes.map((e) => e.id), novas }
  }, [modelo, etiquetas])
  const etiquetasVisiveis = estado.etiquetaIds ?? daEtiquetaModelo.ids

  // ─────────────── Colar do WhatsApp ───────────────

  const [lendo, setLendo] = useState(false)
  const [textoColar, setTextoColar] = useState(params.textoColado ?? '')
  const pedidoColar = useRef<AbortController | null>(null)

  async function colar(texto: string) {
    const t = texto.trim()
    if (!t) return
    pedidoColar.current?.abort()
    const controle = new AbortController()
    pedidoColar.current = controle
    setLendo(true)
    let analise: AnaliseTexto
    try {
      analise = await analisarTexto(t, controle.signal)
    } catch (erro) {
      if (!(erro instanceof DOMException && erro.name === 'AbortError')) {
        avisar('Não foi possível ler a conversa.', { tipo: 'erro', descricao: mensagemDeErro(erro) })
      }
      setLendo(false)
      return
    }
    if (controle.signal.aborted) return
    setLendo(false)
    setTextoColar('')
    const msgs = lerConversa(t, hoje)
    mudar((e) => {
      const validos = new Set(modelosDoQuadro(b.modelosDemanda, e.quadroId || null).map((m) => m.id))
      const sugModelo = analise.modelos.find((m) => validos.has(m.id) && m.confianca >= 0.6)?.id ?? null
      const sugCliente = analise.clientes.find((c) => c.confianca >= 0.5 && clientePorId.has(c.id))?.id ?? null
      return {
        ...e,
        origemTexto: t,
        trecho: trechoDaConversa(msgs),
        colagem: { texto: t, autor: analise.autor, recebidoEm: analise.recebidoEm, mensagens: msgs.length },
        titulo: e.mexidos.has('titulo') && e.titulo.trim() ? e.titulo : analise.tituloSugerido,
        clienteId: e.mexidos.has('cliente') ? e.clienteId : (sugCliente ?? e.clienteId),
        modeloId: e.mexidos.has('modelo') ? e.modeloId : (sugModelo ?? e.modeloId),
        modeloSugerido: sugModelo,
        siglaNova: sugCliente || (e.mexidos.has('cliente') && e.clienteId) ? null : analise.siglaNova,
        senhaNoTexto: analise.senhaDetectada,
        prazoConversa: prazoDaConversa(msgs, hoje),
      }
    })
    // o foco segue no diálogo (Ctrl+Enter cria); no toque, sem abrir o teclado
    requestAnimationFrame(() => {
      if (focoNaCarga() && tituloRef.current) { tituloRef.current.focus(); tituloRef.current.setSelectionRange(0, 0) }
      else resumoRef.current?.focus()
    })
  }

  function tirarColagem() {
    mudar((e) => ({ ...e, origemTexto: null, trecho: '', colagem: null, siglaNova: null, senhaNoTexto: false, modeloSugerido: null, prazoConversa: null }))
  }

  async function colarDaAreaDeTransferencia() {
    try {
      const t = await navigator.clipboard.readText()
      if (t.trim()) void colar(t)
      else avisar('A área de transferência está vazia.', { tipo: 'info' })
    } catch {
      colarRef.current?.focus()
      avisar('Cole com Ctrl+V (ou toque e segure no campo).', { tipo: 'info' })
    }
  }

  /** Colar fora dos campos de texto (foco num botão, num cartão de modelo) também lê a conversa. */
  function aoColarNoDialogo(e: ClipboardEvent<HTMLElement>) {
    if (ehCampoDeTexto(e.target)) return
    const t = e.clipboardData.getData('text/plain')
    if (!t.trim()) return
    e.preventDefault()
    void colar(t)
  }

  // ─────────────── cliente ───────────────

  async function criarCliente(p: { sigla?: string; nome?: string }) {
    const r = await ctx.abrirDialogo('criar-cliente', p)
    if (!r) return
    clienteExtra.current = r.cliente
    mudar((e) => ({ ...e, clienteId: r.cliente.id, siglaNova: null, mexidos: mexer(e, 'cliente') }))
  }

  const extraCliente = (termo: string) => {
    const t = termo.trim()
    const n = normalizarAlias(t)
    if (!n || b.clientes.some((c) => c.apelidos.includes(n) || normalizarAlias(c.sigla) === n || normalizarAlias(c.nome) === n)) return null
    if (SIGLA.test(t)) return { rotulo: `Criar cliente ${t.toUpperCase()}`, executar: () => void criarCliente({ sigla: t.toUpperCase() }) }
    if (t.length >= 3) return { rotulo: `Criar cliente "${t}"`, executar: () => void criarCliente({ nome: t }) }
    return null
  }

  // ─────────────── criar ───────────────

  const [tentou, setTentou] = useState(false)
  const [criando, setCriando] = useState(false)
  const motivo = motivoParaNaoCriar(estado)

  async function enviar(abrir: boolean) {
    setTentou(true)
    if (motivo || !quadro || !coluna || criando) {
      if (!estado.titulo.trim()) tituloRef.current?.focus()
      return
    }
    setCriando(true)
    const r = await criar(entradaDaNovaDemanda(estado, { podeAm, responsavelDaColuna: coluna.responsavelId }))
    setCriando(false)
    if (!r) return
    gravarLocal(CHAVE_ULTIMO_QUADRO, quadro.id)
    fechar({ demanda: r.demanda })
    const n = r.demanda.numero
    if (abrir) {
      ctx.navegar(`/d/${n}`)
    } else {
      avisar(`Demanda #${n} criada em ${quadro.nome} › ${coluna.nome}.`, { tipo: 'sucesso', acao: { rotulo: 'Abrir', executar: () => ctx.navegar(`/d/${n}`) } })
    }
    if (r.avisos.includes('limite_wip')) avisar(`A coluna ${coluna.nome} passou do limite de ${coluna.limiteWip}.`, { tipo: 'aviso' })
  }

  function aoTeclar(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Enter' && (EH_MAC ? e.metaKey : e.ctrlKey) && !e.altKey) {
      e.preventDefault()
      void enviar(e.shiftKey)
    }
  }

  // ─────────────── foco inicial ───────────────

  const tituloRef = useRef<HTMLInputElement>(null)
  const colarRef = useRef<HTMLTextAreaElement>(null)
  const resumoRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (params.textoColado?.trim()) void colar(params.textoColado)
  }, [])

  const id = useId()
  const idModelo = `${id}-modelo`
  const idEtiquetas = `${id}-etiquetas`
  const nomeMembroSugerido = estado.membroSugeridoId ? b.usuarios.find((u) => u.id === estado.membroSugeridoId) : undefined
  const equipe = quadro?.equipeId ? b.equipes.find((x) => x.id === quadro.equipeId) : undefined
  const tecla = EH_MAC ? '⌘' : 'Ctrl'

  return (
    <MolduraDialogo
      titulo="Nova demanda"
      tamanho="g"
      rodape={(
        <div className="entrada-rodape" onKeyDown={aoTeclar}>
          <span className="entrada-rodape-dica" aria-hidden="true"><Kbd teclas="mod+enter" /> cria · <Kbd teclas="mod+shift+enter" /> cria e abre</span>
          <span className="entrada-rodape-acoes">
            <Botao variante="ghost" onClick={() => fechar(null)}>Cancelar</Botao>
            <Botao variante="secundario" onClick={() => void enviar(true)} disabled={criando} aria-keyshortcuts={`${EH_MAC ? 'Meta' : 'Control'}+Shift+Enter`}>
              Criar e abrir
            </Botao>
            <Botao variante="primario" icone={Plus} onClick={() => void enviar(false)} carregando={criando} aria-keyshortcuts={`${EH_MAC ? 'Meta' : 'Control'}+Enter`}>
              Criar
            </Botao>
          </span>
        </div>
      )}
    >
      <div className="entrada-nova" onKeyDown={aoTeclar} onPaste={aoColarNoDialogo}>
        {/* ─── Colar do WhatsApp ─── */}
        <section className="entrada-colar" aria-labelledby={`${id}-colar`} data-estado={estado.colagem ? 'lido' : lendo ? 'lendo' : 'vazio'}>
          <h3 id={`${id}-colar`} className="entrada-colar-titulo"><MessageSquareText aria-hidden="true" /> Colar do WhatsApp</h3>
          {estado.colagem ? (
            <div ref={resumoRef} className="entrada-colar-resumo" role="status" tabIndex={-1}>
              <p>
                Conversa{estado.colagem.autor ? <> de <strong>{estado.colagem.autor}</strong></> : null}
                {estado.colagem.recebidoEm ? ` · ${formatarRecebido(estado.colagem.recebidoEm)}` : ''}
                {` · ${estado.colagem.mensagens} ${estado.colagem.mensagens === 1 ? 'mensagem' : 'mensagens'}`}
                . Preenchemos o que deu; confira antes de criar.
              </p>
              <Botao variante="ghost" tamanho="p" icone={X} onClick={tirarColagem}>Tirar a conversa</Botao>
            </div>
          ) : (
            <div className="entrada-colar-campo">
              <AreaTexto
                ref={colarRef}
                rotulo="Conversa do WhatsApp"
                rotuloOculto
                linhas={2}
                value={textoColar}
                placeholder={`Cole aqui (${tecla}+V) a conversa: cliente, modelo, título e briefing vêm preenchidos.`}
                onChange={(e) => setTextoColar(e.target.value)}
                onPaste={(e) => {
                  const t = e.clipboardData.getData('text/plain')
                  if (!t.trim()) return
                  e.preventDefault()
                  void colar(t)
                }}
                disabled={lendo}
                {...(params.focoColar ? { 'data-autofocus': '' } : {})}
              />
              <div className="entrada-colar-botoes">
                {lendo ? (
                  <span className="entrada-lendo" role="status"><Loader2 className="ui-giro" aria-hidden="true" /> Lendo a conversa…</span>
                ) : textoColar.trim() ? (
                  <Botao variante="secundario" tamanho="p" onClick={() => void colar(textoColar)}>Preencher com a conversa</Botao>
                ) : (
                  <Botao variante="ghost" tamanho="p" icone={ClipboardPaste} onClick={() => void colarDaAreaDeTransferencia()}>Colar</Botao>
                )}
              </div>
            </div>
          )}
          {estado.senhaNoTexto && (
            <p className="entrada-alerta" role="alert">
              <AlertTriangle aria-hidden="true" /> Parece que a conversa traz uma senha. Guarde no cofre (Acessos do cliente) e apague daqui.
            </p>
          )}
        </section>

        {!b.quadros.some((q) => q.arquivadoEm === null) && (
          <p className="entrada-alerta" role="alert">
            <AlertTriangle aria-hidden="true" />
            {eu.usuario.papel === 'admin' ? 'Nenhum quadro ainda. Crie os quadros das equipes antes (Primeiros passos).' : 'Nenhum quadro ainda. Peça ao admin para criar os quadros.'}
          </p>
        )}
        <div className="entrada-colunas">
          {/* ─── principal ─── */}
          <div className="entrada-principal">
            <Campo
              ref={tituloRef}
              rotulo="Título"
              value={estado.titulo}
              maxLength={500}
              autoComplete="off"
              placeholder="Ex.: Carrossel do Dia do Médico"
              erro={tentou && !estado.titulo.trim() ? 'Escreva um título.' : undefined}
              onChange={(e) => { const v = e.target.value; setEstado((x) => ({ ...x, titulo: v, mexidos: mexer(x, 'titulo') })) }}
              onPaste={(e) => {
                const t = e.clipboardData.getData('text/plain')
                if (!pareceConversa(t)) return
                e.preventDefault()
                void colar(t)
              }}
              className="entrada-titulo"
              {...(params.focoColar ? {} : { 'data-autofocus': '' })}
            />

            <GrupoCampo rotulo="Cliente" opcional>
              {(aria) => (
                <Combobox<ClienteResumo>
                  {...aria}
                  opcoes={clientes}
                  valor={cliente}
                  aoMudar={(c) => mudar((e) => ({ ...e, clienteId: c?.id ?? null, siglaNova: null, mexidos: mexer(e, 'cliente') }))}
                  idDe={(c) => c.id}
                  rotuloDe={(c) => c.sigla}
                  detalheDe={(c) => c.nome}
                  iconeDe={(c) => <span className="entrada-ponto" data-cor={c.cor} aria-hidden="true" />}
                  filtrar={(c, t) => normalizarBusca(`${c.sigla} ${c.nome} ${c.apelidos.join(' ')}`).includes(t)}
                  placeholder="Sigla, nome ou apelido"
                  vazio="Nenhum cliente com esse nome."
                  extra={extraCliente}
                  permitirLimpar
                />
              )}
            </GrupoCampo>
            {estado.siglaNova && !estado.clienteId && (
              <p className="entrada-sigla-nova">
                <span><strong>{estado.siglaNova}</strong> não está cadastrado.</span>
                <Botao variante="secundario" tamanho="p" icone={Plus} onClick={() => void criarCliente({ sigla: estado.siglaNova! })}>
                  Criar cliente {estado.siglaNova}
                </Botao>
              </p>
            )}

            <div className="ui-campo-grupo">
              <span id={idModelo} className="ui-rotulo">Modelo <span className="ui-rotulo-opcional">(opcional)</span></span>
              <GradeModelos idRotulo={idModelo} modelos={modelos} valor={estado.modeloId} sugerido={estado.modeloSugerido}
                aoMudar={(m) => mudar((e) => ({ ...e, modeloId: m, mexidos: mexer(e, 'modelo') }))} />
            </div>

            <div className="ui-campo-grupo">
              <span className="ui-rotulo">Descrição</span>
              <EditorMarkdown
                key={estado.versaoDescricao}
                rotulo="Descrição"
                valor={estado.descricaoMd}
                aoMudar={(md) => setEstado((e) => ({ ...e, descricaoMd: md }))}
                aoSalvar={() => void enviar(false)}
                placeholder={modelo ? 'O briefing do modelo aparece aqui.' : 'O que precisa ser feito, para quando e as referências.'}
                buscarPessoas={(t) => {
                  const n = normalizarBusca(t)
                  return b.usuarios.filter((u) => u.ativo && normalizarBusca(`${u.nome} ${u.apelido ?? ''}`).includes(n)).slice(0, 8)
                }}
                minLinhas={6}
                className="entrada-descricao"
              />
            </div>
          </div>

          {/* ─── lateral ─── */}
          <div className="entrada-lateral">
            <div className="entrada-lugar">
              <Selecao
                rotulo="Quadro"
                tamanho="p"
                value={estado.quadroId}
                opcoes={[...b.quadros].filter((q) => q.arquivadoEm === null).sort(ordemQuadros(eu.favoritos)).map((q) => ({ valor: q.id, rotulo: q.nome }))}
                onChange={(e) => {
                  const novo = e.target.value
                  mudar((x) => {
                    const col = colunaInicial(b.colunas, novo, null)
                    const modeloVale = x.modeloId ? modelosDoQuadro(b.modelosDemanda, novo).some((m) => m.id === x.modeloId) : true
                    return { ...x, quadroId: novo, colunaId: col?.id ?? '', etiquetaIds: null, modeloId: modeloVale ? x.modeloId : null }
                  })
                }}
              />
              <Selecao
                rotulo="Coluna"
                tamanho="p"
                value={estado.colunaId}
                opcoes={colunas.map((c) => ({ valor: c.id, rotulo: c.nome }))}
                vazia={colunas.length === 0 ? 'Sem colunas' : undefined}
                disabled={colunas.length === 0}
                erro={estado.quadroId && colunas.length === 0 ? 'Este quadro ainda não tem colunas.' : undefined}
                onChange={(e) => { const v = e.target.value; setEstado((x) => ({ ...x, colunaId: v })) }}
              />
            </div>

            <GrupoCampo rotulo="Pessoas" ajuda={nomeMembroSugerido && cliente && estado.membroIds.includes(nomeMembroSugerido.id)
              ? `${nomeMembroSugerido.apelido ?? nomeMembroSugerido.nome} é o responsável do ${cliente.sigla}${equipe ? ` na ${equipe.nome}` : ''}.` : undefined}>
              {(aria) => (
                <SeletorPessoas id={aria.id} aria-describedby={aria['aria-describedby']} pessoas={b.usuarios}
                  valor={estado.membroIds} fixa={coluna?.responsavelId ?? null}
                  aoMudar={(ids) => setEstado((e) => ({ ...e, membroIds: ids, mexidos: mexer(e, 'membros') }))} />
              )}
            </GrupoCampo>

            <div className="ui-campo-grupo">
              <span id={idEtiquetas} className="ui-rotulo">Etiquetas</span>
              <SeletorEtiquetas idRotulo={idEtiquetas} etiquetas={etiquetas} valor={etiquetasVisiveis}
                novas={estado.etiquetaIds === null ? daEtiquetaModelo.novas : []}
                aoMudar={(ids) => setEstado((e) => ({ ...e, etiquetaIds: ids }))} />
            </div>

            <div className="ui-campo-grupo">
              <span id={`${id}-prioridade`} className="ui-rotulo">Prioridade</span>
              <Segmentos<Prioridade>
                rotulo="Prioridade"
                opcoes={PRIORIDADES.map((p) => ({ valor: p, rotulo: ROTULO_PRIORIDADE[p] }))}
                valor={estado.prioridade}
                aoMudar={(p) => setEstado((e) => ({ ...e, prioridade: p, mexidos: mexer(e, 'prioridade') }))}
              />
            </div>

            <div className="entrada-datas">
              <div className="ui-campo-grupo">
                <span className="ui-rotulo">Prazo</span>
                <SeletorData rotulo="Prazo" valor={estado.prazo} hora={estado.prazoHora} comHora feriados={feriadosLista}
                  aoMudar={(d, h) => setEstado((e) => ({ ...e, prazo: d, prazoHora: d ? h : null, repetir: d ? e.repetir : 'nenhuma', mexidos: mexer(e, 'prazo') }))} />
                {!estado.mexidos.has('prazo') && estado.prazo && (estado.prazoConversa ? (
                  <p className="ui-campo-ajuda">Pela conversa: "{estado.prazoConversa.casou}".</p>
                ) : modelo?.prazoDiasUteis != null && (
                  <p className="ui-campo-ajuda">{modelo.prazoDiasUteis} {modelo.prazoDiasUteis === 1 ? 'dia útil' : 'dias úteis'}, pelo modelo.</p>
                ))}
              </div>
              <div className="ui-campo-grupo">
                <span className="ui-rotulo">Início</span>
                <SeletorData rotulo="Início" valor={estado.inicio} feriados={feriadosLista}
                  aoMudar={(d) => setEstado((e) => ({ ...e, inicio: d }))} />
              </div>
              <div className="ui-campo-grupo">
                <span className="ui-rotulo">Publicação</span>
                <SeletorData rotulo="Publicação" valor={estado.publicacaoData} hora={estado.publicacaoHora} comHora feriados={feriadosLista}
                  aoMudar={(d, h) => setEstado((e) => ({ ...e, publicacaoData: d, publicacaoHora: d ? h : null }))} />
              </div>
            </div>
            {tentou && estado.inicio && estado.prazo && estado.inicio > estado.prazo && (
              <p className="ui-campo-erro" role="alert">O início vem depois do prazo.</p>
            )}

            <div className="entrada-lugar">
              <Campo
                rotulo="Estimativa"
                tamanho="p"
                value={estado.estimativaTexto}
                placeholder="1h30"
                inputMode="text"
                autoComplete="off"
                erro={minutosDeTexto(estado.estimativaTexto) === undefined ? 'Use 45 min, 2h ou 1h30.' : undefined}
                onChange={(e) => {
                  const v = e.target.value
                  const min = minutosDeTexto(v)
                  setEstado((x) => ({ ...x, estimativaTexto: v, estimativaMin: min === undefined ? x.estimativaMin : min, mexidos: mexer(x, 'estimativa') }))
                }}
              />
              <Selecao
                rotulo="Repetir"
                tamanho="p"
                value={estado.repetir}
                disabled={!estado.prazo}
                ajuda={estado.prazo ? undefined : 'Precisa de prazo.'}
                opcoes={REPETICOES.map((r) => ({ valor: r, rotulo: ROTULO_REPETICAO[r] }))}
                onChange={(e) => { const v = e.target.value as Repeticao; setEstado((x) => ({ ...x, repetir: v })) }}
              />
            </div>

            {podeAm && (
              <Selecao
                rotulo="Atendimento (AM)"
                tamanho="p"
                value={estado.atendimentoId === undefined ? '' : estado.atendimentoId ?? 'nenhum'}
                opcoes={[
                  { valor: '', rotulo: cliente?.atendimentoId
                    ? `O do cliente (${b.usuarios.find((u) => u.id === cliente.atendimentoId)?.apelido ?? 'AM'})`
                    : eu.usuario.papel === 'atendimento' ? 'Eu' : 'O do cliente' },
                  { valor: 'nenhum', rotulo: 'Sem AM' },
                  ...atendimentos.map((u) => ({ valor: u.id, rotulo: u.apelido ? `${u.apelido} (${u.nome})` : u.nome })),
                ]}
                onChange={(e) => {
                  const v = e.target.value
                  setEstado((x) => ({ ...x, atendimentoId: v === '' ? undefined : v === 'nenhum' ? null : v }))
                }}
              />
            )}
          </div>
        </div>

        {tentou && motivo && estado.titulo.trim() && <p className="entrada-motivo" role="alert">{motivo}</p>}
      </div>
    </MolduraDialogo>
  )
}

/** Favoritos primeiro (na ordem da estrela), depois os outros na ordem do menu. */
function ordemQuadros(favoritos: readonly Id[]) {
  return (a: { id: Id; pos: number }, c: { id: Id; pos: number }) => {
    const fa = favoritos.indexOf(a.id), fc = favoritos.indexOf(c.id)
    return (fa < 0 ? 1e9 : fa) - (fc < 0 ? 1e9 : fc) || a.pos - c.pos
  }
}

function formatarRecebido(instante: string): string {
  return formatarData(dataLocalDe(instante), horaLocalDe(instante))
}
