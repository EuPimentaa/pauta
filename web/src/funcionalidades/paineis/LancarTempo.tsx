/**
 * [Lançar tempo] da tela /horas (F3): escolher a demanda (as minhas primeiro; busca por #número, título ou sigla do
 * cliente) e abrir o diálogo `lancar-tempo` do modal (F1) nela. Popover ancorado no botão; folha no celular.
 */
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ClienteResumo, Demanda, Id, Quadro } from '@shared/tipos/index.ts'
import { ehMinha } from '@shared/logica/quadro.ts'
import { useEu } from '../../api/auth.ts'
import { useClientes, useDemandas, useQuadros } from '../../api/seletores.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { Combobox, normalizarBusca } from '../../ui/Combobox.tsx'
import { GrupoCampo } from '../../ui/Campo.tsx'
import { Popover } from '../../ui/Popover.tsx'

export function LancarTempo({ ancora, fechar }: { ancora: HTMLElement | null; fechar(): void }) {
  const eu = useEu()
  const qc = useQueryClient()
  const abrirDialogo = useAbrirDialogo()
  const demandas = useDemandas()
  const clientes = useClientes()
  const quadros = useQuadros()
  const [escolhida, setEscolhida] = useState<Demanda | null>(null)
  const porCliente = useMemo(() => new Map<Id, ClienteResumo>(clientes.map((c) => [c.id, c])), [clientes])
  const porQuadro = useMemo(() => new Map<Id, Quadro>(quadros.map((q) => [q.id, q])), [quadros])
  // abertas; as minhas primeiro, depois as mais novas
  const opcoes = useMemo(() => demandas.filter((d) => !d.concluidaEm && !d.arquivadoEm).sort((a, b) =>
    Number(ehMinha(b, eu.usuario.id)) - Number(ehMinha(a, eu.usuario.id)) || b.numero - a.numero), [demandas, eu.usuario.id])

  async function escolher(d: Demanda | null) {
    setEscolhida(d)
    if (!d) return
    fechar()
    const r = await abrirDialogo('lancar-tempo', { demandaId: d.id })
    if (r) void qc.invalidateQueries({ queryKey: ['apontamentos'] })
  }

  return (
    <Popover aberto aoFechar={fechar} ancora={ancora} titulo="Lançar tempo" mostrarTitulo largura={380} alinhar="fim">
      <div className="ui-popover-corpo">
        <GrupoCampo rotulo="Em qual demanda?" ajuda="As suas aparecem primeiro. Busque pelo número, título ou sigla do cliente.">
          {(aria) => (
            <Combobox {...aria} opcoes={opcoes} valor={escolhida} aoMudar={(d) => void escolher(d)} idDe={(d) => d.id}
              rotuloDe={(d) => `#${d.numero} ${d.titulo}`} limite={30}
              detalheDe={(d) => [d.clienteId ? porCliente.get(d.clienteId)?.sigla : null, porQuadro.get(d.quadroId)?.nome].filter(Boolean).join(' · ')}
              filtrar={(d, t) => {
                const sigla = d.clienteId ? porCliente.get(d.clienteId)?.sigla ?? '' : ''
                return normalizarBusca(`#${d.numero} ${d.numero} ${d.titulo} ${sigla}`).includes(t)
              }}
              placeholder="#12, título ou sigla" vazio="Nenhuma demanda aberta com isso." />
          )}
        </GrupoCampo>
      </div>
    </Popover>
  )
}
