/**
 * Paleta Cmd/Ctrl+K e / (PLANO §2, "Paleta"; cmdk). Seções: Recentes (com a busca vazia), Ações e Ir para
 * (comandos()), e uma por fonte de fontesBusca() (Quadros, Demandas, Clientes, Pessoas), na ordem delas. Fontes locais
 * respondem do cache; as remotas (Demandas, do F4) recebem um AbortSignal a cada tecla. Enter abre ou executa;
 * Ctrl/Cmd+Enter abre o caminho em outra aba.
 */
import './paleta.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { Clock, CornerDownLeft, Loader2, Search } from 'lucide-react'
import type { Comando, ContextoAcao, FontePaleta, ResultadoPaleta } from '../extensoes/tipos.ts'
import { useContextoAcao } from '../dialogos/contexto.ts'
import { lerLocal, gravarLocal } from '../lib/armazenamento.ts'
import { useRegistro } from '../sessao/registro.ts'
import { Kbd } from '../ui/Kbd.tsx'
import { Modal } from '../ui/Modal.tsx'
import { casaTermo } from './casar.ts'
import { fecharPaleta, termoInicialPaleta, usePaletaAberta } from './estado.ts'

const MAX_RECENTES = 8
const ESPERA_MS = 110
const SECAO_COMANDO = { acoes: 'Ações', ir_para: 'Ir para' } as const

type Recente = { tipo: 'comando'; id: string } | { tipo: 'resultado'; id: string; secao: string; rotulo: string; detalhe?: string; caminho: string }

function lerRecentes(): Recente[] {
  const v = lerLocal<Recente[]>('paleta-recentes', [])
  return Array.isArray(v) ? v : []
}

function guardarRecente(r: Recente) {
  const chave = (x: Recente) => `${x.tipo}:${x.id}`
  gravarLocal('paleta-recentes', [r, ...lerRecentes().filter((x) => chave(x) !== chave(r))].slice(0, MAX_RECENTES))
}

interface Estado { carregando: boolean; itens: ResultadoPaleta[] }

function useResultados(fontes: readonly FontePaleta[], termo: string): Record<string, Estado> {
  const [estado, setEstado] = useState<Record<string, Estado>>({})
  useEffect(() => {
    const controle = new AbortController()
    const t = termo.trim()
    const rodar = () => {
      for (const f of fontes) {
        if (t.length < (f.minimo ?? 1)) { setEstado((e) => ({ ...e, [f.id]: { carregando: false, itens: [] } })); continue }
        let r: ResultadoPaleta[] | Promise<ResultadoPaleta[]>
        try { r = f.buscar(t, controle.signal) } catch (e) { console.error(`[paleta] ${f.id}`, e); continue }
        if (Array.isArray(r)) { setEstado((e) => ({ ...e, [f.id]: { carregando: false, itens: r as ResultadoPaleta[] } })); continue }
        setEstado((e) => ({ ...e, [f.id]: { carregando: true, itens: e[f.id]?.itens ?? [] } }))
        r.then((itens) => { if (!controle.signal.aborted) setEstado((e) => ({ ...e, [f.id]: { carregando: false, itens } })) })
          .catch((e) => {
            if (controle.signal.aborted) return
            if (!(e instanceof DOMException && e.name === 'AbortError')) console.error(`[paleta] ${f.id}`, e)
            setEstado((x) => ({ ...x, [f.id]: { carregando: false, itens: [] } }))
          })
      }
    }
    const timer = t ? setTimeout(rodar, ESPERA_MS) : (rodar(), undefined)
    return () => { clearTimeout(timer); controle.abort() }
  }, [fontes, termo])
  return estado
}

function visivel(c: Comando, ctx: ContextoAcao): boolean {
  try { return !c.visivel || c.visivel(ctx) } catch { return false }
}

function Busca() {
  const reg = useRegistro()
  const ctx = useContextoAcao()
  const [termo, setTermo] = useState(termoInicialPaleta)
  const [selecionado, setSelecionado] = useState('')
  const fontes = useMemo(() => reg.fontesBusca(), [reg])
  const resultados = useResultados(fontes, termo)
  const comandos = reg.comandos().filter((c) => visivel(c, ctx) && casaTermo(termo, c.rotulo, ...(c.palavras ?? [])))
  const vazio = !termo.trim()
  const recentes = vazio ? lerRecentes() : []
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  // tudo o que está na tela, por valor do cmdk (para o Ctrl+Enter achar o caminho)
  const porValor = new Map<string, { r?: ResultadoPaleta; c?: Comando; secao: string }>()

  function escolher(alvo: { r?: ResultadoPaleta; c?: Comando; secao: string }, novaAba = false) {
    const c = ctxRef.current
    fecharPaleta()
    if (alvo.c) {
      guardarRecente({ tipo: 'comando', id: alvo.c.id })
      alvo.c.executar(c)
      return
    }
    const r = alvo.r!
    if (r.caminho) guardarRecente({ tipo: 'resultado', id: r.id, secao: alvo.secao, rotulo: r.rotulo, detalhe: r.detalhe, caminho: r.caminho })
    if (r.executar && !novaAba) r.executar(c)
    else if (r.caminho) c.navegar(r.caminho, { novaAba })
  }

  const itemResultado = (r: ResultadoPaleta, secao: string) => {
    const valor = `${secao}:${r.id}`
    porValor.set(valor, { r, secao })
    const I = r.icone
    return (
      <Command.Item key={valor} value={valor} onSelect={() => escolher({ r, secao })}>
        {I ? <I aria-hidden="true" /> : <Search aria-hidden="true" />}
        <span className="paleta-rotulo">{r.rotulo}</span>
        {r.detalhe && <span className="paleta-detalhe">{r.detalhe}</span>}
      </Command.Item>
    )
  }
  const itemComando = (c: Comando) => {
    const valor = `comando:${c.id}`
    porValor.set(valor, { c, secao: SECAO_COMANDO[c.secao] })
    const I = c.icone
    return (
      <Command.Item key={valor} value={valor} onSelect={() => escolher({ c, secao: SECAO_COMANDO[c.secao] })}>
        {I ? <I aria-hidden="true" /> : <CornerDownLeft aria-hidden="true" />}
        <span className="paleta-rotulo">{c.rotulo}</span>
        {c.atalho && <Kbd teclas={c.atalho} />}
      </Command.Item>
    )
  }

  const carregando = fontes.some((f) => resultados[f.id]?.carregando)
  const gruposFontes = new Map<string, ResultadoPaleta[]>()
  for (const f of fontes) {
    const itens = resultados[f.id]?.itens ?? []
    if (itens.length) gruposFontes.set(f.secao, [...(gruposFontes.get(f.secao) ?? []), ...itens])
  }
  const temAlgo = recentes.length > 0 || comandos.length > 0 || gruposFontes.size > 0

  // os grupos montados antes do Command: assim o valor marcado sabe quais itens existem (a busca vem aos poucos e o
  // cmdk, sem filtro próprio, não remarca o primeiro sozinho)
  const grupoRecentes = recentes.length > 0 ? (
    <Command.Group heading="Recentes">
      {recentes.map((rc) => {
        if (rc.tipo === 'comando') {
          const c = reg.comandos().find((x) => x.id === rc.id)
          return c && visivel(c, ctx) ? itemComando(c) : null
        }
        const r: ResultadoPaleta = { id: rc.id, rotulo: rc.rotulo, detalhe: rc.detalhe ?? rc.secao, caminho: rc.caminho, icone: Clock }
        return itemResultado(r, `recente-${rc.secao}`)
      })}
    </Command.Group>
  ) : null
  const gruposComando = (['acoes', 'ir_para'] as const).map((s) => {
    const lista = comandos.filter((c) => c.secao === s)
    return lista.length ? <Command.Group key={s} heading={SECAO_COMANDO[s]}>{lista.map(itemComando)}</Command.Group> : null
  })
  const gruposBusca = [...gruposFontes.entries()].map(([secao, itens]) => (
    <Command.Group key={secao} heading={secao}>{itens.map((r) => itemResultado(r, secao))}</Command.Group>
  ))
  const valor = porValor.has(selecionado) ? selecionado : (porValor.keys().next().value ?? '')

  return (
    <Command
      label="Buscar e comandos"
      shouldFilter={false}
      loop
      value={valor}
      onValueChange={setSelecionado}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          const alvo = porValor.get(valor)
          if (alvo?.r?.caminho) { e.preventDefault(); escolher(alvo, true) }
        }
      }}
    >
      <div className="paleta-entrada">
        {carregando ? <Loader2 className="ui-giro" aria-hidden="true" /> : <Search aria-hidden="true" />}
        <Command.Input value={termo} onValueChange={setTermo} placeholder="Buscar quadros, demandas, clientes ou comandos" data-autofocus="" />
        <Kbd teclas="esc" />
      </div>
      <Command.List className="paleta-lista">
        {!temAlgo && !carregando && (
          <div className="paleta-vazio" role="status">{vazio ? 'Digite para buscar.' : `Nada encontrado para "${termo.trim()}".`}</div>
        )}
        {grupoRecentes}
        {gruposComando}
        {gruposBusca}
      </Command.List>
      <div className="paleta-rodape" aria-hidden="true">
        <span><Kbd teclas="enter" /> abre</span>
        <span><Kbd teclas="mod+enter" /> em outra aba</span>
        <span><Kbd teclas="up" /><Kbd teclas="down" /> escolhe</span>
      </div>
    </Command>
  )
}

export default function Paleta() {
  const aberta = usePaletaAberta()
  const [vez, setVez] = useState(0)
  useEffect(() => { if (aberta) setVez((v) => v + 1) }, [aberta])
  return (
    <Modal aberto={aberta} aoFechar={fecharPaleta} semCabecalho rotulo="Buscar e comandos" tamanho="m" className="paleta" classeCorpo="paleta-corpo">
      <Busca key={vez} />
    </Modal>
  )
}
