/**
 * Linha do banco (snake_case) → DTO de shared/tipos (camelCase). Um mapeador por entidade de MapaEntidades e dos
 * DTOs de leitura. Booleanos 0/1 viram true/false; JSON em TEXT vira objeto. As consultas que montam as linhas ficam
 * nos serviços (cada linha traz as colunas da tabela e, quando indicado, colunas calculadas).
 */
import type {
  Anexo, Apontamento, Aprovacao, ArquivoInfo, AutomacaoQuadro, Checklist, ChecklistItem, ClienteContato, ClienteLink,
  ClienteResumo, Coluna, Comentario, Cor, Demanda, Envio, Equipe, EquipeMembro, Etiqueta, Feriado, LinkPublicoResumo,
  MimePermitido, ModeloDemanda, ModeloDemandaEtiqueta, ModeloDemandaItem, ModeloQuadro, ModeloQuadroAutomacao,
  ModeloQuadroColuna, MovimentoDemanda, Notificacao, PendenciaCliente, Quadro, QuadroUsuario, ResponsavelCliente,
  Rodada, Usuario, UsuarioResumo, Versao, VersaoComItens, VersaoItem,
} from '../../../shared/tipos/index.ts'
import { agora } from '../db.ts'

type Linha = Record<string, unknown>
const b = (v: unknown) => v === 1 || v === 1n
const s = (v: unknown) => (v === null || v === undefined ? null : String(v))
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const json = <T>(v: unknown, padrao: T): T => (typeof v === 'string' ? (JSON.parse(v) as T) : padrao)

export const urlArquivo = (id: string, inline = false) => `/api/arquivos/${id}${inline ? '?inline=1' : ''}`

function arquivoInfo(l: Linha, prefixo = ''): ArquivoInfo | null {
  const id = l[`${prefixo}id`]
  if (id === null || id === undefined) return null
  const mime = String(l[`${prefixo}mime`]) as MimePermitido
  const imagem = mime.startsWith('image/')
  return {
    id: String(id),
    nome: String(l[`${prefixo}nome`]),
    mime,
    bytes: Number(l[`${prefixo}bytes`]),
    url: urlArquivo(String(id), imagem),
    imagem,
    criadoEm: String(l[`${prefixo}criado_em`]),
  }
}

function itemBase(l: Linha) {
  return {
    id: String(l.id),
    demandaId: String(l.demanda_id),
    tipo: l.tipo as Anexo['tipo'],
    nome: String(l.nome),
    url: s(l.url),
    caminho: s(l.caminho),
    arquivo: arquivoInfo(l, 'arq_'),
    provedor: s(l.provedor) as Anexo['provedor'],
    driveStatus: s(l.drive_status) as Anexo['driveStatus'],
    driveTestadoEm: s(l.drive_testado_em),
    pos: Number(l.pos),
  }
}

export const mapear = {
  /** Linha de usuario + `equipe_ids` (JSON) + `convite_expira_em`. */
  usuarioResumo(l: Linha): UsuarioResumo {
    return {
      id: String(l.id),
      nome: String(l.nome),
      apelido: s(l.apelido),
      papel: l.papel as UsuarioResumo['papel'],
      cor: l.cor as Cor,
      ativo: b(l.ativo),
      equipeIds: json<string[]>(l.equipe_ids, []),
    }
  },

  usuario(l: Linha): Usuario {
    return {
      ...mapear.usuarioResumo(l),
      email: String(l.email),
      temSenha: l.senha_hash !== null && l.senha_hash !== undefined,
      conviteExpiraEm: s(l.convite_expira_em),
      ultimoAcessoEm: s(l.ultimo_acesso_em),
      criadoEm: String(l.criado_em),
    }
  },

  /** Linha de equipe; os membros vêm à parte. */
  equipe(l: Linha, membros: EquipeMembro[]): Equipe {
    return {
      id: String(l.id),
      nome: String(l.nome),
      slug: String(l.slug),
      cor: l.cor as Cor,
      modeloQuadroId: s(l.modelo_quadro_id),
      ativa: b(l.ativa),
      pos: Number(l.pos),
      membros,
    }
  },

  equipeMembro(l: Linha): EquipeMembro {
    return { usuarioId: String(l.usuario_id), funcao: s(l.funcao), principal: b(l.principal) }
  },

  quadro(l: Linha): Quadro {
    return {
      id: String(l.id),
      nome: String(l.nome),
      slug: String(l.slug),
      descricao: String(l.descricao),
      cor: l.cor as Cor,
      fundo: l.fundo as Quadro['fundo'],
      equipeId: s(l.equipe_id),
      modeloQuadroId: s(l.modelo_quadro_id),
      colunaPorMembro: b(l.coluna_por_membro),
      pos: Number(l.pos),
      arquivadoEm: s(l.arquivado_em),
      criadoPor: s(l.criado_por),
      criadoEm: String(l.criado_em),
    }
  },

  coluna(l: Linha): Coluna {
    return {
      id: String(l.id),
      quadroId: String(l.quadro_id),
      nome: String(l.nome),
      cor: s(l.cor) as Cor | null,
      papel: l.papel as Coluna['papel'],
      responsavelId: s(l.responsavel_id),
      limiteWip: n(l.limite_wip),
      pos: Number(l.pos),
      arquivadaEm: s(l.arquivada_em),
    }
  },

  etiqueta(l: Linha): Etiqueta {
    return { id: String(l.id), quadroId: String(l.quadro_id), nome: String(l.nome), cor: l.cor as Cor, pos: Number(l.pos) }
  },

  automacao(l: Linha): AutomacaoQuadro {
    return {
      id: `${l.quadro_id}:${l.gatilho}`,
      quadroId: String(l.quadro_id),
      gatilho: l.gatilho as AutomacaoQuadro['gatilho'],
      destinoQuadroId: String(l.destino_quadro_id),
      destinoColunaId: String(l.destino_coluna_id),
      membros: l.membros as AutomacaoQuadro['membros'],
      ativa: b(l.ativa),
      atualizadoPor: s(l.atualizado_por),
      atualizadoEm: String(l.atualizado_em),
    }
  },

  quadroUsuario(l: Linha): QuadroUsuario {
    return { quadroId: String(l.quadro_id), favoritoPos: n(l.favorito_pos), seguindo: b(l.seguindo) }
  },

  modeloQuadro(l: Linha, colunas: Linha[], automacoes: Linha[]): ModeloQuadro {
    return {
      id: String(l.id),
      nome: String(l.nome),
      descricao: String(l.descricao),
      pos: Number(l.pos),
      colunas: colunas.map((c): ModeloQuadroColuna => ({
        id: String(c.id), nome: String(c.nome), cor: s(c.cor) as Cor | null, papel: c.papel as Coluna['papel'],
        porMembro: b(c.por_membro), pos: Number(c.pos),
      })),
      automacoes: automacoes.map((a): ModeloQuadroAutomacao => ({
        gatilho: a.gatilho as ModeloQuadroAutomacao['gatilho'], destinoColunaId: String(a.destino_coluna_id),
      })),
    }
  },

  modeloDemanda(l: Linha, itens: Linha[], etiquetas: Linha[]): ModeloDemanda {
    return {
      id: String(l.id),
      quadroId: s(l.quadro_id),
      nome: String(l.nome),
      descricao: String(l.descricao),
      icone: s(l.icone),
      briefingMd: String(l.briefing_md),
      prazoDiasUteis: n(l.prazo_dias_uteis),
      prioridade: s(l.prioridade) as ModeloDemanda['prioridade'],
      estimativaMin: n(l.estimativa_min),
      rodadasInclusas: n(l.rodadas_inclusas),
      ativo: b(l.ativo),
      pos: Number(l.pos),
      itens: itens.map((i): ModeloDemandaItem => ({
        id: String(i.id), checklist: String(i.checklist), texto: String(i.texto), pos: Number(i.pos),
      })),
      etiquetas: etiquetas.map((e): ModeloDemandaEtiqueta => ({ nome: String(e.nome), cor: e.cor as Cor })),
      atualizadoEm: String(l.atualizado_em),
    }
  },

  /** Linha de demanda + `capa_arquivo_id` (arquivo da imagem da capa, se houver). */
  demanda(l: Linha, membroIds: string[], etiquetaIds: string[]): Demanda {
    return {
      id: String(l.id),
      numero: Number(l.numero),
      quadroId: String(l.quadro_id),
      colunaId: String(l.coluna_id),
      posicao: Number(l.posicao),
      titulo: String(l.titulo),
      clienteId: s(l.cliente_id),
      atendimentoId: s(l.atendimento_id),
      modeloId: s(l.modelo_id),
      membroIds,
      etiquetaIds,
      prioridade: l.prioridade as Demanda['prioridade'],
      inicio: s(l.inicio),
      inicioHora: s(l.inicio_hora),
      prazo: s(l.prazo),
      prazoHora: s(l.prazo_hora),
      publicacaoData: s(l.publicacao_data),
      publicacaoHora: s(l.publicacao_hora),
      estimativaMin: n(l.estimativa_min),
      minutosRegistrados: Number(l.minutos_registrados),
      repetir: l.repetir as Demanda['repetir'],
      capaCor: s(l.capa_cor) as Cor | null,
      capaAnexoId: s(l.capa_anexo_id),
      capaUrl: l.capa_arquivo_id ? urlArquivo(String(l.capa_arquivo_id), true) : null,
      concluidaEm: s(l.concluida_em),
      concluidaPor: s(l.concluida_por),
      statusDesde: String(l.status_desde),
      envioPendenteEm: s(l.envio_pendente_em),
      retornoEm: s(l.retorno_em),
      rodadaAtual: Number(l.rodada_atual),
      rodadasInclusas: Number(l.rodadas_inclusas),
      aprovadaEm: s(l.aprovada_em),
      aprovadaVersaoId: s(l.aprovada_versao_id),
      versaoAtualId: s(l.versao_atual_id),
      versaoEnviadaId: s(l.versao_enviada_id),
      nVersoes: Number(l.n_versoes),
      nAnexos: Number(l.n_anexos),
      nCheckTotal: Number(l.n_check_total),
      nCheckFeitos: Number(l.n_check_feitos),
      nComentarios: Number(l.n_comentarios),
      origem: l.origem as Demanda['origem'],
      origemDemandaId: s(l.origem_demanda_id),
      descricaoAtualizadaEm: s(l.descricao_atualizada_em),
      criadoPor: String(l.criado_por),
      arquivadoEm: s(l.arquivado_em),
      rev: Number(l.rev),
      criadoEm: String(l.criado_em),
      atualizadoEm: String(l.atualizado_em),
    }
  },

  checklist(l: Linha): Checklist {
    return {
      id: String(l.id), demandaId: String(l.demanda_id), titulo: String(l.titulo), rodadaId: s(l.rodada_id),
      pos: Number(l.pos), criadoEm: String(l.criado_em),
    }
  },

  checklistItem(l: Linha): ChecklistItem {
    return {
      id: String(l.id), checklistId: String(l.checklist_id), demandaId: String(l.demanda_id), texto: String(l.texto),
      feitoEm: s(l.feito_em), feitoPor: s(l.feito_por), pos: Number(l.pos),
    }
  },

  /** Linha de anexo + colunas do arquivo com prefixo `arq_` (LEFT JOIN). */
  anexo(l: Linha): Anexo {
    return {
      ...itemBase(l),
      comentarioId: s(l.comentario_id),
      finalidade: l.finalidade as Anexo['finalidade'],
      enviadoPor: s(l.enviado_por),
      criadoEm: String(l.criado_em),
    }
  },

  comentario(l: Linha, mencoes: string[], anexos: Anexo[]): Comentario {
    return {
      id: String(l.id),
      demandaId: String(l.demanda_id),
      autorId: s(l.autor_id),
      autorExterno: s(l.autor_externo),
      linkId: s(l.link_id),
      versaoId: s(l.versao_id),
      corpoMd: String(l.corpo_md),
      visivelCliente: b(l.visivel_cliente),
      mencoes,
      anexos,
      editadoEm: s(l.editado_em),
      excluidoEm: s(l.excluido_em),
      criadoEm: String(l.criado_em),
    }
  },

  /** `inclusas` = demanda.rodadas_inclusas (a rodada é inclusa se numero ≤ inclusas). */
  rodada(l: Linha, inclusas: number): Rodada {
    return {
      id: String(l.id),
      demandaId: String(l.demanda_id),
      numero: Number(l.numero),
      origem: l.origem as Rodada['origem'],
      motivo: s(l.motivo) as Rodada['motivo'],
      motivoTexto: s(l.motivo_texto),
      extra: b(l.extra),
      prazo: s(l.prazo),
      prazoHora: s(l.prazo_hora),
      prazoOriginal: s(l.prazo_original),
      abertaEm: String(l.aberta_em),
      abertaPor: s(l.aberta_por),
      fechadaEm: s(l.fechada_em),
      inclusa: Number(l.numero) <= inclusas,
    }
  },

  versaoSemItens(l: Linha): Versao {
    return {
      id: String(l.id),
      demandaId: String(l.demanda_id),
      numero: Number(l.numero),
      rodadaId: String(l.rodada_id),
      nota: s(l.nota),
      criadaPor: String(l.criada_por),
      criadaEm: String(l.criada_em),
      enviadaClienteEm: s(l.enviada_cliente_em),
      enviadaVia: s(l.enviada_via) as Versao['enviadaVia'],
    }
  },

  /** Linha de versao_item + colunas do arquivo com prefixo `arq_`. */
  versaoItem(l: Linha): VersaoItem {
    return { ...itemBase(l), versaoId: String(l.versao_id), previaUrl: s(l.previa_url) }
  },

  versao(l: Linha, itens: VersaoItem[]): VersaoComItens {
    return { ...mapear.versaoSemItens(l), itens }
  },

  envio(l: Linha): Envio {
    return {
      id: String(l.id),
      demandaId: String(l.demanda_id),
      quadroId: String(l.quadro_id),
      versaoId: String(l.versao_id),
      via: l.via as Envio['via'],
      canal: s(l.canal) as Envio['canal'],
      linkId: s(l.link_id),
      contatoId: s(l.contato_id),
      prazoRetorno: s(l.prazo_retorno),
      prazoRetornoHora: s(l.prazo_retorno_hora),
      enviadoPor: String(l.enviado_por),
      enviadoEm: String(l.enviado_em),
    }
  },

  aprovacao(l: Linha): Aprovacao {
    return {
      id: String(l.id),
      demandaId: String(l.demanda_id),
      versaoId: String(l.versao_id),
      decisao: l.decisao as Aprovacao['decisao'],
      via: l.via as Aprovacao['via'],
      canal: s(l.canal) as Aprovacao['canal'],
      linkId: s(l.link_id),
      contatoId: s(l.contato_id),
      nomeInformado: s(l.nome_informado),
      registradoPor: s(l.registrado_por),
      comentario: s(l.comentario),
      motivo: s(l.motivo) as Aprovacao['motivo'],
      rodadaAbertaId: s(l.rodada_aberta_id),
      evidenciaAnexoId: s(l.evidencia_anexo_id),
      quadroAntesId: String(l.quadro_antes_id),
      colunaAntesId: String(l.coluna_antes_id),
      criadoEm: String(l.criado_em),
      anuladaEm: s(l.anulada_em),
      anuladaPor: s(l.anulada_por),
    }
  },

  linkPublico(l: Linha, demandaIds: string[]): LinkPublicoResumo {
    const revogadoEm = s(l.revogado_em)
    const expiraEm = String(l.expira_em)
    return {
      id: String(l.id),
      clienteId: String(l.cliente_id),
      contatoId: s(l.contato_id),
      titulo: s(l.titulo),
      expiraEm,
      revogadoEm,
      criadoPor: String(l.criado_por),
      criadoEm: String(l.criado_em),
      ultimoAcessoEm: s(l.ultimo_acesso_em),
      acessos: Number(l.acessos),
      ativo: revogadoEm === null && expiraEm > agora(),
      demandaIds,
    }
  },

  movimento(l: Linha): MovimentoDemanda {
    return {
      id: Number(l.id),
      quadroId: String(l.quadro_id),
      colunaId: String(l.coluna_id),
      papel: l.papel as MovimentoDemanda['papel'],
      entrouEm: String(l.entrou_em),
      saiuEm: s(l.saiu_em),
      por: s(l.por),
    }
  },

  /**
   * Linha de cliente + `tem_contato_padrao` (0/1). Pendências calculadas: sem AM e sem contato padrão ativo.
   * `apelidos` normalizados (inclui a sigla).
   */
  cliente(l: Linha, apelidos: string[], responsaveis: ResponsavelCliente[]): ClienteResumo {
    const pendencias: PendenciaCliente[] = []
    if (l.atendimento_id === null || l.atendimento_id === undefined) pendencias.push('sem_am')
    if (!b(l.tem_contato_padrao)) pendencias.push('sem_contato_padrao')
    return {
      id: String(l.id),
      nome: String(l.nome),
      sigla: String(l.sigla),
      paiId: s(l.pai_id),
      status: l.status as ClienteResumo['status'],
      nivel: n(l.nivel) as ClienteResumo['nivel'],
      cor: l.cor as Cor,
      logoUrl: l.logo_arquivo_id ? urlArquivo(String(l.logo_arquivo_id), true) : null,
      atendimentoId: s(l.atendimento_id),
      rodadasInclusas: Number(l.rodadas_inclusas),
      pastaSaida: s(l.pasta_saida),
      apelidos,
      responsaveis,
      pendencias,
    }
  },

  contato(l: Linha): ClienteContato {
    return {
      id: String(l.id),
      clienteId: String(l.cliente_id),
      nome: String(l.nome),
      cargo: s(l.cargo),
      whatsapp: s(l.whatsapp),
      email: s(l.email),
      aprova: b(l.aprova),
      padrao: b(l.padrao),
      ativo: b(l.ativo),
    }
  },

  clienteLink(l: Linha): ClienteLink {
    return {
      id: String(l.id), clienteId: String(l.cliente_id), tipo: l.tipo as ClienteLink['tipo'], rotulo: String(l.rotulo),
      url: String(l.url), pos: Number(l.pos),
    }
  },

  feriado(l: Linha): Feriado {
    return { data: String(l.data), nome: String(l.nome), tipo: l.tipo as Feriado['tipo'] }
  },

  apontamento(l: Linha): Apontamento {
    return {
      id: String(l.id),
      usuarioId: String(l.usuario_id),
      demandaId: String(l.demanda_id),
      clienteId: s(l.cliente_id),
      data: String(l.data),
      minutos: n(l.minutos),
      iniciadoEm: s(l.iniciado_em),
      paradoEm: s(l.parado_em),
      origem: l.origem as Apontamento['origem'],
      nota: s(l.nota),
      criadoEm: String(l.criado_em),
    }
  },

  /** Linha de notificacao + `demanda_numero`. */
  notificacao(l: Linha): Notificacao {
    return {
      id: Number(l.id),
      usuarioId: String(l.usuario_id),
      tipo: l.tipo as Notificacao['tipo'],
      demandaId: s(l.demanda_id),
      demandaNumero: n(l.demanda_numero),
      atorId: s(l.ator_id),
      resumo: String(l.resumo),
      lidaEm: s(l.lida_em),
      criadoEm: String(l.criado_em),
    }
  },

  /** Linha de arquivo. */
  arquivo(l: Linha): ArquivoInfo {
    return arquivoInfo(l)!
  },
}

/** Colunas do arquivo com prefixo `arq_` para o LEFT JOIN de anexo e versao_item (alias `ar`). */
export const COLUNAS_ARQUIVO = 'ar.id AS arq_id, ar.nome AS arq_nome, ar.mime AS arq_mime, ar.bytes AS arq_bytes, ar.criado_em AS arq_criado_em'
