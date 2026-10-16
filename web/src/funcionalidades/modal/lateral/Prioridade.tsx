/** Prioridade (lateral 350): bandeira na cor do nível; o menu troca entre baixa, média, alta e urgente. */
import { Flag } from 'lucide-react'
import { PRIORIDADES, ROTULO_PRIORIDADE, type Prioridade as TipoPrioridade } from '@shared/tipos/index.ts'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { useAcoes } from '../../../api/demandas.ts'
import { Menu } from '../../../ui/Menu.tsx'

export function Bandeira({ p }: { p: TipoPrioridade }) {
  return <span className="mdl-bandeira" data-prioridade={p}><Flag aria-hidden="true" />{ROTULO_PRIORIDADE[p]}</span>
}

export default function Prioridade({ ctx }: { ctx: ContextoDemanda }) {
  const acoes = useAcoes()
  const d = ctx.demanda
  const rotulo = (
    <div className="mdl-prop-rotulo" id="mdl-prop-prioridade"><Flag aria-hidden="true" />Prioridade</div>
  )
  if (ctx.somenteLeitura) {
    return <div className="mdl-prop" data-prop="prioridade">{rotulo}<div className="mdl-prop-valor"><span className="mdl-prop-botao" data-fixo=""><Bandeira p={d.prioridade} /></span></div></div>
  }
  return (
    <div className="mdl-prop" data-prop="prioridade">
      {rotulo}
      <div className="mdl-prop-valor">
        <Menu rotulo="Prioridade" itens={PRIORIDADES.map((p) => ({
          id: p, rotulo: ROTULO_PRIORIDADE[p], marcado: p === d.prioridade,
          executar: () => { if (p !== d.prioridade) void acoes.editar(d, { prioridade: p }) },
        }))}>
          {(g) => (
            <button type="button" {...g} className="mdl-prop-botao" data-mdl-ancora="prioridade" aria-labelledby="mdl-prop-prioridade mdl-prop-prioridade-v">
              <span id="mdl-prop-prioridade-v" className="contents"><Bandeira p={d.prioridade} /></span>
            </button>
          )}
        </Menu>
      </div>
    </div>
  )
}
