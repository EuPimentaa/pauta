/**
 * Trilha de aprovações do cliente (API.md §4.10, aba Aprovações; F5): todas as decisões das demandas do cliente,
 * mais novas primeiro, inclusive as anuladas. O cliente da demanda não muda depois do envio (gatilho
 * cliente_fixo_apos_envio), então a decisão é sempre do cliente em que a demanda está. Pelo link, a decisão vinda da
 * mesma rede de uma sessão interna traz quem eram (`redeInterna`, para todos) e o admin vê também o aparelho e o
 * navegador (`dispositivo`, do user-agent gravado): com o endereço do link, alguém da agência decide como o cliente, e
 * a trilha precisa deixar isso distinguível (API.md §4.17).
 */
import type { Canal, Id, ItemTrilhaCliente } from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
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

/**
 * O aparelho e o navegador do user-agent, para a trilha do admin: "iPhone · Safari", "Windows · Chrome", "Android ·
 * Samsung Internet". Sem nenhum dos dois conhecidos, o começo do texto ("curl/8.4.0", "python-requests/2.32"). Vazio → null.
 */
export function dispositivoDoUa(ua: string | null | undefined): string | null {
  const s = (ua ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (!s) return null
  const sistema = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android'
    : /Windows/.test(s) ? 'Windows' : /CrOS/.test(s) ? 'Chromebook' : /Macintosh|Mac OS X/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : null
  const navegador = /Edg(A|iOS)?\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /SamsungBrowser\//.test(s) ? 'Samsung Internet'
    : /Firefox\/|FxiOS\//.test(s) ? 'Firefox' : /Chrome\/|CriOS\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : null
  if (!sistema && !navegador) return s.split(/[\s(;]/)[0]!.slice(0, 40)
  return [sistema, navegador].filter(Boolean).join(' · ')
}

export function trilhaDoCliente(db: Db, clienteId: Id, ator: Ator): ItemTrilhaCliente[] {
  if (!um(db, 'SELECT 1 FROM cliente WHERE id = ?', clienteId)) throw naoEncontrado('Cliente não encontrado.')
  const admin = ator.papel === 'admin'
  return todos<Linha>(db, `
    SELECT a.id, a.decisao, a.via, a.canal, a.nome_informado, a.registrado_por, a.comentario, a.criado_em, a.anulada_em,
           a.rede_interna, a.user_agent, d.id AS demanda_id, d.numero, d.titulo, v.numero AS versao_numero,
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
      redeInterna: typeof l.rede_interna === 'string' ? (JSON.parse(l.rede_interna) as Id[]) : [],
      dispositivo: admin && l.via === 'link' ? dispositivoDoUa(l.user_agent as string | null) : null,
    }))
}
