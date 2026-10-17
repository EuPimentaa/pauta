/**
 * Peças do ciclo (F2) que a seção do modal e os diálogos dividem: cabeçalho de seção, datas curtas, o item entregue
 * (prévia estática; o iframe só abre no clique, em hosts conhecidos; caminho de rede como texto com Copiar) e a lista
 * de itens de uma entrega (link, caminho ou arquivo, com Ctrl+V e arrastar, e o teste de Drive de cada link).
 * Traz o ciclo.css para o chunk.
 */
import './ciclo.css'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle, Cloud, Download, ExternalLink, Eye, FileArchive, FileText, FolderOpen, Image as IconeImagem, Link2, PenTool, Upload, Video, X,
} from 'lucide-react'
import type { ArquivoInfo, DriveStatus, Instante, NovoItem, Provedor, VersaoItem } from '@shared/tipos/index.ts'
import { dataLocalDe, formatarPrazo, horaLocalDe } from '@shared/logica/datas.ts'
import { mensagemDeErro } from '../../api/cliente.ts'
import { useEnviarArquivo } from '../../api/arquivos.ts'
import { cx } from '../../lib/classes.ts'
import { Botao, BotaoIcone } from '../../ui/Botao.tsx'
import { CopiarTexto } from '../../ui/Texto.tsx'
import { testarLinkDrive } from './api.ts'
import { enderecoEmbutido, lerEndereco } from './logica.ts'

// ─────────────────────────────── seção ───────────────────────────────

export function Secao({ id, icone: Icone, titulo, meta, acoes, children }: {
  id: string; icone: LucideIcon; titulo: string; meta?: ReactNode; acoes?: ReactNode; children: ReactNode
}) {
  return (
    <section className="modal-demanda-secao cic-secao" aria-labelledby={`cic-${id}`} data-secao={id}>
      <div className="cic-secao-cabeca">
        <span className="cic-secao-icone" aria-hidden="true"><Icone /></span>
        <h3 id={`cic-${id}`} className="cic-secao-titulo">{titulo}</h3>
        {meta}
        {acoes && <div className="cic-secao-acoes">{acoes}</div>}
      </div>
      <div className="cic-secao-corpo">{children}</div>
    </section>
  )
}

// ─────────────────────────────── datas ───────────────────────────────

/** "qui, 15/10 às 10:00" (horário de São Paulo). */
export function quando(i: Instante): string {
  return `${formatarPrazo(dataLocalDe(i), null)} às ${horaLocalDe(i)}`
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias" ou "12/09". */
export function tempoRelativo(i: Instante, agora = Date.now()): string {
  const s = Math.max(0, Math.round((agora - Date.parse(i)) / 1000))
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86_400) return `há ${Math.round(s / 3600)} h`
  const dias = Math.round(s / 86_400)
  if (dias === 1) return 'ontem'
  if (dias < 7) return `há ${dias} dias`
  const [, m, d] = dataLocalDe(i).split('-')
  return `${d}/${m}`
}

// ─────────────────────────────── item entregue ───────────────────────────────

const PROVEDOR: Record<Provedor, { rotulo: string; icone: LucideIcon }> = {
  drive: { rotulo: 'Google Drive', icone: Cloud }, docs: { rotulo: 'Google Docs', icone: FileText }, figma: { rotulo: 'Figma', icone: PenTool },
  canva: { rotulo: 'Canva', icone: PenTool }, wetransfer: { rotulo: 'WeTransfer', icone: Cloud }, youtube: { rotulo: 'YouTube', icone: Video },
  vimeo: { rotulo: 'Vimeo', icone: Video }, dropbox: { rotulo: 'Dropbox', icone: Cloud }, rede: { rotulo: 'Pasta de rede', icone: FolderOpen },
  arquivo: { rotulo: 'Arquivo', icone: FileText }, outro: { rotulo: 'Link', icone: Link2 },
}

const hostDe = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

export function ChipDrive({ status }: { status: DriveStatus | 'nao_drive' | null | undefined }) {
  if (!status || status === 'nao_drive') return null
  if (status === 'publico') return <span className="cic-selo" data-tom="sucesso">Aberto a quem tem o link</span>
  if (status === 'privado') return <span className="cic-selo" data-tom="perigo"><AlertTriangle aria-hidden="true" />Privado: o cliente verá um login</span>
  if (status === 'pasta') return <span className="cic-selo" data-tom="aviso">Pasta: confira o compartilhamento</span>
  return <span className="cic-selo">Não deu para testar</span>
}

const tamanho = (b: number) => (b < 1_048_576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${String(Math.round((b / 1_048_576) * 10) / 10).replace('.', ',')} MB`)

/** Um item da versão: prévia estática (imagem ou miniatura pública do Drive); "Ver aqui" abre o iframe dos hosts conhecidos. */
export function ItemVersao({ i }: { i: VersaoItem }) {
  const [embutir, setEmbutir] = useState(false)
  const p = PROVEDOR[i.provedor ?? 'outro']
  const imagem = !!i.arquivo?.imagem
  const href = i.tipo === 'link' ? i.url : i.arquivo ? i.arquivo.url : null
  const previa = imagem ? i.arquivo!.url : i.previaUrl
  const embutido = i.tipo === 'link' && i.url ? enderecoEmbutido(i.url) : null
  const Icone = i.tipo === 'arquivo' ? (imagem ? IconeImagem : i.arquivo?.mime === 'application/zip' ? FileArchive : FileText) : p.icone
  const detalhe = i.tipo === 'link' && i.url ? (i.provedor === 'outro' ? hostDe(i.url) : p.rotulo)
    : i.tipo === 'caminho' ? 'Pasta de rede' : i.arquivo ? tamanho(i.arquivo.bytes) : 'Arquivo'
  return (
    <li className="cic-item" data-com-previa={previa ? '' : undefined}>
      {previa ? (
        <a className="cic-item-previa" href={href ?? previa} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${i.nome}`}>
          <img src={previa} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        </a>
      ) : (
        <span className="cic-item-miniatura" aria-hidden="true"><Icone /></span>
      )}
      <div className="cic-item-info">
        {href
          ? <a className="cic-item-nome" href={href} target="_blank" rel="noopener noreferrer" title={i.nome}>{i.nome}</a>
          : <span className="cic-item-nome" title={i.nome}>{i.nome}</span>}
        <span className="cic-item-detalhe">
          <span>{detalhe}</span>
          {i.tipo === 'link' && i.provedor === 'drive' && i.driveStatus !== 'publico' && <ChipDrive status={i.driveStatus} />}
        </span>
      </div>
      <span className="cic-item-acoes">
        {embutido && (
          <BotaoIcone icone={embutir ? X : Eye} rotulo={embutir ? 'Fechar a prévia' : 'Ver aqui'} tamanho="p" aria-expanded={embutir}
            onClick={() => setEmbutir((v) => !v)} />
        )}
        {href && i.tipo === 'link' && <BotaoIcone icone={ExternalLink} rotulo="Abrir em outra aba" tamanho="p" onClick={() => window.open(href, '_blank', 'noopener,noreferrer')} />}
        {i.arquivo && <BotaoIcone icone={Download} rotulo="Baixar" tamanho="p" onClick={() => window.open(i.arquivo!.url.replace('?inline=1', ''), '_blank', 'noopener,noreferrer')} />}
      </span>
      {i.tipo === 'caminho' && i.caminho && (
        <div className="cic-item-caminho"><CopiarTexto texto={i.caminho} rotulo="Copiar caminho" avisoCopiado="Caminho copiado." /></div>
      )}
      {embutir && embutido && (
        <div className="cic-embutido">
          <iframe src={embutido} title={`Prévia de ${i.nome}`} loading="lazy" referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allow="fullscreen" />
        </div>
      )}
    </li>
  )
}

// ─────────────────────────────── itens de uma entrega ───────────────────────────────

/** Um item na lista do formulário: o que vai para a API e o que a tela mostra. */
export interface ItemNovo {
  chave: string
  item: NovoItem
  rotulo: string
  detalhe: string
  arquivo?: ArquivoInfo
  drive?: DriveStatus | 'nao_drive' | 'testando'
}

let contador = 0
const novaChave = () => `i${++contador}`

/** Arquivos de um colar ou soltar (só os de verdade; texto passa). */
export function arquivosDe(dados: DataTransfer | null): File[] {
  return dados ? Array.from(dados.files ?? []).filter((f) => f.size > 0) : []
}

/**
 * Lista editável de itens: um campo que aceita link https ou caminho de rede (Enter acrescenta), "Enviar arquivo (até
 * 10 MB)", arrastar e Ctrl+V. Cada link do Drive é testado na hora (só aviso aqui; o envio por link é que bloqueia).
 */
export function ItensEntrega({ itens, mudar, sugestaoCaminho, rotulo = 'O que foi entregue', autoFoco }: {
  itens: ItemNovo[]; mudar(fn: (l: ItemNovo[]) => ItemNovo[]): void; sugestaoCaminho?: string | null; rotulo?: string; autoFoco?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(0)
  const [arrastando, setArrastando] = useState(false)
  const enviarArquivo = useEnviarArquivo()
  const arquivoRef = useRef<HTMLInputElement>(null)
  const campoRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFoco && window.matchMedia('(pointer: fine)').matches) campoRef.current?.focus() }, [autoFoco])

  function acrescentarEndereco(bruto: string): boolean {
    const e = lerEndereco(bruto)
    if (!e) {
      setErro(bruto.trim().startsWith('http://') ? 'Use um link https.' : 'Cole um link https (Drive, Figma…) ou um caminho como M:\\Clientes\\…')
      return false
    }
    setErro(null)
    const chave = novaChave()
    if (e.tipo === 'link') {
      const drive = /(^|\.)drive\.google\.com$/i.test(hostDe(e.url))
      mudar((l) => [...l, { chave, item: { tipo: 'link', url: e.url }, rotulo: drive ? (/\/folders\//.test(e.url) ? 'Pasta no Google Drive' : 'Arquivo no Google Drive') : hostDe(e.url), detalhe: e.url, drive: drive ? 'testando' : undefined }])
      if (drive) {
        void testarLinkDrive(e.url).then((r) => mudar((l) => l.map((x) => (x.chave === chave ? { ...x, drive: r.status } : x))))
          .catch(() => mudar((l) => l.map((x) => (x.chave === chave ? { ...x, drive: 'erro' } : x))))
      }
    } else {
      const nome = e.caminho.split(/[\\/]/).filter(Boolean).at(-1) ?? e.caminho
      mudar((l) => [...l, { chave, item: { tipo: 'caminho', caminho: e.caminho }, rotulo: nome, detalhe: e.caminho }])
    }
    return true
  }

  async function enviarArquivos(lista: File[]) {
    setErro(null)
    for (const f of lista) {
      setEnviando((n) => n + 1)
      try {
        const info = await enviarArquivo(f)
        mudar((l) => [...l, { chave: novaChave(), item: { tipo: 'arquivo', arquivoId: info.id }, rotulo: info.nome, detalhe: tamanho(info.bytes), arquivo: info }])
      } catch (e) {
        setErro(`${f.name || 'Arquivo'}: ${mensagemDeErro(e)}`)
      } finally {
        setEnviando((n) => n - 1)
      }
    }
  }

  return (
    <div className="cic-campo"
      onPaste={(e) => {
        const arqs = arquivosDe(e.clipboardData)
        if (arqs.length) { e.preventDefault(); void enviarArquivos(arqs) }
      }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true) } }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => { const arqs = arquivosDe(e.dataTransfer); if (arqs.length) { e.preventDefault(); setArrastando(false); void enviarArquivos(arqs) } }}>
      <label className="cic-rotulo" htmlFor="cic-entrega-endereco">{rotulo}</label>
      <div className="cic-entrega-campo">
        <div className="ui-entrada" data-tamanho="m" data-invalido={erro ? 'true' : undefined}>
          <input ref={campoRef} id="cic-entrega-endereco" value={texto} placeholder="Link do Drive ou caminho da pasta de saída"
            aria-describedby="cic-entrega-ajuda" aria-invalid={erro ? true : undefined} autoComplete="off" spellCheck={false}
            onChange={(e) => { setTexto(e.target.value); setErro(null) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && texto.trim()) {
                e.preventDefault()
                if (acrescentarEndereco(texto)) setTexto('')
              }
            }}
            onBlur={() => { if (texto.trim() && lerEndereco(texto) && acrescentarEndereco(texto)) setTexto('') }} />
        </div>
        <Botao variante="secundario" onClick={() => { if (texto.trim() && acrescentarEndereco(texto)) setTexto('') }} disabled={!texto.trim()}>Acrescentar</Botao>
      </div>
      <p id="cic-entrega-ajuda" className={cx(erro ? 'cic-erro' : 'cic-ajuda')} role={erro ? 'alert' : undefined}>
        {erro ?? 'Enter acrescenta. Arquivos de até 10 MB: arraste para cá, cole com Ctrl+V ou use o botão.'}
      </p>
      {sugestaoCaminho && !itens.some((x) => x.item.tipo === 'caminho') && (
        <div className="cic-linha">
          <Botao variante="ghost" tamanho="p" icone={FolderOpen} onClick={() => acrescentarEndereco(sugestaoCaminho)}>
            Usar a pasta de saída do cliente
          </Botao>
        </div>
      )}
      {itens.length > 0 && (
        <ul className="cic-lista-itens" aria-label="Itens desta entrega">
          {itens.map((x) => {
            const I = x.item.tipo === 'arquivo' ? (x.arquivo?.imagem ? IconeImagem : FileText) : x.item.tipo === 'caminho' ? FolderOpen : x.drive ? Cloud : Link2
            return (
              <li key={x.chave} className="cic-lista-item">
                <I aria-hidden="true" />
                <div className="cic-lista-item-info">
                  <span className="cic-lista-item-nome" title={x.detalhe}>{x.rotulo}</span>
                  <span className="cic-lista-item-detalhe">
                    <span className="truncate" title={x.detalhe}>{x.item.tipo === 'link' ? hostDe(x.detalhe) : x.detalhe}</span>
                    {x.drive === 'testando' ? <span className="cic-selo">Testando o Drive…</span> : <ChipDrive status={x.drive} />}
                  </span>
                </div>
                <BotaoIcone icone={X} rotulo={`Tirar ${x.rotulo}`} tamanho="p" onClick={() => mudar((l) => l.filter((y) => y.chave !== x.chave))} />
              </li>
            )
          })}
        </ul>
      )}
      <div className={cx('cic-soltar')} data-ativo={arrastando || undefined}>
        <Botao variante="secundario" tamanho="p" icone={Upload} carregando={enviando > 0} onClick={() => arquivoRef.current?.click()}>
          Enviar arquivo (até 10 MB)
        </Botao>
        <span>ou arraste para cá</span>
        <input ref={arquivoRef} type="file" hidden multiple accept="image/*,application/pdf,application/zip"
          onChange={(e) => { const arqs = Array.from(e.target.files ?? []); e.target.value = ''; void enviarArquivos(arqs) }} />
      </div>
    </div>
  )
}
