/**
 * /clientes/:sigla (F5; PLANO §3): cabeçalho com o logo (upload), o AM e o "Completar cadastro"; contatos, pasta de
 * saída, links e responsáveis por equipe; abas Demandas, Aprovações, Horas (atendimento e admin) e Configurações.
 * O cliente vem de useClienteDetalhe (chave ['cliente', sigla]); o tempo real mantém o cache.
 */
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, Building2 } from 'lucide-react'
import { pode } from '@shared/logica/permissoes.ts'
import { useEu } from '../../api/auth.ts'
import { useClienteDetalhe } from '../../api/clientes.ts'
import { useClientes, useUsuarios } from '../../api/seletores.ts'
import { nomeCurto, Pilula } from '../../funcionalidades/cadastros/comum.tsx'
import { useTituloAba } from '../../lib/app.ts'
import { Abas, painelAba } from '../../ui/Abas.tsx'
import { Avatar } from '../../ui/Avatar.tsx'
import { Botao, propsBotao } from '../../ui/Botao.tsx'
import { Esqueleto, EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import { AbaAprovacoes, AbaConfiguracoes, AbaDemandas, AbaHoras } from './cliente-abas.tsx'
import { CompletarCadastro, Contatos, Links, LogoCliente, Responsaveis } from './cliente-cadastro.tsx'
import { ROTULO_STATUS } from './comum-clientes.tsx'

type Aba = 'demandas' | 'aprovacoes' | 'horas' | 'configuracoes'

export default function TelaCliente() {
  const { sigla = '' } = useParams()
  const eu = useEu()
  const clientes = useClientes()
  const usuarios = useUsuarios()
  const [params, setParams] = useSearchParams()
  const resumo = clientes.find((c) => c.sigla === sigla.toUpperCase())
  const detalhe = useClienteDetalhe(resumo?.id ?? null)
  const [novoContato, setNovoContato] = useState(false)
  useTituloAba(resumo ? `${resumo.sigla} · ${resumo.nome}` : 'Cliente')

  const gestao = eu.usuario.papel !== 'equipe'
  const admin = eu.usuario.papel === 'admin'
  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'demandas', rotulo: 'Demandas' }, { id: 'aprovacoes', rotulo: 'Aprovações' },
    ...(gestao ? [{ id: 'horas' as const, rotulo: 'Horas' }] : []), { id: 'configuracoes', rotulo: 'Configurações' },
  ]
  const pedida = params.get('aba') as Aba | null
  const aba: Aba = abas.some((a) => a.id === pedida) ? pedida! : 'demandas'
  const mudarAba = (a: Aba) => setParams((p) => { const n = new URLSearchParams(p); if (a === 'demandas') n.delete('aba'); else n.set('aba', a); return n }, { replace: true })

  if (!resumo) {
    return (
      <div className="cad-pagina">
        <EstadoVazio icone={Building2} como="h1" titulo="Cliente não encontrado." texto={`Não há cliente com a sigla ${sigla.toUpperCase()}.`}
          acoes={<Link {...propsBotao({ variante: 'secundario' })} to="/clientes">Ver os clientes</Link>} />
      </div>
    )
  }
  if (detalhe.isError) {
    return (
      <div className="cad-pagina">
        <EstadoVazio como="h1" titulo="Não foi possível abrir o cliente." texto={detalhe.error.mensagem}
          acoes={<Botao variante="secundario" onClick={() => void detalhe.refetch()}>Tentar de novo</Botao>} />
      </div>
    )
  }
  const c = detalhe.data
  if (!c) {
    return (
      <div className="cad-pagina" aria-busy="true">
        <div className="cad-cliente-topo"><Esqueleto largura={72} altura={72} raio={14} /><div className="flex-1"><EsqueletoLinhas linhas={2} /></div></div>
        <EsqueletoLinhas linhas={6} />
      </div>
    )
  }

  const podeEditar = pode('cliente.editar', { id: eu.usuario.id, papel: eu.usuario.papel }, { cliente: c })
  const am = c.atendimentoId ? usuarios.find((u) => u.id === c.atendimentoId) : undefined
  const pai = c.paiId ? clientes.find((x) => x.id === c.paiId) : undefined

  return (
    <div className="cad-pagina">
      <Link to="/clientes" className="inline-flex items-center gap-1 text-meta text-fg-2 hover:text-fg"><ArrowLeft width={14} height={14} aria-hidden="true" />Clientes</Link>
      <header className="cad-cliente-topo">
        <LogoCliente cliente={c} podeEditar={podeEditar} />
        <div className="cad-cliente-titulos">
          <h1 className="cad-titulo">{c.nome}</h1>
          <div className="cad-linha-meta">
            <span>{c.sigla}</span>
            <span>{ROTULO_STATUS[c.status]}</span>
            {c.nivel && <span>nível {c.nivel}</span>}
            {pai && <span>grupo <Link to={`/clientes/${encodeURIComponent(pai.sigla)}`} className="underline underline-offset-2">{pai.nome}</Link></span>}
            <span>{c.rodadasInclusas === 1 ? '1 rodada inclusa' : `${c.rodadasInclusas} rodadas inclusas`}</span>
          </div>
          <div className="cad-linha-meta">
            {am ? <span className="cad-pessoa"><Avatar pessoa={am} tamanho={20} />AM: {nomeCurto(am)}</span> : <Pilula tom="aviso">Sem AM</Pilula>}
            {c.pendencias.length === 0 && <Pilula tom="sucesso">Cadastro completo</Pilula>}
          </div>
        </div>
      </header>

      <CompletarCadastro cliente={c} podeEditar={podeEditar} aoNovoContato={() => setNovoContato(true)} />
      {c.observacoes && <p className="cad-texto-2 whitespace-pre-line">{c.observacoes}</p>}

      <div className="cad-cliente-grade">
        <Contatos cliente={c} podeEditar={podeEditar} novo={novoContato} setNovo={setNovoContato} />
        <div className="cad-secao">
          <Responsaveis cliente={c} podeEditar={podeEditar} />
          <Links cliente={c} podeEditar={podeEditar} />
        </div>
      </div>

      <Abas rotulo="Seções do cliente" variante="linha" idBase="cad-cliente" ativa={aba} aoMudar={mudarAba}
        abas={abas.map((a) => ({ ...a, contador: a.id === 'demandas' ? c.contadores.abertas : undefined }))} />
      <div {...painelAba('cad-cliente', aba, aba)}>
        {aba === 'demandas' && <AbaDemandas cliente={c} />}
        {aba === 'aprovacoes' && <AbaAprovacoes cliente={c} />}
        {aba === 'horas' && gestao && <AbaHoras cliente={c} admin={admin} />}
        {aba === 'configuracoes' && <AbaConfiguracoes key={`${c.id}:${c.atualizadoEm}`} cliente={c} podeEditar={podeEditar} />}
      </div>
    </div>
  )
}
