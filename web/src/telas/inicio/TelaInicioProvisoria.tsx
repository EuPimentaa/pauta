/**
 * Início provisório (até o F3): hospeda as seções do Início (secoesInicio(): os Primeiros passos do admin, F5) e a
 * lista dos quadros da pessoa. Quem não tem seção para ver vai direto ao quadro dela (favorito, depois o da equipe,
 * depois um que segue), menos quando esta tela é o fundo de uma sobreposta (aí não pode trocar a URL).
 */
import { Suspense } from 'react'
import { Link, Navigate } from 'react-router'
import { LayoutGrid, Star } from 'lucide-react'
import type { Eu, Quadro } from '@shared/tipos/index.ts'
import { useEu } from '../../api/auth.ts'
import { useEquipes, useQuadros } from '../../api/seletores.ts'
import { useTituloAba } from '../../lib/app.ts'
import { useRegistro } from '../../sessao/registro.ts'
import { useFundo } from '../../sessao/sobreposta.tsx'
import { propsBotao } from '../../ui/Botao.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import './inicio-provisorio.css'

/** Os quadros ativos na ordem de interesse: favoritos, os da equipe, os que segue, os outros. */
export function quadrosEmOrdem(eu: Eu, quadros: readonly Quadro[]): Quadro[] {
  const ativos = quadros.filter((q) => q.arquivadoEm === null)
  const peso = (q: Quadro) => {
    const fav = eu.favoritos.indexOf(q.id)
    if (fav >= 0) return fav
    if (q.equipeId && eu.usuario.equipeIds.includes(q.equipeId)) return 1000
    if (eu.seguindo.includes(q.id)) return 2000
    return 3000
  }
  return [...ativos].sort((a, b) => peso(a) - peso(b) || a.pos - b.pos)
}

export default function TelaInicioProvisoria() {
  useTituloAba('Início')
  const eu = useEu()
  const quadros = useQuadros()
  const equipes = useEquipes()
  const reg = useRegistro()
  const ehFundo = useFundo() !== null
  const secoes = reg.secoesInicio().filter((s) => !s.visivel || s.visivel(eu))
  const lista = quadrosEmOrdem(eu, quadros)
  const admin = eu.usuario.papel === 'admin'

  if (!ehFundo && secoes.length === 0 && lista[0]) return <Navigate to={`/q/${lista[0].slug}`} replace />

  // a equipe só aparece quando diz algo a mais que o nome do quadro ("Criação 2" da Criação)
  const nomeEquipe = (q: Quadro) => {
    const nome = q.equipeId ? equipes.find((e) => e.id === q.equipeId)?.nome ?? null : null
    return nome && nome !== q.nome ? nome : null
  }

  return (
    <div className="inicio-prov">
      <h1 className="inicio-prov-titulo">Início</h1>
      {secoes.map((s) => {
        const C = reg.componenteDe('inicio', s.id, s.carregar)
        return <Suspense key={s.id} fallback={<EsqueletoLinhas linhas={3} />}><C /></Suspense>
      })}
      <section className="inicio-prov-quadros" aria-labelledby="inicio-prov-quadros">
        <h2 id="inicio-prov-quadros" className="inicio-prov-subtitulo">Seus quadros</h2>
        {lista.length === 0 ? (
          <EstadoVazio icone={LayoutGrid} titulo="Nenhum quadro ainda."
            texto={admin ? 'Comece pelos quadros das equipes: um clique cria todos, com as colunas sugeridas.' : 'Peça ao admin para criar os quadros.'}
            acoes={admin ? <Link to="/quadros/novo?equipes=1" {...propsBotao({ variante: 'secundario' })}>Criar os quadros das equipes</Link> : undefined} />
        ) : (
          <ul className="inicio-prov-lista">
            {lista.map((q) => (
              <li key={q.id}>
                <Link to={`/q/${q.slug}`} className="inicio-prov-quadro">
                  <span className="casca-ponto" data-cor={q.cor} aria-hidden="true" />
                  <span className="inicio-prov-nome">{q.nome}</span>
                  {nomeEquipe(q) && <span className="inicio-prov-equipe">{nomeEquipe(q)}</span>}
                  {eu.favoritos.includes(q.id) && <Star className="inicio-prov-estrela" aria-label="favorito" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
