/**
 * Horas (F3; dados do núcleo, GET /api/apontamentos, API §4.20):
 * - todos: as minhas horas da semana (seg a dom) com o total por dia, editar e excluir ("Excluído · Desfazer") e
 *   [Lançar tempo] (escolher a demanda e abrir o diálogo `lancar-tempo` do modal);
 * - atendimento e admin: o total por cliente no mês, de todas as pessoas;
 * - admin: o total por pessoa no mês e as horas de qualquer pessoa (o seletor "Horas de").
 * Ninguém além do admin vê as horas individuais de outra pessoa. A semana e a pessoa ficam na URL.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Clock3, PenLine, Pencil, Plus, Timer, Trash2 } from 'lucide-react'
import type { Apontamento, Bootstrap, DataLocal, Demanda, Id } from '@shared/tipos/index.ts'
import { formatarDuracao } from '@shared/logica/paineis.ts'
import { pode } from '@shared/logica/permissoes.ts'
import { useEu } from '../../api/auth.ts'
import { useApontamentos, useEditarApontamento } from '../../api/horas.ts'
import { useClientes, useDemandas, useDoBootstrap, useQuadros, useUsuarios } from '../../api/seletores.ts'
import { EditarApontamento } from '../../funcionalidades/paineis/EditarApontamento.tsx'
import { LancarTempo } from '../../funcionalidades/paineis/LancarTempo.tsx'
import { diasDaSemanaDe, lancamentosDoDia, mesDe, totaisPorDia } from '../../funcionalidades/paineis/logica.ts'
import { useTituloAba } from '../../lib/app.ts'
import { DIAS_CURTOS, DIAS_LONGOS, MESES, diaDaSemana, ehDataLocal, hojeLocal, somarDias, somarMeses } from '../../lib/datas.ts'
import { useAgora } from '../../quadro/estado.ts'
import { useAbrirSobreposta } from '../../sessao/sobreposta.tsx'
import { Avatar } from '../../ui/Avatar.tsx'
import { Botao, BotaoIcone } from '../../ui/Botao.tsx'
import { Selecao } from '../../ui/Campo.tsx'
import { ChipCliente } from '../../ui/Chips.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import '../../funcionalidades/paineis/paineis.css'

const selCronometro = (b: Bootstrap) => b.eu.cronometro?.id ?? null

/** "seg, 12/10". */
function diaCurto(d: DataLocal): string {
  return `${DIAS_CURTOS[diaDaSemana(d)]}, ${d.slice(8)}/${d.slice(5, 7)}`
}

function Semana({ dias, totais, hoje }: { dias: DataLocal[]; totais: Map<DataLocal, number>; hoje: DataLocal }) {
  const maior = Math.max(60, ...dias.map((d) => totais.get(d) ?? 0))
  return (
    <ol className="pnl-semana" aria-label="Total por dia">
      {dias.map((d, i) => {
        const min = totais.get(d) ?? 0
        return (
          <li key={d} className="pnl-semana-dia" data-hoje={d === hoje || undefined} data-fim={i >= 5 || undefined} data-vazio={min === 0 || undefined}>
            <span className="pnl-semana-nome" aria-hidden="true"><span>{DIAS_CURTOS[i]}</span> <span className="tabular">{d.slice(8)}</span></span>
            <span className="pnl-semana-total tabular" aria-hidden="true">{min > 0 ? formatarDuracao(min) : '—'}</span>
            <span className="pnl-semana-barra" aria-hidden="true"><span style={{ width: `${Math.round((min / maior) * 100)}%` }} /></span>
            <span className="sr-only">{DIAS_LONGOS[i]}: {min > 0 ? formatarDuracao(min) : 'nada lançado'}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Lancamento({ a, d, podeEditar, agora }: { a: Apontamento; d: Demanda | undefined; podeEditar: boolean; agora: Date }) {
  const { excluir } = useEditarApontamento()
  const abrir = useAbrirSobreposta()
  const clientes = useClientes()
  const quadros = useQuadros()
  const [editando, setEditando] = useState(false)
  const lapis = useRef<HTMLButtonElement>(null)
  const ligado = a.minutos === null
  const cliente = (a.clienteId ? clientes.find((c) => c.id === a.clienteId) : null) ?? null
  const quadro = d ? quadros.find((q) => q.id === d.quadroId) : undefined
  const correndo = ligado && a.iniciadoEm ? Math.max(1, Math.round((agora.getTime() - Date.parse(a.iniciadoEm)) / 60_000)) : 0
  const Origem = ligado || a.origem === 'cronometro' ? Timer : PenLine
  return (
    <li className="pnl-lanc" data-ligado={ligado || undefined}>
      <span className="pnl-lanc-tempo tabular">
        {ligado ? <><span className="pnl-pulso" aria-hidden="true" />{formatarDuracao(correndo)}</> : formatarDuracao(a.minutos!)}
      </span>
      <span className="pnl-lanc-corpo">
        {d ? (
          <a href={`/d/${d.numero}`} className="pnl-lanc-titulo" onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); abrir(`/d/${d.numero}`) }}>
            <span className="pnl-lanc-numero">#{d.numero}</span> {d.titulo}
          </a>
        ) : <span className="pnl-lanc-titulo">Demanda removida</span>}
        <span className="pnl-lanc-meta">
          {cliente && <ChipCliente cliente={cliente} />}
          {quadro && <span className="pnl-lanc-quadro" data-cor={quadro.cor}><span className="casca-ponto" aria-hidden="true" />{quadro.nome}</span>}
          <span className="pnl-lanc-origem"><Origem aria-hidden="true" />{ligado ? 'cronômetro ligado' : a.origem === 'cronometro' ? 'cronômetro' : 'lançado'}</span>
        </span>
        {a.nota && <span className="pnl-lanc-nota">{a.nota}</span>}
      </span>
      {podeEditar && !ligado && (
        <span className="pnl-lanc-acoes">
          <BotaoIcone ref={lapis} icone={Pencil} rotulo="Editar" tamanho="p" onClick={() => setEditando(true)} aria-expanded={editando} />
          <BotaoIcone icone={Trash2} rotulo="Excluir" tamanho="p" onClick={() => void excluir(a)} />
        </span>
      )}
      {editando && <EditarApontamento a={a} ancora={lapis.current} fechar={() => setEditando(false)} />}
    </li>
  )
}

function Totais({ titulo, linhas, total }: { titulo: string; linhas: { id: string; rotulo: ReactNode; minutos: number }[]; total: number }) {
  const maior = Math.max(1, ...linhas.map((l) => l.minutos))
  return (
    <section className="pnl-secao pnl-secao-lateral" aria-label={titulo}>
      <div className="pnl-secao-topo">
        <h2 className="pnl-secao-titulo">{titulo}</h2>
        {total > 0 && <span className="pnl-secao-conta tabular">{formatarDuracao(total)}</span>}
      </div>
      {linhas.length === 0 ? <p className="pnl-secao-vazia">Nada lançado neste mês.</p> : (
        <ul className="pnl-totais">
          {linhas.map((l) => (
            <li key={l.id} className="pnl-total">
              <span className="pnl-total-nome">{l.rotulo}</span>
              <span className="pnl-total-min tabular">{formatarDuracao(l.minutos)}</span>
              <span className="pnl-total-barra" aria-hidden="true"><span style={{ width: `${Math.round((l.minutos / maior) * 100)}%` }} /></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function TelaHoras() {
  useTituloAba('Horas')
  const eu = useEu()
  const qc = useQueryClient()
  const agora = useAgora()
  const [params, setParams] = useSearchParams()
  const demandas = useDemandas()
  const usuarios = useUsuarios()
  const clientes = useClientes()
  const admin = eu.usuario.papel === 'admin'
  const veClientes = admin || eu.usuario.papel === 'atendimento'
  const hoje = hojeLocal(agora)
  const semanaUrl = params.get('semana')
  const dia = semanaUrl && ehDataLocal(semanaUrl) ? semanaUrl : hoje
  const dias = diasDaSemanaDe(dia)
  const pessoaUrl = params.get('pessoa')
  const pessoaId: Id = admin && pessoaUrl && usuarios.some((u) => u.id === pessoaUrl) ? pessoaUrl : eu.usuario.id
  const minhas = pessoaId === eu.usuario.id
  const pessoa = usuarios.find((u) => u.id === pessoaId)
  const mesBase = params.get('mes') && ehDataLocal(`${params.get('mes')}-01`) ? `${params.get('mes')}-01` : `${dias[0]!.slice(0, 7)}-01`
  const mes = mesDe(mesBase)
  const [lancando, setLancando] = useState(false)
  const botaoLancar = useRef<HTMLButtonElement>(null)

  const consultaSemana = { usuarioId: pessoaId, de: dias[0], ate: dias[6] }
  const semana = useApontamentos(consultaSemana)
  // os totais do mês só para atendimento e admin (a equipe não busca)
  const doMes = useApontamentos({ usuarioId: eu.usuario.id, de: mes.de, ate: mes.ate }, { enabled: veClientes })

  // o cronômetro ligado ou parado nesta janela (topo, T no card) muda a lista: o próprio eco não chega pelo tempo real
  const cronometro = useDoBootstrap(selCronometro)
  const visto = useRef(cronometro)
  useEffect(() => {
    if (visto.current === cronometro) return
    visto.current = cronometro
    void qc.invalidateQueries({ queryKey: ['apontamentos'] })
  }, [cronometro, qc])

  const mudar = (fn: (p: URLSearchParams) => void) => setParams((atual) => { const p = new URLSearchParams(atual); fn(p); return p }, { replace: true })
  const irSemana = (d: DataLocal) => mudar((p) => { if (diasDaSemanaDe(d)[0] === diasDaSemanaDe(hoje)[0]) p.delete('semana'); else p.set('semana', d) })

  const itens = semana.data?.itens ?? []
  const porDemanda = useMemo(() => {
    const m = new Map<Id, Demanda>(demandas.map((d) => [d.id, d]))
    for (const d of semana.data?.extras ?? []) m.set(d.id, d)
    return m
  }, [demandas, semana.data])
  const totais = totaisPorDia(itens)
  const totalSemana = itens.reduce((s, a) => s + (a.minutos ?? 0), 0)
  const diasComItens = dias.filter((d) => itens.some((a) => a.data === d)).reverse()
  const nomeMes = `${MESES[Number(mes.de.slice(5, 7)) - 1]} de ${mes.de.slice(0, 4)}`

  const porCliente = (doMes.data?.porCliente ?? []).map((l) => {
    const c = l.clienteId ? clientes.find((x) => x.id === l.clienteId) : null
    return { id: l.clienteId ?? 'sem', rotulo: c ? <><ChipCliente cliente={c} /> <span className="pnl-total-detalhe">{c.nome}</span></> : <span className="pnl-total-detalhe">Sem cliente</span>, minutos: l.minutos }
  })
  const porPessoa = (doMes.data?.porPessoa ?? []).map((l) => {
    const u = usuarios.find((x) => x.id === l.usuarioId)
    return { id: l.usuarioId, rotulo: u ? <><Avatar pessoa={u} tamanho={20} dica={false} /> <span>{u.apelido ?? u.nome}</span></> : 'Pessoa removida', minutos: l.minutos }
  })

  const inicio = dias[0]!
  const fim = dias[6]!
  const tituloSemana = inicio.slice(5, 7) === fim.slice(5, 7)
    ? `${Number(inicio.slice(8))} a ${Number(fim.slice(8))} de ${MESES[Number(fim.slice(5, 7)) - 1]}`
    : `${Number(inicio.slice(8))} de ${MESES[Number(inicio.slice(5, 7)) - 1]} a ${Number(fim.slice(8))} de ${MESES[Number(fim.slice(5, 7)) - 1]}`

  return (
    <div className="pnl-horas">
      <header className="pnl-horas-topo">
        <div className="pnl-horas-titulos">
          <h1 className="pnl-agenda-titulo">Horas</h1>
          <p className="pnl-horas-sub">{minhas ? 'As suas horas da semana' : `As horas de ${pessoa?.apelido ?? pessoa?.nome ?? 'outra pessoa'}`}</p>
        </div>
        <div className="pnl-horas-acoes">
          {admin && (
            <Selecao rotulo="Horas de" rotuloOculto tamanho="p" value={pessoaId} className="pnl-horas-pessoa"
              onChange={(e) => mudar((p) => { if (e.target.value === eu.usuario.id) p.delete('pessoa'); else p.set('pessoa', e.target.value) })}
              opcoes={[{ valor: eu.usuario.id, rotulo: 'Minhas horas' },
                ...usuarios.filter((u) => u.ativo && u.id !== eu.usuario.id).map((u) => ({ valor: u.id, rotulo: u.apelido ? `${u.apelido} (${u.nome})` : u.nome }))]} />
          )}
          {minhas && (
            <Botao ref={botaoLancar} tamanho="p" icone={Plus} aria-haspopup="dialog" aria-expanded={lancando} onClick={() => setLancando((v) => !v)}>
              Lançar tempo
            </Botao>
          )}
        </div>
      </header>
      {lancando && <LancarTempo ancora={botaoLancar.current} fechar={() => setLancando(false)} />}

      <div className="pnl-horas-grade" data-com-lateral={veClientes || undefined}>
        <section className="pnl-secao" aria-labelledby="pnl-semana-titulo">
          <div className="pnl-periodo">
            <BotaoIcone icone={ChevronLeft} rotulo="Semana anterior" onClick={() => irSemana(somarDias(inicio, -7))} />
            <h2 className="pnl-periodo-titulo" id="pnl-semana-titulo" aria-live="polite">{tituloSemana}</h2>
            <BotaoIcone icone={ChevronRight} rotulo="Próxima semana" onClick={() => irSemana(somarDias(inicio, 7))} />
            {!dias.includes(hoje) && <Botao variante="secundario" tamanho="p" onClick={() => irSemana(hoje)}>Esta semana</Botao>}
            <span className="pnl-periodo-total">Total <strong className="tabular">{formatarDuracao(totalSemana)}</strong></span>
          </div>
          <Semana dias={dias} totais={totais} hoje={hoje} />
          {semana.isPending ? <EsqueletoLinhas linhas={4} /> : semana.isError ? (
            <EstadoVazio icone={Clock3} tamanho="p" titulo="Não foi possível carregar as horas."
              acoes={<Botao tamanho="p" onClick={() => void semana.refetch()}>Tentar de novo</Botao>} />
          ) : itens.length === 0 ? (
            <div className="pnl-vazio">
              <EstadoVazio icone={Clock3} tamanho="p" titulo="Nenhuma hora nesta semana."
                texto={minhas ? <>Ligue o cronômetro (<kbd className="pnl-kbd">T</kbd>) num card ou</> : undefined}
                acoes={minhas ? <Botao tamanho="p" icone={Plus} onClick={() => setLancando(true)}>Lançar tempo</Botao> : undefined} />
            </div>
          ) : (
            <div className="pnl-dias">
              {diasComItens.map((d) => (
                <section key={d} className="pnl-dia" aria-label={diaCurto(d)}>
                  <h3 className="pnl-dia-titulo">
                    <span>{d === hoje ? 'Hoje' : d === somarDias(hoje, -1) ? 'Ontem' : diaCurto(d)}</span>
                    <span className="pnl-dia-total tabular">{formatarDuracao(totais.get(d) ?? 0)}</span>
                  </h3>
                  <ul className="pnl-lancs">
                    {lancamentosDoDia(itens, d).map((a) => (
                      <Lancamento key={a.id} a={a} d={porDemanda.get(a.demandaId)} agora={agora}
                        podeEditar={pode('apontamento.editar', { id: eu.usuario.id, papel: eu.usuario.papel }, { apontamento: a })} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>

        {veClientes && (
          <div className="pnl-horas-lateral">
            <div className="pnl-periodo pnl-periodo-mes">
              <BotaoIcone icone={ChevronLeft} rotulo="Mês anterior" tamanho="p" onClick={() => mudar((p) => p.set('mes', somarMeses(mes.de, -1).slice(0, 7)))} />
              <span className="pnl-periodo-mes-nome">{nomeMes}</span>
              <BotaoIcone icone={ChevronRight} rotulo="Próximo mês" tamanho="p" onClick={() => mudar((p) => p.set('mes', somarMeses(mes.de, 1).slice(0, 7)))} />
            </div>
            <Totais titulo="Por cliente no mês" linhas={porCliente} total={porCliente.reduce((s, l) => s + l.minutos, 0)} />
            {admin && <Totais titulo="Por pessoa no mês" linhas={porPessoa} total={porPessoa.reduce((s, l) => s + l.minutos, 0)} />}
          </div>
        )}
      </div>
    </div>
  )
}
