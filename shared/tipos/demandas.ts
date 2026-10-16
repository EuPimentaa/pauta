/** Demanda (card), checklists, comentários, anexos, histórico e os DTOs do núcleo da demanda. */
import type { ItemBase, NovoItem } from './arquivos.ts'
import type { Aprovacao, Envio, LinkPublicoResumo, Rodada, VersaoComItens } from './ciclo.ts'
import type {
  Cor, DataLocal, HoraLocal, Id, Instante, PapelColuna, PosicaoRelativa, Prioridade, Repeticao,
} from './nucleo.ts'
import type { Coluna, EtiquetasSemPar, GatilhoAutomacao, MembrosAoMover, Quadro } from './quadros.ts'

export const ORIGENS_DEMANDA = ['manual', 'rapida', 'whatsapp', 'copia', 'repeticao', 'importacao'] as const
export type OrigemDemanda = (typeof ORIGENS_DEMANDA)[number]

/**
 * A demanda como aparece no quadro (bootstrap, eventos, listas, Agenda). Sem a descrição, que vem no detalhe.
 * Prazo sem hora = 18:00. Número global fixo (#123): mover entre quadros não muda o número nem o histórico.
 */
export interface Demanda {
  id: Id
  numero: number
  quadroId: Id
  colunaId: Id
  /** Ordem dentro da coluna. */
  posicao: number
  titulo: string
  clienteId: Id | null
  /** AM (atendimento) da demanda; padrão: o AM do cliente. */
  atendimentoId: Id | null
  modeloId: Id | null
  /** Membros/responsáveis ("Pessoas"), na ordem em que entraram. */
  membroIds: Id[]
  /**
   * Etiquetas do quadro atual, na ordem do quadro. As que a demanda tinha em outros quadros ficam guardadas no banco
   * (demanda_etiqueta com o quadro delas) e voltam se ela voltar para lá (API.md §5.6).
   */
  etiquetaIds: Id[]
  prioridade: Prioridade
  inicio: DataLocal | null
  inicioHora: HoraLocal | null
  prazo: DataLocal | null
  /** Nula = 18:00 (ConfigApp.prazoHoraPadrao). */
  prazoHora: HoraLocal | null
  publicacaoData: DataLocal | null
  publicacaoHora: HoraLocal | null
  estimativaMin: number | null
  minutosRegistrados: number
  repetir: Repeticao
  capaCor: Cor | null
  capaAnexoId: Id | null
  /** /api/arquivos/:id?inline=1 da imagem da capa (calculado). */
  capaUrl: string | null
  concluidaEm: Instante | null
  concluidaPor: Id | null
  /**
   * Última mudança de coluna (ou de quadro): base do "parado há X dias úteis". Sempre cresce: cada troca de coluna
   * grava max(agora, anterior + 1 ms) (API.md §5.1).
   */
  statusDesde: Instante
  /** Envio ao cliente ainda sem decisão: a bola está com o cliente desde este instante. */
  envioPendenteEm: Instante | null
  /**
   * Última decisão válida do cliente (aprovado ou ajuste; link ou registrada). Numa coluna aguardando_cliente, a bola
   * volta para a equipe quando retornoEm ≥ statusDesde, mesmo sem automação que tire o card dali (API.md §5.4).
   * Anular a aprovação limpa.
   */
  retornoEm: Instante | null
  rodadaAtual: number
  rodadasInclusas: number
  aprovadaEm: Instante | null
  aprovadaVersaoId: Id | null
  versaoAtualId: Id | null
  versaoEnviadaId: Id | null
  nVersoes: number
  nAnexos: number
  nCheckTotal: number
  nCheckFeitos: number
  nComentarios: number
  origem: OrigemDemanda
  /** De quem foi copiada ou repetida. */
  origemDemandaId: Id | null
  /** Muda com a descrição. Patch com este campo no SSE = recarregar o detalhe (['demanda', numero]). */
  descricaoAtualizadaEm: Instante | null
  criadoPor: Id
  arquivadoEm: Instante | null
  rev: number
  criadoEm: Instante
  atualizadoEm: Instante
}

export const ESTADOS_PRAZO = ['atrasada', 'hoje', 'em_dia', 'sem_prazo', 'pausado', 'concluida'] as const
/**
 * Estado do prazo (estadoPrazo() em shared/logica/prazo.ts; API.md §5.2). Vale para o card, o Início, a Agenda, os
 * contadores do cliente e o filtro `prazo`. Concluída → 'concluida'; com o cliente → 'pausado' (nunca atrasada);
 * senão prazo + prazoHora (18:00) contra agora.
 */
export type EstadoPrazo = (typeof ESTADOS_PRAZO)[number]

export const COM_QUEM = ['equipe', 'cliente', 'concluida'] as const
/**
 * Com quem está a bola (comQuemEsta() em shared/logica/quadro.ts; API.md §5.4): 'concluida' quando concluída;
 * 'cliente' quando há envio sem decisão (envioPendenteEm) ou quando a demanda está numa coluna aguardando_cliente e o
 * cliente ainda não decidiu depois que ela entrou ali (retornoEm nulo ou statusDesde > retornoEm); senão 'equipe'
 * (os membros). O card mostra "parado há N dias úteis" (equipe) ou "com o cliente há N" (cliente).
 */
export type ComQuem = (typeof COM_QUEM)[number]

export interface Checklist {
  id: Id
  demandaId: Id
  titulo: string
  /** Não nulo = "Ajustes R{N}". */
  rodadaId: Id | null
  pos: number
  criadoEm: Instante
}

export interface ChecklistItem {
  id: Id
  checklistId: Id
  demandaId: Id
  texto: string
  feitoEm: Instante | null
  feitoPor: Id | null
  pos: number
}

export interface ChecklistComItens extends Checklist {
  itens: ChecklistItem[]
}

export const FINALIDADES_ANEXO = ['referencia', 'evidencia'] as const
export type FinalidadeAnexo = (typeof FINALIDADES_ANEXO)[number]

export interface Anexo extends ItemBase {
  comentarioId: Id | null
  /** evidencia = print do retorno do cliente. */
  finalidade: FinalidadeAnexo
  enviadoPor: Id | null
  criadoEm: Instante
}

export interface Comentario {
  id: Id
  demandaId: Id
  /** Nulo = cliente pelo link. */
  autorId: Id | null
  autorExterno: string | null
  linkId: Id | null
  versaoId: Id | null
  /** Markdown; menção = @[Rafa](mencao:<id>). Comentário excluído chega com corpoMd ''. */
  corpoMd: string
  visivelCliente: boolean
  mencoes: Id[]
  anexos: Anexo[]
  editadoEm: Instante | null
  excluidoEm: Instante | null
  criadoEm: Instante
}

/** Uma passagem por uma coluna (tabela demanda_movimento, gravada por gatilho). */
export interface MovimentoDemanda {
  id: number
  quadroId: Id
  colunaId: Id
  papel: PapelColuna
  entrouEm: Instante
  saiuEm: Instante | null
  por: Id | null
}

/** GET /api/demandas/:numero: tudo o que o modal mostra, numa ida. */
export interface DemandaDetalhe {
  demanda: Demanda
  /**
   * Quadro e coluna da demanda, mesmo arquivados (a demanda arquivada ou de quadro arquivado não está no bootstrap;
   * o modal monta o contexto com eles e abre só para leitura).
   */
  quadro: Quadro
  coluna: Coluna
  descricaoMd: string
  /** Texto colado do WhatsApp; exibir só como texto puro. */
  origemTexto: string | null
  /** Menções da descrição. */
  mencoes: Id[]
  checklists: ChecklistComItens[]
  anexos: Anexo[]
  rodadas: Rodada[]
  versoes: VersaoComItens[]
  envios: Envio[]
  aprovacoes: Aprovacao[]
  /** Só para atendimento e admin (os outros recebem []). */
  linksPublicos: LinkPublicoResumo[]
  /** Colunas e quadros por onde passou (tempo em cada coluna), mais antigos primeiro. */
  movimentos: MovimentoDemanda[]
  tempo: { totalMin: number; meusMin: number }
}

// ─────────────────────────────── histórico ───────────────────────────────

export const TIPOS_ATIVIDADE = [
  'demanda.criada', 'demanda.editada', 'demanda.movida', 'demanda.concluida', 'demanda.reaberta',
  'demanda.membro_adicionado', 'demanda.membro_removido', 'demanda.etiqueta_adicionada', 'demanda.etiqueta_removida',
  'demanda.arquivada', 'demanda.restaurada', 'demanda.excluida', 'demanda.copiada', 'demanda.repetida',
  'rodada.aberta', 'rodada.extra_marcada', 'rodada.extra_desmarcada',
  'versao.entregue', 'versao.itens_adicionados', 'versao.enviada', 'link.gerado', 'link.revogado', 'link.visto',
  'retorno.registrado', 'aprovacao.anulada',
  'comentario.criado', 'comentario.editado', 'comentario.excluido',
  'anexo.adicionado', 'anexo.removido',
  'checklist.criado', 'checklist.removido', 'checklist.item_feito', 'checklist.item_desfeito',
  'checklist.editado', 'checklist.item_editado', 'checklist.item_removido',
  'tempo.lancado',
  'cliente.criado', 'cliente.editado',
] as const
export type TipoAtividade = (typeof TIPOS_ATIVIDADE)[number]

export const VIAS_MOVIMENTO = ['manual', 'automacao', 'concluir', 'reabrir', 'coluna'] as const
/**
 * Como a demanda mudou de lugar: manual (arrastar, "Mover para", "Enviar para", teclas , e .), automacao (gatilho do
 * quadro), concluir/reabrir (marcar ou desmarcar concluída), coluna ("Mover todos os cards").
 */
export type ViaMovimento = (typeof VIAS_MOVIMENTO)[number]

export interface LugarDemanda {
  quadroId: Id
  colunaId: Id
}

/** Formato de `dados` por tipo (o que o histórico precisa para escrever a frase). `antes` guarda os valores anteriores. */
export interface MapaDadosAtividade {
  'demanda.criada': { origem: OrigemDemanda; quadroId: Id; colunaId: Id; modeloId: Id | null }
  'demanda.editada': { campos: string[] }
  'demanda.movida': {
    de: LugarDemanda; para: LugarDemanda; via: ViaMovimento; gatilho?: GatilhoAutomacao
    /** Nomes das etiquetas que ficaram guardadas no quadro de origem. */
    etiquetasDeixadas?: string[]
    /** Membros que entraram ou saíram com o movimento (coluna de pessoa, responsavel_destino). */
    membrosEntraram?: Id[]
    membrosSairam?: Id[]
  }
  /** via 'checkbox' (marcar), 'coluna' (soltar numa coluna concluida), 'papel' (a coluna virou concluida). */
  'demanda.concluida': { via: 'checkbox' | 'coluna' | 'papel'; proximaId?: Id; proximaNumero?: number }
  'demanda.reaberta': { colunaId: Id }
  'demanda.membro_adicionado': { usuarioId: Id }
  'demanda.membro_removido': { usuarioId: Id }
  'demanda.etiqueta_adicionada': { etiquetaId: Id; nome: string; cor: Cor }
  'demanda.etiqueta_removida': { etiquetaId: Id; nome: string; cor: Cor }
  'demanda.arquivada': Record<string, never>
  'demanda.restaurada': { quadroId: Id; colunaId: Id }
  'demanda.excluida': Record<string, never>
  'demanda.copiada': { novaId: Id; novaNumero: number } | { origemId: Id; origemNumero: number }
  'demanda.repetida': { novaId: Id; novaNumero: number } | { origemId: Id; origemNumero: number }
  'rodada.aberta': { rodadaId: Id; numero: number; origem: 'cliente' | 'interna'; motivo: string; prazo: DataLocal; itens: number; extra: boolean }
  'rodada.extra_marcada': { rodadaId: Id; numero: number }
  'rodada.extra_desmarcada': { rodadaId: Id; numero: number }
  'versao.entregue': { versaoId: Id; numero: number; itens: number }
  'versao.itens_adicionados': { versaoId: Id; numero: number; itens: number }
  'versao.enviada': { versaoId: Id; numero: number; via: 'link' | 'fora'; canal: string | null; contatoId: Id | null }
  'link.gerado': { linkId: Id }
  'link.revogado': { linkId: Id }
  'link.visto': { linkId: Id }
  'retorno.registrado': { aprovacaoId: Id; versaoNumero: number; decisao: 'aprovado' | 'ajuste'; via: 'link' | 'manual'; quem: string }
  'aprovacao.anulada': { aprovacaoId: Id; versaoNumero: number; voltou: boolean }
  'comentario.criado': { comentarioId: Id; visivelCliente: boolean }
  'comentario.editado': { comentarioId: Id }
  'comentario.excluido': { comentarioId: Id }
  'anexo.adicionado': { anexoId: Id; nome: string; tipo: string }
  'anexo.removido': { anexoId: Id; nome: string }
  'checklist.criado': { checklistId: Id; titulo: string }
  'checklist.removido': { checklistId: Id; titulo: string }
  'checklist.item_feito': { itemId: Id; texto: string }
  'checklist.item_desfeito': { itemId: Id; texto: string }
  /** Renomeado (integração 3A: a trilha do checklist de rodada, que é o pedido do cliente). */
  'checklist.editado': { checklistId: Id; titulo: string; tituloAntes: string }
  'checklist.item_editado': { itemId: Id; texto: string; textoAntes: string }
  'checklist.item_removido': { itemId: Id; texto: string }
  /** O histórico só mostra esta linha ao próprio ator e ao admin (horas individuais). */
  'tempo.lancado': { apontamentoId: Id; minutos: number; origem: 'manual' | 'cronometro' }
  'cliente.criado': { clienteId: Id; sigla: string }
  'cliente.editado': { clienteId: Id; campos: string[] }
}

export const ATORES_ATIVIDADE = ['usuario', 'cliente', 'sistema', 'importacao'] as const
export type AtorAtividade = (typeof ATORES_ATIVIDADE)[number]

export interface Atividade<T extends TipoAtividade = TipoAtividade> {
  id: number
  demandaId: Id | null
  clienteId: Id | null
  atorId: Id | null
  atorTipo: AtorAtividade
  tipo: T
  dados: MapaDadosAtividade[T]
  antes: Record<string, unknown> | null
  criadoEm: Instante
}

// ─────────────────────────────── DTOs: criar e editar ───────────────────────────────

export const AVISOS_DEMANDA = ['senha_detectada', 'limite_wip'] as const
/** Avisos que não bloqueiam: senha no texto (aponta o cofre), coluna acima do limite WIP. */
export type AvisoDemanda = (typeof AVISOS_DEMANDA)[number]

/**
 * POST /api/demandas ("Nova demanda", Shift+N). Com `modeloId`, o que não vier no corpo sai do modelo: descrição =
 * briefing, checklist padrão, etiquetas padrão (por nome), prazo = hoje + prazoDiasUteis, prioridade, estimativa,
 * rodadas inclusas (API.md §4.12).
 */
export interface CriarDemandaEntrada {
  quadroId: Id
  /** Padrão: a coluna de entrada do quadro (primeira coluna ativa de papel normal). */
  colunaId?: Id
  /** Padrão: no fim da coluna. */
  posicao?: PosicaoRelativa
  titulo: string
  modeloId?: Id | null
  clienteId?: Id | null
  /** Só atendimento/admin (CAMPOS_SO_ATENDIMENTO). Padrão: o AM do cliente, senão eu se meu papel for atendimento. */
  atendimentoId?: Id | null
  /** Padrão: vazio (a tela sugere o responsável do cliente na equipe do quadro). */
  membroIds?: Id[]
  /** Etiquetas do quadro de destino. */
  etiquetaIds?: Id[]
  descricaoMd?: string
  prioridade?: Prioridade
  inicio?: DataLocal | null
  inicioHora?: HoraLocal | null
  prazo?: DataLocal | null
  prazoHora?: HoraLocal | null
  publicacaoData?: DataLocal | null
  publicacaoHora?: HoraLocal | null
  estimativaMin?: number | null
  repetir?: Repeticao
  capaCor?: Cor | null
  /** Só atendimento/admin. Padrão: modelo ?? cliente ?? 2. */
  rodadasInclusas?: number
  /** Texto colado do WhatsApp (guardado como veio). */
  origemTexto?: string | null
  origem?: 'manual' | 'whatsapp'
  /** Links e caminhos de referência (viram anexos). */
  links?: NovoItem[]
}

/** Campos que só atendimento e admin mandam (criar, PATCH, copiar); os outros recebem 403 campo_nao_permitido. */
export const CAMPOS_SO_ATENDIMENTO = ['atendimentoId', 'rodadasInclusas'] as const satisfies readonly (keyof CriarDemandaEntrada)[]

export interface CriarDemandaSaida {
  demanda: Demanda
  avisos: AvisoDemanda[]
}

/**
 * PATCH /api/demandas/:id com If-Match: <rev>. Coluna, quadro, membros, etiquetas, concluir e arquivar têm rotas
 * próprias (não sobem o rev).
 */
export interface EditarDemandaEntrada {
  titulo?: string
  descricaoMd?: string
  clienteId?: Id | null
  atendimentoId?: Id | null
  prioridade?: Prioridade
  inicio?: DataLocal | null
  inicioHora?: HoraLocal | null
  prazo?: DataLocal | null
  prazoHora?: HoraLocal | null
  publicacaoData?: DataLocal | null
  publicacaoHora?: HoraLocal | null
  estimativaMin?: number | null
  repetir?: Repeticao
  capaCor?: Cor | null
  /** Anexo de imagem ativo desta demanda (ou null). Mandar capaAnexoId limpa capaCor e vice-versa. */
  capaAnexoId?: Id | null
  rodadasInclusas?: number
}

export interface EditarDemandaSaida {
  demanda: Demanda
  avisos: AvisoDemanda[]
}

/**
 * `detalhes.atual` do 409 conflito_rev (PATCH /api/demandas/:id e POST /mover com rev). Traz a descrição, que não está
 * em Demanda, para o navegador mesclar campo a campo sem sobrescrever o texto de outra pessoa.
 */
export interface ConflitoRevDetalhes {
  demanda: Demanda
  descricaoMd: string
}

/**
 * POST /api/demandas/:id/mover: arrastar no quadro, "Mover para…" (outro quadro), "Enviar para <quadro>", teclas , e .
 * Coluna e posição numa transação só. Ver API.md §5.1 (efeitos) e §5.6 (etiquetas entre quadros).
 */
export interface MoverEntrada {
  /** Coluna de destino (o quadro de destino é o dela). */
  colunaId: Id
  /** Padrão: no fim da coluna ("Enviar para <quadro>": no topo da coluna de entrada, quem chama manda depoisDeId null). */
  posicao?: PosicaoRelativa
  /** Só quando muda de quadro: o que fazer com as etiquetas sem par de mesmo nome no destino. Padrão 'deixar'. */
  etiquetasSemPar?: EtiquetasSemPar
  /** Só quando muda de quadro: as etiquetas no destino passam a ser estas (ids do destino). Usado pelo Desfazer. */
  etiquetaIds?: Id[]
  /**
   * Só quando muda de quadro: padrão 'manter'. "Mover para…" e "Enviar para" oferecem 'responsavel_destino' quando o
   * cliente tem responsável na equipe do destino. Usado também pelo Desfazer com `membroIds`.
   */
  membros?: MembrosAoMover
  /** Substitui os membros por estes (pessoas ativas). Usado pelo Desfazer de um movimento que trocou membros. */
  membroIds?: Id[]
  /** Rev que o cliente tinha; se vier e não bater, 409 conflito_rev. */
  rev?: number
}

export interface MoverSaida {
  demanda: Demanda
  /**
   * Nomes das etiquetas sem par no destino, que ficaram guardadas no quadro de origem (aviso "2 etiquetas ficaram no
   * quadro Criação"; voltam se a demanda voltar).
   */
  etiquetasDeixadas: string[]
  /** Etiquetas criadas no destino com etiquetasSemPar 'criar'. */
  etiquetasCriadas: Id[]
  /** A repetição criada ao soltar numa coluna 'concluida' (se `repetir` ≠ 'nenhuma'). */
  proxima: Demanda | null
  avisos: AvisoDemanda[]
}

/** POST /api/demandas/:id/concluir (checkbox "Concluída", tecla no card). */
export interface ConcluirEntrada {
  concluida: boolean
}

export interface ConcluirSaida {
  demanda: Demanda
  /** A repetição criada (concluir com `repetir` ≠ 'nenhuma'). */
  proxima: Demanda | null
  /** A automação 'concluida' do quadro moveu a demanda (destino em `demanda`). */
  automacao: boolean
}

/** POST /api/demandas/:id/membros ("Entrar" = eu mesmo, tecla Espaço). DELETE .../membros/:usuarioId tira. */
export interface AdicionarMembroEntrada {
  usuarioId: Id
}

/** POST /api/demandas/:id/etiquetas. DELETE .../etiquetas/:etiquetaId tira. A etiqueta é do quadro da demanda. */
export interface AdicionarEtiquetaEntrada {
  etiquetaId: Id
}

export interface DemandaSaida {
  demanda: Demanda
}

/** POST /api/demandas/:id/restaurar. Padrão: a coluna de antes; se arquivada, a coluna de entrada do quadro. */
export interface RestaurarEntrada {
  colunaId?: Id
}

/** POST /api/demandas/:id/copiar ("Copiar…" no menu do card e do modal, como no Trello). */
export interface CopiarDemandaEntrada {
  colunaId: Id
  posicao?: PosicaoRelativa
  /** Padrão: o mesmo título. */
  titulo?: string
  /** O que vai junto. Descrição, cliente, AM, prioridade, estimativa e modelo vão sempre. */
  manter?: { checklists?: boolean; etiquetas?: boolean; membros?: boolean; anexos?: boolean; datas?: boolean }
}

export interface ExcluirDemandaEntrada {
  /** Digitar o número confirma a anonimização. */
  confirmarNumero: number
}

// ─────────────────────────────── DTOs: criação rápida e colar do WhatsApp ───────────────────────────────

/** POST /api/demandas/rapida (Enter no rodapé da coluna) e /rapida/previa. Uma linha = uma demanda na coluna. */
export interface CriarRapidaEntrada {
  texto: string
  colunaId: Id
  /** Cliente do contexto (filtro de um só cliente no quadro). O marcador `HE:` no texto vence. */
  clienteId?: Id | null
  /** Padrão: no fim da coluna. */
  posicao?: PosicaoRelativa
}

/** Marcador reconhecido no texto (só casamento exato: `HE:`, `[HE]`, `HE -` = cliente; `@rafa` = membro). */
export interface MarcadorRapida {
  tipo: 'cliente' | 'membro'
  texto: string
  inicio: number
  fim: number
  id: Id
}

export interface AnaliseRapida {
  titulo: string
  clienteId: Id | null
  membroIds: Id[]
  marcadores: MarcadorRapida[]
  /**
   * Sigla no formato de marcador (`XYZ:`, `[XYZ]`, `XYZ -`; 1 a 12 de A–Z e 0–9) que não casa nenhum apelido: a
   * interface oferece "Criar cliente XYZ" (POST /api/clientes) sem sair do campo. O texto continua no título.
   */
  siglaNova: string | null
  /** Linha de prévia: "HE · Rafa · Fazendo". */
  previa: string
}

export interface CriarRapidaSaida {
  demanda: Demanda
  analise: AnaliseRapida
  avisos: AvisoDemanda[]
}

export interface AnalisarTextoEntrada {
  texto: string
}

/** "Colar do WhatsApp": reconhece "[14/10 15:32] Fulana:" e sugere cliente, modelo e título. */
export interface AnaliseTexto {
  tituloSugerido: string
  autor: string | null
  recebidoEm: Instante | null
  clientes: { id: Id; confianca: number; casou: string }[]
  /** Sigla em maiúsculas que parece um cliente mas não casa nenhum apelido: oferecer "Criar cliente XYZ". */
  siglaNova: string | null
  modelos: { id: Id; confianca: number; casou: string }[]
  senhaDetectada: boolean
}

// ─────────────────────────────── DTOs: checklists, comentários, anexos ───────────────────────────────

export interface CriarChecklistEntrada {
  titulo: string
  itens?: string[]
}

export interface EditarChecklistEntrada {
  titulo?: string
  posicao?: PosicaoRelativa
}

export interface CriarItensEntrada {
  /** Uma linha = um item. */
  textos: string[]
  posicao?: PosicaoRelativa
}

export interface EditarItemEntrada {
  texto?: string
  feito?: boolean
  posicao?: PosicaoRelativa
}

export interface CriarComentarioEntrada {
  corpoMd: string
  /** true só para atendimento e admin (vale também no PATCH); os outros: 403 campo_nao_permitido. */
  visivelCliente?: boolean
  versaoId?: Id | null
  /** Anexos já criados com POST /api/demandas/:id/anexos (ficam presos ao comentário). */
  anexoIds?: Id[]
}

export interface EditarComentarioEntrada {
  corpoMd?: string
  visivelCliente?: boolean
}

export interface ComentarioSaida {
  comentario: Comentario
  avisos: ('senha_detectada')[]
}

export type CriarAnexoEntrada = NovoItem & { finalidade?: FinalidadeAnexo }

export interface EditarAnexoEntrada {
  nome?: string
  posicao?: PosicaoRelativa
}

// ─────────────────────────────── busca e arquivo ───────────────────────────────

export interface BuscaConsulta {
  /** "#4521", "4521", "he outubro" (apelido do cliente + texto), texto livre (FTS por prefixo, sem acento). */
  q: string
  limite?: number
  incluirArquivadas?: boolean
  /** Só um quadro (a busca de dentro do quadro). */
  quadroId?: Id
}

export interface ResultadoBuscaDemanda {
  id: Id
  numero: number
  titulo: string
  clienteId: Id | null
  quadroId: Id
  colunaId: Id
  concluida: boolean
  arquivado: boolean
  /** Trecho com o termo (texto puro; o front destaca). */
  trecho: string | null
}

export interface BuscaSaida {
  demandas: ResultadoBuscaDemanda[]
}

/**
 * GET /api/arquivo: arquivadas + concluídas que já saíram do quadro (há mais de quadroConcluidasDias), arquivadas ou
 * não (API.md §4.19).
 */
export interface ListarArquivoConsulta {
  clienteId?: Id
  quadroId?: Id
  /** "YYYY-MM" de coalesce(arquivadoEm, concluidaEm). */
  mes?: string
  q?: string
  cursor?: string
  limite?: number
}

export interface ListarHistoricoConsulta {
  cursor?: string
  limite?: number
}
