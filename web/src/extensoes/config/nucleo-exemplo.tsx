/** Só DEV (/dev/extensoes): seção de Configurações de exemplo em /config/exemplo (testa o host). */
import { FlaskConical } from 'lucide-react'
import type { ExtensaoSecaoConfig } from '../tipos.ts'

export const secao: ExtensaoSecaoConfig = {
  id: 'nucleo-exemplo', rotulo: 'Exemplo', ordem: 999, caminho: 'exemplo', acesso: ['admin', 'atendimento', 'equipe'], icone: FlaskConical,
  carregar: () => Promise.resolve({
    default: () => (
      <section className="flex flex-col gap-2">
        <h1 className="text-h2 font-semibold">Seção de exemplo</h1>
        <p className="text-body text-fg-2">Vem de extensoes/config/nucleo-exemplo.tsx (só em desenvolvimento).</p>
      </section>
    ),
  }),
}
