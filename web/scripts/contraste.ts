/**
 * Confere o contraste WCAG 2.x dos pares texto/fundo dos tokens (web/src/estilos/tokens.css), nos dois temas.
 * Sem dependências: lê o CSS, resolve var(), light-dark(), color-mix(in oklab|srgb, ...), oklch() e rgb() com alfa
 * como o navegador faz, e calcula a razão de contraste. Sai com código 1 se algum par ficar abaixo do mínimo.
 *
 *   npm run contraste --workspace web          (ou: node web/scripts/contraste.ts)
 *   node web/scripts/contraste.ts --tudo       (lista também os pares que passaram)
 *
 * Mínimos: texto 4,5:1 (AA); elementos não textuais (contorno de controle, anel de foco) 3:1.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type Tema = 'claro' | 'escuro'
export interface Rgba { r: number; g: number; b: number; a: number }   // sRGB 0..1 (gama), alfa 0..1

// ─────────────────────────────── leitura do CSS ───────────────────────────────

/** Declarações `--nome: valor;` do primeiro bloco `:root { ... }`. */
export function lerTokens(css: string): Map<string, string> {
  const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const inicio = semComentarios.indexOf(':root {')
  if (inicio < 0) throw new Error('tokens.css sem bloco :root')
  let i = semComentarios.indexOf('{', inicio) + 1
  let prof = 1
  let corpo = ''
  for (; i < semComentarios.length && prof > 0; i++) {
    const c = semComentarios[i]
    if (c === '{') prof++
    if (c === '}') prof--
    if (prof > 0) corpo += c
  }
  const mapa = new Map<string, string>()
  let atual = ''
  let profPar = 0
  for (const c of corpo) {
    if (c === '(') profPar++
    if (c === ')') profPar--
    if (c === ';' && profPar === 0) {
      const m = atual.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/)
      if (m) mapa.set(m[1], m[2].replace(/\s+/g, ' '))
      atual = ''
    } else atual += c
  }
  return mapa
}

// ─────────────────────────────── cor ───────────────────────────────

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gama = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const limitar = (x: number) => Math.min(1, Math.max(0, x))

export function paraOklab({ r, g, b }: Rgba): [number, number, number] {
  const R = lin(r), G = lin(g), B = lin(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function deOklab([L, A, Bb]: [number, number, number], a = 1): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * Bb) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * Bb) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * Bb) ** 3
  return {
    r: limitar(gama(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: limitar(gama(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: limitar(gama(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    a,
  }
}

/**
 * oklch(L C H) → sRGB. Os tokens só usam cores DENTRO da gama sRGB (fora dela o navegador faria mapeamento de gama e
 * a cor pintada não seria a medida aqui): fora da gama, erro.
 */
export function deOklch(L: number, C: number, H: number, a = 1): Rgba {
  const rad = (H * Math.PI) / 180
  const A = C * Math.cos(rad), B = C * Math.sin(rad)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  if (linear.some((x) => x < -1e-4 || x > 1 + 1e-4)) throw new Error(`oklch(${L} ${C} ${H}) fica fora da gama sRGB: baixe a croma`)
  return deOklab([L, A, B], a)
}

export function hex(h: string): Rgba {
  let s = h.replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  return { r: parseInt(s.slice(0, 2), 16) / 255, g: parseInt(s.slice(2, 4), 16) / 255, b: parseInt(s.slice(4, 6), 16) / 255, a: 1 }
}

export function paraHex({ r, g, b }: Rgba): string {
  return '#' + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Composição alfa no espaço sRGB com gama (como o navegador pinta). */
export function compor(frente: Rgba, fundo: Rgba): Rgba {
  const a = frente.a + fundo.a * (1 - frente.a)
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
  const mix = (f: number, b: number) => (f * frente.a + b * fundo.a * (1 - frente.a)) / a
  return { r: mix(frente.r, fundo.r), g: mix(frente.g, fundo.g), b: mix(frente.b, fundo.b), a }
}

export function luminancia({ r, g, b }: Rgba): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function razao(a: Rgba, b: Rgba): number {
  const la = luminancia(a), lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ─────────────────────────────── avaliação das expressões ───────────────────────────────

/** Separa os argumentos de uma função CSS por vírgula no nível 0. */
function argumentos(corpo: string): string[] {
  const saida: string[] = []
  let prof = 0
  let atual = ''
  for (const c of corpo) {
    if (c === '(') prof++
    if (c === ')') prof--
    if (c === ',' && prof === 0) { saida.push(atual.trim()); atual = '' } else atual += c
  }
  if (atual.trim()) saida.push(atual.trim())
  return saida
}

/** "nome(corpo)" ocupando a expressão inteira. */
function funcao(expr: string): { nome: string; corpo: string } | null {
  const m = expr.match(/^([\w-]+)\(/)
  if (!m || !expr.endsWith(')')) return null
  let prof = 0
  for (let i = m[1].length; i < expr.length; i++) {
    if (expr[i] === '(') prof++
    if (expr[i] === ')') { prof--; if (prof === 0 && i !== expr.length - 1) return null }
  }
  return { nome: m[1], corpo: expr.slice(m[1].length + 1, -1) }
}

export function avaliar(expr: string, tokens: Map<string, string>, tema: Tema, pilha: string[] = []): Rgba {
  const e = expr.trim()
  if (e.startsWith('#')) return hex(e)
  if (e === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  const f = funcao(e)
  if (!f) throw new Error(`não sei avaliar "${e}"`)
  const args = argumentos(f.corpo)
  switch (f.nome) {
    case 'var': {
      const nome = args[0]
      if (pilha.includes(nome)) throw new Error(`referência circular em ${nome}`)
      const valor = tokens.get(nome)
      if (valor === undefined) {
        if (args[1]) return avaliar(args[1], tokens, tema, pilha)
        throw new Error(`token ${nome} não existe`)
      }
      return avaliar(valor, tokens, tema, [...pilha, nome])
    }
    case 'light-dark':
      return avaliar(tema === 'claro' ? args[0] : args[1], tokens, tema, pilha)
    case 'oklch': {
      const [cor, alfa] = f.corpo.split('/').map((s) => s.trim())
      const [L, C, H] = cor.split(/\s+/).map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : Number(v)))
      if ([L, C, H].some((v) => Number.isNaN(v))) throw new Error(`oklch inválido: "${e}"`)
      return deOklch(L, C, H, alfa === undefined ? 1 : alfa.endsWith('%') ? parseFloat(alfa) / 100 : Number(alfa))
    }
    case 'rgb': case 'rgba': {
      const [cor, alfa] = f.corpo.split('/').map((s) => s.trim())
      const [r, g, b] = cor.split(/[\s,]+/).map(Number)
      const a = alfa === undefined ? 1 : alfa.endsWith('%') ? parseFloat(alfa) / 100 : Number(alfa)
      return { r: r / 255, g: g / 255, b: b / 255, a }
    }
    case 'color-mix': {
      const espaco = args[0].replace(/^in\s+/, '')
      const partes = args.slice(1).map((a) => {
        const m = a.match(/^(.*?)\s+([\d.]+)%$/)
        return m ? { cor: avaliar(m[1], tokens, tema, pilha), p: Number(m[2]) / 100 } : { cor: avaliar(a, tokens, tema, pilha), p: NaN }
      })
      const [x, y] = partes
      if (Number.isNaN(x.p) && Number.isNaN(y.p)) { x.p = 0.5; y.p = 0.5 }
      else if (Number.isNaN(x.p)) x.p = 1 - y.p
      else if (Number.isNaN(y.p)) y.p = 1 - x.p
      const soma = x.p + y.p
      const px = x.p / soma, py = y.p / soma
      const a = x.cor.a * px + y.cor.a * py
      if (espaco === 'oklab') {
        const ox = paraOklab(x.cor), oy = paraOklab(y.cor)
        const pre = (i: number) => (ox[i] * x.cor.a * px + oy[i] * y.cor.a * py) / (a || 1)
        return deOklab([pre(0), pre(1), pre(2)], a * Math.min(1, soma))
      }
      if (espaco === 'srgb') {
        const pre = (k: 'r' | 'g' | 'b') => (x.cor[k] * x.cor.a * px + y.cor[k] * y.cor.a * py) / (a || 1)
        return { r: pre('r'), g: pre('g'), b: pre('b'), a: a * Math.min(1, soma) }
      }
      throw new Error(`color-mix em ${espaco} não suportado`)
    }
    default:
      throw new Error(`função ${f.nome} não suportada`)
  }
}

// ─────────────────────────────── pares conferidos ───────────────────────────────

export const CORES = ['ambar', 'amarelo', 'rosa', 'magenta', 'roxo', 'berinjela', 'verde', 'turquesa', 'azul', 'grafite'] as const

export interface Par {
  texto: string
  fundo: string
  /** Fundo translúcido: compõe sobre estas cores (pior caso) antes de medir. */
  sobre?: string[]
  minimo: number
  nota: string
  /** Só neste tema (a barra superior é sempre escura). */
  tema?: Tema
}

const T = 4.5
const UI = 3

export function pares(): Par[] {
  const lista: Par[] = []
  const p = (texto: string, fundo: string, minimo: number, nota: string, sobre?: string[], tema?: Tema) => lista.push({ texto, fundo, minimo, nota, sobre, tema })
  for (const f of ['--surface', '--surface-sunken', '--bg', '--surface-raised', '--surface-hover']) {
    p('--text', f, T, 'texto'); p('--text-2', f, T, 'texto secundário'); p('--text-3', f, T, 'metadado')
  }
  p('--text-inverse', '--surface-inverse', T, 'tooltip e aviso')
  p('--border-control', '--surface', UI, 'contorno de controle')
  p('--border-control', '--surface-raised', UI, 'contorno de controle no popover')
  p('--accent', '--surface', UI, 'anel de foco e ícone laranja')
  p('--accent-ink', '--surface', T, 'texto laranja'); p('--accent-ink', '--surface-sunken', T, 'texto laranja')
  p('--accent-ink', '--accent-soft', T, 'item selecionado')
  p('--text', '--accent-soft', T, 'item selecionado')
  p('--on-accent', '--accent', T, 'botão primário'); p('--on-accent', '--accent-hover', T, 'botão primário (hover)')
  for (const e of ['success', 'warning', 'danger', 'info']) {
    p(`--${e}-ink`, `--${e}-bg`, T, `estado ${e}`); p(`--${e}-ink`, '--surface', T, `estado ${e}`)
  }
  for (const c of CORES) {
    p(`--label-${c}-ink`, `--label-${c}-bg`, T, `etiqueta ${c}`)
    p(`--label-${c}-ink`, '--surface', T, `etiqueta ${c} no card`)
    // Na coluna tingida só entram --text e --text-2; o card (--surface) leva o --text-3 e as etiquetas.
    p('--text', `--coluna-${c}-bg`, T, `coluna ${c}: título`)
    p('--text-2', `--coluna-${c}-bg`, T, `coluna ${c}: rodapé e ícones`)
    p('--text', '--surface', T, `card sobre a coluna ${c}: título`)
    p('--text-3', '--surface', T, `card sobre a coluna ${c}: metadado`)
  }
  // pílula do contador da coluna (--surface) e o destaque do limite WIP
  p('--text-2', '--surface', T, 'contador da coluna')
  p('--accent-ink', '--accent-soft', T, 'contador acima do limite WIP')
  // coluna sem cor
  p('--text', '--coluna-sem-cor-bg', T, 'coluna sem cor: título'); p('--text-2', '--coluna-sem-cor-bg', T, 'coluna sem cor: rodapé')
  for (const f of ['grafite', 'berinjela', 'cobalto']) for (const s of ['a', 'b']) {
    p('--text', `--fundo-${f}-${s}`, T, `nome do quadro no fundo ${f}`); p('--text-2', `--fundo-${f}-${s}`, T, `fundo ${f}`)
  }
  for (const s of ['a', 'b', 'c']) { p('--text', `--fundo-aurora-${s}`, T, 'fundo aurora'); p('--text-2', `--fundo-aurora-${s}`, T, 'fundo aurora') }
  // vidro: pior caso sobre preto e branco puros (marca §8)
  const extremos = ['#000000', '#FFFFFF']
  p('--text', '--glass-bg', T, 'texto no vidro', extremos)
  p('--text-2', '--glass-bg', T, 'texto secundário no vidro', extremos)
  p('--glass-text-3', '--glass-bg', T, 'metadado no vidro', extremos)
  p('--text', '--glass-solido', T, 'vidro sem blur', extremos)
  // camadas (modal, folha, popover, menu) e a barra superior (sempre escura)
  p('--text', '--glass-bg-camada', T, 'texto na camada', extremos)
  p('--text-2', '--glass-bg-camada', T, 'texto secundário na camada', extremos)
  p('--glass-text-3', '--glass-bg-camada', T, 'metadado na camada', extremos)
  p('--text', '--glass-bg-topo', T, 'texto na barra superior', extremos, 'escuro')
  p('--text-2', '--glass-bg-topo', T, 'texto secundário na barra superior', extremos, 'escuro')
  // card selecionado e o sinal do card (véu sobre a superfície)
  p('--text-2', '--accent-soft', T, 'card selecionado: metadado (sobe para --text-2)')
  p('--text-2', '--veu-1', T, 'sinal do card (parado há)', ['var(--surface)'])
  return lista
}

export interface Resultado extends Par { tema: Tema; valor: number; ok: boolean; cores: string }

export function conferir(css: string): Resultado[] {
  const tokens = lerTokens(css)
  const saida: Resultado[] = []
  for (const tema of ['claro', 'escuro'] as const) {
    for (const par of pares().filter((x) => !x.tema || x.tema === tema)) {
      const texto = avaliar(`var(${par.texto})`, tokens, tema)
      const fundoBase = avaliar(`var(${par.fundo})`, tokens, tema)
      const fundos = fundoBase.a < 1 ? (par.sobre ?? ['var(--bg)']).map((s) => compor(fundoBase, avaliar(s, tokens, tema))) : [fundoBase]
      let pior = Infinity
      let descricao = ''
      for (const f of fundos) {
        const t = texto.a < 1 ? compor(texto, f) : texto
        const r = razao(t, f)
        if (r < pior) { pior = r; descricao = `${paraHex(t)} em ${paraHex(f)}` }
      }
      saida.push({ ...par, tema, valor: pior, ok: pior >= par.minimo, cores: descricao })
    }
  }
  return saida
}

/** Matiz OKLCH (graus, 0–360) de uma cor. */
export function matiz(c: Rgba): number {
  const [, a, b] = paraOklab(c)
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return h < 0 ? h + 360 : h
}

/**
 * A tinta de cada coluna (--coluna-<cor>-bg, oklch nos dois temas) tem que ter a matiz do hex da marca da cor
 * (--label-<cor> no claro), com folga de 0,15°: o pastel é derivado da marca, não uma cor nova. Devolve os problemas.
 */
export function conferirMatizes(css: string): string[] {
  const tokens = lerTokens(css)
  const problemas: string[] = []
  for (const c of CORES) {
    const valor = tokens.get(`--coluna-${c}-bg`) ?? ''
    const lados = [...valor.matchAll(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)/g)]
    if (lados.length !== 2) { problemas.push(`--coluna-${c}-bg: esperado light-dark(oklch(…), oklch(…))`); continue }
    if (c === 'grafite') {
      if (lados.some((m) => Number(m[2]) !== 0)) problemas.push('--coluna-grafite-bg: o grafite é neutro (croma 0)')
      continue
    }
    const alvo = matiz(avaliar(`var(--label-${c})`, tokens, 'claro'))
    for (const m of lados) {
      const h = Number(m[3])
      const dif = Math.abs(((h - alvo + 540) % 360) - 180)
      if (dif > 0.15) problemas.push(`--coluna-${c}-bg: matiz ${h} difere da marca (${alvo.toFixed(1)})`)
    }
  }
  return problemas
}

function principal() {
  const caminho = fileURLToPath(new URL('../src/estilos/tokens.css', import.meta.url))
  const css = readFileSync(caminho, 'utf8')
  const resultados = conferir(css)
  const tudo = process.argv.includes('--tudo')
  const falhas = resultados.filter((r) => !r.ok)
  const fmt = (n: number) => n.toFixed(2).replace('.', ',')
  for (const r of tudo ? resultados : falhas) {
    console.log(`${r.ok ? 'ok   ' : 'FALHA'} ${r.tema.padEnd(6)} ${fmt(r.valor).padStart(6)}:1 (mín. ${fmt(r.minimo)})  ${r.texto} em ${r.fundo}  [${r.cores}]  ${r.nota}`)
  }
  const matizes = conferirMatizes(css)
  for (const m of matizes) console.log(`FALHA tinta ${m}`)
  const menor = (t: Tema) => Math.min(...resultados.filter((r) => r.tema === t && r.minimo === T).map((r) => r.valor))
  console.log(`\n${resultados.length} pares conferidos, ${falhas.length} abaixo do mínimo; ` +
    `${CORES.length} tintas de coluna com a matiz da marca${matizes.length ? `: ${matizes.length} com problema` : ''}. ` +
    `Menor razão de texto: claro ${fmt(menor('claro'))}:1, escuro ${fmt(menor('escuro'))}:1.`)
  if (falhas.length || matizes.length) process.exit(1)
}

if (import.meta.main) principal()
