/**
 * Página do quadro /q/:slug (PLANO §2): cabeçalho, filtros na URL (`?f=`, shared/logica/filtros.ts), a visão em
 * `?v=` (quadro | lista | calendario; a escolha de cada quadro fica no aparelho) e o layout escolhido (layouts()).
 * Quadro arquivado ou slug desconhecido: os estados da §4.1. Enquanto o layout carrega: esqueleto com as colunas.
 */
import { Suspense, useCallback, useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Archive, Compass, LayoutGrid } from 'lucide-react'
import type { Coluna, FiltrosQuadro, Quadro, VisaoQuadro } from '@shared/tipos/index.ts'
import { VISOES_QUADRO } from '@shared/tipos/index.ts'
import { aplicarFiltros, codificarFiltros, decodificarFiltros } from '@shared/logica/filtros.ts'
import { ehCardDaColuna } from '@shared/logica/quadro.ts'
import { useEu } from '../../api/auth.ts'
import { chaves } from '../../api/chaves.ts'
import { api } from '../../api/cliente.ts'
import { useClientes, useColunas, useConfig, useDemandasDoQuadro, useEtiquetas, useQuadroPorSlug, useQuadros } from '../../api/seletores.ts'
import { navegar } from '../../dialogos/estado.ts'
import type { PropsLayout } from '../../extensoes/tipos.ts'
import { useTituloAba } from '../../lib/app.ts'
import { useCelular } from '../../lib/midia.ts'
import { useRegistro } from '../../sessao/registro.ts'
import { definirControlePagina } from '../../teclado/controles.ts'
import { useEscopoAtalho } from '../../teclado/escopos.ts'
import { definirQuadroAtual } from '../../teclado/foco.ts'
import { propsBotao } from '../../ui/Botao.tsx'
import { Carregando, Esqueleto, EstadoVazio } from '../../ui/Indicadores.tsx'
import { LimiteErro } from '../../ui/LimiteErro.tsx'
import { CabecalhoQuadro } from '../../quadro/Cabecalho.tsx'
import { useAgora, useVisaoGuardada } from '../../quadro/estado.ts'
import '../../quadro/quadro.css'

const ehVisao = (v: string | null): v is VisaoQuadro => !!v && (VISOES_QUADRO as readonly string[]).includes(v)

/** Esqueleto do layout: as colunas de verdade (nome e cor) com cards em esqueleto (PLANO §4.1). */
function EsqueletoQuadro({ colunas }: { colunas: Coluna[] }) {
  const alturas = [[70, 44], [82], [58, 40], [76]]
  return (
    <Carregando rotulo="Carregando o quadro">
      <div className="ui-quadro" aria-hidden="true">
        {colunas.map((c, i) => (
          <section key={c.id} className="ui-coluna" data-cor={c.cor ?? undefined}>
            <header className="ui-coluna-cabeca">
              <span className="ui-coluna-ponto" />
              <span className="ui-coluna-titulo">{c.nome}</span>
            </header>
            <div className="ui-coluna-cards">
              {alturas.slice(0, 4 - (i % 3)).map((ls, j) => (
                <div key={j} className="ui-cartao">{ls.map((l, k) => <Esqueleto key={k} largura={`${l}%`} altura={k === 0 ? 14 : 11} />)}</div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Carregando>
  )
}

function QuadroAusente({ slug }: { slug: string }) {
  const eu = useEu()
  const quadros = useQuadros()
  const admin = eu.usuario.papel === 'admin'
  const arquivados = useQuery<Quadro[]>({
    queryKey: chaves.quadrosArquivados,
    queryFn: ({ signal }) => api<Quadro[]>('GET', '/api/quadros?arquivados=1', { sinal: signal }),
    staleTime: 60_000,
  })
  useTituloAba('Quadro')
  if (quadros.length === 0) {
    return (
      <div className="quadro-ausente">
        <EstadoVazio icone={LayoutGrid} como="h1" titulo="Nenhum quadro ainda."
          texto={admin ? 'Comece pelos quadros das equipes: um clique cria todos, com as colunas sugeridas.' : 'Peça ao admin para criar os quadros.'}
          acoes={admin ? <Link to="/quadros/novo?equipes=1" {...propsBotao({ variante: 'primario' })}>Criar os quadros das equipes</Link> : undefined} />
      </div>
    )
  }
  if (arquivados.isPending) return <div className="quadro-ausente"><Esqueleto largura={280} altura={20} /></div>
  const foiArquivado = arquivados.data?.some((q) => q.slug === slug)
  return (
    <div className="quadro-ausente">
      {foiArquivado ? (
        <EstadoVazio icone={Archive} como="h1" titulo="Este quadro foi arquivado."
          texto={admin ? 'Restaure em Configurações para ele voltar ao menu com as demandas.' : 'Peça ao admin para restaurar, se precisar dele.'}
          acoes={admin ? <Link to="/config/quadros" {...propsBotao({ variante: 'secundario' })}>Ver quadros arquivados</Link> : undefined} />
      ) : (
        <EstadoVazio icone={Compass} como="h1" titulo="Quadro não encontrado."
          texto="O endereço pode ter mudado. Escolha um quadro no menu."
          acoes={<Link to="/" {...propsBotao({ variante: 'secundario' })}>Ir para o Início</Link>} />
      )}
    </div>
  )
}

function PaginaQuadro({ quadro }: { quadro: Quadro }) {
  const reg = useRegistro()
  const eu = useEu()
  const config = useConfig()
  const agora = useAgora()
  const celular = useCelular()
  const colunas = useColunas(quadro.id)
  const etiquetas = useEtiquetas(quadro.id)
  const todas = useDemandasDoQuadro(quadro.id)
  const clientes = useClientes()
  const [params, setParams] = useSearchParams()
  useTituloAba(quadro.nome)
  useEscopoAtalho('quadro')
  useEffect(() => {
    definirQuadroAtual(quadro.id)
    return () => definirQuadroAtual(null)
  }, [quadro.id])

  // ─────────── filtros (?f=) ───────────
  const f = params.get('f')
  const filtros = useMemo(() => decodificarFiltros(f), [f])
  const definirFiltros = useCallback((novo: FiltrosQuadro) => {
    setParams((p) => {
      const s = codificarFiltros(novo)
      if (s) p.set('f', s)
      else p.delete('f')
      return p
    }, { replace: true })
  }, [setParams])
  useEffect(() => definirControlePagina({
    quadroId: quadro.id,
    alternarSoMinhas: () => definirFiltros({ ...filtros, soMinhas: !filtros.soMinhas }),
    limparFiltros: () => definirFiltros({}),
  }), [quadro.id, filtros, definirFiltros])

  // ─────────── visão (?v=) ───────────
  const layouts = reg.layouts()
  const [guardada, guardar] = useVisaoGuardada(quadro.id)
  const pedida = params.get('v')
  const quer: VisaoQuadro = ehVisao(pedida) ? pedida : guardada ?? 'quadro'
  const layout = layouts.find((l) => l.id === quer) ?? layouts[0]
  const mudarVisao = useCallback((v: VisaoQuadro) => {
    guardar(v)
    setParams((p) => { if (v === 'quadro') p.delete('v'); else p.set('v', v); return p }, { replace: true })
  }, [guardar, setParams])

  // ─────────── demandas ───────────
  const doQuadro = useMemo(() => todas.filter((d) => ehCardDaColuna(d, agora, config.quadroConcluidasDias)), [todas, agora, config.quadroConcluidasDias])
  const ctxFiltros = useMemo(() => ({
    euId: eu.usuario.id,
    agora,
    colunas: new Map(colunas.map((c) => [c.id, c])),
    clientes: new Map(clientes.map((c) => [c.id, c])),
  }), [eu.usuario.id, agora, colunas, clientes])
  const demandas = useMemo(() => aplicarFiltros(doQuadro, filtros, ctxFiltros), [doQuadro, filtros, ctxFiltros])

  // o modal é sobreposto: abre por cima do quadro (o fundo fica com o host de diálogos)
  const abrir = useCallback((numero: number) => navegar(`/d/${numero}`), [])

  const propsLayout: PropsLayout = { quadro, colunas, etiquetas, filtros, definirFiltros, demandas, abrir, celular }
  const Layout = layout ? reg.componenteDe('layouts', layout.id, layout.carregar) : null

  return (
    <div className="tela-quadro" data-fundo={quadro.fundo}>
      <CabecalhoQuadro quadro={quadro} colunas={colunas} etiquetas={etiquetas} eu={eu} reg={reg} layouts={layouts}
        visao={layout?.id ?? 'quadro'} mudarVisao={mudarVisao} filtros={filtros} definirFiltros={definirFiltros}
        visiveis={demandas.length} total={doQuadro.length} />
      {Layout ? (
        <LimiteErro nome={`layout ${layout!.id}`}>
          <Suspense fallback={<EsqueletoQuadro colunas={colunas} />}>
            <Layout {...propsLayout} />
          </Suspense>
        </LimiteErro>
      ) : (
        <div className="quadro-ausente"><EstadoVazio titulo="Nenhuma visão de quadro instalada." /></div>
      )}
    </div>
  )
}

export default function TelaQuadro() {
  const { slug = '' } = useParams()
  const quadro = useQuadroPorSlug(slug)
  if (!quadro) return <QuadroAusente slug={slug} />
  return <PaginaQuadro key={quadro.id} quadro={quadro} />
}
