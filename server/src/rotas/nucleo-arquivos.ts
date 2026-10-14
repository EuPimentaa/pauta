/**
 * Arquivos (API.md §4.14): upload multipart (campo `arquivo`, um por chamada; o bodyLimit global recusa acima de
 * 10 MiB + 64 KiB pelo Content-Length) e download autenticado (`?inline=1` só para imagem).
 */
import { exigirUsuario, type App } from '../auth.ts'
import { tx } from '../db.ts'
import { validacao } from '../erros.ts'
import { lerArquivo, respostaArquivo, salvarUpload } from '../servicos/arquivos.ts'

export function registrar(app: App): void {
  app.post('/api/arquivos', exigirUsuario, async (c) => {
    let corpo: Record<string, string | File | (string | File)[]>
    try {
      corpo = await c.req.parseBody({ all: true })
    } catch {
      throw validacao('Envie o arquivo como multipart/form-data.', { arquivo: 'corpo inválido' })
    }
    const campo = corpo.arquivo
    const arquivo = Array.isArray(campo) ? campo[0] : campo
    if (!(arquivo instanceof File)) throw validacao('Envie o arquivo no campo "arquivo".', { arquivo: 'obrigatório' })
    const conteudo = new Uint8Array(await arquivo.arrayBuffer())
    const db = c.get('db')
    return c.json(tx(db, () => salvarUpload(db, conteudo, arquivo.name, c.get('ator'))), 201)
  })

  app.get('/api/arquivos/:id', exigirUsuario, (c) => {
    const { info, caminho } = lerArquivo(c.get('db'), c.req.param('id'))
    return respostaArquivo(info, caminho, { inline: c.req.query('inline') === '1' })
  })
}
