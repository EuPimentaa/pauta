/**
 * Configurações › Conexões (F7, API.md §F.4; todos os papéis, logo depois de "Sua conta"): o endereço para colar no
 * Claude (com Copiar), o passo a passo nos três caminhos (claude.ai de organização, de conta individual e o Claude
 * Code) e a lista das conexões com Revogar. O admin liga "Todas as pessoas". O nome do cliente vem do aplicativo: só
 * texto puro.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, Laptop, Link2, PlugZap, ShieldCheck, Sparkles, TerminalSquare, UserRound } from 'lucide-react'
import { ROTULO_MOTIVO_REVOGACAO, type ConexaoMcp } from '@shared/tipos/index.ts'
import { useEu } from '../../api/auth.ts'
import { mensagemDeErro } from '../../api/cliente.ts'
import { useUsuarios } from '../../api/seletores.ts'
import { useNomeApp } from '../../lib/app.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Checkbox, Interruptor } from '../../ui/Checkbox.tsx'
import { EsqueletoLinhas } from '../../ui/Indicadores.tsx'
import { CopiarTexto } from '../../ui/Texto.tsx'
import { Painel } from '../cadastros/comum.tsx'
import '../cadastros/cadastros.css'
import { diaHoraDe, haQuanto, revogarConexao, useConexoes } from './api.ts'
import './mcp.css'

const ROTULO_DESTINO = { claude_ai: 'claude.ai', claude_code: 'Claude Code neste computador', outro: 'Outro aplicativo' } as const

function Passos({ url }: { url: string }) {
  const comando = `claude mcp add --transport http pauta ${url}`
  return (
    <ol className="mcp-passos">
      <li className="mcp-passo">
        <span className="mcp-passo-icone" aria-hidden="true"><Building2 /></span>
        <div className="min-w-0">
          <h3>claude.ai da organização (Team ou Enterprise)</h3>
          <p>O Owner da organização adiciona uma vez em <em>Organization settings → Connectors → Add custom connector</em> com o
            endereço acima. Depois, cada pessoa abre <em>Customize → Connectors</em> e clica <strong>Connect</strong> com o próprio login.</p>
        </div>
      </li>
      <li className="mcp-passo">
        <span className="mcp-passo-icone" aria-hidden="true"><UserRound /></span>
        <div className="min-w-0">
          <h3>claude.ai de conta individual (Pro ou Max)</h3>
          <p>Em <em>Customize → Connectors → Add custom connector</em>, cole o endereço acima e clique <strong>Connect</strong>.</p>
        </div>
      </li>
      <li className="mcp-passo">
        <span className="mcp-passo-icone" aria-hidden="true"><TerminalSquare /></span>
        <div className="min-w-0">
          <h3>Claude Code</h3>
          <p>No terminal, rode o comando abaixo e, dentro do Claude Code, <code>/mcp</code> para autenticar.</p>
          <div className="mcp-endereco mcp-endereco-comando">
            <code>{comando}</code>
            <CopiarTexto texto={comando} rotulo="Copiar o comando" avisoCopiado="Comando copiado." />
          </div>
        </div>
      </li>
    </ol>
  )
}

function Linha({ c, mostrarPessoa }: { c: ConexaoMcp; mostrarPessoa: boolean }) {
  const qc = useQueryClient()
  const eu = useEu()
  const usuarios = useUsuarios()
  const [confirmar, setConfirmar] = useState(false)
  const [revogando, setRevogando] = useState(false)
  const dona = usuarios.find((u) => u.id === c.usuarioId)
  const Icone = c.destino === 'claude_code' ? Laptop : c.destino === 'claude_ai' ? Sparkles : Link2

  async function revogar() {
    setRevogando(true)
    try {
      await revogarConexao(qc, c.id, eu.usuario.id)
      avisar('Conexão revogada. O Claude perde o acesso na próxima pergunta.', { tipo: 'sucesso' })
    } catch (e) {
      avisar(mensagemDeErro(e), { tipo: 'erro' })
    } finally {
      setRevogando(false)
      setConfirmar(false)
    }
  }

  return (
    <li className="mcp-conexao" data-revogada={c.revogadaEm ? '' : undefined}>
      <span className="mcp-conexao-icone" aria-hidden="true"><Icone /></span>
      <div className="mcp-conexao-texto">
        <p className="mcp-conexao-nome">
          <span>{c.nomeCliente}</span>
          {mostrarPessoa && <span className="mcp-conexao-pessoa">· {dona?.nome ?? 'Pessoa removida'}</span>}
        </p>
        <p className="mcp-conexao-meta">
          {ROTULO_DESTINO[c.destino]}{c.destino === 'outro' ? ` (${c.hostRedirect})` : ''} · conectada em {diaHoraDe(c.criadaEm)}
          {' · '}{c.revogadaEm
            ? `${c.motivoRevogacao ? ROTULO_MOTIVO_REVOGACAO[c.motivoRevogacao] : 'Revogada'} em ${diaHoraDe(c.revogadaEm)}`
            : c.ultimoUsoEm ? `último uso ${haQuanto(c.ultimoUsoEm)}` : 'ainda não usada'}
        </p>
      </div>
      {!c.revogadaEm && (
        <div className="mcp-conexao-acoes">
          {confirmar ? (
            <>
              <span className="mcp-confirmar" id={`confirmar-${c.id}`}>Revogar esta conexão?</span>
              <Botao variante="ghost" tamanho="p" onClick={() => setConfirmar(false)} disabled={revogando}>Manter</Botao>
              <Botao variante="perigo-cheio" tamanho="p" carregando={revogando} onClick={() => void revogar()} aria-describedby={`confirmar-${c.id}`}>
                Revogar
              </Botao>
            </>
          ) : (
            <Botao variante="perigo" tamanho="p" onClick={() => setConfirmar(true)}>Revogar</Botao>
          )}
        </div>
      )}
    </li>
  )
}

export default function ConfigConexoes() {
  const eu = useEu()
  const nome = useNomeApp()
  const admin = eu.usuario.papel === 'admin'
  const [todas, setTodas] = useState(false)
  const [revogadas, setRevogadas] = useState(false)
  const q = useConexoes(admin && todas, revogadas)
  const url = q.data?.urlMcp ?? `${window.location.origin}/mcp`

  return (
    <div className="cad-secao">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h2 className="cad-titulo">Conexões</h2>
          <p className="cad-subtitulo">
            Conecte o Claude ao {nome}: ele trabalha com as suas permissões, nunca apaga nada nem fala com o cliente, e tudo o que
            fizer fica no histórico como você, com a marca “via Claude”.
          </p>
        </div>
      </header>

      <Painel titulo="Endereço do conector" icone={PlugZap} id="mcp-endereco">
        <div className="cad-painel-corpo">
          <div className="mcp-endereco">
            <code>{url}</code>
            <CopiarTexto texto={url} rotulo="Copiar o endereço" avisoCopiado="Endereço copiado." />
          </div>
          <p className="mcp-ajuda">Cole exatamente este endereço no Claude, sem barra no fim.</p>
          <Passos url={url} />
        </div>
      </Painel>

      <Painel titulo={admin && todas ? 'Conexões de todas as pessoas' : 'Suas conexões'} icone={ShieldCheck} id="mcp-lista"
        acoes={(
          <div className="mcp-filtros">
            {admin && <Interruptor ligado={todas} aoMudar={setTodas}>Todas as pessoas</Interruptor>}
            <Checkbox checked={revogadas} onChange={(e) => setRevogadas(e.target.checked)}>Mostrar as revogadas</Checkbox>
          </div>
        )}>
        <div className="cad-painel-corpo">
          {q.isPending ? <EsqueletoLinhas linhas={2} /> : q.isError ? (
            <p className="mcp-vazio">Não foi possível carregar as conexões. <button type="button" className="mcp-link" onClick={() => void q.refetch()}>Tentar de novo</button></p>
          ) : q.data.conexoes.length === 0 ? (
            <p className="mcp-vazio">Nenhuma conexão. Conecte o Claude com o endereço acima.</p>
          ) : (
            <ul className="mcp-conexoes" aria-label="Conexões">
              {q.data.conexoes.map((c) => <Linha key={c.id} c={c} mostrarPessoa={admin && todas} />)}
            </ul>
          )}
        </div>
      </Painel>
    </div>
  )
}
