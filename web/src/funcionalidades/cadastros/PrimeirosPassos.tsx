/**
 * Primeiros passos do admin (seção do Início; critérios da API §4.18, calculados do bootstrap com calcularPassos):
 * convidar a equipe (o convite abre aqui mesmo, com o link para copiar), criar os quadros das equipes, cadastrar os
 * clientes e revisar os modelos de demanda. O passo da vez fica destacado; o bloco some quando tudo estiver feito.
 */
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Building2, Check, ClipboardCheck, LayoutGrid, Rocket, UserPlus, UserRound } from 'lucide-react'
import type { Bootstrap, PassoInicial } from '@shared/tipos/index.ts'
import { nomeDoEmail } from '@shared/logica/texto.ts'
import { useEu } from '../../api/auth.ts'
import { useDoBootstrap } from '../../api/seletores.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { useAbrirSobreposta } from '../../sessao/sobreposta.tsx'
import { Botao, propsBotao } from '../../ui/Botao.tsx'
import { BarraProgresso } from '../../ui/Indicadores.tsx'
import { DialogoPessoa } from './DialogoPessoa.tsx'
import { calcularPassos, equipesSemQuadro, resumoDoPasso, type DadosPassos } from './logica.ts'
import './cadastros.css'

const sel = (b: Bootstrap) => ({
  usuarios: b.usuarios, quadros: b.quadros, clientes: b.clientes, modelosRevisadosEm: b.config.modelosRevisadosEm,
  equipesSemQuadro: equipesSemQuadro(b.equipes, b.quadros).length, quadrosAtivos: b.quadros.filter((q) => q.arquivadoEm === null).length,
})

export default function PrimeirosPassos() {
  const dados = useDoBootstrap(sel)
  const navegar = useNavigate()
  const abrir = useAbrirSobreposta()
  const abrirDialogo = useAbrirDialogo()
  const [convidando, setConvidando] = useState(false)
  const eu = useEu()
  if (!dados) return null
  const { itens, concluido } = calcularPassos(dados as DadosPassos)
  if (concluido) return null
  const feitos = itens.filter((i) => i.feito).length
  const atual = itens.find((i) => !i.feito)?.id

  async function cadastrarCliente() {
    const r = await abrirDialogo('criar-cliente', {})
    if (r) navegar(`/clientes/${encodeURIComponent(r.cliente.sigla)}`)
  }

  const semAm = dados.clientes.filter((c) => c.status !== 'ex' && c.pendencias.includes('sem_am')).length
  const acoes: Record<PassoInicial, ReactNode> = {
    convidar_equipe: (
      <>
        <Botao tamanho="p" variante="secundario" icone={UserPlus} onClick={() => setConvidando(true)}>Convidar pessoa</Botao>
        <Link {...propsBotao({ tamanho: 'p', variante: 'ghost' })} to="/config/pessoas">Ver pessoas</Link>
      </>
    ),
    criar_quadros: (
      dados.equipesSemQuadro > 0
        ? <Botao tamanho="p" variante="secundario" icone={LayoutGrid} onClick={() => abrir('/quadros/novo?equipes=1')}>
            {dados.quadrosAtivos === 0 ? 'Criar os quadros das equipes' : 'Criar os que faltam'}
          </Botao>
        : <Botao tamanho="p" variante="ghost" icone={LayoutGrid} onClick={() => abrir('/quadros/novo')}>Novo quadro</Botao>
    ),
    cadastrar_clientes: (
      <>
        <Botao tamanho="p" variante="secundario" icone={Building2} onClick={() => void cadastrarCliente()}>Cadastrar cliente</Botao>
        {semAm > 0 && <Link {...propsBotao({ tamanho: 'p', variante: 'ghost' })} to="/clientes?filtro=completar">Completar {semAm === 1 ? '1 cadastro' : `${semAm} cadastros`}</Link>}
      </>
    ),
    revisar_modelos: <Link {...propsBotao({ tamanho: 'p', variante: 'secundario' })} to="/config/modelos"><ClipboardCheck aria-hidden="true" /><span>Revisar os modelos</span></Link>,
  }

  return (
    <section className="cad-passos" aria-labelledby="cad-passos-titulo">
      <div className="cad-passos-topo">
        <div className="cad-cabecalho-texto">
          <h2 id="cad-passos-titulo" className="cad-secao-titulo inline-flex items-center gap-2"><Rocket width={20} height={20} aria-hidden="true" />Primeiros passos</h2>
          <p className="cad-subtitulo">Do zero ao primeiro card: nesta ordem, as colunas das pessoas já nascem nos quadros.</p>
        </div>
        <div className="flex min-w-[180px] flex-col gap-1">
          <span className="cad-nota">{feitos} de {itens.length} feitos</span>
          <BarraProgresso valor={feitos} max={itens.length} rotulo="Primeiros passos" />
        </div>
      </div>
      {/* o admin do primeiro boot nasce com o nome tirado do e-mail: é como ele aparece em colunas, membros e @menções */}
      {!eu.usuario.apelido && eu.usuario.nome === nomeDoEmail(eu.usuario.email) && (
        <p className="cad-passos-nome">
          <UserRound aria-hidden="true" />
          <span>Você aparece para a equipe como <strong>{eu.usuario.nome}</strong>. Confira o seu nome e escolha um apelido antes de convidar.</span>
          <Link {...propsBotao({ tamanho: 'p', variante: 'secundario' })} to="/config/conta">Sua conta</Link>
        </p>
      )}
      <ol className="cad-passos-lista">
        {itens.map((p, i) => (
          <li key={p.id} className="cad-passo" data-feito={p.feito ? '' : undefined} data-atual={p.id === atual ? '' : undefined}
            aria-current={p.id === atual ? 'step' : undefined}>
            <span className="cad-passo-cabeca">
              <span className="cad-passo-num" aria-hidden="true">{p.feito ? <Check /> : i + 1}</span>
              <span>{p.rotulo}{p.feito && <span className="sr-only"> (feito)</span>}</span>
            </span>
            <p className="cad-passo-texto">{resumoDoPasso(p.id, dados)}</p>
            <div className="cad-passo-acoes">{acoes[p.id]}</div>
          </li>
        ))}
      </ol>
      {convidando && <DialogoPessoa pessoa={null} aoFechar={() => setConvidando(false)} />}
    </section>
  )
}
