/**
 * Fase 2 (F8): as contas da Windsor e a ligação de cada cliente às suas (API.md §F.8; "Contas de resultados").
 *
 * Lista de contas (GET /api/resultados/contas, admin e atendimento): cache de 24 h por conector (windsor_conta +
 * windsor_lista, migração 120). A origem é o `ds-accounts` documentado; se ele vier vazio (a pesquisa mediu `[]` com
 * chave inválida, então vazio não prova nada), cai para o endpoint de dados com `account_id,account_name` dos últimos
 * 90 dias, que traz pelo menos as contas com dados. Conta fora das duas listas: "Digitar o id" na tela (ligar com o
 * nome). "Recarregar lista": só admin, 1 a cada 10 min. A conta que some da lista fica com o nome antigo.
 *
 * Ligar e desligar (`cliente.editar`, conferido na rota): id normalizado (Meta sem "act_"; Google Ads de 10 dígitos
 * vira 000-000-0000; só dígitos e hífen), nome da lista ou o digitado; atividade `cliente.editado` com
 * `campos: ['contasResultados']` e o SSE `resultado_cliente`. O cache do conector vence sozinho (`contas` mudou).
 */
import {
  CONECTORES_WINDSOR, type ConectorWindsor, type ContaLigada, type ContaWindsor, type EstadoWindsor, type ErroWindsor, type Id,
  type LigarContaEntrada, type ListarContasWindsorSaida,
} from '../../../shared/tipos/index.ts'
import { hojeSP, somarDias } from '../../../shared/logica/datas.ts'
import { idConta } from '../../../shared/logica/resultados-calculo.ts'
import type { Ator } from '../auth.ts'
import { agora, agoraData, novoId, rodar, todos, tx, um, type Db } from '../db.ts'
import { conflito, ErroHttp, naoEncontrado, validacao } from '../erros.ts'
import { registrarAtividade } from './atividade.ts'
import { contasLigadas, emitirEstadoResultados } from './resultados.ts'
import { chamarContas, chamarDados, FalhaWindsor, limparNome, TETO_DIA, temChave, usoHoje, type ContaDaLista } from './resultados-windsor.ts'
import { descreverErro } from './segredos.ts'

/** A lista de contas vale por 24 h. */
export const LISTA_VALIDADE_MS = 24 * 3_600_000
/** "Recarregar lista": 1 a cada 10 min. */
export const RECARREGAR_A_CADA_MS = 10 * 60_000
/** Depois de um erro, a lista é buscada de novo só depois disto. */
const LISTA_REPETIR_ERRO_MS = 10 * 60_000

interface Memoria {
  buscando: Promise<void> | null
  recarregadaEm: number | null
}
const memorias = new WeakMap<Db, Memoria>()
function memoria(db: Db): Memoria {
  let m = memorias.get(db)
  if (!m) {
    m = { buscando: null, recarregadaEm: null }
    memorias.set(db, m)
  }
  return m
}

// ─────────────────────────────── ids ───────────────────────────────

/** O id como o Pauta guarda, ou null se não for um id de conta. */
export function normalizarContaId(conector: ConectorWindsor, bruto: string): string | null {
  let id = idConta(bruto.replace(/\s+/g, ''))
  if (conector === 'google_ads' && /^\d{10}$/.test(id)) id = `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`
  return /^[0-9-]{1,40}$/.test(id) && /\d/.test(id) ? id : null
}

// ─────────────────────────────── lista da Windsor ───────────────────────────────

interface LinhaLista { conector: ConectorWindsor; buscada_em: string | null; tentada_em: string; erro: ErroWindsor | null }

function listaVencida(l: LinhaLista | undefined): boolean {
  if (!l) return true
  const agoraMs = Date.parse(agora())
  if (l.buscada_em && agoraMs - Date.parse(l.buscada_em) <= LISTA_VALIDADE_MS) return false
  return !(l.erro && agoraMs - Date.parse(l.tentada_em) < LISTA_REPETIR_ERRO_MS)
}

/** ds-accounts; vazio → o endpoint de dados com os campos de conta dos últimos 90 dias. */
async function buscarListaConector(db: Db, conector: ConectorWindsor): Promise<{ contas: ContaDaLista[]; origem: 'ds_accounts' | 'dados' }> {
  const contas = await chamarContas(db, conector)
  if (contas.length > 0) return { contas, origem: 'ds_accounts' }
  const ontem = somarDias(hojeSP(agoraData()), -1)
  const linhas = await chamarDados(db, {
    conector, campos: ['account_id', 'account_name'], de: somarDias(ontem, -89), ate: ontem, contas: [],
  })
  const vistas = new Map<string, ContaDaLista>()
  for (const l of linhas) {
    const contaId = normalizarContaId(conector, String(l.account_id ?? ''))
    if (!contaId) continue
    vistas.set(contaId, { contaId, nome: limparNome(l.account_name) || contaId, status: null })
  }
  return { contas: [...vistas.values()], origem: 'dados' }
}

function gravarLista(db: Db, conector: ConectorWindsor, r: { contas: ContaDaLista[]; origem: 'ds_accounts' | 'dados' } | { erro: ErroWindsor }): void {
  const instante = agora()
  tx(db, () => {
    if ('erro' in r) {
      rodar(db, `INSERT INTO windsor_lista (conector, origem, buscada_em, tentada_em, erro) VALUES (?, NULL, NULL, ?, ?)
                 ON CONFLICT (conector) DO UPDATE SET tentada_em = excluded.tentada_em, erro = excluded.erro`, conector, instante, r.erro)
      return
    }
    for (const c of r.contas) {
      rodar(db, `INSERT INTO windsor_conta (conector, conta_id, nome, status, vista_em) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (conector, conta_id) DO UPDATE SET nome = excluded.nome, status = excluded.status, vista_em = excluded.vista_em`,
      conector, c.contaId, c.nome.slice(0, 200), c.status, instante)
    }
    rodar(db, `INSERT INTO windsor_lista (conector, origem, buscada_em, tentada_em, erro) VALUES (?, ?, ?, ?, NULL)
               ON CONFLICT (conector) DO UPDATE SET origem = excluded.origem, buscada_em = excluded.buscada_em,
                 tentada_em = excluded.tentada_em, erro = NULL`, conector, r.origem, instante, instante)
  })
}

/** Busca a lista dos conectores pedidos (uma busca por vez; quem chega durante, espera a mesma). */
function buscarLista(db: Db, conectores: readonly ConectorWindsor[]): Promise<void> {
  const m = memoria(db)
  if (m.buscando) return m.buscando
  const p = (async () => {
    try {
      await Promise.all(conectores.map(async (conector) => {
        try {
          gravarLista(db, conector, await buscarListaConector(db, conector))
        } catch (e) {
          if (!(e instanceof FalhaWindsor)) console.error(`resultados lista ${conector}: ${descreverErro(e)}`)
          gravarLista(db, conector, { erro: e instanceof FalhaWindsor ? e.erro : 'fora_do_ar' })
        }
      }))
    } finally {
      m.buscando = null
    }
  })()
  m.buscando = p
  return p
}

function montarLista(db: Db): ContaWindsor[] {
  const ligacoes = todos<{ conector: ConectorWindsor; conta_id: string; nome: string; cliente_id: string; sigla: string }>(db, `
    SELECT r.conector, r.conta_id, r.nome, r.cliente_id, c.sigla FROM cliente_conta_resultados r JOIN cliente c ON c.id = r.cliente_id
     ORDER BY c.sigla`)
  const contas = new Map<string, ContaWindsor>()
  for (const l of todos<{ conector: ConectorWindsor; conta_id: string; nome: string; status: string | null }>(db,
    'SELECT conector, conta_id, nome, status FROM windsor_conta')) {
    contas.set(`${l.conector}|${l.conta_id}`, { conector: l.conector, contaId: l.conta_id, nome: l.nome, status: l.status, clientes: [] })
  }
  for (const l of ligacoes) {
    const chave = `${l.conector}|${l.conta_id}`
    const c = contas.get(chave) ?? { conector: l.conector, contaId: l.conta_id, nome: l.nome, status: null, clientes: [] }
    if (!c.clientes.some((x) => x.clienteId === l.cliente_id)) c.clientes.push({ clienteId: l.cliente_id, sigla: l.sigla })
    contas.set(chave, c)
  }
  const ordem = (c: ConectorWindsor) => CONECTORES_WINDSOR.indexOf(c)
  return [...contas.values()].sort((a, b) => ordem(a.conector) - ordem(b.conector)
    || a.nome.localeCompare(b.nome, 'pt-BR') || a.contaId.localeCompare(b.contaId))
}

/**
 * GET /api/resultados/contas. Vencida, busca na hora (e espera). `recarregar` (só admin, conferido na rota): força a
 * busca, 1 a cada 10 min → 429 com `tenteEmSegundos`.
 */
export async function listarContasWindsor(db: Db, recarregar: boolean): Promise<ListarContasWindsorSaida> {
  const uso = { hoje: usoHoje(db), tetoDia: TETO_DIA }
  if (!temChave()) return { estado: 'sem_chave', atualizadaEm: null, uso, contas: [] }
  const m = memoria(db)
  if (recarregar) {
    const agoraMs = Date.parse(agora())
    if (m.recarregadaEm !== null && agoraMs - m.recarregadaEm < RECARREGAR_A_CADA_MS) {
      throw new ErroHttp(429, 'muitas_tentativas', 'A lista foi recarregada há pouco. Espere um pouco e tente de novo.',
        { tenteEmSegundos: Math.max(1, Math.ceil((m.recarregadaEm + RECARREGAR_A_CADA_MS - agoraMs) / 1000)) })
    }
    m.recarregadaEm = agoraMs
  }
  const estados = () => new Map(todos<LinhaLista>(db, 'SELECT conector, buscada_em, tentada_em, erro FROM windsor_lista').map((l) => [l.conector, l]))
  const antes = estados()
  const vencidos = CONECTORES_WINDSOR.filter((c) => recarregar || listaVencida(antes.get(c)))
  if (vencidos.length > 0) await buscarLista(db, vencidos)
  const depois = estados()
  const comErro = CONECTORES_WINDSOR.map((c) => depois.get(c)?.erro ?? null).find((e): e is ErroWindsor => e !== null)
  const buscadas = CONECTORES_WINDSOR.map((c) => depois.get(c)?.buscada_em ?? null)
  return {
    estado: (comErro ?? 'ok') as EstadoWindsor,
    atualizadaEm: buscadas.every((b) => b !== null) ? [...buscadas as string[]].sort()[0]! : null,
    uso: { hoje: usoHoje(db), tetoDia: TETO_DIA }, contas: montarLista(db),
  }
}

// ─────────────────────────────── ligar e desligar ───────────────────────────────

function carregarLigacao(db: Db, id: Id): ContaLigada {
  const l = um<{ id: string; conector: ConectorWindsor; conta_id: string; nome: string; ligada_por: string | null; ligada_em: string }>(db,
    'SELECT * FROM cliente_conta_resultados WHERE id = ?', id)!
  return { id: l.id, conector: l.conector, contaId: l.conta_id, nome: l.nome, ligadaPor: l.ligada_por, ligadaEm: l.ligada_em }
}

/** POST /api/clientes/:id/resultados/contas (dentro de uma transação). */
export function ligarConta(db: Db, clienteId: Id, e: LigarContaEntrada, ator: Ator): ContaLigada {
  const contaId = normalizarContaId(e.conector, e.contaId)
  if (!contaId) throw validacao('O id da conta tem só números e hífens (a Meta aceita com ou sem "act_").', { contaId: 'formato inválido' })
  const daLista = um<{ nome: string }>(db, 'SELECT nome FROM windsor_conta WHERE conector = ? AND conta_id = ?', e.conector, contaId)
  const nome = daLista?.nome ?? limparNome(e.nome ?? '')
  if (!nome) throw validacao('Esta conta não está na lista da Windsor: escreva o nome dela.', { nome: 'obrigatório para conta fora da lista' })
  if (um(db, 'SELECT 1 FROM cliente_conta_resultados WHERE cliente_id = ? AND conector = ? AND conta_id = ?', clienteId, e.conector, contaId)) {
    throw conflito('Esta conta já está ligada a este cliente.', { campo: 'contaId' })
  }
  const id = novoId()
  rodar(db, `INSERT INTO cliente_conta_resultados (id, cliente_id, conector, conta_id, nome, ligada_por, ligada_em)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, id, clienteId, e.conector, contaId, nome, ator.usuario?.id ?? null, agora())
  registrarAtividade(db, { tipo: 'cliente.editado', ator, clienteId, dados: { clienteId, campos: ['contasResultados'] } })
  emitirEstadoResultados(db, clienteId, ator)
  return carregarLigacao(db, id)
}

/** DELETE /api/clientes/:id/resultados/contas/:ligacaoId (dentro de uma transação). */
export function desligarConta(db: Db, clienteId: Id, ligacaoId: Id, ator: Ator): void {
  const l = um<{ nome: string }>(db, 'SELECT nome FROM cliente_conta_resultados WHERE id = ? AND cliente_id = ?', ligacaoId, clienteId)
  if (!l) throw naoEncontrado('Esta conta não está ligada a este cliente.')
  rodar(db, 'DELETE FROM cliente_conta_resultados WHERE id = ?', ligacaoId)
  registrarAtividade(db, { tipo: 'cliente.editado', ator, clienteId, dados: { clienteId, campos: ['contasResultados'] } })
  emitirEstadoResultados(db, clienteId, ator)
}

export { contasLigadas }
