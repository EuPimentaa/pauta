/**
 * Contrato dos pontos de extensão do front (docs/PLANO.md §3 e §4), para o modelo de QUADROS SEPARADOS POR EQUIPE.
 *
 * Cada funcionalidade cria ARQUIVOS NOVOS nas pastas abaixo; web/src/extensoes/registro.ts (DESIGN-SYSTEM-WEB) os
 * descobre com import.meta.glob('./<pasta>/*.{ts,tsx}', { eager: true }) (TODAS as pastas aceitam .ts e .tsx) e ordena
 * por `ordem` (números combinados no PLANO §4). Ninguém edita arquivo central para "registrar" algo.
 * Nome do arquivo: `<funcionalidade>.ts(x)` ou `<funcionalidade>-<coisa>.ts(x)` (ex.: extensoes/demanda/ciclo-versoes.tsx,
 * extensoes/soltar/ciclo.ts); o núcleo usa `nucleo`. Dono de cada arquivo: glob `extensoes/*\/<f>{,-*}.{ts,tsx}`.
 * Vários módulos podem registrar a mesma entidade, tecla etc.; ids repetidos são erro no console em dev.
 *
 * | Pasta (web/src/...)              | Export obrigatório                     | Quem consome                         |
 * |----------------------------------|----------------------------------------|--------------------------------------|
 * | telas/**\/rota.tsx                | rota: ExtensaoRota  (ou rotas: [])     | App.tsx (roteador, lazy)             |
 * | extensoes/global/*.tsx           | global: ExtensaoGlobal                 | App.tsx (montados uma vez)           |
 * | extensoes/menu/*.tsx             | menu: ExtensaoMenu                     | casca: menu lateral (fora os quadros)|
 * | extensoes/topo/*.tsx             | topo: ExtensaoTopo                     | casca: barra superior                |
 * | extensoes/avatar/*.tsx           | avatar: ExtensaoAvatar                 | casca: menu do avatar                |
 * | extensoes/celular/*.tsx          | aba: ExtensaoAbaCelular                | casca: barra de abas do celular      |
 * | extensoes/quadro-cabecalho/*.tsx | item: ExtensaoCabecalhoQuadro          | página do quadro: cabeçalho          |
 * | extensoes/quadro-menu/*.tsx      | itens: ExtensaoMenuQuadro[]            | página do quadro: menu ···           |
 * | extensoes/layouts/*.tsx          | layout: ExtensaoLayout                 | página do quadro: Quadro|Lista|Cal.  |
 * | extensoes/coluna-menu/*.tsx      | itens: ExtensaoMenuColuna[]            | quadro: menu ··· da coluna           |
 * | extensoes/coluna-entrada/*.tsx   | entrada: ExtensaoEntradaColuna         | quadro: rodapé da coluna, tecla N    |
 * | extensoes/card/*.tsx             | selo: ExtensaoSeloCard                 | card (quadro, Lista, Início, Agenda) |
 * | extensoes/soltar/*.ts(x)         | interceptador: InterceptadorSoltar     | useMover() do núcleo-web             |
 * | extensoes/demanda/*.tsx          | secao: ExtensaoSecaoDemanda            | modal da demanda                     |
 * | extensoes/demanda-acoes/*.tsx    | acoes: ExtensaoAcaoDemanda[]           | modal: topo                          |
 * | extensoes/demanda-menu/*.tsx     | itens: ExtensaoMenuDemanda[]           | modal: menu ···; card: menu de contexto |
 * | extensoes/dialogos/*.tsx         | dialogo: ExtensaoDialogo<'id'>         | host de diálogos                     |
 * | extensoes/comandos/*.ts(x)       | comandos: Comando[]                    | paleta Cmd+K                         |
 * | extensoes/busca/*.ts(x)          | fonte: FontePaleta                     | paleta Cmd+K                         |
 * | extensoes/atalhos/*.ts(x)        | atalhos: Atalho[]                      | despachante de teclado               |
 * | extensoes/eventos/*.ts(x)        | tratador: TratadorEventos              | cliente SSE                          |
 * | extensoes/inicio/*.tsx           | secao: ExtensaoSecaoInicio             | tela Início                          |
 * | extensoes/config/*.tsx           | secao: ExtensaoSecaoConfig             | tela Configurações                   |
 *
 * Componentes de extensão não recebem utilitários por props (exceto onde o tipo diz): usam os hooks do núcleo-web
 * (useContextoAcao, useAbrirDialogo, useEscopoAtalho, useFocoDemanda, useMover...; assinaturas no PLANO §2.2).
 */
import type { ComponentType } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import type {
  ClienteResumo, Coluna, Demanda, DemandaDetalhe, Entidade, Etiqueta, Eu, EventoTempoReal, FiltrosQuadro, Id,
  ModeloWhatsapp, MoverEntrada, Papel, PosicaoRelativa, Quadro, VisaoQuadro,
} from '@shared/tipos/index.ts'

export type Icone = LucideIcon

// ─────────────────────────────── utilitários que o núcleo injeta ───────────────────────────────

export interface OpcoesDialogo {
  /** Abre como popover ancorado (seletores de membros, etiquetas, datas, capa); no celular vira folha. */
  ancora?: HTMLElement | null
}

/** Abre um diálogo registrado e espera o resultado (null = cancelado). Implementado em web/src/dialogos/. */
export type AbrirDialogo = <K extends keyof MapaDialogos>(
  id: K,
  params: MapaDialogos[K],
  opcoes?: OpcoesDialogo,
) => Promise<MapaResultadosDialogos[K] | null>

/** O que comandos, atalhos e ações recebem. */
export interface ContextoAcao {
  eu: Eu
  navegar(caminho: string, opcoes?: { novaAba?: boolean }): void
  abrirDialogo: AbrirDialogo
  /** Card com foco (quadro, Lista, Início, Agenda: quem desenha o card chama useFocoDemanda), ou a demanda do modal. */
  demandaEmFoco: Demanda | null
  /** Quadro aberto em /q/:slug (ou o da demanda no modal); nulo nas outras telas. */
  quadroAtual: Quadro | null
}

// ─────────────────────────────── telas ───────────────────────────────

export interface ExtensaoRota {
  /** Padrão do react-router: '/inicio', '/agenda', '/q/:slug', '/d/:numero', '/a/:token', '/convite' (token no #). */
  caminho: string
  /**
   * Carrega a tela sob demanda (o roteador usa React.lazy): `carregar: () => import('./Tela.tsx')`. O rota.tsx fica
   * leve (só metadados), então cada tela vira um chunk e a página pública não baixa o app inteiro.
   */
  carregar: () => Promise<{ default: ComponentType }>
  /** 'publica': sem sessão; nada de bootstrap, SSE nem redirecionamento para /entrar (ex.: /a/:token, /convite). */
  acesso: 'publica' | 'autenticada' | 'admin'
  /** casca = com menu e barra; vazio = tela cheia; sobreposta = por cima da tela atual (/d/:numero, /quadros/novo). */
  layout: 'casca' | 'vazio' | 'sobreposta'
  /** Título da aba: "<titulo> · <APP_NOME>". Telas com título dinâmico (nome do quadro) usam useTituloAba(). */
  titulo?: string
}

// ─────────────────────────────── componentes globais ───────────────────────────────

/**
 * Componente montado uma vez pelo App.tsx (DESIGN-SYSTEM-WEB), dentro do QueryClientProvider e do Router: cliente SSE,
 * host de diálogos, paleta Cmd+K, despachante de atalhos, cronômetro flutuante. `autenticada` = só nas rotas com
 * `acesso !== 'publica'`; `raiz` = em todas as rotas. Renderiza null se não desenha nada.
 */
export interface ExtensaoGlobal {
  id: string
  ordem: number
  escopo: 'raiz' | 'autenticada'
  Componente: ComponentType
}

// ─────────────────────────────── casca ───────────────────────────────

export interface ItemMenu {
  id: string
  rotulo: string
  icone: Icone
  caminho: string
  /** "Início (3)". Zero não aparece. */
  contador?: number
  ordem: number
}

/**
 * Itens do menu lateral fora da seção Quadros. A seção Quadros (Favoritos com estrela e arrastar, quadros por equipe,
 * "+ Novo quadro" para admin → /quadros/novo) é da própria casca (DESIGN-SYSTEM-WEB), lida de ['bootstrap'].
 * `useItens` é um hook (pode ler o cache).
 */
export interface ExtensaoMenu {
  id: string
  /** trabalho: acima dos quadros (Início, Agenda); agencia: abaixo (Clientes, Arquivo, Configurações). */
  grupo: 'trabalho' | 'agencia'
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

/** Barra de abas do celular (Início · Agenda · + · Busca · Sino). `destaque` = o "+" central. */
export interface ExtensaoAbaCelular {
  id: string
  ordem: number
  rotulo: string
  icone: Icone
  caminho?: string
  executar?(ctx: ContextoAcao): void
  destaque?: boolean
}

// ─────────────────────────────── página do quadro (/q/:slug) ───────────────────────────────

export interface ContextoQuadro {
  quadro: Quadro
  /** Ativas, em ordem. */
  colunas: Coluna[]
  etiquetas: Etiqueta[]
  eu: Eu
}

/** Visões do quadro: Quadro (NÚCLEO-WEB), Lista e Calendário (F6). */
export interface PropsLayout {
  quadro: Quadro
  /** Ativas, em ordem. */
  colunas: Coluna[]
  etiquetas: Etiqueta[]
  filtros: FiltrosQuadro
  definirFiltros(filtros: FiltrosQuadro): void
  /** Do quadro, já filtradas (aplicarFiltros), sem arquivadas. */
  demandas: Demanda[]
  abrir(numero: number): void
  /** Largura abaixo de 768 px: colunas com rolagem horizontal e snap; modal em tela cheia. */
  celular: boolean
}

export interface ExtensaoLayout {
  id: VisaoQuadro
  rotulo: string
  icone: Icone
  ordem: number
  Componente: ComponentType<PropsLayout>
}

export interface PropsCabecalhoQuadro {
  quadro: Quadro
  layout: VisaoQuadro
  filtros: FiltrosQuadro
  definirFiltros(filtros: FiltrosQuadro): void
  /** Demandas visíveis com os filtros. */
  total: number
}

/** Slots do cabeçalho do quadro (nome editável, estrela e seletor de visão são do núcleo). */
export interface ExtensaoCabecalhoQuadro {
  id: string
  ordem: number
  lado: 'esquerda' | 'direita'
  Componente: ComponentType<PropsCabecalhoQuadro>
}

/** Itens do menu ··· do quadro (Etiquetas, Automações, Seguir, Arquivar quadro...). */
export interface ExtensaoMenuQuadro {
  id: string
  ordem: number
  rotulo: string
  icone?: Icone
  perigo?: boolean
  visivel?(ctx: ContextoQuadro): boolean
  executar(ctx: ContextoQuadro, acao: ContextoAcao): void | Promise<void>
}

export interface ContextoColuna {
  quadro: Quadro
  coluna: Coluna
  /** Filtros ATIVOS do quadro (a criação rápida pode herdar um cliente de um filtro de um só cliente). */
  filtros: FiltrosQuadro
  /** Da coluna, já filtradas, na ordem. */
  demandas: Demanda[]
}

/** Itens do menu ··· da coluna (renomear, cor, papel, limite WIP, ordenar, mover todos, arquivar todos, arquivar). */
export interface ExtensaoMenuColuna {
  id: string
  ordem: number
  rotulo: string
  icone?: Icone
  perigo?: boolean
  visivel?(ctx: ContextoColuna, eu: Eu): boolean
  executar(ctx: ContextoColuna, acao: ContextoAcao): void | Promise<void>
}

/**
 * Campo de criação rápida no rodapé da coluna ("+ Adicionar demanda"; Enter cria e mantém o campo aberto, Esc fecha;
 * `HE:` = cliente pela sigla/apelido, `@rafa` = membro). A tecla N e o botão são do NÚCLEO-WEB, que abre a entrada da
 * coluna em foco. Um só é usado: o de menor `ordem`. Sem nenhum registrado (ou `visivel` falso), a coluna não mostra o "+".
 */
export interface ExtensaoEntradaColuna {
  id: string
  ordem: number
  visivel?(ctx: ContextoColuna, eu: Eu): boolean
  Componente: ComponentType<{ ctx: ContextoColuna; fechar(): void }>
}

/**
 * Selo no card, desenhado depois dos selos do núcleo (prazo, contadores, membros). Deve ser barato (o quadro tem
 * centenas de cards) e devolver null quando não houver nada a mostrar. Ex.: cronômetro ligado (F1), "V2 · com o
 * cliente há 3d" e "R3/2" (F2).
 */
export interface ExtensaoSeloCard {
  id: string
  ordem: number
  lugar: 'topo' | 'rodape'
  Componente: ComponentType<{ demanda: Demanda; coluna: Coluna; quadro: Quadro }>
}

// ─────────────────────────────── soltar card (arrastar, "Mover para", teclas , e .) ───────────────────────────────

/**
 * Antes de chamar POST /api/demandas/:id/mover, o núcleo pergunta aos interceptadores, em ordem, e usa o PRIMEIRO cujo
 * `quando` for true; sem nenhum, move direto. Enquanto o interceptador decide, o card fica pendente no destino
 * (opacidade 0,6, borda tracejada); Esc ou 'cancelado' devolve em 200 ms. Ex.: soltar numa coluna aguardando_cliente
 * com versão ainda não enviada oferece "Enviar ao cliente" (F2); soltar numa coluna concluida com `repetir` avisa a
 * data da próxima (NÚCLEO-WEB).
 */
export interface PedidoSoltar {
  demanda: Demanda
  de: { quadro: Quadro; coluna: Coluna }
  para: { quadro: Quadro; coluna: Coluna }
  posicao: PosicaoRelativa
  origem: 'arrastar' | 'teclado' | 'menu' | 'dialogo'
}

export type ResultadoSoltar =
  /** O núcleo chama POST /mover com estes extras. */
  | { tipo: 'seguir'; extras?: Pick<MoverEntrada, 'etiquetasSemPar'> }
  /** O interceptador já fez a mutação (ex.: enviou ao cliente e a automação moveu). */
  | { tipo: 'feito'; demanda: Demanda }
  /** O card volta em 200 ms. */
  | { tipo: 'cancelado' }

export interface InterceptadorSoltar {
  id: string
  ordem: number
  quando(pedido: PedidoSoltar, eu: Eu): boolean
  executar(pedido: PedidoSoltar): Promise<ResultadoSoltar>
}

// ─────────────────────────────── modal da demanda (/d/:numero) ───────────────────────────────

export interface ContextoDemanda {
  demanda: Demanda
  /** Chega depois: o modal abre do cache. */
  detalhe: DemandaDetalhe | undefined
  eu: Eu
  quadro: Quadro
  coluna: Coluna
  cliente: ClienteResumo | null
  /** Sou membro da demanda. */
  souMembro: boolean
  /** Sou o AM da demanda. */
  souAm: boolean
  /** Papel atendimento ou admin (enviar ao cliente, retorno, extra, comentário visível ao cliente). */
  atendimento: boolean
}

export interface UtilModal {
  abrirDialogo: AbrirDialogo
  navegar(caminho: string): void
  fechar(): void
}

export interface ExtensaoSecaoDemanda {
  id: string
  ordem: number
  /** principal: descrição, checklists, versões, anexos, comentários; lateral: membros, etiquetas, datas, cliente... */
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

/**
 * Itens do menu ··· do modal e do menu de contexto do card (botão direito ou o lápis no hover, como o "Editar" do
 * Trello). `onde` padrão: os dois. No card, o contexto vem sem `detalhe`.
 */
export interface ExtensaoMenuDemanda {
  id: string
  ordem: number
  rotulo: string | ((ctx: ContextoDemanda) => string)
  icone?: Icone
  atalho?: string
  perigo?: boolean
  onde?: ('modal' | 'card')[]
  /** Submenu (ex.: "Enviar para ▸" com os quadros favoritos e depois os outros). */
  subitens?(ctx: ContextoDemanda): { id: string; rotulo: string; executar(util: UtilModal): void | Promise<void> }[]
  visivel(ctx: ContextoDemanda): boolean
  executar?(ctx: ContextoDemanda, util: UtilModal): void | Promise<void>
}

// ─────────────────────────────── diálogos globais ───────────────────────────────

/** Diálogos que qualquer parte do app pode abrir por id. Dono de cada um: docs/PLANO.md §3. */
export interface MapaDialogos {
  /** F4. Shift+N, o botão laranja e o "+" do celular. */
  'nova-demanda': { quadroId?: Id; colunaId?: Id; clienteId?: Id; modeloId?: Id; textoColado?: string; focoColar?: boolean }
  /** F1. "Mover para…": quadro + coluna + posição; mostra as etiquetas sem par e o responsável do cliente na equipe. */
  'mover-demanda': { demandaId: Id; quadroId?: Id }
  /** F1. "Copiar…" como no Trello (o que manter, quadro, coluna, posição). */
  'copiar-demanda': { demandaId: Id }
  /** F1. Popover de membros (busca por nome/apelido; "Entrar"/"Sair" para mim). */
  'membros': { demandaId: Id }
  /** F1. Com demandaId: marcar etiquetas do card. Sem: gerenciar as etiquetas do quadro (criar, renomear, cor, excluir). */
  'etiquetas': { quadroId: Id; demandaId?: Id }
  /** F1. Início, prazo (com hora), publicação e repetir. */
  'datas': { demandaId: Id }
  /** F1. Cor ou imagem anexada. */
  'capa': { demandaId: Id }
  /** F1. */
  'lancar-tempo': { demandaId: Id }
  /** F2. */
  'entregar-versao': { demandaId: Id }
  'enviar-ao-cliente': { demandaId: Id }
  'registrar-retorno': { demandaId: Id; decisao?: 'aprovado' | 'ajuste' }
  'ajuste-interno': { demandaId: Id }
  'anular-aprovacao': { demandaId: Id }
  /** F2: mostra o texto de GET /api/demandas/:id/whatsapp?modelo= e copia. Usado pelo Início (lembrete). */
  'copiar-whatsapp': { demandaId: Id; modelo: ModeloWhatsapp }
  /** F2. As 4 automações do quadro. */
  'automacoes-quadro': { quadroId: Id }
  /** F4. Lista do "?" gerada de atalhos(). */
  'atalhos': Record<string, never>
  /** NÚCLEO-WEB. `digitar`: exige digitar este texto para confirmar (ex.: o número ao excluir). */
  'confirmar': { titulo: string; mensagem: string; confirmar: string; perigo?: boolean; digitar?: string }
}

export interface MapaResultadosDialogos {
  'nova-demanda': { demanda: Demanda }
  'mover-demanda': { demanda: Demanda }
  'copiar-demanda': { demanda: Demanda }
  'membros': { membroIds: Id[] }
  'etiquetas': { etiquetaIds: Id[] }
  'datas': { demanda: Demanda }
  'capa': { demanda: Demanda }
  'lancar-tempo': { minutos: number }
  'entregar-versao': { demanda: Demanda }
  'enviar-ao-cliente': { demanda: Demanda }
  'registrar-retorno': { demanda: Demanda }
  'ajuste-interno': { demanda: Demanda }
  'anular-aprovacao': { demanda: Demanda }
  'copiar-whatsapp': { copiado: true }
  'automacoes-quadro': { salvo: true }
  'atalhos': { fechado: true }
  'confirmar': { confirmado: true }
}

export interface PropsDialogo<K extends keyof MapaDialogos> {
  params: MapaDialogos[K]
  /** Elemento de onde o diálogo foi aberto (quando o host desenha como popover). */
  ancora: HTMLElement | null
  /** Chame com o resultado, ou com null para cancelar. */
  fechar(resultado: MapaResultadosDialogos[K] | null): void
}

export interface ExtensaoDialogo<K extends keyof MapaDialogos> {
  id: K
  /** 'popover' quando aberto com âncora no desktop; 'modal' sempre como modal. Padrão 'modal'. */
  forma?: 'modal' | 'popover'
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

/** Fonte de resultados da paleta (Quadros, Demandas, Clientes, Pessoas). Fontes locais respondem do cache. */
export interface FontePaleta {
  id: string
  secao: string
  ordem: number
  /** Caracteres mínimos para buscar (padrão 1). */
  minimo?: number
  buscar(termo: string, sinal: AbortSignal): ResultadoPaleta[] | Promise<ResultadoPaleta[]>
}

/** Escopos ativos: 'global' sempre; os outros enquanto a tela que os usa chama useEscopoAtalho(escopo) (PLANO §2.2). */
export type EscopoAtalho = 'global' | 'quadro' | 'card' | 'modal' | 'agenda'

export interface ContextoAtalho extends ContextoAcao {
  escopo: EscopoAtalho
}

/**
 * `teclas`: 'shift+n', 'mod+k' (Ctrl ou Cmd), ',', 'g a' (acorde de 1,5 s), 'space'.
 * O despachante ignora teclas de uma letra dentro de campos de texto e quando prefs.atalhos = false.
 */
export interface Atalho {
  id: string
  teclas: string
  descricao: string
  escopo: EscopoAtalho
  /** Agrupamento na lista do "?". */
  grupo: 'navegacao' | 'quadro' | 'demanda' | 'geral'
  quando?(ctx: ContextoAtalho): boolean
  executar(ctx: ContextoAtalho, evento: KeyboardEvent): void
}

// ─────────────────────────────── tempo real ───────────────────────────────

/**
 * Recebe só eventos das entidades listadas, já sem o próprio eco (trace). Deve ser idempotente.
 * Vários tratadores podem assinar a mesma entidade: todos são chamados, em ordem de `id`.
 * Patch parcial (`c` não nulo) de uma demanda que não está no cache é ignorado (o objeto inteiro chega quando ela
 * entra no conjunto do bootstrap: criação, restaurar, mudar para um quadro ativo).
 */
export interface TratadorEventos {
  id: string
  entidades: Entidade[]
  tratar(evento: EventoTempoReal, qc: QueryClient): void
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
  global: { global: ExtensaoGlobal }
  menu: { menu: ExtensaoMenu }
  topo: { topo: ExtensaoTopo }
  avatar: { avatar: ExtensaoAvatar }
  celular: { aba: ExtensaoAbaCelular }
  quadroCabecalho: { item: ExtensaoCabecalhoQuadro }
  quadroMenu: { itens: ExtensaoMenuQuadro[] }
  layouts: { layout: ExtensaoLayout }
  colunaMenu: { itens: ExtensaoMenuColuna[] }
  colunaEntrada: { entrada: ExtensaoEntradaColuna }
  card: { selo: ExtensaoSeloCard }
  soltar: { interceptador: InterceptadorSoltar }
  demanda: { secao: ExtensaoSecaoDemanda }
  demandaAcoes: { acoes: ExtensaoAcaoDemanda[] }
  demandaMenu: { itens: ExtensaoMenuDemanda[] }
  dialogos: { dialogo: QualquerExtensaoDialogo }
  comandos: { comandos: Comando[] }
  busca: { fonte: FontePaleta }
  atalhos: { atalhos: Atalho[] }
  eventos: { tratador: TratadorEventos }
  inicio: { secao: ExtensaoSecaoInicio }
  config: { secao: ExtensaoSecaoConfig }
}
