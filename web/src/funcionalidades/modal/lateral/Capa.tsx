/** Capa (lateral 600): a cor ou a imagem do card; abre o popover `capa` (cores, imagens anexadas, enviar imagem). */
import { ChevronDown, Image as IconeImagem } from 'lucide-react'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { abrirDialogo } from '../../../dialogos/estado.ts'
import { useLocal } from '../../../lib/armazenamento.ts'
import { ROTULO_COR } from '../../../lib/cores.ts'
import { Propriedade, Vazio } from '../comum.tsx'

/**
 * Só no celular (o CSS esconde no resto): as linhas sem valor ficam escondidas para a descrição subir; este botão
 * mostra todas (a escolha fica no aparelho).
 */
function TodosOsCampos() {
  const [todos, setTodos] = useLocal<boolean>('modal-campos-todos', false)
  return (
    <button type="button" className="mdl-campos" data-mdl-campos={todos ? 'todos' : 'preenchidos'} aria-expanded={todos} onClick={() => setTodos(!todos)}>
      <ChevronDown aria-hidden="true" />{todos ? 'Esconder os campos vazios' : 'Mostrar todos os campos'}
    </button>
  )
}

export default function Capa({ ctx }: { ctx: ContextoDemanda }) {
  const d = ctx.demanda
  return (
    <>
      <Propriedade id="capa" icone={IconeImagem} rotulo="Capa" grupo desabilitado={ctx.somenteLeitura} vazio={!d.capaUrl && !d.capaCor}
        abrir={(ancora) => void abrirDialogo('capa', { demandaId: d.id }, { ancora })}>
        {d.capaUrl ? (
          <span className="mdl-capa-previa"><img src={d.capaUrl} alt="Imagem da capa" /></span>
        ) : d.capaCor ? (
          <><span className="mdl-ponto" data-cor={d.capaCor} aria-hidden="true" /><span>{ROTULO_COR[d.capaCor]}</span></>
        ) : <Vazio>{ctx.somenteLeitura ? 'Sem capa' : 'Escolher'}</Vazio>}
      </Propriedade>
      <TodosOsCampos />
    </>
  )
}
