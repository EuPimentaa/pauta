/**
 * Peças comuns das telas do F5: painel, faixa de aviso, pílula, botão de cor (paleta num popover), seletor de fundo do
 * quadro, o link de convite copiável e utilidades de erro e de permissão.
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { FUNDOS_QUADRO, type Cor, type FundoQuadro, type LinkAcesso, type UsuarioResumo } from '@shared/tipos/index.ts'
import { pode, type AcaoPermissao, type AlvoPermissao } from '@shared/logica/permissoes.ts'
import { useEu } from '../../api/auth.ts'
import { ehErroDaApi } from '../../api/cliente.ts'
import type { Icone } from '../../extensoes/tipos.ts'
import { cx } from '../../lib/classes.ts'
import { ROTULO_COR } from '../../lib/cores.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Popover } from '../../ui/Popover.tsx'
import { SeletorCor } from '../../ui/SeletorCor.tsx'
import { copiarParaAreaDeTransferencia } from '../../ui/Texto.tsx'
import { Tooltip } from '../../ui/Tooltip.tsx'
import './cadastros.css'

// ─────────────────────────────── molduras ───────────────────────────────

export function Painel({ titulo, icone: I, acoes, children, className, id }: {
  titulo?: ReactNode; icone?: Icone; acoes?: ReactNode; children: ReactNode; className?: string; id?: string
}) {
  return (
    <section className={cx('cad-painel', className)} aria-labelledby={titulo && id ? `${id}-titulo` : undefined}>
      {(titulo || acoes) && (
        <div className="cad-painel-cabeca">
          {titulo && <h2 className="cad-painel-titulo" id={id ? `${id}-titulo` : undefined}>{I && <I aria-hidden="true" />}{titulo}</h2>}
          {acoes && <div className="cad-acoes">{acoes}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Faixa({ tom, icone: I, children, acoes }: { tom?: 'aviso' | 'info' | 'sucesso' | 'perigo'; icone?: Icone; children: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="cad-faixa" data-tom={tom === 'aviso' ? undefined : tom} role={tom === 'perigo' ? 'alert' : undefined}>
      {I && <I aria-hidden="true" />}
      <div className="cad-faixa-corpo">
        <div>{children}</div>
        {acoes && <div className="cad-acoes">{acoes}</div>}
      </div>
    </div>
  )
}

export function Pilula({ tom, cor, icone: I, children, titulo }: {
  tom?: 'aviso' | 'sucesso' | 'perigo' | 'info' | 'acento'; cor?: Cor; icone?: Icone; children: ReactNode; titulo?: string
}) {
  return (
    <span className="cad-pilula" data-tom={tom} data-cor={cor} title={titulo}>
      {I && <I aria-hidden="true" />}
      {children}
    </span>
  )
}

// ─────────────────────────────── cor e fundo ───────────────────────────────

/** Botão pequeno com a cor atual; abre a paleta (SeletorCor) num popover (folha no celular). */
export function BotaoCor({ valor, aoMudar, rotulo, permitirSemCor, desabilitado }: {
  valor: Cor | null; aoMudar(c: Cor | null): void; rotulo: string; permitirSemCor?: boolean; desabilitado?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [ancora, setAncora] = useState<HTMLButtonElement | null>(null)
  const nome = valor ? ROTULO_COR[valor] : 'Sem cor'
  return (
    <>
      <Tooltip texto={`${rotulo}: ${nome}`}>
        <button ref={setAncora} type="button" className="cad-cor-botao" data-cor={valor ?? undefined} data-sem-cor={valor ? undefined : ''}
          aria-label={`${rotulo}: ${nome}`} aria-haspopup="dialog" aria-expanded={aberto} disabled={desabilitado}
          onClick={() => setAberto((a) => !a)}>
          <span aria-hidden="true" />
        </button>
      </Tooltip>
      <Popover aberto={aberto} aoFechar={() => setAberto(false)} ancora={ancora} titulo={rotulo} largura={248}>
        <div className="ui-popover-corpo">
          <SeletorCor valor={valor} rotulo={rotulo} permitirSemCor={permitirSemCor} aoMudar={(c) => { aoMudar(c); setAberto(false) }} />
        </div>
      </Popover>
    </>
  )
}

export const ROTULO_FUNDO: Record<FundoQuadro, string> = {
  liso: 'Liso', grafite: 'Grafite', berinjela: 'Berinjela', cobalto: 'Cobalto', aurora: 'Aurora',
}

/** Fundos do quadro (gradientes da marca) como radiogroup: setas movem e escolhem. */
export function SeletorFundo({ valor, aoMudar, rotulo = 'Fundo do quadro' }: { valor: FundoQuadro; aoMudar(f: FundoQuadro): void; rotulo?: string }) {
  const grupo = useRef<HTMLDivElement>(null)
  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    const i = FUNDOS_QUADRO.indexOf(valor)
    aoMudar(FUNDOS_QUADRO[(i + passo + FUNDOS_QUADRO.length) % FUNDOS_QUADRO.length])
    requestAnimationFrame(() => grupo.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
  }
  return (
    <div ref={grupo} role="radiogroup" aria-label={rotulo} className="cad-fundos" onKeyDown={aoTeclar}>
      {FUNDOS_QUADRO.map((f) => (
        <div key={f} className="cad-fundo-item">
          <button type="button" role="radio" aria-checked={f === valor} tabIndex={f === valor ? 0 : -1} aria-label={ROTULO_FUNDO[f]}
            className="cad-fundo" data-fundo={f} onClick={() => aoMudar(f)}>
            {f === valor && <Check aria-hidden="true" />}
          </button>
          <span className="cad-fundo-rotulo" aria-hidden="true">{ROTULO_FUNDO[f]}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────── link de convite ───────────────────────────────

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome
export const nomeCurto = (u: Pick<UsuarioResumo, 'nome' | 'apelido'>) => u.apelido?.trim() || primeiroNome(u.nome)

function validade(expiraEm: string): string {
  const ms = Date.parse(expiraEm) - Date.now()
  const horas = Math.round(ms / 3_600_000)
  if (horas < 24) return horas <= 1 ? 'vale por 1 hora' : `vale por ${horas} horas`
  const dias = Math.round(horas / 24)
  return dias === 1 ? 'vale por 1 dia' : `vale por ${dias} dias`
}

/** Texto pronto para mandar no WhatsApp com o link (o token vai no fragmento: não cai em log nem no Referer). */
export function textoConvite(nome: string, appNome: string, link: LinkAcesso, finalidade: 'convite' | 'redefinicao'): string {
  return finalidade === 'convite'
    ? `Olá, ${primeiroNome(nome)}. Seu acesso ao ${appNome}: ${link.url} (${validade(link.expiraEm)}; é só definir a sua senha).`
    : `Olá, ${primeiroNome(nome)}. Para criar uma senha nova no ${appNome}, abra: ${link.url} (${validade(link.expiraEm)}).`
}

/** O link de convite ou de redefinição, com Copiar link e Copiar mensagem. */
export function LinkConvite({ nome, appNome, link, finalidade }: { nome: string; appNome: string; link: LinkAcesso; finalidade: 'convite' | 'redefinicao' }) {
  const [copiado, setCopiado] = useState<'link' | 'mensagem' | null>(null)
  const mensagem = textoConvite(nome, appNome, link, finalidade)
  async function copiar(o: 'link' | 'mensagem') {
    const ok = await copiarParaAreaDeTransferencia(o === 'link' ? link.url : mensagem)
    if (!ok) { avisar('Não foi possível copiar. Selecione o link e copie com Ctrl+C.', { tipo: 'erro' }); return }
    setCopiado(o)
    avisar(o === 'link' ? 'Link copiado.' : 'Mensagem copiada.', { tipo: 'sucesso', descricao: 'Mande para a pessoa pelo WhatsApp.', duracao: 3000 })
    window.setTimeout(() => setCopiado(null), 1800)
  }
  return (
    <div className="cad-convite" role="group" aria-label={finalidade === 'convite' ? `Link de convite de ${nome}` : `Link de nova senha de ${nome}`}>
      <div className="cad-convite-titulo">
        <Check aria-hidden="true" />
        {finalidade === 'convite' ? `Convite de ${primeiroNome(nome)} pronto: ${validade(link.expiraEm)}.` : `Link de nova senha pronto: ${validade(link.expiraEm)}.`}
      </div>
      <div className="cad-convite-link">
        <code title={link.url}>{link.url}</code>
        <Botao tamanho="p" variante="secundario" icone={copiado === 'link' ? Check : Copy} onClick={() => void copiar('link')} data-autofocus="">
          {copiado === 'link' ? 'Copiado' : 'Copiar link'}
        </Botao>
      </div>
      <p className="cad-convite-mensagem">{mensagem}</p>
      <div className="cad-acoes">
        <Botao tamanho="p" variante="ghost" icone={copiado === 'mensagem' ? Check : MessageCircle} onClick={() => void copiar('mensagem')}>
          {copiado === 'mensagem' ? 'Mensagem copiada' : 'Copiar mensagem para o WhatsApp'}
        </Botao>
      </div>
      <p className="cad-nota">O link é de uso único. Gerar outro invalida este.</p>
    </div>
  )
}

// ─────────────────────────────── erros e permissões ───────────────────────────────

/** Mensagem do campo no 400 validacao (detalhes.campos) ou nada. */
export function erroDoCampo(e: unknown, campo: string): string | undefined {
  if (!ehErroDaApi(e)) return undefined
  const campos = e.detalhes?.campos as Record<string, string> | undefined
  if (!campos) return undefined
  const achado = Object.entries(campos).find(([k]) => k === campo || k.startsWith(`${campo}.`))
  return achado?.[1]
}

/** Mensagem geral do erro (sem o que já aparece num campo). */
export function mensagemGeral(e: unknown): string {
  if (ehErroDaApi(e)) return e.mensagem
  return 'Não foi possível concluir. Tente de novo.'
}

export function usePode(acao: AcaoPermissao, alvo?: AlvoPermissao): boolean {
  const eu = useEu()
  return pode(acao, { id: eu.usuario.id, papel: eu.usuario.papel }, alvo)
}

export function useAdmin(): boolean {
  return useEu().usuario.papel === 'admin'
}

export function useGestao(): boolean {
  const p = useEu().usuario.papel
  return p === 'admin' || p === 'atendimento'
}
