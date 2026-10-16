/**
 * Fonte "Nova demanda com modelo" da paleta (F4): "carro" + Enter abre a Nova demanda já com o Carrossel (no quadro
 * aberto). Só os modelos que valem no quadro aberto (globais e os dele).
 */
import type { FontePaleta } from '../tipos.ts'
import { bootstrapAtual } from '../../api/cache.ts'
import { normalizarAlias } from '@shared/logica/texto.ts'
import { iconeDoModelo } from '../../funcionalidades/entrada/icones.ts'
import { modelosDoQuadro } from '../../funcionalidades/entrada/formulario.ts'
import { quadroAtualDaUrl } from '../../funcionalidades/entrada/lugar.ts'

export const fonte: FontePaleta = {
  id: 'entrada-modelos',
  secao: 'Nova demanda com modelo',
  ordem: 250,
  minimo: 2,
  buscar(termo) {
    const b = bootstrapAtual()
    if (!b) return []
    const quadroId = quadroAtualDaUrl(b)
    const palavras = normalizarAlias(termo).split(' ').filter(Boolean)
    return modelosDoQuadro(b.modelosDemanda, quadroId)
      .filter((m) => { const n = normalizarAlias(`${m.nome} modelo nova demanda`); return palavras.every((p) => n.split(' ').some((w) => w.startsWith(p))) })
      .slice(0, 4)
      .map((m) => ({
        id: m.id,
        rotulo: `Nova demanda: ${m.nome}`,
        detalhe: m.descricao,
        icone: iconeDoModelo(m.icone),
        executar: (ctx) => { void ctx.abrirDialogo('nova-demanda', { modeloId: m.id, quadroId: ctx.quadroAtual?.id ?? quadroId ?? undefined }) },
      }))
  },
}
