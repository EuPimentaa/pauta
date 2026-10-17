/**
 * Automações do quadro (F2; API.md §4.8 e §5.5): as 4 linhas "Ao enviar ao cliente, mover para [quadro › coluna]"
 * (qualquer coluna ativa de qualquer quadro ativo, ou "Não mover") e, quando o destino é outro quadro, [Manter os
 * membros | Responsável do cliente no destino]. O ajuste e a aprovação rodam as automações do quadro DE ONDE a peça
 * foi enviada: a Criação configura o vaivém inteiro. Só atendimento e admin mudam; os outros veem.
 */
import { useCallback, useId, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { Bootstrap, GatilhoAutomacao, MembrosAoMover } from '@shared/tipos/index.ts'
import { GATILHOS_AUTOMACAO, ROTULO_GATILHO } from '@shared/tipos/index.ts'
import { pode } from '@shared/logica/permissoes.ts'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { useEu } from '../../../api/auth.ts'
import { mensagemDeErro } from '../../../api/cliente.ts'
import { useAutomacoes, useDoBootstrap, useQuadro } from '../../../api/seletores.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { avisar } from '../../../ui/avisos.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { Selecao } from '../../../ui/Campo.tsx'
import { acoesCiclo } from '../api.ts'

interface Linha {
  destino: string
  membros: MembrosAoMover
}

const AJUDA: Record<GatilhoAutomacao, string> = {
  enviado_ao_cliente: 'Quando o atendimento envia uma versão (por link ou por fora).',
  ajuste_pedido: 'Quando o cliente pede ajuste pelo link ou o atendimento registra o retorno. Vale para o que saiu deste quadro.',
  aprovado: 'Quando o cliente aprova pelo link, pelo WhatsApp ou o atendimento registra. Vale para o que saiu deste quadro.',
  concluida: 'Quando alguém marca a demanda como concluída (não ao soltar numa coluna de concluídas).',
}

export default function AutomacoesQuadro({ params, fechar }: PropsDialogo<'automacoes-quadro'>) {
  const qc = useQueryClient()
  const eu = useEu()
  const quadro = useQuadro(params.quadroId)
  const automacoes = useAutomacoes(params.quadroId)
  const selDestinos = useCallback((b: Bootstrap) => ({ quadros: b.quadros, colunas: b.colunas }), [])
  const destinos = useDoBootstrap(selDestinos)
  const idForm = useId()
  const podeEditar = pode('automacao.editar', { id: eu.usuario.id, papel: eu.usuario.papel })
  const inicial = useMemo(() => Object.fromEntries(GATILHOS_AUTOMACAO.map((g) => {
    const a = automacoes.find((x) => x.gatilho === g)
    const ativaEValida = a && a.ativa && destinos?.colunas.some((c) => c.id === a.destinoColunaId && c.arquivadaEm === null)
    return [g, { destino: ativaEValida ? a.destinoColunaId : '', membros: a?.membros ?? 'manter' }]
  })) as Record<GatilhoAutomacao, Linha>, [automacoes, destinos])
  const [linhas, setLinhas] = useState<Record<GatilhoAutomacao, Linha> | null>(null)
  const atual = linhas ?? inicial
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const opcoes = useMemo(() => {
    if (!destinos || !quadro) return []
    const ordem = [quadro, ...destinos.quadros.filter((q) => q.id !== quadro.id && q.arquivadoEm === null).sort((a, b) => a.pos - b.pos)]
    return ordem.flatMap((q) => destinos.colunas.filter((c) => c.quadroId === q.id && c.arquivadaEm === null).sort((a, b) => a.pos - b.pos)
      .map((c) => ({ valor: c.id, rotulo: `${q.nome} › ${c.nome}` })))
  }, [destinos, quadro])

  if (!quadro) {
    return (
      <MolduraDialogo titulo="Automações" rodape={<Botao onClick={() => fechar(null)}>Fechar</Botao>}>
        <p className="cic-vazio">Este quadro não está mais ativo.</p>
      </MolduraDialogo>
    )
  }
  const mudou = GATILHOS_AUTOMACAO.some((g) => atual[g].destino !== inicial[g].destino
    || (atual[g].destino && atual[g].membros !== inicial[g].membros))
  const quadroDe = (colunaId: string) => destinos?.colunas.find((c) => c.id === colunaId)?.quadroId

  async function salvar() {
    if (!mudou || salvando) { fechar(mudou ? null : { salvo: true }); return }
    setSalvando(true)
    setErro(null)
    const acoes = acoesCiclo(qc)
    try {
      for (const g of GATILHOS_AUTOMACAO) {
        const novo = atual[g]
        const antes = inicial[g]
        const existe = automacoes.some((a) => a.gatilho === g)
        if (!novo.destino) {
          if (existe) await acoes.excluirAutomacao(quadro!.id, g)
        } else if (novo.destino !== antes.destino || novo.membros !== antes.membros || !automacoes.find((a) => a.gatilho === g)?.ativa) {
          await acoes.definirAutomacao(quadro!.id, g, { destinoColunaId: novo.destino, membros: novo.membros, ativa: true })
        }
      }
      avisar('Automações salvas', { tipo: 'sucesso' })
      fechar({ salvo: true })
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <MolduraDialogo titulo={`Automações do quadro ${quadro.nome}`} tamanho="m" fecharAoClicarFora={!mudou}
      descricao="Cada uma é opcional e move o card para o topo da coluna escolhida, que pode ser de outro quadro."
      rodape={podeEditar ? (
        <>
          <Botao onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={salvando} disabled={!mudou}>Salvar</Botao>
        </>
      ) : <Botao onClick={() => fechar(null)}>Fechar</Botao>}>
      <form id={idForm} className="cic-form" onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        {!podeEditar && <p className="cic-ajuda">Só o atendimento e o admin mudam as automações do quadro.</p>}
        <ul className="cic-automacoes">
          {GATILHOS_AUTOMACAO.map((g) => {
            const l = atual[g]
            const salva = automacoes.find((a) => a.gatilho === g)
            const desligada = !!salva && !inicial[g].destino
            const outroQuadro = !!l.destino && quadroDe(l.destino) !== quadro.id
            const nomeGrupo = `${idForm}-${g}-membros`
            return (
              <li key={g} className="cic-automacao">
                <Selecao rotulo={ROTULO_GATILHO[g]} value={l.destino} disabled={!podeEditar} ajuda={AJUDA[g]}
                  onChange={(e) => setLinhas({ ...atual, [g]: { ...l, destino: e.target.value } })}
                  opcoes={[{ valor: '', rotulo: 'Não mover' }, ...opcoes]} />
                {desligada && (
                  <div className="cic-alerta" role="status">
                    <AlertTriangle aria-hidden="true" />
                    <span>Estava desligada: a coluna de destino foi arquivada. Escolha outra para religar.</span>
                  </div>
                )}
                {outroQuadro && (
                  <fieldset className="cic-automacao-membros" disabled={!podeEditar}>
                    <legend className="sr-only">Membros ao mudar de quadro</legend>
                    <ArrowRight aria-hidden="true" className="size-4 text-fg-2" />
                    <label>
                      <input type="radio" name={nomeGrupo} checked={l.membros === 'manter'}
                        onChange={() => setLinhas({ ...atual, [g]: { ...l, membros: 'manter' } })} />
                      Manter os membros
                    </label>
                    <label>
                      <input type="radio" name={nomeGrupo} checked={l.membros === 'responsavel_destino'}
                        onChange={() => setLinhas({ ...atual, [g]: { ...l, membros: 'responsavel_destino' } })} />
                      Responsável do cliente no destino
                    </label>
                  </fieldset>
                )}
              </li>
            )
          })}
        </ul>
        {erro && <p className="cic-erro" role="alert">{erro}</p>}
      </form>
    </MolduraDialogo>
  )
}
