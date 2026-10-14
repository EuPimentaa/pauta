/**
 * GET /api/bootstrap (API.md §3): tudo o que a interface precisa para abrir. O `seq` é lido ANTES das consultas,
 * na mesma leitura, para nada se perder entre o bootstrap e o SSE.
 */
import type { Bootstrap } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { agoraData, leitura, todos, um, type Db } from '../db.ts'
import { seqAtual } from '../tempo-real.ts'
import { clientesResumo } from './clientes.ts'
import { feriadosDoBootstrap, infoApp, lerConfig } from './config-app.ts'
import { carregarDemandas } from './demandas.ts'
import { mapear } from './mapear.ts'
import { listarEquipes, montarEu, usuariosResumo } from './pessoas.ts'
import { listarQuadros, modelosDemandaAtivos, modelosQuadro } from './quadros.ts'

type Linha = Record<string, unknown>

/** Demandas do bootstrap: quadro ativo, não arquivadas, não excluídas, abertas ou concluídas há pouco. */
export const ONDE_BOOTSTRAP = `d.excluido_em IS NULL AND d.arquivado_em IS NULL
  AND d.quadro_id IN (SELECT id FROM quadro WHERE arquivado_em IS NULL)
  AND (d.concluida_em IS NULL OR d.concluida_em > ?)`

export function montarBootstrap(db: Db, ator: Ator): Bootstrap {
  return leitura(db, () => {
    const seq = seqAtual(db)
    const config = lerConfig(db)
    const eu = ator.usuario!.id
    const limite = new Date(agoraData().getTime() - config.quadroConcluidasDias * 86_400_000).toISOString()
    const ativos = `(SELECT id FROM quadro WHERE arquivado_em IS NULL)`
    return {
      seq,
      app: infoApp(),
      config,
      eu: montarEu(db, eu),
      usuarios: usuariosResumo(db),
      equipes: listarEquipes(db),
      clientes: clientesResumo(db),
      quadros: listarQuadros(db, false),
      colunas: todos<Linha>(db, `SELECT * FROM coluna WHERE arquivada_em IS NULL AND quadro_id IN ${ativos} ORDER BY quadro_id, pos`)
        .map(mapear.coluna),
      etiquetas: todos<Linha>(db, `SELECT * FROM etiqueta WHERE quadro_id IN ${ativos} ORDER BY quadro_id, pos`).map(mapear.etiqueta),
      automacoes: todos<Linha>(db, `SELECT * FROM automacao_quadro WHERE quadro_id IN ${ativos} ORDER BY quadro_id, gatilho`)
        .map(mapear.automacao),
      modelosQuadro: modelosQuadro(db),
      modelosDemanda: modelosDemandaAtivos(db),
      feriados: feriadosDoBootstrap(db),
      demandas: carregarDemandas(db, ONDE_BOOTSTRAP, [limite], 'd.quadro_id, d.coluna_id, d.posicao'),
      naoLidas: Number(um<{ n: number }>(db, 'SELECT count(*) AS n FROM notificacao WHERE usuario_id = ? AND lida_em IS NULL', eu)!.n),
    }
  })
}
