/**
 * Configurações › Resultados (Windsor) (F8, ordem 560; admin e atendimento): o estado da chave, o uso de hoje, todas as
 * contas da Windsor com o cliente ligado (ou "sem cliente") e, em cada uma, o "Ligar a…" com os clientes que a pessoa
 * pode editar (sugestão pré-marcada quando o nome da conta tem a sigla, o nome ou um apelido do cliente), para ligar as
 * 42 contas numa tela só. [Recarregar lista] só o admin (1 a cada 10 min).
 */
import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { BarChart3, Link2, RefreshCw, Search } from 'lucide-react'
import { CONECTORES_WINDSOR, ROTULO_CONECTOR, type ClienteResumo, type ContaWindsor } from '@shared/tipos/index.ts'
import { pode } from '@shared/logica/permissoes.ts'
import { avisarErro } from '../../api/acoes.ts'
import { useEu } from '../../api/auth.ts'
import { ehErroDaApi } from '../../api/cliente.ts'
import { useClientes } from '../../api/seletores.ts'
import { hojeLocal } from '../../lib/datas.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo, Selecao } from '../../ui/Campo.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { normalizarBusca } from '../../ui/Combobox.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import { Faixa, LimparBusca, Painel, Pilula, textoNadaEncontrado } from '../cadastros/comum.tsx'
import { ligarConta, recarregarContasWindsor, useContasWindsor } from './api.ts'
import { rotuloStatus, sugerirCliente, textoHora } from './logica.ts'
import './resultados.css'

const NUM = new Intl.NumberFormat('pt-BR')

function LinhaConta({ conta, editaveis }: { conta: ContaWindsor; editaveis: ClienteResumo[] }) {
  const qc = useQueryClient()
  const id = useId()
  const livres = editaveis.filter((c) => !conta.clientes.some((x) => x.clienteId === c.id))
  const sugestao = conta.clientes.length === 0 ? sugerirCliente(conta.nome, livres) : null
  const [alvo, setAlvo] = useState(sugestao?.id ?? '')
  const [ligando, setLigando] = useState(false)

  async function ligar() {
    const cliente = livres.find((c) => c.id === alvo)
    if (!cliente) return
    setLigando(true)
    try {
      await ligarConta(qc, cliente.id, { conector: conta.conector, contaId: conta.contaId })
      avisar(`${conta.nome} ligada a ${cliente.sigla}.`, { tipo: 'sucesso' })
      setAlvo('')
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível ligar a conta.' })
    } finally {
      setLigando(false)
    }
  }

  return (
    <li className="res-conta">
      <div className="res-conta-texto">
        <span className="res-conta-nome">{conta.nome}</span>
        <span className="res-conta-meta">
          <span className="tabular">{conta.contaId}</span>
          {rotuloStatus(conta.status) && <span>{rotuloStatus(conta.status)}</span>}
        </span>
      </div>
      <div className="res-conta-clientes">
        {conta.clientes.length === 0 ? <Pilula tom="aviso">sem cliente</Pilula> : conta.clientes.map((c) => (
          <Link key={c.clienteId} className="cad-pilula res-pilula-link" to={`/clientes/${encodeURIComponent(c.sigla)}?aba=resultados`}>{c.sigla}</Link>
        ))}
      </div>
      {livres.length > 0 && (
        <form className="res-conta-ligar" onSubmit={(e) => { e.preventDefault(); void ligar() }}>
          <Selecao id={id} rotulo={`Ligar ${conta.nome} a um cliente`} rotuloOculto tamanho="p" value={alvo} vazia="Ligar a…"
            onChange={(e) => setAlvo(e.target.value)} opcoes={livres.map((c) => ({ valor: c.id, rotulo: `${c.sigla} · ${c.nome}` }))}
            ajuda={sugestao && alvo === sugestao.id ? 'Sugestão pelo nome da conta' : undefined} />
          <Botao type="submit" tamanho="p" variante="secundario" icone={Link2} carregando={ligando} disabled={!alvo}>Ligar</Botao>
        </form>
      )}
    </li>
  )
}

export default function ConfigWindsor() {
  const qc = useQueryClient()
  const eu = useEu()
  const admin = eu.usuario.papel === 'admin'
  const lista = useContasWindsor()
  const clientes = useClientes()
  const [busca, setBusca] = useState('')
  const [semCliente, setSemCliente] = useState(false)
  const [recarregando, setRecarregando] = useState(false)
  const [ligandoSugestoes, setLigandoSugestoes] = useState(false)
  const { id: euId, papel } = eu.usuario
  const editaveis = useMemo(() => clientes.filter((c) => c.status !== 'ex' && pode('cliente.editar', { id: euId, papel }, { cliente: c })),
    [clientes, euId, papel])

  async function recarregar() {
    setRecarregando(true)
    try {
      const l = await recarregarContasWindsor(qc)
      avisar('Lista da Windsor recarregada.', { tipo: 'sucesso', descricao: `${NUM.format(l.contas.length)} contas.` })
    } catch (e) {
      if (ehErroDaApi(e) && e.status === 429) {
        const s = Number(e.detalhes?.tenteEmSegundos ?? 600)
        avisar('A lista foi recarregada há pouco.', { tipo: 'aviso', descricao: `Tente de novo em ${Math.ceil(s / 60)} min.` })
      } else avisarErro(e, { titulo: 'Não foi possível recarregar a lista.' })
    } finally {
      setRecarregando(false)
    }
  }

  const dados = lista.data
  const termo = normalizarBusca(busca)
  const visiveis = (dados?.contas ?? []).filter((c) => (!semCliente || c.clientes.length === 0)
    && (!termo || normalizarBusca(`${c.nome} ${c.contaId} ${c.clientes.map((x) => x.sigla).join(' ')}`).includes(termo)))
  const total = dados?.contas.length ?? 0
  const sem = (dados?.contas ?? []).filter((c) => c.clientes.length === 0).length
  // as sugestões das contas visíveis sem cliente (a mesma de cada linha): ligar todas de uma vez
  const sugestoes = visiveis.filter((c) => c.clientes.length === 0)
    .map((conta) => ({ conta, cliente: sugerirCliente(conta.nome, editaveis) }))
    .filter((x): x is { conta: ContaWindsor; cliente: ClienteResumo } => !!x.cliente)

  async function ligarSugestoes() {
    setLigandoSugestoes(true)
    let ligadas = 0
    const falhas: string[] = []
    for (const { conta, cliente } of sugestoes) {
      try {
        await ligarConta(qc, cliente.id, { conector: conta.conector, contaId: conta.contaId })
        ligadas += 1
      } catch {
        falhas.push(conta.nome)
      }
    }
    setLigandoSugestoes(false)
    const texto = `${NUM.format(ligadas)} ${ligadas === 1 ? 'conta ligada' : 'contas ligadas'} pela sugestão.`
    if (falhas.length === 0) avisar(texto, { tipo: 'sucesso' })
    else avisar(texto, { tipo: 'aviso', descricao: `Não deu para ligar: ${falhas.slice(0, 3).join(', ')}${falhas.length > 3 ? ` e mais ${falhas.length - 3}` : ''}.` })
  }

  return (
    <div className="cad-secao">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h2 className="cad-titulo">Resultados (Windsor)</h2>
          <p className="cad-subtitulo">As contas de Meta Ads, Google Ads e GA4 que a Windsor lê e o cliente de cada uma. Ligue cada conta ao seu cliente aqui ou na página do cliente.</p>
        </div>
        {admin && dados?.estado !== 'sem_chave' && (
          <Botao variante="secundario" icone={RefreshCw} carregando={recarregando} onClick={() => void recarregar()}>Recarregar lista</Botao>
        )}
      </header>

      {lista.isPending ? <Painel><div className="cad-painel-corpo"><EsqueletoLinhas linhas={6} /></div></Painel> : lista.isError ? (
        <EstadoVazio titulo="Não foi possível carregar as contas da Windsor." texto={lista.error.mensagem}
          acoes={<Botao variante="secundario" onClick={() => void lista.refetch()}>Tentar de novo</Botao>} />
      ) : dados!.estado === 'sem_chave' ? (
        <EstadoVazio icone={BarChart3} titulo="A integração com a Windsor não está configurada."
          texto={admin ? 'Defina WINDSOR_API_KEY no EasyPanel.' : 'Fale com o admin para configurar a chave da Windsor.'} />
      ) : (
        <>
          {dados!.estado === 'chave_invalida' && (
            <Faixa tom="perigo">A chave da Windsor foi recusada e a lista não veio. {admin ? 'Confira WINDSOR_API_KEY no EasyPanel.' : 'Avise o admin.'}</Faixa>
          )}
          {dados!.estado !== 'ok' && dados!.estado !== 'chave_invalida' && (
            <Faixa tom="info">A Windsor não respondeu: a lista pode estar desatualizada. Contas que faltarem podem ser ligadas pelo id, na página do cliente.</Faixa>
          )}
          <dl className="res-estado">
            <div><dt>Chave</dt><dd>configurada</dd></div>
            <div><dt>Uso de hoje</dt><dd>{NUM.format(dados!.uso.hoje)} de {NUM.format(dados!.uso.tetoDia)} chamadas</dd></div>
            <div><dt>Lista</dt><dd>{dados!.atualizadaEm ? `buscada em ${textoHora(dados!.atualizadaEm, hojeLocal())}` : 'ainda não buscada por inteiro'} · vale 24 h</dd></div>
            <div><dt>Contas</dt><dd>{NUM.format(total)} {total === 1 ? 'conta' : 'contas'} · {NUM.format(total - sem)} {total - sem === 1 ? 'ligada' : 'ligadas'} · {NUM.format(sem)} sem cliente</dd></div>
          </dl>

          <div className="res-lista-filtros">
            <Campo rotulo="Buscar" rotuloOculto icone={Search} value={busca} placeholder="Buscar pela conta, id ou sigla" tamanho="p"
              classeGrupo="res-busca" onChange={(e) => setBusca(e.target.value)} sufixo={<LimparBusca texto={busca} aoLimpar={() => setBusca('')} />} />
            <Checkbox checked={semCliente} onChange={(e) => setSemCliente(e.target.checked)}>Só as sem cliente</Checkbox>
            {sugestoes.length > 1 && (
              <Botao className="res-ligar-sugestoes" variante="secundario" tamanho="p" icone={Link2} carregando={ligandoSugestoes}
                dica="Liga cada conta sem cliente ao cliente sugerido pelo nome dela (o mesmo da linha)." onClick={() => void ligarSugestoes()}>
                Ligar as <span className="tabular">{NUM.format(sugestoes.length)}</span> sugestões
              </Botao>
            )}
          </div>
          {editaveis.length === 0 && <Faixa tom="info">Você não edita nenhum cliente: só o atendimento do cliente e o admin ligam contas.</Faixa>}

          {visiveis.length === 0 ? (
            <EstadoVazio tamanho="p" titulo={termo ? textoNadaEncontrado(busca) : semCliente ? 'Todas as contas já têm cliente.' : 'Nenhuma conta na lista da Windsor.'} />
          ) : CONECTORES_WINDSOR.map((conector) => {
            const doCanal = visiveis.filter((c) => c.conector === conector)
            if (doCanal.length === 0) return null
            return (
              <Painel key={conector} titulo={`${ROTULO_CONECTOR[conector]} · ${doCanal.length}`} id={`res-windsor-${conector}`}>
                <ul className="res-contas">
                  {doCanal.map((c) => <LinhaConta key={`${c.conector}:${c.contaId}`} conta={c} editaveis={editaveis} />)}
                </ul>
              </Painel>
            )
          })}
        </>
      )}
    </div>
  )
}
