/** "Colar do WhatsApp" (API.md §4.13): POST /api/entrada/analisar e a lógica pura (shared/logica/colar-whatsapp.ts). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { analisarConversa, escaparMarkdown, lerConversa, sugerirModelos, tituloDaConversa, trechoDaConversa } from '../../shared/logica/colar-whatsapp.ts'
import { normalizarAlias } from '../../shared/logica/texto.ts'
import { rodar } from '../src/db.ts'
import { ambiente } from './ajuda.ts'

const CONVERSA = `[14/10 15:32] Fulana: Oi Pri, tudo bem?
[14/10 15:33] Fulana: Precisamos de um carrossel para o Dia do Médico do Hospital Evangelico.
São 5 lâminas, com a foto da equipe
[14/10 15:40] Pri Souza: Combinado, passo para a Criação`

describe('POST /api/entrada/analisar', () => {
  test('reconhece "[14/10 15:32] Fulana:", o cliente por apelido sem acento e o modelo Carrossel por "carrossel"', async () => {
    const a = await ambiente()
    const r = await a.como(a.pessoas.am).post('/api/entrada/analisar', { texto: CONVERSA })
    assert.equal(r.status, 200)
    const x = r.corpo
    assert.equal(x.autor, 'Fulana', 'a Pri é da agência: o autor é a cliente')
    assert.equal(x.recebidoEm, '2026-10-14T18:32:00.000Z', '15:32 em São Paulo')
    assert.equal(x.clientes[0].id, a.clientes.he.id)
    assert.ok(x.clientes[0].confianca >= 0.8)
    assert.equal(x.clientes[0].casou, 'hospital evangelico')
    assert.equal(x.modelos[0].id, 'md-carrossel')
    assert.equal(x.modelos[0].casou, 'carrossel')
    assert.equal(x.tituloSugerido, 'Carrossel para o Dia do Médico do Hospital Evangelico')
    assert.equal(x.siglaNova, null)
    assert.equal(x.senhaDetectada, false)
  })

  test('o contato do cliente como autor sugere o cliente; sigla em maiúsculas também', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.am)
    const porContato = await eu.post('/api/entrada/analisar', { texto: '[14/10 09:00] Beltrana: preciso de um banner novo para a recepção' })
    assert.equal(porContato.corpo.clientes[0].id, a.clientes.icc.id)
    assert.match(porContato.corpo.clientes[0].casou, /Beltrana/)
    assert.equal(porContato.corpo.modelos[0].id, 'md-grafico', 'banner é material gráfico')
    const porSigla = await eu.post('/api/entrada/analisar', { texto: 'Reels do HE para sexta' })
    assert.equal(porSigla.corpo.clientes[0].id, a.clientes.he.id)
    assert.equal(porSigla.corpo.modelos[0].id, 'md-reels')
    assert.equal(porSigla.corpo.autor, null)
    assert.equal(porSigla.corpo.recebidoEm, null)
  })

  test('sigla desconhecida em maiúsculas vira siglaNova; senha no texto avisa', async () => {
    const a = await ambiente()
    const eu = a.como(a.pessoas.design)
    const r = await eu.post('/api/entrada/analisar', { texto: '[15/10 10:00] Joana: XYZ: precisamos de 3 posts para o lançamento' })
    assert.equal(r.corpo.siglaNova, 'XYZ')
    assert.deepEqual(r.corpo.clientes, [])
    assert.equal(r.corpo.modelos[0].id, 'md-post')
    const senha = await eu.post('/api/entrada/analisar', { texto: 'O acesso do Instagram: usuario hospital, senha: Hosp@2026!' })
    assert.equal(senha.corpo.senhaDetectada, true)
  })

  test('modelo de quadro arquivado não é sugerido; texto acima de 50 mil caracteres → 400', async () => {
    const a = await ambiente()
    rodar(a.db, `INSERT INTO modelo_demanda (id, quadro_id, nome, pos) VALUES ('md-social-podcast', ?, 'Podcast', 1)`, a.quadros.social.quadro.id)
    const eu = a.como(a.pessoas.admin)
    assert.equal((await eu.post('/api/entrada/analisar', { texto: 'episódio do podcast' })).corpo.modelos[0]?.id, 'md-social-podcast')
    await eu.post(`/api/quadros/${a.quadros.social.quadro.id}/arquivar`)
    assert.deepEqual((await eu.post('/api/entrada/analisar', { texto: 'episódio do podcast' })).corpo.modelos, [])
    assert.equal((await eu.post('/api/entrada/analisar', { texto: 'a'.repeat(50_001) })).status, 400)
  })
})

describe('colar-whatsapp (puro)', () => {
  test('os formatos de cabeçalho, o ano que falta e as linhas que continuam a mensagem', () => {
    const msgs = lerConversa([
      '‎[14/10/2026, 15:32:10] Fulana: um',
      'continua',
      '[15:40, 14/10/2026] Pri: dois',
      '14/10/26 16:00 - Fulana: três',
      '[02/01 08:00] Fulana: ano que vem? não: o último janeiro',
      '[14/10 09:00] Fulana: <Mídia oculta>',
    ].join('\n'), '2026-10-14')
    assert.deepEqual(msgs.map((m) => [m.autor, m.data, m.hora, m.texto]), [
      ['Fulana', '2026-10-14', '15:32', 'um\ncontinua'],
      ['Pri', '2026-10-14', '15:40', 'dois'],
      ['Fulana', '2026-10-14', '16:00', 'três'],
      ['Fulana', '2026-01-02', '08:00', 'ano que vem? não: o último janeiro'],
    ])
    assert.deepEqual(lerConversa('sem cabeçalho\nnenhum', '2026-10-14'), [{ autor: null, data: null, hora: null, texto: 'sem cabeçalho\nnenhum' }])
    // dezembro colado em janeiro é do ano anterior
    assert.equal(lerConversa('[30/12 10:00] A: b', '2027-01-03')[0]!.data, '2026-12-30')
  })

  test('título: sem saudação, sem "precisamos de um", na primeira frase e até 80 caracteres', () => {
    const t = (s: string) => tituloDaConversa(lerConversa(s, '2026-10-14'))
    assert.equal(t('Bom dia!\nVocês podem fazer um post sobre a campanha de vacinação? É urgente'), 'Post sobre a campanha de vacinação')
    assert.equal(t('Olá, Pri! Preciso de uma arte para o feed'), 'Arte para o feed')
    assert.equal(t('oi\nok'), 'Oi')
    const longo = t(`Precisamos de ${'palavra '.repeat(30)}`)
    assert.ok(longo.length <= 80 && !longo.endsWith(' '))
  })

  test('modelos: o nome mais específico ganha o empate e o sinônimo vale menos que o nome', () => {
    const modelos = [
      { id: 'site', nome: 'Site ou landing page' }, { id: 'ajuste', nome: 'Ajuste de site' }, { id: 'post', nome: 'Post' },
      { id: 'carrossel', nome: 'Carrossel' }, { id: 'outro', nome: 'Outro' },
    ]
    const n = (s: string) => normalizarAlias(s)
    assert.equal(sugerirModelos(n('precisamos de um site novo'), modelos)[0]!.id, 'site')
    assert.equal(sugerirModelos(n('ajustar o site da clínica'), modelos)[0]!.id, 'ajuste')
    assert.equal(sugerirModelos(n('a arte do carrossel'), modelos)[0]!.id, 'carrossel')
    assert.deepEqual(sugerirModelos(n('outro assunto qualquer'), modelos), [])
  })

  test('o trecho da descrição escapa o Markdown do cliente e agrupa por autor', () => {
    const msgs = lerConversa('[14/10 15:32] Fulana: **negrito** e [link](javascript:alert(1))\n# título\n[14/10 15:33] Fulana: - item\n[14/10 15:40] Pri: ok', '2026-10-14')
    const md = trechoDaConversa(msgs)
    assert.equal(md, [
      '## Pedido pelo WhatsApp',
      '> **Fulana** · 14/10 15:32',
      '>',
      '> \\*\\*negrito\\*\\* e \\[link\\](javascript:alert(1))',
      '> \\# título',
      '> \\- item',
      '',
      '> **Pri** · 14/10 15:40',
      '>',
      '> ok',
    ].join('\n'))
    assert.equal(escaparMarkdown('1. item'), '1\\. item')
    assert.equal(escaparMarkdown('@[Rafa](mencao:u1)'), '@\\[Rafa\\](mencao:u1)')
  })

  test('sem cliente conhecido e sem sigla: nada sugerido', () => {
    const x = analisarConversa('[14/10 10:00] Maria: precisamos de um vídeo', { clientes: [], modelos: [{ id: 'v', nome: 'Vídeo' }], hoje: '2026-10-14' })
    assert.deepEqual(x.clientes, [])
    assert.equal(x.siglaNova, null)
    assert.equal(x.modelos[0]!.id, 'v')
    assert.equal(x.tituloSugerido, 'Vídeo')
  })
})
