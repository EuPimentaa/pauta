/**
 * Seed de demonstração (PLANO §1.1.3), só para desenvolvimento:
 *   npm run seed:demo --workspace server            (banco vazio de quadros e demandas)
 *   npm run seed:demo --workspace server -- --limpar (apaga DATA_DIR/demandas.db e os uploads antes; pare o servidor)
 *
 * Cria as pessoas, os 8 clientes e os 6 quadros (como nos Primeiros passos, com as automações do modelo) e chama o
 * `semear(ctx)` de cada scripts/demo/*.ts, cada um numa transação: o do núcleo primeiro (as demandas), depois os
 * outros em ordem alfabética (as funcionalidades acrescentam os delas).
 *
 * Ambiente: DATA_DIR; SEGREDO (o mesmo do servidor: o token dos links públicos vai cifrado com ele); ADMIN_EMAIL e
 * ADMIN_SENHA (o admin; se o primeiro boot já o criou, é reaproveitado); SEED_SENHA (das outras pessoas; padrão:
 * ADMIN_SENHA); SEED_DEMANDAS (cards da Criação; padrão 300). As outras pessoas entram com <chave>@pauta.test.
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type {
  Cliente, Cor, FundoQuadro, Id, Papel, QuadroCompleto, Usuario,
} from '../../shared/tipos/index.ts'
import { ehSenhaFraca } from '../../shared/logica/senha.ts'
import { atorDe, hashSenha, type Ator } from '../src/auth.ts'
import { config } from '../src/config.ts'
import { abrir, agora, migrar, novoId, rodar, todos, tx, um, type Db } from '../src/db.ts'
import { gravarAutomacao } from '../src/servicos/automacoes.ts'
import { carregarCliente, criarCliente, criarContato, definirResponsaveis } from '../src/servicos/clientes.ts'
import { criarColuna } from '../src/servicos/colunas.ts'
import { criarEtiqueta } from '../src/servicos/etiquetas.ts'
import { carregarUsuario, criarPessoa } from '../src/servicos/pessoas.ts'
import { criarQuadro, quadroCompleto } from '../src/servicos/quadros.ts'

// ─────────────────────────────── contexto dos módulos de scripts/demo ───────────────────────────────

export const PESSOAS_DEMO = ['admin', 'am', 'am2', 'design', 'design2', 'design3', 'social', 'social2', 'web', 'trafego', 'producao'] as const
export type PessoaDemo = (typeof PESSOAS_DEMO)[number]
export const QUADROS_DEMO = ['atendimento', 'criacao', 'social', 'web', 'trafego', 'producao'] as const
export type QuadroDemo = (typeof QUADROS_DEMO)[number]

/** O que cada scripts/demo/*.ts recebe em `semear(ctx)`. Clientes pela sigla em minúsculo (`ctx.clientes.cla`). */
export interface ContextoDemo {
  db: Db
  pessoas: Record<PessoaDemo, Usuario>
  clientes: Record<string, Cliente>
  quadros: Record<QuadroDemo, QuadroCompleto>
  /** Quantos cards nascem na Criação (SEED_DEMANDAS). */
  demandasCriacao: number
}

export interface ModuloDemo {
  semear(ctx: ContextoDemo): void
}

// ─────────────────────────────── dados fixos ───────────────────────────────

interface PessoaFixa {
  nome: string
  apelido: string
  papel: Papel
  cor: Cor
  equipe: Id | null
  funcao: string | null
}

const PESSOAS: Record<Exclude<PessoaDemo, 'admin'>, PessoaFixa> = {
  am: { nome: 'Priscila Souza', apelido: 'Pri', papel: 'atendimento', cor: 'ambar', equipe: 'eq-atendimento', funcao: 'atendimento' },
  am2: { nome: 'Gabriela Rocha', apelido: 'Gabi', papel: 'atendimento', cor: 'amarelo', equipe: 'eq-atendimento', funcao: 'atendimento' },
  design: { nome: 'Rafael Lima', apelido: 'Rafa', papel: 'equipe', cor: 'rosa', equipe: 'eq-criacao', funcao: 'design' },
  design2: { nome: 'Beatriz Nunes', apelido: 'Bia', papel: 'equipe', cor: 'magenta', equipe: 'eq-criacao', funcao: 'design' },
  design3: { nome: 'Leonardo Martins', apelido: 'Léo', papel: 'equipe', cor: 'turquesa', equipe: 'eq-criacao', funcao: 'design' },
  social: { nome: 'Caio Dias', apelido: 'Caio', papel: 'equipe', cor: 'roxo', equipe: 'eq-social', funcao: 'social' },
  social2: { nome: 'Eduarda Reis', apelido: 'Duda', papel: 'equipe', cor: 'berinjela', equipe: 'eq-social', funcao: 'social' },
  web: { nome: 'Igor Alves', apelido: 'Igor', papel: 'equipe', cor: 'azul', equipe: 'eq-web', funcao: 'dev' },
  trafego: { nome: 'Nina Prado', apelido: 'Nina', papel: 'equipe', cor: 'verde', equipe: 'eq-trafego', funcao: 'tráfego' },
  producao: { nome: 'Theo Ramos', apelido: 'Theo', papel: 'equipe', cor: 'grafite', equipe: 'eq-producao', funcao: 'vídeo' },
}

/** Clientes fictícios (sigla, nome, cor, apelidos, contato padrão). AM e responsáveis são distribuídos em rodízio. */
const CLIENTES: { sigla: string; nome: string; cor: Cor; apelidos: string[]; contato: string; cargo: string }[] = [
  { sigla: 'CLA', nome: 'Clínica Aurora', cor: 'verde', apelidos: ['aurora', 'clinica aurora'], contato: 'Fernanda Luz', cargo: 'Marketing' },
  { sigla: 'PTB', nome: 'Padaria Trigo Bom', cor: 'ambar', apelidos: ['trigo bom', 'padaria'], contato: 'Seu Antônio', cargo: 'Dono' },
  { sigla: 'CHZ', nome: 'Construtora Horizonte', cor: 'azul', apelidos: ['horizonte'], contato: 'Marcos Teixeira', cargo: 'Comercial' },
  { sigla: 'EPP', nome: 'Escola Pequenos Passos', cor: 'amarelo', apelidos: ['pequenos passos', 'escola'], contato: 'Helena Prado', cargo: 'Direção' },
  { sigla: 'IVI', nome: 'Instituto Viver', cor: 'roxo', apelidos: ['viver'], contato: 'Carla Menezes', cargo: 'Comunicação' },
  { sigla: 'CSV', nome: 'Café Serra Verde', cor: 'turquesa', apelidos: ['serra verde', 'cafe'], contato: 'João Pedro', cargo: 'Sócio' },
  { sigla: 'OVC', nome: 'Ótica Visão Clara', cor: 'magenta', apelidos: ['visao clara', 'otica'], contato: 'Luíza Campos', cargo: 'Gerente' },
  { sigla: 'ACM', nome: 'Academia Movimento', cor: 'rosa', apelidos: ['movimento', 'academia'], contato: 'Diego Fontes', cargo: 'Marketing' },
]

const MODELO_KANBAN = 'mq-kanban'
const MODELO_POR_PESSOA = 'mq-por-pessoa'

// ─────────────────────────────── base: pessoas, clientes e quadros ───────────────────────────────

export interface OpcoesSeed {
  emailAdmin: string | null
  senhaAdmin: string | null
  senhaPessoas: string
  demandasCriacao?: number
  /** Pasta dos módulos (padrão: scripts/demo). */
  pastaDemo?: string
}

export interface ResumoSeed {
  pessoas: number
  clientes: number
  quadros: number
  colunas: number
  demandas: number
  modulos: string[]
  emails: string[]
}

function emailDe(chave: PessoaDemo): string {
  return `${chave}@pauta.test`
}

/** Admin: o do primeiro boot (pelo e-mail ou o primeiro admin ativo) ou um novo com ADMIN_EMAIL/ADMIN_SENHA. */
function garantirAdmin(db: Db, o: OpcoesSeed, hashAdmin: string | null): Usuario {
  const existente = o.emailAdmin
    ? um<{ id: string }>(db, "SELECT id FROM usuario WHERE email = ? AND papel = 'admin' AND ativo = 1", o.emailAdmin.toLowerCase())
    : um<{ id: string }>(db, "SELECT id FROM usuario WHERE papel = 'admin' AND ativo = 1 ORDER BY criado_em LIMIT 1")
  if (existente) return carregarUsuario(db, existente.id)
  if (!o.emailAdmin || !hashAdmin) throw new Error('Defina ADMIN_EMAIL e ADMIN_SENHA para o seed criar o admin.')
  if (um(db, 'SELECT 1 FROM usuario WHERE email = ?', o.emailAdmin.toLowerCase())) {
    throw new Error(`${o.emailAdmin} já existe e não é um admin ativo.`)
  }
  const id = novoId()
  const instante = agora()
  rodar(db, `INSERT INTO usuario (id, nome, apelido, email, senha_hash, senha_definida_em, papel, cor, criado_em, atualizado_em)
             VALUES (?, 'Marina Costa', 'Marina', ?, ?, ?, 'admin', 'grafite', ?, ?)`, id, o.emailAdmin.toLowerCase(), hashAdmin, instante, instante, instante)
  return carregarUsuario(db, id)
}

/** Cria a pessoa (entra na equipe pelo serviço do núcleo), define a senha e revoga o convite que o serviço gerou. */
function criarPessoaComSenha(db: Db, chave: Exclude<PessoaDemo, 'admin'>, hash: string, ator: Ator): Usuario {
  const p = PESSOAS[chave]
  const { usuario } = criarPessoa(db, {
    nome: p.nome, apelido: p.apelido, email: emailDe(chave), papel: p.papel, cor: p.cor,
    equipes: p.equipe ? [{ equipeId: p.equipe, funcao: p.funcao, principal: true }] : [],
  }, ator)
  const instante = agora()
  rodar(db, 'UPDATE usuario SET senha_hash = ?, senha_definida_em = ?, atualizado_em = ? WHERE id = ?', hash, instante, instante, usuario.id)
  rodar(db, 'UPDATE token_acesso SET revogado_em = ? WHERE usuario_id = ? AND usado_em IS NULL AND revogado_em IS NULL', instante, usuario.id)
  return carregarUsuario(db, usuario.id)
}

function coluna(q: QuadroCompleto, nome: string): Id {
  const c = q.colunas.find((x) => x.nome === nome)
  if (!c) throw new Error(`coluna ${nome} não existe em ${q.quadro.nome}`)
  return c.id
}

function montarBase(db: Db, o: OpcoesSeed, hashAdmin: string | null, hashPessoas: string): Omit<ContextoDemo, 'demandasCriacao'> {
  const admin = garantirAdmin(db, o, hashAdmin)
  const ator = atorDe(admin)
  const pessoas = { admin } as Record<PessoaDemo, Usuario>
  for (const chave of Object.keys(PESSOAS) as Exclude<PessoaDemo, 'admin'>[]) pessoas[chave] = criarPessoaComSenha(db, chave, hashPessoas, ator)

  // quadros "como nos Primeiros passos": modelo da equipe, membros seguem, automações sugeridas do modelo
  const novo = (nome: string, equipeId: Id, cor: Cor, fundo: FundoQuadro, modelo: Id) =>
    criarQuadro(db, { nome, equipeId, cor, fundo, modeloQuadroId: modelo }, ator).quadro.id
  const ids = {
    atendimento: novo('Atendimento', 'eq-atendimento', 'ambar', 'liso', MODELO_KANBAN),
    criacao: novo('Criação', 'eq-criacao', 'rosa', 'berinjela', MODELO_POR_PESSOA),
    social: novo('Social', 'eq-social', 'roxo', 'aurora', MODELO_POR_PESSOA),
    web: novo('Web', 'eq-web', 'azul', 'cobalto', MODELO_KANBAN),
    trafego: novo('Tráfego', 'eq-trafego', 'verde', 'liso', MODELO_KANBAN),
    producao: novo('Produção', 'eq-producao', 'turquesa', 'grafite', MODELO_KANBAN),
  } satisfies Record<QuadroDemo, Id>
  criarColuna(db, ids.criacao, { nome: 'Pronto', cor: 'verde' }, ator)
  criarColuna(db, ids.criacao, { nome: 'Concluído', cor: 'verde', papel: 'concluida' }, ator)
  criarColuna(db, ids.social, { nome: 'Agendado', cor: 'azul' }, ator)
  criarColuna(db, ids.social, { nome: 'Publicado', cor: 'verde', papel: 'concluida' }, ator)

  const etiquetas: [QuadroDemo, string, Cor][] = [
    ['atendimento', 'Urgente', 'rosa'], ['atendimento', 'Orçamento', 'turquesa'],
    ['criacao', 'Urgente', 'rosa'], ['criacao', 'Alteração', 'ambar'], ['criacao', 'Vídeo', 'roxo'], ['criacao', 'Campanha', 'azul'],
    ['social', 'Alteração', 'ambar'], ['social', 'Reels', 'magenta'], ['social', 'Patrocinado', 'verde'],
    ['web', 'Bug', 'rosa'], ['web', 'Melhoria', 'azul'], ['trafego', 'Meta', 'azul'], ['trafego', 'Google', 'verde'],
    ['producao', 'Vídeo', 'roxo'], ['producao', 'Foto', 'amarelo'],
  ]
  for (const [q, nome, cor] of etiquetas) criarEtiqueta(db, ids[q], { nome, cor }, ator)

  const atendimento = quadroCompleto(db, ids.atendimento)
  const criacao = quadroCompleto(db, ids.criacao)
  const social = quadroCompleto(db, ids.social)
  gravarAutomacao(db, { quadroId: ids.criacao, gatilho: 'enviado_ao_cliente', destinoColunaId: coluna(atendimento, 'Com o cliente'), ator })
  gravarAutomacao(db, { quadroId: ids.criacao, gatilho: 'ajuste_pedido', destinoColunaId: coluna(criacao, 'Fila'), ator })
  gravarAutomacao(db, { quadroId: ids.criacao, gatilho: 'aprovado', destinoColunaId: coluna(social, 'Fila'),
    membros: 'responsavel_destino', ator })
  gravarAutomacao(db, { quadroId: ids.social, gatilho: 'concluida', destinoColunaId: coluna(social, 'Publicado'), ator })

  // clientes: AM em rodízio entre os dois atendimentos; responsáveis por equipe em rodízio
  const clientes: Record<string, Cliente> = {}
  const designers = [pessoas.design, pessoas.design2, pessoas.design3]
  const sociais = [pessoas.social, pessoas.social2]
  CLIENTES.forEach((c, i) => {
    const am = i % 2 === 0 ? pessoas.am : pessoas.am2
    const comoAm = atorDe(am)
    const cliente = criarCliente(db, { sigla: c.sigla, nome: c.nome, cor: c.cor, apelidos: c.apelidos, atendimentoId: am.id }, comoAm)
    definirResponsaveis(db, cliente.id, [
      { equipeId: 'eq-criacao', usuarioId: designers[i % designers.length]!.id },
      { equipeId: 'eq-social', usuarioId: sociais[i % sociais.length]!.id },
      { equipeId: 'eq-web', usuarioId: pessoas.web.id },
      { equipeId: 'eq-trafego', usuarioId: pessoas.trafego.id },
      { equipeId: 'eq-producao', usuarioId: pessoas.producao.id },
    ], comoAm)
    criarContato(db, cliente.id, { nome: c.contato, cargo: c.cargo, aprova: true, padrao: true,
      whatsapp: `+55 41 90000-${String(1001 + i)}` }, comoAm)
    clientes[c.sigla.toLowerCase()] = carregarCliente(db, cliente.id)
  })

  const quadros = Object.fromEntries(QUADROS_DEMO.map((q) => [q, quadroCompleto(db, ids[q])])) as Record<QuadroDemo, QuadroCompleto>
  return { db, pessoas, clientes, quadros }
}

// ─────────────────────────────── módulos e verificação ───────────────────────────────

const PASTA_DEMO = join(dirname(fileURLToPath(import.meta.url)), 'demo')

/** scripts/demo/*.ts: o do núcleo primeiro, os outros em ordem alfabética. */
export async function carregarModulosDemo(pasta = PASTA_DEMO): Promise<{ nome: string; modulo: ModuloDemo }[]> {
  const nomes = readdirSync(pasta).filter((n) => n.endsWith('.ts')).sort((a, b) =>
    Number(!a.startsWith('nucleo')) - Number(!b.startsWith('nucleo')) || a.localeCompare(b))
  const modulos: { nome: string; modulo: ModuloDemo }[] = []
  for (const nome of nomes) {
    const modulo = (await import(pathToFileURL(join(pasta, nome)).href)) as Partial<ModuloDemo>
    if (typeof modulo.semear !== 'function') throw new Error(`scripts/demo/${nome} não exporta semear(ctx)`)
    modulos.push({ nome, modulo: modulo as ModuloDemo })
  }
  return modulos
}

/** Colunas ativas (de quadros ativos) sem nenhum card visível no quadro. O seed deixa esta lista vazia. */
export function colunasVazias(db: Db): { quadro: string; coluna: string }[] {
  const limite = um<{ valor: string }>(db, "SELECT valor FROM configuracao WHERE chave = 'quadro.concluidas_dias'")
  const dias = limite ? Number(JSON.parse(limite.valor)) : 7
  const desde = new Date(Date.parse(agora()) - dias * 86_400_000).toISOString()
  return todos<{ quadro: string; coluna: string }>(db, `
    SELECT q.nome AS quadro, c.nome AS coluna FROM coluna c JOIN quadro q ON q.id = c.quadro_id
     WHERE c.arquivada_em IS NULL AND q.arquivado_em IS NULL AND NOT EXISTS (
       SELECT 1 FROM demanda d WHERE d.coluna_id = c.id AND d.arquivado_em IS NULL AND d.excluido_em IS NULL
         AND (d.concluida_em IS NULL OR d.concluida_em > ?))
     ORDER BY q.pos, c.pos`, desde)
}

/** Semeia um banco já migrado, sem quadros nem demandas. Cada módulo de scripts/demo roda numa transação. */
export async function semearDemo(db: Db, o: OpcoesSeed): Promise<ResumoSeed> {
  if (um(db, 'SELECT 1 FROM quadro LIMIT 1') || um(db, 'SELECT 1 FROM demanda LIMIT 1')) {
    throw new Error('O banco já tem quadros ou demandas. Rode com --limpar para começar do zero.')
  }
  if (ehSenhaFraca(o.senhaPessoas)) throw new Error('SEED_SENHA (ou ADMIN_SENHA) fraca: use 10 ou mais caracteres e nada óbvio.')
  const hashPessoas = await hashSenha(o.senhaPessoas)
  const hashAdmin = o.senhaAdmin ? await hashSenha(o.senhaAdmin) : null
  const base = tx(db, () => montarBase(db, o, hashAdmin, hashPessoas))
  const ctx: ContextoDemo = { ...base, demandasCriacao: o.demandasCriacao ?? 300 }
  const modulos = await carregarModulosDemo(o.pastaDemo)
  for (const { modulo } of modulos) tx(db, () => modulo.semear(ctx))
  const conta = (sql: string) => Number(um<{ n: number }>(db, sql)!.n)
  return {
    pessoas: conta('SELECT count(*) AS n FROM usuario'),
    clientes: conta('SELECT count(*) AS n FROM cliente'),
    quadros: conta('SELECT count(*) AS n FROM quadro'),
    colunas: conta('SELECT count(*) AS n FROM coluna WHERE arquivada_em IS NULL'),
    demandas: conta('SELECT count(*) AS n FROM demanda'),
    modulos: modulos.map((m) => m.nome),
    emails: PESSOAS_DEMO.map((p) => ctx.pessoas[p].email),
  }
}

// ─────────────────────────────── linha de comando ───────────────────────────────

function inteiroPositivo(valor: string | undefined, padrao: number): number {
  if (!valor) return padrao
  const n = Number(valor)
  if (!Number.isInteger(n) || n < 1 || n > 20_000) throw new Error(`SEED_DEMANDAS inválido: ${valor}`)
  return n
}

async function principal(): Promise<void> {
  if (config.producao) throw new Error('O seed de demonstração é só para desenvolvimento (NODE_ENV=production).')
  const senhaPessoas = process.env.SEED_SENHA || config.adminSenha
  if (!senhaPessoas) throw new Error('Defina SEED_SENHA (ou ADMIN_SENHA) para as pessoas da demonstração.')
  if (!process.env.SEGREDO) console.warn('Sem SEGREDO: os links públicos do seed só abrem nesta execução. Use o mesmo SEGREDO do servidor.')
  mkdirSync(config.dataDir, { recursive: true })
  const arquivo = join(config.dataDir, 'demandas.db')
  if (process.argv.includes('--limpar')) {
    for (const extra of ['', '-wal', '-shm']) rmSync(`${arquivo}${extra}`, { force: true })
    rmSync(join(config.dataDir, 'uploads'), { recursive: true, force: true })
  }
  const db = abrir(arquivo)
  try {
    migrar(db)
    const inicio = performance.now()
    const r = await semearDemo(db, {
      emailAdmin: config.adminEmail, senhaAdmin: config.adminSenha, senhaPessoas,
      demandasCriacao: inteiroPositivo(process.env.SEED_DEMANDAS, 300),
    })
    console.log(`Seed pronto em ${Math.round(performance.now() - inicio)} ms (${arquivo}):`)
    console.log(`  ${r.pessoas} pessoas, ${r.clientes} clientes, ${r.quadros} quadros, ${r.colunas} colunas, ${r.demandas} demandas`)
    console.log(`  módulos: ${r.modulos.join(', ')}`)
    console.log(`  entre com ${r.emails.join(', ')}`)
    console.log(`  senha do admin: a de ADMIN_SENHA; das outras pessoas: a de SEED_SENHA (ou ADMIN_SENHA)`)
    const vazias = colunasVazias(db)
    if (vazias.length) console.warn(`  colunas sem card: ${vazias.map((v) => `${v.quadro} › ${v.coluna}`).join(', ')}`)
  } finally {
    db.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(PASTA_DEMO)) throw new Error(`Pasta ${PASTA_DEMO} não encontrada.`)
  principal().catch((e: unknown) => {
    console.error((e as Error).message)
    process.exit(1)
  })
}
