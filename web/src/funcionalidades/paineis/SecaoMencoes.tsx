/**
 * Início · Menções recentes (F3, ordem 300): as últimas 10 menções a mim (lidas ou não), de GET /api/inicio; a nova
 * chega pelo tempo real. Abrir marca como lida.
 */
import { AtSign } from 'lucide-react'
import { useAgora } from '../../quadro/estado.ts'
import { Botao } from '../../ui/Botao.tsx'
import { EsqueletoLinhas } from '../../ui/Indicadores.tsx'
import { useAcoesSino, useInicioApi } from './api.ts'
import { ItemNotificacao } from './ItemNotificacao.tsx'
import './paineis.css'

export default function SecaoMencoes() {
  const { data, isPending, isError, refetch } = useInicioApi()
  const acoes = useAcoesSino()
  const agora = useAgora()
  const mencoes = data?.mencoes ?? []
  return (
    <section className="pnl-secao pnl-secao-lateral" aria-labelledby="pnl-mencoes-titulo">
      <div className="pnl-secao-topo">
        <h2 className="pnl-secao-titulo" id="pnl-mencoes-titulo">Menções recentes</h2>
      </div>
      {isPending ? <EsqueletoLinhas linhas={3} /> : isError ? (
        <p className="pnl-secao-vazia">
          Não foi possível carregar as menções. <Botao variante="ghost" tamanho="p" onClick={() => void refetch()}>Tentar de novo</Botao>
        </p>
      ) : mencoes.length === 0 ? (
        <p className="pnl-secao-vazia"><AtSign aria-hidden="true" /> Ninguém mencionou você ainda.</p>
      ) : (
        <ul className="pnl-mencoes">
          {mencoes.map((n) => <li key={n.id}><ItemNotificacao n={n} agora={agora} aoAbrir={acoes.abrir} /></li>)}
        </ul>
      )}
    </section>
  )
}
