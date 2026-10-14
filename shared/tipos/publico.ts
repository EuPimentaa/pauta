/**
 * Página pública de aprovação (/a/:token), sem login. A API fica em /api/publico/a/:token.
 * O cliente vê só as versões enviadas por aquele link e os comentários visíveis (não excluídos) das demandas do link.
 * "Enviada por este link" = existe `envio` com aquela versão e link_id = o link. Nenhuma rota pública lê
 * demanda.versao_atual_id (pode ser trabalho interno ainda não enviado). Demanda excluída ou cancelada some do link.
 * Todo texto vindo do cliente é exibido como texto puro.
 */
import type { Cor, DataLocal, HoraLocal, Id, Instante } from './nucleo.ts'

export interface ItemVersaoPublico {
  /** Caminho de rede nunca aparece para o cliente. */
  tipo: 'link' | 'arquivo'
  nome: string
  /** Link https externo ou URL assinada de 10 min (/api/publico/arquivos/:id?exp=&sig=). */
  url: string
  /** Prévia estática; o iframe (Drive /preview, YouTube nocookie, Figma) só abre no toque. */
  previaUrl: string | null
  imagem: boolean
  /** Host conhecido que pode ser embutido com sandbox. */
  embutivel: boolean
}

export interface VersaoPublica {
  id: Id
  numero: number
  nota: string | null
  enviadaEm: Instante
  itens: ItemVersaoPublico[]
}

export interface DecisaoPublica {
  decisao: 'aprovado' | 'ajuste'
  versaoNumero: number
  /** Nome do contato ou o informado. */
  nome: string
  em: Instante
  /** Linhas do ajuste, se houver. */
  linhas: string[]
}

export interface ComentarioPublico {
  /** Apelido de quem escreveu na agência, ou o nome do cliente. */
  autor: string
  corpoMd: string
  criadoEm: Instante
}

export interface ItemAprovacaoPublico {
  demandaId: Id
  numero: number
  titulo: string
  tipoNome: string | null
  prazoRetorno: DataLocal | null
  prazoRetornoHora: HoraLocal | null
  /** Última versão enviada por este link. */
  versao: VersaoPublica | null
  /** Decisão válida sobre `versao` (o link fica só leitura com o selo). */
  decisao: DecisaoPublica | null
  anteriores: { numero: number; enviadaEm: Instante; decisao: 'aprovado' | 'ajuste' | null }[]
  comentarios: ComentarioPublico[]
  /** "A equipe prepara a V3 até sex, 17/10" ou "Aprovado V2 por Fulana em 14/10 às 14:03". */
  proximoPasso: string | null
}

/** GET /api/publico/a/:token: sem efeito colateral (o robô de prévia do WhatsApp abre o link). */
export interface PaginaAprovacao {
  app: { nome: string }
  /** logoUrl = urlAssinada(logoArquivoId, linkPublicoArquivoMinutos) (a rota interna exige sessão). */
  cliente: { nome: string; sigla: string; cor: Cor; logoUrl: string | null }
  /** Link gerado para um contato: "Você é Fulana?". */
  contato: { id: Id; nome: string } | null
  expiraEm: Instante
  itens: ItemAprovacaoPublico[]
}

/**
 * POST /api/publico/a/:token/decisao com header Idempotency-Key (uuid gerado pela página).
 * A chave vale por link: repetir com o mesmo corpo devolve 200 com o estado atual; com outro corpo, 422 idempotencia.
 */
export interface DecisaoPublicaEntrada {
  demandaId: Id
  versaoId: Id
  decisao: 'aprovado' | 'ajuste'
  /** Ajuste: "um ajuste por linha" (pelo menos uma). */
  linhas?: string[]
  /** "Sim, sou Fulana": só nulo ou o contato do link (link_publico.contato_id); outro valor → 400 validacao. */
  contatoId?: Id | null
  /** "Sou outra pessoa" ou link sem contato (a página lembra no aparelho). Obrigatório sem contatoId: 1 a 120 caracteres. */
  nomeInformado?: string | null
}

export interface DecisaoPublicaSaida {
  item: ItemAprovacaoPublico
  mensagem: string
}

/**
 * `detalhes` do 409 versao_desatualizada na página pública ("Chegou a V3"). `versaoAtual` = a versão de maior número
 * enviada por ESTE link. Se a última versão enviada da demanda não foi por este link (ou a demanda saiu de Com o cliente),
 * a resposta é 409 conflito "Esta peça não aguarda mais sua decisão", sem versão.
 */
export interface DetalhesVersaoDesatualizada {
  versaoAtual: VersaoPublica
}
