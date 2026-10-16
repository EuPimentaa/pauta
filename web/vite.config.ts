import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const API = process.env.API_URL ?? 'http://127.0.0.1:7300'

/**
 * Falha o build se o CSS perder o light-dark() nativo. Com um alvo antigo, o minificador troca light-dark() por
 * variáveis --lightningcss-light/dark resolvidas no :root, e as sub-árvores que mudam de tema com color-scheme
 * (.chrome-dark da barra superior, .chrome-light, painéis do /dev/ui) pintam com as cores do tema da página: logo
 * laranja e texto escuro sobre a barra escura. Só aparece em produção (o dev server não minifica).
 */
function exigirLightDarkNativo(): Plugin {
  return {
    name: 'pauta:light-dark-nativo',
    apply: 'build',
    writeBundle(_saida, pacote) {
      for (const arquivo of Object.values(pacote)) {
        if (arquivo.type !== 'asset' || !arquivo.fileName.endsWith('.css')) continue
        if (String(arquivo.source).includes('--lightningcss-')) {
          this.error(`${arquivo.fileName}: light-dark() virou polyfill (--lightningcss-*). Confira build.cssTarget.`)
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), exigirLightDarkNativo()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
  build: {
    // navegadores com light-dark() nativo (Baseline maio/2024, marca §7); ver exigirLightDarkNativo()
    cssTarget: ['chrome123', 'edge123', 'firefox120', 'safari17.5'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': API,
    },
  },
})
