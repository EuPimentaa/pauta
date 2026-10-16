/**
 * Configurações › Feriados (PLANO §3 F5; API §4.11): a lista do ano (nacionais semeados; municipais e da agência pelo
 * admin). Todo feriado é dia não útil nos próximos cálculos (prazo do modelo, repetição, rodadas, "parado há"); os
 * prazos já gravados não mudam.
 */
import { useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { TIPOS_FERIADO, type DataLocal, type Feriado, type TipoFeriado } from '@shared/tipos/index.ts'
import { avisarErro } from '../../api/acoes.ts'
import { useEu } from '../../api/auth.ts'
import { ehErroDaApi } from '../../api/cliente.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { DIAS_CURTOS, diaDaSemana, hojeLocal, MESES } from '../../lib/datas.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao, BotaoIcone } from '../../ui/Botao.tsx'
import { Campo, Selecao } from '../../ui/Campo.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import { SeletorData } from '../../ui/SeletorData.tsx'
import { criarFeriado, excluirFeriado, useFeriadosDoAno } from './api.ts'
import { erroDoCampo, Faixa, mensagemGeral, Painel, Pilula } from './comum.tsx'

const ROTULO_TIPO: Record<TipoFeriado, string> = { nacional: 'Nacional', estadual: 'Estadual', municipal: 'Municipal', facultativo: 'Ponto facultativo' }
const TOM_TIPO: Record<TipoFeriado, 'info' | 'acento' | 'sucesso' | undefined> = { nacional: undefined, estadual: 'info', municipal: 'acento', facultativo: 'sucesso' }

const formatar = (d: DataLocal) => `${DIAS_CURTOS[diaDaSemana(d)]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`

function NovoFeriado({ ano }: { ano: number }) {
  const qc = useQueryClient()
  const idForm = useId()
  const [data, setData] = useState<DataLocal | null>(null)
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoFeriado>('municipal')
  const [erro, setErro] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)
  const [tentou, setTentou] = useState(false)

  async function enviar() {
    setTentou(true)
    setErro(null)
    if (!data || !nome.trim()) return
    setEnviando(true)
    try {
      const f = await criarFeriado(qc, { data, nome: nome.trim(), tipo })
      avisar(`${f.nome} (${formatar(f.data)}) cadastrado.`, { tipo: 'sucesso', descricao: 'Vale para os próximos prazos; os já marcados não mudam.' })
      setData(null); setNome(''); setTentou(false)
    } catch (e) {
      setErro(e)
    } finally {
      setEnviando(false)
    }
  }

  const repetido = ehErroDaApi(erro) && erro.status === 409 ? erro.mensagem : undefined
  return (
    <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void enviar() }}>
      <div className="cad-grade">
        <div className="ui-campo-grupo">
          <span className="ui-rotulo">Data</span>
          <SeletorData valor={data} rotulo="Data do feriado" aoMudar={(d) => setData(d)} placeholder={`dd/mm/${ano}`} />
          {(tentou && !data) || repetido || erroDoCampo(erro, 'data')
            ? <p className="ui-campo-erro">{tentou && !data ? 'Escolha a data.' : repetido ?? erroDoCampo(erro, 'data')}</p> : null}
        </div>
        <Campo rotulo="Nome" value={nome} maxLength={80} placeholder="Aniversário da cidade" onChange={(e) => setNome(e.target.value)}
          erro={tentou && !nome.trim() ? 'Escreva o nome.' : erroDoCampo(erro, 'nome')} />
        <Selecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoFeriado)}
          opcoes={TIPOS_FERIADO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO[t] }))} />
      </div>
      {erro && !repetido && !erroDoCampo(erro, 'data') && !erroDoCampo(erro, 'nome') ? <Faixa tom="perigo">{mensagemGeral(erro)}</Faixa> : null}
      <div className="cad-rodape-form">
        <Botao type="submit" variante="secundario" icone={CalendarPlus} carregando={enviando}>Cadastrar feriado</Botao>
      </div>
    </form>
  )
}

export default function ConfigFeriados() {
  const eu = useEu()
  const qc = useQueryClient()
  const abrirDialogo = useAbrirDialogo()
  const admin = eu.usuario.papel === 'admin'
  const hoje = hojeLocal()
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)))
  const consulta = useFeriadosDoAno(ano)

  async function tirar(f: Feriado) {
    const ok = await abrirDialogo('confirmar', {
      titulo: `Tirar ${f.nome}?`, confirmar: 'Tirar feriado', perigo: true,
      mensagem: `${formatar(f.data)} volta a ser dia útil nos próximos cálculos. Os prazos já marcados não mudam.`,
    })
    if (!ok) return
    try {
      await excluirFeriado(qc, f)
      avisar(`${f.nome} saiu da lista.`, { tipo: 'sucesso' })
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível tirar o feriado.' })
    }
  }

  const porMes = new Map<number, Feriado[]>()
  for (const f of consulta.data ?? []) {
    const m = Number(f.data.slice(5, 7)) - 1
    porMes.set(m, [...(porMes.get(m) ?? []), f])
  }

  return (
    <div className="cad-secao">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h2 className="cad-titulo">Feriados</h2>
          <p className="cad-subtitulo">Dias que não contam como úteis no prazo dos modelos, nas repetições, nas rodadas e no "parado há". Um feriado novo não muda os prazos já marcados.</p>
        </div>
        <div className="cad-acoes" role="group" aria-label="Ano">
          <BotaoIcone icone={ChevronLeft} rotulo="Ano anterior" variante="secundario" onClick={() => setAno((a) => a - 1)} />
          <span className="cad-titulo tabular" aria-live="polite">{ano}</span>
          <BotaoIcone icone={ChevronRight} rotulo="Próximo ano" variante="secundario" onClick={() => setAno((a) => a + 1)} />
        </div>
      </header>

      {admin && (
        <Painel titulo={`Cadastrar feriado em ${ano}`} icone={CalendarPlus} id="cad-novo-feriado">
          <div className="cad-painel-corpo"><NovoFeriado ano={ano} /></div>
        </Painel>
      )}

      <Painel>
        {consulta.isPending ? (
          <div className="cad-painel-corpo"><EsqueletoLinhas linhas={6} /></div>
        ) : consulta.isError ? (
          <EstadoVazio titulo="Não foi possível carregar os feriados." texto={consulta.error.mensagem}
            acoes={<Botao variante="secundario" onClick={() => void consulta.refetch()}>Tentar de novo</Botao>} />
        ) : (consulta.data ?? []).length === 0 ? (
          <EstadoVazio icone={CalendarPlus} tamanho="p" titulo={`Nenhum feriado cadastrado em ${ano}.`}
            texto={admin ? 'Cadastre os da cidade e os da agência acima.' : 'O admin cadastra os feriados.'} />
        ) : (
          <div>
            {[...porMes.entries()].map(([m, lista]) => (
              <section key={m} aria-labelledby={`cad-mes-${m}`}>
                <h2 id={`cad-mes-${m}`} className="cad-eyebrow cad-mes-titulo">{MESES[m]}</h2>
                <ul className="cad-lista">
                  {lista.map((f) => (
                    <li key={f.data} className="cad-feriado" data-passado={f.data < hoje ? '' : undefined}>
                      <span className="cad-feriado-data">{formatar(f.data)}</span>
                      <span className="flex-1 min-w-0">{f.nome}</span>
                      <Pilula tom={TOM_TIPO[f.tipo]}>{ROTULO_TIPO[f.tipo]}</Pilula>
                      {admin && <BotaoIcone icone={Trash2} rotulo={`Tirar ${f.nome}`} tamanho="p" onClick={() => void tirar(f)} />}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Painel>
    </div>
  )
}
