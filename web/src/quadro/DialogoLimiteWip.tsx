/** "Limite WIP…" do menu da coluna: só aviso (o contador fica "6/5" em destaque); vazio tira o limite. */
import { useId, useState } from 'react'
import './dialogos-coluna.ts'
import { useColuna } from '../api/seletores.ts'
import { useColunasMutacoes } from '../api/quadros.ts'
import { MolduraDialogo } from '../dialogos/Moldura.tsx'
import type { PropsDialogo } from '../extensoes/tipos.ts'
import { Botao } from '../ui/Botao.tsx'
import { Campo } from '../ui/Campo.tsx'

export default function DialogoLimiteWip({ params, fechar }: PropsDialogo<'nucleo-limite-wip'>) {
  const coluna = useColuna(params.colunaId)
  const colunas = useColunasMutacoes()
  const [valor, setValor] = useState(coluna?.limiteWip ? String(coluna.limiteWip) : '')
  const [salvando, setSalvando] = useState(false)
  const idForm = useId()
  const numero = valor.trim() === '' ? null : Number(valor)
  const invalido = numero !== null && (!Number.isInteger(numero) || numero < 1 || numero > 999)

  async function salvar() {
    if (!coluna || invalido) return
    setSalvando(true)
    const r = await colunas.editar(coluna, { limiteWip: numero })
    setSalvando(false)
    if (r) fechar({ feito: true })
  }

  return (
    <MolduraDialogo
      titulo={coluna ? `Limite WIP de ${coluna.nome}` : 'Limite WIP'}
      descricao="Só um aviso: acima do limite o contador fica em destaque. Nada é bloqueado."
      rodape={(
        <>
          <Botao variante="secundario" onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={salvando} disabled={!coluna || invalido}>Salvar</Botao>
        </>
      )}
    >
      <form id={idForm} onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        <Campo
          rotulo="Cards na coluna"
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          ajuda="Deixe vazio para tirar o limite."
          erro={invalido ? 'Use um número inteiro de 1 a 999.' : undefined}
          data-autofocus=""
        />
      </form>
    </MolduraDialogo>
  )
}
