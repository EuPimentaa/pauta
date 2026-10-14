/**
 * Regras do quadro usadas pelo servidor e pelo front (o front aplica na hora, o servidor confirma):
 * com quem está a bola (API.md §5.4), coluna de entrada, etiquetas e membros ao mover (§5.1 e §5.6), WIP, slug.
 */
import type { Coluna, Etiqueta, MembrosAoMover } from '../tipos/quadros.ts'
import type { ComQuem, Demanda } from '../tipos/demandas.ts'
import type { Id, Instante } from '../tipos/nucleo.ts'
import { dataLocalDe, diasUteisEntre, hojeSP } from './datas.ts'
import { normalizarAlias } from './texto.ts'

/**
 * `concluida` se concluída; `cliente` se há envio sem decisão (envioPendenteEm) ou se a coluna é aguardando_cliente
 * e o cliente ainda não decidiu depois que a demanda entrou nela (retornoEm nulo ou statusDesde > retornoEm);
 * senão `equipe`.
 */
export function comQuemEsta(
  d: Pick<Demanda, 'concluidaEm' | 'envioPendenteEm' | 'retornoEm' | 'statusDesde'>,
  coluna: Pick<Coluna, 'papel'>,
): ComQuem {
  if (d.concluidaEm) return 'concluida'
  if (d.envioPendenteEm) return 'cliente'
  if (coluna.papel === 'aguardando_cliente' && (d.retornoEm === null || d.statusDesde > d.retornoEm)) return 'cliente'
  return 'equipe'
}

/**
 * "Parado há N dias úteis" (equipe, desde statusDesde) ou "com o cliente há N" (desde envioPendenteEm, senão
 * statusDesde). Concluída: dias desde a última mudança de coluna.
 */
export function paradoHa(d: Demanda, coluna: Coluna, agora: Date, feriados: ReadonlySet<string>): { comQuem: ComQuem; dias: number } {
  const comQuem = comQuemEsta(d, coluna)
  const desde: Instante = comQuem === 'cliente' ? (d.envioPendenteEm ?? d.statusDesde) : d.statusDesde
  return { comQuem, dias: diasUteisEntre(dataLocalDe(desde), hojeSP(agora), feriados) }
}

/** "Minhas": sou membro ou o AM da demanda. */
export function ehMinha(d: Pick<Demanda, 'membroIds' | 'atendimentoId'>, euId: Id): boolean {
  return d.atendimentoId === euId || d.membroIds.includes(euId)
}

/** A primeira coluna ativa de papel normal do quadro; sem nenhuma, a primeira ativa; sem colunas, null. */
export function colunaDeEntrada(colunas: Coluna[], quadroId: Id): Coluna | null {
  const ativas = colunas.filter((c) => c.quadroId === quadroId && c.arquivadaEm === null).sort((a, b) => a.pos - b.pos)
  return ativas.find((c) => c.papel === 'normal') ?? ativas[0] ?? null
}

function casa(a: Pick<Etiqueta, 'nome' | 'cor'>, b: Pick<Etiqueta, 'nome' | 'cor'>): boolean {
  if (a.nome === '' || b.nome === '') return a.nome === '' && b.nome === '' && a.cor === b.cor
  return normalizarAlias(a.nome) === normalizarAlias(b.nome)
}

/**
 * Etiquetas ao entrar no quadro de destino (API.md §5.6): as que a demanda já guardava lá, mais as atuais que casam
 * por nome (sem caixa e sem acento; etiqueta só de cor casa por cor). As sem par voltam em `semPar`.
 * `ids` sai na ordem das etiquetas do destino.
 */
export function mapearEtiquetas(
  atuais: Etiqueta[], doDestino: Etiqueta[], guardadasNoDestino: Id[],
): { ids: Id[]; semPar: Etiqueta[] } {
  const escolhidas = new Set(guardadasNoDestino.filter((id) => doDestino.some((e) => e.id === id)))
  const semPar: Etiqueta[] = []
  for (const atual of atuais) {
    const par = doDestino.find((e) => casa(e, atual))
    if (par) escolhidas.add(par.id)
    else semPar.push(atual)
  }
  const ids = [...doDestino].sort((a, b) => a.pos - b.pos).filter((e) => escolhidas.has(e.id)).map((e) => e.id)
  return { ids, semPar }
}

/**
 * Membros depois de mover (API.md §5.1, passos 5 e 6):
 * 5. mudando de quadro com `responsavel_destino` e responsável ativo do cliente na equipe do destino: os membros
 *    passam a ser só ele; senão ficam os mesmos;
 * 6. entrar numa coluna de pessoa S (ativa) põe S; se a coluna de origem era de outra pessoa R, tira R. Sair de uma
 *    coluna de pessoa para uma comum não tira ninguém.
 */
export function membrosAoMover(membroIds: Id[], p: {
  de: Pick<Coluna, 'responsavelId'>; para: Pick<Coluna, 'responsavelId'>; mudaDeQuadro: boolean
  membros: MembrosAoMover; responsavelDestino: Id | null; ativos: ReadonlySet<Id>
}): { membroIds: Id[]; entraram: Id[]; sairam: Id[] } {
  let final = [...membroIds]
  if (p.mudaDeQuadro && p.membros === 'responsavel_destino' && p.responsavelDestino && p.ativos.has(p.responsavelDestino)) {
    final = [p.responsavelDestino]
  }
  const s = p.para.responsavelId
  if (s && p.ativos.has(s)) {
    if (!final.includes(s)) final.push(s)
    const r = p.de.responsavelId
    if (r && r !== s) final = final.filter((id) => id !== r)
  }
  return {
    membroIds: final,
    entraram: final.filter((id) => !membroIds.includes(id)),
    sairam: membroIds.filter((id) => !final.includes(id)),
  }
}

/** A coluna passou do limite WIP com esta quantidade de cards (só aviso). */
export function passouWip(coluna: Pick<Coluna, 'limiteWip'>, quantidade: number): boolean {
  return coluna.limiteWip !== null && quantidade > coluna.limiteWip
}

/**
 * Card que o quadro mostra (API.md §4.6): não arquivado e aberto, ou concluído há no máximo `concluidasDias` dias.
 * As concluídas antigas saíram do quadro (estão no Arquivo).
 */
export function ehCardDaColuna(d: Pick<Demanda, 'arquivadoEm' | 'concluidaEm'>, agora: Date, concluidasDias: number): boolean {
  if (d.arquivadoEm !== null) return false
  if (d.concluidaEm === null) return true
  return new Date(d.concluidaEm).getTime() > agora.getTime() - concluidasDias * 86_400_000
}

/** Slug de URL: minúsculo, sem acento, hífens; até 60 caracteres ("Criação 2" → "criacao-2"). */
export function slugDe(nome: string): string {
  const slug = normalizarAlias(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
  return slug || 'quadro'
}
