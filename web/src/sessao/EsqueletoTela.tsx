/** Esqueleto genérico de tela (nada de spinner na tela toda, PLANO §4.1): cabeçalho + colunas com cards. */
import { Carregando, Esqueleto } from '../ui/Indicadores.tsx'

const LARGURAS = [['72%', '48%'], ['86%'], ['64%', '40%'], ['78%'], ['58%', '44%']]

/** Cabeçalho + colunas com cards: o formato mais comum das telas (o quadro, a Agenda, o Início). */
export function EsqueletoTela() {
  return (
    <Carregando rotulo="Carregando a tela">
      <div className="flex flex-col gap-6 p-6 max-desk:p-4" aria-hidden="true">
        <div className="flex items-center gap-3">
          <Esqueleto largura={10} altura={10} raio={999} />
          <Esqueleto largura={180} altura={22} />
          <span className="flex-1" />
          <Esqueleto largura={220} altura={32} raio={10} className="max-desk:hidden" />
        </div>
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((c) => (
            <div key={c} className="flex w-[280px] flex-none flex-col gap-2 rounded-lg bg-sunken p-3 max-desk:w-full" style={{ opacity: 1 - c * 0.18 }}>
              <div className="mb-1 flex items-center gap-2 px-1">
                <Esqueleto largura={8} altura={8} raio={999} />
                <Esqueleto largura={90 + c * 14} altura={14} />
              </div>
              {LARGURAS.slice(0, 5 - c).map((ls, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md bg-surface p-3 shadow-card">
                  {ls.map((l, j) => <Esqueleto key={j} largura={l} altura={j === 0 ? 14 : 11} />)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Carregando>
  )
}
