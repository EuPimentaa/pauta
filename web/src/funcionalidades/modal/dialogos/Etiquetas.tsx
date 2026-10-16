/**
 * Popover `etiquetas` (L). Com `demandaId`: marcar e desmarcar as etiquetas do quadro no card (na hora), criar uma
 * nova pelo que foi digitado e editar nome e cor. Sem `demandaId` (menu ··· do quadro): gerenciar as etiquetas do
 * quadro (criar, renomear, cor, excluir; excluir tira de todos os cards).
 */
import { useMemo, useState } from 'react'
import { ArrowLeft, Check, Pencil, Plus, Search } from 'lucide-react'
import { CORES, type Cor, type Etiqueta } from '@shared/tipos/index.ts'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { useAcoes } from '../../../api/demandas.ts'
import { useEtiquetasMutacoes } from '../../../api/quadros.ts'
import { useEtiquetas, useQuadro } from '../../../api/seletores.ts'
import { abrirDialogo } from '../../../dialogos/estado.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { ROTULO_COR } from '../../../lib/cores.ts'
import { Botao, BotaoIcone } from '../../../ui/Botao.tsx'
import { Campo } from '../../../ui/Campo.tsx'
import { normalizarBusca } from '../../../ui/Combobox.tsx'
import { SeletorCor } from '../../../ui/SeletorCor.tsx'
import { useDemandaAtual } from '../comum.tsx'

function Editor({ inicial, aoSalvar, aoExcluir, aoVoltar }: {
  inicial: { nome: string; cor: Cor }; aoSalvar(nome: string, cor: Cor): void; aoExcluir?(): void; aoVoltar(): void
}) {
  const [nome, setNome] = useState(inicial.nome)
  const [cor, setCor] = useState<Cor>(inicial.cor)
  return (
    <form className="mdl-formulario" onSubmit={(e) => { e.preventDefault(); aoSalvar(nome.trim(), cor) }}>
      <div className="mdl-etiqueta-barra" data-cor={cor}><span>{nome.trim() || ROTULO_COR[cor]}</span></div>
      <Campo rotulo="Nome" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} data-autofocus="" placeholder="Sem nome: só a cor"
        tamanho="p" />
      <SeletorCor rotulo="Cor" valor={cor} aoMudar={(c) => { if (c) setCor(c) }} />
      <div className="mdl-formulario-botoes">
        <Botao variante="ghost" tamanho="p" icone={ArrowLeft} onClick={aoVoltar}>Voltar</Botao>
        {aoExcluir && <Botao variante="perigo" tamanho="p" onClick={aoExcluir}>Excluir</Botao>}
        <Botao type="submit" variante="secundario" tamanho="p">Salvar</Botao>
      </div>
    </form>
  )
}

export default function DialogoEtiquetas({ params, fechar }: PropsDialogo<'etiquetas'>) {
  const d = useDemandaAtual(params.demandaId ?? '')
  const quadro = useQuadro(params.quadroId)
  const etiquetas = useEtiquetas(params.quadroId)
  const mut = useEtiquetasMutacoes()
  const acoes = useAcoes()
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Etiqueta | 'nova' | null>(null)
  const comDemanda = !!params.demandaId
  const marcadas = d?.etiquetaIds ?? []

  const visiveis = useMemo(() => {
    const t = normalizarBusca(busca)
    return etiquetas.filter((e) => !t || normalizarBusca(e.nome || ROTULO_COR[e.cor]).includes(t))
  }, [etiquetas, busca])
  const existe = etiquetas.some((e) => normalizarBusca(e.nome) === normalizarBusca(busca))
  const corLivre = CORES.find((c) => !etiquetas.some((e) => e.cor === c)) ?? CORES[0]

  async function criar(nome: string, cor: Cor) {
    const nova = await mut.criar(params.quadroId, { nome, cor })
    setEditando(null)
    setBusca('')
    if (nova && d) await acoes.etiquetas.por(d, nova.id)
  }

  async function excluir(e: Etiqueta) {
    const ok = await abrirDialogo('confirmar', {
      titulo: `Excluir a etiqueta ${e.nome || ROTULO_COR[e.cor]}?`,
      mensagem: 'Ela sai de todos os cards deste quadro. Não dá para desfazer.', confirmar: 'Excluir', perigo: true,
    })
    if (ok && await mut.excluir(e)) setEditando(null)
  }

  const titulo = comDemanda ? 'Etiquetas' : `Etiquetas de ${quadro?.nome ?? 'quadro'}`

  if (editando) {
    const inicial = editando === 'nova' ? { nome: busca.trim(), cor: corLivre } : editando
    return (
      <MolduraDialogo titulo={editando === 'nova' ? 'Nova etiqueta' : 'Editar etiqueta'} largura={320}>
        <Editor inicial={inicial} aoVoltar={() => setEditando(null)}
          aoSalvar={(nome, cor) => {
            if (editando === 'nova') void criar(nome, cor)
            else { void mut.editar(editando, { nome, cor }); setEditando(null) }
          }}
          aoExcluir={editando === 'nova' ? undefined : () => void excluir(editando)} />
      </MolduraDialogo>
    )
  }

  return (
    <MolduraDialogo titulo={titulo} largura={320} tamanho="p">
      <div className="flex flex-col gap-3">
        <Campo rotulo="Buscar etiqueta" rotuloOculto icone={Search} placeholder="Buscar ou criar" value={busca} tamanho="p" data-autofocus=""
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const unica = visiveis.length === 1 ? visiveis[0] : undefined
            if (unica && d) void (marcadas.includes(unica.id) ? acoes.etiquetas.tirar(d, unica.id) : acoes.etiquetas.por(d, unica.id))
            else if (busca.trim() && !existe) setEditando('nova')
          }} />
        <div className="mdl-lista" role="group" aria-label={`Etiquetas do quadro ${quadro?.nome ?? ''}`}>
          {etiquetas.length === 0 && <p className="mdl-vazio px-2 py-1">Este quadro ainda não tem etiquetas.</p>}
          {etiquetas.length > 0 && visiveis.length === 0 && <p className="mdl-vazio px-2 py-1">Nenhuma com esse nome.</p>}
          {visiveis.map((e) => {
            const marcada = marcadas.includes(e.id)
            const nome = e.nome || ROTULO_COR[e.cor]
            return (
              <div key={e.id} className="mdl-etiqueta-linha">
                {comDemanda && d ? (
                  <button type="button" className="mdl-etiqueta-alternar" role="checkbox" aria-checked={marcada}
                    onClick={() => void (marcada ? acoes.etiquetas.tirar(d, e.id) : acoes.etiquetas.por(d, e.id))}>
                    <span className="mdl-etiqueta-barra" data-cor={e.cor}><span>{e.nome || <span className="sr-only">{nome}</span>}</span></span>
                    <span className="grid size-4 place-items-center">{marcada && <Check className="mdl-opcao-check" aria-hidden="true" />}</span>
                  </button>
                ) : (
                  <span className="mdl-etiqueta-alternar"><span className="mdl-etiqueta-barra" data-cor={e.cor}><span>{nome}</span></span></span>
                )}
                <BotaoIcone icone={Pencil} rotulo={`Editar a etiqueta ${nome}`} tamanho="p" onClick={() => setEditando(e)} />
              </div>
            )
          })}
        </div>
        <Botao variante="ghost" tamanho="p" icone={Plus} onClick={() => setEditando('nova')}>
          {busca.trim() && !existe ? `Criar “${busca.trim()}”` : 'Criar etiqueta'}
        </Botao>
        {comDemanda && <Botao variante="ghost" tamanho="p" onClick={() => fechar({ etiquetaIds: marcadas })}>Pronto</Botao>}
      </div>
    </MolduraDialogo>
  )
}
