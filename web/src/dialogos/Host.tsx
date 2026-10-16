/**
 * Host de diálogos (global `nucleo-dialogos`): desenha a pilha de abrirDialogo (dialogos/estado.ts) e liga o núcleo
 * ao resto do app:
 * - a navegação fora do render (rotas sobrepostas abrem por cima da tela atual, como o useAbrirSobreposta do DS);
 * - as dependências das ações (ContextoAcao dos interceptadores, lista de extensoes/soltar);
 * - a ponte da casca (lib/acoes-globais.ts: abas do celular e o que mais a casca chamar).
 */
import { Suspense, useEffect, type ComponentType } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { acoesDe, definirDepsAcoes } from '../api/acoes.ts'
import { rotas } from '../extensoes/registro-rotas.ts'
import { definirAcoesGlobais } from '../lib/acoes-globais.ts'
import { useFundo, type EstadoFundo } from '../sessao/sobreposta.tsx'
import { useRegistro, type ModuloRegistro } from '../sessao/registro.ts'
import { Esqueleto, EsqueletoLinhas } from '../ui/Indicadores.tsx'
import { LimiteErro } from '../ui/LimiteErro.tsx'
import { contextoAcaoAgora } from './contexto.ts'
import { abrirDialogo, definirNavegacao, fecharTodos, useDialogosAbertos, type EntradaDialogo } from './estado.ts'
import { ContextoMoldura, MolduraDialogo } from './Moldura.tsx'

type PropsCamada = { params: unknown; ancora: HTMLElement | null; fechar(r: unknown): void }

function Carregando() {
  return (
    <MolduraDialogo titulo="Carregando">
      <div className="flex flex-col gap-3 py-2" aria-busy="true">
        <Esqueleto largura="50%" altura={16} />
        <EsqueletoLinhas linhas={3} />
      </div>
    </MolduraDialogo>
  )
}

function Camada({ entrada, reg }: { entrada: EntradaDialogo; reg: ModuloRegistro }) {
  const def = reg.dialogos().find((d) => d.id === entrada.id)
  if (!def) return null
  // cada diálogo tem as props do seu id; aqui a pilha é heterogênea
  const C = reg.componenteDe('dialogos', def.id, def.carregar as unknown as () => Promise<{ default: ComponentType<PropsCamada> }>)
  const forma = def.forma === 'popover' && entrada.ancora ? 'popover' : 'modal'
  return (
    <ContextoMoldura.Provider value={{ aberto: entrada.aberto, forma, ancora: entrada.ancora, cancelar: () => entrada.fechar(null) }}>
      <LimiteErro nome={`diálogo ${entrada.id}`}>
        <Suspense fallback={<Carregando />}>
          <C params={entrada.params} ancora={entrada.ancora} fechar={(r) => entrada.fechar(r)} />
        </Suspense>
      </LimiteErro>
    </ContextoMoldura.Provider>
  )
}

export default function HostDialogos() {
  const pilha = useDialogosAbertos()
  const reg = useRegistro()
  const qc = useQueryClient()
  const navigate = useNavigate()
  // dentro da árvore de rotas: com uma sobreposta aberta, esta é a tela de baixo (o fundo a manter)
  const location = useLocation()
  const fundo = useFundo()

  useEffect(() => {
    const sobrepostas = rotas().filter((r) => r.layout === 'sobreposta' && r.acesso !== 'publica')
    definirNavegacao((caminho, opcoes) => {
      const so = caminho.split(/[?#]/)[0]
      if (sobrepostas.some((r) => matchPath(r.caminho, so))) {
        navigate(caminho, { state: { fundo: fundo ?? location } satisfies EstadoFundo, replace: opcoes?.substituir ?? !!fundo })
      } else {
        navigate(caminho, { replace: opcoes?.substituir })
      }
    })
    return () => definirNavegacao(null)
  }, [navigate, location, fundo])

  useEffect(() => {
    definirDepsAcoes({
      contexto: (acoes) => contextoAcaoAgora(qc, acoes),
      interceptadores: () => Promise.resolve(reg.interceptadoresSoltar()),
    })
    const soltar = definirAcoesGlobais({ abrirDialogo, acoes: acoesDe(qc) })
    return () => {
      soltar()
      fecharTodos()
    }
  }, [qc, reg])

  return <>{pilha.map((e) => <Camada key={e.chave} entrada={e} reg={reg} />)}</>
}
