/**
 * Dica de sessão do servidor (server/src/auth.ts, COOKIE_DICA_SESSAO): "1" quando há sessão interna, sem httpOnly e
 * sem segredo. O bootstrap a usa para não pedir o que daria 401; a página pública, para saber que quem abriu o link é
 * da agência (faixa "Prévia" e botões de decisão desligados; o servidor responde 403 previa_interna de todo jeito).
 * Sem dependências: a página pública importa daqui e continua leve.
 */
export const DICA_SESSAO = 'pauta_sessao'

export function temDicaSessao(): boolean {
  return typeof document !== 'undefined' && document.cookie.split(/;\s*/).some((c) => c.startsWith(`${DICA_SESSAO}=`))
}
