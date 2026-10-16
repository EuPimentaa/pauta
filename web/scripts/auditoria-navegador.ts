/**
 * Auditoria de navegador do design system (parte do "pronto", PLANO §0 regra 8): abre o /dev/ui (e, com login, a
 * casca e o menu do avatar) num Chrome headless, nos dois temas, a 1440 e a 390 px, e confere o que o contraste.ts
 * não vê porque só lê tokens:
 *   - foco: percorre a página no Tab e acusa toda parada sem anel (box-shadow ou contorno com o --accent, no próprio
 *     elemento ou na moldura que mostra o foco dele: .ui-entrada, .ui-check-caixa, .ui-editor);
 *   - contraste composto: cada texto visível contra o fundo real, com a opacidade e o alfa somados (AA: 4,5:1; 3:1 em
 *     texto grande), e os pares não textuais (bolinha do interruptor no trilho, caixa marcada do checkbox na
 *     superfície em volta): 3:1;
 *   - piso de tipo (marca §4): texto lido com 12 px ou mais; 11 px só no micro (700, caixa alta), em kbd e em
 *     números; iniciais do avatar com 10 px ou mais;
 *   - rolagem lateral: nenhuma.
 *
 *   node web/scripts/auditoria-navegador.ts --url http://localhost:5173 [--chrome <chrome.exe | http://127.0.0.1:9222>]
 *     [--capturas <pasta>] [--so claro|escuro] [--larguras 1440,390]
 *   Login opcional (casca e menu do avatar): AUDITORIA_EMAIL e AUDITORIA_SENHA no ambiente.
 * Sai com código 1 se achar algum problema. Sem dependências: fala CDP direto (scripts/cdp.ts).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { abrirAba, capturar, iniciarChrome, navegar, tecla, viewport, type Aba } from './cdp.ts'

const { values: arg } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5173' },
    chrome: { type: 'string', default: process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    capturas: { type: 'string' },
    so: { type: 'string' },
    larguras: { type: 'string', default: '1440,390' },
    'max-tabs': { type: 'string', default: '600' },
  },
})
const BASE = arg.url!.replace(/\/$/, '')
const temas = (['claro', 'escuro'] as const).filter((t) => !arg.so || arg.so === t)
const larguras = arg.larguras!.split(',').map(Number)

// ─────────────────────────────── código que roda na página ───────────────────────────────

/** Funções injetadas na página (window.__aud). Texto puro: roda no navegador, não no Node. */
const NA_PAGINA = String.raw`
(() => {
  const ACENTO = [254, 80, 0]
  const rgba = (s) => {
    const m = s && s.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = ({ r, g, b }) => {
    const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const razao = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const sobre = (cima, baixo) => ({
    r: cima.r * cima.a + baixo.r * (1 - cima.a), g: cima.g * cima.a + baixo.g * (1 - cima.a), b: cima.b * cima.a + baixo.b * (1 - cima.a), a: 1,
  })
  const hex = (c) => '#' + [c.r, c.g, c.b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase()
  const temAcento = (s) => {
    if (!s || s === 'none') return false
    for (const m of s.matchAll(/rgba?\(([^)]+)\)/g)) {
      const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number)
      if (Math.abs(p[0] - ACENTO[0]) < 8 && Math.abs(p[1] - ACENTO[1]) < 8 && Math.abs(p[2] - ACENTO[2]) < 8 && (p[3] ?? 1) > 0.5) return true
    }
    return false
  }
  const descrever = (el) => {
    const nome = el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    const classe = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''
    const secao = el.closest('section[id], [data-secao], .cat-secao')
    return el.tagName.toLowerCase() + (classe ? '.' + classe : '') + (nome ? ' "' + nome + '"' : '') + (secao && secao.id ? ' #' + secao.id : '')
  }
  /** O anel aparece no próprio elemento ou na moldura que mostra o foco dele. */
  const temAnel = (el) => {
    const cs = getComputedStyle(el)
    if (temAcento(cs.boxShadow)) return true
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 && temAcento(cs.outlineColor)) return true
    const moldura = el.closest('.ui-entrada, .ui-check-caixa, .ui-editor')
    if (moldura) {
      const m = getComputedStyle(moldura)
      if (temAcento(m.boxShadow) || temAcento(m.borderColor)) return true
      // campo inválido: o foco sai na cor do erro (a sombra de 1 px na cor da borda dobra a borda)
      if (moldura.matches('[data-invalido="true"]') && m.boxShadow.includes(m.borderTopColor)) return true
    }
    return false
  }
  /** Cor de fundo efetiva atrás de el (compõe os fundos translúcidos até um opaco). null = imagem/gradiente no meio. */
  const fundo = (el) => {
    const camadas = []
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
      const c = rgba(cs.backgroundColor)
      if (c && c.a > 0) { camadas.push(c); if (c.a >= 0.999) break }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 }
    const ultimo = camadas[camadas.length - 1]
    if (!ultimo || ultimo.a < 0.999) {
      const b = rgba(getComputedStyle(document.body).backgroundColor)
      if (b && b.a >= 0.999) base = b
    }
    for (let i = camadas.length - 1; i >= 0; i--) base = camadas[i].a >= 0.999 ? camadas[i] : sobre(camadas[i], base)
    return base
  }
  const opacidade = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o }
  const visivel = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') return false
    if (el.closest('[inert], [data-medindo]')) return false
    // fora da tela por recorte (sr-only)
    if (cs.clipPath === 'inset(50%)' || (cs.position === 'absolute' && r.width <= 1 && r.height <= 1)) return false
    return true
  }
  const desabilitado = (el) => !!el.closest(':disabled, [aria-disabled="true"], [data-desabilitado="true"], [data-inativo="true"], .ui-botao:disabled')

  window.__aud = {
    foco() {
      const el = document.activeElement
      if (!el || el === document.body || el === document.documentElement) return null
      const r = el.getBoundingClientRect()
      return { id: descrever(el), anel: temAnel(el), chave: el.tagName + '|' + Math.round(r.left + scrollX) + '|' + Math.round(r.top + scrollY) + '|' + descrever(el) }
    },
    rolagemLateral() {
      return { largura: innerWidth, rolagem: document.documentElement.scrollWidth }
    },
    textos() {
      const problemas = []
      const vistos = new Set()
      const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let t = andar.nextNode(); t; t = andar.nextNode()) {
        const texto = t.textContent.trim()
        if (!texto) continue
        const el = t.parentElement
        if (!el || vistos.has(el) || !visivel(el)) continue
        vistos.add(el)
        if (el.closest('script, style, noscript, .ui-tooltip, [data-auditoria="ignorar"]')) continue
        const cs = getComputedStyle(el)
        const px = parseFloat(cs.fontSize)
        const peso = Number(cs.fontWeight)
        const caixaAlta = cs.textTransform === 'uppercase'
        const avatar = el.closest('.ui-avatar, .ui-pilha-mais')
        // piso de tipo (marca §4)
        const numeros = /^[\d\s+\-–:,./%×]+$/.test(texto)
        const piso = avatar ? 10 : (el.closest('kbd') || numeros || (caixaAlta && peso >= 700)) ? 11 : 12
        if (px + 0.01 < piso) problemas.push({ tipo: 'tipo', id: descrever(el), detalhe: px.toFixed(2) + ' px (mínimo ' + piso + ')' })
        // contraste composto
        if (desabilitado(el)) continue
        const cor = rgba(cs.color)
        if (!cor || cor.a === 0) continue
        const atras = fundo(el)
        if (!atras) continue
        const efetiva = sobre({ ...cor, a: cor.a * opacidade(el) }, atras)
        const grande = px >= 24 || (px >= 18.66 && peso >= 700)
        const minimo = grande ? 3 : 4.5
        const r = razao(efetiva, atras)
        if (r + 0.005 < minimo) problemas.push({ tipo: 'contraste', id: descrever(el), detalhe: r.toFixed(2) + ':1 (' + hex(efetiva) + ' sobre ' + hex(atras) + ', mínimo ' + minimo + ')' })
      }
      // não textuais: bolinha do interruptor sobre o trilho; caixa marcada sobre a superfície em volta
      for (const tr of document.querySelectorAll('.ui-interruptor-trilho')) {
        if (!visivel(tr) || tr.disabled) continue
        const bola = rgba(getComputedStyle(tr, '::after').backgroundColor)
        const trilho = fundo(tr)
        if (!bola || !trilho) continue
        const r = razao(sobre(bola, trilho), trilho)
        if (r < 3) problemas.push({ tipo: 'nao-texto', id: descrever(tr.closest('label, .ui-interruptor') || tr) + ' (bolinha/trilho)', detalhe: r.toFixed(2) + ':1' })
      }
      for (const cx of document.querySelectorAll('.ui-check-caixa')) {
        const input = cx.querySelector('input')
        if (!visivel(cx) || !input || !(input.checked || input.indeterminate) || input.disabled) continue
        const cs = getComputedStyle(cx)
        const caixa = rgba(cs.backgroundColor)
        const borda = rgba(cs.borderTopColor)
        const em_volta = cx.parentElement ? fundo(cx.parentElement) : null
        if (!caixa || !em_volta) continue
        const r = Math.max(razao(sobre(caixa, em_volta), em_volta), borda ? razao(sobre(borda, em_volta), em_volta) : 0)
        if (r < 3) problemas.push({ tipo: 'nao-texto', id: descrever(cx.closest('label') || cx) + ' (caixa marcada)', detalhe: r.toFixed(2) + ':1' })
      }
      return problemas
    },
  }
})()
`

// ─────────────────────────────── roteiro ───────────────────────────────

interface Problema { onde: string; tipo: string; id: string; detalhe?: string }
const problemas: Problema[] = []
const resumo: string[] = []

async function percorrerTab(aba: Aba, onde: string, maxTabs: number): Promise<number> {
  await aba.avaliar('document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); true')
  const vistas = new Set<string>()
  let primeira: string | null = null
  let paradas = 0
  for (let i = 0; i < maxTabs; i++) {
    await tecla(aba, 'Tab')
    const f = await aba.avaliar<{ id: string; anel: boolean; chave: string } | null>('window.__aud.foco()')
    if (!f) continue
    if (f.chave === primeira) break
    primeira ??= f.chave
    if (vistas.has(f.chave)) continue
    vistas.add(f.chave)
    paradas++
    if (!f.anel) problemas.push({ onde, tipo: 'foco', id: f.id })
  }
  // tira o foco antes de seguir (o anel não pode contaminar as medidas de contraste)
  await aba.avaliar('document.activeElement && document.activeElement.blur(); true')
  return paradas
}

async function auditarPagina(aba: Aba, onde: string): Promise<void> {
  await aba.avaliar(NA_PAGINA)
  const rol = await aba.avaliar<{ largura: number; rolagem: number }>('window.__aud.rolagemLateral()')
  if (rol.rolagem > rol.largura) problemas.push({ onde, tipo: 'rolagem', id: 'página', detalhe: `scrollWidth ${rol.rolagem} > ${rol.largura}` })
  for (const p of await aba.avaliar<{ tipo: string; id: string; detalhe: string }[]>('window.__aud.textos()')) problemas.push({ onde, ...p })
  const paradas = await percorrerTab(aba, onde, Number(arg['max-tabs']))
  resumo.push(`${onde}: ${paradas} paradas no Tab`)
}

async function entrar(aba: Aba): Promise<boolean> {
  const email = process.env.AUDITORIA_EMAIL
  const senha = process.env.AUDITORIA_SENHA
  if (!email || !senha) return false
  const st = await aba.avaliar<number>(`fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json',
    'X-Trace-Id': crypto.randomUUID() }, body: JSON.stringify(${JSON.stringify({ email, senha })}) }).then((r) => r.status)`)
  if (st !== 200) throw new Error(`login da auditoria respondeu ${st}`)
  return true
}

const chrome = await iniciarChrome(arg.chrome!)
try {
  for (const tema of temas) {
    for (const largura of larguras) {
      const aba = await abrirAba(chrome.endereco)
      const sufixo = `${tema}-${largura}`
      try {
        await viewport(aba, largura, largura < 768 ? 844 : 900, tema === 'escuro')
        await navegar(aba, `${BASE}/dev/ui`, 1500)
        if (arg.capturas) { mkdirSync(arg.capturas, { recursive: true }); writeFileSync(join(arg.capturas, `devui-${sufixo}.png`), await capturar(aba, true)) }
        await auditarPagina(aba, `/dev/ui ${sufixo}`)

        await navegar(aba, `${BASE}/entrar`)
        await aba.avaliar(NA_PAGINA)
        for (const p of await aba.avaliar<{ tipo: string; id: string; detalhe: string }[]>('window.__aud.textos()')) problemas.push({ onde: `/entrar ${sufixo}`, ...p })
        if (await entrar(aba)) {
          await navegar(aba, `${BASE}/inicio`, 1500)
          if (arg.capturas) writeFileSync(join(arg.capturas, `casca-${sufixo}.png`), await capturar(aba))
          await auditarPagina(aba, `casca ${sufixo}`)
          // menu do avatar (rádio de tema e itens): abre pelo botão e percorre dentro dele
          const abriu = await aba.avaliar<boolean>(`(() => { const b = document.querySelector('.casca-avatar-botao'); if (!b) return false; b.click(); return true })()`)
          if (abriu) {
            await new Promise((r) => setTimeout(r, 400))
            await aba.avaliar(NA_PAGINA)
            for (const p of await aba.avaliar<{ tipo: string; id: string; detalhe: string }[]>('window.__aud.textos()')) problemas.push({ onde: `menu do avatar ${sufixo}`, ...p })
            const paradas = await percorrerTab(aba, `menu do avatar ${sufixo}`, 30)
            resumo.push(`menu do avatar ${sufixo}: ${paradas} paradas no Tab`)
          }
        }
      } finally {
        await aba.fechar()
      }
    }
  }
} finally {
  await chrome.parar()
}

for (const linha of resumo) console.log(linha)
if (problemas.length === 0) {
  console.log('auditoria de navegador: nenhum problema')
} else {
  const porTipo = new Map<string, Problema[]>()
  for (const p of problemas) porTipo.set(p.tipo, [...(porTipo.get(p.tipo) ?? []), p])
  for (const [tipo, lista] of porTipo) {
    console.log(`\n${tipo} (${lista.length}):`)
    for (const p of lista) console.log(`  [${p.onde}] ${p.id}${p.detalhe ? ` — ${p.detalhe}` : ''}`)
  }
  process.exitCode = 1
}
