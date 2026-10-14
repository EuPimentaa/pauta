/** Catálogo: Markdown seguro (com as verificações de segurança ao vivo), editor com @menção, texto puro e copiar. */
import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Botao } from '../../../ui/Botao.tsx'
import { EditorMarkdown } from '../../../ui/EditorMarkdown.tsx'
import { Markdown, markdownParaFragmento } from '../../../ui/Markdown.tsx'
import { avisar } from '../../../ui/avisos.tsx'
import { CopiarTexto, TextoPuro } from '../../../ui/Texto.tsx'
import { Amostra, Bloco, Nota } from './Amostra.tsx'
import { MENCIONAVEIS } from './dados.ts'

const EU = 'u-cami'

/**
 * Casos da API §5.8 e do critério de aceite do PLANO §1.2, conferidos no navegador a cada carga da página. "Sem link" =
 * nenhum <a href> (um <a> que perdeu o href no DOMPurify vira texto no <Markdown>).
 */
const CASOS: { entrada: string; esperado: string; confere(html: string, el: HTMLElement): boolean }[] = [
  { entrada: '[x](javascript:alert(1))', esperado: 'sem link', confere: (_h, el) => !el.querySelector('a[href]') },
  { entrada: '@[Rafa](mencao:u1)', esperado: '<span data-mencao="u1">@Rafa</span>',
    confere: (_h, el) => el.querySelector('span[data-mencao="u1"]')?.textContent === '@Rafa' && !el.querySelector('a[href]') },
  { entrada: '@[Ana](mencao:"><b>x</b>)', esperado: 'id inválido: texto, sem span', confere: (_h, el) => !el.querySelector('span, b') },
  { entrada: '<img src=x onerror=alert(1)>', esperado: 'texto escapado', confere: (_h, el) => !el.querySelector('img') && (el.textContent ?? '').includes('<img') },
  { entrada: '<script>alert(1)</script>', esperado: 'texto escapado', confere: (_h, el) => !el.querySelector('script') },
  { entrada: '![foto](https://exemplo.com/a.png)', esperado: 'sem imagem', confere: (_h, el) => !el.querySelector('img') },
  { entrada: '[site](https://meltcomunicacao.com.br)', esperado: 'link com noopener e _blank',
    confere: (_h, el) => { const a = el.querySelector('a'); return !!a && a.target === '_blank' && (a.rel ?? '').includes('noopener') } },
  { entrada: '[mail](mailto:oi@melt.com.br)', esperado: 'link mailto', confere: (_h, el) => el.querySelector('a')?.getAttribute('href') === 'mailto:oi@melt.com.br' },
  { entrada: '[http](http://exemplo.com)', esperado: 'sem link (só https)', confere: (_h, el) => !el.querySelector('a[href]') },
  { entrada: '[d](data:text/html,oi)', esperado: 'sem link', confere: (_h, el) => !el.querySelector('a[href]') },
  { entrada: '[m](mencao:u1)', esperado: 'sem @ antes: texto', confere: (_h, el) => !el.querySelector('a[href], span') },
]

function VerificacoesMarkdown() {
  const resultados = useMemo(() => CASOS.map((c) => {
    const el = document.createElement('div')
    el.appendChild(markdownParaFragmento(c.entrada))
    const html = el.innerHTML
    return { ...c, html, ok: c.confere(html, el) }
  }), [])
  const tudoOk = resultados.every((r) => r.ok)
  return (
    <div className="cat-verificacoes" data-verificacoes-ok={tudoOk} role="region" aria-label="Verificações de segurança do Markdown">
      <p className="cat-amostra-titulo">{tudoOk ? `${resultados.length} verificações de segurança passaram.` : `${resultados.filter((r) => !r.ok).length} verificações falharam.`}</p>
      <table>
        <thead><tr><th scope="col">Entrada</th><th scope="col">Esperado</th><th scope="col">Saída saneada</th><th scope="col">Resultado</th></tr></thead>
        <tbody>
          {resultados.map((r) => (
            <tr key={r.entrada}>
              <td><code>{r.entrada}</code></td>
              <td>{r.esperado}</td>
              <td><code>{r.html.trim()}</code></td>
              <td>{r.ok
                ? <span className="ui-prazo" data-estado="concluida"><Check aria-hidden="true" />Passou</span>
                : <span className="ui-prazo" data-estado="atrasada"><X aria-hidden="true" />Falhou</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const BRIEFING = `## Briefing
Carrossel com **5 cards** sobre o *Dia do Cliente*, no tom ~~formal~~ próximo e direto.

- Formato: 1080×1350, até 20 palavras por card
- Referência: https://meltcomunicacao.com.br
- [Este link](javascript:alert(1)) não vira link: só https e mailto passam

1. Capa com a pergunta
2. Três dicas
3. Chamada para o site

@[Rafa](mencao:u-rafa) faz a arte e @[Cami](mencao:${EU}) revisa até sexta. Menção com id inválido vira texto: @[Fulano](mencao:<script>).

> Aprovado pelo cliente na R2, com o ajuste do título.

Caminho da pasta: \`M:\\Clientes\\HE\\2026\\10 Outubro\`

<b>HTML cru aparece como texto.</b>`

const WHATSAPP = `[14/10 09:12] Ana (HE): Bom dia! Precisamos do carrossel do Dia do Cliente até sexta 🙏
[14/10 09:13] Ana (HE): segue o link do drive https://drive.google.com/drive/folders/abc e o <b>texto</b> aprovado`

function DemoEditor() {
  const [texto, setTexto] = useState('Oi @[Rafa](mencao:u-rafa), pode ver o **título** do card 2?')
  const [salvo, setSalvo] = useState(texto)
  const buscarPessoas = (termo: string) => {
    const t = termo.toLowerCase()
    return MENCIONAVEIS.filter((p) => p.nome.toLowerCase().includes(t) || (p.apelido ?? '').toLowerCase().includes(t)).slice(0, 8)
  }
  return (
    <Bloco titulo="Editor (TipTap sob demanda; @ menciona; Ctrl+Enter salva)">
      <EditorMarkdown rotulo="Comentário" valor={texto} aoMudar={setTexto} buscarPessoas={buscarPessoas}
        aoSalvar={() => { setSalvo(texto); avisar('Comentário salvo.', { tipo: 'sucesso' }) }} placeholder="Escreva um comentário…" minLinhas={3} />
      <div className="flex justify-end"><Botao variante="secundario" tamanho="p" onClick={() => { setSalvo(texto); avisar('Comentário salvo.', { tipo: 'sucesso' }) }}>Salvar</Botao></div>
      <Bloco titulo="Como fica salvo (Markdown) e exibido">
        <code className="block overflow-x-auto whitespace-pre-wrap rounded-sm bg-sunken p-3 text-meta text-fg-2">{salvo}</code>
        <Markdown texto={salvo} compacto euId={EU} />
      </Bloco>
    </Bloco>
  )
}

export function SecaoConteudo() {
  return (
    <>
      <Amostra rotulo="Markdown">
        <Bloco titulo="Markdown seguro (html:false, DOMPurify, sem dangerouslySetInnerHTML)">
          <Markdown texto={BRIEFING} euId={EU} />
        </Bloco>
      </Amostra>
      <Nota>A menção a você (<code>euId</code>) ganha o laranja cheio; as outras, o laranja suave.</Nota>
      <VerificacoesMarkdown />
      <Amostra rotulo="Editor e texto puro">
        <DemoEditor />
        <Bloco titulo="Texto de fora (WhatsApp): sempre texto puro, nada vira link">
          <TextoPuro texto={WHATSAPP} />
        </Bloco>
        <Bloco titulo="Caminho de rede: copia, nunca vira href">
          <CopiarTexto texto={'M:\\Clientes\\HE\\2026\\10 Outubro\\Carrossel Dia do Cliente'} rotulo="Copiar caminho" avisoCopiado="Caminho copiado." />
        </Bloco>
      </Amostra>
    </>
  )
}
