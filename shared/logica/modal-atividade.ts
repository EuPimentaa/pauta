/**
 * Frase de cada linha do histórico (aba Atividade do modal, F1): "Rafa moveu de Fazendo para Revisão". Puro: quem
 * chama passa como achar os nomes (pessoas, colunas e quadros do cache) e a data formatada.
 */
import type { Atividade, MapaDadosAtividade, TipoAtividade } from '../tipos/demandas.ts'
import type { DataLocal, Id } from '../tipos/nucleo.ts'
import { ROTULO_MOTIVO_RODADA, type MotivoRodada } from '../tipos/nucleo.ts'
import { formatarDuracao } from './modal-texto.ts'

export interface NomesAtividade {
  /** Apelido ou primeiro nome (null = pessoa que o cache não conhece). */
  pessoa(id: Id): string | null
  coluna(id: Id): string | null
  quadro(id: Id): string | null
  data(d: DataLocal): string
  /** O usuário que está lendo (para "você"). */
  eu: Id | null
}

export interface FraseAtividade {
  /** Quem fez ("Rafa", "Você", "O cliente", "Automação"). */
  ator: string
  /** O resto da frase, minúsculo ("moveu de Fazendo para Revisão"). */
  texto: string
  /** Grupo para o ícone (o ciclo tem um por tipo de fato: entrega, envio, link aberto, aprovação, ajuste). */
  grupo: 'criacao' | 'edicao' | 'movimento' | 'conclusao' | 'pessoas' | 'etiquetas' | 'arquivo' | 'ciclo' | 'entrega' | 'envio'
    | 'visto' | 'aprovacao' | 'ajuste' | 'comentario' | 'anexo' | 'checklist' | 'tempo'
}

const CAMPOS: Record<string, string> = {
  titulo: 'o título', descricaoMd: 'a descrição', clienteId: 'o cliente', atendimentoId: 'o atendimento',
  prioridade: 'a prioridade', inicio: 'o início', inicioHora: 'a hora do início', prazo: 'o prazo', prazoHora: 'a hora do prazo',
  publicacaoData: 'a publicação', publicacaoHora: 'a hora da publicação', estimativaMin: 'a estimativa', repetir: 'a repetição',
  capaCor: 'a capa', capaAnexoId: 'a capa', rodadasInclusas: 'as rodadas inclusas',
}

/** "a, b e c". */
export function juntar(partes: string[]): string {
  const unicas = [...new Set(partes)]
  if (unicas.length <= 1) return unicas[0] ?? ''
  return `${unicas.slice(0, -1).join(', ')} e ${unicas.at(-1)}`
}

const aspas = (s: string) => `“${s.length > 60 ? `${s.slice(0, 59)}…` : s}”`

export function fraseAtividade(a: Atividade, n: NomesAtividade): FraseAtividade {
  const nomeDe = (id: Id | null | undefined, padrao = 'alguém') => {
    if (!id) return padrao
    if (id === n.eu) return 'você'
    return n.pessoa(id) ?? padrao
  }
  const ator = a.atorTipo === 'cliente' ? 'O cliente' : a.atorTipo === 'sistema' ? 'Automação' : a.atorTipo === 'importacao'
    ? 'Importação' : a.atorId === n.eu ? 'Você' : (a.atorId && n.pessoa(a.atorId)) || 'Alguém'
  const colunaDe = (id: Id) => n.coluna(id) ?? 'uma coluna arquivada'
  const lugar = (l: { quadroId: Id; colunaId: Id }, comQuadro: boolean) =>
    comQuadro ? `${n.quadro(l.quadroId) ?? 'outro quadro'} › ${colunaDe(l.colunaId)}` : colunaDe(l.colunaId)
  const d = a.dados as MapaDadosAtividade[TipoAtividade]
  const f = (texto: string, grupo: FraseAtividade['grupo']): FraseAtividade => ({ ator, texto, grupo })

  switch (a.tipo) {
    case 'demanda.criada': {
      const x = d as MapaDadosAtividade['demanda.criada']
      const como = { manual: '', rapida: ' pela criação rápida', whatsapp: ' colando do WhatsApp', copia: ' como cópia',
        repeticao: ' pela repetição', importacao: ' pela importação' }[x.origem] ?? ''
      return f(`criou a demanda${como} em ${colunaDe(x.colunaId)}`, 'criacao')
    }
    case 'demanda.editada': {
      const x = d as MapaDadosAtividade['demanda.editada']
      const partes = x.campos.map((c) => CAMPOS[c]).filter((c): c is string => !!c)
      const prazoAntes = a.antes && typeof a.antes.prazo === 'string' ? ` (era ${n.data(a.antes.prazo)})` : ''
      // a aprovação levou a peça a outro quadro: o prazo da rodada foi cumprido (API.md §4.16)
      if (x.aprovacaoId) {
        return { ator: 'Automação', grupo: 'edicao',
          texto: x.prazoNovo ? `trocou o prazo pela publicação, ${n.data(x.prazoNovo)}${prazoAntes}` : `tirou o prazo, cumprido na aprovação${prazoAntes}` }
      }
      return f(partes.length ? `mudou ${juntar(partes)}${x.campos.length === 1 && x.campos[0] === 'prazo' ? prazoAntes : ''}` : 'editou a demanda',
        'edicao')
    }
    case 'demanda.movida': {
      const x = d as MapaDadosAtividade['demanda.movida']
      const outroQuadro = x.de.quadroId !== x.para.quadroId
      const base = `de ${lugar(x.de, outroQuadro)} para ${lugar(x.para, outroQuadro)}`
      const extras: string[] = []
      if (x.etiquetasDeixadas?.length) extras.push(`${juntar(x.etiquetasDeixadas)} ficou no quadro de origem`)
      if (x.membrosEntraram?.length) extras.push(`${juntar(x.membrosEntraram.map((id) => nomeDe(id)))} entrou`)
      const sufixo = extras.length ? ` · ${extras.join('; ')}` : ''
      if (x.via === 'automacao') return { ator: 'Automação', texto: `moveu ${base}${sufixo}`, grupo: 'movimento' }
      if (x.via === 'reabrir') return f(`reabriu e a demanda voltou ${base}`, 'movimento')
      if (x.via === 'coluna') return f(`moveu todos os cards ${base}`, 'movimento')
      return f(`moveu ${base}${sufixo}`, 'movimento')
    }
    case 'demanda.concluida': {
      const x = d as MapaDadosAtividade['demanda.concluida']
      return f(`concluiu${x.proximaNumero ? ` · a próxima é a #${x.proximaNumero}` : ''}`, 'conclusao')
    }
    case 'demanda.reaberta': return f('reabriu a demanda', 'conclusao')
    case 'demanda.membro_adicionado': {
      const x = d as MapaDadosAtividade['demanda.membro_adicionado']
      return f(x.usuarioId === a.atorId ? 'entrou na demanda' : `pôs ${nomeDe(x.usuarioId)} na demanda`, 'pessoas')
    }
    case 'demanda.membro_removido': {
      const x = d as MapaDadosAtividade['demanda.membro_removido']
      return f(x.usuarioId === a.atorId ? 'saiu da demanda' : `tirou ${nomeDe(x.usuarioId)} da demanda`, 'pessoas')
    }
    case 'demanda.etiqueta_adicionada': return f(`pôs a etiqueta ${(d as MapaDadosAtividade['demanda.etiqueta_adicionada']).nome || 'sem nome'}`, 'etiquetas')
    case 'demanda.etiqueta_removida': return f(`tirou a etiqueta ${(d as MapaDadosAtividade['demanda.etiqueta_removida']).nome || 'sem nome'}`, 'etiquetas')
    case 'demanda.arquivada': return f('arquivou a demanda', 'arquivo')
    case 'demanda.restaurada': return f(`restaurou a demanda em ${colunaDe((d as MapaDadosAtividade['demanda.restaurada']).colunaId)}`, 'arquivo')
    case 'demanda.excluida': return f('excluiu a demanda', 'arquivo')
    case 'demanda.copiada': {
      const x = d as MapaDadosAtividade['demanda.copiada']
      return f('novaNumero' in x ? `copiou para a #${x.novaNumero}` : `criou esta cópia da #${x.origemNumero}`, 'criacao')
    }
    case 'demanda.repetida': {
      const x = d as MapaDadosAtividade['demanda.repetida']
      return f('novaNumero' in x ? `concluiu e a repetição criou a #${x.novaNumero}` : `concluiu a #${x.origemNumero} e esta nasceu da repetição`,
        'criacao')
    }
    case 'rodada.aberta': {
      const x = d as MapaDadosAtividade['rodada.aberta']
      // pelo link o motivo é o padrão (ninguém escolheu) e quem pediu já está na linha de cima: não repete nem presume
      if (x.pedidoPor || a.atorTipo === 'cliente') {
        return { ator: `Rodada ${x.numero}`, texto: `aberta com o pedido ${x.pedidoPor ? `de ${x.pedidoPor}` : 'do cliente'} · prazo ${n.data(x.prazo)}`, grupo: 'ajuste' }
      }
      const motivo = ROTULO_MOTIVO_RODADA[x.motivo as MotivoRodada] ?? x.motivo
      const quem = x.origem === 'cliente' ? 'registrou o ajuste do cliente e abriu' : 'pediu ajuste interno e abriu'
      return f(`${quem} a rodada ${x.numero} (${motivo.toLowerCase()}) · prazo ${n.data(x.prazo)}`, 'ajuste')
    }
    case 'rodada.extra_marcada': return f(`marcou a rodada ${(d as MapaDadosAtividade['rodada.extra_marcada']).numero} como extra`, 'ciclo')
    case 'rodada.extra_desmarcada': return f(`desmarcou a rodada ${(d as MapaDadosAtividade['rodada.extra_desmarcada']).numero} como extra`, 'ciclo')
    case 'versao.entregue': return f(`entregou a V${(d as MapaDadosAtividade['versao.entregue']).numero}`, 'entrega')
    case 'versao.itens_adicionados': {
      const x = d as MapaDadosAtividade['versao.itens_adicionados']
      return f(`acrescentou ${x.itens} ${x.itens === 1 ? 'item' : 'itens'} à V${x.numero}`, 'entrega')
    }
    case 'versao.editada': return f(`editou a nota da V${(d as MapaDadosAtividade['versao.editada']).numero}`, 'entrega')
    case 'versao.enviada': {
      const x = d as MapaDadosAtividade['versao.enviada']
      return f(`enviou a V${x.numero} ao cliente ${x.via === 'link' ? 'por link' : 'por fora'}`, 'envio')
    }
    case 'link.gerado': return f('gerou um link de aprovação', 'envio')
    case 'link.revogado': return f('revogou o link de aprovação', 'ciclo')
    case 'link.visto': return { ator: 'O cliente', texto: 'abriu o link de aprovação', grupo: 'visto' }
    // só o admin recebe esta linha (API.md §4.16): quem tinha o endereço do link
    case 'link.exibido': return f('recebeu o endereço do link de aprovação', 'ciclo')
    case 'retorno.registrado': {
      const x = d as MapaDadosAtividade['retorno.registrado']
      const decisao = x.decisao === 'aprovado' ? `aprovou a V${x.versaoNumero}` : `pediu ajuste na V${x.versaoNumero}`
      const grupo = x.decisao === 'aprovado' ? 'aprovacao' : 'ajuste'
      // da mesma rede de uma sessão interna recente (API.md §4.17): pode ser alguém da agência no lugar do cliente
      const rede = x.redeInterna?.length ? ` · da mesma rede que ${juntar(x.redeInterna.map((id) => nomeDe(id)))}` : ''
      if (x.via === 'link') return { ator: x.quem || 'O cliente', texto: `${decisao} pelo link${rede}`, grupo }
      return f(`registrou: ${x.quem} ${decisao}`, grupo)
    }
    case 'aprovacao.anulada': return f(`anulou a aprovação da V${(d as MapaDadosAtividade['aprovacao.anulada']).versaoNumero}`, 'ciclo')
    case 'comentario.criado':
      return f((d as MapaDadosAtividade['comentario.criado']).visivelCliente ? 'comentou (visível ao cliente)' : 'comentou', 'comentario')
    case 'comentario.editado': return f('editou um comentário', 'comentario')
    case 'comentario.excluido': return f('excluiu um comentário', 'comentario')
    case 'anexo.adicionado': return f(`anexou ${aspas((d as MapaDadosAtividade['anexo.adicionado']).nome)}`, 'anexo')
    case 'anexo.removido': return f(`removeu o anexo ${aspas((d as MapaDadosAtividade['anexo.removido']).nome)}`, 'anexo')
    case 'checklist.criado': return f(`criou o checklist ${aspas((d as MapaDadosAtividade['checklist.criado']).titulo)}`, 'checklist')
    case 'checklist.removido': return f(`apagou o checklist ${aspas((d as MapaDadosAtividade['checklist.removido']).titulo)}`, 'checklist')
    case 'checklist.item_feito': return f(`marcou ${aspas((d as MapaDadosAtividade['checklist.item_feito']).texto)}`, 'checklist')
    case 'checklist.item_desfeito': return f(`desmarcou ${aspas((d as MapaDadosAtividade['checklist.item_desfeito']).texto)}`, 'checklist')
    case 'checklist.editado': {
      const x = d as MapaDadosAtividade['checklist.editado']
      return f(`renomeou o checklist ${aspas(x.tituloAntes)} para ${aspas(x.titulo)}`, 'checklist')
    }
    case 'checklist.item_editado': {
      const x = d as MapaDadosAtividade['checklist.item_editado']
      return f(`trocou o item ${aspas(x.textoAntes)} por ${aspas(x.texto)}`, 'checklist')
    }
    case 'checklist.item_removido': return f(`tirou o item ${aspas((d as MapaDadosAtividade['checklist.item_removido']).texto)}`, 'checklist')
    case 'tempo.lancado': {
      const x = d as MapaDadosAtividade['tempo.lancado']
      return f(x.origem === 'cronometro' ? `registrou ${formatarDuracao(x.minutos)} no cronômetro` : `lançou ${formatarDuracao(x.minutos)}`, 'tempo')
    }
    case 'cliente.criado': return f(`criou o cliente ${(d as MapaDadosAtividade['cliente.criado']).sigla}`, 'edicao')
    case 'cliente.editado': return f('editou o cliente', 'edicao')
  }
  return f('mexeu na demanda', 'edicao')
}
