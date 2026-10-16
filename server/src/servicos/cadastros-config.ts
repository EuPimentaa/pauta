/**
 * Configuração (API.md §4.11, F5): feriados e parâmetros da aplicação.
 * - Feriado é sempre dia não útil e vale só para os próximos cálculos (prazo do modelo, repetição, rodadas, "parado
 *   há"): nenhum prazo já gravado muda (não há prazo automático depois da criação).
 * - Parâmetros dentro de FAIXAS_CONFIG (o zod confere); `demandaNumeroInicial` só sobe acima do maior número usado.
 *   Sem entidade de tempo real para a configuração: quem muda atualiza o próprio cache pela resposta.
 */
import {
  CHAVES_CONFIG, type ConfigApp, type ConfigAppSaida, type CriarFeriadoEntrada, type EditarConfigAppEntrada, type Feriado,
} from '../../../shared/tipos/index.ts'
import type { Ator } from '../auth.ts'
import { rodar, todos, um, type Db } from '../db.ts'
import { conflito, naoEncontrado, validacao } from '../erros.ts'
import { gravarConfig, hoje, infoApp, lerConfig } from './config-app.ts'
import { emitirDelete, emitirObjeto } from './eventos.ts'
import { mapear } from './mapear.ts'

// ─────────────────────────────── feriados ───────────────────────────────

/** Os feriados de um ano, por data (padrão: o ano corrente de São Paulo). */
export function listarFeriados(db: Db, ano?: number): Feriado[] {
  const a = ano ?? Number(hoje().slice(0, 4))
  return todos<Record<string, unknown>>(db, 'SELECT * FROM feriado WHERE data >= ? AND data < ? ORDER BY data',
    `${a}-01-01`, `${a + 1}-01-01`).map(mapear.feriado)
}

function feriadoDe(db: Db, data: string): Feriado | null {
  const l = um<Record<string, unknown>>(db, 'SELECT * FROM feriado WHERE data = ?', data)
  return l ? mapear.feriado(l) : null
}

const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`

export function criarFeriado(db: Db, e: CriarFeriadoEntrada, ator: Ator): Feriado {
  const existente = feriadoDe(db, e.data)
  if (existente) throw conflito(`Já há um feriado em ${diaMes(e.data)}: ${existente.nome}.`, { data: e.data })
  if (e.tipo) rodar(db, 'INSERT INTO feriado (data, nome, tipo) VALUES (?, ?, ?)', e.data, e.nome.trim(), e.tipo)
  else rodar(db, 'INSERT INTO feriado (data, nome) VALUES (?, ?)', e.data, e.nome.trim())
  const f = feriadoDe(db, e.data)!
  emitirObjeto(db, 'feriado', f.data, f, ator)
  return f
}

export function excluirFeriado(db: Db, data: string, ator: Ator): void {
  if (!feriadoDe(db, data)) throw naoEncontrado('Este feriado não está cadastrado.')
  rodar(db, 'DELETE FROM feriado WHERE data = ?', data)
  emitirDelete(db, 'feriado', data, ator)
}

// ─────────────────────────────── parâmetros da aplicação ───────────────────────────────

export function configSaida(db: Db): ConfigAppSaida {
  return { info: infoApp(), config: lerConfig(db) }
}

/** O maior número de demanda já usado (inclusive arquivadas e anonimizadas: o número nunca se repete). */
export function maiorNumero(db: Db): number {
  return Number(um<{ m: number | null }>(db, 'SELECT max(numero) AS m FROM demanda')!.m ?? 0)
}

/**
 * Grava só o que mudou. `demandaNumeroInicial` diferente do atual precisa ser maior que o maior número já usado
 * (mandar o mesmo valor é não mudar nada: o formulário pode mandar a configuração inteira).
 */
export function editarConfig(db: Db, e: EditarConfigAppEntrada, ator: Ator): ConfigAppSaida {
  const atual = lerConfig(db)
  const mudancas = (Object.entries(e) as [keyof EditarConfigAppEntrada, ConfigApp[keyof EditarConfigAppEntrada]][])
    .filter(([campo, valor]) => valor !== undefined && campo in CHAVES_CONFIG && atual[campo] !== valor)
  const numero = mudancas.find(([campo]) => campo === 'demandaNumeroInicial')
  if (numero) {
    const maior = maiorNumero(db)
    if (Number(numero[1]) <= maior) {
      throw validacao(`O próximo número precisa ser maior que #${maior}, o maior já usado.`,
        { demandaNumeroInicial: `precisa ser maior que ${maior}` })
    }
  }
  for (const [campo, valor] of mudancas) gravarConfig(db, campo, valor, ator.usuario?.id ?? null)
  return configSaida(db)
}
