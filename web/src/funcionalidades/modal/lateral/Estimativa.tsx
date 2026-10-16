/**
 * Estimativa (lateral 400): quanto se espera gastar ("1h30") e, com horas lançadas, quanto já foi ("1h lançada ·
 * 67%"). O popover aceita "90", "1h30", "1:30" e tem sugestões.
 */
import { useState } from 'react'
import { Hourglass } from 'lucide-react'
import { formatarDuracao, lerDuracao } from '@shared/logica/modal-texto.ts'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { useAcoes } from '../../../api/demandas.ts'
import { Botao } from '../../../ui/Botao.tsx'
import { Campo } from '../../../ui/Campo.tsx'
import { BarraProgresso } from '../../../ui/Indicadores.tsx'
import { Popover } from '../../../ui/Popover.tsx'
import { Propriedade, Vazio } from '../comum.tsx'

const SUGESTOES = [30, 60, 120, 240, 480]

function Editar({ ctx, ancora, fechar }: { ctx: ContextoDemanda; ancora: HTMLElement; fechar(): void }) {
  const acoes = useAcoes()
  const d = ctx.demanda
  const [texto, setTexto] = useState(d.estimativaMin ? formatarDuracao(d.estimativaMin).replace(' min', '') : '')
  const min = lerDuracao(texto)
  async function salvar(valor: number | null) {
    fechar()
    if (valor !== d.estimativaMin) await acoes.editar(d, { estimativaMin: valor })
  }
  return (
    <Popover aberto aoFechar={fechar} ancora={ancora} titulo="Estimativa" mostrarTitulo largura={300}>
      <form className="ui-popover-corpo mdl-formulario" onSubmit={(e) => { e.preventDefault(); if (min) void salvar(min) }}>
        <Campo rotulo="Tempo estimado" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus placeholder="1h30"
          erro={texto.trim() && !min ? 'Use minutos ou horas: 45, 1h30, 2h.' : undefined}
          ajuda={min ? (formatarDuracao(min) === texto.trim() ? undefined : `= ${formatarDuracao(min)}`) : 'Minutos ou horas: 45, 1h30, 2h.'} />
        <div className="mdl-sugestoes" role="group" aria-label="Sugestões">
          {SUGESTOES.map((s) => <button key={s} type="button" className="mdl-chip" onClick={() => void salvar(s)}>{formatarDuracao(s)}</button>)}
        </div>
        <div className="mdl-formulario-botoes">
          {d.estimativaMin !== null && <Botao variante="ghost" tamanho="p" onClick={() => void salvar(null)}>Limpar</Botao>}
          <Botao type="submit" variante="secundario" tamanho="p" disabled={!min}>Salvar</Botao>
        </div>
      </form>
    </Popover>
  )
}

export default function Estimativa({ ctx }: { ctx: ContextoDemanda }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null)
  const d = ctx.demanda
  const lancado = d.minutosRegistrados
  return (
    <>
      <Propriedade id="estimativa" icone={Hourglass} rotulo="Estimativa" desabilitado={ctx.somenteLeitura} abrir={setAncora} vazio={!d.estimativaMin}>
        {d.estimativaMin ? (
          <span className="mdl-progresso-mini">
            <span>
              {formatarDuracao(d.estimativaMin)}
              {lancado > 0 && <span className="mdl-prop-sub">{formatarDuracao(lancado)} {lancado === 1 ? 'lançado' : 'lançados'} · {Math.round((lancado / d.estimativaMin) * 100)}%</span>}
            </span>
            {lancado > 0 && <BarraProgresso valor={Math.min(lancado, d.estimativaMin)} max={d.estimativaMin} altura={4} rotulo="Tempo lançado da estimativa" />}
          </span>
        ) : <Vazio>{ctx.somenteLeitura ? 'Sem estimativa' : 'Definir'}</Vazio>}
      </Propriedade>
      {ancora && <Editar ctx={ctx} ancora={ancora} fechar={() => setAncora(null)} />}
    </>
  )
}
