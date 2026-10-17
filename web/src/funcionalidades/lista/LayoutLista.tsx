/**
 * Layout "Lista" do quadro (extensoes/layouts/lista-lista.tsx; PLANO §3, F6): as demandas filtradas do quadro numa
 * tabela (#, Título, Cliente, Coluna, Membros, Etiquetas, Prioridade, Início, Prazo, Concluída), ordenada pelo
 * cabeçalho e agrupada por coluna, membro, cliente, prioridade ou prazo. Ordem e agrupamento vão na URL
 * (`?ordem=-prazo&agrupar=membro`, para compartilhar) e o último escolhido em cada quadro fica no aparelho.
 * No celular vira a lista de cards (CardDemanda) agrupada.
 */
import './lista.css'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowDown, ArrowUp, ChevronsDownUp, ChevronsUpDown, Filter, Inbox, Undo2 } from 'lucide-react'
import { temFiltros } from '@shared/logica/filtros.ts'
import type { PropsLayout } from '../../extensoes/tipos.ts'
import { Botao, BotaoIcone } from '../../ui/Botao.tsx'
import { Selecao } from '../../ui/Campo.tsx'
import { EstadoVazio } from '../../ui/Indicadores.tsx'
import { useContextoLista, useDemandasNoQuadro, useMinuto } from './dados.ts'
import { useAgrupamentoGuardado, useGruposRecolhidos, useOrdemGuardada } from './estado.ts'
import { ListaCelular } from './ListaCelular.tsx'
import {
  AGRUPAMENTOS, CAMPOS_ORDEM, ORDEM_PADRAO, ROTULO_AGRUPAMENTO, ROTULO_CAMPO_ORDEM, agruparDemandas, escreverOrdem, lerAgrupamento, lerOrdem,
  ordenarDemandas, type Agrupamento, type CampoOrdem, type OrdemLista,
} from './logica.ts'
import { TabelaLista } from './TabelaLista.tsx'

/** Agrupamento e ordem: a URL vence; sem ela, o último escolhido neste quadro; sem ele, coluna e a ordem do quadro. */
function useVisaoDaLista(quadroId: string) {
  const [params, setParams] = useSearchParams()
  const [agruparGuardado, guardarAgrupar] = useAgrupamentoGuardado(quadroId)
  const [ordemGuardada, guardarOrdem] = useOrdemGuardada(quadroId)
  const agrupar: Agrupamento = lerAgrupamento(params.get('agrupar')) ?? lerAgrupamento(agruparGuardado) ?? 'coluna'
  const ordem: OrdemLista = lerOrdem(params.get('ordem')) ?? (ordemGuardada && lerOrdem(escreverOrdem(ordemGuardada))) ?? ORDEM_PADRAO
  const mudarAgrupar = useCallback((a: Agrupamento) => {
    guardarAgrupar(a)
    setParams((p) => { if (a === 'coluna') p.delete('agrupar'); else p.set('agrupar', a); return p }, { replace: true })
  }, [guardarAgrupar, setParams])
  const mudarOrdem = useCallback((o: OrdemLista) => {
    guardarOrdem(o)
    setParams((p) => {
      if (o.campo === ORDEM_PADRAO.campo && o.direcao === ORDEM_PADRAO.direcao) p.delete('ordem')
      else p.set('ordem', escreverOrdem(o))
      return p
    }, { replace: true })
  }, [guardarOrdem, setParams])
  return { agrupar, ordem, mudarAgrupar, mudarOrdem }
}

const OPCOES_AGRUPAR = AGRUPAMENTOS.map((a) => ({ valor: a, rotulo: ROTULO_AGRUPAMENTO[a] }))
// no celular o select fica sem o rótulo ao lado: a opção diz o que é ("Por membro", "Por prazo")
const OPCOES_AGRUPAR_CELULAR = AGRUPAMENTOS.map((a) => ({ valor: a, rotulo: a === 'nenhum' ? 'Sem agrupar' : `Por ${ROTULO_AGRUPAMENTO[a].toLowerCase()}` }))
const OPCOES_ORDEM_CELULAR = CAMPOS_ORDEM.map((c) => ({ valor: c, rotulo: c === 'posicao' ? ROTULO_CAMPO_ORDEM[c] : `Por ${ROTULO_CAMPO_ORDEM[c].toLowerCase()}` }))

export default function LayoutLista(p: PropsLayout) {
  const { quadro, colunas, etiquetas, demandas, filtros, definirFiltros, abrir, celular } = p
  const { agrupar, ordem, mudarAgrupar, mudarOrdem } = useVisaoDaLista(quadro.id)
  const [recolhidos, alternarGrupo, recolherVarios] = useGruposRecolhidos(quadro.id, agrupar)
  const todas = useDemandasNoQuadro(quadro.id)
  const agora = useMinuto()
  const ctx = useContextoLista(colunas, etiquetas)
  const ordenadas = useMemo(() => ordenarDemandas(demandas, ordem, ctx), [demandas, ordem, ctx])
  const grupos = useMemo(() => agruparDemandas(ordenadas, todas, agrupar, ctx), [ordenadas, todas, agrupar, ctx])

  const filtrando = temFiltros(filtros)
  const semNenhuma = todas.length === 0
  const semResultado = !semNenhuma && demandas.length === 0 && filtrando
  const idsGrupos = grupos.map((g) => g.id)
  const todosRecolhidos = idsGrupos.length > 0 && idsGrupos.every((id) => recolhidos.has(id))
  const ordemPropria = ordem.campo !== ORDEM_PADRAO.campo || ordem.direcao !== ORDEM_PADRAO.direcao

  if (semNenhuma) {
    return (
      <div className="lista lista-centro">
        <EstadoVazio icone={Inbox} titulo="Nenhuma demanda ainda."
          texto="Crie a primeira com Shift+N ou no rodapé de uma coluna, na visão Quadro." />
      </div>
    )
  }

  return (
    <div className="lista">
      <div className="lista-barra" data-celular={celular || undefined}>
        <div className="lista-barra-campo">
          {!celular && <span className="lista-barra-rotulo" aria-hidden="true">Agrupar por</span>}
          <Selecao rotulo="Agrupar por" rotuloOculto tamanho="p" value={agrupar} opcoes={celular ? OPCOES_AGRUPAR_CELULAR : OPCOES_AGRUPAR}
            onChange={(e) => mudarAgrupar(e.target.value as Agrupamento)} />
        </div>
        {celular && (
          <div className="lista-barra-campo">
            <Selecao rotulo="Ordenar por" rotuloOculto tamanho="p" value={ordem.campo} opcoes={OPCOES_ORDEM_CELULAR}
              onChange={(e) => mudarOrdem({ campo: e.target.value as CampoOrdem, direcao: 'asc' })} />
            <BotaoIcone icone={ordem.direcao === 'asc' ? ArrowUp : ArrowDown} tamanho="p" variante="secundario"
              rotulo={ordem.direcao === 'asc' ? 'Inverter a ordem (agora crescente)' : 'Inverter a ordem (agora decrescente)'}
              onClick={() => mudarOrdem({ ...ordem, direcao: ordem.direcao === 'asc' ? 'desc' : 'asc' })} />
          </div>
        )}
        {!celular && ordemPropria && (
          <Botao variante="ghost" tamanho="p" icone={Undo2} onClick={() => mudarOrdem(ORDEM_PADRAO)}
            dica={`Ordenado por ${ROTULO_CAMPO_ORDEM[ordem.campo].toLowerCase()} (${ordem.direcao === 'asc' ? 'crescente' : 'decrescente'})`}>
            Ordem do quadro
          </Botao>
        )}
        {agrupar !== 'nenhum' && grupos.length > 1 && (celular ? (
          <BotaoIcone icone={todosRecolhidos ? ChevronsUpDown : ChevronsDownUp} tamanho="p" className="lista-barra-fim"
            rotulo={todosRecolhidos ? 'Abrir os grupos' : 'Recolher os grupos'} onClick={() => recolherVarios(idsGrupos, !todosRecolhidos)} />
        ) : (
          <Botao variante="ghost" tamanho="p" icone={todosRecolhidos ? ChevronsUpDown : ChevronsDownUp}
            onClick={() => recolherVarios(idsGrupos, !todosRecolhidos)}>
            {todosRecolhidos ? 'Abrir os grupos' : 'Recolher os grupos'}
          </Botao>
        ))}
        {!celular && agrupar === 'coluna' && !semResultado && (
          <p className="lista-barra-dica">
            {ordemPropria ? 'Arraste uma linha para o grupo de outra coluna: ela entra no topo.' : 'Arraste uma linha para outro lugar ou para o grupo de outra coluna.'}
          </p>
        )}
      </div>
      {semResultado ? (
        <div className="lista-aviso" role="status">
          <Filter aria-hidden="true" /> Nenhuma demanda com estes filtros.
          <Botao variante="ghost" tamanho="p" onClick={() => definirFiltros({})}>Limpar filtros</Botao>
        </div>
      ) : celular ? (
        <ListaCelular quadroId={quadro.id} grupos={grupos} agrupar={agrupar} recolhidos={recolhidos} alternarGrupo={alternarGrupo} />
      ) : (
        <TabelaLista quadro={quadro} colunas={colunas} etiquetas={etiquetas} grupos={grupos} agrupar={agrupar} ordem={ordem}
          mudarOrdem={mudarOrdem} recolhidos={recolhidos} alternarGrupo={alternarGrupo} todas={todas} agora={agora} abrir={abrir} />
      )}
    </div>
  )
}
