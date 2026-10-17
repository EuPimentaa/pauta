/** Comandos do F5 na paleta (Cmd+K): criar quadro, cliente e convite; ir para Clientes, Arquivo e Configurações. */
import { Archive, Building2, LayoutGrid, Plus, Settings, UserPlus, UserRound } from 'lucide-react'
import type { Bootstrap } from '@shared/tipos/index.ts'
import type { Comando, ContextoAcao } from '../tipos.ts'
import { equipesSemQuadro } from '../../funcionalidades/cadastros/logica.ts'

const admin = (ctx: { eu: { usuario: { papel: string } } }) => ctx.eu.usuario.papel === 'admin'
/** Só quando ainda há equipe ativa sem quadro (senão o comando levava a "Todas as equipes ativas já têm quadro."). */
const faltamQuadros = (ctx: ContextoAcao) => {
  const b = ctx.qc.getQueryData<Bootstrap>(['bootstrap'])
  return !!b && equipesSemQuadro(b.equipes, b.quadros).length > 0
}

export const comandos: Comando[] = [
  { id: 'cadastros-novo-quadro', rotulo: 'Novo quadro', secao: 'acoes', ordem: 510, icone: LayoutGrid, palavras: ['criar quadro', 'board'], visivel: admin,
    executar: (ctx) => ctx.navegar('/quadros/novo') },
  { id: 'cadastros-quadros-equipes', rotulo: 'Criar os quadros das equipes', secao: 'acoes', ordem: 520, icone: LayoutGrid, palavras: ['primeiros passos'],
    visivel: (ctx) => admin(ctx) && faltamQuadros(ctx),
    executar: (ctx) => ctx.navegar('/quadros/novo?equipes=1') },
  { id: 'cadastros-novo-cliente', rotulo: 'Cadastrar cliente', secao: 'acoes', ordem: 500, icone: Plus, palavras: ['novo cliente', 'criar cliente'],
    executar: (ctx) => {
      void ctx.abrirDialogo('criar-cliente', {}).then((r) => { if (r) ctx.navegar(`/clientes/${encodeURIComponent(r.cliente.sigla)}`) })
    } },
  { id: 'cadastros-convidar', rotulo: 'Convidar pessoa', secao: 'acoes', ordem: 530, icone: UserPlus, palavras: ['convite', 'nova pessoa', 'usuário'], visivel: admin,
    executar: (ctx) => ctx.navegar('/config/pessoas?convidar=1') },
  { id: 'cadastros-ir-clientes', rotulo: 'Clientes', secao: 'ir_para', ordem: 100, icone: Building2, executar: (ctx) => ctx.navegar('/clientes') },
  { id: 'cadastros-ir-arquivo', rotulo: 'Arquivo', secao: 'ir_para', ordem: 110, icone: Archive, palavras: ['arquivadas', 'restaurar'], executar: (ctx) => ctx.navegar('/arquivo') },
  { id: 'cadastros-ir-config', rotulo: 'Configurações', secao: 'ir_para', ordem: 130, icone: Settings, palavras: ['pessoas', 'equipes', 'feriados', 'tema'],
    executar: (ctx) => ctx.navegar('/config') },
  { id: 'cadastros-ir-conta', rotulo: 'Sua conta', secao: 'ir_para', ordem: 140, icone: UserRound, palavras: ['senha', 'nome', 'apelido', 'minha conta', 'perfil'],
    executar: (ctx) => ctx.navegar('/config/conta') },
]
