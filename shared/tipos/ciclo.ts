/** Ciclo da peça: rodadas, versões, envio ao cliente, links públicos, retorno e aprovação. */
import type { DriveStatus, ItemBase, NovoItem } from './arquivos.ts'
import type { ChecklistComItens, Demanda } from './demandas.ts'
import type { Canal, DataLocal, HoraLocal, Id, Instante, MotivoRodada } from './nucleo.ts'

export const ORIGENS_RODADA = ['inicial', 'cliente', 'interna'] as const
export type OrigemRodada = (typeof ORIGENS_RODADA)[number]

export interface Rodada {
  id: Id
  demandaId: Id
  numero: number
  origem: OrigemRodada
  motivo: MotivoRodada | null
  motivoTexto: string | null
  extra: boolean
  prazo: DataLocal | null
  prazoHora: HoraLocal | null
  /** Diferente de `prazo` = renegociada. */
  prazoOriginal: DataLocal | null
  abertaEm: Instante
  abertaPor: Id | null
  fechadaEm: Instante | null
  /** numero ≤ demanda.rodadasInclusas (calculado). */
  inclusa: boolean
}

export interface Versao {
  id: Id
  demandaId: Id
  numero: number
  rodadaId: Id
  nota: string | null
  criadaPor: Id
  criadaEm: Instante
  enviadaClienteEm: Instante | null
  enviadaVia: 'link' | 'fora' | null
}

export interface VersaoItem extends ItemBase {
  versaoId: Id
  /** Miniatura estática (imagem enviada ou thumbnail público do Drive). O iframe só abre no clique. */
  previaUrl: string | null
}

export interface VersaoComItens extends Versao {
  itens: VersaoItem[]
}

export interface Envio {
  id: Id
  demandaId: Id
  versaoId: Id
  via: 'link' | 'fora'
  canal: Canal | null
  linkId: Id | null
  contatoId: Id | null
  prazoRetorno: DataLocal | null
  prazoRetornoHora: HoraLocal | null
  enviadoPor: Id
  enviadoEm: Instante
}

/** Link público como o AM vê (nunca o token; a URL só sai em respostas específicas). */
export interface LinkPublicoResumo {
  id: Id
  clienteId: Id
  contatoId: Id | null
  titulo: string | null
  expiraEm: Instante
  revogadoEm: Instante | null
  criadoPor: Id
  criadoEm: Instante
  ultimoAcessoEm: Instante | null
  acessos: number
  /** Não expirado e não revogado. */
  ativo: boolean
  demandaIds: Id[]
}

export interface Aprovacao {
  id: Id
  demandaId: Id
  versaoId: Id
  decisao: 'aprovado' | 'ajuste'
  via: 'link' | 'manual'
  canal: Canal | null
  linkId: Id | null
  contatoId: Id | null
  /** Texto puro (textContent). */
  nomeInformado: string | null
  registradoPor: Id | null
  /** Linhas do ajuste, texto puro. */
  comentario: string | null
  motivo: MotivoRodada | null
  rodadaAbertaId: Id | null
  evidenciaAnexoId: Id | null
  /** Responsável antes da decisão (o aprovado de um tipo com publicação troca pelo social). Anular restaura. */
  responsavelAnteriorId: Id | null
  criadoEm: Instante
  anuladaEm: Instante | null
  anuladaPor: Id | null
}

// ─────────────────────────────── DTOs ───────────────────────────────

/** POST /api/demandas/:id/versoes ("Entregar versão"): cria Vn na rodada atual e move para Revisão. */
export interface EntregarVersaoEntrada {
  nota?: string | null
  /** Pelo menos um item. */
  itens: NovoItem[]
}

export interface EntregarVersaoSaida {
  versao: VersaoComItens
  demanda: Demanda
}

export interface EditarVersaoEntrada {
  nota?: string | null
}

/**
 * POST /api/versoes/:id/itens: acrescenta itens a uma versão ainda não enviada (ex.: "Enviar arquivo (até 10 MB)"
 * quando o Drive está privado, no diálogo de envio). Autor da versão, atendimento e admin. Resposta: VersaoComItens.
 */
export interface AdicionarItensEntrada {
  /** Pelo menos um. */
  itens: NovoItem[]
}

/** POST /api/versoes/:id/testar-drive */
export interface TestarVersaoSaida {
  itens: { itemId: Id; status: DriveStatus | 'nao_drive'; previaUrl: string | null }[]
  /** true se algum arquivo do Drive estiver privado (bloqueia o envio por link). */
  bloqueiaEnvio: boolean
}

/** POST /api/demandas/:id/enviar ("Enviar ao cliente"). */
export interface EnviarAoClienteEntrada {
  /** Padrão: a última versão entregue. */
  versaoId?: Id
  via: 'link' | 'fora'
  /** Obrigatório com via 'fora'. */
  canal?: Canal
  /** Padrão: contato padrão do cliente. Precisa ser contato ativo do cliente da demanda (400 validacao). */
  contatoId?: Id | null
  /** Padrão: hoje + 2 dias úteis, limitado à véspera útil da publicação. */
  prazoRetorno?: DataLocal | null
  prazoRetornoHora?: HoraLocal | null
}

export interface EnviarAoClienteSaida {
  envio: Envio
  demanda: Demanda
  /** Com via 'link': link reaproveitado (ativo, mesmo contato) ou novo. */
  link: { id: Id; url: string; expiraEm: Instante } | null
  textoWhatsapp: string
}

/** POST /api/demandas/:id/retorno ("Registrar retorno", Shift+R). Mesma regra do link (via 'manual'). */
export interface RegistrarRetornoEntrada {
  /** Padrão: a última versão enviada. Se não for a última enviada: 409 versao_desatualizada. */
  versaoId?: Id
  decisao: 'aprovado' | 'ajuste'
  /** Ajuste: cada linha (ou marcador "-", "•", "1.") vira um item de "Ajustes R{N+1}". */
  linhas?: string[]
  /** Ajuste: padrão 'cliente_mudou'. */
  motivo?: MotivoRodada
  motivoTexto?: string | null
  /** Ajuste: padrão hoje + tipo.slaAjusteDiasUteis. Vale para a rodada e para a demanda. */
  prazo?: DataLocal
  prazoHora?: HoraLocal | null
  /** Padrão: contato padrão. Precisa ser contato ativo do cliente da demanda (400 validacao). */
  contatoId?: Id | null
  nomeInformado?: string | null
  canal?: Canal
  /** Print colado (Ctrl+V), enviado antes por POST /api/arquivos. */
  evidenciaArquivoId?: Id | null
}

export interface RegistrarRetornoSaida {
  aprovacao: Aprovacao
  demanda: Demanda
  rodada: Rodada | null
  checklist: ChecklistComItens | null
  /** "Rodada 3 · 2 inclusas": sugerir [Marcar como extra]. */
  sugerirExtra: boolean
}

/** POST /api/demandas/:id/aprovado-whatsapp (1 clique em Com o cliente). */
export interface AprovadoWhatsappEntrada {
  versaoId?: Id
  contatoId?: Id | null
}

/** POST /api/demandas/:id/devolver (Revisão → Ajustes, rodada interna, pelo aprovador ou AM). */
export interface DevolverAjusteEntrada {
  linhas: string[]
  motivo: MotivoRodada
  motivoTexto?: string | null
  prazo?: DataLocal
  prazoHora?: HoraLocal | null
}

export interface DevolverAjusteSaida {
  demanda: Demanda
  rodada: Rodada
  checklist: ChecklistComItens
  sugerirExtra: boolean
}

/** POST /api/rodadas/:id/extra */
export interface MarcarExtraEntrada {
  extra: boolean
}

export const MODELOS_WHATSAPP = ['envio', 'lembrete', 'aprovado', 'ajuste'] as const
export type ModeloWhatsapp = (typeof MODELOS_WHATSAPP)[number]

/** GET /api/demandas/:id/whatsapp?modelo= ("Copiar para WhatsApp"). */
export interface TextoWhatsappSaida {
  modelo: ModeloWhatsapp
  texto: string
  linkUrl: string | null
}

/** GET /api/demandas/:id/links: links da demanda com a URL (só atendimento/admin). */
export interface LinkPublicoComUrl extends LinkPublicoResumo {
  url: string
}
