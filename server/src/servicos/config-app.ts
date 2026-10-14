/** Leitura da tabela `configuracao` (ConfigApp), dos feriados e da InfoApp. */
import { CHAVES_CONFIG, type ConfigApp, type Feriado, type InfoApp } from '../../../shared/tipos/index.ts'
import { hojeSP } from '../../../shared/logica/datas.ts'
import { config } from '../config.ts'
import { agoraData, rodar, todos, agora, type Db } from '../db.ts'
import { mapear } from './mapear.ts'

const PADROES: ConfigApp = {
  demandaNumeroInicial: 1, prazoHoraPadrao: '18:00', paradoLimiteDiasUteis: 2, clienteParadoDiasUteis: 2,
  retornoPrazoDiasUteis: 2, ajustePrazoDiasUteis: 1, linkPublicoValidadeDias: 30, linkPublicoArquivoMinutos: 10,
  conviteValidadeDias: 7, redefinicaoValidadeHoras: 1, sessaoValidadeDias: 30, eventoRetencaoDias: 7,
  uploadLimiteBytes: 10_485_760, arquivoLixoDias: 30, backupManter: 14, quadroConcluidasDias: 7, cronometroLimiteHoras: 10,
  modelosRevisadosEm: null,
}

const PELA_CHAVE = new Map(Object.entries(CHAVES_CONFIG).map(([campo, chave]) => [chave, campo as keyof ConfigApp]))

/** ConfigApp atual (o que faltar na tabela vale o padrão do seed 002). */
export function lerConfig(db: Db): ConfigApp {
  const cfg: ConfigApp = { ...PADROES }
  for (const l of todos<{ chave: string; valor: string }>(db, 'SELECT chave, valor FROM configuracao')) {
    const campo = PELA_CHAVE.get(l.chave)
    if (campo) (cfg as unknown as Record<string, unknown>)[campo] = JSON.parse(l.valor)
  }
  return cfg
}

/** Grava um parâmetro (valor em JSON). */
export function gravarConfig<K extends keyof ConfigApp>(db: Db, campo: K, valor: ConfigApp[K], usuarioId: string | null): void {
  rodar(db, `INSERT INTO configuracao (chave, valor, atualizado_por, atualizado_em) VALUES (?, ?, ?, ?)
             ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_por = excluded.atualizado_por,
             atualizado_em = excluded.atualizado_em`,
    CHAVES_CONFIG[campo], JSON.stringify(valor), usuarioId, agora())
}

/** Todos os feriados (dias não úteis) como Set de DataLocal. */
export function feriados(db: Db): Set<string> {
  return new Set(todos<{ data: string }>(db, 'SELECT data FROM feriado').map((l) => l.data))
}

/** Feriados do ano corrente e do próximo (bootstrap). */
export function feriadosDoBootstrap(db: Db): Feriado[] {
  const ano = Number(hojeSP(agoraData()).slice(0, 4))
  return todos<Record<string, unknown>>(db, 'SELECT * FROM feriado WHERE data >= ? AND data < ? ORDER BY data',
    `${ano}-01-01`, `${ano + 2}-01-01`).map(mapear.feriado)
}

export function infoApp(): InfoApp {
  return { nome: config.appNome, url: config.appUrl, versao: config.versao }
}

/** "Hoje" de São Paulo pelo relógio do app. */
export function hoje(): string {
  return hojeSP(agoraData())
}
