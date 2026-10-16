/**
 * 409 de rev (API §1, "Concorrência"; PLANO §2, "mescla campo a campo"): outra pessoa salvou a mesma demanda entre a
 * leitura e o PATCH. Junta as duas edições sem perder a de ninguém:
 * - campo que só eu mudei: fica o meu; que só a outra pessoa mudou: fica o dela (o PATCH não o manda);
 * - os dois mudaram o mesmo campo: o meu vence (acabei de fazer), exceto a descrição;
 * - descrição: mescla de três vias por linha (diff3). Trechos que só um lado mexeu entram; trecho que os dois mexeram
 *   de jeitos diferentes fica com as duas versões, a dela primeiro.
 * Puro (sem React): roda nos testes do Node.
 */
import type { ConflitoRevDetalhes, Demanda, EditarDemandaEntrada } from '../../../shared/tipos/index.ts'

interface Trecho { ini: number; fim: number; linhas: string[] }

/** Pares (i, j) de linhas iguais na maior subsequência comum, em ordem. */
function pares(a: readonly string[], b: readonly string[]): [number, number][] {
  const n = a.length, m = b.length
  // tamanho guardado: descrição é curta; acima disso, sem pares (vira um trecho só)
  if (n * m > 4_000_000) return []
  const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  }
  const saida: [number, number][] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { saida.push([i, j]); i++; j++ }
    else if (t[i + 1][j] >= t[i][j + 1]) i++
    else j++
  }
  return saida
}

/** O que `outro` trocou em relação à base: trechos [ini, fim) da base e as linhas que entraram no lugar. */
function trechos(base: readonly string[], outro: readonly string[]): Trecho[] {
  const lista: Trecho[] = []
  let i = 0, j = 0
  for (const [bi, oj] of [...pares(base, outro), [base.length, outro.length] as [number, number]]) {
    if (bi > i || oj > j) lista.push({ ini: i, fim: bi, linhas: outro.slice(j, oj) })
    i = bi + 1
    j = oj + 1
  }
  return lista
}

/** A região [ini, fim) da base com os trechos (de um lado só) aplicados. */
function regiao(base: readonly string[], ts: Trecho[], ini: number, fim: number): string[] {
  const saida: string[] = []
  let k = ini
  for (const t of ts) {
    saida.push(...base.slice(k, t.ini), ...t.linhas)
    k = t.fim
  }
  saida.push(...base.slice(k, fim))
  return saida
}

/** Mescla de três vias por linha. */
export function mesclarTexto(base: string, meu: string, deles: string): string {
  if (meu === deles || deles === base) return meu
  if (meu === base) return deles
  const b = base.split('\n')
  const meus = trechos(b, meu.split('\n')).map((t) => ({ ...t, lado: 'meu' as const }))
  const dosOutros = trechos(b, deles.split('\n')).map((t) => ({ ...t, lado: 'deles' as const }))
  const todos = [...meus, ...dosOutros].sort((x, y) => x.ini - y.ini || x.fim - y.fim)
  const saida: string[] = []
  let pos = 0
  let i = 0
  while (i < todos.length) {
    // grupo: trechos que se sobrepõem (de qualquer lado). Trocas em linhas vizinhas não se tocam; uma inserção no
    // ponto em que o outro lado começa ou termina, sim (não dá para saber a ordem certa)
    const grupo = [todos[i]]
    let fim = todos[i].fim
    i++
    const insercaoEm = (p: number) => grupo.some((g) => g.ini === g.fim && g.ini === p)
    while (i < todos.length && (todos[i].ini < fim || (todos[i].ini === fim && (todos[i].ini === todos[i].fim || insercaoEm(fim))))) {
      fim = Math.max(fim, todos[i].fim)
      grupo.push(todos[i])
      i++
    }
    const ini = grupo[0].ini
    saida.push(...b.slice(pos, ini))
    const m = grupo.filter((t) => t.lado === 'meu')
    const d = grupo.filter((t) => t.lado === 'deles')
    if (!d.length) saida.push(...regiao(b, m, ini, fim))
    else if (!m.length) saida.push(...regiao(b, d, ini, fim))
    else {
      const rm = regiao(b, m, ini, fim), rd = regiao(b, d, ini, fim)
      if (rm.join('\n') === rd.join('\n')) saida.push(...rm)
      else saida.push(...rd, ...rm)
    }
    pos = fim
  }
  saida.push(...b.slice(pos))
  return saida.join('\n')
}

const iguais = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * O PATCH de novo, sobre a versão atual do servidor. `base` é a demanda que eu tinha quando comecei a editar e
 * `baseDescricao` a descrição dela (null se eu não tinha: a dela vale como base). Vazio = nada a mandar.
 */
export function mesclarEdicao(
  base: Demanda, baseDescricao: string | null, minhas: EditarDemandaEntrada, atual: ConflitoRevDetalhes,
): EditarDemandaEntrada {
  const saida: Record<string, unknown> = {}
  for (const [k, meu] of Object.entries(minhas) as [keyof EditarDemandaEntrada, unknown][]) {
    if (meu === undefined) continue
    if (k === 'descricaoMd') {
      const deles = atual.descricaoMd
      const junto = mesclarTexto(baseDescricao ?? deles, meu as string, deles)
      if (junto !== deles) saida.descricaoMd = junto
      continue
    }
    const deles = atual.demanda[k as keyof Demanda]
    if (iguais(deles, meu)) continue
    saida[k] = meu
  }
  // trocar a capa limpa a outra: se a mescla manteve as duas, a minha decide
  if ('capaAnexoId' in saida && saida.capaAnexoId) delete saida.capaCor
  return saida as EditarDemandaEntrada
}
