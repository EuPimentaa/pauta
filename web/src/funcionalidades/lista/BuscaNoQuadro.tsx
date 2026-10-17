/**
 * "Filtrar neste quadro" (texto, número ou cliente; shared/logica/filtros.ts): no cabeçalho do quadro no desktop e no
 * topo da folha de filtros no celular. Esc limpa; Enter aplica na hora.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { TEXTO_FILTRO_MAX } from '@shared/logica/filtros.ts'
import type { PropsCabecalhoQuadro } from '../../extensoes/tipos.ts'
import { Campo } from '../../ui/Campo.tsx'

/** "Filtrar neste quadro": digita à vontade, a URL muda 200 ms depois da última tecla (o quadro não refaz a cada letra). */
export function BuscaNoQuadro({ filtros, definirFiltros, rotuloVisivel }: Pick<PropsCabecalhoQuadro, 'filtros' | 'definirFiltros'> & { rotuloVisivel?: boolean }) {
  const daUrl = filtros.texto ?? ''
  const [texto, setTexto] = useState(daUrl)
  const enviado = useRef(daUrl)
  const filtrosAgora = useRef(filtros)
  filtrosAgora.current = filtros
  // mudou por fora (Limpar, X, voltar no histórico): o campo acompanha
  useEffect(() => {
    if (daUrl !== enviado.current) { enviado.current = daUrl; setTexto(daUrl) }
  }, [daUrl])
  const enviar = useCallback((t: string) => {
    enviado.current = t
    definirFiltros({ ...filtrosAgora.current, texto: t })
  }, [definirFiltros])
  useEffect(() => {
    if (texto === enviado.current) return
    const espera = setTimeout(() => enviar(texto), 200)
    return () => clearTimeout(espera)
  }, [texto, enviar])
  return (
    <Campo
      rotulo="Filtrar neste quadro"
      rotuloOculto={!rotuloVisivel}
      tamanho="p"
      type="search"
      icone={Search}
      placeholder="Filtrar neste quadro"
      className="lista-busca"
      value={texto}
      maxLength={TEXTO_FILTRO_MAX}
      autoComplete="off"
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); enviar(texto) }
        if (e.key === 'Escape' && texto) { e.preventDefault(); e.stopPropagation(); setTexto(''); enviar('') }
      }}
      sufixo={texto ? (
        <button type="button" className="lista-busca-limpar" aria-label="Limpar a busca" onClick={() => { setTexto(''); enviar('') }}>
          <X aria-hidden="true" />
        </button>
      ) : undefined}
    />
  )
}
