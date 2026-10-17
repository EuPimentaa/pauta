/**
 * Diálogo `atalhos` (o "?"): a lista gerada de atalhos() de todas as funcionalidades, por grupo, com as teclas que
 * fazem a mesma coisa juntas ("J ou ↓"), onde valem (no quadro, num card, no modal) e um filtro. Entram também os
 * que a casca escuta sozinha (ATALHOS_CASCA: o [ que recolhe o menu).
 */
import './atalhos.css'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { Atalho, EscopoAtalho, PropsDialogo } from '../../extensoes/tipos.ts'
import { MolduraDialogo, useContextoAcao } from '../../dialogos/index.ts'
import { ATALHOS_CASCA } from '../../casca/estado.ts'
import { useRegistro } from '../../sessao/registro.ts'
import { Campo } from '../../ui/Campo.tsx'
import { Kbd } from '../../ui/Kbd.tsx'
import { agruparAtalhos, GRUPOS_ATALHO } from './atalhos.ts'

const ONDE: Record<EscopoAtalho, string> = {
  global: 'em qualquer tela', quadro: 'no quadro', card: 'num card em foco', modal: 'na demanda aberta', agenda: 'na Agenda',
}

export default function ListaAtalhos(_props: PropsDialogo<'atalhos'>) {
  const reg = useRegistro()
  const ctx = useContextoAcao()
  const [filtro, setFiltro] = useState('')
  const grupos = useMemo(() => agruparAtalhos([...(reg.atalhos() as Atalho[]),
    ...ATALHOS_CASCA.map((a): Pick<Atalho, 'id' | 'teclas' | 'descricao' | 'escopo' | 'grupo'> => ({ ...a, id: `casca-${a.teclas}`, escopo: 'global' }))], filtro),
  [reg, filtro])
  const desligados = ctx.eu.prefs.atalhos === false
  return (
    <MolduraDialogo titulo="Atalhos do teclado" tamanho="m">
      <div className="entrada-atalhos">
        <p className="entrada-atalhos-nota">
          {desligados
            ? 'Os atalhos de uma tecla estão desligados (Configurações › Aparência). Os com Ctrl continuam.'
            : 'Atalhos de uma tecla não valem dentro de um campo de texto.'}
        </p>
        <Campo rotulo="Filtrar atalhos" rotuloOculto icone={Search} tamanho="p" value={filtro} placeholder="Filtrar: mover, prazo, busca…"
          onChange={(e) => setFiltro(e.target.value)} data-autofocus="" autoComplete="off" />
        {grupos.length === 0 && <p className="entrada-atalhos-vazio" role="status">Nenhum atalho com "{filtro.trim()}".</p>}
        {grupos.map((g) => (
          <section key={g.grupo} className="entrada-atalhos-grupo" aria-labelledby={`atalhos-${g.grupo}`}>
            <h3 id={`atalhos-${g.grupo}`} className="entrada-atalhos-titulo">{GRUPOS_ATALHO[g.grupo]}</h3>
            <dl className="entrada-atalhos-lista">
              {g.itens.map((i) => (
                <div key={i.chave} className="entrada-atalhos-item">
                  <dt>
                    {i.descricao}
                    {!i.escopos.includes('global') && !(i.escopos.length === 1 && i.escopo === g.grupo) && (
                      <span className="entrada-atalhos-onde"> · {i.escopos.map((e) => ONDE[e]).join(' ou ')}</span>
                    )}
                  </dt>
                  <dd>
                    {i.teclas.map((t, n) => (
                      <span key={t} className="entrada-atalhos-teclas">
                        {n > 0 && <span className="entrada-atalhos-ou">ou</span>}
                        <Kbd teclas={t} />
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </MolduraDialogo>
  )
}
