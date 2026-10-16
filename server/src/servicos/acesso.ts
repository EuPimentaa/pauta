/**
 * Limites de tentativas (API.md §4.2), contando as FALHAS em `login_tentativa`:
 * - login: e-mail+IP 5 em 15 min (só as falhas depois do último acerto desse par), e-mail 20 em 1 h, IP 50 em 15 min;
 * - token de convite/redefinição inválido conta como falha do IP (o limite das rotas .../consultar é o do IP);
 * - troca de senha: 5 falhas em 15 min por pessoa (tipo 'senha').
 * O primeiro limite estourado responde 429 com `tenteEmSegundos` = quando a janela volta a ficar abaixo do limite.
 *
 * Login e troca de senha RESERVAM a tentativa: conferem o limite e gravam a linha com `ok = 0` na mesma transação,
 * antes do scrypt (assíncrono). Assim uma rajada em paralelo conta cada tentativa em andamento como falha e para no
 * limite; no acerto, `confirmarTentativa` marca `ok = 1`. Conferir e gravar depois do `await` deixava a rajada inteira
 * passar pela conferência antes de qualquer falha ser gravada.
 */
import { agora, agoraData, rodar, todos, tx, um, type Db } from '../db.ts'
import { ErroHttp } from '../erros.ts'

const MIN = 60_000

export interface Limite {
  max: number
  janelaMs: number
  /** Onde contar (sem o WHERE da janela e do tipo). */
  onde: string
  params: unknown[]
}

function conferir(db: Db, tipo: 'login' | 'senha', limites: Limite[]): void {
  const agoraMs = agoraData().getTime()
  for (const l of limites) {
    const desde = new Date(agoraMs - l.janelaMs).toISOString()
    const falhas = todos<{ criado_em: string }>(db, `SELECT criado_em FROM login_tentativa
      WHERE tipo = ? AND ok = 0 AND criado_em > ? AND ${l.onde} ORDER BY criado_em DESC LIMIT ?`, tipo, desde, ...l.params, l.max)
    if (falhas.length >= l.max) {
      const libera = Date.parse(falhas[l.max - 1]!.criado_em) + l.janelaMs
      throw new ErroHttp(429, 'muitas_tentativas', 'Muitas tentativas. Espere um pouco e tente de novo.',
        { tenteEmSegundos: Math.max(1, Math.ceil((libera - agoraMs) / 1000)) })
    }
  }
}

function limitesLogin(db: Db, email: string, ip: string): Limite[] {
  const ultimoAcerto = um<{ id: number | null }>(db,
    "SELECT max(id) AS id FROM login_tentativa WHERE tipo = 'login' AND ok = 1 AND email = ? AND ip = ?", email, ip)?.id ?? 0
  return [
    { max: 5, janelaMs: 15 * MIN, onde: 'email = ? AND ip = ? AND id > ?', params: [email, ip, ultimoAcerto] },
    { max: 20, janelaMs: 60 * MIN, onde: 'email = ?', params: [email] },
    { max: 50, janelaMs: 15 * MIN, onde: 'ip = ?', params: [ip] },
  ]
}

function inserir(db: Db, tipo: 'login' | 'senha', email: string, ip: string, ok: boolean): number {
  return Number(rodar(db, 'INSERT INTO login_tentativa (tipo, email, ip, ok, criado_em) VALUES (?, ?, ?, ?, ?)',
    tipo, email, ip, ok, agora()).lastInsertRowid)
}

/**
 * 429 se e-mail+IP, e-mail ou IP já estouraram o limite de falhas de login (contando as em andamento); senão grava a
 * tentativa como falha e devolve o id dela, para `confirmarTentativa` no acerto.
 */
export function reservarTentativaLogin(db: Db, email: string, ip: string): number {
  return tx(db, () => {
    conferir(db, 'login', limitesLogin(db, email, ip))
    return inserir(db, 'login', email, ip, false)
  })
}

/** 429 se a pessoa errou a senha atual 5 vezes em 15 min (contando as em andamento); senão reserva a tentativa. */
export function reservarTentativaSenha(db: Db, email: string, ip: string): number {
  return tx(db, () => {
    conferir(db, 'senha', [{ max: 5, janelaMs: 15 * MIN, onde: 'email = ?', params: [email] }])
    return inserir(db, 'senha', email, ip, false)
  })
}

/** Acerto: a tentativa reservada deixa de contar como falha (e, no login, zera o par e-mail+IP). */
export function confirmarTentativa(db: Db, id: number): void {
  rodar(db, 'UPDATE login_tentativa SET ok = 1 WHERE id = ?', id)
}

/** 429 se o IP estourou (rotas que consultam token de convite e redefinição). */
export function exigirLimiteIp(db: Db, ip: string): void {
  conferir(db, 'login', [{ max: 50, janelaMs: 15 * MIN, onde: 'ip = ?', params: [ip] }])
}

/** Falha do IP por token de convite/redefinição inválido (conta no limite do IP do login). */
export function registrarFalhaIp(db: Db, ip: string): void {
  inserir(db, 'login', '', ip, false)
}
