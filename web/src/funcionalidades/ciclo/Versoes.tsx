/**
 * "Versões e aprovação" (seção principal 300 do modal; SPEC §5.2, item 3): com quem está a bola, a linha do tempo por
 * rodada (V1…Vn com os itens, a prévia estática e o iframe só no clique, "enviada em… (link | por fora)", as decisões,
 * anuladas riscadas), "Rodada 3 · 2 inclusas" com [Marcar como extra] e os links de aprovação (atendimento).
 * Sem versão: o texto da §4.1 e [Entregar versão]. Da equipe e fora da demanda (não pode entregar): "Entre na demanda
 * para entregar a versão." com [Entrar e entregar], que entra e abre o diálogo.
 */
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Clock3, Copy, ExternalLink, Layers, Link2, Pencil, Plus, Send, ShieldOff, Sparkles, Undo2, Wrench,
} from 'lucide-react'
import type { Aprovacao, ClienteContato, Envio, Rodada, UsuarioResumo, VersaoComItens } from '@shared/tipos/index.ts'
import { ROTULO_MOTIVO_RODADA } from '@shared/tipos/index.ts'
import { formatarPrazo } from '@shared/logica/datas.ts'
import { pode } from '@shared/logica/permissoes.ts'
import type { ContextoDemanda } from '../../extensoes/tipos.ts'
import { useClienteDetalhe } from '../../api/clientes.ts'
import { useAcoes } from '../../api/demandas.ts'
import { mensagemDeErro } from '../../api/cliente.ts'
import { useUsuarios } from '../../api/seletores.ts'
import { abrirDialogo } from '../../dialogos/estado.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { EsqueletoLinhas } from '../../ui/Indicadores.tsx'
import { copiarParaAreaDeTransferencia } from '../../ui/Texto.tsx'
import { acoesCiclo, useLinks } from './api.ts'
import { ItemVersao, ItensEntrega, Secao, quando, tempoRelativo, type ItemNovo } from './comum.tsx'
import { linhaDoTempo, passoCiclo, podeEntregar, rodadaExtra, ultimaDecisao } from './logica.ts'

const CANAL: Record<string, string> = { whatsapp: 'pelo WhatsApp', email: 'por e-mail', reuniao: 'em reunião', outro: 'por outro canal' }

const nome = (u: UsuarioResumo | undefined) => (u ? (u.apelido ?? u.nome.split(' ')[0]!) : 'alguém')

async function copiar(texto: string, aviso: string) {
  const ok = await copiarParaAreaDeTransferencia(texto)
  avisar(ok ? aviso : 'Não foi possível copiar.', { tipo: ok ? 'sucesso' : 'erro', duracao: 2500 })
}

// ─────────────────────────────── situação ───────────────────────────────

function Situacao({ ctx, contatos }: { ctx: ContextoDemanda; contatos: ClienteContato[] }) {
  const d = ctx.demanda
  const det = ctx.detalhe!
  const usuarios = useUsuarios()
  const passo = passoCiclo(d)
  const contato = (id: string | null) => contatos.find((c) => c.id === id)?.nome ?? null
  if (passo === 'com_cliente') {
    const envio = det.envios.filter((e) => e.versaoId === d.versaoEnviadaId).at(-1)
    const link = envio?.linkId ? det.linksPublicos.find((l) => l.id === envio.linkId) : undefined
    const quem = envio?.contatoId ? contato(envio.contatoId) : null
    const v = det.versoes.find((x) => x.id === d.versaoEnviadaId)
    return (
      <div className="cic-situacao" data-tom="cliente" role="status">
        <span className="cic-situacao-icone"><Clock3 aria-hidden="true" /></span>
        <span className="cic-situacao-titulo">Com o cliente desde {quando(d.envioPendenteEm!)}</span>
        <span className="cic-situacao-texto">
          {`V${v?.numero ?? ''} ${envio?.via === 'link' ? 'por link' : `por fora${envio?.canal ? ` (${CANAL[envio.canal]?.replace(/^(pelo|por|em) /, '') ?? envio.canal})` : ''}`}`}
          {quem ? ` para ${quem}` : ''}
          {envio?.prazoRetorno ? ` · retorno até ${formatarPrazo(envio.prazoRetorno, envio.prazoRetornoHora ?? '18:00')}` : ''}
          {link ? ` · ${link.acessos === 0 ? 'o link ainda não foi aberto' : `link aberto ${link.acessos} ${link.acessos === 1 ? 'vez' : 'vezes'}${link.ultimoAcessoEm ? `, a última ${tempoRelativo(link.ultimoAcessoEm)}` : ''}`}` : ''}
        </span>
        {ctx.atendimento && !ctx.somenteLeitura && (
          <div className="cic-situacao-acoes">
            <Botao tamanho="p" icone={Copy} onClick={() => void abrirDialogo('copiar-whatsapp', { demandaId: d.id, modelo: 'lembrete' })}>Copiar lembrete</Botao>
          </div>
        )}
      </div>
    )
  }
  const ultima = ultimaDecisao(det.aprovacoes)
  if (passo === 'aprovada' && ultima?.decisao === 'aprovado') {
    const quem = contato(ultima.contatoId) ?? ultima.nomeInformado ?? 'o cliente'
    return (
      <div className="cic-situacao" data-tom="sucesso" role="status">
        <span className="cic-situacao-icone"><CheckCircle2 aria-hidden="true" /></span>
        <span className="cic-situacao-titulo">Aprovada por {quem} em {quando(ultima.criadoEm)}</span>
        <span className="cic-situacao-texto">
          {ultima.via === 'link' ? 'Pelo link de aprovação.' : `Registrada ${CANAL[ultima.canal ?? 'outro']} por ${nome(usuarios.find((u) => u.id === ultima.registradoPor))}.`}
        </span>
      </div>
    )
  }
  if (passo === 'ajuste' && ultima?.decisao === 'ajuste') {
    const r = det.rodadas.find((x) => x.id === ultima.rodadaAbertaId)
    const v = det.versoes.find((x) => x.id === ultima.versaoId)
    return (
      <div className="cic-situacao" data-tom="aviso" role="status">
        <span className="cic-situacao-icone"><Wrench aria-hidden="true" /></span>
        <span className="cic-situacao-titulo">Ajuste pedido na V{v?.numero}: a equipe prepara a V{(v?.numero ?? 0) + 1}</span>
        <span className="cic-situacao-texto">{r?.prazo ? `Prazo da rodada ${r.numero}: ${formatarPrazo(r.prazo, r.prazoHora ?? '18:00')}.` : ''}</span>
      </div>
    )
  }
  if (passo === 'nao_enviada') {
    const v = det.versoes.find((x) => x.id === d.versaoAtualId)
    return (
      <div className="cic-situacao" role="status">
        <span className="cic-situacao-icone"><Send aria-hidden="true" /></span>
        <span className="cic-situacao-titulo">V{v?.numero} entregue, ainda não enviada ao cliente</span>
        {v && <span className="cic-situacao-texto">Entregue por {nome(usuarios.find((u) => u.id === v.criadaPor))} {tempoRelativo(v.criadaEm)}.</span>}
      </div>
    )
  }
  return null
}

// ─────────────────────────────── decisões e envios ───────────────────────────────

function LinhaEnvio({ e, contatos }: { e: Envio; contatos: ClienteContato[] }) {
  const usuarios = useUsuarios()
  const para = contatos.find((c) => c.id === e.contatoId)?.nome
  return (
    <div className="cic-evento" data-tom="cliente">
      <Send aria-hidden="true" />
      <span className="cic-evento-corpo">
        <span>
          <strong>Enviada {e.via === 'link' ? 'por link' : `por fora ${CANAL[e.canal ?? 'outro'] ?? ''}`}</strong>
          {para ? ` para ${para}` : ''} · {quando(e.enviadoEm)} · por {nome(usuarios.find((u) => u.id === e.enviadoPor))}
          {e.prazoRetorno ? ` · retorno até ${formatarPrazo(e.prazoRetorno, e.prazoRetornoHora ?? '18:00')}` : ''}
        </span>
      </span>
    </div>
  )
}

function LinhaDecisao({ a, ctx, contatos, anulavel }: { a: Aprovacao; ctx: ContextoDemanda; contatos: ClienteContato[]; anulavel: boolean }) {
  const usuarios = useUsuarios()
  const det = ctx.detalhe!
  const quem = contatos.find((c) => c.id === a.contatoId)?.nome ?? a.nomeInformado ?? 'o cliente'
  const por = a.via === 'link' ? 'pelo link' : `${CANAL[a.canal ?? 'outro']} · registrado por ${nome(usuarios.find((u) => u.id === a.registradoPor))}`
  const print = a.evidenciaAnexoId ? det.anexos.find((x) => x.id === a.evidenciaAnexoId) : undefined
  const linhas = a.comentario ? a.comentario.split('\n').filter(Boolean) : []
  return (
    <div className="cic-evento" data-tom={a.decisao === 'aprovado' ? 'sucesso' : 'ajuste'} data-anulada={a.anuladaEm ? '' : undefined}>
      {a.decisao === 'aprovado' ? <CheckCircle2 aria-hidden="true" /> : <Wrench aria-hidden="true" />}
      <span className="cic-evento-corpo">
        <span>
          <strong>{a.decisao === 'aprovado' ? 'Aprovada' : 'Ajuste pedido'}</strong> por {quem} · {quando(a.criadoEm)} · {por}
          {print?.arquivo && <> · <a href={print.arquivo.url} target="_blank" rel="noopener noreferrer">print</a></>}
          {a.anuladaEm && ` · anulada por ${nome(usuarios.find((u) => u.id === a.anuladaPor))} ${tempoRelativo(a.anuladaEm)}`}
        </span>
        {linhas.length > 0 && <ul className="cic-evento-linhas">{linhas.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      </span>
      {anulavel && (
        <span className="cic-evento-acoes">
          <Botao variante="ghost" tamanho="p" icone={Undo2} onClick={() => void abrirDialogo('anular-aprovacao', { demandaId: ctx.demanda.id })}>
            Anular
          </Botao>
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────── versão ───────────────────────────────

function CartaoVersao({ v, envios, decisoes, ctx, contatos, atual, anulavelId }: {
  v: VersaoComItens; envios: Envio[]; decisoes: Aprovacao[]; ctx: ContextoDemanda; contatos: ClienteContato[]; atual: boolean
  anulavelId: string | null
}) {
  const qc = useQueryClient()
  const usuarios = useUsuarios()
  const eu = { id: ctx.eu.usuario.id, papel: ctx.eu.usuario.papel }
  const podeEditar = !ctx.somenteLeitura && pode('versao.editar', eu, { versao: v })
  const [editandoNota, setEditandoNota] = useState(false)
  const [nota, setNota] = useState(v.nota ?? '')
  const [acrescentando, setAcrescentando] = useState(false)
  const [novos, setNovos] = useState<ItemNovo[]>([])
  const [salvando, setSalvando] = useState(false)
  const acoes = acoesCiclo(qc)

  async function salvarNota() {
    setSalvando(true)
    try {
      await acoes.editarVersao(v, nota.trim() || null)
      setEditandoNota(false)
    } catch (e) {
      avisar('Não foi possível salvar a nota.', { tipo: 'erro', descricao: mensagemDeErro(e) })
    } finally {
      setSalvando(false)
    }
  }
  async function salvarItens() {
    if (!novos.length) return
    setSalvando(true)
    try {
      await acoes.adicionarItens(v, novos.map((x) => x.item))
      setNovos([])
      setAcrescentando(false)
      avisar(`${novos.length === 1 ? 'Item acrescentado' : `${novos.length} itens acrescentados`} à V${v.numero}`, { tipo: 'sucesso' })
    } catch (e) {
      avisar('Não foi possível acrescentar.', { tipo: 'erro', descricao: mensagemDeErro(e) })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <li className="cic-versao" data-atual={atual || undefined} aria-label={`Versão ${v.numero}`}>
      <div className="cic-versao-cabeca">
        <span className="cic-versao-numero">V{v.numero}</span>
        <span className="cic-versao-quem">
          entregue por <strong>{nome(usuarios.find((u) => u.id === v.criadaPor))}</strong> · <span title={quando(v.criadaEm)}>{tempoRelativo(v.criadaEm)}</span>
        </span>
        {podeEditar && !editandoNota && (
          <span className="cic-secao-acoes">
            <Botao variante="ghost" tamanho="p" icone={Pencil} onClick={() => { setNota(v.nota ?? ''); setEditandoNota(true) }}>
              {v.nota ? 'Editar nota' : 'Nota'}
            </Botao>
            {!v.enviadaClienteEm && (
              <Botao variante="ghost" tamanho="p" icone={Plus} aria-expanded={acrescentando} onClick={() => setAcrescentando((x) => !x)}>Acrescentar</Botao>
            )}
          </span>
        )}
      </div>
      {editandoNota ? (
        <div className="cic-campo">
          <label className="cic-rotulo" htmlFor={`cic-nota-${v.id}`}>Nota da versão</label>
          <div className="ui-entrada ui-entrada-texto">
            <textarea id={`cic-nota-${v.id}`} rows={2} maxLength={4000} value={nota} onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void salvarNota() } }} />
          </div>
          <div className="cic-linha">
            <Botao variante="primario" tamanho="p" carregando={salvando} onClick={() => void salvarNota()}>Salvar</Botao>
            <Botao variante="ghost" tamanho="p" onClick={() => setEditandoNota(false)}>Cancelar</Botao>
          </div>
        </div>
      ) : v.nota ? <p className="cic-versao-nota">{v.nota}</p> : null}
      {v.itens.length > 0 && <ul className="cic-itens" aria-label={`Itens da V${v.numero}`}>{v.itens.map((i) => <ItemVersao key={i.id} i={i} />)}</ul>}
      {acrescentando && (
        <div className="cic-campo">
          <ItensEntrega itens={novos} mudar={(fn) => setNovos(fn)} rotulo={`Acrescentar à V${v.numero}`} autoFoco />
          <div className="cic-linha">
            <Botao variante="primario" tamanho="p" carregando={salvando} disabled={!novos.length} onClick={() => void salvarItens()}>Salvar</Botao>
            <Botao variante="ghost" tamanho="p" onClick={() => { setNovos([]); setAcrescentando(false) }}>Cancelar</Botao>
          </div>
        </div>
      )}
      {(envios.length > 0 || decisoes.length > 0) && (
        <div className="cic-versao-rodape">
          {[...envios.map((e) => ({ t: e.enviadoEm, el: <LinhaEnvio key={e.id} e={e} contatos={contatos} /> })),
            ...decisoes.map((a) => ({ t: a.criadoEm, el: <LinhaDecisao key={a.id} a={a} ctx={ctx} contatos={contatos} anulavel={a.id === anulavelId} /> }))]
            .sort((x, y) => x.t.localeCompare(y.t)).map((x) => x.el)}
        </div>
      )}
    </li>
  )
}

function CabecaRodada({ r, ctx, inclusas }: { r: Rodada; ctx: ContextoDemanda; inclusas: number }) {
  const qc = useQueryClient()
  // ajuste pedido pelo link: o motivo gravado é o padrão (ninguém escolheu); a tela não o mostra como fato
  const pedido = r.origem === 'cliente' ? ctx.detalhe?.aprovacoes.find((a) => a.rodadaAbertaId === r.id) : undefined
  const peloLink = pedido?.via === 'link'
  const origem = r.origem === 'inicial' ? 'primeira entrega' : r.origem === 'cliente' ? (peloLink ? 'ajuste pedido pelo link' : 'ajuste do cliente') : 'ajuste interno'
  const renegociado = r.prazo && r.prazoOriginal && r.prazo !== r.prazoOriginal
  const podeExtra = ctx.atendimento && !ctx.somenteLeitura && r.numero > 1
  return (
    <div className="cic-rodada-cabeca">
      <strong>Rodada {r.numero}</strong>
      <span>· {origem}</span>
      {r.motivo && r.origem !== 'inicial' && !peloLink && <span>· {ROTULO_MOTIVO_RODADA[r.motivo]}{r.motivoTexto ? `: ${r.motivoTexto}` : ''}</span>}
      {r.prazo && (
        <span>
          · prazo {formatarPrazo(r.prazo, r.prazoHora ?? '18:00')}
          {renegociado && <> (era <span className="cic-riscado">{formatarPrazo(r.prazoOriginal!, null)}</span>)</>}
        </span>
      )}
      {r.extra && <span className="cic-selo" data-tom="extra"><Sparkles aria-hidden="true" />extra</span>}
      {!r.extra && r.numero > inclusas && <span className="cic-selo" data-tom="extra">passou das {inclusas} inclusas</span>}
      {podeExtra && (r.extra || r.numero > inclusas) && (
        <Botao variante="ghost" tamanho="p" onClick={() => void acoesCiclo(qc).marcarExtraComAviso(r, !r.extra)}>
          {r.extra ? 'Desmarcar extra' : 'Marcar como extra'}
        </Botao>
      )}
    </div>
  )
}

// ─────────────────────────────── links (atendimento) ───────────────────────────────

function Links({ ctx }: { ctx: ContextoDemanda }) {
  const qc = useQueryClient()
  const { data: links } = useLinks(ctx.demanda.id, ctx.atendimento)
  const [abertos, setAbertos] = useState(false)
  if (!links?.length) return null
  const agora = new Date().toISOString()
  const lista = abertos ? links : links.filter((l) => l.ativo).slice(0, 1)
  return (
    <div className="cic-campo">
      <div className="cic-linha">
        <span className="cic-rotulo"><Link2 aria-hidden="true" className="inline size-4 align-[-3px]" /> Links de aprovação</span>
        {links.length > lista.length || abertos ? (
          <Botao variante="ghost" tamanho="p" aria-expanded={abertos} onClick={() => setAbertos((x) => !x)}>
            {abertos ? 'Mostrar só o ativo' : `Ver todos (${links.length})`}
          </Botao>
        ) : null}
      </div>
      <ul className="cic-links">
        {lista.map((l) => (
          <li key={l.id} className="cic-link">
            <span>
              <strong>{l.revogadoEm ? 'Revogado' : l.expiraEm <= agora ? 'Expirado' : 'Ativo'}</strong>
              {l.revogadoEm ? ` em ${quando(l.revogadoEm)}` : ` até ${formatarPrazo(l.expiraEm.slice(0, 10), null)}`}
              {` · aberto ${l.acessos} ${l.acessos === 1 ? 'vez' : 'vezes'}`}
              {l.ultimoAcessoEm ? ` (último ${tempoRelativo(l.ultimoAcessoEm)})` : ''}
            </span>
            {l.ativo && l.url && !ctx.somenteLeitura && (
              <span className="cic-link-acoes">
                <Botao variante="ghost" tamanho="p" icone={Copy} onClick={() => void copiar(l.url, 'Link copiado.')}>Copiar link</Botao>
                <Botao variante="ghost" tamanho="p" icone={ExternalLink} onClick={() => window.open(l.url, '_blank', 'noopener,noreferrer')}>Abrir</Botao>
                <Botao variante="ghost" tamanho="p" icone={ShieldOff} onClick={async () => {
                  const ok = await abrirDialogo('confirmar', {
                    titulo: 'Revogar este link?', mensagem: 'O cliente não consegue mais abrir este endereço. O próximo envio por link gera outro.',
                    confirmar: 'Revogar', perigo: true,
                  })
                  if (!ok) return
                  try {
                    await acoesCiclo(qc).revogarLink(ctx.demanda.id, l.id)
                    avisar('Link revogado.')
                  } catch (e) {
                    avisar('Não foi possível revogar.', { tipo: 'erro', descricao: mensagemDeErro(e) })
                  }
                }}>Revogar</Botao>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─────────────────────────────── seção ───────────────────────────────

export default function Versoes({ ctx }: { ctx: ContextoDemanda }) {
  const d = ctx.demanda
  const det = ctx.detalhe
  const { data: cliente } = useClienteDetalhe(d.clienteId)
  const contatos = cliente?.contatos ?? []
  const linha = useMemo(() => (det ? linhaDoTempo(det) : []), [det])
  const eu = { id: ctx.eu.usuario.id, papel: ctx.eu.usuario.papel }
  const acoesNucleo = useAcoes()
  const passo = passoCiclo(d)
  const cabeEntrega = !ctx.somenteLeitura && !d.concluidaEm && passo !== 'aprovada' && passo !== 'com_cliente'
  const entregar = cabeEntrega && podeEntregar(d, eu)
  // da equipe e fora da demanda: entrar e já entregar (sem isso, o texto da §4.1 seria uma instrução sem saída)
  const entrarParaEntregar = cabeEntrega && !entregar
  const [entrando, setEntrando] = useState(false)
  async function entrarEEntregar() {
    setEntrando(true)
    try {
      const nova = await acoesNucleo.membros.entrar(d, eu.id)
      if (nova) void abrirDialogo('entregar-versao', { demandaId: d.id })
    } finally {
      setEntrando(false)
    }
  }
  const extra = rodadaExtra(d)
  const ultima = det ? ultimaDecisao(det.aprovacoes) : null
  const anulavelId = ctx.atendimento && !ctx.somenteLeitura && ultima?.decisao === 'aprovado' ? ultima.id : null
  const meta = d.nVersoes > 0
    ? <span className="cic-selo" data-tom={extra ? 'extra' : undefined}>Rodada {d.rodadaAtual} · {d.rodadasInclusas} {d.rodadasInclusas === 1 ? 'inclusa' : 'inclusas'}</span>
    : null
  const botaoEntregar = entregar ? (
    <Botao variante="ghost" tamanho="p" icone={Plus} atalho="Shift+E" onClick={() => void abrirDialogo('entregar-versao', { demandaId: d.id })}>
      {d.nVersoes === 0 ? 'Entregar versão' : `Entregar V${d.nVersoes + 1}`}
    </Botao>
  ) : entrarParaEntregar && d.nVersoes > 0 ? (
    <Botao variante="ghost" tamanho="p" icone={Plus} carregando={entrando} onClick={() => void entrarEEntregar()}>Entrar e entregar</Botao>
  ) : null

  return (
    <Secao id="versoes" icone={Layers} titulo="Versões e aprovação" meta={meta} acoes={botaoEntregar || undefined}>
      {!det ? <EsqueletoLinhas linhas={3} /> : d.nVersoes === 0 || det.versoes.length === 0 ? (
        <div className="cic-vazio-caixa">
          {entregar ? (
            <p className="cic-vazio">Nenhuma versão entregue. Cole o link do Drive ou o caminho da pasta de saída.</p>
          ) : entrarParaEntregar ? (
            <>
              <p className="cic-vazio">Nenhuma versão entregue. Entre na demanda para entregar a versão.</p>
              <Botao variante="secundario" tamanho="p" icone={Plus} carregando={entrando} onClick={() => void entrarEEntregar()}>Entrar e entregar</Botao>
            </>
          ) : (
            <p className="cic-vazio">Nenhuma versão entregue.</p>
          )}
        </div>
      ) : (
        <>
          <Situacao ctx={ctx} contatos={contatos} />
          <ol className="cic-rodadas" aria-label="Rodadas">
            {linha.map(({ rodada, versoes }) => (
              <li key={rodada.id} className="cic-rodada">
                <CabecaRodada r={rodada} ctx={ctx} inclusas={d.rodadasInclusas} />
                {versoes.length > 0 ? (
                  <ol className="cic-versoes">
                    {versoes.map((x) => (
                      <CartaoVersao key={x.versao.id} v={x.versao} envios={x.envios} decisoes={x.decisoes} ctx={ctx} contatos={contatos}
                        atual={x.versao.id === d.versaoAtualId} anulavelId={anulavelId} />
                    ))}
                  </ol>
                ) : (
                  <p className="cic-vazio">{rodada.fechadaEm ? 'Sem versão nesta rodada.' : 'Nada entregue nesta rodada ainda.'}</p>
                )}
              </li>
            ))}
          </ol>
          {ctx.atendimento && <Links ctx={ctx} />}
        </>
      )}
    </Secao>
  )
}
