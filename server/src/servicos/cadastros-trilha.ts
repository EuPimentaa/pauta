/**
 * Trilha de aprovações do cliente (API.md §4.10, aba Aprovações; F5): todas as decisões das demandas do cliente,
 * mais novas primeiro, inclusive as anuladas. O cliente da demanda não muda depois do envio (gatilho
 * cliente_fixo_apos_envio), então a decisão é sempre do cliente em que a demanda está.
 */
import type { Canal, Id, ItemTrilhaCliente } from '../../../shared/tipos/index.ts'
import { todos, um, type Db } from '../db.ts'
import { naoEncontrado } from '../erros.ts'

type Linha = Record<string, unknown>

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome

/** "Fulana" (contato), o nome informado no link ou "registrado por Pri". */
function quem(l: Linha): string {
  if (l.contato_nome) return String(l.contato_nome)
  if (l.nome_informado) return String(l.nome_informado)
  if (l.registrado_nome) return `registrado por ${l.registrado_apelido ? String(l.registrado_apelido) : primeiroNome(String(l.registrado_nome))}`
  return 'Cliente'
}

export function trilhaDoCliente(db: Db, clienteId: Id): ItemTrilhaCliente[] {
  if (!um(db, 'SELECT 1 FROM cliente WHERE id = ?', clienteId)) throw naoEncontrado('Cliente não encontrado.')
  return todos<Linha>(db, `
    SELECT a.id, a.decisao, a.via, a.canal, a.nome_informado, a.registrado_por, a.comentario, a.criado_em, a.anulada_em,
           d.id AS demanda_id, d.numero, d.titulo, v.numero AS versao_numero,
           cc.nome AS contato_nome, u.nome AS registrado_nome, u.apelido AS registrado_apelido
      FROM aprovacao a
      JOIN demanda d ON d.id = a.demanda_id
      JOIN versao v ON v.id = a.versao_id
      LEFT JOIN cliente_contato cc ON cc.id = a.contato_id
      LEFT JOIN usuario u ON u.id = a.registrado_por
     WHERE d.cliente_id = ? AND d.excluido_em IS NULL
     ORDER BY a.criado_em DESC, a.rowid DESC`, clienteId)
    .map((l): ItemTrilhaCliente => ({
      aprovacaoId: String(l.id),
      demanda: { id: String(l.demanda_id), numero: Number(l.numero), titulo: String(l.titulo) },
      versaoNumero: Number(l.versao_numero),
      decisao: l.decisao as ItemTrilhaCliente['decisao'],
      via: l.via as ItemTrilhaCliente['via'],
      canal: (l.canal ?? null) as Canal | null,
      quem: quem(l),
      registradoPor: (l.registrado_por ?? null) as Id | null,
      comentario: (l.comentario ?? null) as string | null,
      criadoEm: String(l.criado_em),
      anuladaEm: (l.anulada_em ?? null) as string | null,
    }))
}
