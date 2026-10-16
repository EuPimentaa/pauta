/**
 * Cliente mínimo do Chrome DevTools Protocol, sem dependências (WebSocket, fetch e child_process do Node 24).
 * Cada `abrirAba` cria um contexto de navegação próprio (cookies e localStorage isolados) e o descarta no fim: nada
 * toca nas outras abas de um Chrome compartilhado.
 *
 *   const chrome = await iniciarChrome('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')  // ou um endereço
 *   const aba = await abrirAba(chrome.endereco)
 *   await navegar(aba, 'http://localhost:5173/dev/ui')
 *   await aba.fechar(); await chrome.parar()
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Mensagem { id?: number; result?: any; error?: { message: string }; method?: string; params?: any }

/** Conexão WebSocket com comandos numerados e eventos por nome. */
class Conexao {
  private seq = 0
  private pendentes = new Map<number, { ok: (v: any) => void; falha: (e: Error) => void }>()
  private ouvintes = new Map<string, ((p: any) => void)[]>()
  private ws: WebSocket

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String(ev.data)) as Mensagem
      if (m.id !== undefined) {
        const p = this.pendentes.get(m.id)
        this.pendentes.delete(m.id)
        if (m.error) p?.falha(new Error(m.error.message))
        else p?.ok(m.result)
      } else if (m.method) {
        const lista = this.ouvintes.get(m.method)
        if (lista?.length) {
          this.ouvintes.set(m.method, [])
          lista.forEach((f) => f(m.params))
        }
      }
    })
  }

  static async abrir(url: string): Promise<Conexao> {
    const ws = new WebSocket(url)
    await new Promise<void>((ok, falha) => {
      ws.addEventListener('open', () => ok(), { once: true })
      ws.addEventListener('error', () => falha(new Error(`WebSocket do CDP falhou: ${url}`)), { once: true })
    })
    return new Conexao(ws)
  }

  enviar<T = any>(metodo: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.seq
    this.ws.send(JSON.stringify({ id, method: metodo, params }))
    return new Promise((ok, falha) => this.pendentes.set(id, { ok, falha }))
  }

  esperar<T = any>(evento: string, ms = 15_000): Promise<T> {
    return new Promise((ok, falha) => {
      const t = setTimeout(() => falha(new Error(`sem ${evento} em ${ms} ms`)), ms)
      const lista = this.ouvintes.get(evento) ?? []
      lista.push((p) => { clearTimeout(t); ok(p) })
      this.ouvintes.set(evento, lista)
    })
  }

  fechar(): void {
    try { this.ws.close() } catch { /* já fechada */ }
  }
}

export interface Aba {
  enviar<T = any>(metodo: string, params?: Record<string, unknown>): Promise<T>
  /** Espera o próximo evento com esse nome (ou o tempo acabar). */
  esperar<T = any>(evento: string, ms?: number): Promise<T>
  /** Avalia uma expressão na página (await permitido) e devolve o valor. Erro da página vira exceção aqui. */
  avaliar<T = any>(expressao: string): Promise<T>
  fechar(): Promise<void>
}

export interface Chrome { endereco: string; parar(): Promise<void> }

/**
 * `alvo` é o executável do Chrome (sobe um headless com perfil temporário próprio) ou o endereço de um Chrome já
 * aberto com --remote-debugging-port (http://127.0.0.1:9222).
 */
export async function iniciarChrome(alvo: string): Promise<Chrome> {
  if (/^https?:\/\//.test(alvo)) return { endereco: alvo.replace(/\/$/, ''), parar: async () => undefined }
  const perfil = mkdtempSync(join(tmpdir(), 'pauta-chrome-'))
  const proc = spawn(alvo, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', 'about:blank',
  ], { stdio: 'ignore' })
  let falhou: Error | null = null
  proc.once('error', (e) => { falhou = e })
  const arquivo = join(perfil, 'DevToolsActivePort')
  for (let i = 0; i < 100 && !existsSync(arquivo) && !falhou; i++) await dormir(100)
  if (falhou) throw new Error(`não foi possível abrir o Chrome em ${alvo}: ${(falhou as Error).message} (use --chrome)`)
  if (!existsSync(arquivo)) { proc.kill(); throw new Error(`o Chrome não abriu a porta de depuração (${alvo})`) }
  const porta = readFileSync(arquivo, 'utf8').split('\n')[0]!.trim()
  return {
    endereco: `http://127.0.0.1:${porta}`,
    /** Fecha o Chrome e apaga o perfil temporário (espera o processo sair, que solta os arquivos). */
    async parar() {
      const saiu = new Promise<void>((ok) => { if (proc.exitCode !== null) ok(); else proc.once('exit', () => ok()) })
      proc.kill()
      await Promise.race([saiu, dormir(5000)])
      try { rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* fica no temp do sistema */ }
    },
  }
}

/** Aba nova num contexto isolado (sem cookies nem localStorage de ninguém). */
export async function abrirAba(endereco: string): Promise<Aba> {
  const versao = (await (await fetch(`${endereco}/json/version`)).json()) as { webSocketDebuggerUrl: string }
  const navegador = await Conexao.abrir(versao.webSocketDebuggerUrl)
  const { browserContextId } = await navegador.enviar<{ browserContextId: string }>('Target.createBrowserContext', { disposeOnDetach: true })
  const { targetId } = await navegador.enviar<{ targetId: string }>('Target.createTarget', { url: 'about:blank', browserContextId })
  const pagina = await Conexao.abrir(`${endereco.replace(/^http/, 'ws')}/devtools/page/${targetId}`)
  const aba: Aba = {
    enviar: (m, p) => pagina.enviar(m, p),
    esperar: (e, ms) => pagina.esperar(e, ms),
    async avaliar(expressao) {
      const r = await pagina.enviar('Runtime.evaluate', { expression: expressao, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(`na página: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
      return r.result.value
    },
    async fechar() {
      pagina.fechar()
      await navegador.enviar('Target.closeTarget', { targetId }).catch(() => undefined)
      await navegador.enviar('Target.disposeBrowserContext', { browserContextId }).catch(() => undefined)
      navegador.fechar()
    },
  }
  await aba.enviar('Page.enable')
  await aba.enviar('Runtime.enable')
  return aba
}

/** Navega e espera o load + o tempo de a SPA montar. */
export async function navegar(aba: Aba, url: string, esperaMs = 700): Promise<void> {
  const carregou = aba.esperar('Page.loadEventFired', 30_000)
  await aba.enviar('Page.navigate', { url })
  await carregou
  await dormir(esperaMs)
}

/**
 * Viewport com o tema do sistema emulado (e movimento reduzido, para as capturas não pegarem transição). Abaixo de
 * 768 px emula um telefone: tela de toque (pointer: coarse), como o modo de dispositivo do DevTools.
 */
export async function viewport(aba: Aba, largura: number, altura: number, escuro: boolean): Promise<void> {
  const celular = largura < 768
  await aba.enviar('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 1, mobile: celular })
  await aba.enviar('Emulation.setTouchEmulationEnabled', { enabled: celular, maxTouchPoints: celular ? 5 : 1 })
  await aba.enviar('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: escuro ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }],
  })
}

/** PNG da janela (ou da página inteira com `inteira`). */
export async function capturar(aba: Aba, inteira = false): Promise<Buffer> {
  const r = await aba.enviar<{ data: string }>('Page.captureScreenshot', { format: 'png', captureBeyondViewport: inteira })
  return Buffer.from(r.data, 'base64')
}

const TECLAS = { Tab: 9, Escape: 27, Enter: 13 } as const

/** Uma tecla (Tab, Shift+Tab, Escape, Enter). */
export async function tecla(aba: Aba, nome: keyof typeof TECLAS, shift = false): Promise<void> {
  const base = { key: nome, code: nome, windowsVirtualKeyCode: TECLAS[nome], modifiers: shift ? 8 : 0 }
  await aba.enviar('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(nome === 'Enter' ? { text: '\r' } : {}) })
  await aba.enviar('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
}
