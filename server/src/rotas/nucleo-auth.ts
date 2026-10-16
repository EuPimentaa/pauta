/** Autenticação e sessão (API.md §4.2): login, logout, eu, troca de senha, convite e redefinição. */
import type { Context } from 'hono'
import type { Cor, Eu, TokenAcessoInfo, Usuario } from '../../../shared/tipos/index.ts'
import { ehSenhaFraca } from '../../../shared/logica/senha.ts'
import {
  apagarCookie, conferirSenha, corpoJson, criarSessao, exigirUsuario, hashSenha, revogarSessoes, sessaoDaRequisicao,
  validar, type Ambiente, type App,
} from '../auth.ts'
import { agora, rodar, tx, um, type Db } from '../db.ts'
import { ErroHttp, conflito } from '../erros.ts'
import * as esquema from '../esquemas.ts'
import {
  confirmarTentativa, exigirLimiteIp, registrarFalhaIp, reservarTentativaLogin, reservarTentativaSenha,
} from '../servicos/acesso.ts'
import { hashToken } from '../servicos/cripto.ts'
import { emitirObjeto } from '../servicos/eventos.ts'
import { carregarUsuario, montarEu, revogarTokens } from '../servicos/pessoas.ts'

type Finalidade = 'convite' | 'redefinicao'

const credenciaisInvalidas = () => new ErroHttp(401, 'credenciais_invalidas', 'E-mail ou senha incorretos.')
const tokenInvalido = () => new ErroHttp(410, 'token_invalido', 'Este link não vale mais. Peça um novo ao admin.')

function exigirSenhaForte(senha: string, u: { email: string; nome: string }): void {
  if (ehSenhaFraca(senha, u)) {
    throw new ErroHttp(422, 'senha_fraca', 'Use pelo menos 10 caracteres e evite senhas óbvias ou o seu e-mail.')
  }
}

interface LinhaToken {
  usuario_id: string
  usado_em: string | null
  revogado_em: string | null
  expira_em: string
  ativo: number
  senha_definida_em: string | null
  nome: string
  email: string
  cor: Cor
}

function lerToken(db: Db, finalidade: Finalidade, token: string): LinhaToken | undefined {
  return um<LinhaToken>(db, `
    SELECT t.usuario_id, t.usado_em, t.revogado_em, t.expira_em, u.ativo, u.senha_definida_em, u.nome, u.email, u.cor
      FROM token_acesso t JOIN usuario u ON u.id = t.usuario_id WHERE t.token_hash = ? AND t.finalidade = ?`,
  hashToken(token), finalidade)
}

/**
 * Não usado, não revogado, não vencido e de pessoa ativa. O convite, além disso, só vale para quem ainda não definiu
 * senha: definida a senha (pelo convite ou por uma redefinição), um link de convite antigo não troca mais a senha.
 */
function linhaValida(l: LinhaToken | undefined, finalidade: Finalidade, instante: string): l is LinhaToken {
  return !!l && !l.usado_em && !l.revogado_em && l.expira_em > instante && l.ativo === 1
    && (finalidade === 'redefinicao' || l.senha_definida_em === null)
}

/** Token válido ou 410 (conta como falha do IP). */
function tokenValido(c: Context<Ambiente>, finalidade: Finalidade, token: string): LinhaToken {
  const db = c.get('db')
  const ip = c.get('ator').ip
  exigirLimiteIp(db, ip)
  const l = lerToken(db, finalidade, token)
  if (!linhaValida(l, finalidade, agora())) {
    registrarFalhaIp(db, ip)
    throw tokenInvalido()
  }
  return l
}

/**
 * Consome o token, grava a senha e já entra (convite e redefinição; a redefinição revoga as sessões antigas). Na mesma
 * transação revoga os outros links pendentes da pessoa, das duas finalidades.
 */
async function definirSenha(c: Context<Ambiente>, finalidade: Finalidade): Promise<Response> {
  const db = c.get('db')
  const e = validar(esquema.definirSenha, await corpoJson(c))
  const t = tokenValido(c, finalidade, e.token)
  exigirSenhaForte(e.senha, t)
  const hash = await hashSenha(e.senha)
  const eu = tx(db, () => {
    const instante = agora()
    // de novo dentro da transação: durante o scrypt a pessoa pode ter sido desativada ou definido a senha por outro link
    if (!linhaValida(lerToken(db, finalidade, e.token), finalidade, instante)) throw tokenInvalido()
    const r = rodar(db, `UPDATE token_acesso SET usado_em = ? WHERE token_hash = ? AND finalidade = ? AND usado_em IS NULL
                          AND revogado_em IS NULL AND expira_em > ?`, instante, hashToken(e.token), finalidade, instante)
    if (r.changes !== 1) throw tokenInvalido()
    rodar(db, 'UPDATE usuario SET senha_hash = ?, senha_definida_em = ?, atualizado_em = ? WHERE id = ?', hash, instante, instante, t.usuario_id)
    revogarTokens(db, t.usuario_id)
    if (finalidade === 'redefinicao') revogarSessoes(db, t.usuario_id)
    criarSessao(db, c, t.usuario_id, c.get('ator').ip)
    return montarEu(db, t.usuario_id)
  })
  return c.json(eu satisfies Eu)
}

function emitirUsuario(db: Db, u: Usuario, c: Context<Ambiente>): void {
  emitirObjeto(db, 'usuario', u.id, {
    id: u.id, nome: u.nome, apelido: u.apelido, papel: u.papel, cor: u.cor, ativo: u.ativo, equipeIds: u.equipeIds,
  }, c.get('ator'))
}

export function registrar(app: App): void {
  app.post('/api/auth/login', async (c) => {
    const db = c.get('db')
    const ip = c.get('ator').ip
    const e = validar(esquema.login, await corpoJson(c))
    // reserva antes do scrypt: numa rajada em paralelo, as tentativas em andamento já contam no limite
    const tentativa = reservarTentativaLogin(db, e.email, ip)
    const u = um<{ id: string; senha_hash: string | null; ativo: number }>(db, 'SELECT id, senha_hash, ativo FROM usuario WHERE email = ?', e.email)
    const ok = await conferirSenha(e.senha, u && u.ativo === 1 ? u.senha_hash : null)
    if (!ok || !u) throw credenciaisInvalidas()
    const eu = tx(db, () => {
      confirmarTentativa(db, tentativa)
      criarSessao(db, c, u.id, ip)
      return montarEu(db, u.id)
    })
    return c.json(eu)
  })

  app.post('/api/auth/logout', (c) => {
    const s = sessaoDaRequisicao(c)
    if (s) rodar(c.get('db'), 'UPDATE sessao SET revogada_em = ? WHERE id = ? AND revogada_em IS NULL', agora(), s.id)
    apagarCookie(c)
    return c.body(null, 204)
  })

  app.get('/api/auth/eu', exigirUsuario, (c) => c.json(montarEu(c.get('db'), c.get('ator').usuario!.id)))

  app.patch('/api/auth/eu', exigirUsuario, async (c) => {
    const db = c.get('db')
    const e = validar(esquema.editarEu, await corpoJson(c))
    const id = c.get('ator').usuario!.id
    const eu = tx(db, () => {
      const atual = carregarUsuario(db, id)
      const apelido = e.apelido === undefined ? atual.apelido : e.apelido
      if (apelido && apelido !== atual.apelido
        && um(db, 'SELECT 1 FROM usuario WHERE ativo = 1 AND lower(apelido) = lower(?) AND id <> ?', apelido, id)) {
        throw conflito(`O apelido "${apelido}" já é de outra pessoa.`, { campo: 'apelido' })
      }
      const prefs = { ...JSON.parse(um<{ prefs: string }>(db, 'SELECT prefs FROM usuario WHERE id = ?', id)!.prefs), ...(e.prefs ?? {}) }
      rodar(db, 'UPDATE usuario SET nome = ?, apelido = ?, cor = ?, prefs = ?, atualizado_em = ? WHERE id = ?',
        e.nome ?? atual.nome, apelido, e.cor ?? atual.cor, JSON.stringify(prefs), agora(), id)
      const depois = carregarUsuario(db, id)
      if (depois.nome !== atual.nome || depois.apelido !== atual.apelido || depois.cor !== atual.cor) emitirUsuario(db, depois, c)
      return montarEu(db, id)
    })
    return c.json(eu)
  })

  app.post('/api/auth/senha', exigirUsuario, async (c) => {
    const db = c.get('db')
    const ator = c.get('ator')
    const u = ator.usuario!
    const e = validar(esquema.trocarSenha, await corpoJson(c))
    // reserva antes do scrypt (mesma regra do login): com uma sessão roubada, a rajada para na 5ª falha
    const tentativa = reservarTentativaSenha(db, u.email, ator.ip)
    const hashAtual = um<{ senha_hash: string | null }>(db, 'SELECT senha_hash FROM usuario WHERE id = ?', u.id)!.senha_hash
    if (!(await conferirSenha(e.senhaAtual, hashAtual))) {
      throw new ErroHttp(401, 'credenciais_invalidas', 'A senha atual não confere.')
    }
    confirmarTentativa(db, tentativa)
    exigirSenhaForte(e.senhaNova, u)
    const hash = await hashSenha(e.senhaNova)
    const sessao = sessaoDaRequisicao(c)
    tx(db, () => {
      const instante = agora()
      rodar(db, 'UPDATE usuario SET senha_hash = ?, senha_definida_em = ?, atualizado_em = ? WHERE id = ?', hash, instante, instante, u.id)
      revogarSessoes(db, u.id, sessao?.id)
      revogarTokens(db, u.id)
    })
    return c.body(null, 204)
  })

  for (const finalidade of ['convite', 'redefinicao'] as const) {
    app.post(`/api/auth/${finalidade}/consultar`, async (c) => {
      const e = validar(esquema.token, await corpoJson(c))
      const t = tokenValido(c, finalidade, e.token)
      return c.json({ nome: t.nome, email: t.email, cor: t.cor, expiraEm: t.expira_em } satisfies TokenAcessoInfo)
    })
    app.post(`/api/auth/${finalidade}`, (c) => definirSenha(c, finalidade))
  }
}
