/**
 * Painel de filtros do quadro (abre pelo botão "Filtros" ou pela tecla F): Membros (com "Só as minhas" e "Sem
 * membros"), Cliente, Etiquetas (com "Sem etiquetas"), Prazo, Prioridade e Situação (com o cliente, concluídas).
 * Popover no desktop, folha no celular (com o campo de texto no topo e "Ver N demandas" no fim). Cada clique já muda a
 * URL e o quadro atrás; listas são OU dentro do campo e os campos são E entre si (shared/logica/filtros.ts).
 * Pessoas e clientes listados são os que aparecem em alguma demanda do quadro (os escolhidos ficam mesmo sem aparecer).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Plus } from 'lucide-react'
import type { FiltroPrazo, FiltrosQuadro, Id, Prioridade, Quadro } from '@shared/tipos/index.ts'
import { ROTULO_PRIORIDADE } from '@shared/tipos/index.ts'
import { contarFiltros, temFiltros } from '@shared/logica/filtros.ts'
import { normalizarAlias } from '@shared/logica/texto.ts'
import { useEu } from '../../api/auth.ts'
import { useClientes, useEtiquetas, useUsuarios } from '../../api/seletores.ts'
import { Avatar } from '../../ui/Avatar.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo } from '../../ui/Campo.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { Kbd } from '../../ui/Kbd.tsx'
import { Popover } from '../../ui/Popover.tsx'
import { BandeiraPrioridade } from './celulas.tsx'
import { useDemandasNoQuadro } from './dados.ts'
import { BuscaNoQuadro } from './BuscaNoQuadro.tsx'
import { alternarNaLista, nomeCurto, ROTULO_FILTRO_PRAZO } from './logica.ts'

interface Props {
  ancora: HTMLElement | null
  aoFechar(): void
  quadro: Quadro
  filtros: FiltrosQuadro
  definirFiltros(f: FiltrosQuadro): void
  /** Visíveis com os filtros (o "Ver 12 demandas" da folha). */
  total: number
  celular: boolean
}

const BUSCA_A_PARTIR = 8

function Secao({ titulo, id, children, acao }: { titulo: string; id: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="lista-painel-secao" aria-labelledby={id}>
      <div className="lista-painel-secao-cabeca">
        <h3 id={id} className="lista-painel-titulo">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  )
}

/** Pílula liga/desliga (aria-pressed). */
function Pilula({ ligada, aoMudar, children, titulo }: { ligada: boolean; aoMudar(): void; children: ReactNode; titulo?: string }) {
  return (
    <button type="button" className="lista-pilula" aria-pressed={ligada} onClick={aoMudar} title={titulo}>
      {ligada && <Check aria-hidden="true" className="lista-pilula-marca" />}
      {children}
    </button>
  )
}

/** Campo de busca de uma lista longa (pessoas, clientes). */
function BuscaDaLista({ valor, aoMudar, rotulo }: { valor: string; aoMudar(v: string): void; rotulo: string }) {
  return (
    <Campo rotulo={rotulo} rotuloOculto tamanho="p" type="search" placeholder={rotulo} value={valor} autoComplete="off"
      className="lista-busca" onChange={(e) => aoMudar(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Escape' && valor) { e.preventDefault(); e.stopPropagation(); aoMudar('') } }} />
  )
}

export default function PainelFiltros({ ancora, aoFechar, quadro, filtros, definirFiltros, total, celular }: Props) {
  const eu = useEu()
  const usuarios = useUsuarios()
  const clientes = useClientes()
  const etiquetas = useEtiquetas(quadro.id)
  const doQuadro = useDemandasNoQuadro(quadro.id)
  const [buscaPessoa, setBuscaPessoa] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')
  // dois cliques antes de o quadro redesenhar não se perdem: cada mudança parte da anterior
  const atual = useRef(filtros)
  useEffect(() => { atual.current = filtros }, [filtros])
  const mudar = (parcial: Partial<FiltrosQuadro>) => {
    const novo = { ...atual.current, ...parcial }
    atual.current = novo
    definirFiltros(novo)
  }

  // quem e que cliente aparecem no quadro (filtrar por quem não tem nenhuma demanda aqui não mostraria nada)
  const pessoas = useMemo(() => {
    const ids = new Set(doQuadro.flatMap((d) => d.membroIds))
    for (const id of filtros.membros ?? []) if (id !== 'nenhum') ids.add(id)
    return usuarios.filter((u) => ids.has(u.id)).sort((a, b) => nomeCurto(a).localeCompare(nomeCurto(b), 'pt-BR'))
  }, [doQuadro, usuarios, filtros.membros])
  const clientesDoQuadro = useMemo(() => {
    const ids = new Set(doQuadro.map((d) => d.clienteId).filter((id): id is Id => !!id))
    for (const id of filtros.clientes ?? []) ids.add(id)
    return clientes.filter((c) => ids.has(c.id)).sort((a, b) => a.sigla.localeCompare(b.sigla, 'pt-BR'))
  }, [doQuadro, clientes, filtros.clientes])
  const casa = (termo: string, ...textos: string[]) => {
    const t = normalizarAlias(termo)
    return !t || textos.some((x) => normalizarAlias(x).includes(t))
  }
  const pessoasVistas = pessoas.filter((u) => casa(buscaPessoa, u.nome, u.apelido ?? ''))
  const clientesVistos = clientesDoQuadro.filter((c) => casa(buscaCliente, c.sigla, c.nome, ...c.apelidos))

  const membros = filtros.membros ?? []
  const etiquetasFiltro = filtros.etiquetas ?? []
  const clientesFiltro = filtros.clientes ?? []
  const prioridades = filtros.prioridades ?? []
  const quantos = contarFiltros(filtros)

  return (
    <Popover aberto aoFechar={aoFechar} ancora={ancora} titulo="Filtros" mostrarTitulo largura={620} alinhar="inicio" className="lista-painel">
      <div className="lista-painel-corpo">
        {celular && (
          <div className="lista-painel-texto">
            <BuscaNoQuadro filtros={filtros} definirFiltros={definirFiltros} rotuloVisivel />
          </div>
        )}
        <div className="lista-painel-grade">
          <div className="lista-painel-coluna">
            <Secao titulo="Membros" id="lista-filtro-membros">
              <div className="lista-painel-lista">
                {/* o foco entra aqui (no celular, o campo de texto acima abriria o teclado por cima da folha) */}
                <Checkbox tom="neutro" checked={!!filtros.soMinhas} onChange={() => mudar({ soMinhas: !filtros.soMinhas || undefined })}
                  descricao="Sou membro ou o atendimento" data-autofocus="">
                  <span className="lista-painel-opcao">Só as minhas <Kbd teclas="q" /></span>
                </Checkbox>
                <Checkbox tom="neutro" checked={membros.includes('nenhum')} onChange={() => mudar({ membros: alternarNaLista(membros, 'nenhum') })}>
                  Sem membros
                </Checkbox>
              </div>
              {pessoas.length > BUSCA_A_PARTIR && <BuscaDaLista valor={buscaPessoa} aoMudar={setBuscaPessoa} rotulo="Buscar pessoa" />}
              <div className="lista-painel-lista" data-rola={pessoas.length > BUSCA_A_PARTIR || undefined}>
                {pessoasVistas.map((u) => (
                  <Checkbox key={u.id} tom="neutro" checked={membros.includes(u.id)} onChange={() => mudar({ membros: alternarNaLista(membros, u.id) })}>
                    <span className="lista-painel-opcao">
                      <Avatar pessoa={u} tamanho={20} dica={false} />
                      {nomeCurto(u)}{u.id === eu.usuario.id && <span className="lista-painel-detalhe">você</span>}
                      {!u.ativo && <span className="lista-painel-detalhe">desativada</span>}
                    </span>
                  </Checkbox>
                ))}
                {pessoasVistas.length === 0 && <p className="lista-painel-nada">{pessoas.length ? 'Ninguém com esse nome.' : 'Nenhuma demanda do quadro tem membros.'}</p>}
              </div>
            </Secao>

            <Secao titulo="Cliente" id="lista-filtro-cliente">
              {clientesDoQuadro.length > BUSCA_A_PARTIR && <BuscaDaLista valor={buscaCliente} aoMudar={setBuscaCliente} rotulo="Buscar cliente" />}
              <div className="lista-painel-lista" data-rola={clientesDoQuadro.length > BUSCA_A_PARTIR || undefined}>
                {clientesVistos.map((c) => (
                  <Checkbox key={c.id} tom="neutro" checked={clientesFiltro.includes(c.id)} onChange={() => mudar({ clientes: alternarNaLista(clientesFiltro, c.id) })}>
                    <span className="lista-painel-opcao">
                      <span className="lista-sigla" data-cor={c.cor}><span className="lista-ponto" aria-hidden="true" />{c.sigla}</span>
                      <span className="lista-painel-detalhe lista-painel-nome">{c.nome}</span>
                    </span>
                  </Checkbox>
                ))}
                {clientesVistos.length === 0 && <p className="lista-painel-nada">{clientesDoQuadro.length ? 'Nenhum cliente com esse nome.' : 'Nenhuma demanda do quadro tem cliente.'}</p>}
              </div>
            </Secao>
          </div>

          <div className="lista-painel-coluna">
            <Secao titulo="Etiquetas" id="lista-filtro-etiquetas">
              <div className="lista-painel-pilulas">
                <Pilula ligada={etiquetasFiltro.includes('nenhuma')} aoMudar={() => mudar({ etiquetas: alternarNaLista(etiquetasFiltro, 'nenhuma') })}>
                  Sem etiquetas
                </Pilula>
                {etiquetas.map((e) => {
                  const ligada = etiquetasFiltro.includes(e.id)
                  return (
                    <button key={e.id} type="button" className="lista-etiqueta-filtro" data-cor={e.cor} aria-pressed={ligada}
                      onClick={() => mudar({ etiquetas: alternarNaLista(etiquetasFiltro, e.id) })}>
                      {ligada ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                      {e.nome.trim() || <span className="lista-etiqueta-sem-nome">sem nome</span>}
                    </button>
                  )
                })}
                {etiquetas.length === 0 && <p className="lista-painel-nada">Este quadro não tem etiquetas.</p>}
              </div>
            </Secao>

            <Secao titulo="Prazo" id="lista-filtro-prazo">
              <div className="lista-painel-pilulas">
                {(Object.keys(ROTULO_FILTRO_PRAZO) as FiltroPrazo[]).map((pz) => (
                  <Pilula key={pz} ligada={filtros.prazo === pz} aoMudar={() => mudar({ prazo: filtros.prazo === pz ? undefined : pz })}
                    titulo={pz === 'atrasado' ? 'As com o cliente nunca contam como atrasadas' : undefined}>
                    {ROTULO_FILTRO_PRAZO[pz]}
                  </Pilula>
                ))}
              </div>
            </Secao>

            <Secao titulo="Prioridade" id="lista-filtro-prioridade">
              <div className="lista-painel-pilulas">
                {(['urgente', 'alta', 'media', 'baixa'] as Prioridade[]).map((pr) => (
                  <Pilula key={pr} ligada={prioridades.includes(pr)} aoMudar={() => mudar({ prioridades: alternarNaLista(prioridades, pr) })}>
                    <BandeiraPrioridade p={pr} compacta />{ROTULO_PRIORIDADE[pr]}
                  </Pilula>
                ))}
              </div>
            </Secao>

            <Secao titulo="Situação" id="lista-filtro-situacao">
              <div className="lista-painel-pilulas">
                <Pilula ligada={!!filtros.comCliente} aoMudar={() => mudar({ comCliente: !filtros.comCliente || undefined })}
                  titulo="Numa coluna aguardando o cliente ou com envio sem resposta">
                  Com o cliente
                </Pilula>
                <Pilula ligada={filtros.concluidas === 'esconder'} aoMudar={() => mudar({ concluidas: filtros.concluidas === 'esconder' ? undefined : 'esconder' })}>
                  Sem as concluídas
                </Pilula>
                <Pilula ligada={filtros.concluidas === 'so'} aoMudar={() => mudar({ concluidas: filtros.concluidas === 'so' ? undefined : 'so' })}>
                  Só as concluídas
                </Pilula>
              </div>
            </Secao>
          </div>
        </div>
      </div>
      <div className="lista-painel-rodape">
        <span className="lista-painel-resumo" aria-live="polite">
          {quantos === 0 ? 'Nenhum filtro' : `${quantos} ${quantos === 1 ? 'filtro' : 'filtros'}`} · {total} {total === 1 ? 'demanda' : 'demandas'}
        </span>
        <Botao variante="ghost" tamanho="p" disabled={!temFiltros(filtros)} onClick={() => definirFiltros({})}>Limpar filtros</Botao>
        {celular && <Botao variante="secundario" tamanho="p" onClick={aoFechar}>Ver {total} {total === 1 ? 'demanda' : 'demandas'}</Botao>}
      </div>
    </Popover>
  )
}
