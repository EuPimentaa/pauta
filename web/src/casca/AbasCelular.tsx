/**
 * Barra de abas do celular (extensoes/celular: Início · Agenda · + · Busca · Sino). `destaque` é o "+" laranja central.
 * Aba sem caminho chama `executar(ctx)` (ex.: o Sino abre as notificações numa folha); os diálogos e as ações chegam
 * pela ponte lib/acoes-globais.ts, que o host de diálogos do NÚCLEO-WEB preenche.
 */
import { NavLink, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { ContextoAcao, ExtensaoAbaCelular } from '../extensoes/tipos.ts'
import { useEu } from '../api/auth.ts'
import { abrirDialogoGlobal, acoesGlobais } from '../lib/acoes-globais.ts'
import { useRegistro } from '../sessao/registro.ts'

const semContador = () => 0

function useContextoAcaoCasca(): ContextoAcao {
  const eu = useEu()
  const navegar = useNavigate()
  const qc = useQueryClient()
  return {
    eu, qc, demandaEmFoco: null, quadroAtual: null, abrirDialogo: abrirDialogoGlobal, acoes: acoesGlobais,
    navegar: (c, o) => { if (o?.novaAba) window.open(c, '_blank', 'noopener'); else navegar(c) },
  }
}

function Aba({ aba, ctx }: { aba: ExtensaoAbaCelular; ctx: ContextoAcao }) {
  const n = (aba.useContador ?? semContador)()
  const I = aba.icone
  const conteudo = (
    <>
      <span aria-hidden="true"><I /></span>
      <span className={aba.destaque ? 'sr-only' : undefined}>{aba.rotulo}</span>
      {n > 0 && <span className="casca-aba-num tabular" aria-label={`${n} novas`}>{n > 99 ? '99+' : n}</span>}
    </>
  )
  const classe = `casca-aba${aba.destaque ? ' casca-aba-destaque' : ''}`
  if (aba.caminho) return <NavLink to={aba.caminho} className={classe}>{conteudo}</NavLink>
  return <button type="button" className={classe} onClick={() => aba.executar?.(ctx)}>{conteudo}</button>
}

export function AbasCelular() {
  const reg = useRegistro()
  const ctx = useContextoAcaoCasca()
  const abas = reg.abasCelular()
  if (abas.length === 0) return null
  return (
    <nav className="casca-abas vidro-plano" aria-label="Atalhos">
      {abas.map((a) => <Aba key={a.id} aba={a} ctx={ctx} />)}
    </nav>
  )
}
