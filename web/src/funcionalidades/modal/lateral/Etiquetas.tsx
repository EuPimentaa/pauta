/**
 * Etiquetas (lateral 150): as cores em pontos e quantas são (os nomes já estão no topo do modal, ao lado do número);
 * abre o popover `etiquetas` para marcar, criar e editar as do quadro (L).
 */
import { Tag } from 'lucide-react'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { useEtiquetas } from '../../../api/seletores.ts'
import { abrirDialogo } from '../../../dialogos/estado.ts'
import { Propriedade, Vazio } from '../comum.tsx'

export default function Etiquetas({ ctx }: { ctx: ContextoDemanda }) {
  const d = ctx.demanda
  // o quadro da demanda agora (o ctx.quadro vem do detalhe e pode estar velho depois de um mover)
  const doQuadro = useEtiquetas(d.quadroId)
  const minhas = doQuadro.filter((e) => d.etiquetaIds.includes(e.id))
  return (
    <Propriedade id="etiquetas" icone={Tag} rotulo="Etiquetas" atalho="L" desabilitado={ctx.somenteLeitura} vazio={minhas.length === 0}
      abrir={(ancora) => void abrirDialogo('etiquetas', { quadroId: d.quadroId, demandaId: d.id }, { ancora })}>
      {minhas.length ? (
        <>
          <span className="mdl-pontos" aria-hidden="true">
            {minhas.slice(0, 6).map((e) => <span key={e.id} className="mdl-ponto" data-cor={e.cor} />)}
          </span>
          <span>{minhas.length === 1 ? (minhas[0]!.nome || '1 etiqueta') : `${minhas.length} etiquetas`}</span>
        </>
      ) : <Vazio>{ctx.somenteLeitura ? 'Nenhuma' : 'Adicionar'}</Vazio>}
    </Propriedade>
  )
}
