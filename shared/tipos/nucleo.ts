/**
 * Núcleo do contrato: tipos básicos, valores fechados e o formato de erro.
 * JSON da API em camelCase. Valores fechados aparecem como `const` (servem ao zod e às telas) + tipo derivado.
 * Este arquivo roda no Node (type stripping) e no Vite: só sintaxe apagável, nada de enum/namespace.
 */

/** Id em texto: uuid (crypto.randomUUID()) ou slug estável dos seeds ('mq-kanban', 'md-post', 'eq-criacao'). */
export type Id = string
/** Instante ISO 8601 UTC com milissegundos: "2026-10-14T17:03:00.000Z". */
export type Instante = string
/** Data local de São Paulo, sem hora: "2026-10-16". */
export type DataLocal = string
/** Hora local "HH:MM" (24 h). Prazo sem hora vale 18:00. */
export type HoraLocal = string
/** Mês "YYYY-MM". */
export type Mes = string

export const FUSO = 'America/Sao_Paulo'
export const HORA_PADRAO_PRAZO: HoraLocal = '18:00'

export const PAPEIS = ['admin', 'atendimento', 'equipe'] as const
/**
 * admin: tudo, pessoas, quadros (criar, renomear, arquivar, excluir), equipes, configuração.
 * atendimento: clientes, enviar ao cliente, registrar retorno, marcar extra, comentário visível ao cliente.
 * equipe: todo o resto das demandas. Todo mundo vê tudo; horas individuais de outra pessoa só o admin vê.
 */
export type Papel = (typeof PAPEIS)[number]

export const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'] as const
/** Padrão 'media'. Qualquer pessoa interna muda. */
export type Prioridade = (typeof PRIORIDADES)[number]
export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
}

/** Cores de etiqueta, coluna, quadro, cliente e pessoa (tokens --label-*). O laranja da marca nunca entra aqui. */
export const CORES = [
  'ambar', 'amarelo', 'rosa', 'magenta', 'roxo', 'berinjela', 'verde', 'turquesa', 'azul', 'grafite',
] as const
export type Cor = (typeof CORES)[number]

export const PAPEIS_COLUNA = ['normal', 'aguardando_cliente', 'concluida'] as const
/**
 * Papel opcional da coluna, que dá significado sem prender o fluxo:
 * - normal (padrão);
 * - aguardando_cliente: a bola está com o cliente e o "parado há" pausa ("com o cliente há N dias úteis");
 * - concluida: cards aqui contam como entregues (soltar aqui marca concluída; sair daqui desmarca).
 */
export type PapelColuna = (typeof PAPEIS_COLUNA)[number]
export const ROTULO_PAPEL_COLUNA: Record<PapelColuna, string> = {
  normal: 'Normal', aguardando_cliente: 'Aguardando o cliente', concluida: 'Concluída',
}

export const FUNDOS_QUADRO = ['liso', 'grafite', 'berinjela', 'cobalto', 'aurora'] as const
/** Fundo do quadro: 'liso' = --bg; os outros são gradientes da marca (tokens --fundo-*). */
export type FundoQuadro = (typeof FUNDOS_QUADRO)[number]

export const REPETICOES = ['nenhuma', 'diaria', 'semanal', 'mensal'] as const
/** Ao concluir, cria a próxima com o prazo seguinte (exige prazo; API.md §5.3). */
export type Repeticao = (typeof REPETICOES)[number]
export const ROTULO_REPETICAO: Record<Repeticao, string> = {
  nenhuma: 'Não repetir', diaria: 'Todo dia útil', semanal: 'Toda semana', mensal: 'Todo mês',
}

export const MOTIVOS_RODADA = [
  'cliente_mudou', 'briefing_incompleto', 'erro_execucao', 'erro_atendimento', 'outro',
] as const
export type MotivoRodada = (typeof MOTIVOS_RODADA)[number]
export const ROTULO_MOTIVO_RODADA: Record<MotivoRodada, string> = {
  cliente_mudou: 'O cliente mudou de ideia',
  briefing_incompleto: 'Briefing incompleto',
  erro_execucao: 'Erro de execução',
  erro_atendimento: 'Erro de atendimento',
  outro: 'Outro',
}

export const CANAIS = ['whatsapp', 'email', 'reuniao', 'outro'] as const
/** Canal de um envio "por fora" ou de um retorno registrado à mão. */
export type Canal = (typeof CANAIS)[number]

export const PROVEDORES = [
  'drive', 'docs', 'figma', 'canva', 'wetransfer', 'youtube', 'vimeo', 'dropbox', 'rede', 'arquivo', 'outro',
] as const
export type Provedor = (typeof PROVEDORES)[number]

// ─────────────────────────────── erros ───────────────────────────────

export const CODIGOS_ERRO = [
  'validacao',              // 400 corpo/consulta inválidos (zod); detalhes.campos
  'nao_autenticado',        // 401 sem sessão ou sessão expirada
  'credenciais_invalidas',  // 401 e-mail ou senha errados
  'csrf',                   // 403 falta X-Trace-Id ou Origin diferente de APP_URL
  'sem_permissao',          // 403 o papel não permite; a mensagem diz o motivo
  'campo_nao_permitido',    // 403 campo só do atendimento/admin; detalhes.campo
  'nao_encontrado',         // 404
  'conflito_rev',           // 409 If-Match diferente do rev atual; detalhes.atual: ConflitoRevDetalhes
  'versao_desatualizada',   // 409 chegou versão nova (link público ou retorno); detalhes.versaoAtual
  'ja_decidida',            // 409 a versão já tem decisão válida
  'conflito',               // 409 outro conflito de estado (sigla repetida, coluna com cards, quadro com histórico)
  'link_inativo',           // 410 link público expirado ou revogado
  'token_invalido',         // 410 convite/redefinição usado, revogado, expirado, inexistente ou de pessoa inativa
  'arquivo_grande',         // 413 upload acima de 10 MB (recusado pelo Content-Length, sem parse; o corpo é descartado)
  'corpo_grande',           // 413 corpo JSON acima de 1 MiB
  'tipo_arquivo',           // 415 magic number fora da allowlist
  'estado_invalido',        // 422 a ação não vale no estado atual (enviar sem versão ou sem cliente, destino arquivado)
  'senha_fraca',            // 422 menos de 10 caracteres ou senha óbvia
  'drive_privado',          // 422 envio por link bloqueado: item do Drive não está público
  'idempotencia',           // 422 a mesma Idempotency-Key veio com outro pedido (hash diferente)
  'muitas_tentativas',      // 429 limite de login, troca de senha ou página pública; detalhes.tenteEmSegundos
  'interno',                // 500
] as const
export type CodigoErro = (typeof CODIGOS_ERRO)[number]

/** Corpo de toda resposta de erro (docs/API.md §1). */
export interface ErroApi {
  erro: {
    codigo: CodigoErro
    mensagem: string
    detalhes?: Record<string, unknown>
  }
}

/** Página por cursor opaco. `proximo` nulo = acabou. */
export interface Pagina<T> {
  itens: T[]
  proximo: string | null
}

export interface Ok {
  ok: true
}

/** Posição relativa em listas ordenadas: o servidor calcula a chave (média dos vizinhos) no escopo do pai. */
export interface PosicaoRelativa {
  /** Soltar logo depois deste item (null = no topo). Tem precedência sobre antesDeId. */
  depoisDeId?: Id | null
  antesDeId?: Id | null
}

/** Headers que o cliente web sempre manda nas mutações. */
export const HEADER_TRACE = 'X-Trace-Id'
export const HEADER_IF_MATCH = 'If-Match'
export const HEADER_IDEMPOTENCIA = 'Idempotency-Key'
