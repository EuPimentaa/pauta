/**
 * Configurações (PLANO §2): a casca que lista as secoesConfig() permitidas ao papel no menu à esquerda (folha no
 * celular) e desenha /config/:caminho. /config vai para a primeira seção; caminho sem seção (funcionalidade ainda não
 * mergeada) é "Página não encontrada.".
 */
import './config.css'
import { Suspense, useState } from 'react'
import { Navigate, NavLink, useParams } from 'react-router'
import { Compass, Menu as IconeMenu, Settings, ShieldAlert } from 'lucide-react'
import { useEu } from '../../api/auth.ts'
import type { ExtensaoSecaoConfig } from '../../extensoes/tipos.ts'
import { useTituloAba } from '../../lib/app.ts'
import { useCelular } from '../../lib/midia.ts'
import { useRegistro, type ModuloRegistro } from '../../sessao/registro.ts'
import { Botao } from '../../ui/Botao.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import { LimiteErro } from '../../ui/LimiteErro.tsx'
import { Folha } from '../../ui/Modal.tsx'

function Lista({ secoes, aoEscolher }: { secoes: ExtensaoSecaoConfig[]; aoEscolher?(): void }) {
  return (
    <ul className="config-lista">
      {secoes.map((s) => {
        const I = s.icone ?? Settings
        return (
          <li key={s.id}>
            <NavLink to={`/config/${s.caminho}`} className="config-item" onClick={aoEscolher}>
              <I aria-hidden="true" />
              <span>{s.rotulo}</span>
            </NavLink>
          </li>
        )
      })}
    </ul>
  )
}

function Secao({ s, reg }: { s: ExtensaoSecaoConfig; reg: ModuloRegistro }) {
  const C = reg.componenteDe('config', s.id, s.carregar)
  return (
    <LimiteErro nome={`configurações ${s.id}`}>
      <Suspense fallback={<div className="config-carregando" aria-busy="true"><EsqueletoLinhas linhas={6} /></div>}>
        <C />
      </Suspense>
    </LimiteErro>
  )
}

export default function TelaConfig() {
  const { caminho } = useParams()
  const eu = useEu()
  const reg = useRegistro()
  const celular = useCelular()
  const [folha, setFolha] = useState(false)
  const todas = reg.secoesConfig()
  const secoes = todas.filter((s) => s.acesso.includes(eu.usuario.papel))
  const atual = caminho ? secoes.find((s) => s.caminho === caminho) : undefined
  const proibida = !!caminho && !atual && todas.some((s) => s.caminho === caminho)
  useTituloAba(atual ? `${atual.rotulo} · Configurações` : 'Configurações')

  if (!caminho && secoes[0]) return <Navigate to={`/config/${secoes[0].caminho}`} replace />

  let conteudo
  if (!caminho) {
    conteudo = <EstadoVazio icone={Settings} como="h1" titulo="Nenhuma configuração disponível ainda." texto="As seções chegam com as próximas partes do sistema." />
  } else if (atual) {
    conteudo = <Secao key={atual.id} s={atual} reg={reg} />
  } else if (proibida) {
    conteudo = <EstadoVazio icone={ShieldAlert} como="h1" titulo="Você não tem acesso a esta página." texto="Ela é de outro papel. Peça ao admin, se precisar." />
  } else {
    conteudo = <EstadoVazio icone={Compass} como="h1" titulo="Página não encontrada." texto="Esta seção de configurações não existe ou ainda não chegou." />
  }

  return (
    <div className="tela-config">
      {secoes.length > 0 && !celular && (
        <nav className="config-menu" aria-label="Seções das configurações">
          <h1 className="config-titulo">Configurações</h1>
          <Lista secoes={secoes} />
        </nav>
      )}
      <div className="config-conteudo">
        {celular && secoes.length > 0 && (
          <div className="config-topo-celular">
            <Botao variante="secundario" icone={IconeMenu} onClick={() => setFolha(true)}>{atual?.rotulo ?? 'Seções'}</Botao>
          </div>
        )}
        {conteudo}
      </div>
      {celular && (
        <Folha aberto={folha} aoFechar={() => setFolha(false)} titulo="Configurações">
          <Lista secoes={secoes} aoEscolher={() => setFolha(false)} />
        </Folha>
      )}
    </div>
  )
}
