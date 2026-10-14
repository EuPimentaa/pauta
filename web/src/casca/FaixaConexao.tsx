/**
 * Faixa discreta "Sem conexão · tentando de novo" (PLANO §4.1). O estado vem de lib/conexao.ts, que o cliente SSE do
 * NÚCLEO-WEB alimenta. Quedas curtas (menos de 1,5 s reconectando) não aparecem.
 */
import { useEffect, useState } from 'react'
import { useConexao } from '../lib/conexao.ts'

export function FaixaConexao() {
  const estado = useConexao()
  const [visivel, setVisivel] = useState(false)
  useEffect(() => {
    if (estado === 'online') { setVisivel(false); return }
    if (estado === 'offline') { setVisivel(true); return }
    const t = window.setTimeout(() => setVisivel(true), 1500)
    return () => window.clearTimeout(t)
  }, [estado])
  return (
    <div role="status" aria-live="polite" className="contents">
      {visivel && (
        <div className="casca-faixa">
          <span className="casca-faixa-ponto" aria-hidden="true" />
          Sem conexão · tentando de novo
        </div>
      )}
    </div>
  )
}
