/**
 * Fonte "Demandas" da paleta (F4): GET /api/busca ("#12" ou "12" pelo número, "he outubro" filtra o cliente, o resto
 * por palavras sem acento). Cada resultado abre /d/:numero; o detalhe diz o cliente e onde está. Sem nenhuma demanda,
 * e sem nada no resto da paleta, mostra o texto da busca vazia (PLANO §4.1).
 */
import { CircleCheck, Archive, FileText, SearchX } from 'lucide-react'
import type { Bootstrap, ResultadoBuscaDemanda } from '@shared/tipos/index.ts'
import { normalizarAlias } from '@shared/logica/texto.ts'
import type { FontePaleta, ResultadoPaleta } from '../tipos.ts'
import { bootstrapAtual, clientePadrao } from '../../api/cache.ts'
import { buscarDemandas } from '../../funcionalidades/entrada/api.ts'

function lugar(b: Bootstrap | undefined, d: ResultadoBuscaDemanda): string {
  const partes: string[] = []
  const cliente = b?.clientes.find((c) => c.id === d.clienteId)
  if (cliente) partes.push(cliente.sigla)
  const quadro = b?.quadros.find((q) => q.id === d.quadroId)
  const coluna = b?.colunas.find((c) => c.id === d.colunaId)
  if (quadro) partes.push(coluna ? `${quadro.nome} › ${coluna.nome}` : quadro.nome)
  if (d.arquivado) partes.push('arquivada')
  else if (d.concluida) partes.push('concluída')
  return partes.join(' · ')
}

/** Algo no resto da paleta casa o termo (quadros, clientes, pessoas)? Então a busca vazia não precisa de aviso. */
function outrasFontesTem(b: Bootstrap | undefined, termo: string): boolean {
  if (!b) return false
  const palavras = normalizarAlias(termo).split(' ').filter(Boolean)
  const casa = (...t: (string | null | undefined)[]) => { const alvo = normalizarAlias(t.filter(Boolean).join(' ')); return palavras.every((p) => alvo.includes(p)) }
  return b.quadros.some((q) => casa(q.nome)) || b.clientes.some((c) => casa(c.sigla, c.nome, ...c.apelidos))
    || b.usuarios.some((u) => casa(u.nome, u.apelido))
}

export const fonte: FontePaleta = {
  id: 'entrada-demandas',
  secao: 'Demandas',
  ordem: 200,
  minimo: 1,
  async buscar(termo, sinal) {
    const qc = clientePadrao()
    if (!qc) return []
    const { demandas } = await buscarDemandas(qc, termo, sinal)
    const b = bootstrapAtual()
    const itens: ResultadoPaleta[] = demandas.map((d) => ({
      id: d.id,
      rotulo: `#${d.numero} ${d.titulo}`,
      detalhe: [lugar(b, d), d.trecho].filter(Boolean).join(' · '),
      icone: d.arquivado ? Archive : d.concluida ? CircleCheck : FileText,
      caminho: `/d/${d.numero}`,
    }))
    if (itens.length === 0 && termo.trim().length >= 2 && !outrasFontesTem(b, termo)) {
      return [{ id: 'entrada-busca-vazia', rotulo: `Nada encontrado para "${termo.trim()}".`, detalhe: 'Tente a sigla do cliente ou o número.', icone: SearchX }]
    }
    return itens
  },
}
