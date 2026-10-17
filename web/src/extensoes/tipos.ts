/**
 * Contrato dos pontos de extensão do front (docs/PLANO.md §3 e §4), para o modelo de QUADROS SEPARADOS POR EQUIPE.
 *
 * Cada funcionalidade cria ARQUIVOS NOVOS nas pastas abaixo; o DESIGN-SYSTEM-WEB os descobre com
 * import.meta.glob('./<pasta>/*.{ts,tsx}', { eager: true }) (TODAS as pastas aceitam .ts e .tsx) e ordena por `ordem`
 * (números combinados no PLANO §4). Ninguém edita arquivo central para "registrar" algo.
 *
 * Peso do registro (a página pública e o chunk inicial não levam o app inteiro):
 * - web/src/extensoes/registro-rotas.ts só descobre telas/**\/rota.tsx (metadados + `carregar`); é o único que o
 *   App.tsx importa direto. web/src/extensoes/registro.ts (todos os outros pontos) é importado com import() pela casca
 *   autenticada; /a/:token, /convite e /redefinir nunca o baixam.
 * - Os módulos de extensão são leves: o que é grande (seções do modal, diálogos, layouts, seções do Início e de
 *   Configurações, componentes globais) entra por `carregar: () => import('...')`, e o host usa React.lazy + Suspense.
 *   Selos do card, itens de menu, topo, avatar e abas do celular são pequenos e usam `Componente` direto.
 * - Contribuições `extensoes/*\/nucleo-exemplo*.{ts,tsx}` (NÚCLEO-WEB) existem só para a tela /dev/extensoes: o
 *   registro as tira do build de produção (padrão negativo no glob) e, em DEV, só as mostra com a tela de exemplos ligada.
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
 * Componentes de extensão (código React) usam os hooks do núcleo-web (useContextoAcao, useAbrirDialogo, useMover...;
 * assinaturas no PLANO §2.2). Funções que rodam FORA do render (executar de menus, ações, comandos, atalhos,
 * interceptadores) recebem ContextoAcao/UtilModal, que já trazem `qc` e `acoes` (as mesmas mutações dos hooks).
 *
 * MapaDialogos pode ser aumentado com `declare module` por uma funcionalidade SÓ para diálogos que ela mesma abre;
 * diálogo usado por outra funcionalidade fica aqui no contrato (a outra worktree não teria o tipo).
 */
import type { ComponentType } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import type {
  ClienteResumo, Coluna, ConcluirSaida, DataLocal, Demanda, DemandaDetalhe, EditarDemandaEntrada, EditarDemandaSaida,
  Entidade, Etiqueta, Eu, EventoTempoReal, FiltrosQuadro, Id, ModeloWhatsapp, MoverEntrada, MoverSaida, Papel,
  PosicaoRelativa, Quadro, VisaoQuadro,
} from '@shared/tipos/index.ts'

export type Icone = LucideIcon

/** Componente carregado sob demanda (o host usa React.lazy + Suspense com esqueleto). */
export type Carregar<P = object> = () => Promise<{ default: ComponentType<P> }>

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

/**
 * As mutações otimistas do núcleo-web (PLANO §2.2), para quem roda fora do render. São as MESMAS funções que os hooks
 * devolvem (o NÚCLEO-WEB monta uma vez nos hosts e injeta): aplicam no cache na hora, revertem com aviso no erro e
 * devolvem null quando o usuário cancela. Como o tempo real ignora o próprio eco, uma chamada direta a api() não chega
 * ao cache de quem clicou: quem chama rota própria atualiza o cache com `qc` (aplicarPatchDemanda etc.).
 */
export interface AcoesNucleo {
  /**
   * Passa pelos interceptadores (extensoes/soltar), exceto quando chamada de dentro de um interceptador. Resultado
   * 'feito' de um interceptador: não chama /mover e devolve { demanda, etiquetasDeixadas: [], etiquetasCriadas: [],
   * proxima: null, avisos: [] }.
   */
  mover(d: Demanda, entrada: MoverEntrada, origem: PedidoSoltar['origem']): Promise<MoverSaida | null>
  editar(d: Demanda, mudancas: EditarDemandaEntrada): Promise<EditarDemandaSaida | null>
  /** Arrastar no calendário (Agenda e Calendário do quadro): muda o prazo mantendo a hora, com "Prazo: sex, 24/10 · Desfazer". */
  mudarPrazo(d: Demanda, prazo: DataLocal): Promise<Demanda | null>
  concluir(d: Demanda, concluida: boolean): Promise<ConcluirSaida | null>
  membros: { entrar(d: Demanda, usuarioId: Id): Promise<Demanda | null>; sair(d: Demanda, usuarioId: Id): Promise<Demanda | null> }
  etiquetas: { por(d: Demanda, etiquetaId: Id): Promise<Demanda | null>; tirar(d: Demanda, etiquetaId: Id): Promise<Demanda | null> }
  arquivar(d: Demanda): Promise<Demanda | null>
  restaurar(d: Demanda, colunaId?: Id): Promise<Demanda | null>
}

/** O que comandos, atalhos, itens de menu, interceptadores e abas do celular recebem. */
export interface ContextoAcao {
  eu: Eu
  navegar(caminho: string, opcoes?: { novaAba?: boolean }): void
  abrirDialogo: AbrirDialogo
  /** Card com foco (quadro, Lista, Início, Agenda: quem desenha o card chama useFocoDemanda), ou a demanda do modal. */
  demandaEmFoco: Demanda | null
  /** Quadro aberto em /q/:slug (ou o da demanda no modal); nulo nas outras telas. */
  quadroAtual: Quadro | null
  /** Para atualizar o cache depois de uma rota própria (utilitários de web/src/api/cache.ts, PLANO §2.2). */
  qc: QueryClient
  acoes: AcoesNucleo
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
  /**
   * Só sobrepostas: a tela de baixo quando a rota abre direto pela URL (link copiado, outra aba, notificação), que é
   * também para onde "fechar" leva. Lê o cache (o bootstrap já está carregado quando a sobreposta desenha); null ou
   * ausente = a rota inicial. Ex.: /d/:numero → o quadro da demanda; /quadros/novo → /config/quadros.
   */
  fundo?(params: Readonly<Record<string, string | undefined>>, qc: QueryClient): string | null
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
  /** Montado em Suspense com fallback null (ex.: a paleta não põe o cmdk no chunk inicial). */
  carregar: Carregar
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

/**
 * Barra de abas do celular (Início · Agenda · + · Busca · Sino). `destaque` = o "+" central. Sem `caminho`, a aba
 * chama `executar` (ex.: o Sino abre o diálogo 'notificacoes' como folha).
 */
export interface ExtensaoAbaCelular {
  id: string
  ordem: number
  rotulo: string
  icone: Icone
  caminho?: string
  executar?(ctx: ContextoAcao): void
  destaque?: boolean
  /** Hook (pode ler o cache): número no canto da aba ("3" no Sino). Zero não aparece. */
  useContador?(): number
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
  carregar: Carregar<PropsLayout>
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
 * cliente há 3d" e "R3/2" (F2). `coluna` e `quadro` são nulos quando o card está fora do bootstrap (Arquivo, extras do
 * Início e da Agenda, demanda de quadro arquivado).
 */
export interface ExtensaoSeloCard {
  id: string
  ordem: number
  lugar: 'topo' | 'rodape'
  Componente: ComponentType<{ demanda: Demanda; coluna: Coluna | null; quadro: Quadro | null }>
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
  /** O que o pedido já trazia (ex.: "Mover para…" com etiquetasSemPar e membros escolhidos). */
  entrada: MoverEntrada
}

export type ResultadoSoltar =
  /** O núcleo chama POST /mover com estes extras (somados à entrada do pedido). */
  | { tipo: 'seguir'; extras?: Pick<MoverEntrada, 'etiquetasSemPar' | 'membros'> }
  /**
   * O interceptador já fez a mutação e atualizou o cache com ctx.qc (ex.: enviou ao cliente e a automação moveu).
   * O núcleo não chama /mover e o card fica onde `demanda` diz.
   */
  | { tipo: 'feito'; demanda: Demanda }
  /** O card volta em 200 ms. */
  | { tipo: 'cancelado' }

export interface InterceptadorSoltar {
  id: string
  ordem: number
  quando(pedido: PedidoSoltar, eu: Eu): boolean
  /** Pode abrir diálogos (ctx.abrirDialogo, inclusive de dentro do diálogo do "Mover para…") e chamar ctx.acoes. */
  executar(pedido: PedidoSoltar, ctx: ContextoAcao): Promise<ResultadoSoltar>
}

// ─────────────────────────────── modal da demanda (/d/:numero) ───────────────────────────────

export interface ContextoDemanda {
  demanda: Demanda
  /** Chega depois: o modal abre do cache. */
  detalhe: DemandaDetalhe | undefined
  eu: Eu
  /**
   * Do cache; para demanda fora do bootstrap (arquivada, de quadro arquivado, concluída antiga), o NÚCLEO-WEB espera o
   * detalhe e usa detalhe.quadro e detalhe.coluna (o modal mostra esqueleto até lá).
   */
  quadro: Quadro
  coluna: Coluna
  /** Demanda arquivada ou de quadro arquivado: as seções mostram e não editam ("Restaure para editar"). */
  somenteLeitura: boolean
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
  qc: QueryClient
  acoes: AcoesNucleo
}

export interface ExtensaoSecaoDemanda {
  id: string
  ordem: number
  /** principal: descrição, checklists, versões, anexos, comentários; lateral: membros, etiquetas, datas, cliente... */
  coluna: 'principal' | 'lateral'
  visivel?(ctx: ContextoDemanda): boolean
  carregar: Carregar<{ ctx: ContextoDemanda }>
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
  /** F2. As 4 automações do quadro (destino e "membros: manter | responsável do cliente no destino"). */
  'automacoes-quadro': { quadroId: Id }
  /**
   * F2. Soltar numa coluna aguardando_cliente com versão não enviada (atendimento): "[Enviar | Só mover | Cancelar]".
   * Resultado: enviado (o diálogo já chamou POST /enviar e atualizou o cache) ou só mover; null = cancelar.
   */
  'enviar-ao-soltar': { demandaId: Id; colunaId: Id }
  /** F3. Lista do sino: popover no desktop, folha no celular (aba Sino). */
  'notificacoes': Record<string, never>
  /** F5. "Criar cliente XYZ" (sigla + nome; o resto do cadastro depois). Usado por F1 (modal), F4 (Nova demanda, rápida). */
  'criar-cliente': { sigla?: string; nome?: string }
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
  'enviar-ao-soltar': { escolha: 'enviado'; demanda: Demanda; automacao: boolean } | { escolha: 'so_mover' }
  'notificacoes': { fechado: true }
  'criar-cliente': { cliente: ClienteResumo }
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
  /** Um diálogo pode abrir outro (empilha e devolve o foco ao fechar). */
  carregar: Carregar<PropsDialogo<K>>
}

/** Qualquer diálogo registrado (união distribuída, para o registro). */
export type QualquerExtensaoDialogo = { [K in keyof MapaDialogos]: ExtensaoDialogo<K> }[keyof MapaDialogos]

// ─────────────────────────────── paleta, busca e atalhos ───────────────────────────────

export interface Comando {
  id: string
  rotulo: string
  secao: 'acoes' | 'ir_para'
  /**
   * Ordem dentro da seção (menor primeiro; PLANO §4): Nova demanda 10, Colar do WhatsApp 20, ações do quadro 30–90,
   * cadastros 500+, tema 800+, Atalhos 900. Sem ordem = 1000 (depois dos combinados).
   */
  ordem?: number
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
  carregar: Carregar
}

/** Seção da tela /config (host do NÚCLEO-WEB: lista as seções e roteia /config/:caminho). */
export interface ExtensaoSecaoConfig {
  id: string
  rotulo: string
  ordem: number
  /** Relativo a /config: 'pessoas' → /config/pessoas. */
  caminho: string
  acesso: Papel[]
  icone?: Icone
  carregar: Carregar
}

/** Formato de cada módulo descoberto (para tipar o import.meta.glob em registro-rotas.ts e registro.ts). */
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
