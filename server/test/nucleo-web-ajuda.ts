/**
 * NÚCLEO-WEB: dados de teste para a lógica do front que roda sem navegador (cache, tempo real, previsão do mover,
 * mescla do 409). Só objetos do contrato (shared/tipos), sem servidor.
 */
import { QueryClient } from '@tanstack/query-core'
import type {
  Bootstrap, Coluna, Demanda, Etiqueta, EventoTempoReal, Quadro, UsuarioResumo,
} from '../../shared/tipos/index.ts'

export const EU = 'u-eu'

export function demanda(extra: Partial<Demanda> = {}): Demanda {
  return {
    id: 'd1', numero: 1, quadroId: 'q-criacao', colunaId: 'c-fila', posicao: 1024, titulo: 'Carrossel',
    clienteId: null, atendimentoId: null, modeloId: null, membroIds: [], etiquetaIds: [], prioridade: 'media',
    inicio: null, inicioHora: null, prazo: null, prazoHora: null, publicacaoData: null, publicacaoHora: null,
    estimativaMin: null, minutosRegistrados: 0, repetir: 'nenhuma', capaCor: null, capaAnexoId: null, capaUrl: null,
    concluidaEm: null, concluidaPor: null, statusDesde: '2026-10-14T12:00:00.000Z', envioPendenteEm: null, retornoEm: null,
    rodadaAtual: 1, rodadasInclusas: 2, aprovadaEm: null, aprovadaVersaoId: null, versaoAtualId: null, versaoEnviadaId: null,
    nVersoes: 0, nAnexos: 0, nCheckTotal: 0, nCheckFeitos: 0, nComentarios: 0, origem: 'manual', origemDemandaId: null,
    descricaoAtualizadaEm: null, criadoPor: 'u-am', arquivadoEm: null, rev: 1, criadoEm: '2026-10-14T12:00:00.000Z',
    atualizadoEm: '2026-10-14T12:00:00.000Z', ...extra,
  }
}

export function quadro(extra: Partial<Quadro> = {}): Quadro {
  return {
    id: 'q-criacao', nome: 'Criação', slug: 'criacao', descricao: '', cor: 'rosa', fundo: 'liso', equipeId: 'eq-criacao',
    modeloQuadroId: null, colunaPorMembro: true, pos: 1024, arquivadoEm: null, criadoPor: null, criadoEm: '2026-10-01T12:00:00.000Z', ...extra,
  }
}

export function coluna(extra: Partial<Coluna> = {}): Coluna {
  return {
    id: 'c-fila', quadroId: 'q-criacao', nome: 'Fila', cor: null, papel: 'normal', responsavelId: null, limiteWip: null,
    pos: 1024, arquivadaEm: null, ...extra,
  }
}

export function etiqueta(extra: Partial<Etiqueta> = {}): Etiqueta {
  return { id: 'e-urgente', quadroId: 'q-criacao', nome: 'Urgente', cor: 'rosa', pos: 1024, ...extra }
}

export function usuario(extra: Partial<UsuarioResumo> = {}): UsuarioResumo {
  return { id: EU, nome: 'Eu Mesma', apelido: 'Eu', papel: 'equipe', cor: 'azul', ativo: true, equipeIds: ['eq-criacao'], ...extra }
}

/**
 * Quadros Criação (Fila, Rafa [pessoa], Bia [pessoa], Concluído) e Social (Fila, Agendar), etiquetas "Urgente" e
 * "Alteração" na Criação e "Alteração" no Social, e as pessoas eu, Rafa, Bia e Caio.
 */
export function bootstrap(extra: Partial<Bootstrap> = {}): Bootstrap {
  return {
    seq: 100,
    app: { nome: 'Pauta', url: 'http://localhost', versao: 'teste' },
    config: {
      demandaNumeroInicial: 1, prazoHoraPadrao: '18:00', paradoLimiteDiasUteis: 2, clienteParadoDiasUteis: 2, retornoPrazoDiasUteis: 2,
      ajustePrazoDiasUteis: 1, linkPublicoValidadeDias: 30, linkPublicoArquivoMinutos: 10, conviteValidadeDias: 7,
      redefinicaoValidadeHoras: 1, sessaoValidadeDias: 30, eventoRetencaoDias: 7, uploadLimiteBytes: 10_485_760, arquivoLixoDias: 30,
      backupManter: 14, quadroConcluidasDias: 7, cronometroLimiteHoras: 10, modelosRevisadosEm: null,
    },
    eu: {
      usuario: { ...usuario(), email: 'eu@pauta.test', temSenha: true, conviteExpiraEm: null, ultimoAcessoEm: null, criadoEm: '2026-10-01T12:00:00.000Z' },
      prefs: {}, favoritos: [], seguindo: [], cronometro: null, rotaInicial: '/inicio',
    },
    usuarios: [
      usuario(), usuario({ id: 'u-rafa', nome: 'Rafael Lima', apelido: 'Rafa' }), usuario({ id: 'u-bia', nome: 'Beatriz Nunes', apelido: 'Bia' }),
      usuario({ id: 'u-caio', nome: 'Caio Dias', apelido: 'Caio', equipeIds: ['eq-social'] }),
    ],
    equipes: [],
    clientes: [{
      id: 'cli-he', nome: 'Hospital Evangélico', sigla: 'HE', paiId: null, status: 'recorrente', nivel: null, cor: 'verde', logoUrl: null,
      atendimentoId: 'u-am', rodadasInclusas: 2, pastaSaida: null, apelidos: ['he'], pendencias: [],
      responsaveis: [{ equipeId: 'eq-criacao', usuarioId: 'u-rafa' }, { equipeId: 'eq-social', usuarioId: 'u-caio' }],
    }],
    quadros: [quadro(), quadro({ id: 'q-social', nome: 'Social', slug: 'social', equipeId: 'eq-social', pos: 2048 })],
    colunas: [
      coluna(),
      coluna({ id: 'c-rafa', nome: 'Rafa', responsavelId: 'u-rafa', pos: 2048 }),
      coluna({ id: 'c-bia', nome: 'Bia', responsavelId: 'u-bia', pos: 3072 }),
      coluna({ id: 'c-feito', nome: 'Concluído', papel: 'concluida', pos: 4096 }),
      coluna({ id: 'c-social-fila', quadroId: 'q-social', nome: 'Fila', pos: 1024 }),
      coluna({ id: 'c-agendar', quadroId: 'q-social', nome: 'Agendar', pos: 2048 }),
    ],
    etiquetas: [
      etiqueta(), etiqueta({ id: 'e-alt', nome: 'Alteração', cor: 'ambar', pos: 2048 }),
      etiqueta({ id: 'e-social-alt', quadroId: 'q-social', nome: 'alteracao', cor: 'ambar' }),
    ],
    automacoes: [],
    modelosQuadro: [],
    modelosDemanda: [],
    feriados: [],
    demandas: [],
    naoLidas: 0,
    ...extra,
  }
}

/** Um QueryClient com o bootstrap em cache (sem buscar nada). */
export function cacheCom(b: Bootstrap): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  qc.setQueryData(['bootstrap'], b)
  return qc
}

export const bootDe = (qc: QueryClient) => qc.getQueryData<Bootstrap>(['bootstrap'])!

let seq = 100
/** Evento do tempo real (seq crescente). */
export function evento<E extends EventoTempoReal>(e: Omit<E, 's'> & { s?: number }): E {
  return { s: e.s ?? ++seq, ...e } as E
}
