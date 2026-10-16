/**
 * Uma tela de telas/**\/rota.tsx: React.lazy uma vez por caminho, Suspense com esqueleto, título da aba e o acesso
 * 'admin'. Usada pelo App.tsx para cada rota.
 */
import { lazy, Suspense, useLayoutEffect, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useSessao } from '../api/auth.ts'
import type { ExtensaoRota } from '../extensoes/tipos.ts'
import { nomeApp } from '../lib/app.ts'
import { Botao } from '../ui/Botao.tsx'
import { EstadoVazio } from '../ui/Indicadores.tsx'
import { LimiteErro } from '../ui/LimiteErro.tsx'
import { Modal } from '../ui/Modal.tsx'
import { EsqueletoTela } from './EsqueletoTela.tsx'
import { useFecharSobreposta } from './sobreposta.tsx'

const telas = new Map<string, LazyExoticComponent<ComponentType>>()

function componenteDaRota(r: ExtensaoRota): LazyExoticComponent<ComponentType> {
  let c = telas.get(r.caminho)
  if (!c) { c = lazy(r.carregar); telas.set(r.caminho, c) }
  return c
}

/** Título estático da rota; telas com título dinâmico chamam useTituloAba() (efeito passivo, vence este). */
function useTituloRota(titulo: string | undefined) {
  useLayoutEffect(() => {
    const antes = document.title
    document.title = titulo ? `${titulo} · ${nomeApp()}` : nomeApp()
    return () => { document.title = antes }
  }, [titulo])
}

const TITULO_SEM_ACESSO = 'Você não tem acesso a esta página.'
const TEXTO_SEM_ACESSO = 'Ela é só para quem administra o sistema. Peça ao admin, se precisar.'

/** Rota sobreposta só de admin aberta por quem não é: o aviso num modal sobre a tela de baixo, não solto por cima dela. */
function SemAcessoSobreposta() {
  const fechar = useFecharSobreposta()
  return (
    <Modal aberto aoFechar={fechar} rotulo="Sem acesso" tamanho="p">
      <EstadoVazio icone={ShieldAlert} como="h2" titulo={TITULO_SEM_ACESSO} texto={TEXTO_SEM_ACESSO}
        acoes={<Botao variante="secundario" onClick={fechar}>Fechar</Botao>} />
    </Modal>
  )
}

export function Tela({ rota, esqueleto }: { rota: ExtensaoRota; esqueleto?: ReactNode }) {
  useTituloRota(rota.titulo)
  const { eu } = useSessao({ buscar: false })
  if (rota.acesso === 'admin' && eu?.usuario.papel !== 'admin') {
    if (rota.layout === 'sobreposta') return <SemAcessoSobreposta />
    return <EstadoVazio icone={ShieldAlert} titulo={TITULO_SEM_ACESSO} texto={TEXTO_SEM_ACESSO} />
  }
  const C = componenteDaRota(rota)
  return (
    <LimiteErro nome={`tela ${rota.caminho}`}>
      <Suspense fallback={esqueleto ?? <EsqueletoTela />}>
        <C />
      </Suspense>
    </LimiteErro>
  )
}
