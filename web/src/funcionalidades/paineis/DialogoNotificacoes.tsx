/**
 * Diálogo `notificacoes` (F3): a lista do sino. Popover ancorado no sino da barra (desktop) e folha no celular (aba
 * Sino). Todas | Não lidas, "Marcar todas como lidas", as mais antigas sob demanda; clicar abre a demanda e marca
 * como lida. Vazio: "Nenhuma notificação."
 */
import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import type { PropsDialogo } from '../../extensoes/tipos.ts'
import { MolduraDialogo } from '../../dialogos/index.ts'
import { useAgora } from '../../quadro/estado.ts'
import { Abas } from '../../ui/Abas.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import { useAcoesSino, useNotificacoes } from './api.ts'
import { ItemNotificacao } from './ItemNotificacao.tsx'
import { registrarSinoAberto } from './sino-estado.ts'
import './paineis.css'

type Filtro = 'todas' | 'nao_lidas'

export default function DialogoNotificacoes({ fechar }: PropsDialogo<'notificacoes'>) {
  const { data, isPending, isError, refetch } = useNotificacoes()
  const acoes = useAcoesSino()
  const agora = useAgora()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [carregando, setCarregando] = useState(false)

  // o sino da barra fecha o diálogo aberto (clicar de novo no sino)
  useEffect(() => registrarSinoAberto(() => fechar({ fechado: true })), [fechar])

  const itens = useMemo(() => (data?.itens ?? []).filter((n) => filtro === 'todas' || n.lidaEm === null), [data, filtro])
  const naoLidas = data?.naoLidas ?? 0
  const maiorId = data?.itens[0]?.id

  async function maisAntigas() {
    setCarregando(true)
    try { await acoes.maisAntigas() } finally { setCarregando(false) }
  }

  return (
    <MolduraDialogo titulo="Notificações" largura={400}>
      <div className="pnl-sino">
        <div className="pnl-sino-topo">
          <Abas rotulo="Mostrar" ativa={filtro} aoMudar={setFiltro}
            abas={[{ id: 'todas', rotulo: 'Todas' }, { id: 'nao_lidas', rotulo: 'Não lidas', contador: naoLidas || undefined }]} />
          <Botao variante="ghost" tamanho="p" icone={CheckCheck} disabled={naoLidas === 0}
            onClick={() => void acoes.marcar(maiorId !== undefined ? { ate: maiorId } : {})}>
            Marcar todas como lidas
          </Botao>
        </div>
        {isPending ? (
          <div className="pnl-sino-carregando" aria-busy="true"><EsqueletoLinhas linhas={4} /></div>
        ) : isError ? (
          <EstadoVazio icone={Bell} titulo="Não foi possível carregar as notificações." tamanho="p"
            acoes={<Botao tamanho="p" onClick={() => void refetch()}>Tentar de novo</Botao>} />
        ) : itens.length === 0 ? (
          <EstadoVazio icone={Bell} tamanho="p" titulo={filtro === 'todas' ? 'Nenhuma notificação.' : 'Nenhuma notificação não lida.'} />
        ) : (
          <ul className="pnl-sino-lista" aria-label={filtro === 'todas' ? 'Notificações' : 'Notificações não lidas'}>
            {itens.map((n) => (
              <li key={n.id}>
                <ItemNotificacao n={n} agora={agora} aoAbrir={(x) => { acoes.abrir(x); fechar({ fechado: true }) }} />
              </li>
            ))}
          </ul>
        )}
        {data?.proximo && !isPending && (
          <div className="pnl-sino-mais">
            <Botao variante="ghost" tamanho="p" carregando={carregando} onClick={() => void maisAntigas()}>Ver as mais antigas</Botao>
          </div>
        )}
      </div>
    </MolduraDialogo>
  )
}
