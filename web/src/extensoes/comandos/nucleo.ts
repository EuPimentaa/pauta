/**
 * Comandos do núcleo na paleta (PLANO §2): tema (claro, escuro, do sistema), "Só as minhas" e "Copiar link" do quadro
 * aberto, e ir para o Início. Ir para cada quadro é a fonte "Quadros" (busca/nucleo-quadros.ts), que lista todos com a
 * busca vazia.
 */
import { House, Link2, Monitor, Moon, Sun, UserRound } from 'lucide-react'
import type { Prefs } from '@shared/tipos/index.ts'
import type { Comando, ContextoAcao } from '../tipos.ts'
import { atualizarEu } from '../../api/auth.ts'
import { api } from '../../api/cliente.ts'
import { aplicarTema, type PreferenciaTema } from '../../lib/tema.ts'
import { controleQuadro } from '../../teclado/controles.ts'
import { avisar } from '../../ui/avisos.tsx'
import { copiarParaAreaDeTransferencia } from '../../ui/Texto.tsx'

/** O mesmo que o menu do avatar faz (useMudarTema do DS), fora do render. */
function mudarTema(ctx: ContextoAcao, p: PreferenciaTema) {
  aplicarTema(p)
  const prefs: Prefs = { tema: p }
  atualizarEu(ctx.qc, (eu) => ({ ...eu, prefs: { ...eu.prefs, ...prefs } }))
  void api('PATCH', '/api/auth/eu', { corpo: { prefs } }).catch(() => { /* fica só neste aparelho */ })
}

export const comandos: Comando[] = [
  { id: 'nucleo-ir-inicio', rotulo: 'Ir para o Início', secao: 'ir_para', icone: House, palavras: ['inicio', 'home', 'minhas'],
    executar: (ctx) => ctx.navegar('/inicio') },
  { id: 'nucleo-so-minhas', rotulo: 'Só as minhas neste quadro', secao: 'acoes', icone: UserRound, atalho: 'q', palavras: ['filtro', 'minhas'],
    visivel: (ctx) => !!ctx.quadroAtual && !!controleQuadro(), executar: () => controleQuadro()?.alternarSoMinhas() },
  { id: 'nucleo-link-quadro', rotulo: 'Copiar link do quadro', secao: 'acoes', icone: Link2, palavras: ['compartilhar', 'url'],
    visivel: (ctx) => !!ctx.quadroAtual,
    executar: async (ctx) => {
      const ok = await copiarParaAreaDeTransferencia(`${window.location.origin}/q/${encodeURIComponent(ctx.quadroAtual!.slug)}`)
      avisar(ok ? 'Link do quadro copiado.' : 'Não foi possível copiar o link.', { tipo: ok ? 'sucesso' : 'erro' })
    } },
  { id: 'nucleo-tema-escuro', rotulo: 'Tema escuro', secao: 'acoes', icone: Moon, palavras: ['aparencia', 'dark', 'noite'],
    visivel: (ctx) => ctx.eu.prefs.tema !== 'escuro', executar: (ctx) => mudarTema(ctx, 'escuro') },
  { id: 'nucleo-tema-claro', rotulo: 'Tema claro', secao: 'acoes', icone: Sun, palavras: ['aparencia', 'light', 'dia'],
    visivel: (ctx) => ctx.eu.prefs.tema !== 'claro', executar: (ctx) => mudarTema(ctx, 'claro') },
  { id: 'nucleo-tema-sistema', rotulo: 'Tema igual ao do sistema', secao: 'acoes', icone: Monitor, palavras: ['aparencia', 'automatico'],
    visivel: (ctx) => (ctx.eu.prefs.tema ?? 'sistema') !== 'sistema', executar: (ctx) => mudarTema(ctx, 'sistema') },
]
