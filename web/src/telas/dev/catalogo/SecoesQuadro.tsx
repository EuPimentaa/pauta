/**
 * Catálogo: o quadro (fundos, uma coluna de cada cor com cards em todos os estados) e a GradeCalendario.
 * A marcação aqui é a referência das classes de estilos/quadro.css para o CardDemanda e o layout do NÚCLEO-WEB.
 */
import { useState } from 'react'
import {
  Calendar, Check, CheckSquare, Clock3, MessageSquare, MoreHorizontal, Paperclip, Plus, Repeat2, TriangleAlert,
} from 'lucide-react'
import { FUNDOS_QUADRO, type Cor, type DataLocal, type FundoQuadro, type PapelColuna } from '@shared/tipos/index.ts'
import { formatarDiaMes, hojeLocal, inicioDaSemana, somarDias } from '../../../lib/datas.ts'
import { Abas } from '../../../ui/Abas.tsx'
import { PilhaAvatares } from '../../../ui/Avatar.tsx'
import { BotaoIcone } from '../../../ui/Botao.tsx'
import { ChipCliente, ChipEtiqueta } from '../../../ui/Chips.tsx'
import { GradeCalendario } from '../../../ui/GradeCalendario.tsx'
import { Contador } from '../../../ui/Indicadores.tsx'
import { Tooltip } from '../../../ui/Tooltip.tsx'
import { Amostra, Nota } from './Amostra.tsx'
import { cliente, etiqueta, pessoa } from './dados.ts'
import { FERIADOS } from './SecoesIdentidade.tsx'

// ─────────────────────────────── card ───────────────────────────────

type EstadoPrazoAmostra = 'atrasada' | 'hoje' | 'em_dia' | 'pausado' | 'concluida'

interface PropsCartao {
  numero: number
  titulo: string
  cliente?: string
  etiquetas?: string[]
  prazo?: { estado: EstadoPrazoAmostra; texto: string }
  sinal?: { tom: 'perigo' | 'cliente' | 'parado' | 'extra'; texto: string }
  checklist?: [number, number]
  anexos?: number
  comentarios?: number
  membros?: string[]
  prioridade?: 'alta' | 'urgente'
  capa?: Cor
  concluida?: boolean
  selecionado?: boolean
  repetir?: boolean
}

const numero = new Intl.NumberFormat('pt-BR')
const ICONE_PRAZO = { atrasada: TriangleAlert, hoje: Clock3, em_dia: Calendar, pausado: Clock3, concluida: Check } as const

/** A mesma marcação do CardDemanda do quadro: etiquetas, cliente e número numa linha; avatares sobem sem metas. */
function CartaoAmostra(p: PropsCartao) {
  const c = p.cliente ? cliente(p.cliente) : null
  const IconePrazo = p.prazo ? ICONE_PRAZO[p.prazo.estado] : null
  const temMetas = !!(p.prazo || p.sinal || p.checklist || p.anexos || p.comentarios || p.repetir)
  const pilha = p.membros ? <PilhaAvatares pessoas={p.membros.map(pessoa)} tamanho={20} /> : null
  return (
    <article className="ui-cartao" tabIndex={0} aria-label={`#${p.numero} ${p.titulo}`}
      data-prioridade={p.prioridade} data-selecionado={p.selecionado || undefined} data-concluida={p.concluida || undefined}>
      {p.capa && <div className="ui-cartao-capa" data-cor={p.capa} aria-hidden="true" />}
      <div className="ui-cartao-topo">
        {p.concluida && <span className="ui-cartao-feita" role="img" aria-label="Concluída"><Check aria-hidden="true" /></span>}
        {p.etiquetas?.map((n) => <ChipEtiqueta key={n} etiqueta={etiqueta(n)} />)}
        {c && <ChipCliente cliente={c} />}
        <span className="ui-cartao-numero">#{numero.format(p.numero)}</span>
        {!temMetas && pilha}
      </div>
      <p className="ui-cartao-titulo">{p.titulo}</p>
      {temMetas && (
        <div className="ui-cartao-rodape">
          <div className="ui-cartao-metas">
            {p.prazo && IconePrazo && <span className="ui-prazo" data-estado={p.prazo.estado}><IconePrazo aria-hidden="true" />{p.prazo.texto}</span>}
            {p.sinal && <span className="ui-sinal" data-tom={p.sinal.tom}>{p.sinal.texto}</span>}
            {p.repetir && <Tooltip texto="Repete toda semana"><span className="ui-cartao-meta" role="img" aria-label="Repete toda semana"><Repeat2 aria-hidden="true" /></span></Tooltip>}
            {p.checklist && (
              <span className="ui-cartao-meta" data-completo={p.checklist[0] === p.checklist[1] || undefined}>
                <CheckSquare aria-hidden="true" />{p.checklist[0]}/{p.checklist[1]}
              </span>
            )}
            {p.comentarios ? <span className="ui-cartao-meta"><MessageSquare aria-hidden="true" />{p.comentarios}</span> : null}
            {p.anexos ? <span className="ui-cartao-meta"><Paperclip aria-hidden="true" />{p.anexos}</span> : null}
          </div>
          {pilha}
        </div>
      )}
    </article>
  )
}

// ─────────────────────────────── coluna ───────────────────────────────

interface PropsColuna { nome: string; cor?: Cor; papel?: PapelColuna; limite?: number; cartoes: PropsCartao[]; pe?: string }

const ROTULO_PAPEL = { aguardando_cliente: 'Aguardando o cliente', concluida: 'Concluída' } as const

function ColunaAmostra({ nome, cor, papel = 'normal', limite, cartoes, pe }: PropsColuna) {
  return (
    <section className="ui-coluna" data-cor={cor} aria-label={`Coluna ${nome}`}>
      <header className="ui-coluna-cabeca">
        <span className="ui-coluna-ponto" aria-hidden="true" />
        <h3 className="ui-coluna-titulo">{nome}</h3>
        {papel !== 'normal' && (
          <Tooltip texto={ROTULO_PAPEL[papel]}>
            <span className="ui-coluna-papel" role="img" aria-label={ROTULO_PAPEL[papel]}>{papel === 'concluida' ? <Check aria-hidden="true" /> : <Clock3 aria-hidden="true" />}</span>
          </Tooltip>
        )}
        <Contador valor={cartoes.length + (limite ? 4 : 0)} limite={limite} rotulo="demandas" />
        <BotaoIcone icone={MoreHorizontal} rotulo={`Ações da coluna ${nome}`} tamanho="p" />
      </header>
      <div className="ui-coluna-cards">
        {cartoes.length === 0 ? <div className="ui-coluna-soltar">Solte aqui</div> : cartoes.map((c) => <CartaoAmostra key={c.numero} {...c} />)}
      </div>
      {pe && <p className="ui-coluna-pe">{pe}</p>}
      <footer className="ui-coluna-rodape">
        <button type="button" className="ui-coluna-adicionar"><Plus aria-hidden="true" /> Adicionar demanda</button>
      </footer>
    </section>
  )
}

function ColunaRecolhida({ nome, cor, n }: { nome: string; cor: Cor; n: number }) {
  return (
    <button type="button" className="ui-coluna" data-cor={cor} data-recolhida="" aria-label={`Abrir a coluna ${nome}, ${n} demandas`}>
      <span className="ui-coluna-ponto" aria-hidden="true" />
      <Contador valor={n} />
      <span className="ui-coluna-titulo">{nome}</span>
    </button>
  )
}

const COLUNAS: PropsColuna[] = [
  { nome: 'Fila', cartoes: [
    { numero: 1204, titulo: 'Carrossel do Dia do Cliente com 5 cards', cliente: 'HE', etiquetas: ['Instagram', 'Texto'], prazo: { estado: 'em_dia', texto: 'sex, 24 out' }, checklist: [0, 4], membros: ['Rafa'] },
    { numero: 1211, titulo: 'Ideia de post para o aniversário da marca', cliente: 'BSM' },
  ] },
  { nome: 'Rafa', cor: 'rosa', cartoes: [
    { numero: 1187, titulo: 'Reels com depoimentos de pacientes', cliente: 'HE', etiquetas: ['Vídeo'], prazo: { estado: 'atrasada', texto: 'Atrasada há 2 dias' }, comentarios: 3, membros: ['Rafa', 'Lena'], prioridade: 'urgente' },
    { numero: 1199, titulo: 'Banner da campanha de verão', cliente: 'AUR', capa: 'ambar', prazo: { estado: 'hoje', texto: 'Hoje, 18h' }, checklist: [3, 5], anexos: 2, membros: ['Rafa'] },
  ] },
  { nome: 'Fazendo', cor: 'ambar', limite: 5, cartoes: [
    { numero: 1175, titulo: 'Landing page da campanha Outubro Rosa', cliente: 'ICC', etiquetas: ['Site', 'Urgente do cliente'], prazo: { estado: 'hoje', texto: 'Hoje, 14h' }, sinal: { tom: 'parado', texto: 'Parado há 4 dias úteis' }, membros: ['Bruno', 'Cami', 'Diego', 'Igor'], prioridade: 'alta' },
    { numero: 1190, titulo: 'Folder institucional, versão para impressão', cliente: 'VTX', etiquetas: ['Impresso'], selecionado: true, checklist: [2, 6], membros: ['Cami'] },
  ] },
  { nome: 'Revisão interna', cor: 'roxo', cartoes: [
    { numero: 1166, titulo: 'Legenda e hashtags da semana', cliente: 'AUR', etiquetas: ['Texto', ''], prazo: { estado: 'em_dia', texto: 'seg, 20 out' }, repetir: true, comentarios: 1, membros: ['Diego'] },
  ] },
  { nome: 'Com o cliente', cor: 'turquesa', papel: 'aguardando_cliente', cartoes: [
    { numero: 1150, titulo: 'Arte do post de aniversário da marca', cliente: 'BSM', etiquetas: ['Instagram'], prazo: { estado: 'pausado', texto: 'Com o cliente' }, sinal: { tom: 'cliente', texto: 'há 3 dias' }, membros: ['Lena'] },
    { numero: 1142, titulo: 'Vídeo da visita à fábrica, V3', cliente: 'VTX', etiquetas: ['Vídeo'], sinal: { tom: 'extra', texto: 'R3/2 · extra' }, anexos: 1, membros: ['Igor', 'Rafa'] },
  ] },
  { nome: 'Aprovado', cor: 'verde', papel: 'concluida', pe: 'As concluídas há mais de 7 dias estão no Arquivo.', cartoes: [
    { numero: 1120, titulo: 'Stories da promoção de outubro', cliente: 'AUR', concluida: true, prazo: { estado: 'concluida', texto: 'Entregue em 12 out' }, checklist: [4, 4], membros: ['Diego'] },
  ] },
  { nome: 'Ideias', cor: 'amarelo', cartoes: [{ numero: 1215, titulo: 'Série de bastidores para o Dia do Cliente', etiquetas: ['Instagram'] }] },
  { nome: 'Agendar', cor: 'magenta', cartoes: [{ numero: 1133, titulo: 'Post do Outubro Rosa no feed', cliente: 'ICC', prazo: { estado: 'em_dia', texto: 'qua, 22 out' }, membros: ['Diego'] }] },
  { nome: 'Publicado', cor: 'berinjela', cartoes: [{ numero: 1101, titulo: 'Carrossel 5 erros comuns no primeiro site', cliente: 'VTX', concluida: true, prazo: { estado: 'concluida', texto: 'Entregue em 8 out' } }] },
  { nome: 'Azul', cor: 'azul', cartoes: [{ numero: 1098, titulo: 'Relatório mensal de tráfego', cliente: 'HE', etiquetas: ['Site'], prazo: { estado: 'em_dia', texto: '31 out' }, membros: ['Igor'] }] },
  { nome: 'Avisos', cor: 'grafite', cartoes: [] },
]

export function SecaoQuadro() {
  const [fundo, setFundo] = useState<FundoQuadro>('liso')
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-meta font-medium text-fg-2">Fundo do quadro</span>
        <Abas rotulo="Fundo do quadro" ativa={fundo} aoMudar={setFundo} abas={FUNDOS_QUADRO.map((f) => ({ id: f, rotulo: f[0].toUpperCase() + f.slice(1) }))} />
      </div>
      <Amostra empilhar rotulo="Quadro">
        <div className="cat-quadro">
          <div className="ui-quadro" data-fundo={fundo}>
            {COLUNAS.map((c) => <ColunaAmostra key={c.nome} {...c} />)}
            <ColunaRecolhida nome="Arquivo de ideias" cor="grafite" n={14} />
          </div>
        </div>
      </Amostra>
      <Nota>Coluna: fundo <code>--coluna-&lt;cor&gt;-bg</code> (pastel em OKLCH com a matiz exata da cor da marca, o mesmo peso para todas; texto e card AA nos dois temas; no escuro o card fica acima da coluna), ponto no título, contador “6/5” acima do limite, ícone do papel. Card: um primário de estado por vez (prazo), um sinal, faixa de 3 px para alta e urgente, avatares até 3 + o resto.</Nota>
    </>
  )
}

// ─────────────────────────────── calendário ───────────────────────────────

interface ItemAgenda { id: string; titulo: string; cor: Cor; hora?: string; data: DataLocal }

function itensIniciais(): ItemAgenda[] {
  const seg = inicioDaSemana(hojeLocal())
  return [
    { id: 'a1', titulo: 'Carrossel do Dia do Cliente', cor: 'azul', data: somarDias(seg, 4), hora: '18h' },
    { id: 'a2', titulo: 'Banner de verão', cor: 'ambar', data: hojeLocal(), hora: '14h' },
    { id: 'a3', titulo: 'Reels de depoimentos', cor: 'rosa', data: somarDias(seg, -2) },
    { id: 'a4', titulo: 'Landing Outubro Rosa', cor: 'magenta', data: somarDias(seg, 2) },
    { id: 'a5', titulo: 'Legenda da semana', cor: 'turquesa', data: somarDias(seg, 7) },
    { id: 'a6', titulo: 'Folder institucional', cor: 'verde', data: somarDias(seg, 4) },
    { id: 'a7', titulo: 'Relatório de tráfego', cor: 'roxo', data: somarDias(seg, 4) },
    { id: 'a8', titulo: 'Post de aniversário', cor: 'berinjela', data: somarDias(seg, 4) },
    { id: 'a9', titulo: 'Stories da promoção', cor: 'grafite', data: somarDias(seg, 9), hora: '10h' },
  ]
}

export function SecaoCalendario() {
  const [itens, setItens] = useState(itensIniciais)
  const [periodo, setPeriodo] = useState<{ data: DataLocal; modo: 'mes' | 'semana' }>({ data: hojeLocal(), modo: 'mes' })
  const mover = (id: string, dia: DataLocal) => setItens((l) => l.map((i) => (i.id === id ? { ...i, data: dia } : i)))
  const itensDoDia = (d: DataLocal) => itens.filter((i) => i.data === d).map((i) => ({
    id: i.id,
    arrastavel: true,
    rotulo: `${i.titulo}, prazo ${formatarDiaMes(i.data)}`,
    conteudo: (
      <div className="cat-agenda-item" data-cor={i.cor}>
        <span className="ui-coluna-ponto" style={{ width: 6, height: 6, boxShadow: 'none' }} aria-hidden="true" />
        <span>{i.hora && <b>{i.hora} </b>}{i.titulo}</span>
      </div>
    ),
  }))
  return (
    <>
      <Amostra empilhar rotulo="Calendário">
        <GradeCalendario rotulo="Agenda de exemplo" modo={periodo.modo} data={periodo.data} feriados={FERIADOS} itensDoDia={itensDoDia}
          aoSoltar={mover} aoMudarPeriodo={(data, modo) => setPeriodo({ data, modo })} />
      </Amostra>
      <Nota>Arraste um item para outro dia (mouse, toque ou teclado: Espaço pega, setas andam de dia em dia, Espaço solta, Esc cancela). Semana começa na segunda; feriados marcados.</Nota>
    </>
  )
}
