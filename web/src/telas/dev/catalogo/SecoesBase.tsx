/** Catálogo: marca, cores, tipografia, botões e campos. */
import { useState, type CSSProperties } from 'react'
import { ArrowRight, Check, Filter, Mail, MoreHorizontal, Plus, Search, Star, Trash2 } from 'lucide-react'
import { CORES } from '@shared/tipos/index.ts'
import { ROTULO_COR } from '../../../lib/cores.ts'
import { Botao, BotaoIcone } from '../../../ui/Botao.tsx'
import { AreaTexto, Campo, GrupoCampo, Rotulo, Selecao } from '../../../ui/Campo.tsx'
import { Checkbox, Interruptor } from '../../../ui/Checkbox.tsx'
import { Combobox } from '../../../ui/Combobox.tsx'
import { Kbd } from '../../../ui/Kbd.tsx'
import { BarraAssinatura, Logo, MarcaE, MarcaProduto } from '../../../ui/Marca.tsx'
import { avisar } from '../../../ui/avisos.tsx'
import { Tooltip } from '../../../ui/Tooltip.tsx'
import { Amostra, Bloco, Linha, Nota } from './Amostra.tsx'
import { CLIENTES } from './dados.ts'

const cor = (token: string): CSSProperties => ({ ['--amostra' as string]: `var(${token})` })

function Cor({ token, nome }: { token: string; nome: string }) {
  return (
    <div className="cat-cor">
      <span className="cat-cor-amostra" style={cor(token)} aria-hidden="true" />
      <span className="cat-cor-nome">{nome}<code>{token}</code></span>
    </div>
  )
}

export function SecaoMarca() {
  return (
    <Amostra rotulo="Marca">
      <Bloco titulo="Logo e “e” (máscara CSS sobre os PNG da marca)">
        <Linha>
          <Logo altura={28} />
          <MarcaE altura={28} />
          <MarcaProduto />
        </Linha>
      </Bloco>
      <Bloco titulo="Barra assinatura (só login, convite e redefinição)">
        <BarraAssinatura />
      </Bloco>
      <Bloco titulo="Cores da marca">
        <div className="cat-cores">
          <Cor token="--melt-orange" nome="Laranja (acento)" />
          <Cor token="--melt-yellow" nome="Amarelo" />
          <Cor token="--melt-pink" nome="Rosa" />
          <Cor token="--melt-purple" nome="Roxo" />
          <Cor token="--melt-green" nome="Verde" />
          <Cor token="--melt-blue" nome="Azul" />
          <Cor token="--melt-deep-purple" nome="Berinjela" />
          <Cor token="--melt-black" nome="Preto" />
        </div>
      </Bloco>
    </Amostra>
  )
}

export function SecaoCores() {
  return (
    <>
      <Amostra rotulo="Superfícies e texto">
        <Bloco titulo="Superfícies">
          <div className="cat-cores">
            <Cor token="--bg" nome="Canvas" />
            <Cor token="--surface-sunken" nome="Afundada (coluna)" />
            <Cor token="--surface" nome="Superfície (card)" />
            <Cor token="--surface-raised" nome="Elevada (modal)" />
            <Cor token="--surface-hover" nome="Hover" />
            <Cor token="--surface-inverse" nome="Invertida (aviso)" />
          </div>
        </Bloco>
        <Bloco titulo="Texto, linhas e acento">
          <div className="cat-cores">
            <Cor token="--text" nome="Texto" />
            <Cor token="--text-2" nome="Secundário" />
            <Cor token="--text-3" nome="Metadado" />
            <Cor token="--border" nome="Hairline" />
            <Cor token="--border-control" nome="Contorno de campo" />
            <Cor token="--accent" nome="Acento" />
            <Cor token="--accent-ink" nome="Acento em texto" />
            <Cor token="--accent-soft" nome="Selecionado" />
          </div>
        </Bloco>
      </Amostra>
      <Amostra rotulo="Estados e etiquetas">
        <Bloco titulo="Estados (fundo + texto AA)">
          <Linha>
            <span className="ui-prazo" data-estado="concluida"><Check aria-hidden="true" /> Sucesso</span>
            <span className="ui-prazo" data-estado="hoje">Aviso</span>
            <span className="ui-prazo" data-estado="atrasada">Perigo</span>
            <span className="ui-prazo" data-estado="pausado">Informação</span>
          </Linha>
        </Bloco>
        <Bloco titulo="As 10 cores de etiqueta, coluna, cliente e pessoa (o laranja fica de fora)">
          <div className="cat-etiquetas">
            {CORES.map((c) => (
              <div key={c} className="cat-etiqueta-linha" data-cor={c}>
                <span aria-hidden="true" />
                <span className="ui-etiqueta">{ROTULO_COR[c]}</span>
              </div>
            ))}
          </div>
        </Bloco>
      </Amostra>
    </>
  )
}

const TIPOS: { token: string; classe: string; texto: string }[] = [
  { token: '--fs-h1 · 30/36 · 500', classe: 'text-h1 font-medium', texto: 'Do briefing à aprovação' },
  { token: '--fs-h2 · 22/28 · 600', classe: 'text-h2 font-semibold', texto: 'Criação' },
  { token: '--fs-h3 · 18/24 · 600', classe: 'text-h3 font-semibold', texto: 'Carrossel do Dia do Cliente' },
  { token: '--fs-col · 15/20 · 600', classe: 'text-col font-semibold', texto: 'Fazendo' },
  { token: '--fs-card · 14/19 · 500', classe: 'text-card font-medium', texto: 'Banner da campanha de verão para o site' },
  { token: '--fs-body · 14/21 · 400', classe: 'text-body', texto: 'Texto padrão, descrição e comentários. A hierarquia vem do tamanho e do respiro, não do negrito.' },
  { token: '--fs-meta · 12/16 · 500', classe: 'text-meta font-medium text-fg-3 tabular', texto: '#1.204 · Vence hoje, 18h · 3/5' },
  { token: '--fs-micro · 11/14 · 700', classe: 'text-micro font-bold uppercase tracking-[.12em] text-fg-3', texto: 'Quadros por equipe' },
]

export function SecaoTipografia() {
  return (
    <Amostra rotulo="Tipografia">
      <div className="cat-tipos">
        {TIPOS.map((t) => (
          <div key={t.token} className="cat-tipo">
            <code>{t.token}</code>
            <span className={t.classe}>{t.texto}</span>
          </div>
        ))}
      </div>
      <Nota>Syne 400–700 hospedada no app. Nunca 800, nunca peso trocado no hover (a Syne alarga). Algarismos alinhados à linha em tudo (<code>lnum</code>; os de estilo antigo da Syne entortavam as pílulas) e tabulares nos contadores (<code>tnum</code>).</Nota>
    </Amostra>
  )
}

function DemoCarregar() {
  const [carregando, setCarregando] = useState(false)
  return (
    <Botao variante="secundario" carregando={carregando}
      onClick={() => { setCarregando(true); window.setTimeout(() => setCarregando(false), 1600) }}>
      Salvar
    </Botao>
  )
}

export function SecaoBotoes() {
  return (
    <Amostra rotulo="Botões">
      <Bloco titulo="Variantes (um primário laranja por tela)">
        <Linha>
          <Botao variante="primario" icone={Plus} atalho="shift+n" onClick={() => avisar('Nova demanda (exemplo).')}>Nova demanda</Botao>
          <Botao variante="secundario" icone={Filter}>Filtros</Botao>
          <Botao variante="ghost" icone={Star}>Seguir</Botao>
          <Botao variante="perigo" icone={Trash2}>Arquivar</Botao>
          <Botao variante="perigo-cheio">Excluir</Botao>
        </Linha>
      </Bloco>
      <Bloco titulo="Tamanhos, ícone à direita, carregando e desabilitado">
        <Linha>
          <Botao variante="secundario" tamanho="p">Pequeno</Botao>
          <Botao variante="secundario">Médio</Botao>
          <Botao variante="secundario" tamanho="g" iconeDireita={ArrowRight}>Grande</Botao>
          <DemoCarregar />
          <Botao variante="secundario" disabled>Desabilitado</Botao>
        </Linha>
      </Bloco>
      <Bloco titulo="Só ícone (com dica e tecla) e teclas">
        <Linha>
          <BotaoIcone icone={Search} rotulo="Buscar" atalho="mod+k" />
          <BotaoIcone icone={MoreHorizontal} rotulo="Mais ações" />
          <BotaoIcone icone={Star} rotulo="Favorito" variante="secundario" />
          <BotaoIcone icone={Plus} rotulo="Adicionar" tamanho="p" />
          <Kbd teclas="mod+k" />
          <Kbd teclas="shift+r" />
          <Kbd teclas="g a" />
          <Tooltip texto="Recolher o menu" atalho="["><button type="button" className="ui-botao" data-variante="ghost" data-tamanho="p">Passe o mouse ou foque</button></Tooltip>
        </Linha>
      </Bloco>
    </Amostra>
  )
}

function DemoCampos() {
  const [email, setEmail] = useState('')
  const [obs, setObs] = useState('')
  const [papel, setPapel] = useState('equipe')
  const [clienteId, setClienteId] = useState<string | null>('c-he')
  const [criados, setCriados] = useState<typeof CLIENTES>([])
  const opcoes = [...CLIENTES, ...criados]
  const valor = opcoes.find((c) => c.id === clienteId) ?? null
  return (
    <div className="cat-grade">
      <Campo rotulo="E-mail" type="email" icone={Mail} placeholder="nome@agencia.com.br" value={email} onChange={(e) => setEmail(e.target.value)}
        ajuda="Usado para entrar." />
      <Campo rotulo="Título" defaultValue="Carrossel" erro="Informe o cliente." />
      <Campo rotulo="Número" defaultValue="#1.204" disabled />
      <Selecao rotulo="Papel" value={papel} onChange={(e) => setPapel(e.target.value)}
        opcoes={[{ valor: 'admin', rotulo: 'Admin' }, { valor: 'atendimento', rotulo: 'Atendimento' }, { valor: 'equipe', rotulo: 'Equipe' }]} />
      <GrupoCampo rotulo="Cliente" ajuda="Digite a sigla ou o nome; “XYZ” oferece criar.">
        {(aria) => (
          <Combobox {...aria} opcoes={opcoes} valor={valor} aoMudar={(c) => setClienteId(c?.id ?? null)} idDe={(c) => c.id}
            rotuloDe={(c) => c.sigla} detalheDe={(c) => c.nome} placeholder="Sigla ou nome" permitirLimpar
            iconeDe={(c) => <span className="casca-ponto" data-cor={c.cor} aria-hidden="true" style={{ margin: 0 }} />}
            extra={(t) => (opcoes.some((c) => c.sigla.toLowerCase() === t.toLowerCase()) ? null : {
              rotulo: `Criar cliente ${t.toUpperCase()}`,
              executar: () => {
                const novo = { id: `c-${t}`, sigla: t.toUpperCase().slice(0, 6), nome: 'Cliente novo', cor: 'grafite' as const }
                setCriados((l) => [...l, novo]); setClienteId(novo.id)
              },
            })} />
        )}
      </GrupoCampo>
      <AreaTexto rotulo="Observação" opcional linhas={3} placeholder="Escreva aqui…" value={obs} onChange={(e) => setObs(e.target.value)} />
    </div>
  )
}

function DemoEscolhas() {
  const [itens, setItens] = useState([true, false, false])
  const [atalhos, setAtalhos] = useState(true)
  const [avisos, setAvisos] = useState(false)
  const [concluida, setConcluida] = useState(true)
  const todos = itens.every(Boolean)
  const algum = itens.some(Boolean)
  return (
    <div className="cat-grade">
      <div className="cat-bloco">
        <Checkbox checked={todos} indeterminado={algum && !todos} onChange={(e) => setItens(itens.map(() => e.target.checked))}>
          Checklist inteiro
        </Checkbox>
        {['Revisar texto', 'Exportar em 1080×1350', 'Subir no Drive'].map((t, i) => (
          <Checkbox key={t} checked={itens[i]} onChange={(e) => setItens(itens.map((v, j) => (j === i ? e.target.checked : v)))}>{t}</Checkbox>
        ))}
      </div>
      <div className="cat-bloco">
        <Checkbox tom="sucesso" checked={concluida} onChange={(e) => setConcluida(e.target.checked)} descricao="Marca a data e conta como entregue.">
          Concluída
        </Checkbox>
        <Checkbox disabled>Desabilitado</Checkbox>
        <Interruptor ligado={atalhos} aoMudar={setAtalhos}>Atalhos de uma tecla</Interruptor>
        <Interruptor ligado={avisos} aoMudar={setAvisos}>Avisos por e-mail</Interruptor>
        <Interruptor ligado={false} aoMudar={() => {}} desabilitado>Desabilitado</Interruptor>
        <Rotulo opcional>Rótulo solto</Rotulo>
      </div>
    </div>
  )
}

export function SecaoCampos() {
  return (
    <Amostra rotulo="Campos">
      <DemoCampos />
      <DemoEscolhas />
    </Amostra>
  )
}
