/**
 * Linha do estado do ciclo no topo do modal (F2; seção `topo`, logo abaixo de "na coluna … do quadro …"): o que
 * importa num card com versão sem rolar até "Versões e aprovação" ("V1 enviada por link a Luíza · retorno até ter,
 * 20/10", "V2 aprovada por Carla · sáb, 17/10", "Ajuste pedido na V1 · R2 até seg, 19/10"). O clique leva à seção.
 */
import './ciclo.css'
import type { LucideIcon } from 'lucide-react'
import { CheckCircle2, ChevronDown, Clock3, Send, Wrench } from 'lucide-react'
import { dataLocalDe, formatarPrazo } from '@shared/logica/datas.ts'
import type { ContextoDemanda } from '../../extensoes/tipos.ts'
import { useClienteDetalhe } from '../../api/clientes.ts'
import { useMenosMovimento } from '../../lib/midia.ts'
import { passoCiclo, ultimaDecisao } from './logica.ts'

const CANAL: Record<string, string> = { whatsapp: 'pelo WhatsApp', email: 'por e-mail', reuniao: 'em reunião', outro: 'por fora' }

export default function EstadoTopo({ ctx }: { ctx: ContextoDemanda }) {
  const d = ctx.demanda
  const det = ctx.detalhe
  const { data: cliente } = useClienteDetalhe(d.clienteId)
  const menosMovimento = useMenosMovimento()
  const contato = (id: string | null) => (id ? cliente?.contatos.find((c) => c.id === id)?.nome ?? null : null)
  const passo = passoCiclo(d)
  const numero = (id: string | null) => det?.versoes.find((v) => v.id === id)?.numero ?? d.nVersoes

  let tom: 'cliente' | 'sucesso' | 'aviso' | 'neutro' = 'neutro'
  let Icone: LucideIcon = Send
  let texto: string | null = null
  if (passo === 'com_cliente') {
    tom = 'cliente'
    Icone = Clock3
    const envio = det?.envios.filter((e) => e.versaoId === d.versaoEnviadaId).at(-1)
    const para = contato(envio?.contatoId ?? null)
    const como = !envio ? 'com o cliente' : envio.via === 'link' ? 'enviada por link' : `enviada ${CANAL[envio.canal ?? 'outro'] ?? 'por fora'}`
    texto = `V${numero(d.versaoEnviadaId)} ${como}${para ? ` a ${para}` : ''}${envio?.prazoRetorno ? ` · retorno até ${formatarPrazo(envio.prazoRetorno, null)}` : ''}`
  } else if (passo === 'aprovada') {
    tom = 'sucesso'
    Icone = CheckCircle2
    const a = det ? ultimaDecisao(det.aprovacoes) : null
    const quem = a ? contato(a.contatoId) ?? a.nomeInformado : null
    texto = `V${numero(d.aprovadaVersaoId)} aprovada${quem ? ` por ${quem}` : ''}${a ? ` · ${formatarPrazo(dataLocalDe(a.criadoEm), null)}` : ''}`
  } else if (passo === 'ajuste') {
    tom = 'aviso'
    Icone = Wrench
    const a = det ? ultimaDecisao(det.aprovacoes) : null
    const r = a?.rodadaAbertaId ? det?.rodadas.find((x) => x.id === a.rodadaAbertaId) : det?.rodadas.find((x) => !x.fechadaEm)
    const v = a?.decisao === 'ajuste' ? numero(a.versaoId) : numero(d.versaoAtualId)
    texto = `Ajuste pedido na V${v}${r?.prazo ? ` · R${r.numero} até ${formatarPrazo(r.prazo, null)}` : ''}`
  } else if (passo === 'nao_enviada') {
    texto = `V${numero(d.versaoAtualId)} entregue, ainda não enviada ao cliente`
  }
  if (!texto) return null

  function irParaVersoes(e: React.MouseEvent<HTMLButtonElement>) {
    const secao = e.currentTarget.closest('.modal-demanda')?.querySelector<HTMLElement>('[data-secao="versoes"]')
    if (!secao) return
    secao.scrollIntoView({ behavior: menosMovimento ? 'auto' : 'smooth', block: 'start' })
    secao.querySelector<HTMLElement>('h3')?.setAttribute('tabindex', '-1')
    secao.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true })
  }

  return (
    <button type="button" className="cic-estado-topo" data-tom={tom} onClick={irParaVersoes} title="Ver em Versões e aprovação">
      <Icone aria-hidden="true" />
      <span>{texto}</span>
      <ChevronDown aria-hidden="true" className="cic-estado-topo-seta" />
    </button>
  )
}
