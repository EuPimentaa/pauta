/**
 * Diálogo `criar-cliente` (MapaDialogos; F5): "Criar cliente XYZ" sem sair do fluxo (Nova demanda, criação rápida,
 * modal e a lista de Clientes). Só sigla e nome, para todos os papéis: a equipe cria o cliente mínimo (nasce sem AM,
 * com "Completar cadastro" para o atendimento); o atendimento que cria já fica como AM.
 * Sigla de outro cliente (409 com detalhes.clienteId): oferece usar o cliente que já existe.
 */
import { useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import type { ClienteResumo } from '@shared/tipos/index.ts'
import { useEu } from '../../api/auth.ts'
import { bootstrapDe } from '../../api/cache.ts'
import { ehErroDaApi } from '../../api/cliente.ts'
import { MolduraDialogo } from '../../dialogos/index.ts'
import type { PropsDialogo } from '../../extensoes/tipos.ts'
import { Botao } from '../../ui/Botao.tsx'
import { Campo } from '../../ui/Campo.tsx'
import { criarCliente, resumoCliente } from './api.ts'
import { erroDoCampo, Faixa, mensagemGeral } from './comum.tsx'
import { limparSigla } from './logica.ts'

export default function DialogoCriarCliente({ params, fechar }: PropsDialogo<'criar-cliente'>) {
  const qc = useQueryClient()
  const eu = useEu()
  const idForm = useId()
  const [sigla, setSigla] = useState(limparSigla(params.sigla ?? ''))
  const [nome, setNome] = useState(params.nome ?? '')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const [existente, setExistente] = useState<ClienteResumo | null>(null)
  const equipe = eu.usuario.papel === 'equipe'

  async function enviar() {
    setErro(null)
    setExistente(null)
    if (!sigla) { setErro({ campo: 'sigla' }); return }
    setEnviando(true)
    try {
      const c = await criarCliente(qc, { sigla, nome: nome.trim() || sigla })
      fechar({ cliente: resumoCliente(c) })
    } catch (e) {
      setErro(e)
      if (ehErroDaApi(e) && e.status === 409) {
        const id = e.detalhes?.clienteId as string | undefined
        setExistente(bootstrapDe(qc)?.clientes.find((c) => c.id === id) ?? null)
      }
    } finally {
      setEnviando(false)
    }
  }

  const erroSigla = erro && typeof erro === 'object' && 'campo' in erro ? 'Escreva a sigla.' : erroDoCampo(erro, 'sigla')
  const erroNome = erroDoCampo(erro, 'nome')
  const geral = erro && !erroSigla && !erroNome && !existente ? mensagemGeral(erro) : null

  return (
    <MolduraDialogo
      titulo={params.sigla ? `Criar cliente ${limparSigla(params.sigla)}` : 'Novo cliente'}
      descricao={equipe
        ? 'Só a sigla e o nome. O atendimento completa o cadastro depois.'
        : 'Sigla e nome agora; contatos, AM e o resto você completa na página do cliente.'}
      rodape={(
        <>
          <Botao variante="secundario" onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={enviando}>Criar cliente</Botao>
        </>
      )}
    >
      <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void enviar() }}>
        <Campo rotulo="Sigla" value={sigla} onChange={(e) => setSigla(limparSigla(e.target.value))} maxLength={12}
          autoComplete="off" spellCheck={false} autoCapitalize="characters" erro={erroSigla}
          ajuda="Até 12 letras ou números, como HE ou ICC. É o que aparece no card." data-autofocus={params.sigla ? undefined : ''} />
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} autoComplete="off"
          placeholder="Hospital Evangélico" erro={erroNome} data-autofocus={params.sigla ? '' : undefined} />
        {existente && (
          <Faixa tom="info" icone={Building2} acoes={(
            <Botao tamanho="p" variante="secundario" onClick={() => fechar({ cliente: existente })}>Usar {existente.sigla}</Botao>
          )}>
            {mensagemGeral(erro)} {existente.sigla} é {existente.nome}.
          </Faixa>
        )}
        {geral && <Faixa tom="perigo">{geral}</Faixa>}
      </form>
    </MolduraDialogo>
  )
}
