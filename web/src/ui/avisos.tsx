/**
 * Avisos (toasts) com sonner, no visual da marca (superfície invertida). Um <Avisos /> é montado pelo App.
 *
 *   avisar('Movida para Social › Agendar', { desfazer: () => voltar() })
 *   avisar('Não foi possível salvar.', { tipo: 'erro', acao: { rotulo: 'Tentar de novo', executar: salvar } })
 *
 * Desfazer só para mutações sem efeito externo (API §5.11). Com desfazer, o aviso fica 8 s.
 */
import { createPortal } from 'react-dom'
import { toast, Toaster } from 'sonner'
import { AlertTriangle, Check, Info, X } from 'lucide-react'
import { raizCamadas } from '../lib/camadas.ts'
import { useCelular } from '../lib/midia.ts'

export type TipoAviso = 'neutro' | 'sucesso' | 'erro' | 'aviso' | 'info'

export interface OpcoesAviso {
  tipo?: TipoAviso
  descricao?: string
  /** Botão "Desfazer" (fecha o aviso e chama). */
  desfazer?: () => void | Promise<void>
  /** Outro botão de ação ("Tentar de novo", "Abrir"). */
  acao?: { rotulo: string; executar: () => void | Promise<void> }
  /** ms. Padrão: 5 s; 8 s com desfazer ou ação; erro 7 s. */
  duracao?: number
  /** Reaproveita um aviso já aberto (ex.: "Salvando…" → "Salvo"). */
  id?: string | number
}

const ICONES = { sucesso: Check, erro: X, aviso: AlertTriangle, info: Info } as const

export function avisar(mensagem: string, opcoes: OpcoesAviso = {}): string | number {
  const tipo = opcoes.tipo ?? 'neutro'
  const duracao = opcoes.duracao ?? (opcoes.desfazer || opcoes.acao ? 8000 : tipo === 'erro' ? 7000 : 5000)
  return toast.custom((id) => {
    const Icone = tipo === 'neutro' ? null : ICONES[tipo]
    const botao = opcoes.desfazer ? { rotulo: 'Desfazer', executar: opcoes.desfazer } : opcoes.acao
    return (
      <div className="ui-aviso" data-tipo={tipo} role={tipo === 'erro' ? 'alert' : 'status'}>
        {Icone && <span className="ui-aviso-icone" aria-hidden="true"><Icone /></span>}
        <div className="ui-aviso-texto">
          {mensagem}
          {opcoes.descricao && <span className="ui-aviso-descricao">{opcoes.descricao}</span>}
        </div>
        {botao && (
          <button type="button" className="ui-aviso-acao" onClick={() => { toast.dismiss(id); void botao.executar() }}>
            {botao.rotulo}
          </button>
        )}
        <button type="button" className="ui-aviso-fechar" aria-label="Fechar aviso" onClick={() => toast.dismiss(id)}>
          <X aria-hidden="true" />
        </button>
      </div>
    )
  }, { duration: duracao, id: opcoes.id })
}

export function fecharAviso(id?: string | number): void {
  toast.dismiss(id)
}

/** Montado uma vez (App.tsx), num portal fora do #root: os avisos continuam clicáveis com um modal aberto. */
export function Avisos() {
  const celular = useCelular()
  return createPortal(
    <Toaster
      position={celular ? 'top-center' : 'bottom-left'}
      gap={10}
      visibleToasts={4}
      offset={{ bottom: 24, left: 24 }}
      mobileOffset={{ top: 64, left: 16, right: 16 }}
      containerAriaLabel="Avisos"
      toastOptions={{ unstyled: true }}
    />,
    raizCamadas(),
  )
}
