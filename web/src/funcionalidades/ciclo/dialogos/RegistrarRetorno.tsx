/**
 * "Registrar retorno" (Shift+R; F2; SPEC §5.3): a decisão do cliente sobre a última versão enviada, registrada pelo
 * atendimento. Aprovado | Ajuste ("aprovado em parte" é ajuste com só o que muda); quem respondeu (o contato padrão
 * pré-escolhido, ou outra pessoa pelo nome); por onde; no ajuste, os pedidos (cada linha vira um item de "Ajustes
 * R{N+1}"), o motivo e o prazo novo; o print com Ctrl+V vira anexo de evidência.
 */
import { useId, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ImagePlus, Wrench, X } from 'lucide-react'
import type { ArquivoInfo, Canal, DataLocal, HoraLocal, MotivoRodada } from '@shared/tipos/index.ts'
import { MOTIVOS_RODADA, ROTULO_MOTIVO_RODADA } from '@shared/tipos/index.ts'
import { hojeSP } from '@shared/logica/datas.ts'
import { prazoAjustePadrao } from '@shared/logica/ciclo-prazos.ts'
import { linhasParaItens } from '@shared/logica/texto.ts'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { useEnviarArquivo } from '../../../api/arquivos.ts'
import { useClienteDetalhe } from '../../../api/clientes.ts'
import { mensagemDeErro } from '../../../api/cliente.ts'
import { useConfig, useFeriados, useListaFeriados } from '../../../api/seletores.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { Botao, BotaoIcone } from '../../../ui/Botao.tsx'
import { Campo, Selecao } from '../../../ui/Campo.tsx'
import { SeletorData } from '../../../ui/SeletorData.tsx'
import { acoesCiclo } from '../api.ts'
import { arquivosDe } from '../comum.tsx'
import { NaoEncontrada, ctrlEnter, useDemandaAlvo, useDetalheAlvo } from './comum.tsx'

const CANAIS: { valor: Canal; rotulo: string }[] = [
  { valor: 'whatsapp', rotulo: 'WhatsApp' }, { valor: 'email', rotulo: 'E-mail' }, { valor: 'reuniao', rotulo: 'Reunião' }, { valor: 'outro', rotulo: 'Outro' },
]
const OUTRA = '__outra__'

export default function RegistrarRetorno({ params, fechar }: PropsDialogo<'registrar-retorno'>) {
  const qc = useQueryClient()
  const d = useDemandaAlvo(params.demandaId)
  const det = useDetalheAlvo(d)
  const { data: cliente } = useClienteDetalhe(d?.clienteId ?? null)
  const config = useConfig()
  const feriados = useFeriados()
  const listaFeriados = useListaFeriados()
  const enviarArquivo = useEnviarArquivo()
  const idForm = useId()
  const [decisao, setDecisao] = useState<'aprovado' | 'ajuste' | null>(params.decisao ?? null)
  const [contato, setContato] = useState<string | undefined>(undefined)
  const [nomeOutro, setNomeOutro] = useState('')
  const [canal, setCanal] = useState<Canal>('whatsapp')
  const [pedidos, setPedidos] = useState('')
  const [motivo, setMotivo] = useState<MotivoRodada>('cliente_mudou')
  const prazoPadrao = useMemo(() => prazoAjustePadrao(hojeSP(new Date()), config.ajustePrazoDiasUteis, feriados), [config.ajustePrazoDiasUteis, feriados])
  const [prazo, setPrazo] = useState<{ data: DataLocal | null; hora: HoraLocal | null } | null>(null)
  const [print, setPrint] = useState<ArquivoInfo | null>(null)
  const [subindo, setSubindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  if (!d) return <NaoEncontrada fechar={() => fechar(null)} />

  const versao = det?.versoes.find((v) => v.id === d.versaoEnviadaId)
  const contatos = (cliente?.contatos ?? []).filter((c) => c.ativo)
  const escolhido = contato ?? contatos.find((c) => c.padrao)?.id ?? (contatos[0]?.id ?? OUTRA)
  const itens = linhasParaItens(pedidos)
  const sujo = decisao !== null || pedidos.trim() !== '' || !!print
  const proxima = d.rodadaAtual + 1
  const passaInclusas = proxima > d.rodadasInclusas

  async function colar(arquivos: File[]) {
    const imagem = arquivos.find((f) => f.type.startsWith('image/'))
    if (!imagem) return
    setSubindo(true)
    setErro(null)
    try {
      setPrint(await enviarArquivo(imagem))
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setSubindo(false)
    }
  }

  async function registrar() {
    if (enviando || !d) return
    if (!decisao) { setErro('Escolha: aprovado ou ajuste.'); return }
    if (decisao === 'ajuste' && itens.length === 0) { setErro('Escreva os ajustes, um por linha.'); return }
    if (escolhido === OUTRA && !nomeOutro.trim() && contatos.length > 0) { setErro('Diga quem respondeu.'); return }
    setEnviando(true)
    setErro(null)
    try {
      const s = await acoesCiclo(qc).registrarRetorno(d.id, {
        decisao, versaoId: d.versaoEnviadaId ?? undefined, canal,
        contatoId: escolhido === OUTRA ? null : escolhido,
        nomeInformado: escolhido === OUTRA ? (nomeOutro.trim() || null) : null,
        evidenciaArquivoId: print?.id ?? null,
        ...(decisao === 'ajuste' ? {
          linhas: itens, motivo, ...(prazo?.data ? { prazo: prazo.data, prazoHora: prazo.hora } : {}),
        } : {}),
      })
      fechar({ demanda: s.demanda })
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <MolduraDialogo titulo={`Registrar retorno${versao ? ` da V${versao.numero}` : ''}`} descricao={`#${d.numero} ${d.titulo}`} tamanho="m"
      fecharAoClicarFora={!sujo}
      rodape={(
        <>
          <Botao onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" atalho="mod+enter" carregando={enviando} disabled={!d.envioPendenteEm}>
            {decisao === 'ajuste' ? `Registrar ajuste${itens.length ? ` (${itens.length})` : ''}` : 'Registrar aprovação'}
          </Botao>
        </>
      )}>
      <form id={idForm} className="cic-form" onSubmit={(e) => { e.preventDefault(); void registrar() }} onKeyDown={(e) => ctrlEnter(e, () => void registrar())}
        onPaste={(e) => { const a = arquivosDe(e.clipboardData); if (a.length) { e.preventDefault(); void colar(a) } }}>
        {!d.envioPendenteEm && <p className="cic-erro" role="alert">Nada aguardando o cliente nesta demanda.</p>}
        <fieldset className="cic-campo">
          <legend className="cic-rotulo">O que o cliente decidiu</legend>
          <div className="cic-escolhas" role="radiogroup" aria-label="Decisão">
            <button type="button" role="radio" aria-checked={decisao === 'aprovado'} data-tom="sucesso" className="cic-escolha" onClick={() => setDecisao('aprovado')}
              data-autofocus={decisao === null ? '' : undefined}>
              <span className="inline-flex items-center gap-1.5 text-body font-semibold text-fg"><CheckCircle2 aria-hidden="true" className="size-4" />Aprovado</span>
              <span>Vale a versão como está.</span>
            </button>
            <button type="button" role="radio" aria-checked={decisao === 'ajuste'} data-tom="aviso" className="cic-escolha" onClick={() => setDecisao('ajuste')}>
              <span className="inline-flex items-center gap-1.5 text-body font-semibold text-fg"><Wrench aria-hidden="true" className="size-4" />Ajuste</span>
              <span>Inclui "aprovado em parte": só o que muda.</span>
            </button>
          </div>
        </fieldset>
        {decisao === 'ajuste' && (
          <>
            <div className="cic-campo">
              <label className="cic-rotulo" htmlFor={`${idForm}-pedidos`}>Pedidos do cliente</label>
              <div className="ui-entrada ui-entrada-texto">
                <textarea id={`${idForm}-pedidos`} rows={5} value={pedidos} onChange={(e) => setPedidos(e.target.value)} autoFocus
                  aria-describedby={`${idForm}-pedidos-ajuda`} placeholder={'Ex.:\nTrocar a foto principal\nAumentar o logo'} />
              </div>
              <p id={`${idForm}-pedidos-ajuda`} className="cic-ajuda">
                Cada linha vira um item de "Ajustes R{proxima}" (cole a lista que o cliente mandou).
                {passaInclusas ? ` A rodada ${proxima} passa das ${d.rodadasInclusas} inclusas.` : ''}
              </p>
            </div>
            <div className="cic-grade">
              <Selecao rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoRodada)}
                opcoes={MOTIVOS_RODADA.map((m) => ({ valor: m, rotulo: ROTULO_MOTIVO_RODADA[m] }))} />
              <div className="cic-campo">
                <span className="cic-rotulo" id={`${idForm}-prazo`}>Prazo da V{(versao?.numero ?? d.nVersoes) + 1}</span>
                <SeletorData rotulo={`Prazo da rodada ${proxima}`} comHora permitirLimpar={false} valor={prazo?.data ?? prazoPadrao} hora={prazo?.hora ?? null}
                  feriados={listaFeriados} aria-describedby={`${idForm}-prazo`} aoMudar={(data, hora) => setPrazo({ data, hora })} />
              </div>
            </div>
          </>
        )}
        <div className="cic-grade">
          <Selecao rotulo="Quem respondeu" value={escolhido} onChange={(e) => setContato(e.target.value)}
            opcoes={[...contatos.map((c) => ({ valor: c.id, rotulo: `${c.nome}${c.padrao ? ' (padrão)' : ''}` })), { valor: OUTRA, rotulo: 'Outra pessoa' }]} />
          <Selecao rotulo="Por onde" value={canal} onChange={(e) => setCanal(e.target.value as Canal)} opcoes={CANAIS} />
        </div>
        {escolhido === OUTRA && (
          <Campo rotulo="Nome de quem respondeu" value={nomeOutro} maxLength={120} onChange={(e) => setNomeOutro(e.target.value)} opcional={contatos.length === 0} />
        )}
        <div className="cic-campo">
          <span className="cic-rotulo">Print do retorno <span className="cic-ajuda">(opcional)</span></span>
          {print ? (
            <div className="cic-print">
              <img src={print.url} alt="Print colado" />
              <span className="cic-ajuda">{print.nome}: vira anexo de evidência e não sai mais.</span>
              <BotaoIcone icone={X} rotulo="Tirar o print" tamanho="p" onClick={() => setPrint(null)} />
            </div>
          ) : (
            <label className="cic-soltar">
              <ImagePlus aria-hidden="true" className="size-4" />
              <span>{subindo ? 'Enviando o print…' : 'Cole o print do WhatsApp (Ctrl+V) ou escolha a imagem'}</span>
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; void colar(l) }} />
            </label>
          )}
        </div>
        {erro && <p className="cic-erro" role="alert">{erro}</p>}
      </form>
    </MolduraDialogo>
  )
}
