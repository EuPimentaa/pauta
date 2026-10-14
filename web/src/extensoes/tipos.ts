/**
 * Contrato dos pontos de extensão do front (docs/PLANO.md §3).
 *
 * Cada funcionalidade cria ARQUIVOS NOVOS nas pastas abaixo; web/src/extensoes/registro.ts (DESIGN-SYSTEM-WEB) os
 * descobre com import.meta.glob(..., { eager: true }) e ordena por `ordem`. Ninguém edita arquivo central para
 * "registrar" algo. Nome do arquivo: `<funcionalidade>-<coisa>.ts(x)` (ex.: extensoes/demanda/ciclo-versoes.tsx).
 *
 * | Pasta (web/src/...)            | Export obrigatório                         | Quem consome                 |
 * |--------------------------------|--------------------------------------------|------------------------------|
 * | telas/**\/rota.tsx              | rota: ExtensaoRota  (ou rotas: [])         | App.tsx (roteador)           |
 * | extensoes/menu/*.tsx           | menu: ExtensaoMenu                         | casca: menu lateral          |
 * | extensoes/topo/*.tsx           | topo: ExtensaoTopo                         | casca: barra superior        |
 * | extensoes/avatar/*.tsx         | avatar: ExtensaoAvatar                     | casca: menu do avatar        |
 * | extensoes/celular/*.tsx        | aba: ExtensaoAbaCelular                    | casca: barra de abas móvel   |
 * | extensoes/demanda/*.tsx        | secao: ExtensaoSecaoDemanda                | modal da demanda             |
 * | extensoes/demanda-acoes/*.tsx  | acoes: ExtensaoAcaoDemanda[]               | modal: topo                  |
 * | extensoes/demanda-menu/*.tsx   | itens: ExtensaoMenuDemanda[]               | modal: menu ···              |
 * | extensoes/mover/*.ts           | interceptador: InterceptadorMover          | mover() do front             |
 * | extensoes/dialogos/*.tsx       | dialogo: ExtensaoDialogo<'id'>             | host de diálogos             |
 * | extensoes/comandos/*.ts        | comandos: Comando[]                        | paleta Cmd+K                 |
 * | extensoes/busca/*.ts           | fonte: FontePaleta                         | paleta Cmd+K                 |
 * | extensoes/atalhos/*.ts         | atalhos: Atalho[]                          | despachante de teclado       |
 * | extensoes/eventos/*.ts         | tratador: TratadorEventos                  | cliente SSE                  |
 * | extensoes/layouts/*.tsx        | layout: ExtensaoLayout                     | página da visão              |
 * | extensoes/visao-cabecalho/*.tsx| item: ExtensaoCabecalhoVisao               | página da visão              |
 * | extensoes/coluna-menu/*.tsx    | itens: ExtensaoMenuColuna[]                | quadro: menu da coluna       |
 * | extensoes/inicio/*.tsx         | secao: ExtensaoSecaoInicio                 | tela Início                  |
 * | extensoes/config/*.tsx         | secao: ExtensaoSecaoConfig                 | tela Configurações           |
 */
import type { ComponentType } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import type {
  AgruparPor, Demanda, DemandaDetalhe, DialogoTransicao, Entidade, Etapa, Eu, EventoTempoReal, FiltrosVisao, Id,
  MoverEntrada, Papel, RelacaoDemanda, TipoPeca, Transicao, Visao,
} from '@shared/tipos/index.ts'

export type Icone = LucideIcon

// ─────────────────────────────── utilitários que o núcleo injeta ───────────────────────────────

/** Abre um diálogo registrado e espera o resultado (null = cancelado). Implementado em web/src/dialogos/. */
export type AbrirDialogo = <K extends keyof MapaDialogos>(
  id: K,
  params: MapaDialogos[K],
) => Promise<MapaResultadosDialogos[K] | null>

/** O que comandos, atalhos e ações recebem. */
export interface ContextoAcao {
  eu: Eu
  navegar(caminho: string, opcoes?: { novaAba?: boolean }): void
  abrirDialogo: AbrirDialogo
  /** Card com foco no quadro, ou a demanda aberta no modal. */
  demandaEmFoco: Demanda | null
}

// ─────────────────────────────── telas ───────────────────────────────

export interface ExtensaoRota {
  /** Padrão do react-router: '/inicio', '/v/:slug', '/d/:numero', '/a/:token'. */
  caminho: string
  Componente: ComponentType
  acesso: 'publica' | 'autenticada' | 'admin'
  /** casca = com menu e barra; vazio = tela cheia (login, página pública); sobreposta = por cima da tela atual (/d/:numero). */
  layout: 'casca' | 'vazio' | 'sobreposta'
  /** Título da aba: "<titulo> · <APP_NOME>". */
  titulo?: string
}

// ─────────────────────────────── casca ───────────────────────────────

export interface ItemMenu {
  id: string
  rotulo: string
  icone: Icone
  caminho: string
  /** "Triagem (3)". Zero não aparece. */
  contador?: number
  ordem: number
}

/** Um arquivo pode contribuir vários itens (ex.: uma entrada por visão). `useItens` é um hook (pode ler o cache). */
export interface ExtensaoMenu {
  id: string
  grupo: 'trabalho' | 'visoes' | 'agencia'
  ordem: number
  useItens(): ItemMenu[]
}

export interface ExtensaoTopo {
  id: string
  ordem: number
  lado: 'esquerda' | 'direita'
  Componente: ComponentType
}

export interface ExtensaoAvatar {
  id: string
  ordem: number
  Componente: ComponentType<{ fechar(): void }>
}

/** Barra de abas do celular por papel (SPEC §5.15). `destaque` = o "+" central. */
export interface ExtensaoAbaCelular {
  id: string
  ordem: number
  papeis: Papel[]
  rotulo: string
  icone: Icone
  caminho?: string
  executar?(ctx: ContextoAcao): void
  destaque?: boolean
}

// ─────────────────────────────── modal da demanda ───────────────────────────────

export interface ContextoDemanda {
  demanda: Demanda
  /** Chega depois: o modal abre do cache. */
  detalhe: DemandaDetalhe | undefined
  eu: Eu
  etapa: Etapa
  tipo: TipoPeca | null
  relacao: RelacaoDemanda
}

export interface UtilModal {
  abrirDialogo: AbrirDialogo
  navegar(caminho: string): void
  fechar(): void
}

export interface ExtensaoSecaoDemanda {
  id: string
  ordem: number
  coluna: 'principal' | 'lateral'
  visivel?(ctx: ContextoDemanda): boolean
  Componente: ComponentType<{ ctx: ContextoDemanda }>
}

/**
 * Ações do topo do modal. Só UMA vira o primário laranja: a de menor `ordem` entre as visíveis cujo `primaria(ctx)`
 * é true. As outras aparecem como botões secundários (até 2) e o resto vai para o menu ···.
 */
export interface ExtensaoAcaoDemanda {
  id: string
  ordem: number
  rotulo(ctx: ContextoDemanda): string
  icone?: Icone
  /** Texto da tecla exibido no tooltip ("Shift+R"). O atalho em si é registrado em extensoes/atalhos. */
  atalho?: string
  visivel(ctx: ContextoDemanda): boolean
  primaria?(ctx: ContextoDemanda): boolean
  executar(ctx: ContextoDemanda, util: UtilModal): void | Promise<void>
}

export interface ExtensaoMenuDemanda {
  id: string
  ordem: number
  rotulo: string
  icone?: Icone
  atalho?: string
  perigo?: boolean
  visivel(ctx: ContextoDemanda): boolean
  executar(ctx: ContextoDemanda, util: UtilModal): void | Promise<void>
}

// ─────────────────────────────── mover (arrastar, pílula, "," e ".") ───────────────────────────────

/**
 * O núcleo calcula a transição (shared/logica/transicoes.ts). Se ela requer um diálogo (DialogoTransicao), o card fica
 * pendente (fantasma) e o núcleo chama o interceptador registrado para aquele diálogo. Sem interceptador: o card volta
 * e aparece o aviso "Use a ação na demanda".
 */
export interface PedidoMover {
  demanda: Demanda
  de: Etapa
  para: Etapa
  transicao: Transicao
  dialogo: DialogoTransicao
  origem: 'arrastar' | 'pilula' | 'teclado' | 'acao'
  extras: Pick<MoverEntrada, 'posicao' | 'responsavelId' | 'planejadaPara'>
}

export type ResultadoInterceptador =
  /** O diálogo já fez a mutação (ex.: entregou a versão, enviou ao cliente). */
  | { tipo: 'feito'; demanda: Demanda }
  /** O núcleo chama POST /mover com estes extras (ex.: motivo, confirmar). */
  | { tipo: 'seguir'; extras: Pick<MoverEntrada, 'motivo' | 'confirmar'> }
  /** O card volta em 200 ms. */
  | { tipo: 'cancelado' }

export interface InterceptadorMover {
  id: string
  dialogos: DialogoTransicao[]
  executar(pedido: PedidoMover): Promise<ResultadoInterceptador>
}

// ─────────────────────────────── diálogos globais ───────────────────────────────

/** Diálogos que qualquer parte do app pode abrir por id. Dono de cada um: docs/PLANO.md §3. */
export interface MapaDialogos {
  'nova-demanda': { clienteId?: Id; tipoPecaId?: Id; textoColado?: string; focoColar?: boolean }
  'entregar-versao': { demandaId: Id }
  'enviar-ao-cliente': { demandaId: Id }
  'registrar-retorno': { demandaId: Id; decisao?: 'aprovado' | 'ajuste' }
  'devolver-ajuste': { demandaId: Id }
  'anular-aprovacao': { demandaId: Id }
  'repetir': { demandaId: Id }
  'lancar-tempo': { demandaId: Id }
  'ausencia': { usuarioId?: Id }
  'atalhos': Record<string, never>
  'confirmar': { titulo: string; mensagem: string; confirmar: string; perigo?: boolean }
  'motivo': { titulo: string; rotulo: string; confirmar: string; obrigatorio?: boolean }
}

export interface MapaResultadosDialogos {
  'nova-demanda': { demanda: Demanda }
  'entregar-versao': { demanda: Demanda }
  'enviar-ao-cliente': { demanda: Demanda }
  'registrar-retorno': { demanda: Demanda }
  'devolver-ajuste': { demanda: Demanda }
  'anular-aprovacao': { demanda: Demanda }
  'repetir': { demanda: Demanda }
  'lancar-tempo': { minutos: number }
  'ausencia': { salva: true }
  'atalhos': { fechado: true }
  'confirmar': { confirmado: true }
  'motivo': { motivo: string }
}

export interface PropsDialogo<K extends keyof MapaDialogos> {
  params: MapaDialogos[K]
  /** Chame com o resultado, ou com null para cancelar. */
  fechar(resultado: MapaResultadosDialogos[K] | null): void
}

export interface ExtensaoDialogo<K extends keyof MapaDialogos> {
  id: K
  Componente: ComponentType<PropsDialogo<K>>
}

/** Qualquer diálogo registrado (união distribuída, para o registro). */
export type QualquerExtensaoDialogo = { [K in keyof MapaDialogos]: ExtensaoDialogo<K> }[keyof MapaDialogos]

// ─────────────────────────────── paleta, busca e atalhos ───────────────────────────────

export interface Comando {
  id: string
  rotulo: string
  secao: 'acoes' | 'ir_para'
  palavras?: string[]
  atalho?: string
  icone?: Icone
  visivel?(ctx: ContextoAcao): boolean
  executar(ctx: ContextoAcao): void
}

export interface ResultadoPaleta {
  id: string
  rotulo: string
  detalhe?: string
  icone?: Icone
  /** Enter abre; Ctrl/Cmd+Enter abre em outra aba (quando houver caminho). */
  caminho?: string
  executar?(ctx: ContextoAcao): void
}

/** Fonte de resultados da paleta (Demandas, Clientes, Pessoas, Visões). Fontes locais respondem do cache. */
export interface FontePaleta {
  id: string
  secao: string
  ordem: number
  /** Caracteres mínimos para buscar (padrão 1). */
  minimo?: number
  buscar(termo: string, sinal: AbortSignal): ResultadoPaleta[] | Promise<ResultadoPaleta[]>
}

export type EscopoAtalho = 'global' | 'quadro' | 'card' | 'modal' | 'triagem' | 'semana'

export interface ContextoAtalho extends ContextoAcao {
  escopo: EscopoAtalho
}

/**
 * `teclas`: 'shift+r', 'mod+k' (Ctrl ou Cmd), ',', 'g i' (acorde de 1,5 s), 'shift+backspace'.
 * O despachante ignora teclas de uma letra dentro de campos de texto e quando prefs.atalhos = false.
 */
export interface Atalho {
  id: string
  teclas: string
  descricao: string
  escopo: EscopoAtalho
  /** Agrupamento na lista do "?". */
  grupo: 'navegacao' | 'demanda' | 'quadro' | 'triagem' | 'geral'
  quando?(ctx: ContextoAtalho): boolean
  executar(ctx: ContextoAtalho, evento: KeyboardEvent): void
}

// ─────────────────────────────── tempo real ───────────────────────────────

/** Recebe só eventos das entidades listadas, já sem o próprio eco (trace). Deve ser idempotente. */
export interface TratadorEventos {
  id: string
  entidades: Entidade[]
  tratar(evento: EventoTempoReal, qc: QueryClient): void
}

// ─────────────────────────────── visões ───────────────────────────────

export interface PropsLayout {
  visao: Visao
  agruparPor: AgruparPor
  filtros: FiltrosVisao
  /** Já filtradas e sem arquivadas. */
  demandas: Demanda[]
  abrir(numero: number): void
}

/** Quadro (NÚCLEO-WEB), Lista (LISTA-VISOES), Semana (PAINEIS). */
export interface ExtensaoLayout {
  id: 'quadro' | 'lista' | 'semana'
  rotulo: string
  ordem: number
  /** Agrupamentos que o layout aceita. */
  agrupamentos: AgruparPor[]
  Componente: ComponentType<PropsLayout>
}

export interface PropsCabecalhoVisao {
  visao: Visao
  filtros: FiltrosVisao
  definirFiltros(filtros: FiltrosVisao): void
  total: number
}

export interface ExtensaoCabecalhoVisao {
  id: string
  ordem: number
  lado: 'esquerda' | 'direita'
  Componente: ComponentType<PropsCabecalhoVisao>
}

export interface ContextoColuna {
  visao: Visao
  agruparPor: AgruparPor
  /** Id da etapa, do responsável ('nenhum' = sem responsável), do cliente ou a data. */
  chave: string
  etapa: Etapa | null
  demandas: Demanda[]
}

export interface ExtensaoMenuColuna {
  id: string
  ordem: number
  rotulo: string
  icone?: Icone
  visivel(ctx: ContextoColuna, eu: Eu): boolean
  executar(ctx: ContextoColuna, acao: ContextoAcao): void | Promise<void>
}

// ─────────────────────────────── Início e Configurações ───────────────────────────────

export interface ExtensaoSecaoInicio {
  id: string
  ordem: number
  visivel?(eu: Eu): boolean
  Componente: ComponentType
}

export interface ExtensaoSecaoConfig {
  id: string
  rotulo: string
  ordem: number
  /** Relativo a /config: 'pessoas' → /config/pessoas. */
  caminho: string
  acesso: Papel[]
  icone?: Icone
  Componente: ComponentType
}

/** Formato de cada módulo descoberto (para tipar o import.meta.glob em registro.ts). */
export interface ModulosExtensao {
  rota: { rota?: ExtensaoRota; rotas?: ExtensaoRota[] }
  menu: { menu: ExtensaoMenu }
  topo: { topo: ExtensaoTopo }
  avatar: { avatar: ExtensaoAvatar }
  celular: { aba: ExtensaoAbaCelular }
  demanda: { secao: ExtensaoSecaoDemanda }
  demandaAcoes: { acoes: ExtensaoAcaoDemanda[] }
  demandaMenu: { itens: ExtensaoMenuDemanda[] }
  mover: { interceptador: InterceptadorMover }
  dialogos: { dialogo: QualquerExtensaoDialogo }
  comandos: { comandos: Comando[] }
  busca: { fonte: FontePaleta }
  atalhos: { atalhos: Atalho[] }
  eventos: { tratador: TratadorEventos }
  layouts: { layout: ExtensaoLayout }
  visaoCabecalho: { item: ExtensaoCabecalhoVisao }
  colunaMenu: { itens: ExtensaoMenuColuna[] }
  inicio: { secao: ExtensaoSecaoInicio }
  config: { secao: ExtensaoSecaoConfig }
}
