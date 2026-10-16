/**
 * Criação rápida no rodapé da coluna (F4): "+ Adicionar demanda" e a tecla N do núcleo abrem; Enter cria e o campo
 * fica aberto. O componente baixa sob demanda (a coluna desenha em Suspense).
 */
import { lazy } from 'react'
import type { ExtensaoEntradaColuna } from '../tipos.ts'

export const entrada: ExtensaoEntradaColuna = {
  id: 'entrada-rapida',
  ordem: 100,
  Componente: lazy(() => import('../../funcionalidades/entrada/CriacaoRapida.tsx')),
}
