/**
 * Componentes globais (extensoes/global): montados uma vez, dentro do QueryClientProvider e do Router.
 * 'autenticada' → só na área autenticada. 'raiz' → em todas as rotas, depois que o registro carregou (a página pública
 * nunca baixa o registro; quem abriu o app logado e foi para uma rota pública continua com eles montados).
 */
import { Suspense } from 'react'
import type { ExtensaoGlobal } from '../extensoes/tipos.ts'
import { LimiteErro } from '../ui/LimiteErro.tsx'
import { useRegistroSeCarregado, type ModuloRegistro } from './registro.ts'

function Global({ g, reg }: { g: ExtensaoGlobal; reg: ModuloRegistro }) {
  const C = reg.componenteDe('global', g.id, g.carregar)
  return (
    <LimiteErro nome={`global ${g.id}`} fallback={null}>
      <Suspense fallback={null}><C /></Suspense>
    </LimiteErro>
  )
}

export function Globais({ escopo }: { escopo: ExtensaoGlobal['escopo'] }) {
  const reg = useRegistroSeCarregado()
  if (!reg) return null
  return <>{reg.globais().filter((g) => g.escopo === escopo).map((g) => <Global key={g.id} g={g} reg={reg} />)}</>
}
