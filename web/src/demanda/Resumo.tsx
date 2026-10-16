/**
 * O que o modal mostra quando nenhuma funcionalidade registrou seções (o modal completo é do F1): a descrição só para
 * ler e um resumo lateral (membros, etiquetas, cliente, datas, prioridade). Some sozinho quando as seções chegam.
 */
import { lazy, Suspense } from 'react'
import { ROTULO_PRIORIDADE, ROTULO_REPETICAO } from '@shared/tipos/index.ts'
import type { ContextoDemanda } from '../extensoes/tipos.ts'
import { useDoBootstrap } from '../api/seletores.ts'
import { formatarData } from '../lib/datas.ts'
import { PilhaAvatares } from '../ui/Avatar.tsx'
import { ChipCliente, ChipEtiqueta } from '../ui/Chips.tsx'
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
const selEtiquetas = (b: Bootstrap) => b.etiquetas

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="modal-demanda-campo">
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function ResumoLateral({ ctx }: { ctx: ContextoDemanda }) {
  const d = ctx.demanda
  const usuarios = useDoBootstrap(selUsuarios) ?? []
  const etiquetas = useDoBootstrap(selEtiquetas) ?? []
  const membros = d.membroIds.map((id) => usuarios.find((u) => u.id === id)).filter((u) => !!u)
  const am = d.atendimentoId ? usuarios.find((u) => u.id === d.atendimentoId) : undefined
  const minhas = etiquetas.filter((e) => d.etiquetaIds.includes(e.id))
  return (
    <dl className="modal-demanda-resumo">
      <Linha rotulo="Membros">{membros.length ? <PilhaAvatares pessoas={membros} max={6} tamanho={28} /> : <span className="text-fg-2">Ninguém ainda</span>}</Linha>
      {minhas.length > 0 && <Linha rotulo="Etiquetas"><span className="flex flex-wrap gap-1">{minhas.map((e) => <ChipEtiqueta key={e.id} etiqueta={e} />)}</span></Linha>}
      <Linha rotulo="Cliente">{ctx.cliente ? <ChipCliente cliente={ctx.cliente} comNome /> : <span className="text-fg-2">Sem cliente</span>}</Linha>
      {am && <Linha rotulo="Atendimento">{am.apelido ?? am.nome}</Linha>}
      <Linha rotulo="Prazo">{d.prazo ? formatarData(d.prazo, d.prazoHora) : <span className="text-fg-2">Sem prazo</span>}</Linha>
      {d.inicio && <Linha rotulo="Início">{formatarData(d.inicio, d.inicioHora)}</Linha>}
      {d.publicacaoData && <Linha rotulo="Publicação">{formatarData(d.publicacaoData, d.publicacaoHora)}</Linha>}
      {d.repetir !== 'nenhuma' && <Linha rotulo="Repetir">{ROTULO_REPETICAO[d.repetir]}</Linha>}
      <Linha rotulo="Prioridade">{ROTULO_PRIORIDADE[d.prioridade]}</Linha>
    </dl>
  )
}
