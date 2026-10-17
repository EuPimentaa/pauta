/**
 * /clientes (F5; PLANO §3): a lista com os contadores (abertas, com o cliente, atrasadas), o AM e os responsáveis por
 * equipe, e o "Completar cadastro" para quem pode editar. "Cadastrar cliente" abre o diálogo `criar-cliente` e leva
 * à página do cliente para completar.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Building2, ClipboardList, Plus, Search } from 'lucide-react'
import { STATUS_CLIENTE } from '@shared/tipos/index.ts'
import { pode } from '@shared/logica/permissoes.ts'
import { useEu } from '../../api/auth.ts'
import { useEquipes, useUsuarios } from '../../api/seletores.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { useListaClientes } from '../../funcionalidades/cadastros/api.ts'
import { Faixa, LimparBusca, nomeCurto, Painel, Pilula, textoNadaEncontrado } from '../../funcionalidades/cadastros/comum.tsx'
import { useTituloAba } from '../../lib/app.ts'
import { Avatar, PilhaAvatares } from '../../ui/Avatar.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo, Selecao } from '../../ui/Campo.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import { ROTULO_STATUS, SiglaCliente } from './comum-clientes.tsx'

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

function Numero({ valor, rotulo, perigo }: { valor: number; rotulo: string; perigo?: boolean }) {
  return (
    <span className="cad-numero" data-zero={valor === 0 ? '' : undefined} data-tom={perigo && valor > 0 ? 'perigo' : undefined}>
      <span className="cad-numero-rotulo">{rotulo}</span>
      <span aria-label={`${valor} ${rotulo.toLowerCase()}`}>{valor}</span>
    </span>
  )
}

export default function TelaClientes() {
  useTituloAba('Clientes')
  const eu = useEu()
  const navegar = useNavigate()
  const abrirDialogo = useAbrirDialogo()
  const usuarios = useUsuarios()
  const equipes = useEquipes()
  const consulta = useListaClientes()
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const filtro = params.get('filtro') ?? 'ativos'
  const quem = { id: eu.usuario.id, papel: eu.usuario.papel }
  const gestao = eu.usuario.papel !== 'equipe'
  const mudarFiltro = (f: string) => setParams((p) => { const n = new URLSearchParams(p); if (f === 'ativos') n.delete('filtro'); else n.set('filtro', f); return n }, { replace: true })

  const todos = consulta.data ?? []
  const completar = todos.filter((c) => c.status !== 'ex' && c.pendencias.length > 0 && pode('cliente.editar', quem, { cliente: c }))
  const termo = normalizar(busca)
  const lista = useMemo(() => todos.filter((c) => {
    if (filtro === 'ativos' && c.status === 'ex') return false
    if (filtro === 'completar' && !completar.includes(c)) return false
    if (filtro === 'meus' && c.atendimentoId !== eu.usuario.id) return false
    if ((STATUS_CLIENTE as readonly string[]).includes(filtro) && c.status !== filtro) return false
    return !termo || normalizar(`${c.sigla} ${c.nome} ${c.apelidos.join(' ')}`).includes(termo)
  }), [todos, filtro, termo, completar, eu.usuario.id])

  async function cadastrar() {
    const r = await abrirDialogo('criar-cliente', {})
    if (r) navegar(`/clientes/${encodeURIComponent(r.cliente.sigla)}`)
  }

  const opcoes = [
    { valor: 'ativos', rotulo: 'Todos menos ex-clientes' },
    ...(gestao ? [{ valor: 'completar', rotulo: `Completar cadastro (${completar.length})` }] : []),
    ...(eu.usuario.papel === 'atendimento' ? [{ valor: 'meus', rotulo: 'Só os meus' }] : []),
    ...STATUS_CLIENTE.map((s) => ({ valor: s, rotulo: ROTULO_STATUS[s] })),
    { valor: 'todos', rotulo: 'Todos' },
  ]

  return (
    <div className="cad-pagina">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h1 className="cad-titulo">Clientes</h1>
          <p className="cad-subtitulo">{todos.length === 0 ? 'Sigla, nome, AM e o contato que aprova.' : `${todos.filter((c) => c.status !== 'ex').length} clientes ativos.`}</p>
        </div>
        <Botao variante="secundario" icone={Plus} onClick={() => void cadastrar()}>Cadastrar cliente</Botao>
      </header>

      {gestao && completar.length > 0 && filtro !== 'completar' && (
        <Faixa icone={ClipboardList} acoes={<Botao tamanho="p" variante="secundario" onClick={() => mudarFiltro('completar')}>Ver quais</Botao>}>
          {completar.length === 1 ? '1 cliente precisa completar o cadastro' : `${completar.length} clientes precisam completar o cadastro`} (AM ou contato que aprova).
        </Faixa>
      )}

      {todos.length > 0 && (
        <div className="cad-filtros">
          <Campo classeGrupo="cad-filtro-busca" rotulo="Buscar cliente" rotuloOculto icone={Search} type="search" placeholder="Sigla, nome ou apelido"
            value={busca} onChange={(e) => setBusca(e.target.value)} sufixo={<LimparBusca texto={busca} aoLimpar={() => setBusca('')} />} />
          <Selecao rotulo="Mostrar" rotuloOculto value={filtro} opcoes={opcoes} onChange={(e) => mudarFiltro(e.target.value)} />
        </div>
      )}

      <Painel>
        {consulta.isPending ? (
          <div className="cad-painel-corpo"><EsqueletoLinhas linhas={6} /></div>
        ) : consulta.isError ? (
          <EstadoVazio titulo="Não foi possível carregar os clientes." texto={consulta.error.mensagem}
            acoes={<Botao variante="secundario" onClick={() => void consulta.refetch()}>Tentar de novo</Botao>} />
        ) : todos.length === 0 ? (
          <EstadoVazio icone={Building2} como="h2" titulo="Nenhum cliente cadastrado."
            texto="Comece pelos recorrentes. Também dá para criar na hora, ao abrir uma demanda."
            acoes={<Botao variante="secundario" icone={Plus} onClick={() => void cadastrar()}>Cadastrar cliente</Botao>} />
        ) : lista.length === 0 ? (
          busca.trim() ? (
            <EstadoVazio icone={Search} tamanho="p" titulo={textoNadaEncontrado(busca)}
              acoes={<Botao variante="secundario" onClick={() => setBusca('')}>Limpar busca</Botao>} />
          ) : (
            <EstadoVazio icone={Search} tamanho="p" titulo="Nenhum cliente com este filtro."
              acoes={<Botao variante="secundario" onClick={() => mudarFiltro('ativos')}>Limpar filtro</Botao>} />
          )
        ) : (
          <div className="cad-tabela">
            <div className="cad-tabela-cabeca" aria-hidden="true">
              <span>Cliente</span><span>Atendimento</span><span>Responsáveis</span>
              <span>Abertas</span><span>Com o cliente</span><span>Atrasadas</span>
            </div>
            {lista.map((c) => {
              const am = c.atendimentoId ? usuarios.find((u) => u.id === c.atendimentoId) : undefined
              const responsaveis = c.responsaveis.map((r) => usuarios.find((u) => u.id === r.usuarioId)).filter((u) => !!u)
              const pendente = completar.includes(c)
              return (
                <Link key={c.id} to={`/clientes/${encodeURIComponent(c.sigla)}`} className="cad-cliente-linha">
                  <span className="cad-cliente-id">
                    <SiglaCliente c={c} />
                    <span className="cad-cliente-nomes">
                      <span className="cad-cliente-nome">{c.nome}</span>
                      <span className="cad-cliente-detalhe">
                        {c.logoUrl && <span>{c.sigla} ·</span>}
                        <span>{ROTULO_STATUS[c.status]}</span>
                        {c.nivel && <span>· nível {c.nivel}</span>}
                        {pendente && <Pilula tom="aviso">Completar cadastro</Pilula>}
                        {!pendente && c.pendencias.includes('sem_am') && <Pilula>Sem AM</Pilula>}
                      </span>
                    </span>
                  </span>
                  <span className="cad-cliente-am">
                    {am ? <span className="cad-pessoa"><Avatar pessoa={am} tamanho={22} dica={false} /><span>{nomeCurto(am)}</span></span> : <span className="cad-nota">Sem AM</span>}
                  </span>
                  <span className="cad-cliente-resp" title={c.responsaveis.map((r) => {
                    const u = usuarios.find((x) => x.id === r.usuarioId)
                    return `${equipes.find((e) => e.id === r.equipeId)?.nome ?? ''}: ${u ? nomeCurto(u) : '?'}`
                  }).join(' · ')}>
                    {responsaveis.length ? <PilhaAvatares pessoas={responsaveis} max={4} tamanho={22} /> : <span className="cad-nota">—</span>}
                  </span>
                  <span><Numero valor={c.contadores.abertas} rotulo="Abertas" /></span>
                  <span><Numero valor={c.contadores.comCliente} rotulo="Com o cliente" /></span>
                  <span><Numero valor={c.contadores.atrasadas} rotulo="Atrasadas" perigo /></span>
                </Link>
              )
            })}
          </div>
        )}
      </Painel>
    </div>
  )
}
