/**
 * Cabeçalho da página do quadro (PLANO §2, "Página do quadro"): ponto na cor e nome (o admin edita clicando), estrela
 * (useFavoritar do DS), os slots cabecalhoQuadro() à esquerda e à direita, o total de demandas, "Só as minhas" (Q),
 * "Limpar filtros" (X), o seletor Quadro | Lista | Calendário (layouts(); some sem outro layout instalado) e o menu
 * ··· (menuQuadro(): Seguir, Copiar link e o que vier das funcionalidades); a descrição do quadro, quando há, embaixo.
 */
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Star, UserRound, X } from 'lucide-react'
import type { Coluna, Etiqueta, Eu, FiltrosQuadro, Quadro, VisaoQuadro } from '@shared/tipos/index.ts'
import { temFiltros } from '@shared/logica/filtros.ts'
import { useFavoritar } from '../api/menu.ts'
import { useEditarQuadro } from '../api/quadros.ts'
import { contextoAcaoAgora } from '../dialogos/contexto.ts'
import type { ContextoQuadro, ExtensaoLayout } from '../extensoes/tipos.ts'
import type { Ancora } from '../lib/posicao.ts'
import type { ModuloRegistro } from '../sessao/registro.ts'
import { Abas } from '../ui/Abas.tsx'
import { Botao, BotaoIcone } from '../ui/Botao.tsx'
import { Campo } from '../ui/Campo.tsx'
import { LimiteErro } from '../ui/LimiteErro.tsx'
import { MenuFlutuante, type ItemMenuUi } from '../ui/Menu.tsx'

interface Props {
  quadro: Quadro
  colunas: Coluna[]
  etiquetas: Etiqueta[]
  eu: Eu
  reg: ModuloRegistro
  layouts: readonly ExtensaoLayout[]
  visao: VisaoQuadro
  mudarVisao(v: VisaoQuadro): void
  filtros: FiltrosQuadro
  definirFiltros(f: FiltrosQuadro): void
  visiveis: number
  total: number
}

function NomeDoQuadro({ quadro, admin }: { quadro: Quadro; admin: boolean }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(quadro.nome)
  const editar = useEditarQuadro()
  const feito = useRef(false)
  if (!admin) return <h1 className="quadro-nome">{quadro.nome}</h1>
  if (!editando) {
    return (
      <h1 className="contents">
        <button type="button" className="quadro-nome" title="Renomear o quadro" onClick={() => { feito.current = false; setNome(quadro.nome); setEditando(true) }}>
          {quadro.nome}
        </button>
      </h1>
    )
  }
  const salvar = () => {
    if (feito.current) return
    feito.current = true
    setEditando(false)
    const novo = nome.trim()
    if (novo && novo !== quadro.nome) void editar(quadro, { nome: novo })
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); salvar() }}>
      <Campo rotulo="Nome do quadro" rotuloOculto value={nome} maxLength={80} autoFocus className="quadro-nome-campo"
        onFocus={(e) => e.currentTarget.select()} onChange={(e) => setNome(e.target.value)} onBlur={salvar}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); feito.current = true; setEditando(false) } }} />
    </form>
  )
}

export function CabecalhoQuadro(p: Props) {
  const { quadro, eu, reg, filtros } = p
  const qc = useQueryClient()
  const favoritar = useFavoritar()
  const [menu, setMenu] = useState<{ ancora: Ancora; itens: ItemMenuUi[] } | null>(null)
  const favorito = eu.favoritos.includes(quadro.id)
  const filtrando = temFiltros(filtros)
  const slots = reg.cabecalhoQuadro()
  const propsSlot = { quadro, layout: p.visao, filtros, definirFiltros: p.definirFiltros, total: p.visiveis }
  const ctxQuadro: ContextoQuadro = { quadro, colunas: p.colunas, etiquetas: p.etiquetas, eu }

  function abrirMenu(ancora: HTMLElement) {
    const acao = contextoAcaoAgora(qc)
    const itens: ItemMenuUi[] = []
    let faixa = -1
    for (const i of reg.menuQuadro()) {
      let ok = true
      try { ok = !i.visivel || i.visivel(ctxQuadro) } catch (e) { console.error(`[menu do quadro] ${i.id}.visivel falhou`, e); ok = false }
      if (!ok) continue
      const f = i.ordem >= 800 ? 2 : i.ordem >= 200 ? 1 : 0
      if (faixa >= 0 && f !== faixa) itens.push({ tipo: 'separador', id: `sep-${i.id}` })
      faixa = f
      itens.push({ id: i.id, rotulo: i.rotulo, icone: i.icone, perigo: i.perigo, executar: () => i.executar(ctxQuadro, acao) })
    }
    setMenu({ ancora, itens })
  }

  const totalTexto = filtrando
    ? `${p.visiveis} de ${p.total} ${p.total === 1 ? 'demanda' : 'demandas'}`
    : `${p.total} ${p.total === 1 ? 'demanda' : 'demandas'}`

  return (
    <div className="quadro-cabeca">
      <div className="quadro-titulo" data-cor={quadro.cor}>
        <span className="quadro-titulo-ponto" aria-hidden="true" />
        <NomeDoQuadro quadro={quadro} admin={eu.usuario.papel === 'admin'} />
        <BotaoIcone icone={Star} className="quadro-estrela" rotulo={favorito ? 'Tirar a estrela' : 'Pôr estrela'} aria-pressed={favorito}
          onClick={() => void favoritar(quadro.id, !favorito)} />
      </div>
      <div className="quadro-cabeca-lado">
        {slots.filter((s) => s.lado === 'esquerda').map((s) => (
          <LimiteErro key={s.id} nome={`cabeçalho ${s.id}`} fallback={null}><s.Componente {...propsSlot} /></LimiteErro>
        ))}
      </div>
      <span className="quadro-cabeca-espaco" />
      <div className="quadro-cabeca-lado">
        {slots.filter((s) => s.lado === 'direita').map((s) => (
          <LimiteErro key={s.id} nome={`cabeçalho ${s.id}`} fallback={null}><s.Componente {...propsSlot} /></LimiteErro>
        ))}
        <span className="quadro-total" aria-live="polite">{totalTexto}</span>
        <Botao variante="ghost" tamanho="p" icone={UserRound} aria-pressed={!!filtros.soMinhas} atalho="q" dica="Só as minhas"
          onClick={() => p.definirFiltros({ ...filtros, soMinhas: !filtros.soMinhas })}>
          Só as minhas
        </Botao>
        {filtrando && (
          <Botao variante="ghost" tamanho="p" icone={X} atalho="x" dica="Limpar os filtros" onClick={() => p.definirFiltros({})}>Limpar</Botao>
        )}
        {p.layouts.length > 1 && (
          <Abas rotulo="Visão do quadro" abas={p.layouts.map((l) => ({ id: l.id, rotulo: l.rotulo, icone: l.icone }))} ativa={p.visao}
            aoMudar={(v) => p.mudarVisao(v as VisaoQuadro)} />
        )}
        <BotaoIcone icone={MoreHorizontal} rotulo="Mais ações do quadro" aria-haspopup="menu" aria-expanded={!!menu}
          className="quadro-mais" onClick={(e) => abrirMenu(e.currentTarget)} />
      </div>
      {quadro.descricao.trim() && <p className="quadro-descricao">{quadro.descricao}</p>}
      {menu && <MenuFlutuante aberto aoFechar={() => setMenu(null)} ancora={menu.ancora} itens={menu.itens} rotulo={`Ações do quadro ${quadro.nome}`} alinhar="fim" />}
    </div>
  )
}
