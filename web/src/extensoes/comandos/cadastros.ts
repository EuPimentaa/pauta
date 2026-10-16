/** Comandos do F5 na paleta (Cmd+K): criar quadro, cliente e convite; ir para Clientes, Arquivo e Configurações. */
import { Archive, Building2, LayoutGrid, Plus, Settings, UserPlus } from 'lucide-react'
import type { Comando } from '../tipos.ts'

const admin = (ctx: { eu: { usuario: { papel: string } } }) => ctx.eu.usuario.papel === 'admin'

export const comandos: Comando[] = [
  { id: 'cadastros-novo-quadro', rotulo: 'Novo quadro', secao: 'acoes', icone: LayoutGrid, palavras: ['criar quadro', 'board'], visivel: admin,
    executar: (ctx) => ctx.navegar('/quadros/novo') },
  { id: 'cadastros-quadros-equipes', rotulo: 'Criar os quadros das equipes', secao: 'acoes', icone: LayoutGrid, palavras: ['primeiros passos'], visivel: admin,
    executar: (ctx) => ctx.navegar('/quadros/novo?equipes=1') },
  { id: 'cadastros-novo-cliente', rotulo: 'Cadastrar cliente', secao: 'acoes', icone: Plus, palavras: ['novo cliente', 'criar cliente'],
    executar: (ctx) => {
      void ctx.abrirDialogo('criar-cliente', {}).then((r) => { if (r) ctx.navegar(`/clientes/${encodeURIComponent(r.cliente.sigla)}`) })
    } },
  { id: 'cadastros-convidar', rotulo: 'Convidar pessoa', secao: 'acoes', icone: UserPlus, palavras: ['convite', 'nova pessoa', 'usuário'], visivel: admin,
    executar: (ctx) => ctx.navegar('/config/pessoas?convidar=1') },
  { id: 'cadastros-ir-clientes', rotulo: 'Clientes', secao: 'ir_para', icone: Building2, executar: (ctx) => ctx.navegar('/clientes') },
  { id: 'cadastros-ir-arquivo', rotulo: 'Arquivo', secao: 'ir_para', icone: Archive, palavras: ['arquivadas', 'restaurar'], executar: (ctx) => ctx.navegar('/arquivo') },
  { id: 'cadastros-ir-config', rotulo: 'Configurações', secao: 'ir_para', icone: Settings, palavras: ['pessoas', 'equipes', 'feriados', 'tema'],
    executar: (ctx) => ctx.navegar('/config') },
]
