/**
 * Início (F3): saudação com o resumo do dia ("3 atrasadas · 2 para hoje · 4 com o cliente") e as seções de
 * secoesInicio() na ordem (PLANO §4): Primeiros passos do admin (F5, 50), Minhas demandas (100), Com o cliente há mais
 * de N dias úteis (200) e Menções recentes (300). No desktop largo, as duas últimas vão para a coluna da direita.
 */
import { Suspense, type MouseEvent } from 'react'
import type { ExtensaoSecaoInicio } from '../../extensoes/tipos.ts'
import { useEu } from '../../api/auth.ts'
import { useDadosInicio } from '../../funcionalidades/paineis/inicio.ts'
import { dataPorExtenso, partesDoResumo, saudacao } from '../../funcionalidades/paineis/logica.ts'
import { useTituloAba } from '../../lib/app.ts'
import { hojeLocal } from '../../lib/datas.ts'
import { useAgora } from '../../quadro/estado.ts'
import { useRegistro } from '../../sessao/registro.ts'
import { EsqueletoLinhas } from '../../ui/Indicadores.tsx'
import '../../funcionalidades/paineis/paineis.css'

/** Seções que ficam na coluna da direita no desktop largo (as outras, inclusive as de outras funcionalidades, à esquerda). */
const LATERAIS = new Set(['paineis-cliente-parado', 'paineis-mencoes'])

function Secoes({ secoes }: { secoes: ExtensaoSecaoInicio[] }) {
  const reg = useRegistro()
  return (
    <>
      {secoes.map((s) => {
        const C = reg.componenteDe('inicio', s.id, s.carregar)
        return (
          <div key={s.id} className="pnl-inicio-secao" data-secao={s.id}>
            <Suspense fallback={<EsqueletoLinhas linhas={3} />}><C /></Suspense>
          </div>
        )
      })}
    </>
  )
}

/** O link do resumo rola até o grupo e põe o foco no título dele (sem mudar a URL: o # não vale na SPA). */
function irPara(e: MouseEvent<HTMLAnchorElement>, id: string) {
  const alvo = document.getElementById(id)
  if (!alvo) return
  e.preventDefault()
  alvo.scrollIntoView({ block: 'start', behavior: 'smooth' })
  alvo.focus({ preventScroll: true })
}

export default function TelaInicio() {
  useTituloAba('Início')
  const eu = useEu()
  const reg = useRegistro()
  const agora = useAgora()
  const { resumo, minhas } = useDadosInicio()
  const secoes = reg.secoesInicio().filter((s) => !s.visivel || s.visivel(eu))
  const principais = secoes.filter((s) => !LATERAIS.has(s.id))
  const laterais = secoes.filter((s) => LATERAIS.has(s.id))
  const nome = eu.usuario.apelido ?? eu.usuario.nome.split(' ')[0]
  const partes = partesDoResumo(resumo)
  const temMinhas = Object.values(minhas).some((l) => l.length > 0)

  return (
    <div className="pnl-inicio">
      <header className="pnl-inicio-topo">
        <p className="pnl-inicio-data">{dataPorExtenso(hojeLocal(agora))}</p>
        <h1 className="pnl-inicio-titulo">{saudacao(agora)}, {nome}</h1>
        {temMinhas && (
          <p className="pnl-inicio-resumo">
            {partes.length === 0 ? 'Nada atrasado nem para hoje.' : partes.map((p, i) => (
              <span key={p.id}>
                {i > 0 && <span className="pnl-inicio-sep" aria-hidden="true"> · </span>}
                {p.id === 'cliente'
                  ? <span className="pnl-inicio-parte" data-tom={p.id}>{p.texto}</span>
                  : <a href={`#pnl-${p.id}`} className="pnl-inicio-parte" data-tom={p.id} onClick={(e) => irPara(e, `pnl-${p.id}`)}>{p.texto}</a>}
              </span>
            ))}
          </p>
        )}
      </header>
      <div className="pnl-inicio-grade" data-com-lateral={laterais.length > 0 || undefined}>
        <div className="pnl-inicio-principal"><Secoes secoes={principais} /></div>
        {laterais.length > 0 && <div className="pnl-inicio-lateral"><Secoes secoes={laterais} /></div>}
      </div>
    </div>
  )
}
