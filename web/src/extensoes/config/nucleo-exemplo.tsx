/**
 * Só DEV (/dev/extensoes): seção de Configurações de exemplo em /config/exemplo (testa o host). Só aparece com os
 * exemplos ligados (`acesso` vazio fora deles).
 */
import { FlaskConical } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'
import type { Papel } from '@shared/tipos/index.ts'
import { exemplosAtivos } from '../../telas/dev-extensoes/exemplos.ts'

const TODOS: Papel[] = ['admin', 'atendimento', 'equipe']

export const secao: ExtensaoSecaoConfig | undefined = import.meta.env.DEV ? {
  id: 'nucleo-exemplo', rotulo: 'Exemplo', ordem: 999, caminho: 'exemplo', icone: FlaskConical,
  get acesso() { return exemplosAtivos() ? TODOS : [] },
  carregar: () => Promise.resolve({
    default: () => (
      <section className="flex flex-col gap-2">
        <h1 className="text-h2 font-semibold">Seção de exemplo</h1>
        <p className="text-body text-fg-2">Vem de extensoes/config/nucleo-exemplo.tsx (só em desenvolvimento).</p>
      </section>
    ),
  }),
} : undefined
