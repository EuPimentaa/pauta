/**
 * Contrato compartilhado entre server e web. Só reexporta.
 * Dono: arquiteto (agora) → NÚCLEO-SERVIDOR (Onda 1). Funcionalidades da Onda 3 NÃO editam estes arquivos:
 * tipos novos vão em shared/tipos/ext/<funcionalidade>.ts e são importados direto de lá (ver docs/PLANO.md).
 */
export * from './nucleo.ts'
export * from './pessoas.ts'
export * from './clientes.ts'
export * from './quadros.ts'
export * from './modelos.ts'
export * from './config.ts'
export * from './arquivos.ts'
export * from './demandas.ts'
export * from './ciclo.ts'
export * from './publico.ts'
export * from './paineis.ts'
export * from './notificacoes.ts'
export * from './horas.ts'
export * from './tempo-real.ts'
// Fase 2 (docs/FASE2.md; contrato em docs/API.md §F e docs/FASE2-PLANO.md)
export * from './mcp.ts'
export * from './resultados.ts'
export * from './agenda-externa.ts'
