/**
 * Textos para colar no WhatsApp (API.md §6), puros: o servidor monta em GET /api/demandas/:id/whatsapp e no envio, e
 * o front pode pré-visualizar com os mesmos dados. Tom da marca: direto, sem exclamação, data "qui, 16/10, 18h".
 *
 *   textoWhatsapp('envio', { contatoNome: 'Fulana de Tal', modeloNome: 'Carrossel', titulo: 'Outubro Rosa', versao: 2,
 *     url: 'https://…/a/…', prazoRetorno: '2026-10-16', prazoRetornoHora: null })
 *   // "Olá, Fulana. Segue Carrossel Outubro Rosa (V2) para aprovação: https://…/a/… Prazo para retorno: sex, 16/10, 18h."
 */
import type { ModeloWhatsapp } from '../tipos/ciclo.ts'
import type { DataLocal, HoraLocal } from '../tipos/nucleo.ts'
import { HORA_PADRAO_PRAZO } from '../tipos/nucleo.ts'
import { formatarPrazo } from './datas.ts'
import { normalizarAlias } from './texto.ts'

export interface DadosWhatsapp {
  /** Nome do contato (o texto usa o primeiro nome). Nulo = sem contato. */
  contatoNome: string | null
  /** Nome do modelo da demanda ("Carrossel"), se houver. */
  modeloNome: string | null
  titulo: string
  /** Número da versão enviada ou decidida. */
  versao: number
  /** Link de aprovação (envio por link e lembrete). */
  url?: string | null
  prazoRetorno?: DataLocal | null
  prazoRetornoHora?: HoraLocal | null
  /** Ajuste: prazo da rodada nova (a V{v+1} fica pronta até…). */
  prazoAjuste?: DataLocal | null
  prazoAjusteHora?: HoraLocal | null
}

/** Primeiro nome do contato ("Fulana de Tal" → "Fulana"); vazio → null. */
export function primeiroNome(nome: string | null | undefined): string | null {
  const p = (nome ?? '').trim().split(/\s+/)[0]
  return p ? p : null
}

/**
 * "{modelo} {título}" sem repetir o modelo quando o título já começa com ele ("Carrossel de outubro" com o modelo
 * Carrossel continua "Carrossel de outubro").
 */
export function nomeDaPeca(modeloNome: string | null, titulo: string): string {
  const t = titulo.trim()
  const m = (modeloNome ?? '').trim()
  if (!m) return t
  if (normalizarAlias(t).startsWith(normalizarAlias(m))) return t
  return `${m} ${t}`
}

/** "qui, 16/10, 18h" (sem hora: a hora padrão do prazo). */
function quando(d: DataLocal, h: HoraLocal | null | undefined): string {
  return formatarPrazo(d, h ?? HORA_PADRAO_PRAZO)
}

/**
 * O texto do modelo (API.md §6). Sem contato, a saudação vira "Olá, tudo bem." e o agradecimento "Obrigado." (o nome
 * some). Lembrete sem link (envio por fora) termina sem o endereço.
 */
export function textoWhatsapp(modelo: ModeloWhatsapp, dados: DadosWhatsapp): string {
  const nome = primeiroNome(dados.contatoNome)
  const ola = `Olá, ${nome ?? 'tudo bem'}.`
  const obrigado = nome ? `Obrigado, ${nome}.` : 'Obrigado.'
  const peca = nomeDaPeca(dados.modeloNome, dados.titulo)
  const v = dados.versao
  const url = dados.url?.trim() || null
  switch (modelo) {
    case 'envio': {
      const prazo = dados.prazoRetorno ? ` Prazo para retorno: ${quando(dados.prazoRetorno, dados.prazoRetornoHora)}.` : ''
      return url
        ? `${ola} Segue ${peca} (V${v}) para aprovação: ${url}${prazo}`
        : `${ola} Segue ${peca} (V${v}) para aprovação.${prazo}`
    }
    case 'lembrete':
      return url
        ? `${ola} Passando para lembrar de ${peca} (V${v}), que aguarda o seu retorno: ${url}`
        : `${ola} Passando para lembrar de ${peca} (V${v}), que aguarda o seu retorno.`
    case 'aprovado':
      return `${obrigado} Registramos a aprovação de ${peca} (V${v}).`
    case 'ajuste': {
      const prazo = dados.prazoAjuste ? ` A V${v + 1} fica pronta até ${quando(dados.prazoAjuste, dados.prazoAjusteHora)}.` : ''
      return `${obrigado} Recebemos os ajustes de ${peca}.${prazo}`
    }
  }
}
