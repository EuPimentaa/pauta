/** Só DEV: um host mínimo das seções do Início (o de verdade é do F3), para o roteiro do F5. */
import { Suspense } from 'react'
import { useEu } from '../../../api/auth.ts'
import { useRegistro } from '../../../sessao/registro.ts'
import { EsqueletoLinhas } from '../../../ui/Indicadores.tsx'

export default function TelaInicioDev() {
  const eu = useEu()
  const reg = useRegistro()
  const secoes = reg.secoesInicio().filter((s) => !s.visivel || s.visivel(eu))
  return (
    <div className="cad-pagina">
      <h1 className="cad-titulo">Início (teste do F5)</h1>
      {secoes.map((s) => {
        const C = reg.componenteDe('inicio', s.id, s.carregar)
        return <Suspense key={s.id} fallback={<EsqueletoLinhas linhas={3} />}><C /></Suspense>
      })}
      {secoes.length === 0 && <p className="cad-nota">Nenhuma seção visível.</p>}
    </div>
  )
}
