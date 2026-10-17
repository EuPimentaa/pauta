/**
 * Início · Com o cliente há mais de N dias úteis (F3, ordem 200; atendimento, e o admin nas que são dele como AM):
 * as do meu atendimento paradas com o cliente, mais antigas primeiro, com "Copiar lembrete" (diálogo copiar-whatsapp
 * do F2) e "Registrar retorno" (F2) só com envio pendente; sem envio pendente, "Abrir".
 */
import { Copy, ExternalLink, MessageSquareReply } from 'lucide-react'
import { useEu } from '../../api/auth.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { CardDemanda } from '../../quadro/index.ts'
import { useAbrirSobreposta } from '../../sessao/sobreposta.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { useDadosInicio } from './inicio.ts'
import './paineis.css'

const diasUteis = (n: number) => `${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`

export default function SecaoClienteParado() {
  const eu = useEu()
  const { parado, porId, limiteParado } = useDadosInicio()
  const abrirDialogo = useAbrirDialogo()
  const abrir = useAbrirSobreposta()
  const itens = parado.map((p) => ({ ...p, d: porId.get(p.id) })).filter((p) => !!p.d)
  // o admin só vê o bloco quando há algo dele; o atendimento sempre (sabe que está sendo acompanhado)
  if (itens.length === 0 && eu.usuario.papel !== 'atendimento') return null
  const titulo = `Com o cliente há mais de ${diasUteis(limiteParado)}`
  return (
    <section className="pnl-secao pnl-secao-lateral" aria-labelledby="pnl-parado-titulo">
      <div className="pnl-secao-topo">
        <h2 className="pnl-secao-titulo" id="pnl-parado-titulo">{titulo}</h2>
        {itens.length > 0 && <span className="pnl-secao-conta tabular">{itens.length}</span>}
      </div>
      {itens.length === 0 ? (
        <p className="pnl-secao-vazia">Nenhuma peça parada com o cliente.</p>
      ) : (
        <ul className="pnl-parados">
          {itens.map(({ id, dias, d }) => (
            <li key={id} className="pnl-parado">
              <p className="pnl-parado-ha"><span className="tabular">{diasUteis(dias)}</span> com o cliente</p>
              <CardDemanda demanda={d!} compacto mostrarQuadro />
              <div className="pnl-parado-acoes">
                <Botao variante="ghost" tamanho="p" icone={Copy} onClick={() => void abrirDialogo('copiar-whatsapp', { demandaId: id, modelo: 'lembrete' })}>
                  Copiar lembrete
                </Botao>
                {d!.envioPendenteEm
                  ? <Botao variante="ghost" tamanho="p" icone={MessageSquareReply} onClick={() => void abrirDialogo('registrar-retorno', { demandaId: id })}>Registrar retorno</Botao>
                  : <Botao variante="ghost" tamanho="p" icone={ExternalLink} onClick={() => abrir(`/d/${d!.numero}`)}>Abrir</Botao>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
