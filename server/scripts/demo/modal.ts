/**
 * Dados de demonstração do modal (F1), depois das demandas do núcleo: em 14 demandas abertas da Criação, um briefing
 * em Markdown (com @menção), o checklist "Entrega" com parte dos itens feitos, a pasta do Drive, o caminho da pasta
 * de saída (M:\…) e uma conversa curta com @menção. Uma delas guarda o texto original colado do WhatsApp.
 * Tudo pelos serviços (eventos, atividade e notificações como na tela); no fim o sino fica com no máximo 5 não lidas.
 */
import type { Demanda, Id } from '../../../shared/tipos/index.ts'
import { atorDe, type Ator } from '../../src/auth.ts'
import { agora, rodar, todos, type Db } from '../../src/db.ts'
import { atualizarDemanda, atualizarLinhaDemanda, carregarDemandas } from '../../src/servicos/demandas.ts'
import { criarAnexo } from '../../src/servicos/modal-anexos.ts'
import { criarChecklist, editarItem } from '../../src/servicos/modal-checklists.ts'
import { criarComentario } from '../../src/servicos/modal-comentarios.ts'
import type { ContextoDemo } from '../seed-demo.ts'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const ITENS = ['Arte principal', 'Versão para stories', 'Legenda com CTA', 'Revisão do atendimento', 'Exportar em PNG e PDF']

const mencao = (u: { id: string; apelido: string | null; nome: string }) => `@[${u.apelido ?? u.nome.split(' ')[0]}](mencao:${u.id})`

function briefing(d: Demanda, sigla: string, quem: { id: string; apelido: string | null; nome: string }): string {
  return [
    '## Objetivo',
    `Divulgar **${d.titulo.toLowerCase()}** nas redes do cliente ${sigla}, com foco em quem já segue a marca.`,
    '',
    '## O que entregar',
    '- 1 arte para o feed (1080 × 1350)',
    '- 1 versão para stories (1080 × 1920)',
    '- Legenda curta, com a data em destaque',
    '',
    '## Referências',
    '> Usar a paleta da última campanha e a foto aprovada em setembro.',
    '',
    `Dúvidas sobre o tom: ${mencao(quem)}.`,
  ].join('\n')
}

/** No máximo `max` notificações não lidas por pessoa (as mais antigas viram lidas). */
function limitarSino(db: Db, max: number): void {
  const pessoas = todos<{ usuario_id: string; n: number }>(db,
    'SELECT usuario_id, count(*) AS n FROM notificacao WHERE lida_em IS NULL GROUP BY usuario_id HAVING n > ?', max)
  for (const p of pessoas) {
    rodar(db, `UPDATE notificacao SET lida_em = ? WHERE usuario_id = ? AND lida_em IS NULL AND id NOT IN (
      SELECT id FROM notificacao WHERE usuario_id = ? AND lida_em IS NULL ORDER BY id DESC LIMIT ?)`, agora(), p.usuario_id, p.usuario_id, max)
  }
}

export function semear(ctx: ContextoDemo): void {
  const { db, pessoas, quadros } = ctx
  const criacao = quadros.criacao.quadro.id
  const clientes = new Map(Object.values(ctx.clientes).map((c) => [c.id, c]))
  const porId = new Map(Object.values(pessoas).map((p) => [p.id, p]))
  const ator = (id: Id | null | undefined, padrao: Ator): Ator => (id && porId.get(id) ? atorDe(porId.get(id)!) : padrao)
  const demandas = carregarDemandas(db,
    'd.quadro_id = ? AND d.arquivado_em IS NULL AND d.concluida_em IS NULL AND d.envio_pendente_em IS NULL AND d.cliente_id IS NOT NULL',
    [criacao], 'd.numero').slice(0, 14)
  const mes = MESES[Number(agora().slice(5, 7)) - 1]!

  demandas.forEach((d, i) => {
    const cliente = clientes.get(d.clienteId!)!
    const am = ator(d.atendimentoId, atorDe(pessoas.am))
    const designer = ator(d.membroIds[0], atorDe(pessoas.design))
    const designerU = designer.usuario!

    atualizarDemanda(db, d.id, { descricaoMd: briefing(d, cliente.sigla, am.usuario!) }, am, { semPermissao: true })
    const c = criarChecklist(db, d.id, { titulo: 'Entrega', itens: ITENS.slice(0, 3 + (i % 3)) }, designer)
    c.itens.slice(0, i % 4).forEach((item) => editarItem(db, item.id, { feito: true }, designer))
    criarAnexo(db, d.id, { tipo: 'link', url: `https://drive.google.com/drive/folders/demo-${cliente.sigla.toLowerCase()}-${d.numero}`,
      nome: `Pasta ${cliente.sigla} no Drive` }, am)
    criarAnexo(db, d.id, { tipo: 'caminho', caminho: `M:\\Clientes\\${cliente.sigla}\\2026\\${mes}\\#${d.numero} ${d.titulo}` }, designer)
    if (i % 3 === 0) {
      criarAnexo(db, d.id, { tipo: 'link', url: 'https://www.figma.com/file/demo-layout/Layout', nome: 'Layout no Figma' }, designer)
    }
    criarComentario(db, d.id, { corpoMd: `${mencao(designerU)}, o cliente pediu para destacar a data no topo da arte.` }, am)
    if (i % 2 === 0) {
      criarComentario(db, d.id, { corpoMd: `Combinado. Subo a primeira versão até amanhã cedo, ${mencao(am.usuario!)}.` }, designer)
    }
    if (i === 0) {
      atualizarLinhaDemanda(db, d.id, {
        origem_texto: `[14/10 15:32] ${cliente.nome}: Oi! Precisamos de um post sobre ${d.titulo.toLowerCase()} para sexta.\n`
          + `[14/10 15:33] ${cliente.nome}: Pode usar as fotos que mandei semana passada.`,
      }, am)
    }
  })
  limitarSino(db, 5)
}
