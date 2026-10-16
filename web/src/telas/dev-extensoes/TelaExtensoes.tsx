/**
 * /dev/extensoes (só DEV; PLANO §2, "Hosts testados antes da Onda 3"): liga as contribuições extensoes/*\/nucleo-exemplo*
 * e mostra os hosts do NÚCLEO-WEB com elas, cada um com o que conferir. O registro à direita anota o que cada host
 * chamou (tratadores, interceptador, menus, comandos), na ordem.
 */
import './dev-extensoes.css'
import { useLayoutEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Demanda } from '@shared/tipos/index.ts'
import { bootstrapDe } from '../../api/cache.ts'
import { useDemandasDoQuadro, useQuadros } from '../../api/seletores.ts'
import { AbasCelular } from '../../casca/AbasCelular.tsx'
import { abrirDialogo, navegar } from '../../dialogos/estado.ts'
import { useConexao } from '../../lib/conexao.ts'
import { useRegistro } from '../../sessao/registro.ts'
import { CardDemanda } from '../../quadro/index.ts'
import { Botao } from '../../ui/Botao.tsx'
import { Selecao } from '../../ui/Campo.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { avisar } from '../../ui/avisos.tsx'
import { PaginaQuadro } from '../quadro/TelaQuadro.tsx'
import { anotar, definirExemplosAtivos, limparRegistro, mudarContador, useContadorExemplo, useRegistroExemplos } from './exemplos.ts'

const MANTER = 'pauta:exemplos-ligados'

function Item({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="dev-ext-bloco">
      <h2 className="dev-ext-titulo">{titulo}</h2>
      {children}
    </section>
  )
}

/** PATCH com um trace que este navegador não guardou: o evento volta como se fosse de outra pessoa. */
async function mudarComoOutraPessoa(d: Demanda) {
  const prioridade = d.prioridade === 'urgente' ? 'media' : 'urgente'
  const r = await fetch(`/api/demandas/${encodeURIComponent(d.id)}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Trace-Id': crypto.randomUUID(), 'If-Match': String(d.rev) },
    body: JSON.stringify({ prioridade }),
  })
  anotar(`PATCH de "outra pessoa": #${d.numero} prioridade ${prioridade} → ${r.status}`)
}

function Conteudo() {
  const quadros = useQuadros()
  const qc = useQueryClient()
  const [quadroId, setQuadroId] = useState(() => quadros.find((q) => q.slug === 'criacao')?.id ?? quadros[0]?.id ?? '')
  const quadro = quadros.find((q) => q.id === quadroId)
  const demandas = useDemandasDoQuadro(quadroId)
  const primeira = demandas[0]
  const registro = useRegistroExemplos()
  const contador = useContadorExemplo()
  const conexao = useConexao()
  const [manter, setManter] = useState(() => sessionStorage.getItem(MANTER) === '1')
  const foraDoQuadro = useMemo(() => (primeira ? { ...primeira, id: `${primeira.id}-arquivo`, quadroId: 'fora', colunaId: 'fora', numero: primeira.numero } : null), [primeira])

  return (
    <div className="dev-ext">
      <header className="dev-ext-cabeca">
        <div>
          <h1 className="text-h2 font-semibold">Extensões do núcleo (só em desenvolvimento)</h1>
          <p className="text-body text-fg-2">Os hosts com as contribuições <code>nucleo-exemplo*</code> ligadas. Tempo real: {conexao}.</p>
        </div>
        <Checkbox checked={manter} onChange={(e) => {
          setManter(e.target.checked)
          sessionStorage.setItem(MANTER, e.target.checked ? '1' : '0')
        }}>Manter os exemplos ligados nas outras telas (até recarregar)</Checkbox>
      </header>

      <div className="dev-ext-grade">
        <div className="dev-ext-coluna">
          <Item titulo="Quadro, cabeçalho, menus, layouts, entradas, selos e interceptador">
            <ul className="dev-ext-lista">
              <li>Cabeçalho: um slot à esquerda e um botão à direita ("Exemplo: só urgentes" vai para o <code>?f=</code>).</li>
              <li>Seletor de visão: Quadro, Lista e Calendário (o terceiro layout aparece).</li>
              <li>Menus ··· do quadro e da coluna: "Exemplo do quadro" e "Exemplo da coluna" junto dos do núcleo.</li>
              <li>Rodapé da coluna e a tecla N: abre a Entrada A (ordem 100), não a B.</li>
              <li>Selos no topo e no rodapé dos cards de número múltiplo de 5.</li>
              <li>Arrastar para outra coluna: o card fica pendente e o diálogo pergunta Seguir, Feito ou Cancelar (e Esc).</li>
            </ul>
            <Selecao rotulo="Quadro" value={quadroId} onChange={(e) => setQuadroId(e.target.value)} opcoes={quadros.map((q) => ({ valor: q.id, rotulo: q.nome }))} />
            {quadro && <div className="dev-ext-quadro"><PaginaQuadro key={quadro.id} quadro={quadro} /></div>}
          </Item>

          <Item titulo="Modal da demanda">
            <ul className="dev-ext-lista">
              <li>Seções: principal 100 e depois 200 (esta demora 1,5 s e mostra o esqueleto); a de <code>visivel</code> falso não aparece; a lateral à direita.</li>
              <li>Ações: um primário ("Primária (100)"), dois secundários, as outras duas no ···.</li>
              <li>Menu ···: tem "Exemplo: submenu" (abre o submenu) e não tem "Exemplo: só no card" (que aparece no botão direito do card).</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              {primeira && <Botao variante="secundario" onClick={() => navegar(`/d/${primeira.numero}`)}>Abrir a demanda #{primeira.numero}</Botao>}
            </div>
          </Item>

          <Item titulo="Card fora do bootstrap (como no Arquivo)">
            <p className="text-body text-fg-2">Os selos recebem <code>coluna</code> e <code>quadro</code> nulos; o card não tem menu de contexto.</p>
            {foraDoQuadro && <div className="dev-ext-card"><CardDemanda demanda={foraDoQuadro} /></div>}
          </Item>

          <Item titulo="Diálogos">
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" onClick={() => void abrirDialogo('nucleo-exemplo-modal', { mensagem: 'Um diálogo em forma de modal (tela cheia no celular).' })
                .then((r) => anotar(`diálogo modal: ${r ? 'ok' : 'cancelado'}`))}>Modal (abre outro por cima)</Botao>
              <Botao variante="secundario" onClick={(e) => void abrirDialogo('nucleo-exemplo-popover', { mensagem: 'Ancorado neste botão; no celular vira folha.' }, { ancora: e.currentTarget })
                .then((r) => anotar(`popover: ${r ? 'ok' : 'cancelado'}`))}>Popover ancorado</Botao>
              <Botao variante="secundario" onClick={() => void abrirDialogo('confirmar', { titulo: 'Excluir algo de teste?', mensagem: 'Digite o número para liberar.', confirmar: 'Excluir', perigo: true, digitar: '42' })
                .then((r) => anotar(`confirmar com digitar: ${r ? 'confirmado' : 'cancelado'}`))}>Confirmar digitando</Botao>
              <Botao variante="secundario" onClick={() => { const b = bootstrapDe(qc); void abrirDialogo('entregar-versao', { demandaId: b?.demandas[0]?.id ?? '' }) }}>
                Id sem diálogo registrado
              </Botao>
            </div>
          </Item>

          <Item titulo="Tempo real: dois tratadores da mesma entidade">
            <p className="text-body text-fg-2">O PATCH sai com um trace que este navegador não conhece: o evento chega como de outra pessoa e o registro mostra "a" e depois "b".</p>
            {primeira && <Botao variante="secundario" onClick={() => void mudarComoOutraPessoa(primeira)}>Mudar a prioridade de #{primeira.numero} como outra pessoa</Botao>}
          </Item>

          <Item titulo="Abas do celular e ações fora do render">
            <p className="text-body text-fg-2">A aba "Exemplo" mostra o número do useContador. Na paleta (Ctrl+K), "exemplo" lista um comando que move o card em foco com ctx.acoes.mover.</p>
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" onClick={() => mudarContador(contador + 1)}>Contador +1 ({contador})</Botao>
              <Botao variante="secundario" onClick={() => mudarContador(0)}>Zerar</Botao>
            </div>
            <div className="dev-ext-abas"><AbasCelular /></div>
          </Item>
        </div>

        <aside className="dev-ext-registro" aria-label="Registro dos hosts">
          <div className="flex items-center justify-between gap-2">
            <h2 className="dev-ext-titulo">Registro</h2>
            <Botao variante="ghost" tamanho="p" onClick={() => { limparRegistro(); avisar('Registro limpo.') }}>Limpar</Botao>
          </div>
          <ol className="dev-ext-linhas" aria-live="polite">
            {registro.map((l) => (
              <li key={`${l.quando}-${l.texto}`}><time>{new Date(l.quando).toLocaleTimeString('pt-BR')}</time> {l.texto}</li>
            ))}
            {registro.length === 0 && <li className="text-fg-2">Nada ainda.</li>}
          </ol>
        </aside>
      </div>
    </div>
  )
}

export default function TelaExtensoes() {
  const reg = useRegistro()
  const [pronto, setPronto] = useState(false)
  useLayoutEffect(() => {
    reg.ligarExemplos(true)
    definirExemplosAtivos(true)
    setPronto(true)
    return () => {
      if (sessionStorage.getItem(MANTER) === '1') return
      reg.ligarExemplos(false)
      definirExemplosAtivos(false)
    }
  }, [reg])
  return pronto ? <Conteudo /> : null
}
