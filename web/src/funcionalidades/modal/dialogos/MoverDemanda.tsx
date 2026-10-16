/**
 * "Mover para…" (`mover-demanda`, Shift+M): quadro, coluna e posição. Indo para outro quadro, mostra as etiquetas sem
 * par de mesmo nome no destino ([Deixar no quadro de origem | Criar lá]; as deixadas voltam se a demanda voltar) e,
 * quando o cliente tem responsável na equipe do destino, [Manter os membros | Passar para Bia]. Numa coluna de pessoa,
 * avisa quem entra (e quem sai). Passa pelos interceptadores do soltar (origem 'dialogo').
 */
import { useId, useMemo, useState } from 'react'
import type { Bootstrap, Etiqueta, EtiquetasSemPar, MembrosAoMover, MoverEntrada } from '@shared/tipos/index.ts'
import { mapearEtiquetas } from '@shared/logica/quadro.ts'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { useAcoes } from '../../../api/demandas.ts'
import { useDoBootstrap } from '../../../api/seletores.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { nomeCurto, useDemandaAtual } from '../comum.tsx'
import { cardsDe, colunasDe, posicaoDe, SeletorLugar, type Lugar } from './Lugar.tsx'

const selBase = (b: Bootstrap) => b

export function nomesEtiquetas(es: readonly Etiqueta[]): string {
  const nomes = es.map((e) => `“${e.nome || 'sem nome'}”`)
  return nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`
}

export default function DialogoMoverDemanda({ params, fechar }: PropsDialogo<'mover-demanda'>) {
  const d = useDemandaAtual(params.demandaId)
  const b = useDoBootstrap(selBase)
  const acoes = useAcoes()
  const idForm = useId()
  const [lugar, setLugar] = useState<Lugar>(() => {
    const quadroId = params.quadroId ?? d?.quadroId ?? ''
    const colunaId = quadroId === d?.quadroId ? d.colunaId : (colunasDe(b, quadroId).find((c) => c.papel === 'normal')?.id ?? '')
    const outros = d ? cardsDe(b, d.colunaId, d.id) : []
    const atual = d ? outros.filter((x) => x.posicao < d.posicao).length : 0
    return { quadroId, colunaId, indice: quadroId === d?.quadroId ? (atual >= outros.length ? null : atual) : 0 }
  })
  const [etiquetasSemPar, setEtiquetasSemPar] = useState<EtiquetasSemPar>('deixar')
  const [membros, setMembros] = useState<MembrosAoMover>('manter')
  const [salvando, setSalvando] = useState(false)

  const info = useMemo(() => {
    if (!b || !d) return null
    const de = b.colunas.find((c) => c.id === d.colunaId)
    const para = b.colunas.find((c) => c.id === lugar.colunaId)
    const quadroPara = b.quadros.find((q) => q.id === lugar.quadroId)
    const outroQuadro = lugar.quadroId !== d.quadroId
    const atuais = b.etiquetas.filter((e) => d.etiquetaIds.includes(e.id))
    const semPar = outroQuadro ? mapearEtiquetas(atuais, b.etiquetas.filter((e) => e.quadroId === lugar.quadroId), []).semPar : []
    const cliente = d.clienteId ? b.clientes.find((c) => c.id === d.clienteId) : undefined
    const respId = outroQuadro && quadroPara?.equipeId ? cliente?.responsaveis.find((r) => r.equipeId === quadroPara.equipeId)?.usuarioId : undefined
    const resp = respId ? b.usuarios.find((u) => u.id === respId && u.ativo) : undefined
    const oferecerResp = !!resp && !(d.membroIds.length === 1 && d.membroIds[0] === resp.id)
    const pessoa = para?.responsavelId ? b.usuarios.find((u) => u.id === para.responsavelId) : undefined
    const saiDaColuna = de?.responsavelId && para?.responsavelId && de.responsavelId !== para.responsavelId
      ? b.usuarios.find((u) => u.id === de.responsavelId) : undefined
    return { de, para, quadroPara, outroQuadro, semPar, cliente, resp, oferecerResp, pessoa, saiDaColuna }
  }, [b, d, lugar])

  if (!d || !info) return <MolduraDialogo titulo="Mover"><p className="mdl-vazio">Esta demanda não está mais aqui.</p></MolduraDialogo>
  const daColuna = cardsDe(b, d.colunaId, d.id)
  const mesmoLugar = lugar.colunaId === d.colunaId
    && (lugar.indice ?? daColuna.length) === daColuna.filter((x) => x.posicao < d.posicao).length

  async function mover() {
    if (!d || !info?.para) return
    setSalvando(true)
    const cards = cardsDe(b, lugar.colunaId, d.id)
    const entrada: MoverEntrada = { colunaId: lugar.colunaId, posicao: posicaoDe(cards, lugar.indice) }
    if (info.outroQuadro) {
      entrada.etiquetasSemPar = info.semPar.length ? etiquetasSemPar : 'deixar'
      if (info.oferecerResp) entrada.membros = membros
    }
    const r = await acoes.mover(d, entrada, 'dialogo')
    setSalvando(false)
    if (r) fechar({ demanda: r.demanda })
  }

  const destino = info.outroQuadro ? `${info.quadroPara?.nome ?? ''} › ${info.para?.nome ?? ''}` : info.para?.nome ?? ''
  return (
    <MolduraDialogo titulo={`Mover #${d.numero}`} descricao={d.titulo} tamanho="m"
      rodape={(
        <>
          <Botao variante="secundario" onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={salvando} disabled={!info.para || mesmoLugar}>
            {info.para ? `Mover para ${destino}` : 'Mover'}
          </Botao>
        </>
      )}>
      <form id={idForm} className="mdl-formulario" onSubmit={(e) => { e.preventDefault(); void mover() }}>
        <SeletorLugar lugar={lugar} mudar={setLugar} demandaId={d.id} quadroAtual={d.quadroId} focoNoQuadro={!!params.quadroId} />
        {info.pessoa && info.para?.id !== d.colunaId && !d.membroIds.includes(info.pessoa.id) && (
          <p className="text-meta text-fg-2">
            {nomeCurto(info.pessoa)} entra como membro (a coluna é dela){info.saiDaColuna ? ` e ${nomeCurto(info.saiDaColuna)} sai` : ''}.
          </p>
        )}
        {info.semPar.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mdl-sem-par mb-2">
              {info.semPar.length === 1 ? 'A etiqueta ' : 'As etiquetas '}<strong>{nomesEtiquetas(info.semPar)}</strong>
              {info.semPar.length === 1 ? ' não existe' : ' não existem'} no quadro {info.quadroPara?.nome}.
            </legend>
            <div className="mdl-escolhas">
              <label className="mdl-escolha">
                <input type="radio" name="etiquetas" checked={etiquetasSemPar === 'deixar'} onChange={() => setEtiquetasSemPar('deixar')} />
                <span>Deixar no quadro de origem<small>Ficam guardadas na demanda e voltam se ela voltar para lá.</small></span>
              </label>
              <label className="mdl-escolha">
                <input type="radio" name="etiquetas" checked={etiquetasSemPar === 'criar'} onChange={() => setEtiquetasSemPar('criar')} />
                <span>Criar lá<small>Com o mesmo nome e a mesma cor no quadro {info.quadroPara?.nome}.</small></span>
              </label>
            </div>
          </fieldset>
        )}
        {info.oferecerResp && info.resp && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-rotulo mb-1 font-medium text-fg">Membros no quadro {info.quadroPara?.nome}</legend>
            <div className="mdl-escolhas">
              <label className="mdl-escolha">
                <input type="radio" name="membros" checked={membros === 'manter'} onChange={() => setMembros('manter')} />
                <span>Manter os membros<small>A demanda segue com quem está nela.</small></span>
              </label>
              <label className="mdl-escolha">
                <input type="radio" name="membros" checked={membros === 'responsavel_destino'} onChange={() => setMembros('responsavel_destino')} />
                <span>Passar para {nomeCurto(info.resp)}<small>{nomeCurto(info.resp)} é quem cuida do {info.cliente?.sigla} nesta equipe.</small></span>
              </label>
            </div>
          </fieldset>
        )}
      </form>
    </MolduraDialogo>
  )
}
