/**
 * Moldura de um diálogo registrado (extensoes/dialogos): quem escreve o diálogo desenha só o conteúdo dentro de
 * <MolduraDialogo>; o host decide a forma (PLANO §2, "Diálogos"): modal (tela cheia no celular) ou, aberto com
 * âncora num diálogo de forma 'popover', popover ancorado no desktop e folha no celular.
 *
 *   export default function DialogoX({ params, fechar }: PropsDialogo<'x'>) {
 *     return (
 *       <MolduraDialogo titulo="Mover demanda" rodape={<><Botao onClick={() => fechar(null)}>Cancelar</Botao>…</>}>
 *         …
 *       </MolduraDialogo>
 *     )
 *   }
 * Esc, clique fora e o "Fechar" cancelam (fechar(null)); o foco entra no primeiro campo e volta para quem abriu.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { Modal } from '../ui/Modal.tsx'
import { Popover } from '../ui/Popover.tsx'

export interface ValorMoldura {
  aberto: boolean
  forma: 'modal' | 'popover'
  ancora: HTMLElement | null
  /** Cancela (resultado null). */
  cancelar(): void
}

export const ContextoMoldura = createContext<ValorMoldura | null>(null)

export interface PropsMoldura {
  titulo: string
  descricao?: ReactNode
  rodape?: ReactNode
  /** Modal: 'p' (420 px, padrão), 'm' (560 px), 'g' (820 px). */
  tamanho?: 'p' | 'm' | 'g'
  /** Popover: largura em px (padrão 320). */
  largura?: number
  /** Modal: false = o clique fora não fecha (formulário preenchido; Esc, X e os botões continuam). Padrão true. */
  fecharAoClicarFora?: boolean
  children: ReactNode
}

export function MolduraDialogo({ titulo, descricao, rodape, tamanho = 'p', largura = 320, fecharAoClicarFora = true, children }: PropsMoldura) {
  const ctx = useContext(ContextoMoldura)
  if (!ctx) throw new Error('MolduraDialogo só funciona dentro do host de diálogos (abrirDialogo).')
  if (ctx.forma === 'popover' && ctx.ancora) {
    return (
      <Popover aberto={ctx.aberto} aoFechar={ctx.cancelar} ancora={ctx.ancora} titulo={titulo} mostrarTitulo largura={largura}>
        <div className="ui-popover-corpo">
          {descricao && <p className="mb-3 text-meta text-fg-2">{descricao}</p>}
          {children}
        </div>
        {rodape && <div className="flex flex-wrap justify-end gap-2 px-3 pb-3">{rodape}</div>}
      </Popover>
    )
  }
  return (
    <Modal aberto={ctx.aberto} aoFechar={ctx.cancelar} titulo={titulo} descricao={descricao} tamanho={tamanho} rodape={rodape}
      fecharAoClicarFora={fecharAoClicarFora}>
      {children}
    </Modal>
  )
}
