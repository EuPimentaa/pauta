/**
 * "Colar do WhatsApp" (API.md §4.13): lê a conversa colada, separa as mensagens pelos cabeçalhos do WhatsApp e sugere
 * cliente, modelo e título. Puro: o servidor responde POST /api/entrada/analisar com isto (com os contatos dos
 * clientes) e a Nova demanda monta o trecho "Pedido pelo WhatsApp" da descrição com as mesmas mensagens.
 *
 * Cabeçalhos reconhecidos (com ou sem ano, com ou sem segundos):
 *   [14/10 15:32] Fulana: texto            [14/10/2026, 15:32:10] Fulana: texto
 *   [15:32, 14/10/2026] Fulana: texto      (copiar do WhatsApp Web)
 *   14/10/2026 15:32 - Fulana: texto       (exportar conversa)
 * Linha sem cabeçalho continua a mensagem anterior. Texto sem nenhum cabeçalho vira uma mensagem sem autor.
 *
 * O texto de fora é texto puro (PLANO §0, regra 9): o trecho que vai para a descrição sai com a sintaxe do Markdown
 * escapada (o componente Markdown mostra os caracteres como foram escritos; links https continuam clicáveis).
 */
import type { AnaliseTexto } from '../tipos/demandas.ts'
import type { DataLocal, HoraLocal, Id } from '../tipos/nucleo.ts'
import { ehDataLocal, instanteSP, somarDias } from './datas.ts'
import { detectarSenha } from './senha.ts'
import { normalizarAlias } from './texto.ts'
import { NAO_SAO_SIGLA } from './rapida.ts'

export interface MensagemConversa {
  autor: string | null
  data: DataLocal | null
  hora: HoraLocal | null
  texto: string
}

const dois = (n: number | string) => String(n).padStart(2, '0')

/** Ano de 2 dígitos vira 20xx; sem ano, o de `hoje` (ou o anterior, se a data cairia mais de um dia no futuro). */
function dataDe(dia: string, mes: string, ano: string | undefined, hoje: DataLocal): DataLocal | null {
  const anoHoje = Number(hoje.slice(0, 4))
  let a = ano ? Number(ano.length === 2 ? `20${ano}` : ano) : anoHoje
  let d = `${a}-${dois(mes)}-${dois(dia)}`
  if (!ano && ehDataLocal(d) && d > somarDias(hoje, 1)) {
    a -= 1
    d = `${a}-${dois(mes)}-${dois(dia)}`
  }
  return ehDataLocal(d) ? d : null
}

function horaDe(h: string, m: string): HoraLocal | null {
  const hh = Number(h)
  const mm = Number(m)
  return hh <= 23 && mm <= 59 ? `${dois(hh)}:${dois(mm)}` : null
}

type Cabecalho = { autor: string; data: DataLocal | null; hora: HoraLocal | null; texto: string }

const FORMATOS: ((linha: string, hoje: DataLocal) => Cabecalho | null)[] = [
  (linha, hoje) => {
    const m = /^\[(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?,?\s+(\d{1,2}):(\d{2})(?::\d{2})?\]\s*([^:\n]{1,80}?):\s?(.*)$/.exec(linha)
    return m ? { data: dataDe(m[1]!, m[2]!, m[3], hoje), hora: horaDe(m[4]!, m[5]!), autor: m[6]!, texto: m[7]! } : null
  },
  (linha, hoje) => {
    const m = /^\[(\d{1,2}):(\d{2})(?::\d{2})?,\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\]\s*([^:\n]{1,80}?):\s?(.*)$/.exec(linha)
    return m ? { data: dataDe(m[3]!, m[4]!, m[5], hoje), hora: horaDe(m[1]!, m[2]!), autor: m[6]!, texto: m[7]! } : null
  },
  (linha, hoje) => {
    const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?,?\s+(\d{1,2}):(\d{2})\s*[-–]\s*([^:\n]{1,80}?):\s?(.*)$/.exec(linha)
    return m ? { data: dataDe(m[1]!, m[2]!, m[3], hoje), hora: horaDe(m[4]!, m[5]!), autor: m[6]!, texto: m[7]! } : null
  },
]

/** Caracteres invisíveis que o WhatsApp põe na cópia (marcas de direção, espaço sem quebra). */
function limparInvisiveis(s: string): string {
  return s.replace(/[‎‏‪-‮⁦-⁩﻿]/g, '').replace(/ /g, ' ')
}

/** As mensagens da conversa, na ordem. `hoje` decide o ano quando o cabeçalho não traz. */
export function lerConversa(texto: string, hoje: DataLocal): MensagemConversa[] {
  const msgs: MensagemConversa[] = []
  for (const bruta of limparInvisiveis(texto).replace(/\r\n?/g, '\n').split('\n')) {
    const linha = bruta.trimEnd()
    let cab: Cabecalho | null = null
    for (const f of FORMATOS) if ((cab = f(linha.trimStart(), hoje))) break
    if (cab) {
      msgs.push({ autor: cab.autor.trim() || null, data: cab.data, hora: cab.hora, texto: cab.texto.trim() })
    } else if (msgs.length > 0) {
      const ultima = msgs[msgs.length - 1]!
      ultima.texto = ultima.texto ? `${ultima.texto}\n${linha}` : linha
    } else if (linha.trim()) {
      msgs.push({ autor: null, data: null, hora: null, texto: linha })
    }
  }
  for (const m of msgs) m.texto = m.texto.replace(/\n{3,}/g, '\n\n').trim()
  return msgs.filter((m) => m.texto && !/^<(m[íi]dia oculta|media omitted|arquivo de m[íi]dia oculto)>$/i.test(m.texto))
}

// ─────────────────────────────── título ───────────────────────────────

const SAUDACAO = /^(oi+|ola|opa|e ai|bom dia|boa tarde|boa noite|tudo bem|tudo bom|td bem|obrigad[oa]|valeu|ok|okay|blz|beleza|show|perfeito|combinado|certo|isso|sim|nao)\b/
const PEDIDO = /^(?:(?:a gente|nos|n[oó]s|eu)\s+)?(?:(?:vamos\s+)?precis(?:a|amos|o|aria(?:mos)?|ando)|gostar[ií]a(?:mos)?|quer(?:ia(?:mos)?|o|emos)|(?:voc[eê]s?\s+)?(?:pode(?:m|ria(?:m)?)?|consegue(?:m)?)(?:\s+(?:fazer|criar|preparar|montar|produzir))?|tem como(?:\s+(?:fazer|criar|preparar|montar))?|seria (?:bom|legal) (?:ter|fazer))\s+(?:de\s+|da\s+|do\s+)?(?:(?:um|uma|uns|umas|o|a|os|as)\s+)?/i

function maiuscula(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1) : s
}

/** Uma linha que diz o pedido, sem saudação nem "precisamos de um", cortada na primeira frase e em até 80 caracteres. */
export function tituloDaConversa(msgs: readonly MensagemConversa[]): string {
  const linhas = msgs.flatMap((m) => m.texto.split('\n')).map((l) => l.trim()).filter(Boolean)
  let escolhida = ''
  for (const l of linhas) {
    // tira a saudação do começo ("Oi Pri, tudo bem? Precisamos...") antes de decidir
    const semSaudacao = l.replace(/^((oi+|ol[aá]|opa|bom dia|boa tarde|boa noite)(?=[\s,!.?]|$)[^.!?\n]{0,25}[,!.?]\s*)+/i, '')
      .replace(/^(tudo bem|tudo bom|td bem)(?=[\s,!.?]|$)\s*\??\s*/i, '').trim()
    const n = normalizarAlias(semSaudacao)
    if (!n || (SAUDACAO.test(n) && n.length < 40) || n.split(' ').length < 2) continue
    escolhida = semSaudacao
    break
  }
  if (!escolhida) escolhida = linhas[0] ?? ''
  let t = escolhida.replace(PEDIDO, '').replace(/^[\s:,;–—-]+/, '')
  const fimFrase = /[.!?;](\s|$)/.exec(t)
  if (fimFrase && fimFrase.index >= 12) t = t.slice(0, fimFrase.index)
  t = t.replace(/[\s.,;:!?–—-]+$/, '').replace(/\s+/g, ' ').trim()
  if (t.length > 80) {
    const corte = t.lastIndexOf(' ', 80)
    t = t.slice(0, corte > 40 ? corte : 80).replace(/[\s,;:–—-]+$/, '')
  }
  return maiuscula(t)
}

// ─────────────────────────────── cliente e modelo ───────────────────────────────

export interface ClienteAnalise {
  id: Id
  sigla: string
  nome: string
  /** Normalizados. */
  apelidos: readonly string[]
  /** Nomes dos contatos ativos (casam com o autor das mensagens). */
  contatos?: readonly string[]
}

export interface ModeloAnalise {
  id: Id
  nome: string
}

export interface ContextoAnalise {
  clientes: readonly ClienteAnalise[]
  modelos: readonly ModeloAnalise[]
  /** Nomes das pessoas da agência: o autor que for um deles não é o cliente. */
  internos?: readonly string[]
  hoje: DataLocal
}

const escaparRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** O termo aparece como palavra inteira (no texto normalizado: minúsculo, sem acento). */
function temPalavra(normalizado: string, termo: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escaparRe(termo)}($|[^a-z0-9])`).test(normalizado)
}

/** Palavras que não identificam modelo sozinhas. */
const VAZIAS = new Set(['de', 'do', 'da', 'dos', 'das', 'ou', 'e', 'para', 'com', 'um', 'uma', 'outro', 'material', 'page'])
/** Sinônimos por palavra do nome do modelo (normalizada). Sem entrada: a própria palavra e o plural com "s". */
const SINONIMOS: Record<string, string[]> = {
  post: ['post', 'posts', 'postagem', 'postagens', 'arte', 'artes', 'feed', 'publicacao'],
  carrossel: ['carrossel', 'carrosseis', 'carousel', 'carrosel', 'lamina', 'laminas'],
  reels: ['reels', 'reel'],
  stories: ['stories', 'story', 'storie', 'storys'],
  video: ['video', 'videos', 'edicao', 'filmagem'],
  site: ['site', 'sites', 'landing', 'landingpage', 'lp', 'ecommerce', 'pagina'],
  landing: ['landing', 'landingpage', 'lp'],
  ajuste: ['ajuste', 'ajustes', 'ajustar', 'alterar', 'alteracao', 'corrigir', 'correcao'],
  relatorio: ['relatorio', 'relatorios', 'report', 'resultados', 'metricas'],
  anuncio: ['anuncio', 'anuncios', 'ads', 'impulsionar', 'impulsionamento', 'trafego', 'patrocinado'],
  campanha: ['campanha', 'campanhas'],
  grafico: ['grafico', 'grafica', 'impresso', 'impressao', 'banner', 'folder', 'cartao', 'adesivo', 'flyer', 'panfleto', 'cartaz'],
}

interface GrupoModelo { principal: string; termos: string[] }

/** "Ajuste de site" → [ajuste] e [site] (as duas contam); "Site ou landing page" → um grupo só, com as alternativas. */
function gruposDoModelo(nome: string): GrupoModelo[] {
  const partes = normalizarAlias(nome).split(/\s+ou\s+/)
  const palavras = (s: string) => s.split(/[^a-z0-9]+/).filter((p) => p.length >= 2 && !VAZIAS.has(p))
  const termosDe = (p: string) => SINONIMOS[p] ?? [p, `${p}s`]
  if (partes.length > 1) {
    const todas = partes.flatMap(palavras)
    if (todas.length === 0) return []
    return [{ principal: todas[0]!, termos: [...new Set(todas.flatMap(termosDe))] }]
  }
  return palavras(partes[0]!).map((p) => ({ principal: p, termos: termosDe(p) }))
}

/**
 * Modelos pelas palavras do nome (e sinônimos), na ordem da sugestão: primeiro quem casou mais (a palavra do próprio
 * nome vale 1 e o sinônimo 0,85; "ajustar o site" casa as duas de "Ajuste de site" e só uma de "Site ou landing
 * page"), depois a confiança = 0,55 + 0,45 × (o que casou / grupos do nome).
 */
export function sugerirModelos(normalizado: string, modelos: readonly ModeloAnalise[]): AnaliseTexto['modelos'] {
  const saida: (AnaliseTexto['modelos'][number] & { soma: number })[] = []
  for (const m of modelos) {
    const grupos = gruposDoModelo(m.nome)
    if (grupos.length === 0) continue
    let soma = 0
    let casou = ''
    for (const g of grupos) {
      const termo = g.termos.find((t) => temPalavra(normalizado, t))
      if (!termo) continue
      soma += termo === g.principal || termo === `${g.principal}s` ? 1 : 0.85
      casou ||= termo
    }
    if (soma === 0) continue
    saida.push({ id: m.id, confianca: Math.round((0.55 + 0.45 * (soma / grupos.length)) * 100) / 100, casou, soma })
  }
  saida.sort((a, b) => b.soma - a.soma || b.confianca - a.confianca)
  return saida.slice(0, 3).map(({ soma: _s, ...r }) => r)
}

/**
 * Clientes citados: a sigla escrita em maiúsculas como palavra (0,9), o nome ou um apelido de duas palavras ou mais
 * (0,85), apelido de uma palavra com 4 letras ou mais (0,75), e o autor da mensagem igual a um contato (0,7).
 */
export function sugerirClientes(original: string, normalizado: string, autores: readonly string[], clientes: readonly ClienteAnalise[]): AnaliseTexto['clientes'] {
  const autoresN = autores.map(normalizarAlias)
  const saida: AnaliseTexto['clientes'] = []
  for (const c of clientes) {
    const achados: { confianca: number; casou: string }[] = []
    const sigla = c.sigla.trim()
    if (sigla && new RegExp(`(^|[^\\p{L}\\p{N}])${escaparRe(sigla)}($|[^\\p{L}\\p{N}])`, 'u').test(original)) achados.push({ confianca: 0.9, casou: sigla })
    const siglaN = normalizarAlias(sigla)
    for (const a of new Set([normalizarAlias(c.nome), ...c.apelidos.map(normalizarAlias)])) {
      if (!a || a === siglaN) continue
      const multi = a.includes(' ')
      if (!multi && a.length < 4) continue
      if (temPalavra(normalizado, a)) achados.push({ confianca: multi ? 0.85 : 0.75, casou: a })
    }
    for (const contato of c.contatos ?? []) {
      const n = normalizarAlias(contato)
      const primeiro = n.split(' ')[0] ?? ''
      if (n && autoresN.some((x) => x === n || (primeiro.length >= 3 && x === primeiro) || x.startsWith(`${n} `))) {
        achados.push({ confianca: 0.7, casou: `contato ${contato}` })
      }
    }
    const melhor = achados.sort((a, b) => b.confianca - a.confianca)[0]
    if (melhor) saida.push({ id: c.id, ...melhor })
  }
  return saida.sort((a, b) => b.confianca - a.confianca).slice(0, 3)
}

/** Sigla em maiúsculas que parece cliente ("XYZ: ...", "[XYZ]", "cliente XYZ") e não casa ninguém. */
export function siglaNovaDaConversa(msgs: readonly MensagemConversa[], conhecidas: ReadonlySet<string>): string | null {
  const candidatas: string[] = []
  for (const m of msgs) {
    for (const linha of m.texto.split('\n')) {
      const ini = /^\s*\[?([A-Z][A-Z0-9]{1,11})\]?\s*(?::|\s-)\s/.exec(linha)
      if (ini) candidatas.push(ini[1]!)
      for (const x of linha.matchAll(/\[([A-Z][A-Z0-9]{1,11})\]/g)) candidatas.push(x[1]!)
      for (const x of linha.matchAll(/\bcliente\s+([A-Z][A-Z0-9]{1,11})\b/gi)) if (/^[A-Z0-9]+$/.test(x[1]!)) candidatas.push(x[1]!)
    }
  }
  return candidatas.find((s) => !conhecidas.has(normalizarAlias(s)) && !NAO_SAO_SIGLA.has(s)) ?? null
}

/** POST /api/entrada/analisar. */
export function analisarConversa(texto: string, ctx: ContextoAnalise): AnaliseTexto {
  const msgs = lerConversa(texto, ctx.hoje)
  const corpo = msgs.map((m) => m.texto).join('\n')
  const internos = new Set((ctx.internos ?? []).map(normalizarAlias))
  const ehInterno = (a: string) => {
    const n = normalizarAlias(a)
    return internos.has(n) || [...internos].some((i) => i.split(' ')[0] === n)
  }
  const autores = [...new Set(msgs.map((m) => m.autor).filter((a): a is string => !!a))]
  const autorCliente = autores.find((a) => !ehInterno(a)) ?? autores[0] ?? null
  const doCliente = autorCliente ? msgs.filter((m) => m.autor === autorCliente) : msgs
  const primeira = doCliente.find((m) => m.data) ?? msgs.find((m) => m.data) ?? null
  const recebidoEm = primeira?.data ? instanteSP(primeira.data, primeira.hora ?? '12:00').toISOString() : null
  const normalizado = normalizarAlias(corpo)
  const clientes = sugerirClientes(corpo, normalizado, autores, ctx.clientes)
  const conhecidas = new Set(ctx.clientes.flatMap((c) => [normalizarAlias(c.sigla), ...c.apelidos.map(normalizarAlias)]))
  return {
    tituloSugerido: tituloDaConversa(doCliente.length ? doCliente : msgs),
    autor: autorCliente,
    recebidoEm,
    clientes,
    siglaNova: clientes.length === 0 ? siglaNovaDaConversa(msgs, conhecidas) : null,
    modelos: sugerirModelos(normalizado, ctx.modelos),
    senhaDetectada: detectarSenha(texto),
  }
}

// ─────────────────────────────── prazo pedido na conversa ───────────────────────────────

const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
const PRAZO = /\b(?:ate|para|pra|prazo|entreg\w*)\b[^.\n?!]{0,24}?\b(hoje|depois de amanha|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g

/**
 * Prazo que a conversa pede ("até sexta", "para amanhã", "entrega dia 24/10"): a última menção com "até", "para",
 * "pra", "prazo" ou "entrega" antes do dia. Dia da semana = o próximo depois de hoje; data sem ano = a próxima (não
 * volta no tempo). Nada disso na conversa: null (vale o prazo do modelo).
 */
export function prazoDaConversa(msgs: readonly MensagemConversa[], hoje: DataLocal): { data: DataLocal; casou: string } | null {
  let achado: { data: DataLocal; casou: string } | null = null
  for (const m of msgs) {
    const n = normalizarAlias(m.texto.replace(/-feira/gi, ''))
    for (const x of n.matchAll(PRAZO)) {
      const alvo = x[1]!
      let data: DataLocal | null = null
      if (alvo === 'hoje') data = hoje
      else if (alvo === 'amanha') data = somarDias(hoje, 1)
      else if (alvo === 'depois de amanha') data = somarDias(hoje, 2)
      else if (DIAS.includes(alvo)) {
        const alvoDia = DIAS.indexOf(alvo)
        const hojeDia = new Date(`${hoje}T12:00:00Z`).getUTCDay()
        data = somarDias(hoje, ((alvoDia - hojeDia + 7) % 7) || 7)
      } else {
        const [d, mes, a] = alvo.split('/')
        const ano = Number(hoje.slice(0, 4))
        let c: DataLocal | null = a ? dataDe(d!, mes!, a, hoje) : `${ano}-${dois(mes!)}-${dois(d!)}`
        if (c && !a && c < hoje) c = `${ano + 1}-${dois(mes!)}-${dois(d!)}`
        if (c && ehDataLocal(c) && c >= hoje) data = c
      }
      if (data) achado = { data, casou: x[0].trim() }
    }
  }
  return achado
}

// ─────────────────────────────── trecho da descrição ───────────────────────────────

/** Escapa o que o markdown-it leria como sintaxe: o texto do cliente aparece como foi escrito (regra 9). */
export function escaparMarkdown(linha: string): string {
  return linha
    .replace(/([\\`*_[\]~<>|])/g, '\\$1')
    .replace(/^(\s*)([#>+-])(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, '$1$2\\$3')
}

const LIMITE_TRECHO = 6000

/**
 * "## Pedido pelo WhatsApp" com as mensagens em citação (autor e hora em negrito, uma vez por sequência do mesmo
 * autor), já escapadas. Longa demais: corta e avisa (o texto inteiro fica em `origemTexto`).
 */
export function trechoDaConversa(msgs: readonly MensagemConversa[]): string {
  if (msgs.length === 0) return ''
  const linhas: string[] = ['## Pedido pelo WhatsApp']
  let anterior: string | null | undefined
  let tamanho = 0
  let cortou = false
  for (const m of msgs) {
    const bloco: string[] = []
    if (m.autor !== anterior) {
      if (anterior !== undefined) bloco.push('')
      const quando = m.data ? `${m.data.slice(8, 10)}/${m.data.slice(5, 7)}${m.hora ? ` ${m.hora}` : ''}` : ''
      if (m.autor || quando) bloco.push(`> **${escaparMarkdown(m.autor ?? 'Mensagem')}**${quando ? ` · ${quando}` : ''}`, '>')
      anterior = m.autor
    }
    for (const l of m.texto.split('\n')) bloco.push(l.trim() ? `> ${escaparMarkdown(l)}` : '>')
    const novo = bloco.join('\n').length
    if (tamanho + novo > LIMITE_TRECHO) { cortou = true; break }
    tamanho += novo
    linhas.push(...bloco)
  }
  if (cortou) linhas.push('', '_A conversa continua no texto original._')
  return linhas.join('\n')
}
