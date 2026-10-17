/**
 * Filtros do quadro no cabeçalho (extensoes/quadro-cabecalho/lista-filtros.tsx; PLANO §3, F6): o campo "Filtrar neste
 * quadro" (texto, número ou cliente; vai para a URL depois de uma pausa na digitação), o botão "Filtros" (F) com o
 * número de filtros ligados, que abre o painel (popover no desktop, folha no celular), e um chip por filtro ativo com
 * o × que o tira. "Só as minhas" (Q), o total e "Limpar" (X) são do cabeçalho do núcleo. Tudo vive em `?f=`.
 */
import './lista.css'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { useClientes, useEtiquetas, useUsuarios } from '../../api/seletores.ts'
import type { PropsCabecalhoQuadro } from '../../extensoes/tipos.ts'
import { useCelular } from '../../lib/midia.ts'
import { Botao } from '../../ui/Botao.tsx'
import { BuscaNoQuadro } from './BuscaNoQuadro.tsx'
import { usePedidoDeFiltros } from './estado.ts'
import { chipsDosFiltros, contarNoPainel, semCampo, type CampoChip } from './logica.ts'

const PainelFiltros = lazy(() => import('./PainelFiltros.tsx'))

const CHIPS_DESKTOP: ReadonlySet<CampoChip> = new Set(['clientes', 'membros', 'etiquetas', 'prazo', 'prioridades', 'comCliente', 'concluidas'])
const CHIPS_CELULAR: ReadonlySet<CampoChip> = new Set([...CHIPS_DESKTOP, 'texto'])

export function FiltrosDoQuadro({ quadro, filtros, definirFiltros, total }: PropsCabecalhoQuadro) {
  const celular = useCelular()
  const [aberto, setAberto] = useState(false)
  const [botao, setBotao] = useState<HTMLButtonElement | null>(null)
  const abrir = useCallback(() => setAberto(true), [])
  usePedidoDeFiltros(abrir)

  const clientes = useClientes()
  const usuarios = useUsuarios()
  const etiquetas = useEtiquetas(quadro.id)
  const chips = useMemo(() => chipsDosFiltros(filtros, {
    clientes: new Map(clientes.map((c) => [c.id, c])),
    usuarios: new Map(usuarios.map((u) => [u.id, u])),
    etiquetas: new Map(etiquetas.map((e) => [e.id, e])),
  }, celular ? CHIPS_CELULAR : CHIPS_DESKTOP), [filtros, clientes, usuarios, etiquetas, celular])
  const n = contarNoPainel(filtros) + (celular && filtros.texto?.trim() ? 1 : 0)
  const tirar = (campo: CampoChip) => definirFiltros(semCampo(filtros, campo))

  return (
    <div className="lista-filtros" data-celular={celular || undefined}>
      {!celular && <BuscaNoQuadro filtros={filtros} definirFiltros={definirFiltros} />}
      <Botao ref={setBotao} variante={n ? 'secundario' : 'ghost'} tamanho="p" icone={SlidersHorizontal} className="lista-filtros-botao"
        aria-haspopup="dialog" aria-expanded={aberto} atalho="f" dica="Filtros" onClick={() => setAberto((a) => !a)}>
        Filtros{n > 0 && <><span className="lista-filtros-n" aria-hidden="true">{n}</span><span className="sr-only">, {n} {n === 1 ? 'ativo' : 'ativos'}</span></>}
      </Botao>
      {chips.length > 0 && (
        <ul className="lista-chips" aria-label="Filtros ativos">
          {chips.map((c) => (
            <li key={c.campo} className="lista-chip">
              <span className="lista-chip-texto">{c.rotulo}</span>
              <button type="button" className="lista-chip-tirar" aria-label={c.tirar} onClick={() => tirar(c.campo)}>
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {aberto && (
        <Suspense fallback={null}>
          <PainelFiltros ancora={botao} aoFechar={() => setAberto(false)} quadro={quadro} filtros={filtros}
            definirFiltros={definirFiltros} total={total} celular={celular} />
        </Suspense>
      )}
    </div>
  )
}
