/**
 * "Enviar ao cliente" (F2; SPEC §5.3): a última versão entregue (lista compacta, para Como enviar, Para quem e o prazo
 * caberem na primeira dobra), o contato (o padrão do cliente pré-escolhido), [Gerar link] ou [Enviei por fora]
 * (WhatsApp, e-mail, reunião, outro) e o prazo de retorno. Por link, testa o Drive dos itens ao abrir: privado bloqueia
 * o link com [Abrir compartilhamento] [Testar de novo] [Enviar arquivo (até 10 MB)]. Versão só com caminho de rede: o
 * cliente não veria nada, então só "Enviei por fora" (ou acrescentar um arquivo). Depois de enviar, mostra o link, o
 * texto pronto para o WhatsApp e "Movida para Atendimento › Com o cliente" quando a automação roda.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Link2, Loader2, RotateCcw, Send, Upload } from 'lucide-react'
import type { Canal, DataLocal, EnviarAoClienteSaida, HoraLocal, VersaoComItens } from '@shared/tipos/index.ts'
import { hojeSP } from '@shared/logica/datas.ts'
import { prazoRetornoPadrao } from '@shared/logica/ciclo-prazos.ts'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { useEnviarArquivo } from '../../../api/arquivos.ts'
import { useClienteDetalhe } from '../../../api/clientes.ts'
import { mensagemDeErro, ehErroDaApi } from '../../../api/cliente.ts'
import { useConfig, useFeriados, useListaFeriados } from '../../../api/seletores.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { avisar } from '../../../ui/avisos.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { Selecao } from '../../../ui/Campo.tsx'
import { SeletorData } from '../../../ui/SeletorData.tsx'
import { CopiarTexto, copiarParaAreaDeTransferencia } from '../../../ui/Texto.tsx'
import { acoesCiclo, lugarDe } from '../api.ts'
import { ItemVersao } from '../comum.tsx'
import { NaoEncontrada, ctrlEnter, useDemandaAlvo, useDetalheAlvo } from './comum.tsx'

const CANAIS: { valor: Canal; rotulo: string }[] = [
  { valor: 'whatsapp', rotulo: 'WhatsApp' }, { valor: 'email', rotulo: 'E-mail' }, { valor: 'reuniao', rotulo: 'Reunião' }, { valor: 'outro', rotulo: 'Outro' },
]

type Teste = { status: 'testando' } | { status: 'pronto'; privados: { id: string; nome: string; url: string }[]; temArquivo: boolean } | null

export default function EnviarAoCliente({ params, fechar }: PropsDialogo<'enviar-ao-cliente'>) {
  const qc = useQueryClient()
  const d = useDemandaAlvo(params.demandaId)
  const det = useDetalheAlvo(d)
  const { data: cliente } = useClienteDetalhe(d?.clienteId ?? null)
  const config = useConfig()
  const feriados = useFeriados()
  const listaFeriados = useListaFeriados()
  const enviarArquivo = useEnviarArquivo()
  const idForm = useId()
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [viaEscolhida, setVia] = useState<'link' | 'fora'>('link')
  const [canal, setCanal] = useState<Canal>('whatsapp')
  const [contatoId, setContatoId] = useState<string | undefined>(undefined)
  const prazoPadrao = useMemo(() => prazoRetornoPadrao(hojeSP(new Date()), config.retornoPrazoDiasUteis, d?.publicacaoData ?? null, feriados),
    [config.retornoPrazoDiasUteis, d?.publicacaoData, feriados])
  const [prazo, setPrazo] = useState<{ data: DataLocal | null; hora: HoraLocal | null } | null>(null)
  const [teste, setTeste] = useState<Teste>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [subindo, setSubindo] = useState(false)
  const [feito, setFeito] = useState<{ saida: EnviarAoClienteSaida; quadroAntes: string } | null>(null)
  const [texto, setTexto] = useState('')

  const versao: VersaoComItens | undefined = det?.versoes.find((v) => v.id === d?.versaoAtualId)
  const temDrive = !!versao?.itens.some((i) => i.tipo === 'link' && i.provedor === 'drive')
  const contatos = (cliente?.contatos ?? []).filter((c) => c.ativo)
  const padrao = contatos.find((c) => c.padrao)
  const contatoEscolhido = contatoId === undefined ? (padrao?.id ?? '') : contatoId

  async function testar() {
    if (!versao || !temDrive) return
    setTeste({ status: 'testando' })
    try {
      const r = await acoesCiclo(qc).testarVersao(versao)
      const privados = r.itens.filter((i) => i.status === 'privado').map((i) => {
        const item = versao.itens.find((x) => x.id === i.itemId)!
        return { id: i.itemId, nome: item.nome, url: item.url ?? '' }
      })
      setTeste({ status: 'pronto', privados, temArquivo: versao.itens.some((i) => i.tipo === 'arquivo') })
    } catch {
      setTeste({ status: 'pronto', privados: [], temArquivo: false })
    }
  }
  // testa o Drive uma vez, quando a versão chega
  useEffect(() => { if (versao && temDrive && teste === null) void testar() }, [versao?.id, temDrive])

  if (!d) return <NaoEncontrada fechar={() => fechar(null)} />
  // o que a página pública mostra: arquivo, ou link que não é Drive privado (caminho de rede nunca vai ao cliente)
  const privadosIds = new Set(teste?.status === 'pronto' ? teste.privados.map((p) => p.id) : [])
  const nadaVisivel = !!versao && !versao.itens.some((i) => i.tipo === 'arquivo'
    || (i.tipo === 'link' && i.driveStatus !== 'privado' && !privadosIds.has(i.id)))
  const soCaminhos = !!versao && versao.itens.length > 0 && versao.itens.every((i) => i.tipo === 'caminho')
  const via = soCaminhos ? 'fora' : viaEscolhida
  const bloqueado = via === 'link' && teste?.status === 'pronto' && teste.privados.length > 0 && !teste.temArquivo

  async function enviar() {
    if (enviando || !d) return
    if (bloqueado) { setErro('O cliente veria uma tela de login. Abra o compartilhamento, envie o arquivo ou mande por fora.'); return }
    setEnviando(true)
    setErro(null)
    try {
      const s = await acoesCiclo(qc).enviar(d.id, {
        via, ...(via === 'fora' ? { canal } : {}),
        versaoId: d.versaoAtualId ?? undefined,
        contatoId: contatoEscolhido === '' ? null : contatoEscolhido,
        ...(prazo ? { prazoRetorno: prazo.data, prazoRetornoHora: prazo.data ? prazo.hora : null } : {}),
      })
      setFeito({ saida: s, quadroAntes: d.quadroId })
      setTexto(s.textoWhatsapp)
    } catch (e) {
      if (ehErroDaApi(e) && e.codigo === 'drive_privado') void testar()
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  async function subirArquivo(lista: File[]) {
    if (!versao || !lista.length) return
    setSubindo(true)
    setErro(null)
    try {
      const infos = []
      for (const f of lista) infos.push(await enviarArquivo(f))
      await acoesCiclo(qc).adicionarItens(versao, infos.map((i) => ({ tipo: 'arquivo' as const, arquivoId: i.id })))
      setTeste((t) => (t?.status === 'pronto' ? { ...t, temArquivo: true } : t))
      avisar(infos.length === 1 ? 'Arquivo acrescentado à versão.' : `${infos.length} arquivos acrescentados à versão.`, { tipo: 'sucesso' })
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setSubindo(false)
    }
  }

  // ─────────── depois de enviar ───────────
  if (feito) {
    const { saida, quadroAntes } = feito
    const onde = saida.automacao ? lugarDe(qc, saida.demanda, quadroAntes) : null
    const para = contatos.find((c) => c.id === saida.envio.contatoId)?.nome
    return (
      <MolduraDialogo titulo={`V${versao?.numero ?? ''} enviada`} tamanho="m"
        rodape={<Botao onClick={() => fechar({ demanda: saida.demanda })}>Concluir</Botao>}>
        <div className="cic-feito">
          <div className="cic-alerta" data-tom="sucesso" role="status">
            <CheckCircle2 aria-hidden="true" />
            <span>
              <strong>{saida.envio.via === 'link' ? 'Link gerado' : 'Envio registrado'}{para ? ` para ${para}` : ''}.</strong>
              {onde ? ` Movida para ${onde}.` : ''}
            </span>
          </div>
          {saida.link && (
            <div className="cic-campo">
              <span className="cic-rotulo">Link de aprovação</span>
              <CopiarTexto texto={saida.link.url} rotulo="Copiar link" avisoCopiado="Link copiado." />
            </div>
          )}
          <div className="cic-campo">
            <label className="cic-rotulo" htmlFor={`${idForm}-texto`}>Texto para o WhatsApp</label>
            <textarea id={`${idForm}-texto`} className="cic-texto-whatsapp" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <div className="cic-linha">
              <Botao variante="primario" icone={Copy} data-autofocus="" onClick={async () => {
                const ok = await copiarParaAreaDeTransferencia(texto)
                avisar(ok ? 'Texto copiado. Cole no WhatsApp.' : 'Não foi possível copiar.', { tipo: ok ? 'sucesso' : 'erro', duracao: 2500 })
              }}>Copiar para WhatsApp</Botao>
              {saida.link && <Botao variante="ghost" icone={ExternalLink} onClick={() => window.open(saida.link!.url, '_blank', 'noopener,noreferrer')}>Ver como o cliente</Botao>}
            </div>
          </div>
        </div>
      </MolduraDialogo>
    )
  }

  // ─────────── formulário ───────────
  const semCliente = !d.clienteId
  const semVersao = d.nVersoes === 0
  return (
    <MolduraDialogo titulo={`Enviar V${versao?.numero ?? d.nVersoes} ao cliente`} descricao={`#${d.numero} ${d.titulo}`} tamanho="m"
      rodape={(
        <>
          <Botao onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" icone={via === 'link' ? Link2 : Send} atalho="mod+enter" carregando={enviando}
            disabled={semCliente || semVersao || bloqueado || (via === 'link' && nadaVisivel)}>
            {via === 'link' ? 'Gerar link' : 'Registrar envio'}
          </Botao>
        </>
      )}>
      <form id={idForm} className="cic-form" onSubmit={(e) => { e.preventDefault(); void enviar() }} onKeyDown={(e) => ctrlEnter(e, () => void enviar())}>
        {semCliente && <div className="cic-alerta" data-tom="perigo" role="alert"><AlertTriangle aria-hidden="true" /><span><strong>Escolha o cliente antes de enviar.</strong> O cliente fica no painel ao lado.</span></div>}
        {semVersao && <div className="cic-alerta" data-tom="perigo" role="alert"><AlertTriangle aria-hidden="true" /><span><strong>Entregue uma versão antes de enviar.</strong></span></div>}
        {versao && (
          <div className="cic-resumo-versao">
            <span className="cic-rotulo">V{versao.numero} · {versao.itens.length} {versao.itens.length === 1 ? 'item' : 'itens'}{versao.nota ? ` · ${versao.nota}` : ''}</span>
            <ul className="cic-itens" data-uma-coluna="" aria-label={`Itens da V${versao.numero}`}>{versao.itens.map((i) => <ItemVersao key={i.id} i={i} compacto />)}</ul>
          </div>
        )}
        <fieldset className="cic-campo">
          <legend className="cic-rotulo">Como enviar</legend>
          <div className="cic-escolhas" role="radiogroup" aria-label="Como enviar">
            <button type="button" role="radio" aria-checked={via === 'link'} className="cic-escolha" onClick={() => setVia('link')}
              disabled={soCaminhos} data-autofocus={soCaminhos ? undefined : ''}>
              Gerar link<span>{soCaminhos ? 'O cliente não veria nada: esta versão só tem caminho de rede.' : 'O cliente aprova ou pede ajuste pelo celular, sem login.'}</span>
            </button>
            <button type="button" role="radio" aria-checked={via === 'fora'} className="cic-escolha" onClick={() => setVia('fora')}
              data-autofocus={soCaminhos ? '' : undefined}>
              Enviei por fora<span>Mandei por WhatsApp, e-mail ou reunião.</span>
            </button>
          </div>
        </fieldset>
        {via === 'link' && teste?.status === 'testando' && (
          <p className="cic-ajuda" role="status"><Loader2 className="ui-giro inline size-4 align-[-3px]" aria-hidden="true" /> Testando o acesso ao Drive…</p>
        )}
        {via === 'link' && teste?.status === 'pronto' && teste.privados.length > 0 && (
          <div className="cic-alerta" data-tom={teste.temArquivo ? 'info' : 'perigo'} role="alert">
            <AlertTriangle aria-hidden="true" />
            <span>
              <strong>O cliente verá uma tela de login.</strong>{' '}
              {teste.temArquivo
                ? 'O arquivo enviado pelo app vai no lugar; o link do Drive privado fica de fora da página.'
                : `${teste.privados.map((p) => p.nome).join(', ')} está privado no Drive.`}
            </span>
            {!teste.temArquivo && (
              <div className="cic-alerta-acoes">
                <Botao tamanho="p" icone={ExternalLink} onClick={() => window.open(teste.privados[0]!.url, '_blank', 'noopener,noreferrer')}>Abrir compartilhamento</Botao>
                <Botao tamanho="p" icone={RotateCcw} onClick={() => void testar()}>Testar de novo</Botao>
                {!versao?.enviadaClienteEm && (
                  <Botao tamanho="p" icone={Upload} carregando={subindo} onClick={() => arquivoRef.current?.click()}>Enviar arquivo (até 10 MB)</Botao>
                )}
              </div>
            )}
          </div>
        )}
        {(soCaminhos || (via === 'link' && nadaVisivel && !bloqueado)) && (
          <div className="cic-alerta" data-tom="info" role="status">
            <AlertTriangle aria-hidden="true" />
            <span><strong>O cliente não vê caminhos de rede.</strong> Para mandar o link de aprovação, acrescente o arquivo (ou o link do Drive) à versão. Ou registre o que mandou por fora.</span>
            {!versao?.enviadaClienteEm && (
              <div className="cic-alerta-acoes">
                <Botao tamanho="p" icone={Upload} carregando={subindo} onClick={() => arquivoRef.current?.click()}>Enviar arquivo (até 10 MB)</Botao>
              </div>
            )}
          </div>
        )}
        <input ref={arquivoRef} type="file" hidden multiple accept="image/*,application/pdf,application/zip"
          onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; void subirArquivo(l) }} />
        <div className="cic-grade">
          <Selecao rotulo="Para quem" value={contatoEscolhido} onChange={(e) => setContatoId(e.target.value)}
            opcoes={[...contatos.map((c) => ({ valor: c.id, rotulo: `${c.nome}${c.padrao ? ' (padrão)' : ''}` })),
              { valor: '', rotulo: via === 'link' ? 'Sem contato (quem abrir diz o nome)' : 'Sem contato' }]}
            ajuda={via === 'link' && contatoEscolhido ? 'A página pergunta "Você é…?" antes da decisão.' : undefined} />
          {via === 'fora' && (
            <Selecao rotulo="Por onde" value={canal} onChange={(e) => setCanal(e.target.value as Canal)} opcoes={CANAIS} />
          )}
          <div className="cic-campo">
            <span className="cic-rotulo" id={`${idForm}-prazo`}>Prazo para o retorno</span>
            <SeletorData rotulo="Prazo para o retorno" comHora valor={prazo ? prazo.data : prazoPadrao} hora={prazo?.hora ?? null}
              feriados={listaFeriados} aria-describedby={`${idForm}-prazo`} aoMudar={(data, hora) => setPrazo({ data, hora })} />
          </div>
        </div>
        {erro && <p className="cic-erro" role="alert">{erro}</p>}
      </form>
    </MolduraDialogo>
  )
}
