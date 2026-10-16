/**
 * Componentes das contribuições de exemplo (só DEV, tela /dev/extensoes): seções do modal, diálogos, layouts e
 * entradas da coluna que mostram de onde vieram e em que ordem.
 */
import { useState } from 'react'
import type { ContextoColuna, ContextoDemanda, PropsDialogo, PropsLayout } from '../../extensoes/tipos.ts'
import './exemplos.ts'
import { useCriarDemanda } from '../../api/demandas.ts'
import { abrirDialogo } from '../../dialogos/estado.ts'
import { MolduraDialogo } from '../../dialogos/Moldura.tsx'
import { CalendarioDemandas } from '../../calendario/index.ts'
import { CardDemanda } from '../../quadro/index.ts'
import { useListaFeriados } from '../../api/seletores.ts'
import { inicioDaSemana, hojeLocal } from '../../lib/datas.ts'
import { Botao } from '../../ui/Botao.tsx'
import { Campo } from '../../ui/Campo.tsx'
import { anotar } from './exemplos.ts'

// ─────────────────────────────── seções do modal ───────────────────────────────

function Secao({ nome, ctx }: { nome: string; ctx: ContextoDemanda }) {
  return (
    <section className="modal-demanda-secao" data-exemplo={nome}>
      <h3 className="modal-demanda-secao-titulo">{nome}</h3>
      <p className="text-body text-fg-2">
        #{ctx.demanda.numero} · {ctx.coluna.nome} · {ctx.quadro.nome}{ctx.somenteLeitura ? ' · só leitura' : ''}
        {ctx.detalhe ? ' · detalhe carregado' : ' · sem o detalhe ainda'}
      </p>
    </section>
  )
}

export const SecaoPrincipalA = ({ ctx }: { ctx: ContextoDemanda }) => <Secao nome="Exemplo principal 100" ctx={ctx} />
export const SecaoPrincipalB = ({ ctx }: { ctx: ContextoDemanda }) => <Secao nome="Exemplo principal 200 (carregou devagar)" ctx={ctx} />
export const SecaoLateral = ({ ctx }: { ctx: ContextoDemanda }) => <Secao nome="Exemplo lateral 100" ctx={ctx} />
export const SecaoOculta = ({ ctx }: { ctx: ContextoDemanda }) => <Secao nome="Esta não devia aparecer" ctx={ctx} />

// ─────────────────────────────── diálogos ───────────────────────────────

export function DialogoModal({ params, fechar }: PropsDialogo<'nucleo-exemplo-modal'>) {
  return (
    <MolduraDialogo titulo="Diálogo de exemplo (modal)" rodape={(
      <>
        <Botao variante="secundario" onClick={() => fechar(null)}>Fechar</Botao>
        <Botao variante="primario" onClick={() => fechar({ ok: true })}>Confirmar</Botao>
      </>
    )}>
      <p className="text-body text-fg-2">{params.mensagem}</p>
      <div className="mt-4">
        <Botao variante="secundario" onClick={() => void abrirDialogo('confirmar', {
          titulo: 'Diálogo por cima de outro', mensagem: 'Ao fechar, o foco volta para o botão que abriu este.', confirmar: 'Entendi',
        }).then((r) => anotar(`diálogo empilhado: ${r ? 'confirmado' : 'cancelado'}`))}>
          Abrir outro por cima
        </Botao>
      </div>
    </MolduraDialogo>
  )
}

export function DialogoPopover({ params, fechar }: PropsDialogo<'nucleo-exemplo-popover'>) {
  return (
    <MolduraDialogo titulo="Popover de exemplo" rodape={<Botao variante="primario" tamanho="p" onClick={() => fechar({ ok: true })}>Ok</Botao>}>
      <p className="text-body text-fg-2">{params.mensagem}</p>
    </MolduraDialogo>
  )
}

export function DialogoSoltar({ params, fechar }: PropsDialogo<'nucleo-exemplo-soltar'>) {
  return (
    <MolduraDialogo titulo={`Soltar em ${params.colunaNome}?`} descricao="Interceptador de exemplo: escolha o resultado." rodape={(
      <>
        <Botao variante="secundario" onClick={() => fechar({ escolha: 'cancelado' })}>Cancelar</Botao>
        <Botao variante="secundario" onClick={() => fechar({ escolha: 'feito' })}>Feito (sem /mover)</Botao>
        <Botao variante="primario" onClick={() => fechar({ escolha: 'seguir' })}>Seguir</Botao>
      </>
    )}>
      <Botao variante="ghost" onClick={() => void abrirDialogo('confirmar', {
        titulo: 'Um diálogo de dentro do interceptador', mensagem: 'Empilha por cima e devolve o foco ao fechar.', confirmar: 'Voltar',
      })}>
        Abrir outro diálogo
      </Botao>
    </MolduraDialogo>
  )
}

// ─────────────────────────────── layouts (Lista e Calendário de exemplo) ───────────────────────────────

export function LayoutLista({ demandas, colunas }: PropsLayout) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-5">
      <p className="text-meta text-fg-2">Layout de exemplo "Lista" (ordem 200): {demandas.length} demandas filtradas, CardDemanda sem arrastar.</p>
      {colunas.map((c) => {
        const daColuna = demandas.filter((d) => d.colunaId === c.id).slice(0, 6)
        if (!daColuna.length) return null
        return (
          <section key={c.id} className="flex flex-col gap-2">
            <h3 className="text-col font-semibold">{c.nome}</h3>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {daColuna.map((d) => <CardDemanda key={d.id} demanda={d} compacto />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function LayoutCalendario({ demandas, abrir }: PropsLayout) {
  const [periodo, setPeriodo] = useState<{ inicio: string; modo: 'mes' | 'semana' }>({ inicio: hojeLocal(), modo: 'mes' })
  const feriados = useListaFeriados()
  const itens = demandas.filter((d) => d.prazo).map((d) => ({ demanda: d, campo: 'prazo' as const, data: d.prazo!, hora: d.prazoHora }))
  const semPrazo = demandas.filter((d) => !d.prazo && !d.concluidaEm)
  return (
    <div className="overflow-y-auto p-5">
      <CalendarioDemandas modo={periodo.modo} inicio={periodo.modo === 'semana' ? inicioDaSemana(periodo.inicio) : periodo.inicio}
        mudarPeriodo={(inicio, modo) => setPeriodo({ inicio, modo })} itens={itens} feriados={feriados} semPrazo={semPrazo} abrir={abrir} />
    </div>
  )
}

// ─────────────────────────────── entradas da coluna ───────────────────────────────

function Entrada({ nome, ctx, fechar }: { nome: string; ctx: ContextoColuna; fechar(): void }) {
  const [titulo, setTitulo] = useState('')
  const criar = useCriarDemanda()
  return (
    <form data-exemplo={nome} onSubmit={async (e) => {
      e.preventDefault()
      const t = titulo.trim()
      if (!t) return
      const r = await criar({ quadroId: ctx.quadro.id, colunaId: ctx.coluna.id, titulo: t })
      if (r) { anotar(`${nome}: criou #${r.demanda.numero}`); setTitulo('') }
    }}>
      <Campo rotulo={nome} value={titulo} autoFocus placeholder="Título e Enter"
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar() } }} />
    </form>
  )
}

export const EntradaA = (p: { ctx: ContextoColuna; fechar(): void }) => <Entrada nome="Entrada de exemplo A (ordem 100)" {...p} />
export const EntradaB = (p: { ctx: ContextoColuna; fechar(): void }) => <Entrada nome="Entrada de exemplo B (ordem 200)" {...p} />
