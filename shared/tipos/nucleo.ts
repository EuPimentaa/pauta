/**
 * Núcleo do contrato: tipos básicos, valores fechados e o formato de erro.
 * JSON da API em camelCase. Valores fechados aparecem como `const` (servem ao zod e às telas) + tipo derivado.
 * Este arquivo roda no Node (type stripping) e no Vite: só sintaxe apagável, nada de enum/namespace.
 */

/** Id em texto: uuid (crypto.randomUUID()) ou slug estável dos seeds ('et-fila', 'tp-post'). */
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

export const PAPEIS = ['admin', 'atendimento', 'executor', 'agente'] as const
/** `agente` existe no banco para a v1 (token de serviço); no MVP ninguém recebe esse papel. */
export type Papel = (typeof PAPEIS)[number]

export const CATEGORIAS = [
  'triagem', 'fila', 'producao', 'revisao', 'cliente', 'ajuste', 'aprovado', 'publicacao', 'concluido', 'cancelado',
] as const
/** Categoria fixa da etapa. `demanda.status` = categoria da etapa atual. */
export type Categoria = (typeof CATEGORIAS)[number]

/** Caminho feliz usado por "." (próxima) e "," (anterior), pulando etapas que não se aplicam ao tipo. Ajuste → revisao. */
export const CAMINHO_FELIZ: readonly Categoria[] = [
  'triagem', 'fila', 'producao', 'revisao', 'cliente', 'aprovado', 'publicacao', 'concluido',
]

export const BOLAS = ['agencia', 'cliente', 'terceiro'] as const
export type Bola = (typeof BOLAS)[number]

export const BLOQUEIOS = ['cliente', 'interno', 'fornecedor'] as const
export type Bloqueio = (typeof BLOQUEIOS)[number]

export const PRIORIDADES = [0, 1, 2] as const
/** 0 normal, 1 urgente, 2 fura-pauta. 1 e 2 exigem motivo. */
export type Prioridade = (typeof PRIORIDADES)[number]
export const ROTULO_PRIORIDADE: Record<Prioridade, string> = { 0: 'Normal', 1: 'Urgente', 2: 'Fura-pauta' }

/** Cores de etiqueta da marca (tokens --label-*). O laranja nunca é etiqueta. */
export const CORES = [
  'ambar', 'amarelo', 'rosa', 'magenta', 'roxo', 'berinjela', 'verde', 'turquesa', 'azul', 'grafite',
] as const
export type Cor = (typeof CORES)[number]

/** Cor da faixa de 3 px no topo da coluna (por etapa). info/warning/success/danger são tokens de estado. */
export const CORES_ETAPA = ['grafite', 'roxo', 'info', 'warning', 'turquesa', 'success', 'danger'] as const
export type CorEtapa = (typeof CORES_ETAPA)[number]

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
  'sem_permissao',          // 403 papel/relação não permite; mensagem diz o motivo
  'campo_nao_permitido',    // 403 PATCH com campo fora da lista do papel; detalhes.campo
  'nao_encontrado',         // 404
  'conflito_rev',           // 409 If-Match diferente do rev atual; detalhes.atual: ConflitoRevDetalhes
  'requer_dialogo',         // 409 a transição precisa de um diálogo; detalhes: DetalhesRequerDialogo
  'versao_desatualizada',   // 409 chegou versão nova (link público ou retorno); detalhes.versaoAtual
  'ja_decidida',            // 409 a versão já tem decisão válida
  'conflito',               // 409 outro conflito de estado (ex.: sigla repetida, ausência sobreposta)
  'link_inativo',           // 410 link público expirado ou revogado
  'token_invalido',         // 410 convite/redefinição usado, revogado, expirado, inexistente ou de pessoa inativa
  'arquivo_grande',         // 413 upload acima de 10 MB (recusado pelo Content-Length, sem ler o corpo)
  'corpo_grande',           // 413 corpo JSON acima de 1 MiB
  'tipo_arquivo',           // 415 magic number fora da allowlist
  'transicao_invalida',     // 422 não existe transição de → para, ou a etapa não se aplica ao tipo
  'senha_fraca',            // 422 menos de 10 caracteres ou senha óbvia
  'drive_privado',          // 422 envio por link bloqueado: item do Drive não está público
  'idempotencia',           // 422 a mesma Idempotency-Key veio com outro pedido (hash diferente)
  'muitas_tentativas',      // 429 limite de login, troca de senha ou página pública; detalhes.tenteEmSegundos
  'interno',                // 500
] as const
export type CodigoErro = (typeof CODIGOS_ERRO)[number]

/** Corpo de toda resposta de erro (docs/ARQUITETURA.md). */
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

/** Posição relativa para listas ordenadas: o servidor calcula a chave (média dos vizinhos). */
export interface PosicaoRelativa {
  /** Soltar logo depois deste item (null = no topo). Tem precedência sobre antesDeId. */
  depoisDeId?: Id | null
  antesDeId?: Id | null
}

/** Headers que o cliente web sempre manda nas mutações. */
export const HEADER_TRACE = 'X-Trace-Id'
export const HEADER_IF_MATCH = 'If-Match'
export const HEADER_IDEMPOTENCIA = 'Idempotency-Key'
