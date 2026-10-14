/**
 * Entrada do app. O tema já foi aplicado antes do primeiro quadro por /tema.js (public); aqui só confirmamos a
 * preferência guardada e montamos o React.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { aplicarTema, lerPreferenciaTema } from './lib/tema.ts'

aplicarTema(lerPreferenciaTema())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
