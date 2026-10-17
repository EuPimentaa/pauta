/**
 * Textos para colar no WhatsApp (API.md §6), puros: o servidor monta em GET /api/demandas/:id/whatsapp e no envio, e
 * o front pode pré-visualizar com os mesmos dados. Tom da marca: direto, sem exclamação, data "qui, 16/10, 18h".
 * Uma ideia por linha, o link sozinho na linha dele e o título em negrito do WhatsApp (*título*):
 *
 *   textoWhatsapp('envio', { contatoNome: 'Fulana de Tal', titulo: 'Outubro Rosa', versao: 2,
 *     url: 'https://…/a/…', prazoRetorno: '2026-10-16', prazoRetornoHora: null })
 *   // "Olá, Fulana.\nSegue a V2 de *Outubro Rosa* para aprovação:\nhttps://…/a/…\n\nRetorno até sex, 16/10, 18h."
 */
import type { ModeloWhatsapp } from '../tipos/ciclo.ts'
import type { DataLocal, HoraLocal } from '../tipos/nucleo.ts'
import { HORA_PADRAO_PRAZO } from '../tipos/nucleo.ts'
import { formatarPrazo } from './datas.ts'

export interface DadosWhatsapp {
  /** Nome do contato (o texto usa o primeiro nome, com o tratamento: "Dona Maria"). Nulo = sem contato. */
  contatoNome: string | null
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

/** Pronomes de tratamento que não são o nome ("Seu Joaquim", "Dona Maria", "Dr. Paulo"). */
const TRATAMENTOS = new Set(['seu', 'sr', 'sr.', 'senhor', 'dona', 'd.', 'sra', 'sra.', 'senhora', 'srta', 'srta.', 'dr', 'dr.',
  'dra', 'dra.', 'doutor', 'doutora', 'prof', 'prof.', 'profa', 'profa.', 'professor', 'professora'])

/**
 * Como chamar a pessoa: o primeiro nome ("Fulana de Tal" → "Fulana"), com o tratamento quando o nome começa por um
 * ("Seu Joaquim da Silva" → "Seu Joaquim"; "Dona Maria" → "Dona Maria"). Vazio → null.
 */
export function primeiroNome(nome: string | null | undefined): string | null {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return null
  if (partes.length > 1 && TRATAMENTOS.has(partes[0]!.toLowerCase())) return `${partes[0]} ${partes[1]}`
  return partes[0]!
}

/** O título em negrito do WhatsApp (sem asteriscos dentro, que quebrariam o negrito). */
function negrito(titulo: string): string {
  const t = titulo.replace(/\*/g, '').replace(/\s+/g, ' ').trim()
  return t ? `*${t}*` : 'a peça'
}

/** "qui, 16/10, 18h" (sem hora: a hora padrão do prazo). */
function quando(d: DataLocal, h: HoraLocal | null | undefined): string {
  return formatarPrazo(d, h ?? HORA_PADRAO_PRAZO)
}

/** As linhas que existem, uma por linha (nulo some; '' vira linha em branco). */
const linhas = (...l: (string | null)[]) => l.filter((x): x is string => x !== null).join('\n')

/**
 * O texto do modelo (API.md §6). Sem contato, a saudação vira "Olá, tudo bem?" e o agradecimento "Obrigado." (o nome
 * some). Lembrete sem link (envio por fora) termina sem o endereço.
 */
export function textoWhatsapp(modelo: ModeloWhatsapp, dados: DadosWhatsapp): string {
  const nome = primeiroNome(dados.contatoNome)
  const ola = nome ? `Olá, ${nome}.` : 'Olá, tudo bem?'
  const obrigado = nome ? `Obrigado, ${nome}.` : 'Obrigado.'
  const v = dados.versao
  const peca = `V${v} de ${negrito(dados.titulo)}`
  const url = dados.url?.trim() || null
  switch (modelo) {
    case 'envio': {
      const prazo = dados.prazoRetorno ? `Retorno até ${quando(dados.prazoRetorno, dados.prazoRetornoHora)}.` : null
      return linhas(ola, `Segue a ${peca} para aprovação${url ? ':' : '.'}`, url, prazo && '', prazo)
    }
    case 'lembrete':
      return linhas(ola, `Passando para lembrar da ${peca}, que aguarda o seu retorno${url ? ':' : '.'}`, url)
    case 'aprovado':
      return linhas(obrigado, `Registramos a aprovação da ${peca}.`)
    case 'ajuste':
      return linhas(obrigado, `Recebemos os ajustes da ${peca}.`,
        dados.prazoAjuste ? `A V${v + 1} fica pronta até ${quando(dados.prazoAjuste, dados.prazoAjusteHora)}.` : null)
  }
}
