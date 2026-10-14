/**
 * Senhas: detector de senha escrita em texto (descrição e comentário avisam e apontam o cofre, sem bloquear) e a
 * regra de senha fraca do login (menos de 10 caracteres ou óbvia). Puro.
 */

const PALAVRA_SENHA = String.raw`(?:senha|password|passwd|pass|pwd|pin|contrase[nñ]a)`

/** Algo com cara de senha: 4+ caracteres sem espaço com pelo menos um dígito ou símbolo. */
const VALOR = String.raw`(?=\S*[\d!@#$%^&*()_+=\[\]{};'"\\|,.<>/?~-])\S{4,}`

/**
 * "senha: abc123", "Senha = x", "password: x", "senha do instagram: x", "login: x / senha: y" (com ":" ou "="),
 * e "a senha é Abc@123" (sem ":", só se o valor tiver dígito ou símbolo, para não pegar "a senha é segura").
 */
const PADROES = [
  new RegExp(String.raw`(?<![\p{L}\d])${PALAVRA_SENHA}(?:\s+(?:d[oa]s?|de)\s+[\p{L}\d._-]+){0,2}\s*[:=]\s*\S{3,}`, 'iu'),
  new RegExp(String.raw`(?<![\p{L}\d])${PALAVRA_SENHA}\s+(?:é|eh|nova|atual)\s*[:=]?\s*${VALOR}`, 'iu'),
]

/** true se o texto parece trazer uma senha (o aviso aponta o link Acessos do cliente, o cofre). */
export function detectarSenha(texto: string): boolean {
  return PADROES.some((p) => p.test(texto))
}

const OBVIAS = new Set([
  '1234567890', '12345678910', '0123456789', '1234512345', '1122334455', '1111111111', '0000000000',
  'qwertyuiop', 'asdfghjkl1', 'senha12345', 'senha123456', 'minhasenha', 'minhasenha1', 'mudar12345', 'trocar1234',
  'password12', 'password123', 'password1234', 'passw0rd123', 'iloveyou12', 'abc1234567', 'abcdefghij',
  'abcd123456', 'brasil1234', 'brasil2026', 'melt123456', 'meltcomunicacao', 'melt2026!!', 'pauta12345',
  'admin12345', 'administrador', 'qwerty1234', 'qwerty123456', 'q1w2e3r4t5', '1q2w3e4r5t', 'aaaaaaaaaa',
])

/**
 * Fraca: menos de 10 caracteres, lista de óbvias, um caractere só repetido, ou igual ao e-mail / a parte dele antes do
 * "@" / ao nome. Sem diferenciar caixa.
 */
export function ehSenhaFraca(senha: string, contexto: { email?: string; nome?: string } = {}): boolean {
  if (senha.length < 10) return true
  const s = senha.toLowerCase()
  if (OBVIAS.has(s)) return true
  if (new Set(s).size <= 2) return true
  const proibidas = [contexto.email, contexto.email?.split('@')[0], contexto.nome]
    .filter((x): x is string => !!x && x.length >= 3)
    .map((x) => x.toLowerCase().replace(/\s+/g, ''))
  return proibidas.some((p) => s.replace(/\s+/g, '') === p || (s.includes(p) && s.length - p.length < 4))
}
