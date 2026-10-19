/**
 * /autorizar?pedido=<id> (F7, API.md §F.3): a tela de consentimento do Claude. Rota autenticada (sem sessão vai a
 * /entrar e volta) e de layout vazio. Mostra quem pede (claude.ai ou um aplicativo neste computador), como quem ele vai
 * agir, o que poderá e o que nunca vai fazer, para onde volta (o host em destaque) e a hora do pedido; o loopback exige
 * marcar "Fui eu que comecei esta conexão no Claude Code". A decisão vai por fetch e a tela sai por location.assign (um
 * <form> com 302 para o claude.ai seria barrado pela CSP form-action 'self'). O texto do aplicativo é só texto.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  AlertCircle, ArrowLeftRight, Check, Clock3, Laptop, Loader2, ShieldCheck, Sparkles, TerminalSquare, X,
} from 'lucide-react'
import type { DestinoConexao, PedidoAutorizacao } from '@shared/tipos/index.ts'
import { useEu } from '../../api/auth.ts'
import { ehErroDaApi, mensagemDeErro } from '../../api/cliente.ts'
import { decidir, horaDe, usePedido } from '../../funcionalidades/mcp/api.ts'
import { useNomeApp, useTituloAba } from '../../lib/app.ts'
import { Avatar } from '../../ui/Avatar.tsx'
import { Botao, propsBotao } from '../../ui/Botao.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { BarraAssinatura, MarcaE } from '../../ui/Marca.tsx'
import './autorizar.css'

const ROTULO_PAPEL = { admin: 'Admin', atendimento: 'Atendimento', equipe: 'Equipe' } as const

function Cartao({ children, rodape }: { children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="aut">
      <main className="aut-palco">
        <div className="aut-cartao">
          <BarraAssinatura className="aut-assinatura" />
          <div className="aut-corpo">{children}</div>
          {rodape && <footer className="aut-rodape">{rodape}</footer>}
        </div>
      </main>
    </div>
  )
}

function Par({ destino }: { destino: DestinoConexao }) {
  const Outro = destino === 'claude_code' ? TerminalSquare : Sparkles
  return (
    <div className="aut-par" aria-hidden="true">
      <span className="aut-par-marca"><MarcaE altura={26} /></span>
      <ArrowLeftRight className="aut-par-seta" />
      <span className="aut-par-outro" data-destino={destino}><Outro /></span>
    </div>
  )
}

/** Pedido inválido, vencido, de outro navegador ou já respondido: o texto do servidor e o caminho de volta. */
function Problema({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Cartao rodape={<>Ninguém ganhou acesso. Se precisar, conecte de novo pelo Claude.</>}>
      <div className="aut-problema-icone" aria-hidden="true"><AlertCircle /></div>
      <h1 className="aut-titulo" tabIndex={-1}>{titulo}</h1>
      <p className="aut-sub">{texto}</p>
      <div className="aut-acoes aut-acoes-um">
        <Link to="/inicio" {...propsBotao({ variante: 'secundario' })}>Ir para o Início</Link>
      </div>
    </Cartao>
  )
}

function Formulario({ pedido }: { pedido: PedidoAutorizacao }) {
  const eu = useEu()
  const nome = useNomeApp()
  const loopback = pedido.destino === 'claude_code'
  const [substituir, setSubstituir] = useState(true)
  const [fuiEu, setFuiEu] = useState(false)
  const [enviando, setEnviando] = useState<'permitir' | 'negar' | null>(null)
  const [saindo, setSaindo] = useState<'permitido' | 'negado' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  useEffect(() => { titulo.current?.focus() }, [])

  const atendimento = eu.usuario.papel === 'admin' || eu.usuario.papel === 'atendimento'
  const podeFazer = [
    'Ler as demandas, a agenda e o resumo dos clientes',
    'Criar, editar, mover, concluir e arquivar demandas',
    'Comentar, marcar checklists e lançar as suas horas',
    ...(atendimento ? ['Registrar o retorno do cliente (aprovado ou ajuste)'] : []),
  ]

  async function responder(permitir: boolean) {
    setErro(null)
    setEnviando(permitir ? 'permitir' : 'negar')
    try {
      const r = await decidir(pedido.id, { permitir, ...(pedido.anteriores > 0 ? { substituir } : {}) })
      setSaindo(permitir ? 'permitido' : 'negado')
      window.location.assign(r.redirecionar)
    } catch (e) {
      setEnviando(null)
      setErro(ehErroDaApi(e) ? e.mensagem : mensagemDeErro(e))
    }
  }

  if (saindo) {
    return (
      <Cartao>
        <Par destino={pedido.destino} />
        <h1 className="aut-titulo" tabIndex={-1} ref={titulo}>
          {saindo === 'permitido' ? (loopback ? 'Pronto. Volte ao terminal.' : 'Pronto. Voltando ao Claude…') : 'Conexão cancelada.'}
        </h1>
        <p className="aut-sub" role="status">
          <Loader2 className="aut-girando" aria-hidden="true" />
          {saindo === 'permitido' ? 'Levando a autorização de volta.' : 'Avisando o Claude que você não autorizou.'}
        </p>
      </Cartao>
    )
  }

  const permitirDesabilitado = (loopback && !fuiEu) || enviando !== null
  return (
    <Cartao rodape={<>Você pode revogar quando quiser em <strong>Configurações → Conexões</strong>. Tudo o que o Claude fizer fica no histórico como você, com a marca “via Claude”.</>}>
      <Par destino={pedido.destino} />
      <h1 className="aut-titulo" tabIndex={-1} ref={titulo}>
        {loopback ? `Um aplicativo neste computador quer acessar o ${nome} como você` : `O Claude quer acessar o ${nome} como você`}
      </h1>
      {loopback && (
        <div className="aut-app">
          <span className="aut-rotulo">Nome informado pelo aplicativo</span>
          <strong className="aut-app-nome">{pedido.nomeCliente}</strong>
        </div>
      )}

      <div className="aut-pessoa">
        <Avatar pessoa={eu.usuario} tamanho={36} dica={false} />
        <div className="aut-pessoa-texto">
          <strong>{eu.usuario.nome}</strong>
          <span>{ROTULO_PAPEL[eu.usuario.papel]} · {eu.usuario.email}</span>
        </div>
      </div>

      <div className="aut-listas">
        <section aria-labelledby="aut-pode">
          <h2 id="aut-pode" className="aut-rotulo">Com as suas permissões, ele poderá</h2>
          <ul className="aut-lista">{podeFazer.map((t) => <li key={t}><Check aria-hidden="true" />{t}</li>)}</ul>
        </section>
        <section aria-labelledby="aut-nunca">
          <h2 id="aut-nunca" className="aut-rotulo">Ele nunca vai</h2>
          <ul className="aut-lista" data-tom="nunca">
            <li><X aria-hidden="true" />Apagar nada</li>
            <li><X aria-hidden="true" />Falar com o cliente (enviar link, WhatsApp ou e-mail)</li>
          </ul>
        </section>
      </div>

      <div className="aut-destino">
        <span className="aut-rotulo">Depois, a autorização vai para</span>
        <span className="aut-host">
          {loopback ? <Laptop aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          <strong>{pedido.hostRedirect}</strong>
          {loopback && <span>este computador</span>}
        </span>
        {!loopback && <span className="aut-declarado">Nome informado pelo aplicativo: {pedido.nomeCliente}</span>}
      </div>

      <div className="aut-aviso" role="note">
        <Clock3 aria-hidden="true" />
        <p>Pedido criado às <strong>{horaDe(pedido.criadoEm)}</strong>. Só continue se você acabou de clicar em Conectar no Claude.
          Se alguém te mandou este link, cancele.</p>
      </div>

      <div className="aut-caixas">
        {pedido.anteriores > 0 && (
          <Checkbox checked={substituir} onChange={(e) => setSubstituir(e.target.checked)}
            descricao={`Você já tem ${pedido.anteriores === 1 ? 'uma conexão' : `${pedido.anteriores} conexões`} ${loopback ? 'de um aplicativo neste computador' : 'do Claude'}. Marcado, ${pedido.anteriores === 1 ? 'ela para' : 'elas param'} de funcionar.`}>
            Substituir a conexão anterior
          </Checkbox>
        )}
        {loopback && (
          <Checkbox checked={fuiEu} onChange={(e) => setFuiEu(e.target.checked)} descricao="Obrigatório para permitir.">
            Fui eu que comecei esta conexão no Claude Code
          </Checkbox>
        )}
      </div>

      {erro && <div className="aut-erro" role="alert"><AlertCircle aria-hidden="true" /><span>{erro}</span></div>}

      <div className="aut-acoes">
        <Botao variante="secundario" tamanho="g" carregando={enviando === 'negar'} disabled={enviando !== null} onClick={() => void responder(false)}>
          Cancelar
        </Botao>
        <Botao variante="primario" tamanho="g" carregando={enviando === 'permitir'} disabled={permitirDesabilitado}
          onClick={() => void responder(true)} aria-describedby={loopback && !fuiEu ? 'aut-falta' : undefined}>
          Permitir
        </Botao>
      </div>
      {loopback && !fuiEu && <p id="aut-falta" className="aut-falta">Marque “Fui eu que comecei esta conexão” para permitir.</p>}
    </Cartao>
  )
}

export default function TelaAutorizar() {
  useTituloAba('Conectar o Claude')
  const [params] = useSearchParams()
  const id = params.get('pedido')
  const q = usePedido(id && /^[A-Za-z0-9_-]{20,100}$/.test(id) ? id : null)

  if (!id || !/^[A-Za-z0-9_-]{20,100}$/.test(id)) {
    return <Problema titulo="Este pedido de conexão não é válido." texto="Volte ao Claude e conecte de novo." />
  }
  if (q.isPending) {
    return (
      <Cartao>
        <div className="aut-esqueleto" aria-busy="true" aria-label="Carregando o pedido">
          <span /><span /><span /><span />
        </div>
      </Cartao>
    )
  }
  if (q.isError) {
    const e = q.error
    const motivo = (e.detalhes?.motivo as string | undefined) ?? null
    if (e.status === 410 && motivo === 'outro_navegador') {
      return <Problema titulo="Abra a conexão pelo Claude neste navegador." texto="Este link só abre no navegador em que você clicou em Conectar. Se alguém te mandou o link, não continue." />
    }
    if (e.status === 410 && motivo === 'vencido') {
      return <Problema titulo="Este pedido expirou." texto="Volte ao Claude e conecte de novo. O pedido vale por 10 minutos." />
    }
    if (e.status === 410) return <Problema titulo="Este pedido já foi respondido." texto={e.mensagem} />
    if (e.status === 404) return <Problema titulo="Este pedido de conexão não existe." texto="Volte ao Claude e conecte de novo." />
    return <Problema titulo="Não foi possível abrir o pedido." texto={e.mensagem} />
  }
  return <Formulario pedido={q.data} />
}
