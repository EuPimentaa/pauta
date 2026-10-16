/**
 * Diálogo `copiar-quadro` (F5, admin; API §4.5): o "Copiar quadro" do Trello. Pede o nome (padrão "<nome> 2") e a
 * equipe; copia as colunas ativas (com as pessoas), as etiquetas, as automações (as internas apontam para as colunas
 * copiadas) e os modelos de demanda do quadro, sem cards nem estrelas. Termina abrindo o quadro novo.
 */
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { QuadroCompleto } from '@shared/tipos/index.ts'
import { normalizarAlias } from '@shared/logica/texto.ts'
import { useCopiarQuadro } from '../../api/quadros.ts'
import { useEquipes, useQuadro, useQuadros } from '../../api/seletores.ts'
import { MolduraDialogo } from '../../dialogos/index.ts'
import type { PropsDialogo } from '../../extensoes/tipos.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { Campo, Selecao } from '../../ui/Campo.tsx'
import { Interruptor } from '../../ui/Checkbox.tsx'
import { depoisDeCopiar, useQuadroCompleto } from './api.ts'
import './dialogos.ts'

/** "Criação" → "Criação 2" (ou 3, 4… se já existir). */
export function nomeDaCopia(nome: string, existentes: readonly string[]): string {
  const usados = new Set(existentes.map(normalizarAlias))
  for (let i = 2; i < 100; i++) {
    const candidato = `${nome} ${i}`
    if (!usados.has(normalizarAlias(candidato))) return candidato
  }
  return `${nome} (cópia)`
}

export default function DialogoCopiarQuadro({ params, fechar }: PropsDialogo<'copiar-quadro'>) {
  const qc = useQueryClient()
  const navegar = useNavigate()
  const copiar = useCopiarQuadro()
  const idForm = useId()
  const doBootstrap = useQuadro(params.quadroId)
  const completo = useQuadroCompleto(doBootstrap ? null : params.quadroId)
  const origem = doBootstrap ?? completo.data?.quadro
  const quadros = useQuadros()
  const equipes = useEquipes().filter((e) => e.ativa || e.id === origem?.equipeId)
  const [nome, setNome] = useState<string | null>(null)
  const [equipeId, setEquipeId] = useState<string | null | undefined>(undefined)
  const [seguem, setSeguem] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [tentou, setTentou] = useState(false)

  if (!origem) return <MolduraDialogo titulo="Copiar quadro"><p className="cad-nota">Carregando o quadro…</p></MolduraDialogo>
  const nomeFinal = nome ?? nomeDaCopia(origem.nome, quadros.map((q) => q.nome))
  const equipeFinal = equipeId === undefined ? origem.equipeId : equipeId

  async function enviar() {
    setTentou(true)
    if (!nomeFinal.trim() || !origem) return
    setEnviando(true)
    const r: QuadroCompleto | null = await copiar(origem, {
      nome: nomeFinal.trim(), equipeId: equipeFinal, ...(equipeFinal ? { membrosDaEquipeSeguem: seguem } : {}),
    })
    setEnviando(false)
    if (!r) return
    depoisDeCopiar(qc)
    const n = (x: number, um: string, varios: string) => `${x} ${x === 1 ? um : varios}`
    avisar(`Quadro ${r.quadro.nome} criado.`, {
      tipo: 'sucesso',
      descricao: `${n(r.colunas.length, 'coluna', 'colunas')}, ${n(r.etiquetas.length, 'etiqueta', 'etiquetas')} e ${n(r.automacoes.length, 'automação', 'automações')}; sem cards.`,
    })
    fechar({ quadro: r })
    navegar(`/q/${encodeURIComponent(r.quadro.slug)}`)
  }

  return (
    <MolduraDialogo titulo={`Copiar ${origem.nome}`} tamanho="m"
      descricao="Vêm junto as colunas (com as pessoas), as etiquetas, as automações e os modelos de demanda do quadro. Os cards ficam."
      rodape={(
        <>
          <Botao variante="secundario" onClick={() => fechar(null)}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={enviando}>Copiar quadro</Botao>
        </>
      )}>
      <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void enviar() }}>
        <Campo rotulo="Nome do quadro novo" value={nomeFinal} maxLength={80} data-autofocus="" onChange={(e) => setNome(e.target.value)}
          erro={tentou && !nomeFinal.trim() ? 'Dê um nome ao quadro.' : undefined} />
        <Selecao rotulo="Equipe" value={equipeFinal ?? ''} vazia="Sem equipe" opcoes={equipes.map((e) => ({ valor: e.id, rotulo: e.nome }))}
          onChange={(e) => setEquipeId(e.target.value || null)} />
        {equipeFinal && <Interruptor ligado={seguem} aoMudar={setSeguem}>As pessoas da equipe seguem o quadro novo</Interruptor>}
      </form>
    </MolduraDialogo>
  )
}
