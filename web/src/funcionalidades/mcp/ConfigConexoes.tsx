/**
 * Configurações › Conexões (F7, API.md §F.4; todos os papéis, logo depois de "Sua conta"): o endereço para colar no
 * Claude (com Copiar), o passo a passo nos três caminhos (claude.ai de organização, de conta individual e o Claude
 * Code) e a lista das conexões com Revogar. O admin liga "Todas as pessoas". O nome do cliente vem do aplicativo: só
 * texto puro.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, Check, Copy, Laptop, Link2, PlugZap, ShieldCheck, Sparkles, TerminalSquare, UserRound } from 'lucide-react'
import { ROTULO_MOTIVO_REVOGACAO, type ConexaoMcp } from '@shared/tipos/index.ts'
import { useEu } from '../../api/auth.ts'
import { mensagemDeErro } from '../../api/cliente.ts'
import { useUsuarios } from '../../api/seletores.ts'
import { useNomeApp } from '../../lib/app.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Checkbox, Interruptor } from '../../ui/Checkbox.tsx'
import { EsqueletoLinhas } from '../../ui/Indicadores.tsx'
import { copiarParaAreaDeTransferencia } from '../../ui/Texto.tsx'
import { BotaoIcone } from '../../ui/Botao.tsx'
import { Painel, Pilula } from '../cadastros/comum.tsx'
import '../cadastros/cadastros.css'
import { diaHoraDe, haQuanto, revogarConexao, useConexoes } from './api.ts'
import './mcp.css'

/** O texto inteiro (quebra em vez de cortar) e o botão de copiar. */
function Copiavel({ texto, rotulo, aviso, className }: { texto: string; rotulo: string; aviso: string; className?: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    if (await copiarParaAreaDeTransferencia(texto)) {
      setCopiado(true)
      avisar(aviso, { tipo: 'sucesso', duracao: 2500 })
      window.setTimeout(() => setCopiado(false), 1600)
    } else {
      avisar('Não foi possível copiar. Selecione o texto e copie com Ctrl+C.', { tipo: 'erro' })
    }
  }
  return (
    <div className={`mcp-endereco${className ? ` ${className}` : ''}`}>
      <code>{texto}</code>
      <BotaoIcone icone={copiado ? Check : Copy} rotulo={copiado ? 'Copiado' : rotulo} variante="secundario" onClick={() => void copiar()} />
    </div>
  )
}

/**
 * O destino como quem olha entende: a conexão do Claude Code é do computador de quem conectou, não "deste" (o admin
 * com "Todas as pessoas" via "Claude Code neste computador" na conexão da Pri).
 */
function rotuloDestino(c: ConexaoMcp, minha: boolean): string {
  if (c.destino === 'claude_ai') return 'claude.ai'
  if (c.destino === 'claude_code') return minha ? 'Claude Code no seu computador' : 'Claude Code no computador da pessoa'
  return `Outro aplicativo (${c.hostRedirect})`
}

/** "Revogada por você" só para a dona; o admin olhando a de outra pessoa lê "Revogada pela pessoa". */
function rotuloRevogacao(c: ConexaoMcp, minha: boolean): string {
  if (!c.motivoRevogacao) return 'Revogada'
  if (c.motivoRevogacao === 'usuario' && !minha) return 'Revogada pela pessoa'
  return ROTULO_MOTIVO_REVOGACAO[c.motivoRevogacao]
}

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
          <Copiavel texto={comando} rotulo="Copiar o comando" aviso="Comando copiado." className="mcp-endereco-comando" />
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
  const minha = c.usuarioId === eu.usuario.id
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
          {c.revogadaEm && <Pilula>Revogada</Pilula>}
        </p>
        <p className="mcp-conexao-meta">
          {rotuloDestino(c, minha)} · conectada em {diaHoraDe(c.criadaEm)}
          {' · '}{c.revogadaEm
            ? `${rotuloRevogacao(c, minha)} em ${diaHoraDe(c.revogadaEm)}`
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
          <Copiavel texto={url} rotulo="Copiar o endereço" aviso="Endereço copiado." />
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
