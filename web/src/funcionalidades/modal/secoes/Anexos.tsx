/**
 * Anexos (seção principal 400): links (https, o provedor pelo host), caminhos de rede (M:\…, texto com [Copiar
 * caminho], nunca link) e arquivos até 10 MB (imagem, PDF, ZIP). Um campo só reconhece link ou caminho; arquivos por
 * "Enviar arquivo", arrastando para a seção ou com Ctrl+V em qualquer lugar do modal (um print do WhatsApp, por
 * exemplo). Imagens podem virar a capa do card. O print de evidência de uma aprovação não sai.
 */
import { useEffect, useRef, useState, type DragEvent } from 'react'
import {
  Cloud, Download, ExternalLink, FileArchive, FileText, FolderOpen, Image as IconeImagem, Link2, MoreHorizontal, Paperclip, PenTool,
  Plus, Upload, Video,
} from 'lucide-react'
import type { Anexo, Demanda, Provedor } from '@shared/tipos/index.ts'
import { pode } from '@shared/logica/permissoes.ts'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { useAcoes } from '../../../api/demandas.ts'
import { useQueryClient } from '@tanstack/react-query'
import { aplicarPatchDemanda } from '../../../api/cache.ts'
import { abrirDialogo } from '../../../dialogos/estado.ts'
import { avisar } from '../../../ui/avisos.tsx'
import { Botao, BotaoIcone } from '../../../ui/Botao.tsx'
import { Campo } from '../../../ui/Campo.tsx'
import { EsqueletoLinhas } from '../../../ui/Indicadores.tsx'
import { Menu, type ItemMenuUi } from '../../../ui/Menu.tsx'
import { CopiarTexto, copiarParaAreaDeTransferencia } from '../../../ui/Texto.tsx'
import { useAcoesModal } from '../api.ts'
import { Secao, nomeCurto, quandoPorExtenso, tamanho, tempoRelativo, useUsuarios } from '../comum.tsx'

const PROVEDOR: Record<Provedor, { rotulo: string; icone: typeof Link2 }> = {
  drive: { rotulo: 'Google Drive', icone: Cloud }, docs: { rotulo: 'Google Docs', icone: FileText }, figma: { rotulo: 'Figma', icone: PenTool },
  canva: { rotulo: 'Canva', icone: PenTool }, wetransfer: { rotulo: 'WeTransfer', icone: Cloud }, youtube: { rotulo: 'YouTube', icone: Video },
  vimeo: { rotulo: 'Vimeo', icone: Video }, dropbox: { rotulo: 'Dropbox', icone: Cloud }, rede: { rotulo: 'Pasta de rede', icone: FolderOpen },
  arquivo: { rotulo: 'Arquivo', icone: FileText }, outro: { rotulo: 'Link', icone: Link2 },
}

/** Link https ou caminho de rede (M:\…, \\servidor\…); null = nenhum dos dois. */
export function lerEndereco(texto: string): { tipo: 'link'; url: string } | { tipo: 'caminho'; caminho: string } | null {
  const t = texto.trim()
  if (/^https:\/\/[^\s]+$/i.test(t)) return { tipo: 'link', url: t }
  if (/^[a-z]:\\/i.test(t) || /^\\\\[^\\]+\\/.test(t)) return { tipo: 'caminho', caminho: t }
  return null
}

const hostDe = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

/** Os arquivos de um colar ou de um soltar (só os arquivos de verdade; texto passa). */
function arquivosDe(dados: DataTransfer | null): File[] {
  if (!dados) return []
  return Array.from(dados.files ?? []).filter((f) => f.size > 0)
}

// ─────────────────────────────── um anexo ───────────────────────────────

function CartaoAnexo({ a, ctx }: { a: Anexo; ctx: ContextoDemanda }) {
  const acoesNucleo = useAcoes()
  const acoes = useAcoesModal()
  const qc = useQueryClient()
  const usuarios = useUsuarios()
  const [renomeando, setRenomeando] = useState(false)
  const [nome, setNome] = useState(a.nome)
  const d = ctx.demanda
  const so = ctx.somenteLeitura
  const evidencia = a.finalidade === 'evidencia'
  const imagem = !!a.arquivo?.imagem
  const capa = d.capaAnexoId === a.id
  const quem = a.enviadoPor ? usuarios.find((u) => u.id === a.enviadoPor) : undefined
  const podeRemover = !evidencia && pode('anexo.excluir', { id: ctx.eu.usuario.id, papel: ctx.eu.usuario.papel }, { anexo: a })
  const p = PROVEDOR[a.provedor ?? 'outro']
  const Icone = a.tipo === 'arquivo' ? (imagem ? IconeImagem : a.arquivo?.mime === 'application/zip' ? FileArchive : FileText) : p.icone
  const href = a.tipo === 'link' ? a.url : a.arquivo ? a.arquivo.url : null

  async function tornarCapa(sim: boolean) {
    if (sim && a.arquivo) aplicarPatchDemanda(qc, d.id, { capaUrl: a.arquivo.url })
    await acoesNucleo.editar(d, { capaAnexoId: sim ? a.id : null })
  }

  const itens: ItemMenuUi[] = [
    ...(href ? [{ id: 'abrir', rotulo: a.tipo === 'link' ? 'Abrir o link' : 'Abrir', icone: ExternalLink, executar: () => { window.open(href, '_blank', 'noopener,noreferrer') } }] : []),
    // a imagem abre no navegador; "Baixar" pede o arquivo como anexo (sem o ?inline=1)
    ...(imagem && a.arquivo ? [{
      id: 'baixar', rotulo: 'Baixar', icone: Download,
      executar: () => { window.open(a.arquivo!.url.replace('?inline=1', ''), '_blank', 'noopener,noreferrer') },
    }] : []),
    ...(a.tipo === 'link' && a.url ? [{
      id: 'copiar', rotulo: 'Copiar o link', icone: Link2,
      executar: async () => { const ok = await copiarParaAreaDeTransferencia(a.url!); avisar(ok ? 'Link copiado.' : 'Não foi possível copiar.', { tipo: ok ? 'sucesso' : 'erro' }) },
    }] : []),
    ...(!so && imagem && !evidencia ? [{ id: 'capa', rotulo: capa ? 'Tirar da capa' : 'Tornar capa', icone: IconeImagem, executar: () => void tornarCapa(!capa) }] : []),
    ...(!so ? [{ id: 'renomear', rotulo: 'Renomear', executar: () => { setNome(a.nome); setRenomeando(true) } }] : []),
    ...(!so && podeRemover ? [{ tipo: 'separador' as const, id: 'sep' }, {
      id: 'remover', rotulo: 'Remover…', perigo: true,
      executar: async () => {
        const ok = await abrirDialogo('confirmar', {
          titulo: `Remover “${a.nome}”?`,
          mensagem: a.tipo === 'arquivo' ? 'O arquivo sai desta demanda. Não dá para desfazer.' : 'O anexo sai desta demanda.',
          confirmar: 'Remover', perigo: true,
        })
        if (ok) await acoes.excluirAnexo(a)
      },
    }] : []),
  ]

  return (
    <li className="mdl-anexo" data-capa={capa || undefined} data-tipo={a.tipo}>
      {imagem && a.arquivo ? (
        <a className="mdl-anexo-miniatura" href={a.arquivo.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir a imagem ${a.nome}`}>
          <img src={a.arquivo.url} alt="" loading="lazy" decoding="async" />
        </a>
      ) : (
        <span className="mdl-anexo-miniatura" aria-hidden="true"><Icone /></span>
      )}
      <div className="mdl-anexo-info">
        {renomeando ? (
          <form onSubmit={(e) => { e.preventDefault(); setRenomeando(false); if (nome.trim() && nome.trim() !== a.nome) void acoes.renomearAnexo(a, nome.trim()) }}>
            <input className="mdl-titulo-campo" aria-label="Nome do anexo" value={nome} autoFocus maxLength={200}
              onFocus={(e) => e.currentTarget.select()} onChange={(e) => setNome(e.target.value)}
              onBlur={() => { setRenomeando(false); if (nome.trim() && nome.trim() !== a.nome) void acoes.renomearAnexo(a, nome.trim()) }}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenomeando(false) } }} />
          </form>
        ) : href ? (
          <a className="mdl-anexo-nome" href={href} target="_blank" rel="noopener noreferrer" title={a.nome}>{a.nome}</a>
        ) : (
          <span className="mdl-anexo-nome" title={a.nome}>{a.nome}</span>
        )}
        <span className="mdl-anexo-detalhe">
          {capa && <span className="mdl-anexo-marca">Capa</span>}
          {evidencia && <span className="mdl-anexo-marca" data-tom="evidencia">Print do retorno</span>}
          {a.comentarioId && <span>no comentário</span>}
          <span>{a.tipo === 'link' && a.url ? (a.provedor === 'outro' ? hostDe(a.url) : p.rotulo) : a.tipo === 'caminho' ? 'Pasta de rede'
            : a.arquivo ? tamanho(a.arquivo.bytes) : 'Arquivo'}</span>
          <span title={quandoPorExtenso(a.criadoEm)}>{quem ? `${nomeCurto(quem)}, ` : ''}{tempoRelativo(a.criadoEm)}</span>
        </span>
      </div>
      {itens.length > 0 ? (
        <Menu rotulo={`Anexo ${a.nome}`} itens={itens} alinhar="fim">
          {(g) => <BotaoIcone {...g} icone={MoreHorizontal} rotulo={`Ações do anexo ${a.nome}`} tamanho="p" />}
        </Menu>
      ) : <span />}
      {a.tipo === 'caminho' && a.caminho && (
        <div className="mdl-anexo-caminho"><CopiarTexto texto={a.caminho} rotulo="Copiar caminho" avisoCopiado="Caminho copiado." /></div>
      )}
    </li>
  )
}

// ─────────────────────────────── adicionar ───────────────────────────────

function Adicionar({ d, fechar }: { d: Demanda; fechar(): void }) {
  const acoes = useAcoesModal()
  const [texto, setTexto] = useState('')
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const endereco = lerEndereco(texto)
  const erro = texto.trim() && !endereco
    ? (/^http:\/\//i.test(texto.trim()) ? 'Use o link com https://.' : 'Cole um link https:// ou um caminho como M:\\Clientes\\…')
    : undefined

  async function salvar() {
    if (!endereco) return
    setSalvando(true)
    const a = await acoes.criarAnexo(d, { ...endereco, nome: nome.trim() || undefined })
    setSalvando(false)
    if (a) { setTexto(''); setNome(''); fechar() }
  }

  return (
    <form className="mdl-formulario" onSubmit={(e) => { e.preventDefault(); void salvar() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar() } }}>
      <Campo rotulo="Link ou caminho" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus erro={erro}
        placeholder="https://drive.google.com/…  ou  M:\Clientes\…" ajuda={endereco?.tipo === 'caminho' ? 'Caminho de rede: fica como texto, com o botão de copiar.' : undefined} />
      <Campo rotulo="Nome" opcional value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200}
        placeholder={endereco?.tipo === 'link' ? hostDe(endereco.url) : 'Como aparece na lista'} />
      <div className="mdl-formulario-botoes">
        <Botao variante="ghost" tamanho="p" onClick={fechar}>Cancelar</Botao>
        <Botao type="submit" variante="secundario" tamanho="p" disabled={!endereco} carregando={salvando}>Anexar</Botao>
      </div>
    </form>
  )
}

// ─────────────────────────────── seção ───────────────────────────────

const LIMITE = 6

export default function Anexos({ ctx }: { ctx: ContextoDemanda }) {
  const acoes = useAcoesModal()
  const [adicionando, setAdicionando] = useState(false)
  const [sobre, setSobre] = useState(false)
  const [todos, setTodos] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)
  const d = ctx.demanda
  const so = ctx.somenteLeitura
  const atual = useRef({ d, so })
  atual.current = { d, so }

  // Ctrl+V de um arquivo (print) em qualquer lugar do modal, fora do compositor de comentário (que anexa ao comentário)
  useEffect(() => {
    function aoColar(e: ClipboardEvent) {
      if (e.defaultPrevented || atual.current.so) return
      const alvo = e.target instanceof Element ? e.target : null
      if (!alvo?.closest('[data-modal-demanda]')) return
      const arquivos = arquivosDe(e.clipboardData)
      if (!arquivos.length) return
      // num campo de texto com texto junto (copiar do Word traz imagem e texto), o texto vence
      const emCampo = !!alvo.closest('input, textarea, [contenteditable="true"]')
      if (emCampo && e.clipboardData?.getData('text/plain')) return
      e.preventDefault()
      void acoes.enviarArquivos(atual.current.d, arquivos)
    }
    document.addEventListener('paste', aoColar)
    return () => document.removeEventListener('paste', aoColar)
  }, [acoes])

  if (!ctx.detalhe) return <Secao id="anexos" icone={Paperclip} titulo="Anexos"><EsqueletoLinhas linhas={2} /></Secao>
  const anexos = ctx.detalhe.anexos
  const visiveis = todos ? anexos : anexos.slice(0, LIMITE)

  const soltar = so ? {} : {
    onDragOver: (e: DragEvent) => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setSobre(true) } },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) setSobre(false) },
    onDrop: (e: DragEvent) => {
      const arquivos = arquivosDe(e.dataTransfer)
      setSobre(false)
      if (!arquivos.length) return
      e.preventDefault()
      void acoes.enviarArquivos(d, arquivos)
    },
  }

  return (
    <div {...soltar}>
      <Secao id="anexos" icone={Paperclip} titulo="Anexos" meta={anexos.length ? String(anexos.length) : undefined}
        acoes={!so && (
          <>
            <Botao variante="ghost" tamanho="p" icone={Upload} onClick={() => arquivo.current?.click()}>Enviar arquivo</Botao>
            {!adicionando && <Botao variante="ghost" tamanho="p" icone={Plus} onClick={() => setAdicionando(true)}>Link ou caminho</Botao>}
          </>
        )}>
        <input ref={arquivo} type="file" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,application/zip,.zip"
          onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void acoes.enviarArquivos(d, f) }} />
        {adicionando && <Adicionar d={d} fechar={() => setAdicionando(false)} />}
        {anexos.length > 0 && (
          <ul className="mdl-anexos" aria-label="Anexos da demanda">
            {visiveis.map((a) => <CartaoAnexo key={a.id} a={a} ctx={ctx} />)}
          </ul>
        )}
        {anexos.length > LIMITE && (
          <Botao variante="ghost" tamanho="p" className="self-start" onClick={() => setTodos(!todos)}>
            {todos ? 'Mostrar menos' : `Mostrar todos os ${anexos.length}`}
          </Botao>
        )}
        {so ? (anexos.length === 0 && <p className="mdl-vazio">Sem anexos.</p>) : (
          <div className="mdl-soltar" data-ativo={sobre || undefined}>
            <Upload aria-hidden="true" />
            {sobre ? 'Solte para anexar.' : 'Arraste arquivos para cá ou cole um print com Ctrl+V. Imagem, PDF ou ZIP até 10 MB.'}
          </div>
        )}
      </Secao>
    </div>
  )
}
