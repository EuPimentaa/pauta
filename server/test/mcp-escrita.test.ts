/** F7 · as ferramentas de escrita (API.md §F.5, 7 a 15): caminho feliz, erros como isError e as mesmas regras da API. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { z } from 'zod'
import { um, todos } from '../src/db.ts'
import { observarEntradas } from '../src/servicos/mcp-ferramentas-escrita.ts'
import { ambienteMcp, chamar, conectar } from './mcp-ajuda.ts'

type Amb = Awaited<ReturnType<typeof ambienteMcp>>

function chavesDoEsquema(e: z.ZodType): string[] {
  const shape = (e as unknown as { shape?: Record<string, unknown> }).shape
  return shape ? Object.keys(shape) : []
}

/** Toda entrada montada por entradaDaApi tem só chaves do esquema da rota (o zod da rota descartaria a mais em silêncio). */
function vigiarEntradas(): { fora: string[] } {
  const r = { fora: [] as string[] }
  observarEntradas((entrada, esquema) => {
    const validas = chavesDoEsquema(esquema)
    for (const k of Object.keys(entrada)) if (!validas.includes(k)) r.fora.push(k)
  })
  return r
}

test('criar_demanda: com modelo, cliente, membros, prazo e checklist; a linha de volta; AM e rodadas não entram', async () => {
  const amb = await ambienteMcp()
  const vigia = vigiarEntradas()
  const c = await conectar(amb, amb.pessoas.design)
  const r = await chamar(amb, c.at, 'criar_demanda', {
    titulo: 'Carrossel outubro rosa', quadro: 'Criação', cliente: 'HE', modelo: 'carrossel', membros: ['eu', '@social'],
    etiquetas: ['urgente'], prazo: '2026-10-23', prazoHora: '18:00', checklist: ['Capa', 'Legenda'], prioridade: 'alta',
  })
  assert.equal(r.erro, false, r.texto)
  assert.equal(r.texto, 'Criada #1 «Carrossel outubro rosa» em Criação › Fila · prazo 2026-10-23 (sex) 18:00 · @design @social · http://localhost:5173/d/1')
  const d = um<{ cliente_id: string; prioridade: string; modelo_id: string; origem: string; atendimento_id: string }>(amb.db,
    'SELECT * FROM demanda WHERE numero = 1')!
  assert.equal(d.cliente_id, amb.clientes.he.id)
  assert.equal(d.prioridade, 'alta')
  assert.equal(d.modelo_id, 'md-carrossel')
  assert.equal(d.origem, 'manual')
  assert.equal(d.atendimento_id, amb.pessoas.am.id)
  const itens = todos<{ titulo: string; texto: string }>(amb.db, `SELECT c.titulo, i.texto FROM checklist c JOIN checklist_item i ON i.checklist_id = c.id
    WHERE c.demanda_id = (SELECT id FROM demanda WHERE numero = 1) ORDER BY c.pos, i.pos`)
  assert.ok(itens.some((i) => i.titulo === 'Checklist' && i.texto === 'Legenda'))
  for (const proibido of [{ atendimento: 'pri' }, { rodadasInclusas: 5 }, { atendimentoId: 'x' }]) {
    const x = await chamar(amb, c.at, 'criar_demanda', { titulo: 'X', quadro: 'criacao', ...proibido })
    assert.equal(x.erro, true)
    assert.match(x.texto, /^Parâmetro desconhecido/)
  }
  assert.equal((await chamar(amb, c.at, 'criar_demanda', { quadro: 'criacao' })).texto, 'Mande titulo (uma demanda) ou lote (várias), um dos dois.')
  const longo = await chamar(amb, c.at, 'criar_demanda', { titulo: 'x'.repeat(501), quadro: 'criacao' })
  assert.equal(longo.erro, true)
  const vazio = await chamar(amb, c.at, 'criar_demanda', { titulo: '   ', quadro: 'criacao' })
  assert.equal(vazio.erro, true)
  assert.match(vazio.texto, /titulo/)
  assert.deepEqual(vigia.fora, [])
  observarEntradas(null)
})

test('criar_demanda com lote: todas numa transação (falhou uma, nenhuma fica)', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.am)
  const r = await chamar(amb, c.at, 'criar_demanda', { quadro: 'social', cliente: 'icc', lote: [
    { titulo: 'Post 1', prazo: '2026-11-03' }, { titulo: 'Post 2', prazo: '2026-11-05', publicacao: '2026-11-06', publicacaoHora: '10:00' },
    { titulo: 'Post 3', descricao: 'Texto do 3' },
  ] })
  assert.equal(r.erro, false, r.texto)
  assert.equal(r.texto.split('\n').length, 3)
  assert.match(r.texto, /^Criada #1 «Post 1» em Social › Fila · prazo 2026-11-03 \(ter\)/)
  const falha = await chamar(amb, c.at, 'criar_demanda', { quadro: 'social', lote: [{ titulo: 'Ok' }, { titulo: 'Ruim', prazo: '2026-02-30' }] })
  assert.equal(falha.erro, true)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM demanda')!.n, 3)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM mcp_traco')!.n, 1)
})

test('editar_demanda: rev obrigatório para texto; rev antigo → isError e nada grava; descrição longa; acrescentar', async () => {
  const amb = await ambienteMcp()
  const vigia = vigiarEntradas()
  const d = await amb.criarDemanda({ titulo: 'Post', descricaoMd: 'Original', prazo: '2026-10-24' })
  const c = await conectar(amb, amb.pessoas.design)
  // ler; outra pessoa muda pela tela; o MCP tenta com o rev antigo
  const lido = await chamar(amb, c.at, 'ler_demanda', { numero: d.numero })
  const rev = Number(/rev (\d+)/.exec(lido.texto)![1])
  const tela = await amb.como(amb.pessoas.am).patch(`/api/demandas/${d.id}`, { titulo: 'Post (tela)' }, { ifMatch: rev })
  assert.equal(tela.status, 200)
  const velho = await chamar(amb, c.at, 'editar_demanda', { numero: d.numero, rev, descricao: 'Trocada' })
  assert.equal(velho.erro, true)
  assert.equal(velho.texto, `A demanda mudou desde a sua leitura (rev ${rev} → ${rev + 1}). Leia de novo.`)
  assert.equal(um<{ descricao_md: string }>(amb.db, 'SELECT descricao_md FROM demanda WHERE id = ?', d.id)!.descricao_md, 'Original')
  const semRev = await chamar(amb, c.at, 'editar_demanda', { numero: d.numero, descricao: 'Trocada' })
  assert.equal(semRev.texto, 'Mande o rev de ler_demanda para mudar o título ou a descrição.')

  const r = await chamar(amb, c.at, 'editar_demanda', { numero: d.numero, rev: rev + 1, titulo: 'Post novo', prazo: '2026-10-28',
    membrosEntrar: ['social'], etiquetasPor: ['Urgente'], prioridade: 'alta' })
  assert.equal(r.erro, false, r.texto)
  assert.equal(r.texto, '#1: título «Post (tela)» → «Post novo»; prioridade media → alta; prazo 2026-10-24 → 2026-10-28; +@social; +Urgente · rev 3')
  // sem rev, campos que não são texto passam
  const so = await chamar(amb, c.at, 'editar_demanda', { numero: d.numero, prazo: null, membrosSair: ['social'], etiquetasTirar: ['urgente'] })
  assert.equal(so.texto, '#1: prazo 2026-10-28 → —; −@social; −Urgente · rev 4')

  const longa = await amb.criarDemanda({ titulo: 'Longa', descricaoMd: 'a'.repeat(6000) })
  const l = await chamar(amb, c.at, 'editar_demanda', { numero: longa.numero, rev: longa.rev, descricao: 'curta' })
  assert.equal(l.texto, 'A descrição tem 6000 caracteres e a leitura corta em 4.000: use acrescentarDescricao ou edite pela tela.')
  const mais = await chamar(amb, c.at, 'editar_demanda', { numero: longa.numero, rev: longa.rev, acrescentarDescricao: 'Mais um parágrafo.' })
  assert.equal(mais.erro, false, mais.texto)
  assert.equal(um<{ descricao_md: string }>(amb.db, 'SELECT descricao_md FROM demanda WHERE id = ?', longa.id)!.descricao_md,
    `${'a'.repeat(6000)}\n\nMais um parágrafo.`)
  assert.equal((await chamar(amb, c.at, 'editar_demanda', { numero: d.numero, rev: 4, descricao: 'x', acrescentarDescricao: 'y' })).erro, true)
  assert.equal((await chamar(amb, c.at, 'editar_demanda', { numero: d.numero })).texto, 'Nada para mudar: mande pelo menos um campo.')
  assert.equal((await chamar(amb, c.at, 'editar_demanda', { numero: d.numero, prazo: '2026-13-01' })).erro, true)
  assert.deepEqual(vigia.fora, [])
  observarEntradas(null)
})

test('editar_demanda: cliente fixo depois do envio → isError; trocar o cliente antes troca o AM', async () => {
  const amb = await ambienteMcp()
  const enviada = await amb.criarDemanda({ titulo: 'Enviada', ate: 'enviada' })
  const c = await conectar(amb, amb.pessoas.am)
  const r = await chamar(amb, c.at, 'editar_demanda', { numero: enviada.numero, cliente: 'ICC' })
  assert.equal(r.erro, true)
  assert.equal(r.texto, 'Esta demanda já foi enviada ao cliente. Para outro cliente, copie a demanda.')
  const nova = await amb.criarDemanda({ titulo: 'Nova' })
  const ok = await chamar(amb, c.at, 'editar_demanda', { numero: nova.numero, cliente: 'ICC' })
  assert.equal(ok.texto, `#${nova.numero}: cliente HE → ICC · rev 2`)
  assert.equal(um<{ atendimento_id: string }>(amb.db, 'SELECT atendimento_id FROM demanda WHERE id = ?', nova.id)!.atendimento_id, amb.pessoas.am2.id)
})

test('mover_demanda: outra coluna, outro quadro (etiqueta sem par fica), coluna concluída conclui', async () => {
  const amb = await ambienteMcp()
  const vigia = vigiarEntradas()
  const d = await amb.criarDemanda({ titulo: 'Peça', etiquetaIds: [amb.quadros.criacao.etiquetas.find((e) => e.nome === 'Urgente')!.id] })
  const c = await conectar(amb, amb.pessoas.design)
  assert.equal((await chamar(amb, c.at, 'mover_demanda', { numero: d.numero, coluna: 'pronto' })).texto, '#1 movida para Criação › Pronto')
  assert.equal((await chamar(amb, c.at, 'mover_demanda', { numero: d.numero, coluna: '@design2' })).texto, '#1 movida para Criação › Design2')
  const outro = await chamar(amb, c.at, 'mover_demanda', { numero: d.numero, quadro: 'social', coluna: 'Agendar', posicao: 'topo' })
  assert.equal(outro.texto, '#1 movida para Social › Agendar · ficaram na Criação: Urgente')
  const fim = await chamar(amb, c.at, 'mover_demanda', { numero: d.numero, coluna: 'publicado' })
  assert.equal(fim.texto, '#1 movida para Social › Publicado · concluída')
  const nao = await chamar(amb, c.at, 'mover_demanda', { numero: d.numero, coluna: 'Inexistente' })
  assert.equal(nao.erro, true)
  assert.match(nao.texto, /^Nenhum coluna em social "Inexistente"\. Opções: Fila, Agendar, Publicado\. Use listar\.$/)
  assert.deepEqual(vigia.fora, [])
  observarEntradas(null)
})

test('comentar: @apelido vira menção e notifica "Design via Claude…"; texto acima de 5.000 → isError', async () => {
  const amb = await ambienteMcp()
  const d = await amb.criarDemanda({ titulo: 'Peça' })
  const c = await conectar(amb, amb.pessoas.design)
  const r = await chamar(amb, c.at, 'comentar', { numero: d.numero, texto: 'Pronto, @pri. Olha também @inexistente e e-mail a@b.com' })
  assert.equal(r.texto, 'Comentário em #1 (mencionou @pri)')
  const corpo = um<{ corpo_md: string }>(amb.db, 'SELECT corpo_md FROM comentario')!.corpo_md
  assert.equal(corpo, `Pronto, @[Pri](mencao:${amb.pessoas.am.id}). Olha também @inexistente e e-mail a@b.com`)
  const n = um<{ resumo: string }>(amb.db, "SELECT resumo FROM notificacao WHERE tipo = 'mencao'")!
  assert.match(n.resumo, /^Design via Claude mencionou você em #1 Peça/)
  assert.equal((await chamar(amb, c.at, 'comentar', { numero: d.numero, texto: 'x'.repeat(5001) })).erro, true)
  assert.equal((await chamar(amb, c.at, 'comentar', { numero: d.numero, texto: '' })).erro, true)
})

test('checklist: acrescenta (cria o "Checklist"), marca por referência e por texto, desmarca; rodada só atendimento', async () => {
  const amb = await ambienteMcp()
  const d = await amb.criarDemanda({ titulo: 'Peça' })
  const c = await conectar(amb, amb.pessoas.design)
  let r = await chamar(amb, c.at, 'checklist', { numero: d.numero, acrescentar: ['Capa', 'Legenda', 'Hashtags'] })
  assert.equal(r.texto, '#1\nChecklist 0/3\n[ ] 1.1 Capa\n[ ] 1.2 Legenda\n[ ] 1.3 Hashtags')
  r = await chamar(amb, c.at, 'checklist', { numero: d.numero, marcar: ['1.1', 'legenda'], acrescentar: ['Revisão'] })
  assert.equal(r.texto, '#1\nChecklist 2/4\n[x] 1.1 Capa\n[x] 1.2 Legenda\n[ ] 1.3 Hashtags\n[ ] 1.4 Revisão')
  r = await chamar(amb, c.at, 'checklist', { numero: d.numero, desmarcar: ['capa'] })
  assert.match(r.texto, /\[ \] 1\.1 Capa/)
  assert.equal((await chamar(amb, c.at, 'checklist', { numero: d.numero, marcar: ['9.9'] })).erro, true)
  r = await chamar(amb, c.at, 'checklist', { numero: d.numero, em: 'Entrega', acrescentar: ['Exportar'] })
  assert.match(r.texto, /\nEntrega 0\/1\n\[ \] 2\.1 Exportar$/)
  const amb2 = await chamar(amb, c.at, 'checklist', { numero: d.numero, marcar: ['a'] })
  assert.equal(amb2.erro, true)
  assert.match(amb2.texto, /^Mais de um item com esse texto: /)

  const ajuste = await amb.criarDemanda({ titulo: 'Com ajuste', ate: 'enviada' })
  const am = await conectar(amb, amb.pessoas.am)
  assert.equal((await chamar(amb, am.at, 'registrar_retorno', { numero: ajuste.numero, decisao: 'ajuste', ajustes: ['Trocar a cor'] })).erro, false)
  const negado = await chamar(amb, c.at, 'checklist', { numero: ajuste.numero, em: 'Ajustes R2', acrescentar: ['Mais um'] })
  assert.equal(negado.erro, true)
  assert.match(negado.texto, /atendimento/)
  assert.equal((await chamar(amb, c.at, 'checklist', { numero: ajuste.numero, marcar: ['trocar a cor'] })).erro, false)
  assert.equal((await chamar(amb, c.at, 'checklist', { numero: d.numero, acrescentar: ['x'.repeat(2001)] })).erro, true)
})

test('concluir_demanda: conclui com a próxima da repetição e a automação; reabre', async () => {
  const amb = await ambienteMcp()
  const d = await amb.criarDemanda({ titulo: 'Semanal', prazo: '2026-10-16', repetir: 'semanal' })
  const c = await conectar(amb, amb.pessoas.design)
  const r = await chamar(amb, c.at, 'concluir_demanda', { numero: d.numero })
  assert.equal(r.texto, '#1 concluída · próxima: #2 (semanal, prazo 2026-10-23 (sex))')
  assert.equal((await chamar(amb, c.at, 'concluir_demanda', { numero: d.numero })).texto, '#1 já estava concluída')
  const re = await chamar(amb, c.at, 'concluir_demanda', { numero: d.numero, concluida: false })
  assert.equal(re.texto, '#1 reaberta em Criação › Fila')
})

test('arquivar_demanda: arquiva e restaura (nada apagado)', async () => {
  const amb = await ambienteMcp()
  const d = await amb.criarDemanda({ titulo: 'Peça' })
  const c = await conectar(amb, amb.pessoas.design)
  assert.equal((await chamar(amb, c.at, 'arquivar_demanda', { numero: d.numero })).texto, '#1 arquivada')
  assert.equal((await chamar(amb, c.at, 'arquivar_demanda', { numero: d.numero })).texto, '#1 já estava arquivada')
  assert.equal((await chamar(amb, c.at, 'editar_demanda', { numero: d.numero, prazo: '2026-10-30' })).texto, 'Demanda arquivada. Restaure para editar.')
  assert.equal((await chamar(amb, c.at, 'arquivar_demanda', { numero: d.numero, arquivar: false })).texto, '#1 restaurada em Criação › Fila')
})

test('lancar_horas: as próprias, nunca no futuro, até 720 min e nota até 500', async () => {
  const amb = await ambienteMcp()
  const d = await amb.criarDemanda({ titulo: 'Peça' })
  const c = await conectar(amb, amb.pessoas.design)
  assert.equal((await chamar(amb, c.at, 'lancar_horas', { numero: d.numero, minutos: 90, nota: 'Layout' })).texto,
    'Lançado 1h30 em #1 em 2026-10-14 · seu total nela: 1h30')
  assert.equal((await chamar(amb, c.at, 'lancar_horas', { numero: d.numero, minutos: 150, data: '2026-10-13' })).texto,
    'Lançado 2h30 em #1 em 2026-10-13 · seu total nela: 4h')
  assert.equal((await chamar(amb, c.at, 'lancar_horas', { numero: d.numero, minutos: 30, data: '2026-10-15' })).texto, 'Não dá para lançar horas no futuro.')
  assert.equal((await chamar(amb, c.at, 'lancar_horas', { numero: d.numero, minutos: 721 })).erro, true)
  assert.equal((await chamar(amb, c.at, 'lancar_horas', { numero: d.numero, minutos: 30, nota: 'x'.repeat(501) })).erro, true)
  const a = todos<{ usuario_id: string }>(amb.db, 'SELECT usuario_id FROM apontamento')
  assert.ok(a.every((x) => x.usuario_id === amb.pessoas.design.id))
})

test('registrar_retorno: só atendimento e admin; aprovado com a automação; ajuste com itens e contato pelo nome', async () => {
  const amb = await ambienteMcp()
  const vigia = vigiarEntradas()
  const d = await amb.criarDemanda({ titulo: 'Arte', ate: 'enviada' })
  const equipe = await conectar(amb, amb.pessoas.design)
  const r = await chamar(amb, equipe.at, 'registrar_retorno', { numero: d.numero, decisao: 'aprovado' })
  assert.equal(r.erro, true)
  assert.equal(r.texto, 'Só o atendimento registra o retorno.')
  const am = await conectar(amb, amb.pessoas.am)
  const ok = await chamar(amb, am.at, 'registrar_retorno', { numero: d.numero, decisao: 'aprovado', contato: 'fulana' })
  assert.equal(ok.erro, false, ok.texto)
  assert.equal(ok.texto, 'Aprovada a V1 de #1 (Fulana, WhatsApp) · movida para Social › Agendar')
  assert.equal((await chamar(amb, am.at, 'registrar_retorno', { numero: d.numero, decisao: 'aprovado' })).texto, 'Nada aguardando o cliente.')

  const e = await amb.criarDemanda({ titulo: 'Outra arte', ate: 'enviada' })
  assert.equal((await chamar(amb, am.at, 'registrar_retorno', { numero: e.numero, decisao: 'ajuste' })).texto,
    'No ajuste, mande os itens em ajustes (um por item).')
  const aj = await chamar(amb, am.at, 'registrar_retorno', { numero: e.numero, decisao: 'ajuste', ajustes: ['Trocar a foto', 'Aumentar o logo'],
    canal: 'email', prazo: '2026-10-20', motivo: 'cliente_mudou' })
  assert.equal(aj.texto, 'Ajuste na V1 de #2 (Fulana, e-mail): rodada 2 com 2 itens, prazo 2026-10-20 (ter) · R2 de 2 inclusas')
  const ninguem = await chamar(amb, am.at, 'registrar_retorno', { numero: e.numero, decisao: 'aprovado', contato: 'Beltrana' })
  assert.match(ninguem.texto, /^Nenhum contato "Beltrana"\. Contatos: Fulana\.$/)
  assert.deepEqual(vigia.fora, [])
  observarEntradas(null)
})

test('nomes ambíguos e inexistentes → isError com até 8 opções', async () => {
  const amb = await ambienteMcp()
  const c = await conectar(amb, amb.pessoas.admin)
  const r = await chamar(amb, c.at, 'criar_demanda', { titulo: 'X', quadro: 'criacao', cliente: 'HOSP' })
  assert.equal(r.erro, true)
  assert.equal(r.texto, 'Nenhum cliente "HOSP". Opções: HE, ICC. Use listar.')
  const m = await chamar(amb, c.at, 'criar_demanda', { titulo: 'X', quadro: 'criacao', modelo: 'inexistente' })
  assert.match(m.texto, /^Nenhum modelo "inexistente"\. Opções: Post, Carrossel, Reels, Stories, Vídeo, Site ou landing page, Ajuste de site, Relatório…\. Use listar\.$/)
  assert.equal(um<{ n: number }>(amb.db, 'SELECT count(*) AS n FROM demanda')!.n, 0)
})
