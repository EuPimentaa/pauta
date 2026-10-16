/**
 * Menu lateral, grupo `agencia` (PLANO §4): Clientes 100, Arquivo 200, Configurações 300. O número em Clientes é o
 * de cadastros que eu posso completar (atendimento: os da carteira e os sem AM; admin: todos), como no "Completar
 * cadastro" da lista.
 */
import { useCallback } from 'react'
import { Archive, Building2, Settings } from 'lucide-react'
import type { Bootstrap } from '@shared/tipos/index.ts'
import { pode } from '@shared/logica/permissoes.ts'
import { useDoBootstrap } from '../../api/seletores.ts'
import type { ExtensaoMenu, ItemMenu } from '../tipos.ts'

function useItens(): ItemMenu[] {
  const contar = useCallback((b: Bootstrap) => {
    const eu = { id: b.eu.usuario.id, papel: b.eu.usuario.papel }
    if (eu.papel === 'equipe') return 0
    return b.clientes.filter((c) => c.status !== 'ex' && c.pendencias.length > 0 && pode('cliente.editar', eu, { cliente: c })).length
  }, [])
  const pendentes = useDoBootstrap(contar) ?? 0
  return [
    { id: 'cadastros-clientes', rotulo: 'Clientes', icone: Building2, caminho: '/clientes', contador: pendentes, ordem: 100 },
    { id: 'cadastros-arquivo', rotulo: 'Arquivo', icone: Archive, caminho: '/arquivo', ordem: 200 },
    { id: 'cadastros-config', rotulo: 'Configurações', icone: Settings, caminho: '/config', ordem: 300 },
  ]
}

export const menu: ExtensaoMenu = { id: 'cadastros', grupo: 'agencia', ordem: 100, useItens }
