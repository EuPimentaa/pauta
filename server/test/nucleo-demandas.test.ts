/** Demandas (API.md §4.12): criar, detalhe, PATCH com If-Match, membros, etiquetas, arquivar, restaurar, excluir. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rodar, todos, um } from '../src/db.ts'
import { ambiente, eventos, notificacoesDe, ultimoSeq } from './ajuda.ts'

describe('criar', () => {
  test('com o modelo Post: descrição, checklist de 4 itens, prazo em 2 dias úteis pulando fim de semana e feriado', async () => {
    const a = await ambiente()
    a.relogio('2026-10-09T13:00:00.000Z')
    rodar(a.db, "INSERT INTO modelo_demanda_etiqueta (modelo_id, nome, cor) VALUES ('md-post', 'Feed', 'turquesa'), ('md-post', 'urgente', 'rosa')")
    const seq = ultimoSeq(a.db)
    const r = await a.como(a.pessoas.am).post('/api/demandas', { quadroId: a.quadros.criacao.quadro.id, titulo: 'Post Dia das Crianças',
      modeloId: 'md-post', clienteId: a.clientes.he.id })
    assert.equal(r.status, 201)
    const d = r.corpo.demanda
    assert.equal(d.prazo, '2026-10-14')
    assert.equal(d.prazoHora, null)
    assert.equal(d.nCheckTotal, 4)
    assert.equal(d.estimativaMin, 60)
    assert.equal(d.colunaId, a.coluna('criacao', 'Fila').id)
    assert.equal(d.atendimentoId, a.pessoas.am.id)
    assert.equal(d.origem, 'manual')
    const det = await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)
    assert.match(det.corpo.descricaoMd, /^## Objetivo/)
    assert.equal(det.corpo.checklists[0].titulo, 'Checklist')
    assert.equal(det.corpo.checklists[0].itens.length, 4)
    assert.equal(det.corpo.rodadas.length, 1)
    assert.equal(det.corpo.rodadas[0].prazo, '2026-10-14')
    // "urgente" casa com "Urgente" do quadro; "Feed" não tem par: é criada no quadro
    const nomes = todos<{ nome: string }>(a.db, `SELECT e.nome FROM demanda_etiqueta de JOIN etiqueta e ON e.id = de.etiqueta_id
      WHERE de.demanda_id = ? ORDER BY e.pos`, d.id).map((l) => l.nome)
    assert.deepEqual(nomes, ['Urgente', 'Feed'])
    const evs = eventos(a.db, seq)
    const iDemanda = evs.findIndex((e) => e.entidade === 'demanda')
    assert.ok(evs.findIndex((e) => e.entidade === 'etiqueta') < iDemanda)
    assert.equal(evs[iDemanda]!.campos, null)
    for (const e of ['rodada', 'checklist', 'checklist_item']) assert.ok(evs.some((x) => x.entidade === e), e)
  })

  test('números sequenciais sem repetir em 20 criações concorrentes', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      eu.post('/api/demandas', { quadroId: a.quadros.criacao.quadro.id, titulo: `Demanda ${i}` })))
    const numeros = rs.map((r) => r.corpo.demanda.numero).sort((x, y) => x - y)
    assert.deepEqual(numeros, Array.from({ length: 20 }, (_, i) => i + 1))
  })

  test('validação, permissão e lugar', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    const q = a.quadros.criacao.quadro.id
    const n = await eu.post('/api/demandas', { quadroId: q, titulo: 'X', atendimentoId: a.pessoas.am.id })
    assert.equal(n.status, 403)
    assert.equal(n.corpo.erro.codigo, 'campo_nao_permitido')
    assert.equal((await eu.post('/api/demandas', { quadroId: q, titulo: 'X', rodadasInclusas: 5 })).status, 403)
    assert.equal((await eu.post('/api/demandas', { quadroId: q, titulo: 'X', colunaId: a.coluna('social', 'Fila').id })).status, 400)
    assert.equal((await eu.post('/api/demandas', { quadroId: 'nada', titulo: 'X' })).status, 400)
    assert.equal((await eu.post('/api/demandas', { quadroId: q, titulo: '   ' })).status, 400)
    assert.equal((await eu.post('/api/demandas', { quadroId: q, titulo: 'X', repetir: 'semanal' })).status, 400)
    assert.equal((await eu.post('/api/demandas', { quadroId: q, titulo: 'X', inicio: '2026-10-20', prazo: '2026-10-15' })).status, 400)
    assert.equal((await eu.post('/api/demandas', { quadroId: q, titulo: 'X', prazo: '2026-02-30' })).status, 400)
    assert.equal((await eu.post('/api/demandas', { quadroId: q, titulo: 'X', membroIds: ['nada'] })).status, 400)
    assert.equal((await eu.post('/api/demandas', { quadroId: q, titulo: 'X', etiquetaIds: [a.quadros.social.etiquetas[0]!.id] })).status, 400)
    assert.equal((await eu.post('/api/demandas', { quadroId: q, titulo: 'X', modeloId: 'md-nada' })).status, 404)
    assert.equal((await eu.post('/api/demandas', { quadroId: q, titulo: 'X', links: [{ tipo: 'link', url: 'http://x.org' }] })).status, 400)
    const vazio = await a.como(a.pessoas.admin).post('/api/quadros', { nome: 'Vazio' })
    const v = await eu.post('/api/demandas', { quadroId: vazio.corpo.quadro.id, titulo: 'X' })
    assert.equal(v.status, 422)
    assert.equal(v.corpo.erro.mensagem, 'Crie uma coluna antes.')
    await a.como(a.pessoas.admin).post(`/api/quadros/${vazio.corpo.quadro.id}/arquivar`)
    assert.equal((await eu.post('/api/demandas', { quadroId: vazio.corpo.quadro.id, titulo: 'X' })).status, 422)
    // atendimento pode mandar os campos dele
    const am = await a.como(a.pessoas.am).post('/api/demandas', { quadroId: q, titulo: 'X', atendimentoId: a.pessoas.am2.id, rodadasInclusas: 4 })
    assert.equal(am.status, 201)
    assert.equal(am.corpo.demanda.rodadasInclusas, 4)
  })

  test('na coluna do Design: design entra como membro; nasce concluída numa coluna concluida; links viram anexos', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    const r = await eu.post('/api/demandas', { quadroId: a.quadros.criacao.quadro.id, colunaId: a.coluna('criacao', 'Design').id,
      titulo: 'Banner', membroIds: [a.pessoas.design.id, a.pessoas.design.id],
      links: [{ tipo: 'link', url: 'https://drive.google.com/drive/folders/abc' }, { tipo: 'caminho', caminho: 'M:\\CLIENTES\\HE\\SAÍDA' }] })
    assert.deepEqual(r.corpo.demanda.membroIds, [a.pessoas.design.id])
    assert.equal(r.corpo.demanda.nAnexos, 2)
    const det = await eu.get(`/api/demandas/${r.corpo.demanda.numero}`)
    assert.deepEqual(det.corpo.anexos.map((x: { provedor: string; nome: string }) => [x.provedor, x.nome]), [['drive', 'https://drive.google.com/drive/folders/abc'], ['rede', 'SAÍDA']])
    // notifica membro uma vez só
    assert.equal(notificacoesDe(a.db, a.pessoas.design.id).filter((n) => n.tipo === 'membro').length, 1)
    const c = await eu.post('/api/demandas', { quadroId: a.quadros.criacao.quadro.id, colunaId: a.coluna('criacao', 'Concluído').id, titulo: 'Feito' })
    assert.ok(c.corpo.demanda.concluidaEm)
  })

  test('notifica membro (nunca o ator) e chegou só quando nenhum membro é da equipe do quadro; menções da descrição', async () => {
    const a = await ambiente()
    const q = a.quadros.criacao.quadro.id
    await a.como(a.pessoas.web).put(`/api/quadros/${q}/seguir`, { seguindo: true })
    // membro da equipe Criação: os seguidores não recebem chegou
    await a.como(a.pessoas.am).post('/api/demandas', { quadroId: q, titulo: 'A', membroIds: [a.pessoas.design2.id, a.pessoas.am.id] })
    assert.deepEqual(notificacoesDe(a.db, a.pessoas.design2.id).map((n) => n.tipo), ['membro'])
    assert.equal(notificacoesDe(a.db, a.pessoas.am.id).length, 0)
    assert.equal(notificacoesDe(a.db, a.pessoas.web.id).length, 0)
    // sem ninguém da equipe: chegou aos seguidores (design e design2 seguem a Criação; o web também)
    await a.como(a.pessoas.am).post('/api/demandas', { quadroId: q, titulo: 'B', membroIds: [a.pessoas.social.id],
      descricaoMd: 'oi @[Web](mencao:' + a.pessoas.web.id + ') e @[Social](mencao:' + a.pessoas.social.id + ') e @[X](mencao:nao-existe)' })
    assert.deepEqual(notificacoesDe(a.db, a.pessoas.web.id).map((n) => n.tipo), ['chegou'])
    assert.deepEqual(notificacoesDe(a.db, a.pessoas.social.id).map((n) => n.tipo), ['membro'])
    assert.deepEqual(notificacoesDe(a.db, a.pessoas.design.id).map((n) => n.tipo), ['chegou'])
    // menção sem ser membro nem seguidor
    await a.como(a.pessoas.am).post('/api/demandas', { quadroId: a.quadros.social.quadro.id, titulo: 'C', membroIds: [a.pessoas.social.id],
      descricaoMd: `@[Gabi](mencao:${a.pessoas.am2.id})` })
    assert.deepEqual(notificacoesDe(a.db, a.pessoas.am2.id).map((n) => n.tipo), ['mencao'])
    const ev = todos<{ publico: string; usuario_id: string }>(a.db, "SELECT publico, usuario_id FROM evento WHERE entidade = 'notificacao'")
    assert.ok(ev.every((e) => e.publico === 'usuario' && e.usuario_id))
  })

  test('avisos: senha no texto e passar do WIP (não bloqueiam)', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    await eu.patch(`/api/colunas/${a.coluna('criacao', 'Fila').id}`, { limiteWip: 1 })
    const q = a.quadros.criacao.quadro.id
    assert.deepEqual((await eu.post('/api/demandas', { quadroId: q, titulo: 'A' })).corpo.avisos, [])
    const r = await eu.post('/api/demandas', { quadroId: q, titulo: 'B', descricaoMd: 'login: he / senha: Abc@12345' })
    assert.deepEqual(r.corpo.avisos.sort(), ['limite_wip', 'senha_detectada'])
  })
})

describe('detalhe', () => {
  test('uma ida com quadro, coluna, rodadas, versões, envios e links só para gestão; excluída → 404', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'aprovada' })
    rodar(a.db, `INSERT INTO link_publico (id, token_hash, token_cifrado, cliente_id, expira_em, criado_por, criado_em)
                 VALUES ('lnk', 'h', 'c', ?, '2026-11-14T13:00:00.000Z', ?, '2026-10-14T13:00:00.000Z')`, a.clientes.he.id, a.pessoas.am.id)
    rodar(a.db, "INSERT INTO link_publico_item (link_id, demanda_id, pos) VALUES ('lnk', ?, 1024)", d.id)
    const am = await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)
    assert.equal(am.status, 200)
    assert.equal(am.corpo.quadro.id, a.quadros.criacao.quadro.id)
    assert.equal(am.corpo.coluna.nome, 'Fila')
    assert.equal(am.corpo.versoes.length, 1)
    assert.equal(am.corpo.versoes[0].itens[0].provedor, 'drive')
    assert.equal(am.corpo.envios.length, 1)
    assert.equal(am.corpo.aprovacoes[0].decisao, 'aprovado')
    assert.equal(am.corpo.linksPublicos.length, 1)
    assert.deepEqual(am.corpo.linksPublicos[0].demandaIds, [d.id])
    assert.equal(am.corpo.linksPublicos[0].ativo, true)
    assert.equal(am.corpo.movimentos.length, 1)
    assert.deepEqual(am.corpo.tempo, { totalMin: 0, meusMin: 0 })
    const equipe = await a.como(a.pessoas.design).get(`/api/demandas/${d.numero}`)
    assert.deepEqual(equipe.corpo.linksPublicos, [])
    assert.equal((await a.como(a.pessoas.design).get('/api/demandas/999')).status, 404)
    assert.equal((await a.como(a.pessoas.design).get('/api/demandas/abc')).status, 400)
  })
})

describe('PATCH com If-Match', () => {
  test('rev velho → 409 com atual.descricaoMd; sem If-Match → 400; rev sobe só com os campos do PATCH', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ descricaoMd: 'texto original' })
    const eu = a.como(a.pessoas.design)
    assert.equal((await eu.patch(`/api/demandas/${d.id}`, { titulo: 'X' })).status, 400)
    const ok = await eu.patch(`/api/demandas/${d.id}`, { titulo: 'Título novo' }, { ifMatch: d.rev })
    assert.equal(ok.status, 200)
    assert.equal(ok.corpo.demanda.rev, d.rev + 1)
    const velho = await eu.patch(`/api/demandas/${d.id}`, { titulo: 'Outro' }, { ifMatch: d.rev })
    assert.equal(velho.status, 409)
    assert.equal(velho.corpo.erro.codigo, 'conflito_rev')
    assert.equal(velho.corpo.erro.detalhes.atual.descricaoMd, 'texto original')
    assert.equal(velho.corpo.erro.detalhes.atual.demanda.titulo, 'Título novo')
    // arrastar, membro e etiqueta não mudam o rev
    const rev = ok.corpo.demanda.rev
    await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Pronto').id })
    await eu.post(`/api/demandas/${d.id}/membros`, { usuarioId: a.pessoas.design.id })
    await eu.post(`/api/demandas/${d.id}/etiquetas`, { etiquetaId: a.quadros.criacao.etiquetas[0]!.id })
    await eu.post(`/api/demandas/${d.id}/concluir`, { concluida: true })
    assert.equal(um<{ rev: number }>(a.db, 'SELECT rev FROM demanda WHERE id = ?', d.id)!.rev, rev)
    assert.equal((await eu.patch(`/api/demandas/${d.id}`, { prioridade: 'alta' }, { ifMatch: rev })).status, 200)
  })

  test('equipe mandando atendimentoId → 403; descrição: menções novas notificam e o evento leva descricaoAtualizadaEm', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ descricaoMd: `oi @[Web](mencao:${a.pessoas.web.id})` })
    const eu = a.como(a.pessoas.design)
    assert.equal((await eu.patch(`/api/demandas/${d.id}`, { atendimentoId: null }, { ifMatch: d.rev })).corpo.erro.codigo, 'campo_nao_permitido')
    const seq = ultimoSeq(a.db)
    const r = await eu.patch(`/api/demandas/${d.id}`, {
      descricaoMd: `oi @[Web](mencao:${a.pessoas.web.id}) e @[Gabi](mencao:${a.pessoas.am2.id}) senha: Xy@12345` }, { ifMatch: d.rev })
    assert.equal(r.status, 200)
    assert.deepEqual(r.corpo.avisos, ['senha_detectada'])
    assert.deepEqual(notificacoesDe(a.db, a.pessoas.am2.id).map((n) => n.tipo), ['mencao'])
    assert.deepEqual(notificacoesDe(a.db, a.pessoas.web.id).map((n) => n.tipo), ['mencao'])
    const ev = eventos(a.db, seq).find((e) => e.entidade === 'demanda')!
    assert.ok(ev.campos!.includes('descricaoAtualizadaEm'))
    assert.ok(!('descricaoMd' in ev.patch!))
    const atv = um<{ dados: string; antes: string }>(a.db, "SELECT dados, antes FROM atividade WHERE tipo = 'demanda.editada' AND demanda_id = ?", d.id)!
    assert.deepEqual(JSON.parse(atv.dados).campos, ['descricaoMd'])
    assert.match(JSON.parse(atv.antes).descricaoMd, /^oi/)
  })

  test('descrição: menção a pessoa inativa ou inexistente vira texto (ao criar e editar) e não notifica depois de reativar', async () => {
    const a = await ambiente()
    const theo = a.pessoas.web
    rodar(a.db, 'UPDATE usuario SET ativo = 0 WHERE id = ?', theo.id)
    const fantasma = '00000000-0000-4000-8000-000000000000'
    const am = a.como(a.pessoas.am)
    const criada = await am.post('/api/demandas', {
      quadroId: a.quadros.criacao.quadro.id, titulo: 'Menções inativas',
      descricaoMd: `desc @[Theo](mencao:${theo.id}) @[Fantasma](mencao:${fantasma}) @[Gabi](mencao:${a.pessoas.am2.id})`,
    })
    assert.equal(criada.status, 201)
    const d = criada.corpo.demanda
    const desc = () => um<{ m: string }>(a.db, 'SELECT descricao_md AS m FROM demanda WHERE id = ?', d.id)!.m
    assert.equal(desc(), `desc @Theo @Fantasma @[Gabi](mencao:${a.pessoas.am2.id})`)
    const r = await am.patch(`/api/demandas/${d.id}`, { descricaoMd: `${desc()} e @[Theo](mencao:${theo.id}) de novo` }, { ifMatch: d.rev })
    assert.equal(r.status, 200)
    assert.equal(desc(), `desc @Theo @Fantasma @[Gabi](mencao:${a.pessoas.am2.id}) e @Theo de novo`)
    // reativado, uma edição qualquer do fim não o menciona em nome de quem editou
    rodar(a.db, 'UPDATE usuario SET ativo = 1 WHERE id = ?', theo.id)
    const r2 = await am.patch(`/api/demandas/${d.id}`, { descricaoMd: `${desc()}.` }, { ifMatch: r.corpo.demanda.rev })
    assert.equal(r2.status, 200)
    assert.deepEqual(notificacoesDe(a.db, theo.id).map((n) => n.tipo), [])
  })

  test('trocar o cliente troca o AM só quando era o do cliente antigo, e leva as horas; com versão enviada → 409', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    rodar(a.db, `INSERT INTO apontamento (id, usuario_id, demanda_id, cliente_id, data, minutos, origem, criado_em, atualizado_em)
                 VALUES ('ap', ?, ?, ?, '2026-10-14', 30, 'manual', '2026-10-14T13:00:00.000Z', '2026-10-14T13:00:00.000Z')`,
    a.pessoas.design.id, d.id, a.clientes.he.id)
    const am = a.como(a.pessoas.am)
    let r = await am.patch(`/api/demandas/${d.id}`, { clienteId: a.clientes.icc.id }, { ifMatch: d.rev })
    assert.equal(r.corpo.demanda.atendimentoId, a.pessoas.am2.id)
    assert.equal(um<{ c: string }>(a.db, "SELECT cliente_id AS c FROM apontamento WHERE id = 'ap'")!.c, a.clientes.icc.id)
    r = await am.patch(`/api/demandas/${d.id}`, { atendimentoId: a.pessoas.admin.id }, { ifMatch: r.corpo.demanda.rev })
    r = await am.patch(`/api/demandas/${d.id}`, { clienteId: a.clientes.he.id }, { ifMatch: r.corpo.demanda.rev })
    assert.equal(r.corpo.demanda.atendimentoId, a.pessoas.admin.id)
    const enviada = await a.criarDemanda({ ate: 'enviada' })
    const x = await am.patch(`/api/demandas/${enviada.id}`, { clienteId: a.clientes.icc.id }, { ifMatch: enviada.rev })
    assert.equal(x.status, 409)
    assert.equal(x.corpo.erro.mensagem, 'Esta demanda já foi enviada ao cliente. Para outro cliente, copie a demanda.')
    assert.equal((await am.patch(`/api/demandas/${enviada.id}`, { clienteId: null }, { ifMatch: enviada.rev })).status, 409)
  })

  test('capa: PDF → 400, imagem desta demanda ok e limpa a cor; repetir sem prazo → 400; prazo acompanha a rodada', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ capaCor: 'azul' })
    for (const [id, mime] of [['pdf', 'application/pdf'], ['png', 'image/png']]) {
      rodar(a.db, `INSERT INTO arquivo (id, nome, mime, bytes, sha256, enviado_por, criado_em) VALUES (?, ?, ?, 10, 'x', ?, '2026-10-14T13:00:00.000Z')`,
        id, `a.${id}`, mime, a.pessoas.design.id)
      rodar(a.db, `INSERT INTO anexo (id, demanda_id, tipo, nome, arquivo_id, provedor, pos, criado_em)
                   VALUES (?, ?, 'arquivo', 'a', ?, 'arquivo', 1, '2026-10-14T13:00:00.000Z')`, `anexo-${id}`, d.id, id)
    }
    const eu = a.como(a.pessoas.design)
    assert.equal((await eu.patch(`/api/demandas/${d.id}`, { capaAnexoId: 'anexo-pdf' }, { ifMatch: d.rev })).status, 400)
    const r = await eu.patch(`/api/demandas/${d.id}`, { capaAnexoId: 'anexo-png' }, { ifMatch: d.rev })
    assert.equal(r.status, 200)
    assert.equal(r.corpo.demanda.capaCor, null)
    assert.equal(r.corpo.demanda.capaUrl, '/api/arquivos/png?inline=1')
    const c = await eu.patch(`/api/demandas/${d.id}`, { capaCor: 'rosa' }, { ifMatch: r.corpo.demanda.rev })
    assert.equal(c.corpo.demanda.capaAnexoId, null)
    assert.equal((await eu.patch(`/api/demandas/${d.id}`, { repetir: 'semanal' }, { ifMatch: c.corpo.demanda.rev })).status, 400)
    const p = await eu.patch(`/api/demandas/${d.id}`, { prazo: '2026-10-20', prazoHora: '15:00', repetir: 'semanal' }, { ifMatch: c.corpo.demanda.rev })
    assert.equal(p.status, 200)
    const rod = um<{ prazo: string; prazo_hora: string; prazo_original: string | null }>(a.db,
      'SELECT prazo, prazo_hora, prazo_original FROM rodada WHERE demanda_id = ? AND numero = 1', d.id)!
    assert.deepEqual({ ...rod }, { prazo: '2026-10-20', prazo_hora: '15:00', prazo_original: null })
    const sem = await eu.patch(`/api/demandas/${d.id}`, { prazo: null, repetir: 'nenhuma' }, { ifMatch: p.corpo.demanda.rev })
    assert.equal(sem.corpo.demanda.prazoHora, null)
  })

  test('arquivada não se edita (422); inexistente → 404', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/arquivar`)
    assert.equal((await a.como(a.pessoas.am).patch(`/api/demandas/${d.id}`, { titulo: 'X' }, { ifMatch: d.rev })).status, 422)
    assert.equal((await a.como(a.pessoas.am).patch('/api/demandas/nada', { titulo: 'X' }, { ifMatch: 1 })).status, 404)
  })
})

describe('membros e etiquetas', () => {
  test('membros: idempotentes, inativo → 400, notifica quem entrou (não a si mesmo)', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const eu = a.como(a.pessoas.design)
    const r = await eu.post(`/api/demandas/${d.id}/membros`, { usuarioId: a.pessoas.design.id })
    assert.deepEqual(r.corpo.demanda.membroIds, [a.pessoas.design.id])
    const membro = (id: string) => notificacoesDe(a.db, id).filter((n) => n.tipo === 'membro').length
    assert.equal(membro(a.pessoas.design.id), 0)
    await eu.post(`/api/demandas/${d.id}/membros`, { usuarioId: a.pessoas.design2.id })
    await eu.post(`/api/demandas/${d.id}/membros`, { usuarioId: a.pessoas.design2.id })
    assert.equal(membro(a.pessoas.design2.id), 1)
    const fora = await eu.del(`/api/demandas/${d.id}/membros/${a.pessoas.design.id}`)
    assert.deepEqual(fora.corpo.demanda.membroIds, [a.pessoas.design2.id])
    assert.equal((await eu.del(`/api/demandas/${d.id}/membros/${a.pessoas.design.id}`)).status, 200)
    await a.como(a.pessoas.admin).patch(`/api/pessoas/${a.pessoas.web.id}`, { ativo: false })
    assert.equal((await eu.post(`/api/demandas/${d.id}/membros`, { usuarioId: a.pessoas.web.id })).status, 400)
    const tipos = todos<{ tipo: string }>(a.db, "SELECT tipo FROM atividade WHERE demanda_id = ? AND tipo LIKE 'demanda.membro%'", d.id)
    assert.equal(tipos.length, 3)
  })

  test('etiquetas: do quadro da demanda; outra → 400; idempotentes; evento com etiquetaIds', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda()
    const eu = a.como(a.pessoas.design)
    const [urgente, alteracao] = a.quadros.criacao.etiquetas
    await eu.post(`/api/demandas/${d.id}/etiquetas`, { etiquetaId: alteracao!.id })
    const seq = ultimoSeq(a.db)
    const r = await eu.post(`/api/demandas/${d.id}/etiquetas`, { etiquetaId: urgente!.id })
    assert.deepEqual(r.corpo.demanda.etiquetaIds, [urgente!.id, alteracao!.id])
    assert.deepEqual(eventos(a.db, seq)[0]!.patch!.etiquetaIds, [urgente!.id, alteracao!.id])
    assert.equal((await eu.post(`/api/demandas/${d.id}/etiquetas`, { etiquetaId: urgente!.id })).status, 200)
    assert.equal((await eu.post(`/api/demandas/${d.id}/etiquetas`, { etiquetaId: a.quadros.social.etiquetas[0]!.id })).status, 400)
    const fora = await eu.del(`/api/demandas/${d.id}/etiquetas/${urgente!.id}`)
    assert.deepEqual(fora.corpo.demanda.etiquetaIds, [alteracao!.id])
  })
})

describe('arquivar, restaurar e excluir', () => {
  test('arquivar para o cronômetro; restaurar emite o objeto inteiro e escolhe outra coluna se a de antes foi arquivada', async () => {
    const a = await ambiente()
    const pronto = a.coluna('criacao', 'Pronto')
    const d = await a.criarDemanda({ colunaId: pronto.id })
    rodar(a.db, `INSERT INTO apontamento (id, usuario_id, demanda_id, data, iniciado_em, origem, criado_em, atualizado_em)
      VALUES ('cron', ?, ?, '2026-10-14', '2026-10-14T12:30:00.000Z', 'cronometro', '2026-10-14T12:30:00.000Z', '2026-10-14T12:30:00.000Z')`,
    a.pessoas.design.id, d.id)
    const eu = a.como(a.pessoas.am)
    const r = await eu.post(`/api/demandas/${d.id}/arquivar`)
    assert.ok(r.corpo.demanda.arquivadoEm)
    assert.equal(r.corpo.demanda.minutosRegistrados, 30)
    assert.equal((await eu.post(`/api/demandas/${d.id}/arquivar`)).status, 409)
    assert.equal((await eu.post(`/api/demandas/${d.id}/mover`, { colunaId: a.coluna('criacao', 'Fila').id })).status, 422)
    await eu.post(`/api/colunas/${pronto.id}/arquivar`)
    const seq = ultimoSeq(a.db)
    a.relogio('2026-10-14T14:00:00.000Z')
    const v = await eu.post(`/api/demandas/${d.id}/restaurar`)
    assert.equal(v.status, 200)
    assert.equal(v.corpo.demanda.colunaId, a.coluna('criacao', 'Fila').id)
    assert.equal(v.corpo.demanda.arquivadoEm, null)
    assert.equal(v.corpo.demanda.statusDesde, '2026-10-14T14:00:00.000Z')
    const ev = eventos(a.db, seq).find((e) => e.entidade === 'demanda')!
    assert.equal(ev.campos, null)
    assert.equal(ev.patch!.id, d.id)
    assert.equal((await eu.post(`/api/demandas/${d.id}/restaurar`)).status, 409)
  })

  test('restaurar em quadro arquivado → 422; na coluna concluida conclui; coluna de outro quadro → 400', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    const d = await a.criarDemanda()
    await eu.post(`/api/demandas/${d.id}/arquivar`)
    assert.equal((await eu.post(`/api/demandas/${d.id}/restaurar`, { colunaId: a.coluna('social', 'Fila').id })).status, 400)
    const c = await eu.post(`/api/demandas/${d.id}/restaurar`, { colunaId: a.coluna('criacao', 'Concluído').id })
    assert.ok(c.corpo.demanda.concluidaEm)
    const s = await a.criarDemanda({ quadroId: a.quadros.social.quadro.id })
    await eu.post(`/api/demandas/${s.id}/arquivar`)
    await a.como(a.pessoas.admin).post(`/api/quadros/${a.quadros.social.quadro.id}/arquivar`)
    const r = await eu.post(`/api/demandas/${s.id}/restaurar`)
    assert.equal(r.status, 422)
    assert.equal(r.corpo.erro.mensagem, 'Restaure o quadro antes.')
  })

  test('excluir: só admin; número precisa conferir; com versão → 409; sem versão anonimiza tudo e o detalhe some', async () => {
    const a = await ambiente()
    const admin = a.como(a.pessoas.admin)
    const comVersao = await a.criarDemanda({ ate: 'entregue' })
    assert.equal((await admin.post(`/api/demandas/${comVersao.id}/excluir`, { confirmarNumero: comVersao.numero })).status, 409)
    const d = await a.criarDemanda({ titulo: 'Segredo do cliente', descricaoMd: `@[Web](mencao:${a.pessoas.web.id}) briefing`,
      membroIds: [a.pessoas.design.id], links: [{ tipo: 'link', url: 'https://drive.google.com/x' }] })
    rodar(a.db, `INSERT INTO arquivo (id, nome, mime, bytes, sha256, enviado_por, criado_em) VALUES ('arq', 'a.png', 'image/png', 10, 'x', ?, '2026-10-14T13:00:00.000Z')`, a.pessoas.design.id)
    rodar(a.db, `INSERT INTO anexo (id, demanda_id, tipo, nome, arquivo_id, provedor, pos, criado_em)
                 VALUES ('anx', ?, 'arquivo', 'foto.png', 'arq', 'arquivo', 9, '2026-10-14T13:00:00.000Z')`, d.id)
    rodar(a.db, `INSERT INTO checklist (id, demanda_id, titulo, pos, criado_em) VALUES ('ck', ?, 'Coisas', 1, '2026-10-14T13:00:00.000Z')`, d.id)
    rodar(a.db, `INSERT INTO checklist_item (id, checklist_id, demanda_id, texto, pos, criado_em) VALUES ('it', 'ck', ?, 'segredo', 1, '2026-10-14T13:00:00.000Z')`, d.id)
    rodar(a.db, `INSERT INTO comentario (id, demanda_id, autor_id, corpo_md, criado_em) VALUES ('cm', ?, ?, 'comentário secreto', '2026-10-14T13:00:00.000Z')`, d.id, a.pessoas.am.id)
    await a.como(a.pessoas.am).patch(`/api/demandas/${d.id}`, { prioridade: 'alta' }, { ifMatch: d.rev })
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/excluir`, { confirmarNumero: d.numero })).status, 403)
    assert.equal((await admin.post(`/api/demandas/${d.id}/excluir`, { confirmarNumero: d.numero + 1 })).status, 400)
    const seq = ultimoSeq(a.db)
    assert.equal((await admin.post(`/api/demandas/${d.id}/excluir`, { confirmarNumero: d.numero })).status, 204)
    const l = um<Record<string, unknown>>(a.db, 'SELECT titulo, descricao_md, excluido_em, arquivado_em FROM demanda WHERE id = ?', d.id)!
    assert.equal(l.titulo, 'Demanda excluída')
    assert.equal(l.descricao_md, '')
    assert.ok(l.excluido_em && l.arquivado_em)
    assert.equal(um<{ c: string }>(a.db, "SELECT corpo_md AS c FROM comentario WHERE id = 'cm'")!.c, '')
    assert.equal(um<{ t: string }>(a.db, "SELECT texto AS t FROM checklist_item WHERE id = 'it'")!.t, '—')
    assert.equal(um<{ t: string }>(a.db, "SELECT titulo AS t FROM checklist WHERE id = 'ck'")!.t, '—')
    assert.ok(todos<{ nome: string; url: string | null }>(a.db, 'SELECT nome, url FROM anexo WHERE demanda_id = ?', d.id)
      .every((x) => x.nome === 'Anexo removido' && x.url === null))
    assert.ok(um(a.db, "SELECT 1 FROM arquivo WHERE id = 'arq' AND excluido_em IS NOT NULL"))
    assert.ok(todos<{ dados: string; antes: string | null; tipo: string }>(a.db, 'SELECT dados, antes, tipo FROM atividade WHERE demanda_id = ?', d.id)
      .filter((x) => x.tipo !== 'demanda.excluida').every((x) => x.dados === '{}' && x.antes === null))
    const dela = notificacoesDe(a.db, a.pessoas.design.id).filter((n) => n.demanda_id === d.id)
    assert.ok(dela.length > 0 && dela.every((n) => n.resumo === 'Demanda excluída'))
    assert.ok(todos<{ patch: string | null }>(a.db, 'SELECT patch FROM evento WHERE demanda_id = ? AND seq <= ?', d.id, seq).every((x) => x.patch === '{}'))
    assert.equal(um<{ n: number }>(a.db, 'SELECT count(*) AS n FROM demanda_mencao WHERE demanda_id = ?', d.id)!.n, 0)
    const ev = eventos(a.db, seq).find((e) => e.entidade === 'demanda')!
    assert.equal(ev.op, 'delete')
    assert.equal((await admin.get(`/api/demandas/${d.numero}`)).status, 404)
    assert.equal((await admin.post(`/api/demandas/${d.id}/excluir`, { confirmarNumero: d.numero })).status, 404)
    assert.equal((await a.como(a.pessoas.am).post(`/api/demandas/${d.id}/restaurar`)).status, 404)
  })
})
