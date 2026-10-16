/**
 * /dev/ui (só em desenvolvimento): catálogo vivo do design system. Cada amostra aparece no tema claro e no escuro; o
 * seletor do topo troca o tema da página (o das camadas: modal, popover, menu, tooltip). Tudo navega pelo teclado.
 */
import '../../estilos/catalogo.css'
import '../../estilos/casca.css'
import { useEffect, useRef, useState, type JSX, type KeyboardEvent, type RefObject } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTituloAba } from '../../lib/app.ts'
import { lerPreferenciaTema, type PreferenciaTema } from '../../lib/tema.ts'
import { MarcaProduto } from '../../ui/Marca.tsx'
import { Tooltip } from '../../ui/Tooltip.tsx'
import { Secao, type DefSecao } from './catalogo/Amostra.tsx'
import { SecaoBotoes, SecaoCampos, SecaoCores, SecaoMarca, SecaoTipografia } from './catalogo/SecoesBase.tsx'
import { SecaoAvisos, SecaoCamadas } from './catalogo/SecoesCamadas.tsx'
import { SecaoConteudo } from './catalogo/SecoesConteudo.tsx'
import { SecaoCoresEDatas, SecaoIdentidade, SecaoIndicadores } from './catalogo/SecoesIdentidade.tsx'
import { SecaoCalendario, SecaoQuadro } from './catalogo/SecoesQuadro.tsx'

const SECOES: (DefSecao & { descricao: string; Corpo: () => JSX.Element })[] = [
  { id: 'marca', titulo: 'Marca', Corpo: SecaoMarca,
    descricao: 'Logo e “e” por máscara CSS sobre os PNG oficiais: laranja no claro, o branco quente do logo no escuro. A barra arco-íris só aparece no login, no convite e na redefinição.' },
  { id: 'cores', titulo: 'Cores', Corpo: SecaoCores,
    descricao: 'Tokens com light-dark(): cada token é declarado uma vez e qualquer parte da tela troca de tema com color-scheme. O laranja é acento (no máximo uns 10% da tela).' },
  { id: 'tipografia', titulo: 'Tipografia', Corpo: SecaoTipografia,
    descricao: 'Syne hospedada no app. A hierarquia vem do tamanho e do respiro; 700 só nos micro-rótulos em caixa alta.' },
  { id: 'botoes', titulo: 'Botões e teclas', Corpo: SecaoBotoes,
    descricao: 'Primário laranja com texto escuro (6:1). Um por tela. Os outros são secundários, ghost ou de perigo. Toda dica mostra a tecla.' },
  { id: 'campos', titulo: 'Campos', Corpo: SecaoCampos,
    descricao: 'Rótulo, ajuda e erro ligados por aria. Combobox com autocompletar sem acento e a ação extra no fim da lista.' },
  { id: 'identidade', titulo: 'Pessoas, etiquetas e clientes', Corpo: SecaoIdentidade,
    descricao: 'A cor nunca é o único indicador: etiqueta só de cor e recolhida têm nome acessível e dica.' },
  { id: 'indicadores', titulo: 'Indicadores e abas', Corpo: SecaoIndicadores,
    descricao: 'Contadores com números tabulares, progresso, esqueleto (nada de spinner na tela toda), estado vazio e abas com foco itinerante.' },
  { id: 'cores-datas', titulo: 'Cor e data', Corpo: SecaoCoresEDatas,
    descricao: 'Paleta CORES como radiogroup. Datas com atalhos (Hoje, Amanhã, Sexta), hora opcional e feriados.' },
  { id: 'sobreposicoes', titulo: 'Modal, folha, popover e menu', Corpo: SecaoCamadas,
    descricao: 'Vidro fosco só aqui, na barra superior e no menu lateral (sólido com transparência reduzida ou alto contraste).' },
  { id: 'avisos', titulo: 'Avisos', Corpo: SecaoAvisos,
    descricao: 'Avisos curtos, com número e sem exclamação. Desfazer só quando não há efeito fora do sistema.' },
  { id: 'quadro', titulo: 'Quadro, colunas e cards', Corpo: SecaoQuadro,
    descricao: 'Uma coluna de cada cor com cards em todos os estados. As classes ficam em estilos/quadro.css.' },
  { id: 'calendario', titulo: 'Calendário', Corpo: SecaoCalendario,
    descricao: 'GradeCalendario: mês e semana, células que recebem o soltar e itens desenhados por quem usa (base da Agenda).' },
  { id: 'conteudo', titulo: 'Texto rico e texto puro', Corpo: SecaoConteudo,
    descricao: 'Markdown só pelo componente seguro; texto de fora sempre puro; caminho M:\\ só copia.' },
]

const TEMAS: { valor: PreferenciaTema; rotulo: string; icone: typeof Sun }[] = [
  { valor: 'sistema', rotulo: 'Igual ao sistema', icone: Monitor },
  { valor: 'claro', rotulo: 'Página clara', icone: Sun },
  { valor: 'escuro', rotulo: 'Página escura', icone: Moon },
]

function aplicarNaRaiz(t: PreferenciaTema) {
  const raiz = document.documentElement
  if (t === 'sistema') raiz.removeAttribute('data-theme')
  else raiz.setAttribute('data-theme', t === 'escuro' ? 'dark' : 'light')
}

/** Tema só desta página (não grava a preferência da pessoa); ao sair, volta o tema guardado. */
function useTemaDaPagina(): [PreferenciaTema, (t: PreferenciaTema) => void] {
  const [tema, setTema] = useState<PreferenciaTema>(lerPreferenciaTema)
  useEffect(() => { aplicarNaRaiz(tema) }, [tema])
  useEffect(() => () => aplicarNaRaiz(lerPreferenciaTema()), [])
  return [tema, setTema]
}

/** Seção que está no topo, para marcar no índice. */
function useSecaoAtual(): string {
  const [atual, setAtual] = useState(SECOES[0].id)
  useEffect(() => {
    const visiveis = new Set<string>()
    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) visiveis.add(e.target.id)
        else visiveis.delete(e.target.id)
      }
      const primeira = SECOES.find((s) => visiveis.has(s.id))
      if (primeira) setAtual(primeira.id)
    // desconta a barra (60 px) e, no celular, também a faixa do índice presa embaixo dela
    }, { rootMargin: `-${matchMedia('(max-width: 899.98px)').matches ? 116 : 64}px 0px -55% 0px` })
    for (const s of SECOES) { const el = document.getElementById(s.id); if (el) obs.observe(el) }
    return () => obs.disconnect()
  }, [])
  return atual
}

function SeletorTema({ tema, mudar }: { tema: PreferenciaTema; mudar(t: PreferenciaTema): void }) {
  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    const grupo = e.currentTarget
    const i = TEMAS.findIndex((t) => t.valor === tema)
    const prox = TEMAS[(i + passo + TEMAS.length) % TEMAS.length].valor
    mudar(prox)
    requestAnimationFrame(() => grupo.querySelector<HTMLElement>(`[data-valor="${prox}"]`)?.focus())
  }
  return (
    <div role="radiogroup" aria-label="Tema da página" className="casca-tema" onKeyDown={aoTeclar}>
      {TEMAS.map(({ valor, rotulo, icone: I }) => (
        <Tooltip key={valor} texto={rotulo}>
          <button type="button" role="radio" aria-checked={tema === valor} aria-label={rotulo} data-valor={valor}
            tabIndex={tema === valor ? 0 : -1} onClick={() => mudar(valor)}>
            <I aria-hidden="true" />
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

/** No celular o índice é uma faixa que rola na horizontal: mantém a pílula da seção atual à vista (sem rolar a página). */
function useSeguirSecao(lista: RefObject<HTMLOListElement | null>, atual: string) {
  useEffect(() => {
    const ol = lista.current
    if (!ol || ol.scrollWidth <= ol.clientWidth) return
    const a = ol.querySelector<HTMLElement>('[aria-current="true"]')
    if (!a) return
    const alvo = a.offsetLeft - (ol.clientWidth - a.offsetWidth) / 2
    ol.scrollTo({ left: Math.max(0, alvo), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [lista, atual])
}

export default function TelaCatalogo() {
  useTituloAba('Design system')
  const [tema, setTema] = useTemaDaPagina()
  const atual = useSecaoAtual()
  const lista = useRef<HTMLOListElement>(null)
  useSeguirSecao(lista, atual)
  return (
    <div className="cat">
      <a href="#cat-conteudo" className="pular-conteudo">Pular para o conteúdo</a>
      <header className="cat-topo chrome-dark vidro-plano">
        <div className="cat-topo-titulo"><MarcaProduto /><small>Design system</small></div>
        <span className="cat-topo-espaco" />
        <SeletorTema tema={tema} mudar={setTema} />
      </header>
      <div className="cat-corpo">
        <nav className="cat-nav" aria-label="Seções do catálogo">
          <p className="cat-nav-titulo">Componentes</p>
          <ol ref={lista}>
            {SECOES.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} aria-current={atual === s.id ? 'true' : undefined}>
                  <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{s.titulo}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <main id="cat-conteudo" className="cat-principal" tabIndex={-1}>
          <div className="cat-abertura">
            <h1>Design system da Pauta</h1>
            <p>Os componentes de <code>web/src/ui</code> e as classes de <code>web/src/estilos</code>, cada um no tema claro e no escuro. Tokens da marca Melt (laranja só como acento, Syne, superfícies em camadas), contraste AA conferido por <code>npm run contraste --workspace web</code>.</p>
          </div>
          {SECOES.map((s, i) => (
            <Secao key={s.id} secao={s} numero={i + 1} descricao={s.descricao}>
              <s.Corpo />
            </Secao>
          ))}
        </main>
      </div>
    </div>
  )
}
