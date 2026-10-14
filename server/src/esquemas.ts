/**
 * Esquemas zod das entradas do núcleo, um por DTO de shared/tipos (o tipo de cada um confere com o contrato).
 * Campos desconhecidos são descartados; textos com limites do banco.
 */
import { z } from 'zod'
import {
  CORES, ETIQUETAS_SEM_PAR, FUNDOS_QUADRO, MEMBROS_AO_MOVER, ORDENS_COLUNA, PAPEIS, PAPEIS_COLUNA, PRIORIDADES,
  REPETICOES, STATUS_CLIENTE, TIPOS_LINK_CLIENTE,
  type AdicionarEtiquetaEntrada, type AdicionarMembroEntrada, type ConcluirEntrada, type CopiarQuadroEntrada,
  type CriarClienteEntrada, type CriarColunaEntrada, type CriarContatoEntrada, type CriarDemandaEntrada,
  type CriarEquipeEntrada, type CriarEtiquetaEntrada, type CriarLinkClienteEntrada, type CriarPessoaEntrada,
  type CriarQuadroEntrada, type DefinirApelidosEntrada, type DefinirMembrosEntrada, type DefinirResponsaveisEntrada,
  type DefinirSenhaEntrada, type EditarApontamentoEntrada, type EditarClienteEntrada, type EditarColunaEntrada,
  type EditarContatoEntrada, type EditarDemandaEntrada, type EditarEquipeEntrada, type EditarEtiquetaEntrada,
  type EditarEuEntrada, type EditarLinkClienteEntrada, type EditarPessoaEntrada, type EditarQuadroEntrada,
  type ExcluirDemandaEntrada, type FavoritoEntrada, type ListarApontamentosConsulta, type LoginEntrada,
  type MoverCardsEntrada, type MoverEntrada, type NovoItem, type OrdenarColunaEntrada, type RestaurarEntrada,
  type SeguirEntrada, type TokenEntrada, type TrocarSenhaEntrada,
} from '../../shared/tipos/index.ts'
import { ehDataLocal, ehHoraLocal } from '../../shared/logica/datas.ts'

z.config(z.locales.ptBR())

const id = z.string().trim().min(1).max(64)
const texto = (min: number, max: number) => z.string().trim().min(min).max(max)
const cor = z.enum(CORES)
const dataLocal = z.string().refine(ehDataLocal, 'data inválida (use AAAA-MM-DD)')
const horaLocal = z.string().refine(ehHoraLocal, 'hora inválida (use HH:MM)')
const posicao = z.object({ depoisDeId: id.nullable().optional(), antesDeId: id.nullable().optional() })
const email = z.string().trim().toLowerCase().max(200).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'e-mail inválido')
const ids = z.array(id).max(100)

// ─────────────────────────────── auth e pessoas ───────────────────────────────

export const login: z.ZodType<LoginEntrada> = z.object({ email: z.string().trim().toLowerCase().min(1).max(200), senha: z.string().min(1).max(200) })
export const token: z.ZodType<TokenEntrada> = z.object({ token: z.string().min(10).max(200) })
export const definirSenha: z.ZodType<DefinirSenhaEntrada> = z.object({ token: z.string().min(10).max(200), senha: z.string().max(200) })
export const trocarSenha: z.ZodType<TrocarSenhaEntrada> = z.object({ senhaAtual: z.string().max(200), senhaNova: z.string().max(200) })
export const editarEu: z.ZodType<EditarEuEntrada> = z.object({
  nome: texto(1, 120).optional(),
  apelido: texto(1, 40).nullable().optional(),
  cor: cor.optional(),
  prefs: z.object({
    tema: z.enum(['sistema', 'claro', 'escuro']).optional(), atalhos: z.boolean().optional(), menuRecolhido: z.boolean().optional(),
  }).optional(),
})

const participacao = z.object({ equipeId: id, funcao: texto(1, 40).nullable().optional(), principal: z.boolean().optional() })
export const criarPessoa: z.ZodType<CriarPessoaEntrada> = z.object({
  nome: texto(1, 120), apelido: texto(1, 40).nullable().optional(), email, papel: z.enum(PAPEIS),
  equipes: z.array(participacao).max(20).optional(), cor: cor.optional(),
})
export const editarPessoa: z.ZodType<EditarPessoaEntrada> = z.object({
  nome: texto(1, 120).optional(), apelido: texto(1, 40).nullable().optional(), email: email.optional(),
  papel: z.enum(PAPEIS).optional(), cor: cor.optional(), ativo: z.boolean().optional(),
  equipes: z.array(participacao).max(20).optional(),
})

const slugEquipe = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, 'use letras minúsculas, números e hífens')
export const criarEquipe: z.ZodType<CriarEquipeEntrada> = z.object({
  nome: texto(1, 60), slug: slugEquipe, cor: cor.optional(), modeloQuadroId: id.nullable().optional(),
})
export const editarEquipe: z.ZodType<EditarEquipeEntrada> = z.object({
  nome: texto(1, 60).optional(), cor: cor.optional(), modeloQuadroId: id.nullable().optional(), ativa: z.boolean().optional(),
  posicao: posicao.optional(),
})
export const definirMembros: z.ZodType<DefinirMembrosEntrada> = z.object({
  membros: z.array(z.object({ usuarioId: id, funcao: texto(1, 40).nullable(), principal: z.boolean() })).max(200),
})

// ─────────────────────────────── quadros, colunas, etiquetas ───────────────────────────────

const novaColuna = z.object({
  nome: texto(1, 60), cor: cor.nullable().optional(), papel: z.enum(PAPEIS_COLUNA).optional(),
  limiteWip: z.number().int().min(1).max(99).nullable().optional(), responsavelId: id.nullable().optional(),
  modeloColunaId: id.nullable().optional(),
})
const slugQuadro = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/, 'use letras minúsculas, números e hífens')
const baseQuadro = {
  nome: texto(1, 80), slug: slugQuadro.optional(), descricao: z.string().trim().max(500).optional(), cor: cor.optional(),
  fundo: z.enum(FUNDOS_QUADRO).optional(), equipeId: id.nullable().optional(), membrosDaEquipeSeguem: z.boolean().optional(),
  posicao: posicao.optional(),
}
export const criarQuadro: z.ZodType<CriarQuadroEntrada> = z.object({
  ...baseQuadro, modeloQuadroId: id.nullable().optional(), colunas: z.array(novaColuna).max(60).optional(),
  colunaPorMembro: z.boolean().optional(),
})
export const copiarQuadro: z.ZodType<CopiarQuadroEntrada> = z.object(baseQuadro)
export const editarQuadro: z.ZodType<EditarQuadroEntrada> = z.object({
  nome: texto(1, 80).optional(), slug: slugQuadro.optional(), descricao: z.string().trim().max(500).optional(), cor: cor.optional(),
  fundo: z.enum(FUNDOS_QUADRO).optional(), equipeId: id.nullable().optional(), colunaPorMembro: z.boolean().optional(),
  posicao: posicao.optional(),
})
export const favorito: z.ZodType<FavoritoEntrada> = z.object({
  favorito: z.boolean(), posicao: z.object({ depoisDeQuadroId: id.nullable().optional() }).optional(),
})
export const seguir: z.ZodType<SeguirEntrada> = z.object({ seguindo: z.boolean() })

export const criarColuna: z.ZodType<CriarColunaEntrada> = novaColuna.extend({ posicao: posicao.optional() })
export const editarColuna: z.ZodType<EditarColunaEntrada> = z.object({
  nome: texto(1, 60).optional(), cor: cor.nullable().optional(), papel: z.enum(PAPEIS_COLUNA).optional(),
  limiteWip: z.number().int().min(1).max(99).nullable().optional(), responsavelId: id.nullable().optional(),
  posicao: posicao.optional(),
})
export const moverCards: z.ZodType<MoverCardsEntrada> = z.object({
  destinoColunaId: id, etiquetasSemPar: z.enum(ETIQUETAS_SEM_PAR).optional(), membros: z.enum(MEMBROS_AO_MOVER).optional(),
})
export const ordenarColuna: z.ZodType<OrdenarColunaEntrada> = z.object({ por: z.enum(ORDENS_COLUNA) })
export const criarEtiqueta: z.ZodType<CriarEtiquetaEntrada> = z.object({ nome: z.string().max(40).optional(), cor, posicao: posicao.optional() })
export const editarEtiqueta: z.ZodType<EditarEtiquetaEntrada> = z.object({
  nome: z.string().max(40).optional(), cor: cor.optional(), posicao: posicao.optional(),
})

// ─────────────────────────────── clientes ───────────────────────────────

const sigla = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,12}$/, 'de 1 a 12 letras (A–Z) ou números')
const camposCliente = {
  nome: texto(1, 160), paiId: id.nullable().optional(), status: z.enum(STATUS_CLIENTE).optional(),
  nivel: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().optional(), cor: cor.optional(),
  logoArquivoId: id.nullable().optional(), atendimentoId: id.nullable().optional(),
  rodadasInclusas: z.number().int().min(0).max(20).optional(), pastaSaida: z.string().max(500).nullable().optional(),
  observacoes: z.string().max(5000).nullable().optional(),
}
export const criarCliente: z.ZodType<CriarClienteEntrada> = z.object({
  sigla, ...camposCliente, apelidos: z.array(z.string().max(80)).max(50).optional(),
})
export const editarCliente: z.ZodType<EditarClienteEntrada> = z.object({
  sigla: sigla.optional(), ...camposCliente, nome: texto(1, 160).optional(),
})
export const definirApelidos: z.ZodType<DefinirApelidosEntrada> = z.object({ apelidos: z.array(z.string().max(80)).max(50) })
export const definirResponsaveis: z.ZodType<DefinirResponsaveisEntrada> = z.object({
  responsaveis: z.array(z.object({ equipeId: id, usuarioId: id })).max(30),
})
const camposContato = {
  cargo: z.string().max(80).nullable().optional(), whatsapp: z.string().max(40).nullable().optional(),
  email: z.string().max(200).nullable().optional(), aprova: z.boolean().optional(), padrao: z.boolean().optional(),
}
export const criarContato: z.ZodType<CriarContatoEntrada> = z.object({ nome: texto(1, 120), ...camposContato })
export const editarContato: z.ZodType<EditarContatoEntrada> = z.object({ nome: texto(1, 120).optional(), ...camposContato, ativo: z.boolean().optional() })
export const criarLink: z.ZodType<CriarLinkClienteEntrada> = z.object({
  tipo: z.enum(TIPOS_LINK_CLIENTE), rotulo: texto(1, 80), url: z.string().trim().max(2000),
})
export const editarLink: z.ZodType<EditarLinkClienteEntrada> = z.object({
  tipo: z.enum(TIPOS_LINK_CLIENTE).optional(), rotulo: texto(1, 80).optional(), url: z.string().trim().max(2000).optional(),
  posicao: posicao.optional(),
})

// ─────────────────────────────── demandas ───────────────────────────────

export const novoItem: z.ZodType<NovoItem> = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('link'), url: z.string().trim().max(2000), nome: z.string().max(200).optional() }),
  z.object({ tipo: z.literal('caminho'), caminho: z.string().trim().min(1).max(1000), nome: z.string().max(200).optional() }),
  z.object({ tipo: z.literal('arquivo'), arquivoId: id, nome: z.string().max(200).optional() }),
])

const camposDemanda = {
  clienteId: id.nullable().optional(), atendimentoId: id.nullable().optional(), prioridade: z.enum(PRIORIDADES).optional(),
  inicio: dataLocal.nullable().optional(), inicioHora: horaLocal.nullable().optional(),
  prazo: dataLocal.nullable().optional(), prazoHora: horaLocal.nullable().optional(),
  publicacaoData: dataLocal.nullable().optional(), publicacaoHora: horaLocal.nullable().optional(),
  estimativaMin: z.number().int().min(1).max(100000).nullable().optional(), repetir: z.enum(REPETICOES).optional(),
  capaCor: cor.nullable().optional(), rodadasInclusas: z.number().int().min(0).max(20).optional(),
}
export const criarDemanda: z.ZodType<CriarDemandaEntrada> = z.object({
  quadroId: id, colunaId: id.optional(), posicao: posicao.optional(), titulo: texto(1, 500), modeloId: id.nullable().optional(),
  membroIds: ids.optional(), etiquetaIds: ids.optional(), descricaoMd: z.string().max(100000).optional(),
  origemTexto: z.string().max(50000).nullable().optional(), origem: z.enum(['manual', 'whatsapp']).optional(),
  links: z.array(novoItem).max(30).optional(), ...camposDemanda,
})
export const editarDemanda: z.ZodType<EditarDemandaEntrada> = z.object({
  titulo: texto(1, 500).optional(), descricaoMd: z.string().max(100000).optional(), capaAnexoId: id.nullable().optional(),
  ...camposDemanda,
})
export const mover: z.ZodType<MoverEntrada> = z.object({
  colunaId: id, posicao: posicao.optional(), etiquetasSemPar: z.enum(ETIQUETAS_SEM_PAR).optional(), etiquetaIds: ids.optional(),
  membros: z.enum(MEMBROS_AO_MOVER).optional(), membroIds: ids.optional(), rev: z.number().int().min(1).optional(),
})
export const concluir: z.ZodType<ConcluirEntrada> = z.object({ concluida: z.boolean() })
export const adicionarMembro: z.ZodType<AdicionarMembroEntrada> = z.object({ usuarioId: id })
export const adicionarEtiqueta: z.ZodType<AdicionarEtiquetaEntrada> = z.object({ etiquetaId: id })
export const restaurar: z.ZodType<RestaurarEntrada> = z.object({ colunaId: id.optional() })
export const excluirDemanda: z.ZodType<ExcluirDemandaEntrada> = z.object({ confirmarNumero: z.number().int().min(1) })

// ─────────────────────────────── horas ───────────────────────────────

export const listarApontamentos: z.ZodType<ListarApontamentosConsulta> = z.object({
  demandaId: id.optional(), usuarioId: id.optional(), clienteId: id.optional(), de: dataLocal.optional(), ate: dataLocal.optional(),
})
export const editarApontamento: z.ZodType<EditarApontamentoEntrada> = z.object({
  data: dataLocal.optional(), minutos: z.number().int().min(1).max(1440).optional(), nota: z.string().max(500).nullable().optional(),
})

