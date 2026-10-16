/**
 * O que o modal mostra quando nenhuma funcionalidade registrou seções (o modal completo é do F1): a descrição só para
 * ler e um resumo lateral em duas colunas (ícone e rótulo | valor): membros, cliente, atendimento, datas, repetição e
 * prioridade. As etiquetas ficam só no topo do modal. Some sozinho quando as seções chegam.
 */
import { lazy, Suspense, type ReactNode } from 'react'
import {
  CalendarCheck, CalendarClock, CalendarPlus, Flag, Headset, Repeat2, Store, Users, type LucideIcon,
} from 'lucide-react'
import { ROTULO_PRIORIDADE, ROTULO_REPETICAO } from '@shared/tipos/index.ts'
import type { ContextoDemanda } from '../extensoes/tipos.ts'
import { useDoBootstrap } from '../api/seletores.ts'
import { formatarData } from '../lib/datas.ts'
import { PilhaAvatares } from '../ui/Avatar.tsx'
import { ChipCliente } from '../ui/Chips.tsx'
import { EsqueletoLinhas } from '../ui/Indicadores.tsx'
import type { Bootstrap } from '@shared/tipos/index.ts'

const Markdown = lazy(() => import('../ui/Markdown.tsx').then((m) => ({ default: m.Markdown })))

export function DescricaoSoLeitura({ ctx }: { ctx: ContextoDemanda }) {
  if (!ctx.detalhe) return <EsqueletoLinhas linhas={4} />
  const texto = ctx.detalhe.descricaoMd.trim()
  return (
    <section className="modal-demanda-secao" aria-labelledby="resumo-descricao">
      <h3 id="resumo-descricao" className="modal-demanda-secao-titulo">Descrição</h3>
      {texto
        ? <Suspense fallback={<EsqueletoLinhas linhas={3} />}><Markdown texto={texto} /></Suspense>
        : <p className="text-body text-fg-2">Sem descrição.</p>}
    </section>
  )
}

const selUsuarios = (b: Bootstrap) => b.usuarios

function Linha({ icone: Icone, rotulo, children }: { icone: LucideIcon; rotulo: string; children: ReactNode }) {
  return (
    <div className="modal-demanda-campo">
      <dt><Icone aria-hidden="true" />{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const Vazio = ({ children }: { children: ReactNode }) => <span className="text-fg-2">{children}</span>

export function ResumoLateral({ ctx }: { ctx: ContextoDemanda }) {
  const d = ctx.demanda
  const usuarios = useDoBootstrap(selUsuarios) ?? []
  const membros = d.membroIds.map((id) => usuarios.find((u) => u.id === id)).filter((u) => !!u)
  const am = d.atendimentoId ? usuarios.find((u) => u.id === d.atendimentoId) : undefined
  return (
    <dl className="modal-demanda-resumo">
      <Linha icone={Users} rotulo="Membros">
        {membros.length ? <PilhaAvatares pessoas={membros} max={6} tamanho={24} /> : <Vazio>Ninguém ainda</Vazio>}
      </Linha>
      <Linha icone={Store} rotulo="Cliente">{ctx.cliente ? <ChipCliente cliente={ctx.cliente} comNome /> : <Vazio>Sem cliente</Vazio>}</Linha>
      {am && <Linha icone={Headset} rotulo="Atendimento">{am.apelido ?? am.nome}</Linha>}
      <Linha icone={CalendarClock} rotulo="Prazo">{d.prazo ? formatarData(d.prazo, d.prazoHora) : <Vazio>Sem prazo</Vazio>}</Linha>
      {d.inicio && <Linha icone={CalendarPlus} rotulo="Início">{formatarData(d.inicio, d.inicioHora)}</Linha>}
      {d.publicacaoData && <Linha icone={CalendarCheck} rotulo="Publicação">{formatarData(d.publicacaoData, d.publicacaoHora)}</Linha>}
      {d.repetir !== 'nenhuma' && <Linha icone={Repeat2} rotulo="Repetir">{ROTULO_REPETICAO[d.repetir]}</Linha>}
      <Linha icone={Flag} rotulo="Prioridade">{ROTULO_PRIORIDADE[d.prioridade]}</Linha>
    </dl>
  )
}
