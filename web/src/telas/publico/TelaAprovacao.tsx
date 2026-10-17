/**
 * Página pública de aprovação (/a/:token; F2; SPEC §5.4): sem login, celular primeiro. Mostra o logo do cliente e
 * "por Melt", a última versão enviada por este link (prévia estática; o Drive, o YouTube e o Figma só abrem embutidos
 * no toque), a conversa visível ao cliente e as versões anteriores. [Aprovar] abre uma folha de confirmação;
 * [Pedir ajuste] pede "um ajuste por linha". A identidade é pedida na hora da decisão ("Você é Fulana?" ou o nome,
 * lembrado no aparelho). 409 de versão nova recarrega a prévia ("Chegou a V3"); a decisão vai com Idempotency-Key.
 * Leve: nada de bootstrap, SSE, registro de extensões nem Markdown (o texto do cliente e da agência é texto puro).
 */
import './publico.css'
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useParams } from 'react-router'
import {
  AlertTriangle, CalendarClock, CheckCircle2, Download, ExternalLink, Eye, FileText, Link2, Loader2, Lock, Wrench, X, type LucideIcon,
} from 'lucide-react'
import type {
  DecisaoPublicaSaida, DetalhesVersaoDesatualizada, ItemAprovacaoPublico, ItemVersaoPublico, PaginaAprovacao,
} from '@shared/tipos/index.ts'
import { HORA_PADRAO_PRAZO } from '@shared/tipos/index.ts'
import { dataLocalDe, formatarPrazo } from '@shared/logica/datas.ts'
import { linhasParaItens } from '@shared/logica/texto.ts'
import { api, ehErroDaApi, mensagemDeErro } from '../../api/cliente.ts'
import { useNomeApp, useTituloAba } from '../../lib/app.ts'
import { Logo } from '../../ui/Marca.tsx'
import { enderecoEmbutido } from '../../funcionalidades/ciclo/embutir.ts'

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'inativo'; titulo: string; texto: string }
  | { tipo: 'ok'; pagina: PaginaAprovacao }

const CHAVE_NOME = 'pauta-aprovacao-nome'

function lerNome(): string {
  try { return localStorage.getItem(CHAVE_NOME) ?? '' } catch { return '' }
}
function guardarNome(nome: string): void {
  try { localStorage.setItem(CHAVE_NOME, nome) } catch { /* sem armazenamento: só não lembra */ }
}
function novaChave(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const hostDe = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? n

// ─────────────────────────────── botão e folha (sem o design system em JS: a página fica leve) ───────────────────────────────

/** O botão da marca só com as classes do DS (componentes.css já vem no CSS de entrada). */
function Botao({ variante = 'secundario', tamanho = 'm', icone: I, carregando, children, disabled, type = 'button', ...resto }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'ghost'; tamanho?: 'p' | 'm' | 'g'; icone?: LucideIcon; carregando?: boolean; children: ReactNode }) {
  return (
    <button type={type} className="ui-botao" data-variante={variante} data-tamanho={tamanho} disabled={disabled || carregando}
      aria-busy={carregando || undefined} {...resto}>
      {I && <I aria-hidden="true" />}
      <span>{children}</span>
      {carregando && <Loader2 className="ui-giro" aria-hidden="true" />}
    </button>
  )
}

/**
 * Folha que sobe do rodapé (no desktop, centralizada), com as classes do DS: Esc e o fundo fecham, o foco fica preso
 * dentro e volta ao botão que abriu.
 */
function FolhaPublica({ aberta, titulo, aoFechar, children }: { aberta: boolean; titulo: string; aoFechar(): void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar
  useEffect(() => {
    if (!aberta) return
    const antes = document.activeElement as HTMLElement | null
    const el = ref.current
    const focaveis = () => Array.from(el?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input:not(:disabled), a[href]') ?? [])
    requestAnimationFrame(() => (el?.querySelector<HTMLElement>('textarea, input:checked, input') ?? focaveis()[0])?.focus())
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar.current(); return }
      if (e.key !== 'Tab') return
      const lista = focaveis()
      if (!lista.length) return
      const primeiro = lista[0]!
      const ultimo = lista[lista.length - 1]!
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
    }
    document.addEventListener('keydown', tecla)
    const rolagem = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = rolagem
      antes?.focus?.()
    }
  }, [aberta])
  if (!aberta) return null
  return (
    <>
      <div className="ui-scrim" onClick={aoFechar} aria-hidden="true" />
      <div ref={ref} className="ui-folha vidro pub-folha" role="dialog" aria-modal="true" aria-labelledby="pub-folha-titulo" data-lado="baixo">
        <div className="ui-folha-alca" aria-hidden="true" />
        <div className="ui-folha-cabeca">
          <h2 id="pub-folha-titulo" className="ui-folha-titulo">{titulo}</h2>
          <button type="button" className="ui-botao-icone" data-tamanho="m" data-variante="ghost" aria-label="Fechar" onClick={aoFechar}><X aria-hidden="true" /></button>
        </div>
        <div className="ui-folha-corpo">{children}</div>
      </div>
    </>
  )
}

/** "14/10 às 14:03" (horário de São Paulo). */
function dataHora(instante: string): string {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(new Date(instante)).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`
}

// ─────────────────────────────── prévias ───────────────────────────────

function Previa({ i, ampliar }: { i: ItemVersaoPublico; ampliar(url: string, nome: string): void }) {
  const [embutir, setEmbutir] = useState(false)
  const embutido = i.embutivel ? enderecoEmbutido(i.url) : null
  const Icone = i.tipo === 'arquivo' ? FileText : Link2
  return (
    <li className="pub-previa">
      {i.imagem && i.previaUrl ? (
        <button type="button" className="pub-previa-imagem" onClick={() => ampliar(i.previaUrl!, i.nome)} aria-label={`Ampliar ${i.nome}`}>
          <img src={i.previaUrl} alt={i.nome} decoding="async" />
        </button>
      ) : embutir && embutido ? (
        <iframe src={embutido} title={i.nome} referrerPolicy="no-referrer" allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" />
      ) : i.previaUrl ? (
        <button type="button" className="pub-previa-imagem" onClick={() => (embutido ? setEmbutir(true) : ampliar(i.previaUrl!, i.nome))}
          aria-label={embutido ? `Ver ${i.nome} aqui` : `Ampliar ${i.nome}`}>
          <img src={i.previaUrl} alt={i.nome} decoding="async" referrerPolicy="no-referrer" />
        </button>
      ) : embutido ? (
        <button type="button" className="pub-previa-vazia" onClick={() => setEmbutir(true)}>
          <Eye aria-hidden="true" /><strong>Ver a peça aqui</strong><span>{hostDe(i.url)}</span>
        </button>
      ) : null}
      <div className="pub-previa-rodape">
        <span className="pub-previa-icone" aria-hidden="true"><Icone /></span>
        <span className="pub-previa-nome" title={i.nome}>{i.nome}</span>
        <span className="pub-previa-acoes">
          {embutido && !embutir && !!i.previaUrl && <Botao tamanho="p" icone={Eye} onClick={() => setEmbutir(true)}>Ver aqui</Botao>}
          {embutir && <Botao tamanho="p" icone={X} onClick={() => setEmbutir(false)}>Fechar</Botao>}
          {i.tipo === 'arquivo' && !i.imagem
            ? <a className="ui-botao" data-variante="secundario" data-tamanho="p" href={i.url} download><Download aria-hidden="true" /><span>Baixar</span></a>
            : <a className="ui-botao" data-variante="ghost" data-tamanho="p" href={i.url} target="_blank" rel="noopener noreferrer"
              aria-label={`Abrir ${i.nome} em outra aba`}><ExternalLink aria-hidden="true" /><span>Abrir</span></a>}
        </span>
      </div>
    </li>
  )
}

// ─────────────────────────────── decisão ───────────────────────────────

interface Identidade {
  contatoId: string | null
  nomeInformado: string | null
}

function Quem({ pagina, valor, mudar, erro }: { pagina: PaginaAprovacao; valor: { sou: boolean; nome: string }; mudar(v: { sou: boolean; nome: string }): void; erro: string | null }) {
  const contato = pagina.contato
  return (
    <fieldset className="pub-quem">
      <legend>{contato ? `Você é ${primeiroNome(contato.nome)}?` : 'Quem está decidindo?'}</legend>
      {contato && (
        <>
          <label className="pub-opcao"><input type="radio" name="pub-quem" checked={valor.sou} onChange={() => mudar({ ...valor, sou: true })} />Sim, sou {contato.nome}</label>
          <label className="pub-opcao"><input type="radio" name="pub-quem" checked={!valor.sou} onChange={() => mudar({ ...valor, sou: false })} />Sou outra pessoa</label>
        </>
      )}
      {(!contato || !valor.sou) && (
        <div className="ui-campo-grupo">
          <label className="ui-rotulo" htmlFor="pub-nome">Seu nome</label>
          <div className="ui-entrada" data-tamanho="m" data-invalido={erro ? 'true' : undefined}>
            <input id="pub-nome" value={valor.nome} maxLength={120} autoComplete="name" aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? 'pub-nome-erro' : undefined} onChange={(e) => mudar({ ...valor, nome: e.target.value })} />
          </div>
          {erro && <p id="pub-nome-erro" className="pub-erro">{erro}</p>}
        </div>
      )}
    </fieldset>
  )
}

function Decidir({ pagina, item, token, depois }: {
  pagina: PaginaAprovacao; item: ItemAprovacaoPublico; token: string
  depois(r: { tipo: 'ok'; saida: DecisaoPublicaSaida } | { tipo: 'recarregar'; aviso: string } | { tipo: 'inativo' }): void
}) {
  const [aberta, setAberta] = useState<'aprovar' | 'ajuste' | null>(null)
  const [quem, setQuem] = useState(() => ({ sou: !!pagina.contato, nome: lerNome() }))
  const [linhas, setLinhas] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [erroNome, setErroNome] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  // a mesma chave enquanto o pedido for o mesmo (repetir depois de uma queda de rede não decide duas vezes)
  const chave = useRef<{ corpo: string; chave: string } | null>(null)
  const versao = item.versao!

  async function enviar(decisao: 'aprovado' | 'ajuste') {
    if (enviando) return
    setErro(null)
    setErroNome(null)
    const id: Identidade = pagina.contato && quem.sou
      ? { contatoId: pagina.contato.id, nomeInformado: null }
      : { contatoId: null, nomeInformado: quem.nome.trim() }
    if (id.contatoId === null && !id.nomeInformado) { setErroNome('Escreva o seu nome.'); return }
    const itens = decisao === 'ajuste' ? linhasParaItens(linhas) : []
    if (decisao === 'ajuste' && itens.length === 0) { setErro('Escreva pelo menos um ajuste, um por linha.'); return }
    const corpo = { demandaId: item.demandaId, versaoId: versao.id, decisao, ...(decisao === 'ajuste' ? { linhas: itens } : {}), ...id }
    const texto = JSON.stringify(corpo)
    if (!chave.current || chave.current.corpo !== texto) chave.current = { corpo: texto, chave: novaChave() }
    setEnviando(true)
    try {
      const saida = await api<DecisaoPublicaSaida>('POST', `/api/publico/a/${encodeURIComponent(token)}/decisao`, {
        corpo, idempotencia: chave.current.chave,
      })
      if (id.nomeInformado) guardarNome(id.nomeInformado)
      chave.current = null
      setAberta(null)
      depois({ tipo: 'ok', saida })
    } catch (e) {
      if (ehErroDaApi(e) && e.status === 410) { depois({ tipo: 'inativo' }); return }
      if (ehErroDaApi(e) && e.codigo === 'versao_desatualizada') {
        const atual = (e.detalhes as DetalhesVersaoDesatualizada | undefined)?.versaoAtual
        setAberta(null)
        chave.current = null
        depois({ tipo: 'recarregar', aviso: atual ? `Chegou a V${atual.numero}. Veja a versão nova antes de decidir.` : e.mensagem })
        return
      }
      if (ehErroDaApi(e) && (e.codigo === 'conflito' || e.codigo === 'ja_decidida')) {
        setAberta(null)
        chave.current = null
        depois({ tipo: 'recarregar', aviso: e.mensagem })
        return
      }
      if (ehErroDaApi(e) && e.codigo === 'validacao' && (e.detalhes?.campos as Record<string, string> | undefined)?.nomeInformado) {
        setErroNome(e.mensagem)
        return
      }
      setErro(ehErroDaApi(e) && e.status === 0 ? 'Sem conexão. Confira a internet e tente de novo.' : mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  const fechar = () => { setAberta(null); setErro(null); setErroNome(null) }
  return (
    <>
      <div className="pub-decidir">
        <Botao tamanho="g" icone={Wrench} onClick={() => setAberta('ajuste')}>Pedir ajuste</Botao>
        <Botao tamanho="g" variante="primario" icone={CheckCircle2} onClick={() => setAberta('aprovar')}>Aprovar</Botao>
      </div>
      <FolhaPublica aberta={aberta === 'aprovar'} aoFechar={fechar} titulo={`Aprovar a V${versao.numero}?`}>
        <form className="pub-form" onSubmit={(e) => { e.preventDefault(); void enviar('aprovado') }}>
          <p className="pub-ajuda">A agência segue com esta versão como está. {item.titulo}.</p>
          <Quem pagina={pagina} valor={quem} mudar={setQuem} erro={erroNome} />
          {erro && <p className="pub-erro" role="alert">{erro}</p>}
          <div className="pub-acoes-folha">
            <Botao tamanho="g" onClick={fechar}>Voltar</Botao>
            <Botao tamanho="g" type="submit" variante="primario" carregando={enviando}>Confirmar aprovação</Botao>
          </div>
        </form>
      </FolhaPublica>
      <FolhaPublica aberta={aberta === 'ajuste'} aoFechar={fechar} titulo={`O que ajustar na V${versao.numero}?`}>
        <form className="pub-form" onSubmit={(e) => { e.preventDefault(); void enviar('ajuste') }}>
          <div className="ui-campo-grupo">
            <label className="ui-rotulo" htmlFor="pub-linhas">Um ajuste por linha</label>
            <div className="ui-entrada ui-entrada-texto" data-invalido={erro ? 'true' : undefined}>
              <textarea id="pub-linhas" rows={6} value={linhas} onChange={(e) => setLinhas(e.target.value)} aria-describedby="pub-linhas-ajuda"
                placeholder={'Ex.:\nTrocar a foto principal\nAumentar o logo'} />
            </div>
            <p id="pub-linhas-ajuda" className="pub-ajuda">Cada linha vira um item para a equipe.</p>
          </div>
          <Quem pagina={pagina} valor={quem} mudar={setQuem} erro={erroNome} />
          {erro && <p className="pub-erro" role="alert">{erro}</p>}
          <div className="pub-acoes-folha">
            <Botao tamanho="g" onClick={fechar}>Voltar</Botao>
            <Botao tamanho="g" type="submit" variante="primario" carregando={enviando}>
              Enviar {linhasParaItens(linhas).length > 1 ? `${linhasParaItens(linhas).length} ajustes` : 'ajuste'}
            </Botao>
          </div>
        </form>
      </FolhaPublica>
    </>
  )
}

// ─────────────────────────────── item ───────────────────────────────

function SeloDecisao({ item, mensagem }: { item: ItemAprovacaoPublico; mensagem: string | null }) {
  const d = item.decisao
  if (d) {
    const aprovado = d.decisao === 'aprovado'
    return (
      <div className="pub-selo" data-tom={aprovado ? 'aprovado' : 'ajuste'} role="status">
        {aprovado ? <CheckCircle2 aria-hidden="true" /> : <Wrench aria-hidden="true" />}
        <span className="pub-selo-titulo">{aprovado ? `Aprovado V${d.versaoNumero} por ${d.nome} em ${dataHora(d.em)}` : `Ajustes enviados por ${d.nome} em ${dataHora(d.em)}`}</span>
        {!aprovado && item.proximoPasso && <span className="pub-selo-texto">{item.proximoPasso}.</span>}
        {mensagem && aprovado && <span className="pub-selo-texto">{mensagem}</span>}
        {d.linhas.length > 0 && <ul>{d.linhas.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      </div>
    )
  }
  if (item.proximoPasso) {
    return (
      <div className="pub-selo" data-tom="aviso" role="status">
        <Lock aria-hidden="true" />
        <span className="pub-selo-titulo">{item.proximoPasso}</span>
        <span className="pub-selo-texto">Se precisar, fale com o seu atendimento.</span>
      </div>
    )
  }
  return null
}

function Item({ pagina, item, token, ampliar, mensagem, depois }: {
  pagina: PaginaAprovacao; item: ItemAprovacaoPublico; token: string; ampliar(url: string, nome: string): void; mensagem: string | null
  depois: Parameters<typeof Decidir>[0]['depois']
}) {
  const v = item.versao
  const aguarda = !!v && !item.decisao && !item.proximoPasso
  return (
    <article className="pub-item" aria-labelledby={`pub-titulo-${item.demandaId}`}>
      <div className="flex flex-col gap-1.5">
        <p className="pub-eyebrow">{item.modeloNome ?? 'Peça'}{v ? ` · V${v.numero}` : ''}</p>
        <h1 id={`pub-titulo-${item.demandaId}`} className="pub-titulo">{item.titulo}</h1>
        {aguarda && item.prazoRetorno && (
          <p className="pub-linha"><span className="pub-chip" data-tom="prazo"><CalendarClock aria-hidden="true" />
            Retorno até {formatarPrazo(item.prazoRetorno, item.prazoRetornoHora ?? HORA_PADRAO_PRAZO)}</span></p>
        )}
      </div>
      {v && v.itens.length > 0 && <ul className="pub-previas" aria-label={`O que foi enviado na V${v.numero}`}>{v.itens.map((i, k) => <Previa key={k} i={i} ampliar={ampliar} />)}</ul>}
      <SeloDecisao item={item} mensagem={mensagem} />
      {aguarda && <Decidir pagina={pagina} item={item} token={token} depois={depois} />}
      {item.comentarios.length > 0 && (
        <section className="pub-secao" aria-label="Conversa">
          <h2 className="pub-secao-titulo">Conversa</h2>
          <ul className="pub-comentarios">
            {item.comentarios.map((c, k) => (
              <li key={k} className="pub-comentario">
                <p className="pub-comentario-autor">{c.autor} · {dataHora(c.criadoEm)}</p>
                <p className="pub-comentario-texto">{c.corpoMd}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {item.anteriores.length > 0 && (
        <details className="pub-anteriores">
          <summary>Versões anteriores ({item.anteriores.length})</summary>
          <ul>
            {item.anteriores.map((a) => (
              <li key={a.numero}>V{a.numero} · enviada em {dataHora(a.enviadaEm)}{a.decisao === 'aprovado' ? ' · aprovada' : a.decisao === 'ajuste' ? ' · ajuste pedido' : ''}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}

// ─────────────────────────────── tela ───────────────────────────────

const INATIVO = {
  titulo: 'Este link de aprovação não está mais ativo.',
  texto: 'Peça um novo ao seu atendimento.',
}

export default function TelaAprovacao() {
  const { token = '' } = useParams()
  const nomeApp = useNomeApp()
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  const [aviso, setAviso] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Record<string, string>>({})
  const [zoom, setZoom] = useState<{ url: string; nome: string } | null>(null)
  const visto = useRef(false)
  const pagina = estado.tipo === 'ok' ? estado.pagina : null
  useTituloAba(pagina ? `${pagina.itens[0]?.titulo ?? 'Aprovação'} · ${pagina.cliente.nome}` : 'Aprovação')

  const carregar = useCallback(async () => {
    try {
      const p = await api<PaginaAprovacao>('GET', `/api/publico/a/${encodeURIComponent(token)}`)
      setEstado({ tipo: 'ok', pagina: p })
      if (!visto.current) {
        visto.current = true
        void api('POST', `/api/publico/a/${encodeURIComponent(token)}/visto`).catch(() => {})
      }
    } catch (e) {
      if (ehErroDaApi(e) && e.status === 404) setEstado({ tipo: 'inativo', titulo: 'Link não encontrado.', texto: 'Confira o endereço ou peça um novo ao seu atendimento.' })
      else if (ehErroDaApi(e) && e.status === 410) setEstado({ tipo: 'inativo', ...INATIVO })
      else if (ehErroDaApi(e) && e.status === 429) setEstado({ tipo: 'inativo', titulo: 'Muitas tentativas.', texto: 'Espere um minuto e abra o link de novo.' })
      else setEstado({ tipo: 'inativo', titulo: 'Não foi possível abrir agora.', texto: ehErroDaApi(e) && e.status === 0 ? 'Confira a internet e tente de novo.' : mensagemDeErro(e) })
    }
  }, [token])
  useEffect(() => { void carregar() }, [carregar])

  useEffect(() => {
    if (!zoom) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(null) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [zoom])

  const depois: Parameters<typeof Decidir>[0]['depois'] = (r) => {
    if (r.tipo === 'inativo') { setEstado({ tipo: 'inativo', ...INATIVO }); return }
    if (r.tipo === 'recarregar') { setAviso(r.aviso); void carregar(); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setAviso(null)
    setMensagens((m) => ({ ...m, [r.saida.item.demandaId]: r.saida.mensagem }))
    setEstado((s) => (s.tipo === 'ok'
      ? { tipo: 'ok', pagina: { ...s.pagina, itens: s.pagina.itens.map((i) => (i.demandaId === r.saida.item.demandaId ? r.saida.item : i)) } }
      : s))
  }

  return (
    <div className="pub">
      <header className="pub-topo">
        <div className="pub-topo-dentro">
          {pagina?.cliente.logoUrl
            ? <img className="pub-cliente-logo" src={pagina.cliente.logoUrl} alt={`Logo de ${pagina.cliente.nome}`} />
            : pagina ? <span className="pub-cliente-sigla bg-cor-bg text-cor-ink" data-cor={pagina.cliente.cor} aria-hidden="true">{pagina.cliente.sigla.slice(0, 3)}</span> : null}
          <div className="pub-cliente">
            <span className="pub-cliente-nome">{pagina?.cliente.nome ?? 'Aprovação'}</span>
            <span className="pub-por">por <Logo altura={13} rotulo="Melt" /></span>
          </div>
        </div>
      </header>
      {estado.tipo === 'carregando' && (
        <main className="pub-conteudo" aria-busy="true" aria-label="Carregando">
          <div className="pub-esqueleto"><span style={{ height: 18, width: '40%' }} /><span style={{ height: 30, width: '80%' }} /><span style={{ height: 320 }} /></div>
        </main>
      )}
      {estado.tipo === 'inativo' && (
        <main className="pub-estado">
          <Lock aria-hidden="true" />
          <h1 className="pub-estado-titulo">{estado.titulo}</h1>
          <p className="pub-estado-texto">{estado.texto}</p>
        </main>
      )}
      {pagina && (
        <main className="pub-conteudo">
          {aviso && <p className="pub-aviso" role="alert"><AlertTriangle aria-hidden="true" />{aviso}</p>}
          {pagina.itens.map((item) => (
            <Item key={item.demandaId} pagina={pagina} item={item} token={token} mensagem={mensagens[item.demandaId] ?? null}
              ampliar={(url, nome) => setZoom({ url, nome })} depois={depois} />
          ))}
        </main>
      )}
      <footer className="pub-rodape">
        {pagina ? `Link válido até ${formatarPrazo(dataLocalDe(pagina.expiraEm), null)}. ` : ''}{nomeApp} · Melt Comunicação
      </footer>
      {zoom && (
        <div className="pub-zoom" role="dialog" aria-modal="true" aria-label={zoom.nome} onClick={() => setZoom(null)}>
          <img src={zoom.url} alt={zoom.nome} />
          <button type="button" className="ui-botao-icone pub-zoom-fechar" data-tamanho="m" data-variante="secundario" aria-label="Fechar" autoFocus
            onClick={() => setZoom(null)}><X aria-hidden="true" /></button>
        </div>
      )}
    </div>
  )
}
