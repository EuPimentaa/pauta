/** Moldura das telas de acesso: palco da marca + cartão com a barra assinatura. */
import '../../estilos/auth.css'
import type { ReactNode } from 'react'
import { KanbanSquare, Radio, ShieldCheck } from 'lucide-react'
import { useNomeApp } from '../../lib/app.ts'
import { BarraAssinatura, Logo } from '../../ui/Marca.tsx'

export function LayoutAuth({ titulo, subtitulo, children, rodape }: { titulo: ReactNode; subtitulo?: ReactNode; children: ReactNode; rodape?: ReactNode }) {
  const nome = useNomeApp()
  return (
    <div className="auth">
      <section className="auth-palco chrome-dark" aria-label={`${nome}, da Melt`}>
        <span className="auth-marca-dagua" aria-hidden="true" />
        <div className="auth-palco-topo">
          <Logo altura={26} />
          <span className="auth-eyebrow">{nome}</span>
        </div>
        <div className="auth-chamada">
          <p className="auth-eyebrow">As demandas da agência</p>
          <p className="auth-titulo">Do briefing à aprovação, <em>num quadro só.</em></p>
          <p className="auth-sub">Os quadros de cada equipe, as versões de cada peça e o retorno do cliente no mesmo lugar, ao vivo para todo mundo.</p>
        </div>
        <ul className="auth-pontos">
          <li className="auth-ponto"><KanbanSquare aria-hidden="true" /><strong>Quadros por equipe</strong><span>Colunas, cards e etiquetas como você já usa.</span></li>
          <li className="auth-ponto"><ShieldCheck aria-hidden="true" /><strong>Aprovação por link</strong><span>O cliente aprova ou pede ajuste sem criar conta.</span></li>
          <li className="auth-ponto"><Radio aria-hidden="true" /><strong>Ao vivo</strong><span>Moveu, todo mundo vê na hora.</span></li>
        </ul>
      </section>
      <main className="auth-lado">
        <div className="auth-cartao">
          <BarraAssinatura className="auth-assinatura" />
          <div className="auth-cartao-corpo">
            <h1>{titulo}</h1>
            {subtitulo && <p className="auth-cartao-sub">{subtitulo}</p>}
            {children}
          </div>
          {rodape && <div className="auth-rodape">{rodape}</div>}
        </div>
      </main>
    </div>
  )
}
