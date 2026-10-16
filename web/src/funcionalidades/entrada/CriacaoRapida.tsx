/**
 * Criação rápida no rodapé da coluna (entradaColuna(); "+ Adicionar demanda" e a tecla N do núcleo). Mais rápido que o
 * Trello: Enter cria e o campo fica aberto e limpo para a próxima (três Enter seguidos, três demandas, na ordem);
 * `HE: ` vira o chip do cliente e `@rafa ` o da pessoa, com a prévia ao vivo ("HE · Rafa · Fila", a mesma análise do
 * servidor); `@` abre a lista das pessoas; Tab completa o cliente que está sendo digitado no começo; Backspace no
 * começo desfaz o último chip (volta a ser texto); colar várias linhas oferece uma demanda por linha. Sigla que não
 * existe oferece "Criar cliente XYZ" (diálogo `criar-cliente`, F5). Um filtro de um só cliente no quadro vira o
 * cliente de partida; na coluna de uma pessoa, ela aparece como membro.
 */
import './rapida.css'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { CornerDownLeft, Plus, UserRound, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { Id } from '@shared/tipos/index.ts'
import { analisarRapida, chaveDeMencao, nomeCurto } from '@shared/logica/rapida.ts'
import { normalizarAlias } from '@shared/logica/texto.ts'
import { mensagemDeErro } from '../../api/cliente.ts'
import { useClientes, useUsuarios } from '../../api/seletores.ts'
import { useContextoAcao } from '../../dialogos/index.ts'
import type { ContextoColuna } from '../../extensoes/tipos.ts'
import { raizCamadas } from '../../lib/camadas.ts'
import { usePosicao } from '../../lib/posicao.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Avatar } from '../../ui/Avatar.tsx'
import { Botao, BotaoIcone } from '../../ui/Botao.tsx'
import { Kbd } from '../../ui/Kbd.tsx'
import { criarRapida, useContextoRapida } from './api.ts'
import {
  clientesEmAndamento, comporLinha, linhasColadas, marcadorDaPessoa, marcadorDoCliente, mencaoEmAndamento,
  reconhecerAoDigitarEspaco, type ChipRapida,
} from './rapida-chips.ts'

const MAX_LINHAS = 30

export default function CriacaoRapida({ ctx, fechar }: { ctx: ContextoColuna; fechar(): void }) {
  const qc = useQueryClient()
  const acao = useContextoAcao()
  const contexto = useContextoRapida()
  const clientes = useClientes()
  const usuarios = useUsuarios()
  const [texto, setTexto] = useState('')
  const [chips, setChips] = useState<ChipRapida[]>([])
  const [cursor, setCursor] = useState(0)
  const [ativa, setAtiva] = useState(0)
  const [semLista, setSemLista] = useState(false)
  const [linhas, setLinhas] = useState<string[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const raiz = useRef<HTMLFormElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const fila = useRef<Promise<unknown>>(Promise.resolve())
  const cursorDepois = useRef<number | null>(null)
  const id = useId()

  // cliente de um filtro de um só cliente (pode ser tirado)
  const doFiltro = ctx.filtros.clientes?.length === 1 ? ctx.filtros.clientes[0]! : null
  const [usarFiltro, setUsarFiltro] = useState(true)
  const clienteContexto = doFiltro && usarFiltro ? doFiltro : null
  const temChipCliente = chips.some((c) => c.tipo === 'cliente')

  const linha = comporLinha(chips, texto)
  const analise = useMemo(() => analisarRapida(linha, contexto, { clienteIdContexto: clienteContexto, coluna: ctx.coluna }),
    [linha, contexto, clienteContexto, ctx.coluna])

  // ─────────────── sugestões ───────────────

  const mencao = mencaoEmAndamento(texto, cursor)
  const pessoas = useMemo(() => {
    if (!mencao) return []
    const n = normalizarAlias(mencao.termo)
    return usuarios
      .filter((u) => u.ativo && !chips.some((c) => c.id === u.id) && marcadorDaPessoa(contexto, u.id))
      .filter((u) => !n || normalizarAlias(`${u.apelido ?? ''} ${u.nome}`).split(' ').some((p) => p.startsWith(n)))
      .slice(0, 6)
  }, [mencao?.termo, usuarios, chips, contexto])
  const clientesSug = temChipCliente || mencao ? [] : clientesEmAndamento(texto, cursor, clientes)
  const listaAberta = !semLista && !!mencao && pessoas.length > 0
  useEffect(() => { setAtiva(0) }, [mencao?.termo])
  const { estilo, medindo } = usePosicao(raiz.current, lista, listaAberta, { lado: 'baixo', alinhar: 'inicio', distancia: 4 })

  // cursor depois de trocar o texto por fora (chip reconhecido, Backspace no começo)
  useLayoutEffect(() => {
    if (cursorDepois.current === null || !campo.current) return
    campo.current.setSelectionRange(cursorDepois.current, cursorDepois.current)
    setCursor(cursorDepois.current)
    cursorDepois.current = null
  })
  // a caixa cresce com o texto (título longo quebra a linha, como no Trello)
  useLayoutEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [texto, chips.length])

  function porChip(chip: ChipRapida, novoTexto: string, novoCursor: number) {
    setChips((cs) => (cs.some((c) => c.id === chip.id) ? cs : [...cs, chip]))
    setTexto(novoTexto)
    cursorDepois.current = novoCursor
  }

  function escolherPessoa(uid: Id) {
    if (!mencao) return
    const marcador = marcadorDaPessoa(contexto, uid)
    if (!marcador) return
    const novo = texto.slice(0, mencao.inicio) + texto.slice(cursor).replace(/^\s+/, '')
    porChip({ tipo: 'membro', id: uid, marcador }, novo, mencao.inicio)
    setSemLista(false)
  }

  function completarCliente(cid: Id) {
    const marcador = marcadorDoCliente(contexto, cid)
    if (!marcador) return
    porChip({ tipo: 'cliente', id: cid, marcador }, texto.slice(cursor).replace(/^\s+/, ''), 0)
  }

  function desfazerUltimoChip() {
    const ultimo = chips[chips.length - 1]
    if (!ultimo) return
    setChips(chips.slice(0, -1))
    const sep = texto && !/^\s/.test(texto) ? ' ' : ''
    const novo = ultimo.tipo === 'cliente' ? `${ultimo.marcador}${sep}${texto}` : `${texto.trimEnd()}${texto.trim() ? ' ' : ''}${ultimo.marcador}`
    setTexto(novo)
    cursorDepois.current = ultimo.tipo === 'cliente' ? ultimo.marcador.length : novo.length
  }

  // ─────────────── criar ───────────────

  function rolarAoFim() {
    requestAnimationFrame(() => {
      const cards = raiz.current?.closest('.ui-coluna')?.querySelector<HTMLElement>('.ui-coluna-cards')
      if (cards) cards.scrollTop = cards.scrollHeight
    })
  }

  /** Uma linha = uma demanda; os pedidos vão em fila (a ordem dos Enter é a ordem das demandas na coluna). */
  function enfileirar(linhaEnviada: string, restaurar: () => void) {
    const pedido = fila.current.then(async () => {
      try {
        const r = await criarRapida(qc, { texto: linhaEnviada, colunaId: ctx.coluna.id, clienteId: clienteContexto })
        rolarAoFim()
        if (r.avisos.includes('senha_detectada')) avisar('Parece que há uma senha no título.', { tipo: 'aviso', descricao: 'Guarde senhas no cofre.' })
        if (r.avisos.includes('limite_wip')) avisar(`A coluna ${ctx.coluna.nome} passou do limite de ${ctx.coluna.limiteWip}.`, { tipo: 'aviso' })
      } catch (erro) {
        restaurar()
        avisar('Não foi possível criar a demanda.', { tipo: 'erro', descricao: mensagemDeErro(erro) })
      }
    })
    fila.current = pedido
  }

  function criar() {
    if (linhas) { criarLinhas(linhas); return }
    if (!analise.titulo) {
      setAviso(chips.length || texto.trim() ? 'Falta o título: escreva o que é a demanda.' : null)
      return
    }
    const enviada = linha
    const antes = { texto, chips }
    setTexto('')
    setChips([])
    setAviso(null)
    cursorDepois.current = 0
    enfileirar(enviada, () => {
      setTexto((t) => (t ? t : antes.texto))
      setChips((c) => (c.length ? c : antes.chips))
    })
  }

  function criarLinhas(lista: string[]) {
    setLinhas(null)
    for (const l of lista.slice(0, MAX_LINHAS)) enfileirar(comporLinha(chips, l), () => {})
    setChips([])
    setTexto('')
    campo.current?.focus()
  }

  async function criarCliente(sigla: string) {
    const r = await acao.abrirDialogo('criar-cliente', { sigla })
    campo.current?.focus()
    if (!r) return
    const marcador = `${r.cliente.sigla}:`
    // tira "XYZ:" (ou [XYZ], XYZ -) do começo do texto: o cliente vira chip
    const semMarcador = texto.replace(new RegExp(`^\\s*(\\[${sigla}\\]|${sigla}\\s*:|${sigla}\\s+[-–—])\\s*`, 'i'), '')
    setChips((cs) => [{ tipo: 'cliente', id: r.cliente.id, marcador }, ...cs.filter((c) => c.tipo !== 'cliente')])
    setTexto(semMarcador)
  }

  // ─────────────── teclado ───────────────

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget
    if (listaAberta) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAtiva((a) => (a + 1) % pessoas.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAtiva((a) => (a - 1 + pessoas.length) % pessoas.length); return }
      // "@rafa" já completo: Enter cria (o servidor casa o @); só a menção pela metade ("@ra") escolhe na lista
      const completa = !!mencao && contexto.pessoas.has(chaveDeMencao(mencao.termo))
      if (e.key === 'Tab' || (e.key === 'Enter' && !completa)) { e.preventDefault(); escolherPessoa(pessoas[ativa]!.id); return }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSemLista(true); return }
    }
    if (e.key === 'Tab' && !e.shiftKey && clientesSug.length > 0) { e.preventDefault(); completarCliente(clientesSug[0]!.id); return }
    if (e.key === 'Enter') { e.preventDefault(); if (!e.nativeEvent.isComposing) criar(); return }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (linhas) setLinhas(null)
      else fechar()
      return
    }
    if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0 && chips.length > 0) {
      e.preventDefault()
      desfazerUltimoChip()
    }
  }

  function aoMudar(novo: string, pos: number) {
    setSemLista(false)
    setAviso(null)
    if (novo.length === texto.length + 1) {
      const r = reconhecerAoDigitarEspaco(novo, pos, contexto, temChipCliente)
      if (r) { porChip(r.chip, r.texto, r.cursor); return }
    }
    setTexto(novo.replace(/\r?\n/g, ' '))
    setCursor(pos)
  }

  function aoColar(e: ClipboardEvent<HTMLTextAreaElement>) {
    const t = e.clipboardData.getData('text/plain')
    const ls = linhasColadas(t)
    if (ls.length < 2) return
    e.preventDefault()
    setLinhas(ls)
  }

  // ─────────────── fechar ao sair ───────────────

  useEffect(() => {
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (raiz.current?.contains(alvo) || lista.current?.contains(alvo)) return
      if (!texto.trim() && chips.length === 0 && !linhas) fechar()
    }
    document.addEventListener('pointerdown', fora, true)
    return () => document.removeEventListener('pointerdown', fora, true)
  }, [texto, chips.length, linhas, fechar])

  const porIdPessoa = new Map(usuarios.map((u) => [u.id, u]))
  const porIdCliente = new Map(clientes.map((c) => [c.id, c]))
  const clienteDoFiltro = doFiltro ? porIdCliente.get(doFiltro) : undefined
  const daColuna = ctx.coluna.responsavelId ? porIdPessoa.get(ctx.coluna.responsavelId) : undefined
  const idPrevia = `${id}-previa`
  const idLista = `${id}-pessoas`

  return (
    <form ref={raiz} className="rapida" onSubmit={(e) => { e.preventDefault(); criar() }} aria-label={`Nova demanda em ${ctx.coluna.nome}`}>
      <div className="rapida-caixa" onClick={() => campo.current?.focus()}>
        {(chips.length > 0 || (clienteDoFiltro && usarFiltro && !temChipCliente)) && (
          <ul className="rapida-chips" aria-label="Reconhecidos">
            {clienteDoFiltro && usarFiltro && !temChipCliente && (
              <li className="rapida-chip" data-tipo="cliente" data-cor={clienteDoFiltro.cor} title="Do filtro do quadro">
                <span className="rapida-chip-ponto" aria-hidden="true" />
                <span>{clienteDoFiltro.sigla}</span>
                <span className="rapida-chip-nota">filtro</span>
                <button type="button" className="rapida-chip-tirar" aria-label={`Sem o cliente ${clienteDoFiltro.sigla} do filtro`}
                  onClick={(e) => { e.stopPropagation(); setUsarFiltro(false); campo.current?.focus() }}>
                  <X aria-hidden="true" />
                </button>
              </li>
            )}
            {chips.map((c) => {
              const cli = c.tipo === 'cliente' ? porIdCliente.get(c.id) : undefined
              const p = c.tipo === 'membro' ? porIdPessoa.get(c.id) : undefined
              return (
                <li key={`${c.tipo}-${c.id}`} className="rapida-chip" data-tipo={c.tipo} data-cor={cli?.cor ?? undefined}>
                  {cli && <span className="rapida-chip-ponto" aria-hidden="true" />}
                  {p && <Avatar pessoa={p} tamanho={18} dica={false} />}
                  <span>{cli ? cli.sigla : p ? nomeCurto(p) : c.marcador}</span>
                  <button type="button" className="rapida-chip-tirar" aria-label={`Tirar ${cli ? `o cliente ${cli.sigla}` : p ? p.nome : c.marcador}`}
                    onClick={(e) => { e.stopPropagation(); setChips((cs) => cs.filter((x) => x !== c)); campo.current?.focus() }}>
                    <X aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <textarea
          ref={campo}
          className="rapida-texto"
          rows={1}
          value={texto}
          autoFocus
          maxLength={900}
          spellCheck
          placeholder={chips.length ? 'Título' : 'Título · HE: cliente · @pessoa'}
          aria-label={`Título da nova demanda em ${ctx.coluna.nome}`}
          aria-describedby={idPrevia}
          aria-autocomplete="list"
          aria-controls={idLista}
          aria-activedescendant={listaAberta ? `${idLista}-${ativa}` : undefined}
          onChange={(e) => aoMudar(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={aoTeclar}
          onPaste={aoColar}
        />
      </div>

      {linhas ? (
        <div className="rapida-linhas" role="group" aria-label="Várias linhas coladas">
          <p>Criar {Math.min(linhas.length, MAX_LINHAS)} demandas, uma por linha{linhas.length > MAX_LINHAS ? ` (as ${MAX_LINHAS} primeiras)` : ''}?</p>
          <div className="rapida-acoes">
            <Botao variante="secundario" tamanho="p" onClick={() => criarLinhas(linhas)}>Criar {Math.min(linhas.length, MAX_LINHAS)}</Botao>
            <Botao variante="ghost" tamanho="p" onClick={() => { setTexto(linhas.join(' ')); setLinhas(null); campo.current?.focus() }}>Juntar numa só</Botao>
          </div>
        </div>
      ) : (
        <>
          <p id={idPrevia} className="rapida-previa" aria-live="polite">
            {aviso ? <span className="rapida-aviso">{aviso}</span>
              : clientesSug.length > 0 ? <span className="rapida-tab"><Kbd teclas="tab" /> {clientesSug[0]!.sigla} · {clientesSug[0]!.nome}</span>
                : analise.titulo || chips.length ? <span className="rapida-previa-texto">{analise.previa || ctx.coluna.nome}</span>
                  : <span className="rapida-dica">Enter cria · <code>HE:</code> cliente · <code>@</code> pessoa</span>}
            {!aviso && daColuna && !analise.titulo && !chips.length && (
              <span className="rapida-dica"><UserRound aria-hidden="true" /> {nomeCurto(daColuna)} entra pela coluna</span>
            )}
          </p>
          {analise.siglaNova && !analise.clienteId && (
            <Botao variante="secundario" tamanho="p" icone={Plus} className="rapida-sigla" onClick={() => void criarCliente(analise.siglaNova!)}>
              Criar cliente {analise.siglaNova}
            </Botao>
          )}
          <div className="rapida-acoes">
            <Botao type="submit" variante="secundario" tamanho="p" icone={CornerDownLeft}>Adicionar</Botao>
            <BotaoIcone icone={X} rotulo="Fechar" atalho="esc" tamanho="p" onClick={fechar} />
          </div>
        </>
      )}

      {listaAberta && createPortal(
        <div ref={lista} id={idLista} role="listbox" aria-label="Pessoas" className="ui-popover ui-lista vidro rapida-lista"
          style={{ ...estilo, width: raiz.current?.offsetWidth }} data-medindo={medindo || undefined}>
          {pessoas.map((u, i) => (
            <div key={u.id} id={`${idLista}-${i}`} role="option" aria-selected={i === ativa} className="ui-opcao" data-ativa={i === ativa || undefined}
              onPointerDown={(e) => e.preventDefault()} onPointerMove={() => setAtiva(i)} onClick={() => escolherPessoa(u.id)}>
              <Avatar pessoa={u} tamanho={20} dica={false} />
              <span className="min-w-0 truncate">{nomeCurto(u)}</span>
              <span className="ui-opcao-detalhe truncate">{u.nome}</span>
            </div>
          ))}
        </div>,
        raizCamadas(),
      )}
    </form>
  )
}
