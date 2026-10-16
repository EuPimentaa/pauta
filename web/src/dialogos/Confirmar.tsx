/**
 * Diálogo `confirmar` do núcleo (MapaDialogos): título, mensagem e o botão da ação; com `digitar`, a ação só libera
 * depois de digitar o texto pedido (ex.: o número ao excluir). O Cancelar vem antes da ação (foco inicial nele).
 *
 *   const ok = await abrirDialogo('confirmar', { titulo: 'Excluir a demanda #12?', mensagem: '…', confirmar: 'Excluir',
 *     perigo: true, digitar: '12' })
 */
import { useId, useState } from 'react'
import type { PropsDialogo } from '../extensoes/tipos.ts'
import { Botao } from '../ui/Botao.tsx'
import { Campo } from '../ui/Campo.tsx'
import { MolduraDialogo } from './Moldura.tsx'

export default function Confirmar({ params, fechar }: PropsDialogo<'confirmar'>) {
  const [texto, setTexto] = useState('')
  const idForm = useId()
  const liberado = !params.digitar || texto.trim() === params.digitar
  return (
    <MolduraDialogo
      titulo={params.titulo}
      rodape={(
        <>
          <Botao variante="secundario" onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante={params.perigo ? 'perigo-cheio' : 'primario'} disabled={!liberado}>
            {params.confirmar}
          </Botao>
        </>
      )}
    >
      <form id={idForm} className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (liberado) fechar({ confirmado: true }) }}>
        <p className="whitespace-pre-line text-body text-fg-2">{params.mensagem}</p>
        {params.digitar && (
          <Campo
            rotulo={<>Para confirmar, digite <strong className="text-fg">{params.digitar}</strong></>}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            inputMode={/^\d+$/.test(params.digitar) ? 'numeric' : undefined}
            data-autofocus=""
          />
        )}
      </form>
    </MolduraDialogo>
  )
}
