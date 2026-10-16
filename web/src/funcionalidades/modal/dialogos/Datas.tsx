/**
 * Popover `datas` (D): início, prazo e publicação (cada um com hora opcional; prazo sem hora = 18h) e repetir. Salva
 * tudo de uma vez (um PATCH; o núcleo mescla se outra pessoa mudou junto). Repetir exige prazo; o início não passa do
 * prazo.
 */
import { useState } from 'react'
import type { DataLocal, HoraLocal, Repeticao } from '@shared/tipos/index.ts'
import { REPETICOES, ROTULO_REPETICAO } from '@shared/tipos/index.ts'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { useAcoes } from '../../../api/demandas.ts'
import { useListaFeriados } from '../../../api/seletores.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { Selecao } from '../../../ui/Campo.tsx'
import { SeletorData } from '../../../ui/SeletorData.tsx'
import { useDemandaAtual } from '../comum.tsx'

interface Datas {
  inicio: DataLocal | null; inicioHora: HoraLocal | null; prazo: DataLocal | null; prazoHora: HoraLocal | null
  publicacaoData: DataLocal | null; publicacaoHora: HoraLocal | null; repetir: Repeticao
}

export default function DialogoDatas({ params, fechar }: PropsDialogo<'datas'>) {
  const d = useDemandaAtual(params.demandaId)
  const acoes = useAcoes()
  const feriados = useListaFeriados()
  const [v, setV] = useState<Datas | null>(() => (d ? {
    inicio: d.inicio, inicioHora: d.inicioHora, prazo: d.prazo, prazoHora: d.prazoHora, publicacaoData: d.publicacaoData,
    publicacaoHora: d.publicacaoHora, repetir: d.repetir,
  } : null))
  const [salvando, setSalvando] = useState(false)
  if (!d || !v) return <MolduraDialogo titulo="Datas"><p className="mdl-vazio">Esta demanda não está mais aqui.</p></MolduraDialogo>

  const mudar = (p: Partial<Datas>) => setV((x) => (x ? { ...x, ...p } : x))
  const erro = v.repetir !== 'nenhuma' && !v.prazo ? 'Para repetir, defina o prazo.'
    : v.inicio && v.prazo && v.inicio > v.prazo ? 'O início vem depois do prazo.' : null
  const mudancas = Object.fromEntries((Object.keys(v) as (keyof Datas)[]).filter((k) => v[k] !== d[k]).map((k) => [k, v[k]])) as Partial<Datas>
  const nada = Object.keys(mudancas).length === 0

  async function salvar() {
    if (erro || !d) return
    if (nada) { fechar(null); return }
    setSalvando(true)
    const r = await acoes.editar(d, mudancas)
    setSalvando(false)
    if (r) fechar({ demanda: r.demanda })
  }

  return (
    <MolduraDialogo titulo="Datas" largura={340}
      rodape={(
        <>
          <Botao variante="ghost" tamanho="p" onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao variante="secundario" tamanho="p" onClick={() => void salvar()} disabled={!!erro} carregando={salvando}>Salvar</Botao>
        </>
      )}>
      <form className="mdl-datas" onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        <div className="mdl-data-linha">
          <span id="mdl-data-prazo">Prazo</span>
          <SeletorData rotulo="Prazo" valor={v.prazo} hora={v.prazoHora} comHora feriados={feriados} placeholder="Sem prazo"
            aoMudar={(data, hora) => mudar({ prazo: data, prazoHora: data ? hora : null, ...(data ? {} : { repetir: 'nenhuma' as Repeticao }) })} />
        </div>
        <div className="mdl-data-linha">
          <span>Início</span>
          <SeletorData rotulo="Início" valor={v.inicio} hora={v.inicioHora} comHora feriados={feriados}
            aoMudar={(data, hora) => mudar({ inicio: data, inicioHora: data ? hora : null })} />
        </div>
        <div className="mdl-data-linha">
          <span>Publicação</span>
          <SeletorData rotulo="Publicação" valor={v.publicacaoData} hora={v.publicacaoHora} comHora feriados={feriados}
            aoMudar={(data, hora) => mudar({ publicacaoData: data, publicacaoHora: data ? hora : null })} />
        </div>
        <div className="mdl-data-linha">
          <label htmlFor="mdl-repetir">Repetir</label>
          <Selecao id="mdl-repetir" rotulo="Repetir" rotuloOculto tamanho="p" value={v.repetir} disabled={!v.prazo}
            onChange={(e) => mudar({ repetir: e.target.value as Repeticao })}
            opcoes={REPETICOES.map((r) => ({ valor: r, rotulo: ROTULO_REPETICAO[r] }))} />
        </div>
        <p className={erro ? 'text-meta text-danger-ink' : 'text-meta text-fg-2'} role={erro ? 'alert' : undefined}>
          {erro ?? (v.repetir !== 'nenhuma'
            ? 'Ao concluir, a próxima nasce com o prazo seguinte na coluna de entrada do quadro onde foi criada.'
            : 'Prazo sem hora vale até as 18h.')}
        </p>
      </form>
    </MolduraDialogo>
  )
}
