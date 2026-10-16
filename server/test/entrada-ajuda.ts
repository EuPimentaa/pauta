/**
 * Ajuda dos testes da Entrada (F4): pessoas com apelido para o `@` ("Rafa" e "Ana" na Criação) e demandas em massa
 * por SQL (a busca com 5 mil).
 */
import type { Usuario } from '../../shared/tipos/index.ts'
import { agora, novoId, rodar, tx, type Db } from '../src/db.ts'
import { carregarUsuario } from '../src/servicos/pessoas.ts'
import type { Ambiente } from './ajuda.ts'

/** Pessoa ativa com apelido (equipe Criação por padrão). */
export function criarPessoa(a: Ambiente, p: { nome: string; apelido: string | null; papel?: Usuario['papel']; equipe?: string | null; ativo?: boolean }): Usuario {
  const id = novoId()
  tx(a.db, () => {
    rodar(a.db, `INSERT INTO usuario (id, nome, apelido, email, papel, cor, ativo, criado_em, atualizado_em)
                 VALUES (?, ?, ?, ?, ?, 'verde', ?, ?, ?)`,
      id, p.nome, p.apelido, `${id.slice(0, 8)}@melt.test`, p.papel ?? 'equipe', p.ativo === false ? 0 : 1, agora(), agora())
    const equipe = p.equipe === undefined ? 'eq-criacao' : p.equipe
    if (equipe) rodar(a.db, 'INSERT INTO equipe_membro (equipe_id, usuario_id, principal) VALUES (?, ?, 0)', equipe, id)
  })
  return carregarUsuario(a.db, id)
}

/** Rafa e Ana (apelidos) para os testes de `@`. */
export function rafaEAna(a: Ambiente): { rafa: Usuario; ana: Usuario } {
  return { rafa: criarPessoa(a, { nome: 'Rafael Costa', apelido: 'Rafa' }), ana: criarPessoa(a, { nome: 'Ana Beatriz', apelido: 'Ana' }) }
}

/**
 * `n` demandas por INSERT direto (sem eventos nem atividade), na coluna e com o título de `titulo(i)`. Os gatilhos
 * mantêm o FTS. Devolve o primeiro número usado.
 */
export function demandasEmMassa(db: Db, p: { n: number; quadroId: string; colunaId: string; criadoPor: string;
  titulo(i: number): string; descricao?(i: number): string; clienteId?(i: number): string | null }): number {
  const inicio = Number((db.prepare('SELECT coalesce(max(numero), 0) AS m FROM demanda').get() as { m: number }).m) + 1
  tx(db, () => {
    const ins = db.prepare(`INSERT INTO demanda (id, numero, quadro_id, coluna_id, posicao, titulo, descricao_md, cliente_id, status_desde,
      criado_por, atualizado_por, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const t = agora()
    for (let i = 0; i < p.n; i++) {
      ins.run(novoId(), inicio + i, p.quadroId, p.colunaId, (i + 1) * 1024, p.titulo(i), p.descricao?.(i) ?? '', p.clienteId?.(i) ?? null,
        t, p.criadoPor, p.criadoPor, t, t)
    }
  })
  return inicio
}
