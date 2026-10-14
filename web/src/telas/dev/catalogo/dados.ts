/** Dados de exemplo do catálogo /dev/ui (fictícios; nada vai ao servidor). */
import type { Cor } from '@shared/tipos/index.ts'
import type { PessoaAvatar } from '../../../ui/Avatar.tsx'
import type { PessoaMencao } from '../../../ui/EditorMarkdown.tsx'

export const PESSOAS: (PessoaAvatar & { id: string; cor: Cor })[] = [
  { id: 'u-rafa', nome: 'Rafaela Souza', apelido: 'Rafa', cor: 'rosa' },
  { id: 'u-bruno', nome: 'Bruno Lima', apelido: 'Bruno', cor: 'azul' },
  { id: 'u-cami', nome: 'Camila Duarte', apelido: 'Cami', cor: 'verde' },
  { id: 'u-diego', nome: 'Diego Martins', apelido: 'Diego', cor: 'turquesa' },
  { id: 'u-lena', nome: 'Helena Prado', apelido: 'Lena', cor: 'ambar' },
  { id: 'u-igor', nome: 'Igor Teixeira', apelido: 'Igor', cor: 'roxo' },
]

export const CLIENTES: { id: string; sigla: string; nome: string; cor: Cor }[] = [
  { id: 'c-he', sigla: 'HE', nome: 'Hospital Evangélico', cor: 'azul' },
  { id: 'c-icc', sigla: 'ICC', nome: 'Instituto do Câncer', cor: 'magenta' },
  { id: 'c-vtx', sigla: 'VTX', nome: 'Vértice Engenharia', cor: 'turquesa' },
  { id: 'c-aur', sigla: 'AUR', nome: 'Aurora Cosméticos', cor: 'ambar' },
  { id: 'c-bsm', sigla: 'BSM', nome: 'Bistrô São Marcos', cor: 'berinjela' },
]

export const ETIQUETAS: { nome: string; cor: Cor }[] = [
  { nome: 'Instagram', cor: 'magenta' },
  { nome: 'Vídeo', cor: 'roxo' },
  { nome: 'Texto', cor: 'ambar' },
  { nome: 'Site', cor: 'azul' },
  { nome: 'Impresso', cor: 'turquesa' },
  { nome: 'Urgente do cliente', cor: 'rosa' },
  { nome: '', cor: 'verde' },
]

export const MENCIONAVEIS: PessoaMencao[] = PESSOAS.map((p) => ({ id: p.id, nome: p.nome, apelido: p.apelido, cor: p.cor }))

export const pessoa = (apelido: string) => PESSOAS.find((p) => p.apelido === apelido)!
export const cliente = (sigla: string) => CLIENTES.find((c) => c.sigla === sigla)!
export const etiqueta = (nome: string) => ETIQUETAS.find((e) => e.nome === nome)!
