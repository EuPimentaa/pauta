/**
 * Limites de tentativas (API.md §4.2), contando as FALHAS em `login_tentativa`:
 * - login: e-mail+IP 5 em 15 min (só as falhas depois do último acerto desse par), e-mail 20 em 1 h, IP 50 em 15 min;
 * - token de convite/redefinição inválido conta como falha do IP (o limite das rotas .../consultar é o do IP);
 * - troca de senha: 5 falhas em 15 min por pessoa (tipo 'senha').
 * O primeiro limite estourado responde 429 com `tenteEmSegundos` = quando a janela volta a ficar abaixo do limite.
 */
import { agora, agoraData, rodar, todos, um, type Db } from '../db.ts'
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

/** 429 se e-mail+IP, e-mail ou IP já estouraram o limite de falhas de login. */
export function exigirLimitesLogin(db: Db, email: string, ip: string): void {
  const ultimoAcerto = um<{ id: number | null }>(db,
    "SELECT max(id) AS id FROM login_tentativa WHERE tipo = 'login' AND ok = 1 AND email = ? AND ip = ?", email, ip)?.id ?? 0
  conferir(db, 'login', [
    { max: 5, janelaMs: 15 * MIN, onde: 'email = ? AND ip = ? AND id > ?', params: [email, ip, ultimoAcerto] },
    { max: 20, janelaMs: 60 * MIN, onde: 'email = ?', params: [email] },
    { max: 50, janelaMs: 15 * MIN, onde: 'ip = ?', params: [ip] },
  ])
}

/** 429 se o IP estourou (rotas que consultam token de convite e redefinição). */
export function exigirLimiteIp(db: Db, ip: string): void {
  conferir(db, 'login', [{ max: 50, janelaMs: 15 * MIN, onde: 'ip = ?', params: [ip] }])
}

/** 429 se a pessoa errou a senha atual 5 vezes em 15 min. */
export function exigirLimiteSenha(db: Db, email: string): void {
  conferir(db, 'senha', [{ max: 5, janelaMs: 15 * MIN, onde: 'email = ?', params: [email] }])
}

export function registrarTentativa(db: Db, tipo: 'login' | 'senha', email: string, ip: string, ok: boolean): void {
  rodar(db, 'INSERT INTO login_tentativa (tipo, email, ip, ok, criado_em) VALUES (?, ?, ?, ?, ?)', tipo, email, ip, ok, agora())
}
