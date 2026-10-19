/**
 * Diálogo `resultados-ligar-conta` (F8): escolhe o canal, busca na lista de contas da Windsor (com os clientes que já
 * usam cada conta) ou "Digitar o id" (conta fora da lista: id + nome) e liga ao cliente. Quem abre já pode editar o
 * cliente (`cliente.editar`); o servidor confere de novo.
 */
import { useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Keyboard, List, Search } from 'lucide-react'
import { CONECTORES_WINDSOR, ROTULO_CONECTOR, type ConectorWindsor, type ContaWindsor } from '@shared/tipos/index.ts'
import { useClientes } from '../../api/seletores.ts'
import { MolduraDialogo } from '../../dialogos/index.ts'
import type { PropsDialogo } from '../../extensoes/tipos.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo, Selecao } from '../../ui/Campo.tsx'
import { normalizarBusca } from '../../ui/Combobox.tsx'
import { EsqueletoLinhas } from '../../ui/Indicadores.tsx'
import { erroDoCampo, Faixa, mensagemGeral } from '../cadastros/comum.tsx'
import { ligarConta, useContasLigadas, useContasWindsor } from './api.ts'
import './resultados.css'

const DICA_ID: Record<ConectorWindsor, string> = {
  facebook: 'Só os números (com ou sem "act_"), como no Gerenciador de Anúncios.',
  google_ads: 'No formato 000-000-0000 (pode digitar só os 10 números).',
  googleanalytics4: 'O id da propriedade do GA4, só números.',
}

function avisoDaLista(estado: string | undefined): string | null {
  if (!estado || estado === 'ok') return null
  if (estado === 'sem_chave') return 'A integração com a Windsor não está configurada: digite o id da conta.'
  if (estado === 'chave_invalida') return 'A chave da Windsor foi recusada e a lista não veio. Avise o admin; enquanto isso, digite o id da conta.'
  return 'A Windsor não respondeu e a lista pode estar incompleta. Se a conta não estiver aqui, digite o id.'
}

export default function DialogoLigarConta({ params, fechar }: PropsDialogo<'resultados-ligar-conta'>) {
  const qc = useQueryClient()
  const idForm = useId()
  const lista = useContasWindsor()
  const ligadas = useContasLigadas(params.clienteId)
  const clientes = useClientes()
  const cliente = clientes.find((c) => c.id === params.clienteId)
  const [conector, setConector] = useState<ConectorWindsor>(params.conector ?? 'facebook')
  const [busca, setBusca] = useState('')
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [digitar, setDigitar] = useState(false)
  const [contaId, setContaId] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<unknown>(null)
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const jaLigadas = new Set((ligadas.data ?? []).filter((c) => c.conector === conector).map((c) => c.contaId))
  const termo = normalizarBusca(busca)
  const doCanal = (lista.data?.contas ?? []).filter((c) => c.conector === conector)
  const filtradas = doCanal.filter((c) => !termo || normalizarBusca(`${c.nome} ${c.contaId}`).includes(termo))
  const aviso = avisoDaLista(lista.data?.estado)
  const modoDigitar = digitar || lista.data?.estado === 'sem_chave'

  async function enviar() {
    setTentou(true)
    setErro(null)
    if (modoDigitar ? !contaId.trim() || !nome.trim() : !escolhida) return
    setEnviando(true)
    try {
      const conta = await ligarConta(qc, params.clienteId, modoDigitar
        ? { conector, contaId: contaId.trim(), nome: nome.trim() } : { conector, contaId: escolhida! })
      avisar(`${conta.nome} ligada${cliente ? ` a ${cliente.sigla}` : ''}.`, { tipo: 'sucesso', descricao: 'Os resultados aparecem na aba Resultados.' })
      fechar({ conta })
    } catch (e) {
      setErro(e)
    } finally {
      setEnviando(false)
    }
  }

  const usadaPor = (c: ContaWindsor) => c.clientes.filter((x) => x.clienteId !== params.clienteId).map((x) => x.sigla)
  const erroId = modoDigitar && tentou && !contaId.trim() ? 'Digite o id da conta.' : erroDoCampo(erro, 'contaId')
  const erroNome = modoDigitar && tentou && !nome.trim() ? 'Escreva o nome da conta.' : erroDoCampo(erro, 'nome')
  const geral = erro && !erroDoCampo(erro, 'contaId') && !erroDoCampo(erro, 'nome') ? mensagemGeral(erro) : null

  return (
    <MolduraDialogo
      titulo={cliente ? `Ligar conta a ${cliente.sigla}` : 'Ligar conta'} tamanho="m" fecharAoClicarFora={false}
      descricao="Os resultados vêm da Windsor. Uma conta pode servir a mais de um cliente."
      rodape={(
        <>
          <Botao variante="secundario" onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={enviando}>Ligar conta</Botao>
        </>
      )}
    >
      <form id={idForm} className="res-form" noValidate onSubmit={(e) => { e.preventDefault(); void enviar() }}>
        <div className="res-form-linha">
          <Selecao rotulo="Canal" value={conector} classeGrupo="res-form-canal"
            onChange={(e) => { setConector(e.target.value as ConectorWindsor); setEscolhida(null); setErro(null) }}
            opcoes={CONECTORES_WINDSOR.map((c) => ({ valor: c, rotulo: ROTULO_CONECTOR[c] }))} />
          {lista.data?.estado !== 'sem_chave' && (
            <Botao type="button" variante="ghost" tamanho="p" icone={modoDigitar ? List : Keyboard} onClick={() => { setDigitar((d) => !d); setErro(null) }}>
              {modoDigitar ? 'Escolher da lista' : 'Digitar o id'}
            </Botao>
          )}
        </div>
        {aviso && <Faixa tom={lista.data?.estado === 'chave_invalida' ? 'perigo' : 'info'}>{aviso}</Faixa>}
        {modoDigitar ? (
          <div className="res-form-digitar">
            <Campo rotulo="Id da conta" value={contaId} onChange={(e) => setContaId(e.target.value)} maxLength={60} autoComplete="off"
              spellCheck={false} inputMode={conector === 'google_ads' ? 'text' : 'numeric'} ajuda={DICA_ID[conector]} erro={erroId} data-autofocus="" />
            <Campo rotulo="Nome da conta" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} autoComplete="off"
              ajuda="Como aparece na Windsor. Fica guardado na ligação." erro={erroNome} />
          </div>
        ) : lista.isPending ? <EsqueletoLinhas linhas={5} /> : lista.isError ? (
          <Faixa tom="perigo">{lista.error.mensagem}</Faixa>
        ) : (
          <fieldset className="res-escolha">
            <legend className="sr-only">Conta de {ROTULO_CONECTOR[conector]}</legend>
            <Campo rotulo="Buscar conta" rotuloOculto icone={Search} value={busca} placeholder="Buscar pelo nome ou pelo id"
              onChange={(e) => setBusca(e.target.value)} tamanho="p" data-autofocus="" />
            {filtradas.length === 0 ? (
              <p className="res-vazio">{doCanal.length === 0
                ? `Nenhuma conta de ${ROTULO_CONECTOR[conector]} na lista da Windsor. Use "Digitar o id".`
                : `Nada encontrado para “${busca.trim()}”.`}</p>
            ) : (
              <ul className="res-opcoes" aria-label={`Contas de ${ROTULO_CONECTOR[conector]}`}>
                {filtradas.map((c) => {
                  const ja = jaLigadas.has(c.contaId)
                  const outros = usadaPor(c)
                  return (
                    <li key={c.contaId}>
                      <label className="res-opcao" data-desabilitada={ja ? '' : undefined}>
                        <input type="radio" name={`${idForm}-conta`} value={c.contaId} checked={escolhida === c.contaId} disabled={ja}
                          onChange={() => setEscolhida(c.contaId)} />
                        <span className="res-opcao-texto">
                          <span className="res-opcao-nome">{c.nome}</span>
                          <span className="res-opcao-meta">
                            <span>{c.contaId}</span>
                            {c.status && c.status !== 'active' && <span>{c.status}</span>}
                            {ja && <span>já ligada a este cliente</span>}
                            {outros.length > 0 && <span>usada por {outros.join(', ')}</span>}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
            {tentou && !escolhida && <p className="ui-campo-erro">Escolha uma conta.</p>}
          </fieldset>
        )}
        {geral && <Faixa tom="perigo">{geral}</Faixa>}
      </form>
    </MolduraDialogo>
  )
}
