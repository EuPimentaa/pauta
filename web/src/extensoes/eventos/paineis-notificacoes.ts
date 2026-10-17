/** Tempo real do sino (F3): a lista e a contagem de não lidas, e as menções do Início (funcionalidades/paineis/cache.ts). */
import type { TratadorEventos } from '../tipos.ts'
import { tratarNotificacao } from '../../funcionalidades/paineis/cache.ts'

export const tratador: TratadorEventos = { id: 'paineis-notificacoes', entidades: ['notificacao'], tratar: tratarNotificacao }
