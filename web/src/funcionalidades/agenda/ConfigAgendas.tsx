/**
 * Configurações › Agendas externas (F9, ordem 570, só o admin; API.md §F.9): as agendas do Google pelo "Endereço
 * secreto no formato iCal". Adicionar (nome, cor e o endereço colado), o estado de cada uma ("Atualizada às 14:05 · 312
 * eventos" ou o erro em português), [Atualizar agora], pausar e retomar, trocar o endereço (colar de novo: o antigo
 * nunca volta), renomear, mudar a cor, reordenar e excluir; o passo a passo de onde copiar o endereço no Google e o
 * aviso de que quem tem o endereço lê a agenda inteira. O endereço nunca volta do servidor: a tela mostra só a dica.
 */
import { useEffect, useId, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown, ArrowUp, CalendarPlus, CalendarSync, KeyRound, MoreHorizontal, Pause, Pencil, Play, RefreshCw, ShieldAlert, Trash2,
} from 'lucide-react'
import type { AgendaExterna, Cor } from '@shared/tipos/index.ts'
import { validarEnderecoIcal } from '@shared/logica/agenda-endereco.ts'
import { avisarErro } from '../../api/acoes.ts'
import { ehErroDaApi } from '../../api/cliente.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { hojeLocal } from '../../lib/datas.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao, BotaoIcone } from '../../ui/Botao.tsx'
import { Campo } from '../../ui/Campo.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import { Menu, type ItemMenuUi } from '../../ui/Menu.tsx'
import { BotaoCor, erroDoCampo, Faixa, mensagemGeral, Painel, Pilula } from '../cadastros/comum.tsx'
import {
  atualizarAgendaExterna, criarAgendaExterna, editarAgendaExterna, excluirAgendaExterna, useAgendasExternas,
} from './api.ts'
import { estadoDaAgenda } from './logica.ts'
import './agenda.css'

const MENSAGEM_ENDERECO = 'Cole o Endereço secreto no formato iCal do Google Agenda.'
const AJUDA_ENDERECO = 'Começa com https://calendar.google.com/calendar/ical/ e termina em /basic.ics.'
/** Quanto tempo a tela acompanha uma busca pedida (a busca tem 60 s de limite). */
const ACOMPANHAR_MS = 75_000

/** Busca pedida nesta tela: espera a `buscadaEm` mudar (o tempo real só avisa quando algo muda). */
interface Espera { antes: string | null; ate: number }

function Passos() {
  return (
    <details className="agd-passos">
      <summary>Onde copiar o endereço secreto no Google Agenda</summary>
      <ol>
        <li>No computador, abra o Google Agenda e clique na engrenagem → <strong>Configurações</strong>.</li>
        <li>Em <strong>Configurações das minhas agendas</strong>, à esquerda, clique na agenda da agência.</li>
        <li>Clique em <strong>Integrar agenda</strong>.</li>
        <li>Em <strong>Endereço secreto no formato iCal</strong>, clique no ícone de copiar e cole aqui.</li>
      </ol>
      <p className="cad-nota">
        Só quem pode gerenciar o compartilhamento da agenda vê esse campo. Se ele não aparecer numa conta Google Workspace, o
        administrador do Workspace precisa permitir o compartilhamento externo da agenda. O botão Redefinir do Google cria um
        endereço novo e o antigo para de funcionar: aí cole o novo em "Trocar o endereço".
      </p>
    </details>
  )
}

function NovaAgenda({ aoCriar }: { aoCriar(a: AgendaExterna): void }) {
  const qc = useQueryClient()
  const id = useId()
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState<Cor>('azul')
  const [url, setUrl] = useState('')
  const [tentou, setTentou] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)
  const urlOk = validarEnderecoIcal(url) !== null

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTentou(true)
    setErro(null)
    if (!nome.trim() || !urlOk) return
    setEnviando(true)
    try {
      const a = await criarAgendaExterna(qc, { nome: nome.trim(), cor, url: url.trim() })
      avisar(`${a.nome} adicionada. Buscando os eventos…`, { tipo: 'sucesso' })
      setNome(''); setUrl(''); setCor('azul'); setTentou(false)
      aoCriar(a)
    } catch (err) {
      setErro(err)
    } finally {
      setEnviando(false)
    }
  }

  const repetida = ehErroDaApi(erro) && erro.status === 409 ? erro.mensagem : undefined
  const erroUrl = tentou && !url.trim() ? 'Cole o endereço.' : tentou && !urlOk ? MENSAGEM_ENDERECO : repetida ?? erroDoCampo(erro, 'url')
  return (
    <form id={id} className="cad-form" noValidate onSubmit={(e) => void enviar(e)}>
      <div className="agd-form-linha">
        <Campo rotulo="Nome" value={nome} maxLength={60} placeholder="Ex.: Melt" onChange={(e) => setNome(e.target.value)}
          erro={tentou && !nome.trim() ? 'Escreva o nome.' : erroDoCampo(erro, 'nome')} classeGrupo="agd-form-nome" />
        <div className="ui-campo-grupo">
          <span className="ui-rotulo">Cor</span>
          <BotaoCor valor={cor} aoMudar={(c) => setCor(c ?? 'azul')} rotulo="Cor da agenda" />
        </div>
      </div>
      <Campo rotulo="Endereço secreto no formato iCal" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url"
        autoComplete="off" spellCheck={false} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" icone={KeyRound}
        ajuda={AJUDA_ENDERECO} erro={erroUrl} />
      {erro && !repetida && !erroDoCampo(erro, 'url') && !erroDoCampo(erro, 'nome') ? <Faixa tom="perigo">{mensagemGeral(erro)}</Faixa> : null}
      <div className="cad-rodape-form">
        <Botao type="submit" variante="primario" icone={CalendarPlus} carregando={enviando}>Adicionar agenda</Botao>
      </div>
    </form>
  )
}

function TrocarEndereco({ agenda, aoFechar, aoTrocar }: { agenda: AgendaExterna; aoFechar(): void; aoTrocar(a: AgendaExterna): void }) {
  const qc = useQueryClient()
  const [url, setUrl] = useState('')
  const [tentou, setTentou] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)
  const urlOk = validarEnderecoIcal(url) !== null
  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTentou(true)
    setErro(null)
    if (!urlOk) return
    setEnviando(true)
    try {
      const a = await editarAgendaExterna(qc, agenda.id, { url: url.trim() })
      avisar(`Endereço de ${a.nome} trocado. Buscando os eventos…`, { tipo: 'sucesso' })
      aoTrocar(a)
      aoFechar()
    } catch (err) {
      setErro(err)
    } finally {
      setEnviando(false)
    }
  }
  const repetida = ehErroDaApi(erro) && erro.status === 409 ? erro.mensagem : undefined
  return (
    <form className="agd-edicao" noValidate onSubmit={(e) => void enviar(e)}>
      <Campo rotulo="Endereço secreto novo" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoComplete="off"
        spellCheck={false} icone={KeyRound} autoFocus ajuda="O endereço antigo não aparece: cole o novo, copiado do Google."
        erro={tentou && !urlOk ? MENSAGEM_ENDERECO : repetida ?? (erro ? mensagemGeral(erro) : undefined)} />
      <div className="cad-rodape-form">
        <Botao variante="ghost" onClick={aoFechar}>Cancelar</Botao>
        <Botao type="submit" variante="secundario" carregando={enviando}>Trocar o endereço</Botao>
      </div>
    </form>
  )
}

function Renomear({ agenda, aoFechar }: { agenda: AgendaExterna; aoFechar(): void }) {
  const qc = useQueryClient()
  const [nome, setNome] = useState(agenda.nome)
  const [cor, setCor] = useState<Cor>(agenda.cor)
  const [enviando, setEnviando] = useState(false)
  const [tentou, setTentou] = useState(false)
  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTentou(true)
    if (!nome.trim()) return
    setEnviando(true)
    try {
      await editarAgendaExterna(qc, agenda.id, { nome: nome.trim(), cor })
      aoFechar()
    } catch (err) {
      avisarErro(err, { titulo: 'Não foi possível salvar.' })
    } finally {
      setEnviando(false)
    }
  }
  return (
    <form className="agd-edicao" noValidate onSubmit={(e) => void enviar(e)}>
      <div className="agd-form-linha">
        <Campo rotulo="Nome" value={nome} maxLength={60} autoFocus onChange={(e) => setNome(e.target.value)}
          erro={tentou && !nome.trim() ? 'Escreva o nome.' : undefined} classeGrupo="agd-form-nome" />
        <div className="ui-campo-grupo">
          <span className="ui-rotulo">Cor</span>
          <BotaoCor valor={cor} aoMudar={(c) => setCor(c ?? agenda.cor)} rotulo="Cor da agenda" />
        </div>
      </div>
      <div className="cad-rodape-form">
        <Botao variante="ghost" onClick={aoFechar}>Cancelar</Botao>
        <Botao type="submit" variante="secundario" carregando={enviando}>Salvar</Botao>
      </div>
    </form>
  )
}

function LinhaAgenda({ agenda: a, anterior, proxima, atualizando, aoAtualizar, aoBuscar }: {
  agenda: AgendaExterna; anterior: AgendaExterna | undefined; proxima: AgendaExterna | undefined
  atualizando: boolean; aoAtualizar(a: AgendaExterna): void; aoBuscar(a: AgendaExterna): void
}) {
  const qc = useQueryClient()
  const abrirDialogo = useAbrirDialogo()
  const [editando, setEditando] = useState<'nome' | 'endereco' | null>(null)
  const estado = estadoDaAgenda(a, hojeLocal())

  async function pausar(ativa: boolean) {
    try {
      const nova = await editarAgendaExterna(qc, a.id, { ativa })
      avisar(ativa ? `${a.nome} retomada. Buscando os eventos…` : `${a.nome} pausada: os eventos saem da Agenda e do Início.`, { tipo: 'sucesso' })
      if (ativa) aoBuscar(nova)
    } catch (e) {
      avisarErro(e, { titulo: ativa ? 'Não foi possível retomar.' : 'Não foi possível pausar.' })
    }
  }
  async function mover(posicao: { depoisDeId?: string; antesDeId?: string }) {
    try { await editarAgendaExterna(qc, a.id, { posicao }) } catch (e) { avisarErro(e, { titulo: 'Não foi possível mover.' }) }
  }
  async function excluir() {
    const ok = await abrirDialogo('confirmar', {
      titulo: `Excluir ${a.nome}?`, confirmar: 'Excluir agenda', perigo: true,
      mensagem: 'Os eventos dela saem da Agenda e do Início. Nada muda no Google Agenda; para voltar, cole o endereço de novo.',
    })
    if (!ok) return
    try {
      await excluirAgendaExterna(qc, a.id)
      avisar(`${a.nome} excluída.`, { tipo: 'sucesso' })
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível excluir.' })
    }
  }

  const itens: ItemMenuUi[] = [
    { id: 'nome', rotulo: 'Renomear e mudar a cor', icone: Pencil, executar: () => setEditando('nome') },
    { id: 'endereco', rotulo: 'Trocar o endereço', icone: KeyRound, executar: () => setEditando('endereco') },
    a.ativa
      ? { id: 'pausar', rotulo: 'Pausar', icone: Pause, executar: () => void pausar(false) }
      : { id: 'retomar', rotulo: 'Retomar', icone: Play, executar: () => void pausar(true) },
    { tipo: 'separador', id: 's1' },
    { id: 'subir', rotulo: 'Subir', icone: ArrowUp, desabilitado: !anterior, executar: () => { if (anterior) void mover({ antesDeId: anterior.id }) } },
    { id: 'descer', rotulo: 'Descer', icone: ArrowDown, desabilitado: !proxima, executar: () => { if (proxima) void mover({ depoisDeId: proxima.id }) } },
    { tipo: 'separador', id: 's2' },
    { id: 'excluir', rotulo: 'Excluir', icone: Trash2, perigo: true, executar: () => void excluir() },
  ]
  return (
    <li className="agd-linha" data-pausada={!a.ativa || undefined}>
      <div className="agd-linha-topo">
        <span className="agd-linha-cor" data-cor={a.cor} aria-hidden="true" />
        <div className="agd-linha-principal">
          <p className="agd-linha-nome">
            <span>{a.nome}</span>
            {!a.ativa && <Pilula>Pausada</Pilula>}
          </p>
          <p className="agd-linha-dica" title="O endereço completo fica só no servidor, cifrado.">{a.urlDica}</p>
        </div>
        <div className="cad-acoes agd-linha-acoes">
          <Botao variante="secundario" tamanho="p" icone={RefreshCw} carregando={atualizando} disabled={!a.ativa}
            dica={a.ativa ? undefined : 'Retome a agenda para atualizar.'} onClick={() => aoAtualizar(a)}>
            {atualizando ? 'Atualizando…' : 'Atualizar agora'}
          </Botao>
          <Menu rotulo={`Ações de ${a.nome}`} itens={itens} alinhar="fim">
            {(g) => <BotaoIcone {...g} icone={MoreHorizontal} rotulo={`Ações de ${a.nome}`} />}
          </Menu>
        </div>
      </div>
      <div className="agd-estado" data-tom={estado.tom} role={estado.tom === 'erro' ? 'status' : undefined}>
        {estado.tom === 'erro' ? <ShieldAlert aria-hidden="true" /> : <CalendarSync aria-hidden="true" />}
        <div>
          <p>{atualizando ? 'Buscando a agenda…' : estado.texto}</p>
          {estado.detalhe && <p className="agd-estado-detalhe">{estado.detalhe}</p>}
          {estado.avisos.map((t) => <p key={t} className="agd-estado-detalhe">{t}</p>)}
        </div>
      </div>
      {editando === 'nome' && <Renomear agenda={a} aoFechar={() => setEditando(null)} />}
      {editando === 'endereco' && <TrocarEndereco agenda={a} aoFechar={() => setEditando(null)} aoTrocar={aoBuscar} />}
    </li>
  )
}

export default function ConfigAgendas() {
  const qc = useQueryClient()
  const [esperas, setEsperas] = useState<Record<string, Espera>>({})
  const acompanhando = Object.keys(esperas).length > 0
  const consulta = useAgendasExternas(acompanhando ? 2000 : false)
  const [adicionando, setAdicionando] = useState(false)
  const agendas = consulta.data ?? []

  // a busca pedida acabou quando a buscadaEm mudou (ou o tempo de acompanhar passou)
  useEffect(() => {
    if (!acompanhando) return
    const agora = Date.now()
    const restantes = Object.fromEntries(Object.entries(esperas).filter(([id, e]) => {
      const a = agendas.find((x) => x.id === id)
      return a && a.ativa && a.buscadaEm === e.antes && agora < e.ate
    }))
    if (Object.keys(restantes).length !== Object.keys(esperas).length) setEsperas(restantes)
  }, [agendas, esperas, acompanhando])

  // o tempo de acompanhar também acaba sozinho (a lista relida igual não muda a referência dos dados)
  useEffect(() => {
    if (!acompanhando) return
    const t = setInterval(() => setEsperas((e) => {
      const vivas = Object.fromEntries(Object.entries(e).filter(([, x]) => Date.now() < x.ate))
      return Object.keys(vivas).length === Object.keys(e).length ? e : vivas
    }), 5000)
    return () => clearInterval(t)
  }, [acompanhando])

  const acompanhar = (a: AgendaExterna) => setEsperas((e) => ({ ...e, [a.id]: { antes: a.buscadaEm, ate: Date.now() + ACOMPANHAR_MS } }))

  async function atualizar(a: AgendaExterna) {
    try {
      const antes = await atualizarAgendaExterna(qc, a.id)
      acompanhar(antes)
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível atualizar agora.' })
    }
  }

  return (
    <div className="cad-secao agd-config">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h2 className="cad-titulo">Agendas externas</h2>
          <p className="cad-subtitulo">
            Os eventos das agendas do Google aparecem na Agenda, junto com os prazos, e em "Hoje na agenda" no Início. O Pauta lê
            cada agenda a cada 15 minutos e guarda de 30 dias atrás a 180 dias à frente.
          </p>
        </div>
        {!adicionando && agendas.length > 0 && (
          <div className="cad-acoes">
            <Botao variante="secundario" icone={CalendarPlus} onClick={() => setAdicionando(true)}>Adicionar agenda</Botao>
          </div>
        )}
      </header>

      <Faixa icone={ShieldAlert}>
        <strong>O endereço secreto funciona como uma senha:</strong> quem o tem lê a agenda inteira, sem login. O Pauta guarda o
        endereço cifrado e nunca o mostra de novo. Toda a equipe vê os eventos na Agenda; os particulares aparecem só como
        "Ocupado".
      </Faixa>

      {(adicionando || (consulta.isSuccess && agendas.length === 0)) && (
        <Painel titulo="Adicionar agenda" icone={CalendarPlus} id="agd-nova"
          acoes={agendas.length > 0 ? <Botao tamanho="p" variante="ghost" onClick={() => setAdicionando(false)}>Fechar</Botao> : undefined}>
          <div className="cad-painel-corpo">
            <NovaAgenda aoCriar={(a) => { setAdicionando(false); acompanhar(a) }} />
            <Passos />
          </div>
        </Painel>
      )}

      <Painel>
        {consulta.isPending ? (
          <div className="cad-painel-corpo"><EsqueletoLinhas linhas={3} /></div>
        ) : consulta.isError ? (
          <EstadoVazio titulo="Não foi possível carregar as agendas." texto={consulta.error.mensagem}
            acoes={<Botao variante="secundario" onClick={() => void consulta.refetch()}>Tentar de novo</Botao>} />
        ) : agendas.length === 0 ? (
          <EstadoVazio icone={CalendarSync} tamanho="p" titulo="Nenhuma agenda externa."
            texto="Cole acima o endereço secreto de uma agenda do Google para os eventos aparecerem na Agenda e no Início." />
        ) : (
          <ul className="agd-lista" aria-label="Agendas externas">
            {agendas.map((a, i) => (
              <LinhaAgenda key={a.id} agenda={a} anterior={agendas[i - 1]} proxima={agendas[i + 1]} atualizando={!!esperas[a.id]}
                aoAtualizar={(x) => void atualizar(x)} aoBuscar={acompanhar} />
            ))}
          </ul>
        )}
      </Painel>
      {agendas.length > 0 && !adicionando && <Passos />}
    </div>
  )
}
