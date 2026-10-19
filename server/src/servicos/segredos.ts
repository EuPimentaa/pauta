/**
 * Fase 2, CONTRATO (F7, F8 e F9 usam; muda só por pedido): a rede de segurança contra segredo em log, no resultado de
 * uma ferramenta do MCP (que fica guardado na conversa) e em `tarefa_execucao.detalhe` (API.md §F.1).
 *
 * Quem chama continua responsável por não pôr o segredo no texto (a URL da Windsor e o endereço iCal nunca entram numa
 * mensagem de erro; o corpo de erro da Windsor nunca sai de resultados-windsor.ts). Isto só mascara o que escapar:
 * a chave da Windsor (em claro, codificada e em qualquer caixa), `api_key=`, o token do endereço iCal (`private-…`),
 * os tokens OAuth (`pauta_at_…`, `pauta_rt_…`), `Bearer …` e os parâmetros do OAuth (`code=`, `state=`…).
 */
import { config } from '../config.ts'

const PADROES: [RegExp, string][] = [
  [/api_key=[^&\s"'<>]+/gi, 'api_key=***'],
  [/private-[0-9a-f]+/gi, 'private-***'],
  [/pauta_(at|rt)_[\w-]+/g, 'pauta_$1_***'],
  [/Bearer\s+[\w.~+/-]+=*/gi, 'Bearer ***'],
  [/\b(code|code_verifier|code_challenge|state|access_token|refresh_token|token)=[^&\s"'<>]+/gi, '$1=***'],
]

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * O texto sem segredos. `extras`: segredos do contexto (o endereço iCal decifrado, por exemplo); a chave da Windsor do
 * ambiente entra sempre. Segredos com menos de 8 caracteres são ignorados (mascarar "a" estragaria tudo).
 */
export function mascararSegredos(texto: string, extras: readonly (string | null | undefined)[] = []): string {
  let t = texto
  for (const s of [config.windsorApiKey, ...extras]) {
    if (!s || s.length < 8) continue
    for (const forma of new Set([s, encodeURIComponent(s)])) t = t.replace(new RegExp(escaparRegex(forma), 'gi'), '***')
  }
  for (const [re, troca] of PADROES) t = t.replace(re, troca)
  return t
}

/**
 * Uma linha segura sobre um erro qualquer: `${e.name}: ${mensagem mascarada}`, até 300 caracteres. Nunca o stack, a
 * `cause` nem o `input` (o fetch do Node põe a URL inteira em "Failed to parse URL from …").
 */
export function descreverErro(e: unknown, extras: readonly (string | null | undefined)[] = []): string {
  const nome = e instanceof Error ? e.name : typeof e
  const mensagem = e instanceof Error ? e.message : String(e)
  return `${nome}: ${mascararSegredos(mensagem, extras)}`.slice(0, 300)
}

/**
 * O `.catch` obrigatório de todo `void busca…()` em segundo plano (sem ele, a rejeição derruba o processo no Node 24 e
 * imprime o erro inteiro): `void buscar(...).catch(registrarFalhaMascarada('windsor busca'))`.
 */
export function registrarFalhaMascarada(rotulo: string, extras: readonly (string | null | undefined)[] = []):
  (e: unknown) => void {
  return (e) => { console.error(`${rotulo}: ${descreverErro(e, extras)}`) }
}
