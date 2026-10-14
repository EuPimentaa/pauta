/* Aplica o tema guardado (localStorage "pauta:tema", ver src/lib/tema.ts) antes do primeiro quadro, para não piscar.
   Arquivo separado porque a CSP só aceita script de 'self' (nada inline). */
try {
  var t = JSON.parse(localStorage.getItem('pauta:tema') || '"sistema"')
  if (t === 'claro') document.documentElement.setAttribute('data-theme', 'light')
  else if (t === 'escuro') document.documentElement.setAttribute('data-theme', 'dark')
} catch (e) { /* sem armazenamento: segue o sistema */ }
