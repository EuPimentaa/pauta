/**
 * Registro dos pontos de extensão (contrato em extensoes/tipos.ts; ordens combinadas no PLANO §4).
 * Carregado com import() pela área autenticada (sessao/registro.ts): a página pública nunca baixa este arquivo.
 *
 * - Um import.meta.glob por pasta, sempre sem os `nucleo-exemplo*` (contribuições de teste da tela /dev/extensoes);
 *   em DEV eles vêm à parte e só entram nas listas com ligarExemplos(true).
 * - Listas ordenadas por `ordem` (depois por id); tratadores por id. Ids repetidos: erro no console em DEV.
 * - Pontos com `carregar` viram React.lazy UMA vez por id: use componenteDe(ponto, id, carregar) no host.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type {
  Atalho, Carregar, Comando, ExtensaoAbaCelular, ExtensaoAcaoDemanda, ExtensaoAvatar, ExtensaoCabecalhoQuadro,
  ExtensaoEntradaColuna, ExtensaoGlobal, ExtensaoLayout, ExtensaoMenu, ExtensaoMenuColuna, ExtensaoMenuDemanda,
  ExtensaoMenuQuadro, ExtensaoSecaoConfig, ExtensaoSecaoDemanda, ExtensaoSecaoInicio, ExtensaoSeloCard, ExtensaoTopo,
  FontePaleta, InterceptadorSoltar, ModulosExtensao, QualquerExtensaoDialogo, TratadorEventos,
} from './tipos.ts'

type M = ModulosExtensao

const G = {
  global: import.meta.glob<M['global']>(['./global/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  menu: import.meta.glob<M['menu']>(['./menu/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  topo: import.meta.glob<M['topo']>(['./topo/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  avatar: import.meta.glob<M['avatar']>(['./avatar/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  celular: import.meta.glob<M['celular']>(['./celular/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  'quadro-cabecalho': import.meta.glob<M['quadroCabecalho']>(['./quadro-cabecalho/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  'quadro-menu': import.meta.glob<M['quadroMenu']>(['./quadro-menu/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  layouts: import.meta.glob<M['layouts']>(['./layouts/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  'coluna-menu': import.meta.glob<M['colunaMenu']>(['./coluna-menu/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  'coluna-entrada': import.meta.glob<M['colunaEntrada']>(['./coluna-entrada/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  card: import.meta.glob<M['card']>(['./card/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  soltar: import.meta.glob<M['soltar']>(['./soltar/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  demanda: import.meta.glob<M['demanda']>(['./demanda/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  'demanda-acoes': import.meta.glob<M['demandaAcoes']>(['./demanda-acoes/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  'demanda-menu': import.meta.glob<M['demandaMenu']>(['./demanda-menu/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  dialogos: import.meta.glob<M['dialogos']>(['./dialogos/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  comandos: import.meta.glob<M['comandos']>(['./comandos/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  busca: import.meta.glob<M['busca']>(['./busca/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  atalhos: import.meta.glob<M['atalhos']>(['./atalhos/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  eventos: import.meta.glob<M['eventos']>(['./eventos/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  inicio: import.meta.glob<M['inicio']>(['./inicio/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
  config: import.meta.glob<M['config']>(['./config/*.{ts,tsx}', '!**/nucleo-exemplo*'], { eager: true }),
}

type Pasta = keyof typeof G

/** Contribuições de exemplo (só DEV; o build de produção não as inclui). */
const EXEMPLOS: Record<string, unknown> = import.meta.env.DEV
  ? import.meta.glob('./*/nucleo-exemplo*.{ts,tsx}', { eager: true })
  : {}

/** O que cada pasta exporta (nome do export, e se é lista). */
const EXPORT: Record<Pasta, { nome: string; lista: boolean }> = {
  global: { nome: 'global', lista: false }, menu: { nome: 'menu', lista: false }, topo: { nome: 'topo', lista: false },
  avatar: { nome: 'avatar', lista: false }, celular: { nome: 'aba', lista: false },
  'quadro-cabecalho': { nome: 'item', lista: false }, 'quadro-menu': { nome: 'itens', lista: true },
  layouts: { nome: 'layout', lista: false }, 'coluna-menu': { nome: 'itens', lista: true },
  'coluna-entrada': { nome: 'entrada', lista: false }, card: { nome: 'selo', lista: false },
  soltar: { nome: 'interceptador', lista: false }, demanda: { nome: 'secao', lista: false },
  'demanda-acoes': { nome: 'acoes', lista: true }, 'demanda-menu': { nome: 'itens', lista: true },
  dialogos: { nome: 'dialogo', lista: false }, comandos: { nome: 'comandos', lista: true }, busca: { nome: 'fonte', lista: false },
  atalhos: { nome: 'atalhos', lista: true }, eventos: { nome: 'tratador', lista: false }, inicio: { nome: 'secao', lista: false },
  config: { nome: 'secao', lista: false },
}

interface ComId { id: string; ordem?: number }

function extrair(pasta: Pasta, modulos: Record<string, unknown>): ComId[] {
  const { nome, lista } = EXPORT[pasta]
  const saida: ComId[] = []
  for (const [arquivo, m] of Object.entries(modulos).sort(([a], [b]) => a.localeCompare(b))) {
    const valor = (m as Record<string, unknown>)[nome]
    if (valor === undefined) {
      if (import.meta.env.DEV) console.error(`[extensões] ${arquivo} não exporta \`${nome}\` (pasta ${pasta}).`)
      continue
    }
    if (lista) {
      if (!Array.isArray(valor)) { if (import.meta.env.DEV) console.error(`[extensões] ${arquivo}: \`${nome}\` deve ser uma lista.`); continue }
      saida.push(...(valor as ComId[]))
    } else saida.push(valor as ComId)
  }
  return saida
}

function ordenar<T extends ComId>(itens: T[], pasta: Pasta, porId = false): T[] {
  if (import.meta.env.DEV) {
    const vistos = new Set<string>()
    for (const i of itens) {
      if (vistos.has(i.id)) console.error(`[extensões] id repetido em ${pasta}: ${i.id}`)
      vistos.add(i.id)
    }
  }
  return [...itens].sort((a, b) => (porId ? 0 : (a.ordem ?? 0) - (b.ordem ?? 0)) || a.id.localeCompare(b.id))
}

function exemplosDa(pasta: Pasta): Record<string, unknown> {
  const prefixo = `./${pasta}/`
  return Object.fromEntries(Object.entries(EXEMPLOS).filter(([k]) => k.startsWith(prefixo)))
}

export interface Registro {
  globais: ExtensaoGlobal[]
  menus: ExtensaoMenu[]
  topo: ExtensaoTopo[]
  avatar: ExtensaoAvatar[]
  abasCelular: ExtensaoAbaCelular[]
  cabecalhoQuadro: ExtensaoCabecalhoQuadro[]
  menuQuadro: ExtensaoMenuQuadro[]
  layouts: ExtensaoLayout[]
  menuColuna: ExtensaoMenuColuna[]
  entradaColuna: ExtensaoEntradaColuna[]
  selosCard: ExtensaoSeloCard[]
  interceptadoresSoltar: InterceptadorSoltar[]
  secoesDemanda: ExtensaoSecaoDemanda[]
  acoesDemanda: ExtensaoAcaoDemanda[]
  menuDemanda: ExtensaoMenuDemanda[]
  dialogos: QualquerExtensaoDialogo[]
  comandos: Comando[]
  fontesBusca: FontePaleta[]
  atalhos: Atalho[]
  tratadores: TratadorEventos[]
  secoesInicio: ExtensaoSecaoInicio[]
  secoesConfig: ExtensaoSecaoConfig[]
}

function montar(fonte: (p: Pasta) => Record<string, unknown>): Registro {
  const de = <T extends ComId>(p: Pasta, porId = false) => ordenar(extrair(p, fonte(p)) as T[], p, porId)
  return {
    globais: de('global'), menus: de('menu'), topo: de('topo'), avatar: de('avatar'), abasCelular: de('celular'),
    cabecalhoQuadro: de('quadro-cabecalho'), menuQuadro: de('quadro-menu'), layouts: de<ExtensaoLayout & ComId>('layouts'),
    menuColuna: de('coluna-menu'), entradaColuna: de('coluna-entrada'), selosCard: de('card'), interceptadoresSoltar: de('soltar'),
    secoesDemanda: de('demanda'), acoesDemanda: de('demanda-acoes'), menuDemanda: de('demanda-menu'),
    dialogos: de<QualquerExtensaoDialogo & ComId>('dialogos', true), comandos: de<Comando & ComId>('comandos', true),
    fontesBusca: de('busca'), atalhos: de<Atalho & ComId>('atalhos', true), tratadores: de<TratadorEventos & ComId>('eventos', true),
    secoesInicio: de('inicio'), secoesConfig: de('config'),
  }
}

const base = montar((p) => G[p] as Record<string, unknown>)
const soExemplos = import.meta.env.DEV ? montar(exemplosDa) : null
const comExemplos = import.meta.env.DEV ? montar((p) => ({ ...(G[p] as Record<string, unknown>), ...exemplosDa(p) })) : null
let exemplosLigados = false

/**
 * Só DEV: põe as contribuições `nucleo-exemplo*` nas listas (a tela /dev/extensoes liga antes de desenhar os hosts e
 * desliga ao sair). Em produção não faz nada.
 */
export function ligarExemplos(ligado: boolean): void {
  if (import.meta.env.DEV) exemplosLigados = ligado
}

const atual = (): Registro => (exemplosLigados && comExemplos ? comExemplos : base)

export const globais = () => atual().globais
export const menus = () => atual().menus
export const topo = () => atual().topo
export const avatar = () => atual().avatar
export const abasCelular = () => atual().abasCelular
export const cabecalhoQuadro = () => atual().cabecalhoQuadro
export const menuQuadro = () => atual().menuQuadro
export const layouts = () => atual().layouts
export const menuColuna = () => atual().menuColuna
export const entradaColuna = () => atual().entradaColuna
export const selosCard = () => atual().selosCard
export const interceptadoresSoltar = () => atual().interceptadoresSoltar
export const secoesDemanda = () => atual().secoesDemanda
export const acoesDemanda = () => atual().acoesDemanda
export const menuDemanda = () => atual().menuDemanda
export const dialogos = () => atual().dialogos
export const comandos = () => atual().comandos
export const fontesBusca = () => atual().fontesBusca
export const atalhos = () => atual().atalhos
/** Todos os tratadores (vários por entidade, em ordem de id). */
export const tratadores = () => atual().tratadores
export const secoesInicio = () => atual().secoesInicio
export const secoesConfig = () => atual().secoesConfig

/** Só DEV: as contribuições de exemplo, por ponto (vazio em produção). */
export function exemplos(): Registro | null {
  return soExemplos
}

// o cache guarda componentes de props diferentes (cada ponto sabe as suas)
const preguicosos = new Map<string, LazyExoticComponent<ComponentType<any>>>()

/**
 * O React.lazy de um ponto com `carregar`, criado uma vez por ponto+id (nunca a cada render):
 *   const Secao = componenteDe('demanda', s.id, s.carregar); <Suspense fallback={…}><Secao ctx={ctx} /></Suspense>
 */
export function componenteDe<P>(ponto: string, id: string, carregar: Carregar<P>): LazyExoticComponent<ComponentType<P>> {
  const chave = `${ponto}:${id}`
  let c = preguicosos.get(chave)
  if (!c) {
    c = lazy(carregar)
    preguicosos.set(chave, c)
  }
  return c as LazyExoticComponent<ComponentType<P>>
}
