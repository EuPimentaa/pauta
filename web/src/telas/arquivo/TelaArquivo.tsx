/**
 * /arquivo (F5; API §4.19): tudo o que saiu do quadro (arquivadas e concluídas há mais de N dias, mesmo sem
 * arquivar). Filtros na URL: cliente, quadro, mês e texto ("he outubro", "#123"). Restaurar só as arquivadas;
 * "Devolver ao quadro" desmarca a concluída antiga; "Arquivar" guarda a concluída de vez. Clique abre o modal.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, CheckCircle2, RotateCcw, Search } from 'lucide-react'
import type { Demanda, ListarArquivoConsulta, Quadro } from '@shared/tipos/index.ts'
import { useAcoes } from '../../api/demandas.ts'
import { useClientes, useColunas, useConfig, useQuadros } from '../../api/seletores.ts'
import { useArquivo, useQuadrosArquivados } from '../../funcionalidades/cadastros/api.ts'
import { LimparBusca, Painel, textoNadaEncontrado } from '../../funcionalidades/cadastros/comum.tsx'
import { useTituloAba } from '../../lib/app.ts'
import { MESES } from '../../lib/datas.ts'
import { useAbrirSobreposta } from '../../sessao/sobreposta.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo, Selecao } from '../../ui/Campo.tsx'
import { ChipCliente } from '../../ui/Chips.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'

const data = (i: string) => new Date(i).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })

/** Os últimos 18 meses para o filtro. */
function meses(): { valor: string; rotulo: string }[] {
  const hoje = new Date()
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    return { valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, rotulo: `${MESES[d.getMonth()]} de ${d.getFullYear()}` }
  })
}

function Item({ d, quadro, quadroArquivado }: { d: Demanda; quadro: Quadro | undefined; quadroArquivado: boolean }) {
  const qc = useQueryClient()
  const acoes = useAcoes()
  const abrir = useAbrirSobreposta()
  const clientes = useClientes()
  const colunas = useColunas(d.quadroId)
  const cliente = d.clienteId ? clientes.find((c) => c.id === d.clienteId) : undefined
  const coluna = colunas.find((c) => c.id === d.colunaId)
  const [ocupado, setOcupado] = useState(false)
  const recarregar = () => void qc.invalidateQueries({ queryKey: ['arquivo'] })

  async function fazer(fn: () => Promise<unknown>) {
    setOcupado(true)
    try { if (await fn()) recarregar() } finally { setOcupado(false) }
  }

  return (
    <li className="cad-arquivo-item">
      <button type="button" className="cad-arquivo-abrir" onClick={() => abrir(`/d/${d.numero}`)}>
        <span className="cad-arquivo-titulo"><span className="cad-num">#{d.numero}</span><span>{d.titulo}</span></span>
        <span className="cad-linha-meta">
          {cliente && <ChipCliente cliente={cliente} />}
          {quadro && <span><span className="cad-ponto" data-cor={quadro.cor} aria-hidden="true" />{quadro.nome}{coluna ? ` › ${coluna.nome}` : ''}{quadroArquivado ? ' (quadro arquivado)' : ''}</span>}
          {d.arquivadoEm
            ? <span><Archive aria-hidden="true" />Arquivada em {data(d.arquivadoEm)}</span>
            : <span><CheckCircle2 aria-hidden="true" />Concluída em {data(d.concluidaEm!)} · não arquivada</span>}
        </span>
      </button>
      <div className="cad-linha-fim">
        {d.arquivadoEm ? (
          <Botao tamanho="p" variante="secundario" icone={ArchiveRestore} carregando={ocupado} disabled={quadroArquivado}
            dica={quadroArquivado ? 'O quadro dela está arquivado: restaure o quadro antes.' : undefined}
            onClick={() => void fazer(() => acoes.restaurar(d))}>Restaurar</Botao>
        ) : (
          <>
            <Botao tamanho="p" variante="ghost" icone={Archive} disabled={ocupado} onClick={() => void fazer(() => acoes.arquivar(d))}>Arquivar</Botao>
            <Botao tamanho="p" variante="secundario" icone={RotateCcw} carregando={ocupado} disabled={quadroArquivado}
              dica="Desmarca a concluída: ela volta para o quadro." onClick={() => void fazer(() => acoes.concluir(d, false))}>Devolver ao quadro</Botao>
          </>
        )}
      </div>
    </li>
  )
}

export default function TelaArquivo() {
  useTituloAba('Arquivo')
  const config = useConfig()
  const clientes = useClientes()
  const quadros = useQuadros()
  const arquivados = useQuadrosArquivados()
  const [params, setParams] = useSearchParams()
  const [texto, setTexto] = useState(params.get('q') ?? '')
  const consulta: ListarArquivoConsulta = useMemo(() => ({
    ...(params.get('cliente') ? { clienteId: params.get('cliente')! } : {}),
    ...(params.get('quadro') ? { quadroId: params.get('quadro')! } : {}),
    ...(params.get('mes') ? { mes: params.get('mes')! } : {}),
    ...(params.get('q') ? { q: params.get('q')! } : {}),
  }), [params])
  const arquivo = useArquivo(consulta)
  const mudar = (chave: string, valor: string) => setParams((p) => { const n = new URLSearchParams(p); if (valor) n.set(chave, valor); else n.delete(chave); return n }, { replace: true })

  // o texto vai para a URL depois de uma pausa na digitação
  useEffect(() => {
    const t = setTimeout(() => { if ((params.get('q') ?? '') !== texto.trim()) mudar('q', texto.trim()) }, 350)
    return () => clearTimeout(t)
  }, [texto])

  const todosQuadros = [...quadros, ...(arquivados.data ?? [])]
  const itens = arquivo.data?.pages.flatMap((p) => p.itens) ?? []
  const filtrando = Object.keys(consulta).length > 0

  return (
    <div className="cad-pagina">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h1 className="cad-titulo">Arquivo</h1>
          <p className="cad-subtitulo">As arquivadas e as concluídas há mais de {config.quadroConcluidasDias} dias, de todos os quadros. Restaurar devolve a demanda ao quadro.</p>
        </div>
      </header>
      <form className="cad-filtros" role="search" onSubmit={(e) => { e.preventDefault(); mudar('q', texto.trim()) }}>
        <Campo classeGrupo="cad-filtro-busca" rotulo="Buscar no Arquivo" rotuloOculto icone={Search} type="search" value={texto}
          placeholder='Título, número ou "he outubro"' onChange={(e) => setTexto(e.target.value)}
          sufixo={<LimparBusca texto={texto} aoLimpar={() => { setTexto(''); mudar('q', '') }} />} />
        <Selecao rotulo="Cliente" rotuloOculto value={params.get('cliente') ?? ''} vazia="Todos os clientes" onChange={(e) => mudar('cliente', e.target.value)}
          opcoes={clientes.map((c) => ({ valor: c.id, rotulo: `${c.sigla} · ${c.nome}` }))} />
        <Selecao rotulo="Quadro" rotuloOculto value={params.get('quadro') ?? ''} vazia="Todos os quadros" onChange={(e) => mudar('quadro', e.target.value)}
          opcoes={todosQuadros.map((q) => ({ valor: q.id, rotulo: q.arquivadoEm ? `${q.nome} (arquivado)` : q.nome }))} />
        <Selecao rotulo="Mês" rotuloOculto value={params.get('mes') ?? ''} vazia="Qualquer mês" onChange={(e) => mudar('mes', e.target.value)} opcoes={meses()} />
      </form>
      <Painel>
        {arquivo.isPending ? (
          <div className="cad-painel-corpo"><EsqueletoLinhas linhas={6} /></div>
        ) : arquivo.isError ? (
          <EstadoVazio titulo="Não foi possível abrir o Arquivo." texto={arquivo.error.message}
            acoes={<Botao variante="secundario" onClick={() => void arquivo.refetch()}>Tentar de novo</Botao>} />
        ) : itens.length === 0 ? (
          filtrando ? (
            <EstadoVazio icone={Search} tamanho="p" titulo={params.get('q') ? textoNadaEncontrado(params.get('q')!) : 'Nada no Arquivo com estes filtros.'}
              acoes={<Botao variante="secundario" onClick={() => { setTexto(''); setParams(new URLSearchParams(), { replace: true }) }}>{params.get('q') ? 'Limpar busca' : 'Limpar filtros'}</Botao>} />
          ) : (
            <EstadoVazio icone={Archive} como="h2" titulo="Nada no Arquivo ainda."
              texto={`As concluídas saem do quadro depois de ${config.quadroConcluidasDias} dias.`} />
          )
        ) : (
          <>
            <ul className="cad-lista" aria-label="Demandas no Arquivo">
              {itens.map((d) => {
                const q = todosQuadros.find((x) => x.id === d.quadroId)
                return <Item key={d.id} d={d} quadro={q} quadroArquivado={!!q?.arquivadoEm} />
              })}
            </ul>
            {arquivo.hasNextPage && (
              <div className="cad-painel-corpo items-center">
                <Botao variante="secundario" carregando={arquivo.isFetchingNextPage} onClick={() => void arquivo.fetchNextPage()}>Carregar mais</Botao>
              </div>
            )}
          </>
        )}
      </Painel>
    </div>
  )
}
