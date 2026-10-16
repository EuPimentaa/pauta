/**
 * Configurações › Prazos e limites (admin; API §4.11): os parâmetros de ConfigApp em grupos, cada número dentro de
 * FAIXAS_CONFIG (o servidor confere de novo) e o próximo número de demanda só para cima. Salva só o que mudou.
 */
import { useEffect, useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Clock3, FileArchive, Hash, KeyRound, LayoutGrid } from 'lucide-react'
import { FAIXAS_CONFIG, type ConfigApp, type EditarConfigAppEntrada, type ParametroNumerico } from '@shared/tipos/index.ts'
import type { Icone } from '../../extensoes/tipos.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo } from '../../ui/Campo.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import { editarConfigApp, useConfigApp } from './api.ts'
import { erroDoCampo, Faixa, mensagemGeral, Painel } from './comum.tsx'

type Campo_ = ParametroNumerico | 'prazoHoraPadrao'
interface Def { campo: Campo_; rotulo: string; unidade?: string; ajuda: string }

const MB = 1_048_576
const GRUPOS: { titulo: string; icone: Icone; campos: Def[] }[] = [
  { titulo: 'Prazos', icone: Clock3, campos: [
    { campo: 'prazoHoraPadrao', rotulo: 'Prazo sem hora vence às', ajuda: 'Vale para toda demanda com prazo só de dia.' },
    { campo: 'retornoPrazoDiasUteis', rotulo: 'Prazo de retorno do cliente', unidade: 'dias úteis', ajuda: 'Sugerido no "Enviar ao cliente".' },
    { campo: 'ajustePrazoDiasUteis', rotulo: 'Prazo da rodada de ajuste', unidade: 'dias úteis', ajuda: 'Quando o cliente pede ajuste. 0 = no mesmo dia.' },
  ] },
  { titulo: 'Quadros', icone: LayoutGrid, campos: [
    { campo: 'paradoLimiteDiasUteis', rotulo: 'Destacar "parado há" a partir de', unidade: 'dias úteis', ajuda: 'Na equipe, desde a última mudança de coluna.' },
    { campo: 'clienteParadoDiasUteis', rotulo: '"Com o cliente há mais de"', unidade: 'dias úteis', ajuda: 'Entra no Início do atendimento para cobrar.' },
    { campo: 'quadroConcluidasDias', rotulo: 'Concluídas saem do quadro depois de', unidade: 'dias', ajuda: 'E ficam no Arquivo, mesmo sem arquivar.' },
  ] },
  { titulo: 'Links e acesso', icone: KeyRound, campos: [
    { campo: 'conviteValidadeDias', rotulo: 'Convite vale por', unidade: 'dias', ajuda: 'O link que você manda para quem entra.' },
    { campo: 'redefinicaoValidadeHoras', rotulo: 'Link de nova senha vale por', unidade: 'horas', ajuda: 'Gerado em Pessoas.' },
    { campo: 'sessaoValidadeDias', rotulo: 'Sessão sem uso termina em', unidade: 'dias', ajuda: 'Depois disso, entra de novo com a senha.' },
    { campo: 'linkPublicoValidadeDias', rotulo: 'Link de aprovação vale por', unidade: 'dias', ajuda: 'O que o cliente abre para aprovar.' },
    { campo: 'linkPublicoArquivoMinutos', rotulo: 'Arquivo no link de aprovação vale por', unidade: 'minutos', ajuda: 'Cada abertura gera um endereço novo.' },
  ] },
  { titulo: 'Arquivos e cronômetro', icone: FileArchive, campos: [
    { campo: 'uploadLimiteBytes', rotulo: 'Tamanho máximo de arquivo', unidade: 'MB', ajuda: 'Até 10 MB.' },
    { campo: 'arquivoLixoDias', rotulo: 'Arquivo removido some do disco depois de', unidade: 'dias', ajuda: 'Até lá, dá para pedir de volta.' },
    { campo: 'cronometroLimiteHoras', rotulo: 'Cronômetro esquecido conta no máximo', unidade: 'horas', ajuda: 'Passou disso, grava o limite e pede para conferir.' },
    { campo: 'backupManter', rotulo: 'Cópias de segurança guardadas', unidade: 'dias', ajuda: 'Uma por dia, na pasta de dados do servidor.' },
    { campo: 'eventoRetencaoDias', rotulo: 'Histórico de tempo real guardado', unidade: 'dias', ajuda: 'Para quem volta depois de ficar sem conexão.' },
  ] },
  { titulo: 'Numeração', icone: Hash, campos: [
    { campo: 'demandaNumeroInicial', rotulo: 'Próxima demanda a partir do número', ajuda: 'Só para cima: maior que o maior número já usado.' },
  ] },
]

type Rascunho = Record<Campo_, string>

function paraRascunho(c: ConfigApp): Rascunho {
  const r = {} as Rascunho
  for (const g of GRUPOS) for (const d of g.campos) {
    const v = c[d.campo]
    r[d.campo] = d.campo === 'uploadLimiteBytes' ? String(Math.round((Number(v) / MB) * 10) / 10) : String(v)
  }
  return r
}

function valorDe(d: Def, texto: string): number | string {
  if (d.campo === 'prazoHoraPadrao') return texto
  if (d.campo === 'uploadLimiteBytes') return Math.round(Number(texto.replace(',', '.')) * MB)
  return Number(texto)
}

function faixa(d: Def): string | undefined {
  if (d.campo === 'prazoHoraPadrao') return undefined
  const [min, max] = FAIXAS_CONFIG[d.campo]
  if (d.campo === 'uploadLimiteBytes') return `De ${(min / MB).toFixed(min < MB ? 1 : 0)} a ${max / MB} MB.`
  if (d.campo === 'demandaNumeroInicial') return undefined
  return `De ${min} a ${max}.`
}

export default function ConfigParametros() {
  const qc = useQueryClient()
  const idForm = useId()
  const consulta = useConfigApp()
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (consulta.data && !rascunho) setRascunho(paraRascunho(consulta.data.config))
  }, [consulta.data, rascunho])

  if (consulta.isPending || !rascunho) {
    if (consulta.isError) {
      return <EstadoVazio titulo="Não foi possível carregar a configuração." texto={consulta.error.mensagem}
        acoes={<Botao variante="secundario" onClick={() => void consulta.refetch()}>Tentar de novo</Botao>} />
    }
    return <EsqueletoLinhas linhas={8} />
  }
  const atual = paraRascunho(consulta.data!.config)
  const mudancas = (Object.keys(rascunho) as Campo_[]).filter((k) => rascunho[k] !== atual[k])

  async function salvar() {
    setErro(null)
    const corpo: Record<string, unknown> = {}
    for (const g of GRUPOS) for (const d of g.campos) if (mudancas.includes(d.campo)) corpo[d.campo] = valorDe(d, rascunho![d.campo])
    if (!Object.keys(corpo).length) return
    setSalvando(true)
    try {
      const saida = await editarConfigApp(qc, corpo as EditarConfigAppEntrada)
      setRascunho(paraRascunho(saida.config))
      avisar(mudancas.length === 1 ? '1 parâmetro salvo.' : `${mudancas.length} parâmetros salvos.`, { tipo: 'sucesso' })
    } catch (e) {
      setErro(e)
    } finally {
      setSalvando(false)
    }
  }

  const info = consulta.data!.info
  const algumCampo = GRUPOS.some((g) => g.campos.some((d) => erroDoCampo(erro, d.campo)))
  return (
    <div className="cad-secao">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h1 className="cad-titulo">Prazos e limites</h1>
          <p className="cad-subtitulo">Os números que o sistema usa para sugerir prazos, destacar o que está parado e cuidar dos links. {info.nome} · versão {info.versao}.</p>
        </div>
      </header>
      <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        {GRUPOS.map((g) => (
          <Painel key={g.titulo} titulo={g.titulo} icone={g.icone} id={`cad-par-${g.titulo}`}>
            <div className="cad-painel-corpo">
              <div className="cad-grade">
                {g.campos.map((d) => {
                  const hora = d.campo === 'prazoHoraPadrao'
                  const [min, max] = hora ? [0, 0] : FAIXAS_CONFIG[d.campo as ParametroNumerico]
                  const mb = d.campo === 'uploadLimiteBytes'
                  return (
                    <Campo key={d.campo} rotulo={d.rotulo} type={hora ? 'time' : 'number'} inputMode={hora ? undefined : 'numeric'}
                      min={hora ? undefined : mb ? 0.1 : min} max={hora ? undefined : mb ? max / MB : max} step={hora ? 60 : mb ? 0.1 : 1}
                      value={rascunho[d.campo]} sufixo={d.unidade ? <span className="cad-nota">{d.unidade}</span> : undefined}
                      ajuda={[d.ajuda, faixa(d)].filter(Boolean).join(' ')} erro={erroDoCampo(erro, d.campo)}
                      onChange={(e) => setRascunho({ ...rascunho, [d.campo]: e.target.value })} />
                  )
                })}
              </div>
            </div>
          </Painel>
        ))}
        {erro && !algumCampo ? <Faixa tom="perigo">{mensagemGeral(erro)}</Faixa> : null}
        <div className="cad-rodape-form">
          {mudancas.length > 0 && <Botao variante="ghost" onClick={() => { setRascunho(atual); setErro(null) }}>Descartar</Botao>}
          <Botao type="submit" variante="primario" carregando={salvando} disabled={mudancas.length === 0}>
            {mudancas.length === 0 ? 'Nada para salvar' : mudancas.length === 1 ? 'Salvar 1 mudança' : `Salvar ${mudancas.length} mudanças`}
          </Botao>
        </div>
      </form>
    </div>
  )
}
