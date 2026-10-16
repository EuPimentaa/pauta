/**
 * Dados do F5 (cadastros): consultas nas chaves da PLANO §2.1 e mutações que atualizam o cache pela resposta (o eco do
 * tempo real é ignorado; as outras janelas recebem pelos tratadores do núcleo e por extensoes/eventos/cadastros.ts).
 *
 * As mutações aqui LANÇAM o ErroDaApi (os formulários mostram o erro no campo); quem chama decide o aviso.
 *   const qc = useQueryClient(); const saida = await convidarPessoa(qc, { nome, email, papel })
 */
import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query'
import type {
  Bootstrap, Cliente, ClienteContato, ClienteLink, ClienteNaLista, ClienteResumo, ConfigAppSaida, CopiarQuadroEntrada,
  CriarClienteEntrada, CriarContatoEntrada, CriarEquipeEntrada, CriarFeriadoEntrada, CriarLinkClienteEntrada,
  CriarPessoaEntrada, CriarPessoaSaida, CriarQuadroEntrada, Demanda, EditarClienteEntrada, EditarConfigAppEntrada,
  EditarContatoEntrada, EditarEquipeEntrada, EditarLinkClienteEntrada, EditarPessoaEntrada, Equipe, EquipeMembro, Feriado, Id,
  ItemTrilhaCliente, LinkAcesso, ListarArquivoConsulta, Pagina, Quadro, QuadroCompleto, ResponsavelCliente, Usuario,
  UsuarioResumo,
} from '@shared/tipos/index.ts'
import { recarregarBootstrap } from '../../api/bootstrap.ts'
import { comItem, inserirOuAtualizar, mudarBootstrap, semQuadro } from '../../api/cache.ts'
import { chaves } from '../../api/chaves.ts'
import { api, comConsulta, type ErroDaApi } from '../../api/cliente.ts'
import { hojeLocal } from '../../lib/datas.ts'

// ─────────────────────────────── consultas ───────────────────────────────

/** GET /api/clientes: a lista com os contadores (abertas, com o cliente, atrasadas). */
export function useListaClientes() {
  return useQuery<ClienteNaLista[], ErroDaApi>({
    queryKey: chaves.clientes,
    queryFn: ({ signal }) => api<ClienteNaLista[]>('GET', '/api/clientes', { sinal: signal }),
    staleTime: 30_000,
  })
}

/** GET /api/pessoas (só admin: com e-mail e convite pendente). */
export function usePessoas(habilitado = true) {
  return useQuery<Usuario[], ErroDaApi>({
    queryKey: chaves.pessoas,
    queryFn: ({ signal }) => api<Usuario[]>('GET', '/api/pessoas', { sinal: signal }),
    enabled: habilitado,
    staleTime: 30_000,
  })
}

export function useFeriadosDoAno(ano: number) {
  return useQuery<Feriado[], ErroDaApi>({
    queryKey: chaves.feriados(ano),
    queryFn: ({ signal }) => api<Feriado[]>('GET', comConsulta('/api/config/feriados', { ano }), { sinal: signal }),
    staleTime: 5 * 60_000,
  })
}

export function useConfigApp() {
  return useQuery<ConfigAppSaida, ErroDaApi>({
    queryKey: chaves.configApp,
    queryFn: ({ signal }) => api<ConfigAppSaida>('GET', '/api/config/app', { sinal: signal }),
    staleTime: 60_000,
  })
}

/** GET /api/clientes/:id/aprovacoes: a trilha (mais novas primeiro, com as anuladas). */
export function useTrilha(clienteId: Id | null) {
  return useQuery<ItemTrilhaCliente[], ErroDaApi>({
    queryKey: chaves.aprovacoesCliente(clienteId ?? ''),
    queryFn: ({ signal }) => api<ItemTrilhaCliente[]>('GET', `/api/clientes/${encodeURIComponent(clienteId!)}/aprovacoes`, { sinal: signal }),
    enabled: !!clienteId,
    staleTime: 30_000,
  })
}

/** GET /api/quadros?arquivados=1 (Configurações › Quadros arquivados). */
export function useQuadrosArquivados() {
  return useQuery<Quadro[], ErroDaApi>({
    queryKey: chaves.quadrosArquivados,
    queryFn: ({ signal }) => api<Quadro[]>('GET', '/api/quadros?arquivados=1', { sinal: signal }),
    staleTime: 30_000,
  })
}

/** GET /api/quadros/:id: inclusive de quadro arquivado e com as colunas arquivadas. */
export function useQuadroCompleto(id: Id | null) {
  return useQuery<QuadroCompleto, ErroDaApi>({
    queryKey: chaves.quadro(id ?? ''),
    queryFn: ({ signal }) => api<QuadroCompleto>('GET', `/api/quadros/${encodeURIComponent(id!)}`, { sinal: signal }),
    enabled: !!id,
    staleTime: 15_000,
  })
}

/** GET /api/arquivo com "Carregar mais" (cursor). */
export function useArquivo(c: ListarArquivoConsulta) {
  return useInfiniteQuery({
    queryKey: chaves.arquivo(c),
    queryFn: ({ signal, pageParam }) => api<Pagina<Demanda>>('GET', comConsulta('/api/arquivo', { ...c, cursor: pageParam ?? undefined, limite: 50 }), { sinal: signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximo,
    staleTime: 15_000,
  })
}

// ─────────────────────────────── cache ───────────────────────────────

function resumoUsuario(u: Usuario | UsuarioResumo): UsuarioResumo {
  return { id: u.id, nome: u.nome, apelido: u.apelido, papel: u.papel, cor: u.cor, ativo: u.ativo, equipeIds: u.equipeIds }
}

export function resumoCliente(c: ClienteResumo): ClienteResumo {
  return {
    id: c.id, nome: c.nome, sigla: c.sigla, paiId: c.paiId, status: c.status, nivel: c.nivel, cor: c.cor, logoUrl: c.logoUrl,
    atendimentoId: c.atendimentoId, rodadasInclusas: c.rodadasInclusas, pastaSaida: c.pastaSaida, apelidos: c.apelidos,
    responsaveis: c.responsaveis, pendencias: c.pendencias,
  }
}

/** Pessoa nova ou mudada: ['pessoas'] e o bootstrap (o `eu` também, se for eu). */
function aplicarPessoa(qc: QueryClient, u: Usuario): void {
  qc.setQueryData<Usuario[]>(chaves.pessoas, (lista) => (lista ? inserirOuAtualizar(lista, u) : lista))
  mudarBootstrap(qc, (b) => ({
    ...b,
    usuarios: inserirOuAtualizar(b.usuarios, resumoUsuario(u)),
    eu: b.eu.usuario.id === u.id ? { ...b.eu, usuario: { ...b.eu.usuario, ...u } } : b.eu,
  }))
}

/**
 * Entrar numa equipe mexe em equipes, seguidores e colunas de pessoa (API §4.3); os eventos dessas mudanças são o
 * nosso eco (ignorado): o bootstrap novo traz tudo de uma vez.
 */
function recarregarDepoisDeEquipes(qc: QueryClient): void {
  void recarregarBootstrap(qc)
  void qc.invalidateQueries({ queryKey: chaves.pessoas })
}

/** Cliente completo da resposta: ['cliente', sigla], o resumo no bootstrap e a lista. */
export function aplicarCliente(qc: QueryClient, c: Cliente, siglaAntes?: string): void {
  if (siglaAntes && siglaAntes !== c.sigla) qc.removeQueries({ queryKey: chaves.cliente(siglaAntes), exact: true })
  qc.setQueryData<Cliente>(chaves.cliente(c.sigla), c)
  mudarBootstrap(qc, (b) => ({ ...b, clientes: inserirOuAtualizar(b.clientes, resumoCliente(c)).sort((x, y) => x.sigla.localeCompare(y.sigla)) }))
  qc.setQueryData<ClienteNaLista[]>(chaves.clientes, (lista) => {
    if (!lista) return lista
    const atual = lista.find((x) => x.id === c.id)
    return inserirOuAtualizar(lista, { ...resumoCliente(c), contadores: atual?.contadores ?? c.contadores }).sort((x, y) => x.sigla.localeCompare(y.sigla))
  })
}

/** Depois de mudar contato ou link (a resposta é só o item): relê o cliente inteiro (pendências, ordem). */
async function recarregarCliente(qc: QueryClient, sigla: string): Promise<Cliente> {
  const c = await api<Cliente>('GET', `/api/clientes/${encodeURIComponent(sigla)}`)
  aplicarCliente(qc, c)
  return c
}

function aplicarQuadroCompleto(qc: QueryClient, q: QuadroCompleto): void {
  qc.setQueryData(chaves.quadro(q.quadro.id), q)
  if (q.quadro.arquivadoEm !== null) return
  mudarBootstrap(qc, (b) => {
    let x = comItem(b, 'quadros', 'upsert', q.quadro)
    for (const c of q.colunas.filter((c) => c.arquivadaEm === null)) x = comItem(x, 'colunas', 'upsert', c)
    for (const et of q.etiquetas) x = comItem(x, 'etiquetas', 'upsert', et)
    for (const a of q.automacoes) x = comItem(x, 'automacoes', 'upsert', a)
    return x
  })
}

/** O quadro novo também é seguido pelos membros da equipe (eu inclusive): `eu.seguindo` vem do servidor. */
async function recarregarEu(qc: QueryClient): Promise<void> {
  try {
    const eu = await api<Bootstrap['eu']>('GET', '/api/auth/eu')
    mudarBootstrap(qc, (b) => ({ ...b, eu: { ...b.eu, seguindo: eu.seguindo, favoritos: eu.favoritos } }))
  } catch { /* o próximo bootstrap corrige */ }
}

// ─────────────────────────────── pessoas e equipes ───────────────────────────────

export async function convidarPessoa(qc: QueryClient, e: CriarPessoaEntrada): Promise<CriarPessoaSaida> {
  const saida = await api<CriarPessoaSaida>('POST', '/api/pessoas', { corpo: e })
  aplicarPessoa(qc, saida.usuario)
  if (e.equipes?.length) recarregarDepoisDeEquipes(qc)
  return saida
}

export async function editarPessoa(qc: QueryClient, u: Usuario, e: EditarPessoaEntrada): Promise<Usuario> {
  const novo = await api<Usuario>('PATCH', `/api/pessoas/${encodeURIComponent(u.id)}`, { corpo: e })
  aplicarPessoa(qc, novo)
  if (e.equipes !== undefined || e.ativo !== undefined) recarregarDepoisDeEquipes(qc)
  return novo
}

export async function gerarLink(qc: QueryClient, u: Usuario, finalidade: 'convite' | 'redefinicao'): Promise<LinkAcesso> {
  const link = await api<LinkAcesso>('POST', `/api/pessoas/${encodeURIComponent(u.id)}/${finalidade}`)
  if (finalidade === 'convite') {
    qc.setQueryData<Usuario[]>(chaves.pessoas, (lista) => lista?.map((x) => (x.id === u.id ? { ...x, conviteExpiraEm: link.expiraEm } : x)))
  }
  return link
}

function aplicarEquipe(qc: QueryClient, e: Equipe): void {
  mudarBootstrap(qc, (b) => ({ ...b, equipes: inserirOuAtualizar(b.equipes, e).sort((x, y) => x.pos - y.pos) }))
}

export async function criarEquipe(qc: QueryClient, e: CriarEquipeEntrada): Promise<Equipe> {
  const nova = await api<Equipe>('POST', '/api/equipes', { corpo: e })
  aplicarEquipe(qc, nova)
  return nova
}

export async function editarEquipe(qc: QueryClient, eq: Equipe, e: EditarEquipeEntrada): Promise<Equipe> {
  const nova = await api<Equipe>('PATCH', `/api/equipes/${encodeURIComponent(eq.id)}`, { corpo: e })
  aplicarEquipe(qc, nova)
  return nova
}

export async function definirMembros(qc: QueryClient, eq: Equipe, membros: EquipeMembro[]): Promise<Equipe> {
  const nova = await api<Equipe>('PUT', `/api/equipes/${encodeURIComponent(eq.id)}/membros`, { corpo: { membros } })
  aplicarEquipe(qc, nova)
  recarregarDepoisDeEquipes(qc)
  return nova
}

// ─────────────────────────────── clientes ───────────────────────────────

export async function criarCliente(qc: QueryClient, e: CriarClienteEntrada): Promise<Cliente> {
  const c = await api<Cliente>('POST', '/api/clientes', { corpo: e })
  aplicarCliente(qc, c)
  return c
}

export async function editarCliente(qc: QueryClient, c: ClienteResumo, e: EditarClienteEntrada): Promise<Cliente> {
  const novo = await api<Cliente>('PATCH', `/api/clientes/${encodeURIComponent(c.id)}`, { corpo: e })
  aplicarCliente(qc, novo, c.sigla)
  return novo
}

export async function definirApelidos(qc: QueryClient, c: ClienteResumo, apelidos: string[]): Promise<Cliente> {
  const novo = await api<Cliente>('PUT', `/api/clientes/${encodeURIComponent(c.id)}/apelidos`, { corpo: { apelidos } })
  aplicarCliente(qc, novo)
  return novo
}

export async function definirResponsaveis(qc: QueryClient, c: ClienteResumo, responsaveis: ResponsavelCliente[]): Promise<Cliente> {
  const novo = await api<Cliente>('PUT', `/api/clientes/${encodeURIComponent(c.id)}/responsaveis`, { corpo: { responsaveis } })
  aplicarCliente(qc, novo)
  return novo
}

export async function criarContato(qc: QueryClient, c: ClienteResumo, e: CriarContatoEntrada): Promise<ClienteContato> {
  const ct = await api<ClienteContato>('POST', `/api/clientes/${encodeURIComponent(c.id)}/contatos`, { corpo: e })
  await recarregarCliente(qc, c.sigla)
  return ct
}

export async function editarContato(qc: QueryClient, c: ClienteResumo, contato: ClienteContato, e: EditarContatoEntrada): Promise<ClienteContato> {
  const ct = await api<ClienteContato>('PATCH', `/api/clientes/${encodeURIComponent(c.id)}/contatos/${encodeURIComponent(contato.id)}`, { corpo: e })
  await recarregarCliente(qc, c.sigla)
  return ct
}

export async function criarLink(qc: QueryClient, c: ClienteResumo, e: CriarLinkClienteEntrada): Promise<ClienteLink> {
  const l = await api<ClienteLink>('POST', `/api/clientes/${encodeURIComponent(c.id)}/links`, { corpo: e })
  await recarregarCliente(qc, c.sigla)
  return l
}

export async function editarLink(qc: QueryClient, c: ClienteResumo, link: ClienteLink, e: EditarLinkClienteEntrada): Promise<ClienteLink> {
  const l = await api<ClienteLink>('PATCH', `/api/clientes/${encodeURIComponent(c.id)}/links/${encodeURIComponent(link.id)}`, { corpo: e })
  await recarregarCliente(qc, c.sigla)
  return l
}

export async function excluirLink(qc: QueryClient, c: ClienteResumo, link: ClienteLink): Promise<void> {
  await api<void>('DELETE', `/api/clientes/${encodeURIComponent(c.id)}/links/${encodeURIComponent(link.id)}`)
  await recarregarCliente(qc, c.sigla)
}

// ─────────────────────────────── quadros ───────────────────────────────

export async function criarQuadro(qc: QueryClient, e: CriarQuadroEntrada): Promise<QuadroCompleto> {
  const q = await api<QuadroCompleto>('POST', '/api/quadros', { corpo: e })
  aplicarQuadroCompleto(qc, q)
  if (e.equipeId) void recarregarEu(qc)
  return q
}

/**
 * "Copiar quadro" pelo hook do núcleo (useCopiarQuadro) e, depois, o que ele não traz: os modelos de demanda copiados
 * e os seguidores (o bootstrap novo traz tudo; os eventos são o nosso eco).
 */
export function depoisDeCopiar(qc: QueryClient): void {
  void recarregarBootstrap(qc)
}

export async function arquivarQuadro(qc: QueryClient, q: Quadro): Promise<Quadro> {
  const novo = await api<Quadro>('POST', `/api/quadros/${encodeURIComponent(q.id)}/arquivar`)
  mudarBootstrap(qc, (b) => semQuadro(b, q.id))
  qc.setQueryData<Quadro[]>(chaves.quadrosArquivados, (lista) => (lista ? inserirOuAtualizar(lista, novo) : lista))
  qc.setQueryData<QuadroCompleto>(chaves.quadro(q.id), (c) => (c ? { ...c, quadro: novo } : c))
  // as automações de outros quadros que levavam para ele foram desligadas no servidor (o evento é o nosso eco)
  mudarBootstrap(qc, (b) => ({ ...b, automacoes: b.automacoes.map((a) => (a.destinoQuadroId === q.id ? { ...a, ativa: false } : a)) }))
  return novo
}

export async function restaurarQuadro(qc: QueryClient, q: Quadro): Promise<QuadroCompleto> {
  const completo = await api<QuadroCompleto>('POST', `/api/quadros/${encodeURIComponent(q.id)}/restaurar`)
  qc.setQueryData<Quadro[]>(chaves.quadrosArquivados, (lista) => lista?.filter((x) => x.id !== q.id))
  qc.setQueryData(chaves.quadro(q.id), completo)
  // as demandas do quadro voltam com ele: só o bootstrap novo as traz
  await recarregarBootstrap(qc)
  return completo
}

export async function excluirQuadro(qc: QueryClient, q: Quadro): Promise<void> {
  await api<void>('DELETE', `/api/quadros/${encodeURIComponent(q.id)}`)
  qc.setQueryData<Quadro[]>(chaves.quadrosArquivados, (lista) => lista?.filter((x) => x.id !== q.id))
  qc.removeQueries({ queryKey: chaves.quadro(q.id), exact: true })
  mudarBootstrap(qc, (b) => ({ ...semQuadro(b, q.id), automacoes: b.automacoes.filter((a) => a.quadroId !== q.id && a.destinoQuadroId !== q.id) }))
}

export type { CopiarQuadroEntrada }

// ─────────────────────────────── feriados e parâmetros ───────────────────────────────

/** A lista do ano e, se for o ano corrente ou o próximo, os feriados do bootstrap (dias úteis da tela). */
function aplicarFeriados(qc: QueryClient, ano: number, fn: (l: Feriado[]) => Feriado[]): void {
  const ordenar = (l: Feriado[]) => l.sort((a, b) => a.data.localeCompare(b.data))
  qc.setQueryData<Feriado[]>(chaves.feriados(ano), (lista) => (lista ? ordenar(fn(lista)) : lista))
  const corrente = Number(hojeLocal().slice(0, 4))
  if (ano !== corrente && ano !== corrente + 1) return
  mudarBootstrap(qc, (b) => ({ ...b, feriados: ordenar(fn(b.feriados)) }))
}

export async function criarFeriado(qc: QueryClient, e: CriarFeriadoEntrada): Promise<Feriado> {
  const f = await api<Feriado>('POST', '/api/config/feriados', { corpo: e })
  aplicarFeriados(qc, Number(f.data.slice(0, 4)), (l) => [...l.filter((x) => x.data !== f.data), f])
  return f
}

export async function excluirFeriado(qc: QueryClient, f: Feriado): Promise<void> {
  await api<void>('DELETE', `/api/config/feriados/${encodeURIComponent(f.data)}`)
  aplicarFeriados(qc, Number(f.data.slice(0, 4)), (l) => l.filter((x) => x.data !== f.data))
}

export async function editarConfigApp(qc: QueryClient, e: EditarConfigAppEntrada): Promise<ConfigAppSaida> {
  const saida = await api<ConfigAppSaida>('PATCH', '/api/config/app', { corpo: e })
  qc.setQueryData(chaves.configApp, saida)
  mudarBootstrap(qc, (b) => ({ ...b, config: saida.config }))
  return saida
}
