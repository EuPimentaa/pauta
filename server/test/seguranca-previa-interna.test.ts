/**
 * Segurança 2 (revisão da leva 2): quem tem sessão interna e abre o link do cliente ("Ver como o cliente", o link
 * copiado de GET /api/demandas/:id/links) vê a página, mas não decide no lugar do cliente (403 previa_interna) e a visita
 * não conta como acesso do cliente. Sessão revogada ou vencida não é sessão: vale como o cliente.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { PaginaAprovacao } from '../../shared/tipos/index.ts'
import { nomeCookie } from '../src/auth.ts'
import { agora, rodar, um } from '../src/db.ts'
import { ORIGEM, type Ambiente, type Resposta } from './ajuda.ts'
import { ambiente, enviarAoCliente, publico, tokenDe } from './ciclo-ajuda.ts'

/** A página pública aberta no navegador de quem tem sessão interna (o cookie vai junto: Path=/). */
function comSessao(a: Ambiente, cookie: string) {
  const enviar = async (metodo: string, caminho: string, corpo?: unknown): Promise<Resposta> => {
    const r = await a.app.request(caminho, {
      method: metodo,
      headers: {
        Cookie: `${nomeCookie()}=${cookie}`, 'x-forwarded-for': '200.9.9.9',
        ...(metodo !== 'GET' ? { 'X-Trace-Id': randomUUID(), Origin: ORIGEM, 'Idempotency-Key': randomUUID() } : {}),
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await r.text()
    return { status: r.status, corpo: texto && (r.headers.get('content-type') ?? '').includes('json') ? JSON.parse(texto) : texto, texto, headers: r.headers }
  }
  return {
    pagina: (token: string) => enviar('GET', `/api/publico/a/${token}`),
    visto: (token: string) => enviar('POST', `/api/publico/a/${token}/visto`),
    decidir: (token: string, corpo: Record<string, unknown>) => enviar('POST', `/api/publico/a/${token}/decisao`, corpo),
  }
}

async function comLink() {
  const a = await ambiente()
  const d = await a.criarDemanda({ ate: 'entregue' })
  const s = await enviarAoCliente(a, d)
  const token = tokenDe(s.link!.url)
  const pag = (await publico(a).pagina(token)).corpo as PaginaAprovacao
  return { a, d, token, pag, versaoId: pag.itens[0]!.versao!.id }
}

const acessos = (a: Ambiente) => um<{ acessos: number; ultimo_acesso_em: string | null }>(a.db, 'SELECT acessos, ultimo_acesso_em FROM link_publico')!
const contar = (a: Ambiente, sql: string) => um<{ n: number }>(a.db, sql)!.n

describe('página pública com sessão interna no cookie', () => {
  test('atendimento vê a página, mas /visto não conta e a decisão responde 403 previa_interna sem gravar nada', async () => {
    const { a, d, token, pag, versaoId } = await comLink()
    const pri = comSessao(a, a.como(a.pessoas.am).cookie)
    assert.equal((await pri.pagina(token)).status, 200)
    const antes = acessos(a)
    assert.equal((await pri.visto(token)).status, 204)
    assert.deepEqual(acessos(a), antes, 'a visita interna não soma acesso')
    assert.equal(contar(a, `SELECT count(*) AS n FROM atividade WHERE tipo = 'link.visto'`), 0)

    for (const corpo of [
      { demandaId: d.id, versaoId, decisao: 'aprovado', nomeInformado: 'Diretora do cliente' },
      { demandaId: d.id, versaoId, decisao: 'ajuste', contatoId: pag.contato!.id, linhas: ['Trocar a foto'] },
    ]) {
      const r = await pri.decidir(token, corpo)
      assert.equal(r.status, 403, r.texto)
      assert.equal(r.corpo.erro.codigo, 'previa_interna')
      assert.equal(r.corpo.erro.mensagem, 'Você está vendo como o cliente: só ele pode decidir por este link.')
    }
    assert.equal(contar(a, 'SELECT count(*) AS n FROM aprovacao'), 0)
    assert.equal(contar(a, `SELECT count(*) AS n FROM atividade WHERE tipo = 'retorno.registrado'`), 0)
    const depois = (await a.como(a.pessoas.am).get(`/api/demandas/${d.numero}`)).corpo.demanda
    assert.ok(depois.envioPendenteEm, 'a peça continua com o cliente')
  })

  test('vale para admin e equipe também; o cliente (sem cookie) segue decidindo', async () => {
    const { a, d, token, pag, versaoId } = await comLink()
    for (const quem of [a.pessoas.admin, a.pessoas.design]) {
      const r = await comSessao(a, a.como(quem).cookie).decidir(token, { demandaId: d.id, versaoId, decisao: 'aprovado', contatoId: pag.contato!.id })
      assert.equal(r.status, 403, `${quem.apelido}: ${r.texto}`)
      assert.equal(r.corpo.erro.codigo, 'previa_interna')
    }
    const ok = await publico(a).decidir(token, { demandaId: d.id, versaoId, decisao: 'aprovado', contatoId: pag.contato!.id })
    assert.equal(ok.status, 200, ok.texto)
  })

  test('sessão revogada ou vencida no cookie não é sessão: a visita conta e a decisão vale', async () => {
    const { a, d, token, pag, versaoId } = await comLink()
    const cookie = a.como(a.pessoas.am).cookie
    rodar(a.db, 'UPDATE sessao SET revogada_em = ? WHERE usuario_id = ?', agora(), a.pessoas.am.id)
    const velha = comSessao(a, cookie)
    assert.equal((await velha.visto(token)).status, 204)
    assert.equal(acessos(a).acessos, 1)
    const r = await velha.decidir(token, { demandaId: d.id, versaoId, decisao: 'aprovado', contatoId: pag.contato!.id })
    assert.equal(r.status, 200, r.texto)
  })
})
