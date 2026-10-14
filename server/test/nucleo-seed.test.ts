/** Seed de demonstração (PLANO §1.1.3): pessoas, clientes, quadros e demandas em todos os estados pedidos. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hojeSP } from '../../shared/logica/datas.ts'
import { carregarModulosDemo, colunasVazias, semearDemo } from '../scripts/seed-demo.ts'
import { criarApp } from '../src/app.ts'
import { abrir, agoraData, fixarRelogio, migrar, todos, um, type Db } from '../src/db.ts'
import { montarEu } from '../src/servicos/pessoas.ts'
import { INICIO, ORIGEM, SENHA_TESTE } from './ajuda.ts'

async function semeado(demandasCriacao = 40): Promise<Db> {
  fixarRelogio(INICIO)
  const db = abrir(':memory:')
  migrar(db)
  await semearDemo(db, { emailAdmin: 'admin@pauta.test', senhaAdmin: SENHA_TESTE, senhaPessoas: SENHA_TESTE, demandasCriacao })
  return db
}

const n = (db: Db, sql: string, ...p: unknown[]) => Number(um<{ n: number }>(db, sql, ...p)!.n)

describe('seed de demonstração', () => {
  test('pessoas, equipes, clientes e os 6 quadros como nos Primeiros passos', async () => {
    const db = await semeado()
    assert.equal(n(db, 'SELECT count(*) AS n FROM usuario WHERE senha_hash IS NOT NULL AND ativo = 1'), 11)
    assert.equal(n(db, "SELECT count(*) AS n FROM usuario WHERE papel = 'atendimento'"), 2)
    assert.equal(n(db, "SELECT count(*) AS n FROM equipe_membro WHERE equipe_id = 'eq-criacao'"), 3)
    assert.equal(n(db, "SELECT count(*) AS n FROM equipe_membro WHERE equipe_id = 'eq-social'"), 2)
    for (const eq of ['eq-web', 'eq-trafego', 'eq-producao']) assert.equal(n(db, 'SELECT count(*) AS n FROM equipe_membro WHERE equipe_id = ?', eq), 1)
    assert.equal(n(db, 'SELECT count(*) AS n FROM token_acesso WHERE usado_em IS NULL AND revogado_em IS NULL'), 0)

    assert.equal(n(db, 'SELECT count(*) AS n FROM cliente'), 8)
    assert.equal(n(db, 'SELECT count(*) AS n FROM cliente WHERE atendimento_id IS NULL'), 0)
    assert.equal(n(db, 'SELECT count(*) AS n FROM cliente_contato WHERE padrao = 1'), 8)
    assert.equal(n(db, 'SELECT count(*) AS n FROM cliente_responsavel'), 8 * 5)

    const quadros = todos<{ nome: string; coluna_por_membro: number }>(db, 'SELECT nome, coluna_por_membro FROM quadro ORDER BY pos')
    assert.deepEqual(quadros.map((q) => q.nome), ['Atendimento', 'Criação', 'Social', 'Web', 'Tráfego', 'Produção'])
    const colunas = (nome: string) => todos<{ nome: string; papel: string; responsavel_id: string | null }>(db,
      'SELECT c.nome, c.papel, c.responsavel_id FROM coluna c JOIN quadro q ON q.id = c.quadro_id WHERE q.nome = ? ORDER BY c.pos', nome)
    // as colunas de pessoa seguem a ordem do serviço (pelo nome): Beatriz, Leonardo, Rafael
    assert.deepEqual(colunas('Criação').map((c) => c.nome), ['Fila', 'Bia', 'Léo', 'Rafa', 'Pronto', 'Concluído'])
    assert.equal(colunas('Criação').filter((c) => c.responsavel_id).length, 3)
    assert.deepEqual(colunas('Social').map((c) => [c.nome, c.papel]),
      [['Fila', 'normal'], ['Caio', 'normal'], ['Duda', 'normal'], ['Agendado', 'normal'], ['Publicado', 'concluida']])
    assert.deepEqual(colunas('Atendimento').map((c) => c.nome), ['A fazer', 'Fazendo', 'Revisão', 'Com o cliente', 'Concluído'])
    const automacoes = todos<{ quadro: string; gatilho: string; destino: string; coluna: string; membros: string }>(db, `
      SELECT q.nome AS quadro, a.gatilho, d.nome AS destino, c.nome AS coluna, a.membros FROM automacao_quadro a
        JOIN quadro q ON q.id = a.quadro_id JOIN quadro d ON d.id = a.destino_quadro_id JOIN coluna c ON c.id = a.destino_coluna_id
       WHERE q.nome IN ('Criação', 'Social', 'Atendimento') ORDER BY q.nome, a.gatilho`)
    assert.deepEqual(automacoes.map((a) => `${a.quadro}:${a.gatilho} → ${a.destino} › ${a.coluna} (${a.membros})`), [
      'Atendimento:ajuste_pedido → Atendimento › Fazendo (manter)',
      'Atendimento:enviado_ao_cliente → Atendimento › Com o cliente (manter)',
      'Criação:ajuste_pedido → Criação › Fila (manter)',
      'Criação:aprovado → Social › Fila (responsavel_destino)',
      'Criação:enviado_ao_cliente → Atendimento › Com o cliente (manter)',
      'Social:concluida → Social › Publicado (manter)',
    ])
    // cada pessoa segue o quadro da própria equipe
    assert.equal(n(db, `SELECT count(*) AS n FROM quadro_usuario qu JOIN usuario u ON u.id = qu.usuario_id
      WHERE qu.seguindo = 1 AND u.papel <> 'admin'`), 10)
  })

  test('toda coluna com card e as demandas em todos os estados pedidos', async () => {
    const db = await semeado()
    assert.deepEqual(colunasVazias(db), [])
    const hoje = hojeSP(agoraData())
    // 20 + 40 + 40 + 3 × 15, mais a repetição que nasceu no Social
    assert.equal(n(db, 'SELECT count(*) AS n FROM demanda'), 20 + 40 + 40 + 45 + 1)
    const abertas = 'concluida_em IS NULL AND arquivado_em IS NULL'
    assert.ok(n(db, `SELECT count(*) AS n FROM demanda WHERE ${abertas} AND prazo < ? AND envio_pendente_em IS NULL`, hoje) >= 4, 'atrasadas')
    assert.ok(n(db, `SELECT count(*) AS n FROM demanda WHERE ${abertas} AND prazo = ?`, hoje) >= 2, 'para hoje')
    // com o cliente: por link e por fora, uma parada há 3 dias úteis, todas no Com o cliente do Atendimento
    const comCliente = todos<{ via: string; enviado_em: string; coluna: string }>(db, `
      SELECT e.via, e.enviado_em, c.nome AS coluna FROM demanda d JOIN envio e ON e.demanda_id = d.id
        JOIN coluna c ON c.id = d.coluna_id WHERE d.envio_pendente_em IS NOT NULL AND e.enviado_em = d.envio_pendente_em`)
    assert.ok(comCliente.some((x) => x.via === 'link') && comCliente.some((x) => x.via === 'fora'))
    assert.ok(comCliente.every((x) => x.coluna === 'Com o cliente'))
    assert.ok(comCliente.some((x) => x.enviado_em < '2026-10-12'), 'uma parada há 3 dias úteis')
    assert.ok(n(db, 'SELECT count(*) AS n FROM link_publico') >= 2)
    // aprovadas: a automação levou ao Social › Fila com o responsável do cliente no Social
    const aprovadas = todos<{ coluna: string; quadro: string; membro: string }>(db, `
      SELECT c.nome AS coluna, q.nome AS quadro, (SELECT group_concat(u.apelido) FROM demanda_membro m JOIN usuario u ON u.id = m.usuario_id
        WHERE m.demanda_id = d.id) AS membro
        FROM demanda d JOIN coluna c ON c.id = d.coluna_id JOIN quadro q ON q.id = d.quadro_id WHERE d.aprovada_em IS NOT NULL`)
    assert.equal(aprovadas.length, 2)
    for (const a of aprovadas) {
      assert.deepEqual([a.quadro, a.coluna], ['Social', 'Fila'])
      assert.ok(['Caio', 'Duda'].includes(a.membro), a.membro)
    }
    // rodada 3 extra com o checklist do ajuste, de volta à Fila da Criação
    const extra = um<{ id: string; coluna: string; rodada_atual: number }>(db, `SELECT d.id, c.nome AS coluna, d.rodada_atual FROM demanda d
      JOIN coluna c ON c.id = d.coluna_id JOIN rodada r ON r.demanda_id = d.id AND r.numero = 3 AND r.extra = 1`)!
    assert.equal(extra.rodada_atual, 3)
    assert.equal(extra.coluna, 'Fila')
    assert.equal(n(db, "SELECT count(*) AS n FROM checklist WHERE demanda_id = ? AND titulo = 'Ajustes R3'", extra.id), 1)
    assert.equal(n(db, "SELECT count(*) AS n FROM aprovacao WHERE demanda_id = ? AND decisao = 'ajuste'", extra.id), 2)
    // repetição semanal (aberta na Criação; a do Social já foi concluída e a próxima nasceu)
    assert.ok(n(db, `SELECT count(*) AS n FROM demanda WHERE repetir = 'semanal' AND ${abertas}`) >= 2)
    assert.equal(n(db, 'SELECT count(*) AS n FROM demanda WHERE origem_demanda_id IS NOT NULL'), 1)
    // concluídas há mais de 7 dias: fora do quadro (Arquivo)
    const limite = new Date(agoraData().getTime() - 7 * 86_400_000).toISOString()
    assert.ok(n(db, 'SELECT count(*) AS n FROM demanda WHERE concluida_em < ?', limite) >= 3)
    assert.ok(n(db, 'SELECT count(*) AS n FROM demanda WHERE concluida_em >= ?', limite) >= 5)
    // horas da semana e o cronômetro do admin ligado
    assert.ok(n(db, "SELECT count(*) AS n FROM apontamento WHERE origem = 'manual'") >= 6)
    const admin = um<{ id: string }>(db, "SELECT id FROM usuario WHERE email = 'admin@pauta.test'")!.id
    assert.ok(montarEu(db, admin).cronometro)
    // sino: no máximo 5 não lidas por pessoa
    assert.ok(todos<{ n: number }>(db, 'SELECT count(*) AS n FROM notificacao WHERE lida_em IS NULL GROUP BY usuario_id').every((l) => l.n <= 5))
  })

  test('as pessoas entram com a senha do seed e o bootstrap abre; banco com dados não é semeado de novo', async () => {
    const db = await semeado(12)
    const app = criarApp(db)
    const login = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Trace-Id': crypto.randomUUID(), Origin: ORIGEM },
      body: JSON.stringify({ email: 'design@pauta.test', senha: SENHA_TESTE }),
    })
    assert.equal(login.status, 200)
    const cookie = /sid=([^;]+)/.exec(login.headers.get('set-cookie')!)![1]
    const b = await app.request('/api/bootstrap', { headers: { Cookie: `sid=${cookie}` } })
    assert.equal(b.status, 200)
    const corpo = await b.json() as { quadros: unknown[]; demandas: unknown[] }
    assert.equal(corpo.quadros.length, 6)
    assert.ok(corpo.demandas.length > 100)
    await assert.rejects(semearDemo(db, { emailAdmin: 'admin@pauta.test', senhaAdmin: SENHA_TESTE, senhaPessoas: SENHA_TESTE }),
      /já tem quadros ou demandas/)
  })

  test('reaproveita o admin do primeiro boot; senha fraca ou admin ausente param o seed', async () => {
    fixarRelogio(INICIO)
    const db = abrir(':memory:')
    migrar(db)
    await assert.rejects(semearDemo(db, { emailAdmin: null, senhaAdmin: null, senhaPessoas: SENHA_TESTE, demandasCriacao: 12 }),
      /ADMIN_EMAIL e ADMIN_SENHA/)
    await assert.rejects(semearDemo(db, { emailAdmin: 'a@pauta.test', senhaAdmin: SENHA_TESTE, senhaPessoas: '123456' }), /fraca/)
    db.exec(`INSERT INTO usuario (id, nome, email, senha_hash, senha_definida_em, papel, cor, criado_em, atualizado_em)
             VALUES ('u-boot', 'Dona', 'dona@pauta.test', 'scrypt$x', '${INICIO}', 'admin', 'grafite', '${INICIO}', '${INICIO}')`)
    await semearDemo(db, { emailAdmin: null, senhaAdmin: null, senhaPessoas: SENHA_TESTE, demandasCriacao: 12 })
    assert.deepEqual(todos<{ id: string }>(db, "SELECT id FROM usuario WHERE papel = 'admin'").map((l) => l.id), ['u-boot'])
    assert.equal(n(db, 'SELECT count(*) AS n FROM usuario'), 11)
    assert.equal(n(db, "SELECT count(*) AS n FROM quadro WHERE criado_por IS NOT 'u-boot'"), 0)          // o admin do boot criou os quadros
  })

  test('módulos de scripts/demo: o do núcleo primeiro; sem semear(ctx) impede o seed', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'pauta-demo-'))
    for (const nome of ['ciclo.ts', 'nucleo.ts', 'modal.ts']) writeFileSync(join(pasta, nome), 'export function semear() {}\n')
    assert.deepEqual((await carregarModulosDemo(pasta)).map((m) => m.nome), ['nucleo.ts', 'ciclo.ts', 'modal.ts'])
    writeFileSync(join(pasta, 'zz-ruim.ts'), 'export const x = 1\n')
    await assert.rejects(carregarModulosDemo(pasta), /não exporta semear/)
  })
})
