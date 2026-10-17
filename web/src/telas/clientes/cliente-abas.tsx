/**
 * Página do cliente, as abas (F5): Demandas (de todos os quadros, por quadro, com o CardDemanda), Aprovações (a
 * trilha), Horas (atendimento e admin: o total do mês; o admin vê por pessoa e os lançamentos) e Configurações (o
 * cadastro: nome, sigla, status, nível, cor, rodadas inclusas, grupo, observações e apelidos).
 */
import { useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, Check, ChevronLeft, ChevronRight, Clock3, PencilLine, Plus, ShieldAlert, X } from 'lucide-react'
import { CANAIS, CORES, STATUS_CLIENTE, type Cliente, type Cor, type Demanda, type StatusCliente } from '@shared/tipos/index.ts'
import { dataLocalDe, formatarPrazo, horaLocalDe } from '@shared/logica/datas.ts'
import { juntar } from '@shared/logica/modal-atividade.ts'
import { normalizarAlias } from '@shared/logica/texto.ts'
import { avisarErro } from '../../api/acoes.ts'
import { useEu } from '../../api/auth.ts'
import { useApontamentos } from '../../api/horas.ts'
import { useClientes, useDemandas, useQuadros, useUsuarios } from '../../api/seletores.ts'
import { definirApelidos, editarCliente, useTrilha } from '../../funcionalidades/cadastros/api.ts'
import { erroDoCampo, Faixa, mensagemGeral, nomeCurto, Painel, Pilula } from '../../funcionalidades/cadastros/comum.tsx'
import { MESES, hojeLocal } from '../../lib/datas.ts'
import { CardDemanda } from '../../quadro/index.ts'
import { Avatar } from '../../ui/Avatar.tsx'
import { avisar } from '../../ui/avisos.tsx'
import { Botao, BotaoIcone } from '../../ui/Botao.tsx'
import { AreaTexto, Campo, Selecao } from '../../ui/Campo.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import { SeletorCor } from '../../ui/SeletorCor.tsx'
import { TextoPuro } from '../../ui/Texto.tsx'
import { ROTULO_STATUS } from './comum-clientes.tsx'

// ─────────────────────────────── Demandas ───────────────────────────────

export function AbaDemandas({ cliente }: { cliente: Cliente }) {
  const demandas = useDemandas()
  const quadros = useQuadros()
  const doCliente = useMemo(() => demandas.filter((d) => d.clienteId === cliente.id), [demandas, cliente.id])
  // abertas por quadro (o número de cada grupo bate com "N abertas" e com o da aba); as concluídas que ainda estão nos
  // quadros vêm num grupo próprio no fim
  const grupos = useMemo(() => quadros
    .map((q) => ({ q, lista: doCliente.filter((d) => d.quadroId === q.id && !d.concluidaEm)
      .sort((a, b) => (a.prazo ?? '9').localeCompare(b.prazo ?? '9') || a.numero - b.numero) }))
    .filter((g) => g.lista.length > 0), [quadros, doCliente])
  const concluidas = useMemo(() => doCliente.filter((d) => d.concluidaEm)
    .sort((a, b) => b.concluidaEm!.localeCompare(a.concluidaEm!) || a.numero - b.numero), [doCliente])
  return (
    <div className="cad-secao">
      <p className="cad-texto-2">
        {cliente.contadores.abertas === 1 ? '1 aberta' : `${cliente.contadores.abertas} abertas`} · {cliente.contadores.comCliente} com o cliente ·{' '}
        {cliente.contadores.atrasadas === 1 ? '1 atrasada' : `${cliente.contadores.atrasadas} atrasadas`}.{' '}
        <Link to={`/arquivo?cliente=${encodeURIComponent(cliente.id)}`} className="underline underline-offset-2">Ver as do Arquivo</Link>
      </p>
      {grupos.length === 0 && concluidas.length === 0 ? (
        <EstadoVazio icone={Archive} tamanho="p" titulo="Nenhuma demanda deste cliente nos quadros."
          texto="As concluídas há mais tempo e as arquivadas estão no Arquivo." />
      ) : grupos.map(({ q, lista }) => (
        <section key={q.id} className="cad-grupo-quadro" aria-labelledby={`cad-gq-${q.id}`}>
          <h3 id={`cad-gq-${q.id}`} className="cad-grupo-quadro-titulo">
            <span className="cad-ponto" data-cor={q.cor} aria-hidden="true" />
            <Link to={`/q/${encodeURIComponent(q.slug)}`} className="hover:underline">{q.nome}</Link>
            <span className="cad-nota">{lista.length}</span>
          </h3>
          <div className="cad-cards">
            {lista.map((d: Demanda) => <CardDemanda key={d.id} demanda={d} />)}
          </div>
        </section>
      ))}
      {concluidas.length > 0 && (
        <section className="cad-grupo-quadro" aria-labelledby="cad-gq-concluidas">
          <h3 id="cad-gq-concluidas" className="cad-grupo-quadro-titulo">
            <Check aria-hidden="true" className="size-4" />
            <span>Concluídas ainda nos quadros</span>
            <span className="cad-nota">{concluidas.length}</span>
          </h3>
          <div className="cad-cards">
            {concluidas.map((d: Demanda) => <CardDemanda key={d.id} demanda={d} mostrarQuadro />)}
          </div>
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────── Aprovações ───────────────────────────────

const ROTULO_CANAL: Record<(typeof CANAIS)[number], string> = { whatsapp: 'WhatsApp', email: 'e-mail', reuniao: 'reunião', outro: 'outro canal' }
/** "sáb, 17/10 às 00:17" (o formato do resto do produto); de outro ano, com o ano: "17/10/2025 às 00:17". */
const dataHora = (i: string) => {
  const d = dataLocalDe(i)
  return d.slice(0, 4) === hojeLocal().slice(0, 4)
    ? `${formatarPrazo(d, null)} às ${horaLocalDe(i)}`
    : `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} às ${horaLocalDe(i)}`
}

/** Por que a decisão pelo link está marcada (API.md §4.17). */
const EXPLICA_REDE_INTERNA = 'A decisão veio da mesma conexão de internet que esta pessoa usou no app nas últimas 24 horas: '
  + 'pode ser alguém da agência decidindo pelo link no lugar do cliente, ou o cliente na rede da agência.'

export function AbaAprovacoes({ cliente }: { cliente: Cliente }) {
  const trilha = useTrilha(cliente.id)
  const usuarios = useUsuarios()
  const eu = useEu().usuario.id
  const nomeDe = (id: string) => {
    if (id === eu) return 'você'
    const u = usuarios.find((x) => x.id === id)
    return u ? nomeCurto(u) : 'alguém'
  }
  if (trilha.isPending) return <EsqueletoLinhas linhas={4} />
  if (trilha.isError) {
    return <EstadoVazio titulo="Não foi possível carregar a trilha." texto={trilha.error.mensagem}
      acoes={<Botao variante="secundario" onClick={() => void trilha.refetch()}>Tentar de novo</Botao>} />
  }
  if (trilha.data.length === 0) {
    return <EstadoVazio icone={Check} tamanho="p" titulo="Nenhuma decisão registrada ainda." texto="Aprovações e pedidos de ajuste, pelo link ou registrados pelo atendimento, ficam aqui." />
  }
  return (
    <Painel>
      <ol className="cad-lista" aria-label="Trilha de aprovações">
        {trilha.data.map((i) => (
          <li key={i.aprovacaoId} className="cad-trilha-item" data-anulada={i.anuladaEm ? '' : undefined}>
            <span className="cad-trilha-icone" data-decisao={i.decisao} aria-hidden="true">{i.decisao === 'aprovado' ? <Check /> : <PencilLine />}</span>
            <div className="cad-trilha-corpo">
              <span className="cad-trilha-cabeca">
                <span>{i.decisao === 'aprovado' ? 'Aprovou a' : 'Pediu ajuste na'} V{i.versaoNumero} de</span>
                <Link to={`/d/${i.demanda.numero}`} className="underline underline-offset-2">#{i.demanda.numero} {i.demanda.titulo}</Link>
                {i.anuladaEm && <Pilula tom="perigo">anulada</Pilula>}
                {i.redeInterna.length > 0 && (
                  <Pilula tom="aviso" icone={ShieldAlert} titulo={EXPLICA_REDE_INTERNA}>da mesma rede que {juntar(i.redeInterna.map(nomeDe))}</Pilula>
                )}
              </span>
              <span className="cad-linha-meta">
                <span>{i.quem}</span>
                <span>{i.via === 'link' ? 'pelo link' : `por ${i.canal ? ROTULO_CANAL[i.canal] : 'fora'}`}</span>
                {i.dispositivo && <span>{i.dispositivo}</span>}
                <span>{dataHora(i.criadoEm)}</span>
              </span>
              {i.comentario && <TextoPuro texto={i.comentario} linhas={4} />}
            </div>
          </li>
        ))}
      </ol>
    </Painel>
  )
}

// ─────────────────────────────── Horas ───────────────────────────────

const horas = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

function limitesMes(mes: string): { de: string; ate: string } {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  return { de: `${mes}-01`, ate: `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}` }
}

function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function AbaHoras({ cliente, admin }: { cliente: Cliente; admin: boolean }) {
  const [mes, setMes] = useState(hojeLocal().slice(0, 7))
  const consulta = useApontamentos({ clienteId: cliente.id, ...limitesMes(mes) })
  const usuarios = useUsuarios()
  const demandas = useDemandas()
  const total = consulta.data?.porCliente?.find((p) => p.clienteId === cliente.id)?.minutos ?? 0
  const [ano, m] = mes.split('-').map(Number) as [number, number]
  const demandaDe = (id: string) => demandas.find((d) => d.id === id) ?? consulta.data?.extras.find((d) => d.id === id)
  return (
    <div className="cad-secao">
      <div className="cad-acoes" role="group" aria-label="Mês">
        <BotaoIcone icone={ChevronLeft} rotulo="Mês anterior" variante="secundario" onClick={() => setMes((x) => somarMes(x, -1))} />
        <span className="cad-painel-titulo" aria-live="polite">{MESES[m - 1]} de {ano}</span>
        <BotaoIcone icone={ChevronRight} rotulo="Próximo mês" variante="secundario" onClick={() => setMes((x) => somarMes(x, 1))} />
      </div>
      {consulta.isPending ? <EsqueletoLinhas linhas={3} /> : consulta.isError ? (
        <EstadoVazio titulo="Não foi possível carregar as horas." texto={consulta.error.mensagem} />
      ) : (
        <>
          <p className="cad-horas-total"><Clock3 width={18} height={18} aria-hidden="true" /><strong>{horas(total)}</strong><span className="cad-texto-2">de todas as pessoas no mês</span></p>
          {admin && (consulta.data.porPessoa?.length ?? 0) > 0 && (
            <Painel titulo="Por pessoa" id="cad-horas-pessoa">
              <ul className="cad-lista">
                {consulta.data.porPessoa!.map((p) => {
                  const u = usuarios.find((x) => x.id === p.usuarioId)
                  return (
                    <li key={p.usuarioId} className="cad-linha">
                      {u && <Avatar pessoa={u} tamanho={24} />}
                      <span className="flex-1">{u ? u.nome : 'Pessoa removida'}</span>
                      <span className="tabular">{horas(p.minutos)}</span>
                    </li>
                  )
                })}
              </ul>
            </Painel>
          )}
          {admin && consulta.data.itens.length > 0 && (
            <Painel titulo="Lançamentos" id="cad-horas-itens">
              <ul className="cad-lista">
                {consulta.data.itens.map((a) => {
                  const u = usuarios.find((x) => x.id === a.usuarioId)
                  const d = demandaDe(a.demandaId)
                  return (
                    <li key={a.id} className="cad-linha">
                      <span className="cad-feriado-data">{a.data.slice(8, 10)}/{a.data.slice(5, 7)}</span>
                      <div className="cad-linha-principal">
                        <span className="cad-linha-nome">{d ? <Link to={`/d/${d.numero}`} className="hover:underline"><span>#{d.numero} {d.titulo}</span></Link> : <span>Demanda</span>}</span>
                        <span className="cad-linha-meta"><span>{u ? nomeCurto(u) : '—'}</span>{a.nota && <span>{a.nota}</span>}{a.minutos === null && <span>cronômetro ligado</span>}</span>
                      </div>
                      <span className="tabular">{a.minutos === null ? '—' : horas(a.minutos)}</span>
                    </li>
                  )
                })}
              </ul>
            </Painel>
          )}
          {total === 0 && <p className="cad-nota">Nenhuma hora lançada neste mês. As horas vêm do cronômetro e do "Lançar tempo" de cada demanda.</p>}
          {!admin && <p className="cad-nota">As horas de cada pessoa só o admin vê.</p>}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────── Configurações do cliente ───────────────────────────────

function Apelidos({ cliente, podeEditar }: { cliente: Cliente; podeEditar: boolean }) {
  const qc = useQueryClient()
  const [novo, setNovo] = useState('')
  const sigla = normalizarAlias(cliente.sigla)
  const manuais = cliente.apelidos.filter((a) => a !== sigla)
  async function salvar(lista: string[]) {
    try { await definirApelidos(qc, cliente, lista) } catch (e) { avisarErro(e, { titulo: 'Não foi possível salvar os apelidos.' }) }
  }
  return (
    <div className="cad-secao">
      <span className="ui-rotulo">Apelidos</span>
      <div className="flex flex-wrap items-center gap-2">
        <Pilula titulo="A sigla é sempre um apelido">{sigla}</Pilula>
        {manuais.map((a) => (
          <span key={a} className="cad-pilula">
            {a}
            {podeEditar && <button type="button" className="inline-grid place-items-center" aria-label={`Tirar o apelido ${a}`} onClick={() => void salvar(manuais.filter((x) => x !== a))}><X width={12} height={12} aria-hidden="true" /></button>}
          </span>
        ))}
      </div>
      {podeEditar && (
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (novo.trim()) { void salvar([...manuais, novo.trim()]); setNovo('') } }}>
          <Campo classeGrupo="flex-1" rotulo="Novo apelido" rotuloOculto tamanho="p" value={novo} maxLength={80} placeholder={`Ex.: ${normalizarAlias(cliente.nome).split(' ').slice(0, 2).join(' ') || sigla}`}
            onChange={(e) => setNovo(e.target.value)} />
          <Botao type="submit" tamanho="p" variante="secundario" icone={Plus} disabled={!novo.trim()}>Acrescentar</Botao>
        </form>
      )}
      <p className="cad-nota">Na criação rápida e no "Colar do WhatsApp", qualquer apelido acha o cliente (sem acento, sem caixa).</p>
    </div>
  )
}

export function AbaConfiguracoes({ cliente, podeEditar }: { cliente: Cliente; podeEditar: boolean }) {
  const qc = useQueryClient()
  const navegar = useNavigate()
  const idForm = useId()
  const clientes = useClientes()
  const [nome, setNome] = useState(cliente.nome)
  const [sigla, setSigla] = useState(cliente.sigla)
  const [status, setStatus] = useState<StatusCliente>(cliente.status)
  const [nivel, setNivel] = useState<string>(cliente.nivel ? String(cliente.nivel) : '')
  const [cor, setCor] = useState<Cor>(cliente.cor)
  const [rodadas, setRodadas] = useState(String(cliente.rodadasInclusas))
  const [paiId, setPaiId] = useState(cliente.paiId ?? '')
  const [obs, setObs] = useState(cliente.observacoes ?? '')
  const [erro, setErro] = useState<unknown>(null)
  const [salvando, setSalvando] = useState(false)
  const mudou = nome.trim() !== cliente.nome || sigla !== cliente.sigla || status !== cliente.status || nivel !== (cliente.nivel ? String(cliente.nivel) : '')
    || cor !== cliente.cor || Number(rodadas) !== cliente.rodadasInclusas || paiId !== (cliente.paiId ?? '') || obs.trim() !== (cliente.observacoes ?? '')

  async function salvar() {
    setErro(null)
    if (!nome.trim() || !sigla) return
    setSalvando(true)
    try {
      const novo = await editarCliente(qc, cliente, {
        nome: nome.trim(), sigla, status, nivel: nivel ? (Number(nivel) as 1 | 2 | 3) : null, cor,
        rodadasInclusas: Math.max(0, Math.min(20, Math.round(Number(rodadas) || 0))), paiId: paiId || null, observacoes: obs.trim() || null,
      })
      avisar('Cadastro salvo.', { tipo: 'sucesso', descricao: novo.sigla !== cliente.sigla ? `A sigla agora é ${novo.sigla}.` : undefined })
      // a página é pela sigla: o endereço acompanha
      if (novo.sigla !== cliente.sigla) navegar(`/clientes/${encodeURIComponent(novo.sigla)}?aba=configuracoes`, { replace: true })
    } catch (e) {
      setErro(e)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cad-secao">
      {!podeEditar && <Faixa tom="info">Só o atendimento do cliente e o admin mudam o cadastro.</Faixa>}
      <Painel>
        <div className="cad-painel-corpo">
          <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
            <fieldset disabled={!podeEditar} className="cad-form">
              <div className="cad-grade-2">
                <Campo rotulo="Nome" value={nome} maxLength={160} onChange={(e) => setNome(e.target.value)} erro={!nome.trim() ? 'Escreva o nome.' : erroDoCampo(erro, 'nome')} />
                <Campo rotulo="Sigla" value={sigla} maxLength={12} onChange={(e) => setSigla(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  erro={erroDoCampo(erro, 'sigla') ?? ((erro as { status?: number } | null)?.status === 409 ? mensagemGeral(erro) : undefined)}
                  ajuda={sigla !== cliente.sigla ? 'Trocar a sigla troca o endereço desta página.' : 'Aparece nos cards.'} />
                <Selecao rotulo="Situação" value={status} onChange={(e) => setStatus(e.target.value as StatusCliente)}
                  opcoes={STATUS_CLIENTE.map((s) => ({ valor: s, rotulo: ROTULO_STATUS[s] }))} />
                <Selecao rotulo="Nível" value={nivel} vazia="Sem nível" onChange={(e) => setNivel(e.target.value)}
                  opcoes={[1, 2, 3].map((n) => ({ valor: String(n), rotulo: `Nível ${n}` }))} ajuda="1 = o mais importante." />
                <Campo rotulo="Rodadas de ajuste inclusas" type="number" min={0} max={20} value={rodadas} onChange={(e) => setRodadas(e.target.value)}
                  ajuda="Passou disso, o sistema sugere marcar a rodada como extra." />
                <Selecao rotulo="Grupo" value={paiId} vazia="Nenhum" onChange={(e) => setPaiId(e.target.value)}
                  opcoes={clientes.filter((c) => c.id !== cliente.id && c.paiId !== cliente.id).map((c) => ({ valor: c.id, rotulo: `${c.sigla} · ${c.nome}` }))}
                  ajuda="Ex.: Bosque Vida e Bosque PET no grupo Bosque." />
              </div>
              <div className="cad-campo-cor"><span className="ui-rotulo">Cor</span>
                <SeletorCor valor={cor} rotulo="Cor do cliente" aoMudar={(c) => setCor(c ?? CORES[0])} /></div>
              <AreaTexto rotulo="Observações" opcional linhas={3} value={obs} maxLength={5000} onChange={(e) => setObs(e.target.value)}
                ajuda="Para a equipe. Senhas ficam no cofre (link de Acessos), nunca aqui." />
            </fieldset>
            {erro && !erroDoCampo(erro, 'nome') && !erroDoCampo(erro, 'sigla') && (erro as { status?: number }).status !== 409 ? <Faixa tom="perigo">{mensagemGeral(erro)}</Faixa> : null}
            {podeEditar && (
              <div className="cad-rodape-form">
                <Botao type="submit" variante="primario" carregando={salvando} disabled={!mudou}>Salvar cadastro</Botao>
              </div>
            )}
          </form>
        </div>
      </Painel>
      <Painel><div className="cad-painel-corpo"><Apelidos cliente={cliente} podeEditar={podeEditar} /></div></Painel>
    </div>
  )
}
