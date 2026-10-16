/**
 * Popover `membros` (M): busca por nome ou apelido; os membros primeiro, depois a equipe do quadro, depois o resto.
 * Cada clique põe ou tira na hora ("Entrar"/"Sair" para mim no topo). Marca quem é o responsável do cliente nesta
 * equipe. Devolve os membros como ficaram.
 */
import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import type { UsuarioResumo } from '@shared/tipos/index.ts'
import { normalizarBusca } from '../../../ui/Combobox.tsx'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { useAcoes } from '../../../api/demandas.ts'
import { useCliente, useQuadro } from '../../../api/seletores.ts'
import { useEu } from '../../../api/auth.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { Avatar } from '../../../ui/Avatar.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { Campo } from '../../../ui/Campo.tsx'
import { useDemandaAtual, useUsuarios } from '../comum.tsx'

export default function DialogoMembros({ params, fechar }: PropsDialogo<'membros'>) {
  const d = useDemandaAtual(params.demandaId)
  const acoes = useAcoes()
  const eu = useEu()
  const usuarios = useUsuarios()
  const quadro = useQuadro(d?.quadroId ?? null)
  const cliente = useCliente(d?.clienteId ?? null)
  const [busca, setBusca] = useState('')
  const membroIds = d?.membroIds ?? []
  const responsavel = cliente?.responsaveis.find((r) => r.equipeId === quadro?.equipeId)?.usuarioId ?? null

  const grupos = useMemo(() => {
    const t = normalizarBusca(busca)
    const casa = (u: UsuarioResumo) => !t || normalizarBusca(`${u.nome} ${u.apelido ?? ''}`).includes(t)
    const ativos = usuarios.filter((u) => u.ativo || membroIds.includes(u.id)).filter(casa)
    const ordem = (a: UsuarioResumo, b: UsuarioResumo) => a.nome.localeCompare(b.nome, 'pt-BR')
    const membros = membroIds.map((id) => ativos.find((u) => u.id === id)).filter((u): u is UsuarioResumo => !!u)
    const daEquipe = ativos.filter((u) => !membroIds.includes(u.id) && !!quadro?.equipeId && u.equipeIds.includes(quadro.equipeId)).sort(ordem)
    const outros = ativos.filter((u) => !membroIds.includes(u.id) && !daEquipe.includes(u)).sort(ordem)
    return [
      { id: 'membros', rotulo: 'Na demanda', pessoas: membros },
      { id: 'equipe', rotulo: quadro?.equipeId ? `Equipe do quadro ${quadro.nome}` : 'Equipe do quadro', pessoas: daEquipe },
      { id: 'outros', rotulo: 'Outras pessoas', pessoas: outros },
    ].filter((g) => g.pessoas.length > 0)
  }, [usuarios, membroIds, quadro, busca])

  if (!d) return <MolduraDialogo titulo="Membros"><p className="mdl-vazio">Esta demanda não está mais aqui.</p></MolduraDialogo>
  const souMembro = membroIds.includes(eu.usuario.id)
  const alternar = (u: UsuarioResumo) => void (membroIds.includes(u.id) ? acoes.membros.sair(d, u.id) : acoes.membros.entrar(d, u.id))

  return (
    <MolduraDialogo titulo="Membros" largura={320}>
      <div className="flex flex-col gap-3" onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault() }}>
        <Botao variante="secundario" tamanho="p" larguraTotal onClick={() => void (souMembro ? acoes.membros.sair(d, eu.usuario.id) : acoes.membros.entrar(d, eu.usuario.id))}
          atalho="space">
          {souMembro ? 'Sair da demanda' : 'Entrar na demanda'}
        </Botao>
        <Campo rotulo="Buscar pessoa" rotuloOculto icone={Search} placeholder="Nome ou apelido" value={busca} onChange={(e) => setBusca(e.target.value)}
          tamanho="p" data-autofocus="" />
        <div className="mdl-lista" role="group" aria-label="Pessoas">
          {grupos.length === 0 && <p className="mdl-vazio px-2 py-1">Ninguém com esse nome.</p>}
          {grupos.map((g) => (
            <div key={g.id} role="group" aria-label={g.rotulo}>
              <div className="mdl-grupo-rotulo" aria-hidden="true">{g.rotulo}</div>
              {g.pessoas.map((u) => {
                const dentro = membroIds.includes(u.id)
                return (
                  <button key={u.id} type="button" className="mdl-opcao" role="checkbox" aria-checked={dentro} onClick={() => alternar(u)}>
                    <Avatar pessoa={u} tamanho={26} dica={false} />
                    <span className="mdl-opcao-nome">{u.nome}{u.id === eu.usuario.id ? ' (você)' : ''}</span>
                    {u.id === responsavel && <span className="mdl-opcao-detalhe">responsável {cliente?.sigla}</span>}
                    {!u.ativo && <span className="mdl-opcao-detalhe">desativada</span>}
                    {dentro && <Check className="mdl-opcao-check" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <Botao variante="ghost" tamanho="p" onClick={() => fechar({ membroIds })}>Pronto</Botao>
      </div>
    </MolduraDialogo>
  )
}
