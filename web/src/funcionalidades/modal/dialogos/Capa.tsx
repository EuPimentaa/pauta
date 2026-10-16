/**
 * Popover `capa`: uma cor da paleta, uma das imagens anexadas ou uma imagem nova (enviada e anexada na hora). Muda na
 * hora; "Tirar a capa" limpa. A imagem da capa aparece no card e no topo do modal.
 */
import { useRef } from 'react'
import { ImagePlus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { Cor, Id } from '@shared/tipos/index.ts'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { aplicarPatchDemanda } from '../../../api/cache.ts'
import { useAcoes } from '../../../api/demandas.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { SeletorCor } from '../../../ui/SeletorCor.tsx'
import { useAcoesModal } from '../api.ts'
import { detalheDe } from '../cache.ts'
import { useDemandaAtual } from '../comum.tsx'

export default function DialogoCapa({ params, fechar }: PropsDialogo<'capa'>) {
  const d = useDemandaAtual(params.demandaId)
  const qc = useQueryClient()
  const acoes = useAcoes()
  const modal = useAcoesModal()
  const arquivo = useRef<HTMLInputElement>(null)
  if (!d) return <MolduraDialogo titulo="Capa"><p className="mdl-vazio">Esta demanda não está mais aqui.</p></MolduraDialogo>
  const imagens = (detalheDe(qc, d.id)?.anexos ?? []).filter((a) => a.arquivo?.imagem && a.finalidade === 'referencia')

  async function cor(c: Cor | null) {
    if (!d) return
    const r = await acoes.editar(d, c ? { capaCor: c } : { capaCor: null, capaAnexoId: null })
    if (r) fechar({ demanda: r.demanda })
  }
  async function imagem(anexoId: Id, url: string) {
    if (!d) return
    aplicarPatchDemanda(qc, d.id, { capaUrl: url })
    const r = await acoes.editar(d, { capaAnexoId: anexoId })
    if (r) fechar({ demanda: r.demanda })
  }
  async function enviar(f: File | undefined) {
    if (!f || !d) return
    const [a] = await modal.enviarArquivos(d, [f])
    if (a?.arquivo?.imagem) await imagem(a.id, a.arquivo.url)
  }

  return (
    <MolduraDialogo titulo="Capa" largura={320}>
      <div className="mdl-formulario">
        <div className="flex flex-col gap-2">
          <span className="text-meta text-fg-2">Cor</span>
          <SeletorCor rotulo="Cor da capa" valor={d.capaAnexoId ? null : d.capaCor} aoMudar={(c) => void cor(c)} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-meta text-fg-2">Imagem</span>
          {imagens.length > 0 && (
            <div className="mdl-capas" role="group" aria-label="Imagens anexadas">
              {imagens.map((a) => (
                <button key={a.id} type="button" className="mdl-capa-opcao" aria-pressed={d.capaAnexoId === a.id} aria-label={`Usar ${a.nome} como capa`}
                  onClick={() => void imagem(a.id, a.arquivo!.url)}>
                  <img src={a.arquivo!.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          <input ref={arquivo} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void enviar(f) }} />
          <Botao variante="secundario" tamanho="p" icone={ImagePlus} onClick={() => arquivo.current?.click()}>Enviar imagem</Botao>
          <p className="text-meta text-fg-2">Dica: com o modal aberto, cole um print com Ctrl+V e use “Tornar capa” no anexo.</p>
        </div>
        {(d.capaCor || d.capaAnexoId) && (
          <div className="mdl-formulario-botoes"><Botao variante="ghost" tamanho="p" onClick={() => void cor(null)}>Tirar a capa</Botao></div>
        )}
      </div>
    </MolduraDialogo>
  )
}
