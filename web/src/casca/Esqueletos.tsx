/** Esqueleto da casca enquanto o bootstrap chega (o CSS da casca viaja com este módulo, fora do chunk de entrada). */
import '../estilos/casca.css'
import { EsqueletoTela } from '../sessao/EsqueletoTela.tsx'
import { Esqueleto } from '../ui/Indicadores.tsx'
import { MarcaProduto } from '../ui/Marca.tsx'

export { EsqueletoTela }

/** Enquanto o bootstrap chega: a casca com a barra e o menu em esqueleto. */
export function EsqueletoCasca() {
  return (
    <div className="casca">
      <header className="casca-topo chrome-dark vidro-plano">
        <span className="casca-marca"><MarcaProduto /></span>
        <span className="casca-topo-espaco" />
        <Esqueleto largura={30} altura={30} raio={999} className="mr-2" />
      </header>
      <nav className="casca-menu vidro-plano max-desk:hidden" aria-hidden="true">
        <div className="casca-menu-rolagem flex flex-col gap-2">
          {[70, 56, 62].map((l, i) => <div key={i} className="flex items-center gap-3 px-2.5 py-2"><Esqueleto largura={18} altura={18} raio={5} /><Esqueleto largura={`${l}%`} altura={12} /></div>)}
          <Esqueleto largura={60} altura={10} className="mx-2.5 mt-4" />
          {[64, 48, 72, 52, 58].map((l, i) => <div key={i} className="flex items-center gap-3 px-3.5 py-2"><Esqueleto largura={8} altura={8} raio={99} /><Esqueleto largura={`${l}%`} altura={12} /></div>)}
        </div>
      </nav>
      <main className="casca-conteudo"><EsqueletoTela /></main>
    </div>
  )
}
