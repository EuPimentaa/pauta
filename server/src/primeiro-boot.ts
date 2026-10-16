/** Primeiro boot: sem nenhum usuário e com ADMIN_EMAIL e ADMIN_SENHA no ambiente, cria o admin. */
import { ehSenhaFraca } from '../../shared/logica/senha.ts'
import { nomeDoEmail } from '../../shared/logica/texto.ts'
import { hashSenha } from './auth.ts'
import { config } from './config.ts'
import { agora, novoId, rodar, tx, um, type Db } from './db.ts'

export async function criarAdminInicial(db: Db): Promise<boolean> {
  if (um(db, 'SELECT 1 FROM usuario LIMIT 1')) return false
  const email = config.adminEmail
  const senha = config.adminSenha
  if (!email || !senha) {
    console.warn('Banco sem usuários: defina ADMIN_EMAIL e ADMIN_SENHA para criar o admin no primeiro boot.')
    return false
  }
  if (ehSenhaFraca(senha, { email })) throw new Error('ADMIN_SENHA fraca: use 10 ou mais caracteres e nada óbvio.')
  const hash = await hashSenha(senha)
  return tx(db, () => {
    if (um(db, 'SELECT 1 FROM usuario LIMIT 1')) return false
    const instante = agora()
    rodar(db, `INSERT INTO usuario (id, nome, email, senha_hash, senha_definida_em, papel, cor, criado_em, atualizado_em)
               VALUES (?, ?, ?, ?, ?, 'admin', 'grafite', ?, ?)`,
      novoId(), nomeDoEmail(email), email, hash, instante, instante, instante)
    console.log(`Admin criado: ${email}. Tire ADMIN_SENHA do ambiente.`)
    return true
  })
}
