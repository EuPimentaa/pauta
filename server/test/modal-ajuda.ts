/**
 * O que só os testes do modal (F1) usam: um PNG mínimo enviado por salvarUpload(), uma aprovação com print de
 * evidência por SQL (sem o código do F2) e a rodada de ajuste "Ajustes R2" pelo abrirRodada() do núcleo.
 */
import { agora, novoId, rodar, tx, um, type Db } from '../src/db.ts'
import type { Ator } from '../src/auth.ts'
import { salvarUpload } from '../src/servicos/arquivos.ts'
import { abrirRodada } from '../src/servicos/demandas.ts'
import type { Ambiente } from './ajuda.ts'

/** Bytes de um PNG de 1×1 (o magic number basta para o upload). */
export const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

/** Um PDF mínimo (o magic number %PDF). */
export const PDF_MINIMO = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')

/** Envia um arquivo pelo serviço do núcleo (o mesmo do POST /api/arquivos). */
export function enviar(a: Ambiente, ator: Ator, bytes: Uint8Array = PNG_1X1, nome = 'print.png'): string {
  return tx(a.db, () => salvarUpload(a.db, bytes, nome, ator)).id
}

/**
 * Anexo de evidência + aprovação manual da última versão enviada que aponta para ele (o que o "Registrar retorno"
 * do F2 grava). A demanda precisa estar enviada (`criarDemanda({ ate: 'enviada' })`) ou com a aprovação anterior
 * anulada.
 */
export function aprovarComPrint(a: Ambiente, demandaId: string): { anexoId: string; aprovacaoId: string } {
  const db = a.db
  return tx(db, () => {
    const arquivoId = salvarUpload(db, PNG_1X1, 'whatsapp.png', a.ator(a.pessoas.am)).id
    const anexoId = novoId()
    rodar(db, `INSERT INTO anexo (id, demanda_id, finalidade, tipo, nome, arquivo_id, provedor, pos, enviado_por, criado_em)
               VALUES (?, ?, 'evidencia', 'arquivo', 'whatsapp.png', ?, 'arquivo', 9999, ?, ?)`,
    anexoId, demandaId, arquivoId, a.pessoas.am.id, agora())
    const d = um<{ quadro_id: string; coluna_id: string }>(db, 'SELECT quadro_id, coluna_id FROM demanda WHERE id = ?', demandaId)!
    const versao = um<{ id: string }>(db, `SELECT id FROM versao WHERE demanda_id = ? AND enviada_cliente_em IS NOT NULL
      ORDER BY numero DESC LIMIT 1`, demandaId)!.id
    const aprovacaoId = novoId()
    rodar(db, `INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, canal, registrado_por, evidencia_anexo_id,
                 quadro_antes_id, coluna_antes_id, criado_em) VALUES (?, ?, ?, 'aprovado', 'manual', 'whatsapp', ?, ?, ?, ?, ?)`,
    aprovacaoId, demandaId, versao, a.pessoas.am.id, anexoId, d.quadro_id, d.coluna_id, agora())
    return { anexoId, aprovacaoId }
  })
}

/** Anula a aprovação (o print continua sendo prova). */
export function anular(db: Db, aprovacaoId: string, por: string): void {
  tx(db, () => rodar(db, 'UPDATE aprovacao SET anulada_em = ?, anulada_por = ? WHERE id = ?', agora(), por, aprovacaoId))
}

/** Rodada 2 com o checklist "Ajustes R2" (o que o ajuste do cliente abre). Devolve o id do checklist. */
export function abrirAjustes(a: Ambiente, demandaId: string, linhas = ['Trocar a foto', 'Aumentar o logo']): string {
  return tx(a.db, () => abrirRodada(a.db, { demandaId, origem: 'interna', linhas, motivo: 'outro', ator: a.ator(a.pessoas.am) })).checklist.id
}
