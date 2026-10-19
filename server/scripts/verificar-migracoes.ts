/**
 * Aplica server/migracoes/*.sql num banco :memory: (ou no arquivo passado como argumento, que precisa ser novo),
 * do mesmo jeito que o runner do servidor: cada arquivo numa transação, registrado em _migracoes.
 * Depois roda PRAGMA foreign_key_check e integrity_check, confere que as listas fechadas de shared/tipos são as
 * mesmas dos CHECK do banco, confere os seeds de configuração e faz um teste de fumaça dos gatilhos e das
 * restrições dentro de uma transação desfeita no fim. Fase 2 (100–103): OAuth, "via Claude", Windsor e agendas externas.
 *
 *   node server/scripts/verificar-migracoes.ts            # :memory:
 *   node server/scripts/verificar-migracoes.ts /tmp/x.db  # arquivo novo, para inspecionar depois
 */
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ATORES_ATIVIDADE, CANAIS, CHAVES_CONFIG, CONECTORES_WINDSOR, DECISOES_AUTORIZACAO, ERROS_AGENDA_EXTERNA, ERROS_WINDSOR,
  ESCOPO_MCP, MOTIVOS_REVOGACAO_CONEXAO, PREFIXO_TRACE_MCP, TIPOS_CLIENTE_OAUTH, TIPOS_TOKEN_OAUTH, CORES, FAIXAS_CONFIG, FINALIDADES_ANEXO, FUNDOS_QUADRO, GATILHOS_AUTOMACAO,
  MEMBROS_AO_MOVER, MIMES_PERMITIDOS, MOTIVOS_RODADA, ORIGENS_APONTAMENTO, ORIGENS_DEMANDA, ORIGENS_RODADA, PAPEIS,
  PAPEIS_COLUNA,
  PRIORIDADES, PROVEDORES, PUBLICOS_EVENTO, REPETICOES, STATUS_CLIENTE, TIPOS_FERIADO, TIPOS_LINK_CLIENTE,
  TIPOS_NOTIFICACAO,
} from '../../shared/tipos/index.ts'

type Linha = Record<string, unknown>

const PASTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'migracoes')
const destino = process.argv[2] ?? ':memory:'
if (destino !== ':memory:' && existsSync(destino)) {
  console.error(`O arquivo ${destino} já existe. Passe um caminho novo.`)
  process.exit(2)
}

let falhas = 0
let checagens = 0
function conferir(condicao: unknown, mensagem: string): void {
  checagens++
  if (!condicao) {
    falhas++
    console.error(`  ✗ ${mensagem}`)
  }
}
function deveFalhar(db: DatabaseSync, sql: string, params: unknown[], trecho: string, mensagem: string): void {
  checagens++
  db.exec('SAVEPOINT sp')
  try {
    db.prepare(sql).run(...(params as never[]))
    falhas++
    console.error(`  ✗ ${mensagem}: deveria falhar com "${trecho}"`)
  } catch (e) {
    const texto = String((e as Error).message)
    if (!texto.includes(trecho)) {
      falhas++
      console.error(`  ✗ ${mensagem}: falhou com outra mensagem: ${texto}`)
    }
  } finally {
    db.exec('ROLLBACK TO sp')
    db.exec('RELEASE sp')
  }
}
const um = (db: DatabaseSync, sql: string, ...p: unknown[]) => db.prepare(sql).get(...(p as never[])) as Linha | undefined
const todos = (db: DatabaseSync, sql: string, ...p: unknown[]) => db.prepare(sql).all(...(p as never[])) as Linha[]
const rodar = (db: DatabaseSync, sql: string, ...p: unknown[]) => db.prepare(sql).run(...(p as never[]))

// ─────────────────────────── 1. aplicar ───────────────────────────
const db = new DatabaseSync(destino)
db.exec('PRAGMA foreign_keys = ON')
db.exec('PRAGMA journal_mode = WAL')
db.exec('CREATE TABLE IF NOT EXISTS _migracoes (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL) STRICT')

const arquivos = readdirSync(PASTA).filter((n) => /^\d{3}_[a-z0-9_]+\.sql$/.test(n)).sort()
conferir(arquivos.length >= 2, 'há pelo menos 001 e 002')
const numeros = arquivos.map((n) => n.slice(0, 3))
conferir(new Set(numeros).size === numeros.length, 'números de migração únicos')

for (const nome of arquivos) {
  const sql = readFileSync(join(PASTA, nome), 'utf8')
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(sql)
    rodar(db, 'INSERT INTO _migracoes (nome, aplicada_em) VALUES (?, ?)', nome, new Date().toISOString())
    db.exec('COMMIT')
    console.log(`aplicada ${nome}`)
  } catch (e) {
    db.exec('ROLLBACK')
    console.error(`falhou ${nome}: ${(e as Error).message}`)
    process.exit(1)
  }
}

// ─────────────────────────── 2. integridade do SQLite ───────────────────────────
function integridade(rotulo: string): void {
  const fk = todos(db, 'PRAGMA foreign_key_check')
  conferir(fk.length === 0, `${rotulo}: foreign_key_check sem violações (${JSON.stringify(fk.slice(0, 5))})`)
  const ic = todos(db, 'PRAGMA integrity_check')
  conferir(ic.length === 1 && ic[0]!.integrity_check === 'ok', `${rotulo}: integrity_check ok (${JSON.stringify(ic)})`)
  try {
    db.exec("INSERT INTO demanda_fts (demanda_fts) VALUES ('integrity-check')")
    conferir(true, '')
  } catch (e) {
    conferir(false, `${rotulo}: FTS integrity-check: ${(e as Error).message}`)
  }
}
integridade('após migrar')

// ─────────────────────────── 3. sem resto do fluxo único ───────────────────────────
const tabelasBanco = todos(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name as string)
for (const velha of ['fluxo', 'etapa', 'transicao', 'visao', 'ausencia', 'aviso', 'tipo_peca', 'tipo_peca_campo',
  'demanda_etapa_hist']) {
  conferir(!tabelasBanco.includes(velha), `a tabela ${velha} (fluxo único) não existe mais`)
}
for (const nova of ['quadro', 'quadro_usuario', 'coluna', 'etiqueta', 'demanda_etiqueta', 'demanda_membro',
  'demanda_movimento', 'modelo_quadro', 'modelo_quadro_coluna', 'modelo_quadro_automacao', 'modelo_demanda',
  'modelo_demanda_item', 'modelo_demanda_etiqueta', 'automacao_quadro', 'cliente_responsavel', 'apontamento']) {
  conferir(tabelasBanco.includes(nova), `tabela ${nova} existe`)
}
const colunasDe = (t: string) => todos(db, `PRAGMA table_info(${t})`).map((c) => c.name as string)
const colunasDemanda = colunasDe('demanda')
for (const velha of ['etapa_id', 'status', 'bola', 'responsavel_id', 'tipo_peca_id', 'equipe_id', 'briefing_campos']) {
  conferir(!colunasDemanda.includes(velha), `demanda sem a coluna ${velha}`)
}
for (const [t, c] of [['demanda', 'retorno_em'], ['coluna', 'responsavel_id'], ['quadro', 'coluna_por_membro'],
  ['envio', 'quadro_id'], ['automacao_quadro', 'membros']] as const) {
  conferir(colunasDe(t).includes(c), `${t}.${c} existe (modelo de quadros, revisão 2)`)
}
conferir(todos(db, 'PRAGMA table_info(apontamento)').find((c) => c.name === 'demanda_id')?.notnull === 1,
  'apontamento sempre numa demanda (demanda_id NOT NULL)')
const TABELAS_FASE2 = ['oauth_cliente', 'oauth_concessao', 'oauth_pedido', 'oauth_token', 'mcp_traco', 'windsor_conta',
  'cliente_conta_resultados', 'resultado_cache', 'windsor_uso', 'agenda_externa', 'agenda_ocorrencia',
  // 120 (F8): o cache da carteira e quando a lista de contas de cada conector foi buscada
  'resultado_panorama_cache', 'windsor_lista']
for (const nova of TABELAS_FASE2) conferir(tabelasBanco.includes(nova), `tabela ${nova} existe (Fase 2)`)
conferir(!colunasDe('atividade').includes('via') && !colunasDe('sessao').includes('concessao_id'),
  'Fase 2 não mexe em atividade nem em sessao (via Claude = mcp_traco; conexões fora de sessao)')

// ─────────────────────────── 4. listas fechadas: shared/tipos = CHECK do banco ───────────────────────────
function listaDoCheck(tabela: string, coluna: string): string[] | null {
  const sql = String(um(db, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", tabela)?.sql ?? '')
  const m = new RegExp(`(?<![a-z_])${coluna} IN\\s*\\(([^)]*)\\)`).exec(sql)
  if (!m) return null
  return m[1]!.split(',').map((v) => v.trim().replace(/^'|'$/g, ''))
}
function mesmaLista(tabela: string, coluna: string, esperado: readonly string[]): void {
  const lista = listaDoCheck(tabela, coluna)
  conferir(lista !== null && JSON.stringify([...lista].sort()) === JSON.stringify([...esperado].sort()),
    `${tabela}.${coluna} = shared/tipos (${JSON.stringify(lista)} x ${JSON.stringify(esperado)})`)
}
mesmaLista('usuario', 'papel', PAPEIS)
for (const [t, c] of [['usuario', 'cor'], ['equipe', 'cor'], ['quadro', 'cor'], ['coluna', 'cor'], ['etiqueta', 'cor'],
  ['cliente', 'cor'], ['demanda', 'capa_cor'], ['modelo_quadro_coluna', 'cor'], ['modelo_demanda_etiqueta', 'cor']] as const) {
  mesmaLista(t, c, CORES)
}
for (const t of ['coluna', 'modelo_quadro_coluna', 'demanda_movimento']) mesmaLista(t, 'papel', PAPEIS_COLUNA)
mesmaLista('quadro', 'fundo', FUNDOS_QUADRO)
mesmaLista('demanda', 'prioridade', PRIORIDADES)
mesmaLista('modelo_demanda', 'prioridade', PRIORIDADES)
mesmaLista('demanda', 'repetir', REPETICOES)
mesmaLista('demanda', 'origem', ORIGENS_DEMANDA)
mesmaLista('automacao_quadro', 'gatilho', GATILHOS_AUTOMACAO)
mesmaLista('modelo_quadro_automacao', 'gatilho', GATILHOS_AUTOMACAO)
mesmaLista('automacao_quadro', 'membros', MEMBROS_AO_MOVER)
mesmaLista('notificacao', 'tipo', TIPOS_NOTIFICACAO)
mesmaLista('evento', 'publico', PUBLICOS_EVENTO)
mesmaLista('atividade', 'ator_tipo', ATORES_ATIVIDADE)
mesmaLista('apontamento', 'origem', ORIGENS_APONTAMENTO)
mesmaLista('rodada', 'origem', ORIGENS_RODADA)
mesmaLista('rodada', 'motivo', MOTIVOS_RODADA)
mesmaLista('aprovacao', 'motivo', MOTIVOS_RODADA)
mesmaLista('envio', 'canal', CANAIS)
mesmaLista('aprovacao', 'canal', CANAIS)
mesmaLista('versao_item', 'provedor', PROVEDORES)
mesmaLista('anexo', 'provedor', PROVEDORES)
mesmaLista('anexo', 'finalidade', FINALIDADES_ANEXO)
mesmaLista('cliente', 'status', STATUS_CLIENTE)
mesmaLista('cliente_link', 'tipo', TIPOS_LINK_CLIENTE)
mesmaLista('feriado', 'tipo', TIPOS_FERIADO)
mesmaLista('arquivo', 'mime', MIMES_PERMITIDOS)
// Fase 2
mesmaLista('oauth_cliente', 'tipo', TIPOS_CLIENTE_OAUTH)
mesmaLista('oauth_cliente', 'metodo_auth', ['none'])
mesmaLista('oauth_pedido', 'decisao', DECISOES_AUTORIZACAO)
mesmaLista('oauth_concessao', 'escopo', [ESCOPO_MCP])
mesmaLista('oauth_concessao', 'motivo_revogacao', MOTIVOS_REVOGACAO_CONEXAO)
mesmaLista('oauth_token', 'tipo', TIPOS_TOKEN_OAUTH)
for (const t of ['windsor_conta', 'cliente_conta_resultados', 'resultado_cache', 'resultado_panorama_cache', 'windsor_lista']) {
  mesmaLista(t, 'conector', CONECTORES_WINDSOR)
}
for (const t of ['resultado_cache', 'resultado_panorama_cache', 'windsor_lista']) mesmaLista(t, 'erro', ERROS_WINDSOR)
mesmaLista('windsor_lista', 'origem', ['ds_accounts', 'dados'])
mesmaLista('windsor_uso', 'ultimo_erro', ERROS_WINDSOR)
mesmaLista('agenda_externa', 'cor', CORES)
mesmaLista('agenda_externa', 'erro', ERROS_AGENDA_EXTERNA)

// ─────────────────────────── 5. seeds de configuração ───────────────────────────
for (const t of ['usuario', 'cliente', 'demanda', 'sessao', 'quadro', 'coluna', 'etiqueta', 'quadro_usuario',
  'automacao_quadro', 'cliente_responsavel', 'apontamento', ...TABELAS_FASE2]) {
  conferir(um(db, `SELECT count(*) n FROM ${t}`)!.n === 0, `seed não cria ${t} (só configuração)`)
}

const equipes = todos(db, 'SELECT * FROM equipe ORDER BY pos')
conferir(JSON.stringify(equipes.map((e) => e.nome)) ===
  JSON.stringify(['Atendimento', 'Criação', 'Social', 'Web', 'Tráfego', 'Produção']),
  'equipes semeadas: Atendimento, Criação, Social, Web, Tráfego, Produção (ADAPTACOES, Primeiros passos)')

const modelosQ = todos(db, 'SELECT * FROM modelo_quadro ORDER BY pos')
conferir(JSON.stringify(modelosQ.map((m) => m.nome)) === JSON.stringify(['Kanban simples', 'Por pessoa', 'Semana', 'Em branco']),
  'modelos de quadro: Kanban simples, Por pessoa, Semana, Em branco')
for (const e of equipes) conferir(modelosQ.some((m) => m.id === e.modelo_quadro_id), `equipe ${e.nome} sugere um modelo existente`)
const colsModelo = (id: string) => todos(db, 'SELECT * FROM modelo_quadro_coluna WHERE modelo_id = ? ORDER BY pos', id)
const kanban = colsModelo('mq-kanban')
conferir(JSON.stringify(kanban.map((c) => c.nome)) === JSON.stringify(['A fazer', 'Fazendo', 'Revisão', 'Com o cliente', 'Concluído']),
  'Kanban simples: A fazer, Fazendo, Revisão, Com o cliente, Concluído')
conferir(kanban.find((c) => c.nome === 'Com o cliente')?.papel === 'aguardando_cliente', 'Kanban: Com o cliente é aguardando_cliente')
conferir(kanban.find((c) => c.nome === 'Concluído')?.papel === 'concluida', 'Kanban: Concluído é concluida')
conferir(kanban.every((c) => c.cor !== null), 'Kanban: todas as colunas com cor')
const porPessoa = colsModelo('mq-por-pessoa')
conferir(porPessoa.length === 2 && porPessoa[0]!.nome === 'Fila' && porPessoa[1]!.por_membro === 1,
  'Por pessoa: Fila + uma coluna por membro')
const semana = colsModelo('mq-semana')
conferir(JSON.stringify(semana.map((c) => c.nome)) === JSON.stringify(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Concluído'])
  && semana[5]!.papel === 'concluida', 'Semana: Seg…Sex + Concluído (concluida)')
conferir(colsModelo('mq-branco').length === 0, 'Em branco: sem colunas')
const autoModelo = todos(db, `SELECT a.modelo_id, a.gatilho, c.nome, c.papel, c.por_membro FROM modelo_quadro_automacao a
  JOIN modelo_quadro_coluna c ON c.id = a.destino_coluna_id ORDER BY a.modelo_id, a.gatilho`)
conferir(JSON.stringify(autoModelo.filter((a) => a.modelo_id === 'mq-kanban').map((a) => `${a.gatilho}:${a.nome}`)) ===
  JSON.stringify(['ajuste_pedido:Fazendo', 'enviado_ao_cliente:Com o cliente']),
  'Kanban simples sugere enviado → Com o cliente e ajuste → Fazendo')
conferir(autoModelo.every((a) => a.por_membro === 0), 'nenhuma automação de modelo aponta para a coluna por pessoa')

const modelosD = todos(db, 'SELECT * FROM modelo_demanda ORDER BY pos')
conferir(JSON.stringify(modelosD.map((m) => m.nome)) === JSON.stringify(['Post', 'Carrossel', 'Reels', 'Stories', 'Vídeo',
  'Site ou landing page', 'Ajuste de site', 'Relatório', 'Campanha de anúncio', 'Material gráfico', 'Outro']),
  '11 modelos de demanda globais da agência, Outro por último')
for (const m of modelosD) {
  const itens = um(db, 'SELECT count(*) n FROM modelo_demanda_item WHERE modelo_id = ?', m.id)!.n as number
  conferir(m.quadro_id === null && m.ativo === 1, `modelo ${m.nome} é global e ativo`)
  conferir(String(m.briefing_md).includes('## '), `modelo ${m.nome} tem briefing com títulos ##`)
  conferir(typeof m.icone === 'string' && m.descricao !== '', `modelo ${m.nome} tem ícone e descrição`)
  if (m.nome === 'Outro') {
    conferir(itens === 0 && m.prazo_dias_uteis === null, 'Outro sem checklist e sem prazo padrão')
  } else {
    conferir(itens >= 3, `modelo ${m.nome} com checklist padrão (${itens} itens)`)
    conferir((m.prazo_dias_uteis as number) >= 1 && (m.prazo_dias_uteis as number) <= 10, `prazo padrão de ${m.nome}`)
  }
}

const feriados = todos(db, 'SELECT * FROM feriado ORDER BY data')
for (const f of feriados) {
  const d = new Date(`${f.data}T12:00:00Z`)
  conferir(!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f.data, `data real: ${f.data}`)
}
for (const ano of ['2026', '2027']) {
  conferir(feriados.filter((f) => String(f.data).startsWith(ano) && f.tipo === 'nacional').length === 10,
    `${ano}: 10 feriados nacionais (9 fixos + Sexta-feira Santa)`)
}
// Sexta-feira Santa = Páscoa − 2 (algoritmo de Meeus/Jones/Butcher)
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(ano, mes - 1, dia))
}
const somar = (d: Date, dias: number) => new Date(d.getTime() + dias * 86400000).toISOString().slice(0, 10)
for (const ano of [2026, 2027]) {
  const p = pascoa(ano)
  conferir(feriados.some((f) => f.data === somar(p, -2)), `${ano}: Sexta-feira Santa em ${somar(p, -2)}`)
  conferir(feriados.some((f) => f.data === somar(p, -48)) && feriados.some((f) => f.data === somar(p, -47)), `${ano}: Carnaval`)
  conferir(feriados.some((f) => f.data === somar(p, 60)), `${ano}: Corpus Christi em ${somar(p, 60)}`)
}

const chavesBanco = todos(db, 'SELECT chave, valor FROM configuracao')
for (const chave of Object.values(CHAVES_CONFIG)) {
  conferir(chavesBanco.some((c) => c.chave === chave), `configuracao tem ${chave} (ConfigApp)`)
}
conferir(chavesBanco.length === Object.keys(CHAVES_CONFIG).length, 'configuracao e ConfigApp têm as mesmas chaves')
const valorConfig = (chave: string) => JSON.parse(String(chavesBanco.find((c) => c.chave === chave)?.valor ?? 'null')) as unknown
for (const [campo, [min, max]] of Object.entries(FAIXAS_CONFIG)) {
  const v = valorConfig(CHAVES_CONFIG[campo as keyof typeof CHAVES_CONFIG]) as number
  conferir(typeof v === 'number' && v >= min && v <= max, `seed de ${campo} dentro da faixa [${min}, ${max}]: ${v}`)
}
conferir(valorConfig('passos.modelos_revisados_em') === null, 'modelos ainda não revisados no seed')

const indices = todos(db, "SELECT name FROM sqlite_master WHERE type = 'index'").map((i) => i.name as string)
for (const nome of ['demanda_arquivo_ix', 'demanda_arquivo_cli_ix', 'demanda_coluna_ix', 'demanda_prazo_ix',
  'demanda_repeticao_uk', 'demanda_movimento_aberto_uk', 'etiqueta_nome_uk', 'apontamento_um_cronometro_uk',
  'token_acesso_pendente_uk', 'aprovacao_idem_uk', 'login_tentativa_email_ix', 'login_tentativa_ip_ix',
  'quadro_usuario_seguidores_ix', 'modelo_demanda_nome_uk', 'demanda_inicio_ix', 'demanda_publicacao_ix',
  'coluna_responsavel_uk', 'notificacao_atrasada_ix', 'oauth_concessao_ativa_uk', 'oauth_token_expira_ix',
  'oauth_pedido_expira_ix', 'mcp_traco_concessao_ix', 'cliente_conta_resultados_conta_ix', 'resultado_cache_tentado_ix',
  'agenda_ocorrencia_dia_ix', 'resultado_panorama_cache_tentado_ix']) conferir(indices.includes(nome), `índice ${nome}`)
const plano = (sql: string) => todos(db, `EXPLAIN QUERY PLAN ${sql}`).map((l) => String(l.detail)).join(' | ')
const planoArquivo = plano(`SELECT id FROM demanda
  WHERE excluido_em IS NULL AND (arquivado_em IS NOT NULL OR concluida_em IS NOT NULL)
    AND coalesce(arquivado_em, concluida_em) >= '2026-10-01'`)
conferir(planoArquivo.includes('demanda_arquivo'), `consulta do Arquivo usa o índice parcial (${planoArquivo})`)
const planoColuna = plano("SELECT id FROM demanda WHERE coluna_id = 'x' AND arquivado_em IS NULL ORDER BY posicao")
conferir(planoColuna.includes('demanda_coluna_ix'), `cards de uma coluna usam demanda_coluna_ix (${planoColuna})`)
for (const [campo, indice] of [['inicio', 'demanda_inicio_ix'], ['publicacao_data', 'demanda_publicacao_ix']] as const) {
  const p = plano(`SELECT id FROM demanda WHERE ${campo} BETWEEN '2026-10-01' AND '2026-10-31'
    AND ${campo} IS NOT NULL AND arquivado_em IS NULL AND excluido_em IS NULL`)
  conferir(p.includes(indice), `Agenda por ${campo} usa ${indice} (${p})`)
}

const planoVia = plano(`SELECT a.id, m.trace_id IS NOT NULL AS via FROM atividade a
  LEFT JOIN mcp_traco m ON m.trace_id = a.trace_id AND m.usuario_id = a.ator_id WHERE a.demanda_id = 'x' ORDER BY a.id DESC`)
conferir(planoVia.includes('sqlite_autoindex_mcp_traco_1'), `"via Claude" no histórico acha o traço pela chave (${planoVia})`)
const planoOcorrencias = plano("SELECT chave FROM agenda_ocorrencia WHERE dia_inicio <= '2026-10-31' AND dia_fim >= '2026-10-01'")
conferir(planoOcorrencias.includes('agenda_ocorrencia_dia_ix'), `eventos da Agenda por período usam o índice (${planoOcorrencias})`)

// ─────────────────────────── 6. fumaça dos gatilhos e restrições (desfeita no fim) ───────────────────────────
db.exec('BEGIN')
const agora = () => new Date().toISOString()
const T0 = '2030-01-02T12:00:00.000Z', T1 = '2030-01-03T12:00:00.000Z', T2 = '2030-01-04T12:00:00.000Z'
const T3 = '2030-01-05T12:00:00.000Z', T4 = '2030-01-06T12:00:00.000Z', T5 = '2030-01-07T12:00:00.000Z'

// pessoas e cliente
rodar(db, "INSERT INTO usuario (id, nome, apelido, email, papel) VALUES ('u-adm','Ana','Ana','ana@x.com','admin')")
rodar(db, "INSERT INTO usuario (id, nome, apelido, email, papel) VALUES ('u-am','Pri','Pri','pri@x.com','atendimento')")
rodar(db, "INSERT INTO usuario (id, nome, apelido, email) VALUES ('u-rafa','Rafael','Rafa','rafa@x.com')")
conferir(um(db, "SELECT papel FROM usuario WHERE id = 'u-rafa'")!.papel === 'equipe', 'papel padrão é equipe')
deveFalhar(db, "INSERT INTO usuario (id, nome, email, papel) VALUES ('u-x','X','x@x.com','executor')", [], 'CHECK',
  'papel executor (fluxo único) é recusado')
deveFalhar(db, "INSERT INTO usuario (id, nome, apelido, email) VALUES ('u-y','Y','rafa','y@x.com')", [], 'UNIQUE',
  'apelido repetido entre ativos é recusado')
rodar(db, "INSERT INTO cliente (id, nome, sigla, atendimento_id) VALUES ('c-he','Hospital Evangélico','HE','u-am')")
deveFalhar(db, "INSERT INTO cliente (id, nome, sigla) VALUES ('c-x','X','he')", [], 'CHECK', 'sigla em minúscula é recusada')
rodar(db, "INSERT INTO cliente_responsavel (cliente_id, equipe_id, usuario_id) VALUES ('c-he','eq-criacao','u-rafa')")
deveFalhar(db, "INSERT INTO cliente_responsavel (cliente_id, equipe_id, usuario_id) VALUES ('c-he','eq-criacao','u-am')", [],
  'UNIQUE', 'um responsável por cliente e equipe')

// quadros
const insQuadro = 'INSERT INTO quadro (id, nome, slug, equipe_id, pos, criado_por) VALUES (?, ?, ?, ?, ?, ?)'
rodar(db, insQuadro, 'q-cri', 'Criação', 'criacao', 'eq-criacao', 1024, 'u-adm')
rodar(db, insQuadro, 'q-soc', 'Social', 'social', 'eq-social', 2048, 'u-adm')
deveFalhar(db, insQuadro, ['q-x', 'criação', 'criacao-2', null, 3072, 'u-adm'], 'UNIQUE', 'nome de quadro ativo repetido (sem caixa)')
deveFalhar(db, insQuadro, ['q-x', 'Outro', 'Criação', null, 3072, 'u-adm'], 'CHECK', 'slug com maiúscula ou acento é recusado')
deveFalhar(db, "UPDATE quadro SET fundo = 'foto' WHERE id = 'q-cri'", [], 'CHECK', 'fundo fora da lista é recusado')
deveFalhar(db, "UPDATE quadro SET arquivado_por = 'u-adm' WHERE id = 'q-cri'", [], 'CHECK', 'arquivado_por exige arquivado_em')
conferir(um(db, "SELECT coluna_por_membro c FROM quadro WHERE id = 'q-cri'")!.c === 0, 'coluna_por_membro começa desligado')

// colunas
const insColuna = 'INSERT INTO coluna (id, quadro_id, nome, cor, papel, pos) VALUES (?, ?, ?, ?, ?, ?)'
rodar(db, insColuna, 'k-fila', 'q-cri', 'Fila', 'grafite', 'normal', 1024)
rodar(db, insColuna, 'k-rafa', 'q-cri', 'Rafa', null, 'normal', 2048)
rodar(db, insColuna, 'k-cli', 'q-cri', 'Com o cliente', 'amarelo', 'aguardando_cliente', 3072)
rodar(db, insColuna, 'k-ok', 'q-cri', 'Concluído', 'verde', 'concluida', 4096)
rodar(db, insColuna, 'k-s-fila', 'q-soc', 'Fila', null, 'normal', 1024)
rodar(db, insColuna, 'k-s-agendar', 'q-soc', 'Agendar', 'turquesa', 'normal', 2048)
deveFalhar(db, insColuna, ['k-x', 'q-cri', 'Triagem', null, 'triagem', 9000], 'CHECK', 'papel de coluna fora da lista')
deveFalhar(db, insColuna, ['k-x', 'q-cri', 'Laranja', 'laranja', 'normal', 9000], 'CHECK', 'laranja nunca é cor de coluna')
deveFalhar(db, "UPDATE coluna SET limite_wip = 0 WHERE id = 'k-fila'", [], 'CHECK', 'limite WIP começa em 1')
deveFalhar(db, "UPDATE coluna SET quadro_id = 'q-soc' WHERE id = 'k-fila'", [], 'coluna_quadro_fixo', 'coluna não muda de quadro')
rodar(db, "UPDATE coluna SET responsavel_id = 'u-rafa' WHERE id = 'k-rafa'")
deveFalhar(db, "INSERT INTO coluna (id, quadro_id, nome, responsavel_id, pos) VALUES ('k-x','q-cri','Rafa 2','u-rafa',9000)", [],
  'UNIQUE', 'uma coluna por pessoa entre as ativas do quadro')
rodar(db, "INSERT INTO coluna (id, quadro_id, nome, responsavel_id, pos) VALUES ('k-s-rafa','q-soc','Rafa','u-rafa',3072)")
deveFalhar(db, "UPDATE coluna SET papel = 'aguardando_cliente' WHERE id = 'k-rafa'", [], 'CHECK',
  'coluna de pessoa só tem papel normal')

// etiquetas
const insEtiqueta = 'INSERT INTO etiqueta (id, quadro_id, nome, cor, pos) VALUES (?, ?, ?, ?, ?)'
rodar(db, insEtiqueta, 'e-urg', 'q-cri', 'Urgente', 'rosa', 1024)
rodar(db, insEtiqueta, 'e-alt', 'q-cri', 'Alteração', 'ambar', 2048)
rodar(db, insEtiqueta, 'e-s-alt', 'q-soc', 'Alteração', 'ambar', 1024)
rodar(db, insEtiqueta, 'e-cor1', 'q-cri', '', 'azul', 3072)
rodar(db, insEtiqueta, 'e-cor2', 'q-cri', '', 'verde', 4096)
deveFalhar(db, insEtiqueta, ['e-x', 'q-cri', 'urgente', 'rosa', 5120], 'UNIQUE', 'etiqueta de mesmo nome no quadro (sem caixa)')
deveFalhar(db, insEtiqueta, ['e-x', 'q-cri', ' Espaço', 'rosa', 5120], 'CHECK', 'nome de etiqueta sem espaço nas pontas')
deveFalhar(db, "UPDATE etiqueta SET quadro_id = 'q-soc' WHERE id = 'e-urg'", [], 'etiqueta_quadro_fixo', 'etiqueta não muda de quadro')

// estrela e seguir
rodar(db, "INSERT INTO quadro_usuario (usuario_id, quadro_id, favorito_pos, seguindo) VALUES ('u-rafa','q-cri',1024,1)")
deveFalhar(db, "INSERT INTO quadro_usuario (usuario_id, quadro_id, favorito_pos, seguindo) VALUES ('u-am','q-cri',NULL,0)", [],
  'CHECK', 'linha sem estrela e sem seguir é recusada')
deveFalhar(db, "INSERT INTO quadro_usuario (usuario_id, quadro_id, favorito_pos) VALUES ('u-rafa','q-cri',2048)", [],
  'UNIQUE', 'uma linha por pessoa e quadro')

// automações
const insAuto = 'INSERT INTO automacao_quadro (quadro_id, gatilho, destino_quadro_id, destino_coluna_id) VALUES (?, ?, ?, ?)'
rodar(db, insAuto, 'q-cri', 'aprovado', 'q-soc', 'k-s-agendar')
rodar(db, insAuto, 'q-cri', 'enviado_ao_cliente', 'q-cri', 'k-cli')
deveFalhar(db, insAuto, ['q-cri', 'ajuste_pedido', 'q-cri', 'k-s-fila'], 'FOREIGN KEY', 'destino com coluna de outro quadro é recusado')
deveFalhar(db, insAuto, ['q-cri', 'liberado', 'q-cri', 'k-fila'], 'CHECK', 'gatilho fora dos 4 é recusado')
deveFalhar(db, insAuto, ['q-cri', 'aprovado', 'q-cri', 'k-fila'], 'UNIQUE', 'uma automação por gatilho e quadro')
conferir(um(db, "SELECT membros m FROM automacao_quadro WHERE quadro_id = 'q-cri' AND gatilho = 'aprovado'")!.m === 'manter',
  'automação mantém os membros por padrão')
rodar(db, "UPDATE automacao_quadro SET membros = 'responsavel_destino' WHERE quadro_id = 'q-cri' AND gatilho = 'aprovado'")
deveFalhar(db, "UPDATE automacao_quadro SET membros = 'todos' WHERE quadro_id = 'q-cri' AND gatilho = 'aprovado'", [], 'CHECK',
  'membros da automação fora da lista')
deveFalhar(db, "INSERT INTO modelo_quadro_automacao (modelo_id, gatilho, destino_coluna_id) VALUES ('mq-semana','aprovado','mqc-kanban-concluido')",
  [], 'FOREIGN KEY', 'automação de modelo com coluna de outro modelo é recusada')

// demanda
const insDemanda = `INSERT INTO demanda (id, numero, quadro_id, coluna_id, posicao, titulo, cliente_id, atendimento_id,
  modelo_id, status_desde, criado_por, descricao_md, prazo) VALUES (?, ?, ?, ?, ?, ?, 'c-he', 'u-am', 'md-carrossel', ?, 'u-am', ?, ?)`
rodar(db, insDemanda, 'd1', 1, 'q-cri', 'k-fila', 1024, 'Carrossel Outubro Rosa', T0, 'Ação de conscientização', '2030-01-10')
deveFalhar(db, insDemanda, ['d2', 2, 'q-cri', 'k-s-fila', 1024, 'X', T0, '', null], 'FOREIGN KEY',
  'coluna de outro quadro é recusada')
deveFalhar(db, insDemanda, ['d2', 2, 'q-cri', 'k-ok', 1024, 'X', T0, '', null], 'concluida_sem_data',
  'criar em coluna concluida sem concluida_em é recusado')
deveFalhar(db, "UPDATE demanda SET repetir = 'semanal', prazo = NULL WHERE id = 'd1'", [], 'CHECK', 'repetir exige prazo')
deveFalhar(db, "UPDATE demanda SET inicio = '2030-02-01' WHERE id = 'd1'", [], 'CHECK', 'início depois do prazo é recusado')
deveFalhar(db, "UPDATE demanda SET prioridade = 'fura-pauta' WHERE id = 'd1'", [], 'CHECK', 'prioridade fora da lista')
deveFalhar(db, "UPDATE demanda SET prazo_hora = '10:00', prazo = NULL WHERE id = 'd1'", [], 'CHECK', 'hora sem data é recusada')
deveFalhar(db, "UPDATE demanda SET origem = 'copia' WHERE id = 'd1'", [], 'CHECK', 'cópia exige origem_demanda_id')
conferir(um(db, "SELECT prioridade p, repetir r, rev FROM demanda WHERE id = 'd1'")!.p === 'media', 'prioridade padrão média')

let mov = todos(db, "SELECT * FROM demanda_movimento WHERE demanda_id = 'd1' ORDER BY id")
conferir(mov.length === 1 && mov[0]!.saiu_em === null && mov[0]!.entrou_em === T0 && mov[0]!.papel === 'normal'
  && mov[0]!.por === 'u-am', 'criar abre o histórico de movimentação com o status_desde e o autor')

// mover dentro do quadro
deveFalhar(db, "UPDATE demanda SET coluna_id = 'k-rafa', atualizado_por = 'u-rafa' WHERE id = 'd1'", [],
  'demanda_status_desde', 'mudar de coluna sem gravar status_desde é recusado')
deveFalhar(db, "UPDATE demanda SET coluna_id = 'k-rafa', status_desde = ?, atualizado_por = 'u-rafa' WHERE id = 'd1'",
  ['2029-12-31T00:00:00.000Z'], 'demanda_status_desde', 'status_desde que volta no tempo é recusado')
rodar(db, "UPDATE demanda SET coluna_id = 'k-rafa', status_desde = ?, atualizado_em = ?, atualizado_por = 'u-rafa' WHERE id = 'd1'", T1, T1)
mov = todos(db, "SELECT * FROM demanda_movimento WHERE demanda_id = 'd1' ORDER BY id")
conferir(mov.length === 2 && mov[0]!.saiu_em === T1 && mov[1]!.entrou_em === T1 && mov[1]!.por === 'u-rafa'
  && mov[1]!.coluna_id === 'k-rafa', 'mover fecha a passagem anterior e abre outra com o instante e o ator')
conferir(um(db, "SELECT rev FROM demanda WHERE id = 'd1'")!.rev === 1, 'mudar de coluna não sobe o rev')
rodar(db, "UPDATE demanda SET posicao = 99, atualizado_por = 'u-rafa' WHERE id = 'd1'")
conferir(um(db, "SELECT rev FROM demanda WHERE id = 'd1'")!.rev === 1, 'mudar só a posição não sobe o rev')
rodar(db, "UPDATE demanda SET titulo = 'Carrossel Outubro Rosa v2', atualizado_por = 'u-am' WHERE id = 'd1'")
conferir(um(db, "SELECT rev FROM demanda WHERE id = 'd1'")!.rev === 2, 'editar o título sobe o rev')
rodar(db, "UPDATE demanda SET prazo = '2030-01-11', rev = rev + 1, atualizado_por = 'u-am' WHERE id = 'd1'")
conferir(um(db, "SELECT rev FROM demanda WHERE id = 'd1'")!.rev === 3, 'rev subido pelo serviço não sobe de novo')
for (const p of PRIORIDADES) rodar(db, "UPDATE demanda SET prioridade = ?, atualizado_por = 'u-am' WHERE id = 'd1'", p)
conferir(um(db, "SELECT rev FROM demanda WHERE id = 'd1'")!.rev === 3 + PRIORIDADES.length,
  'cada troca de prioridade sobe o rev')

// membros e etiquetas
rodar(db, "INSERT INTO demanda_membro (demanda_id, usuario_id, adicionado_por) VALUES ('d1','u-rafa','u-am')")
deveFalhar(db, "INSERT INTO demanda_membro (demanda_id, usuario_id) VALUES ('d1','u-rafa')", [], 'UNIQUE', 'membro repetido')
const insDE = 'INSERT INTO demanda_etiqueta (demanda_id, etiqueta_id, quadro_id) VALUES (?, ?, ?)'
rodar(db, insDE, 'd1', 'e-urg', 'q-cri')
rodar(db, insDE, 'd1', 'e-alt', 'q-cri')
deveFalhar(db, insDE, ['d1', 'e-s-alt', 'q-cri'], 'FOREIGN KEY', 'etiqueta gravada com outro quadro que não o dela é recusada')
const etiquetasAtuais = (id: string) => todos(db, `SELECT de.etiqueta_id e FROM demanda_etiqueta de
  JOIN demanda d ON d.id = de.demanda_id AND d.quadro_id = de.quadro_id WHERE d.id = ? ORDER BY de.etiqueta_id`, id).map((l) => l.e)

// mover entre quadros: as etiquetas do quadro antigo ficam guardadas e voltam se a demanda voltar (API.md §5.6)
const moverSocial = "UPDATE demanda SET quadro_id = 'q-soc', coluna_id = 'k-s-fila', status_desde = ?, atualizado_em = ?, atualizado_por = 'u-am' WHERE id = 'd1'"
rodar(db, moverSocial, T2, T2)
rodar(db, insDE, 'd1', 'e-s-alt', 'q-soc')
conferir(JSON.stringify(etiquetasAtuais('d1')) === JSON.stringify(['e-s-alt']), 'etiquetas atuais = as do quadro em que a demanda está')
conferir(um(db, "SELECT count(*) n FROM demanda_etiqueta WHERE demanda_id = 'd1' AND quadro_id = 'q-cri'")!.n === 2,
  'as etiquetas do quadro de origem ficam guardadas')
mov = todos(db, "SELECT * FROM demanda_movimento WHERE demanda_id = 'd1' ORDER BY id")
conferir(mov.length === 3 && mov[2]!.quadro_id === 'q-soc' && mov[1]!.saiu_em === T2, 'histórico guarda a troca de quadro')
conferir(um(db, "SELECT numero FROM demanda WHERE id = 'd1'")!.numero === 1, 'o número não muda entre quadros')

// concluída e coluna concluida
rodar(db, insDemanda, 'd5', 5, 'q-cri', 'k-fila', 2048, 'Post Dia das Crianças', T0, '', '2030-01-10')
const paraConcluido = "UPDATE demanda SET coluna_id = 'k-ok', status_desde = ?, atualizado_por = 'u-rafa' WHERE id = 'd5'"
deveFalhar(db, paraConcluido, [T1], 'concluida_sem_data', 'soltar em coluna concluida sem concluida_em é recusado')
rodar(db, "UPDATE demanda SET coluna_id = 'k-ok', status_desde = ?, concluida_em = ?, concluida_por = 'u-rafa', atualizado_por = 'u-rafa' WHERE id = 'd5'", T1, T1)
conferir(um(db, "SELECT papel FROM demanda_movimento WHERE demanda_id = 'd5' AND saiu_em IS NULL")!.papel === 'concluida',
  'o histórico guarda o papel da coluna')
deveFalhar(db, "UPDATE demanda SET concluida_em = NULL, concluida_por = NULL WHERE id = 'd5'", [], 'concluida_sem_data',
  'desmarcar concluída sem sair da coluna concluida é recusado')
deveFalhar(db, "UPDATE demanda SET concluida_por = 'u-rafa', concluida_em = NULL WHERE id = 'd1'", [], 'CHECK',
  'concluida_por exige concluida_em')
rodar(db, insDemanda, 'd6', 6, 'q-cri', 'k-rafa', 1024, 'Banner', T0, '', null)
deveFalhar(db, "UPDATE coluna SET papel = 'concluida' WHERE id = 'k-rafa'", [], 'concluida_sem_data',
  'coluna com demanda aberta não vira concluida')

// repetição e cópia
const insDerivada = `INSERT INTO demanda (id, numero, quadro_id, coluna_id, posicao, titulo, status_desde, criado_por, origem,
  origem_demanda_id, prazo, repetir) VALUES (?, ?, 'q-cri', 'k-fila', ?, 'Post Dia das Crianças', ?, 'u-rafa', ?, 'd5', '2030-01-17', 'semanal')`
rodar(db, insDerivada, 'd9', 9, 4096, T1, 'repeticao')
deveFalhar(db, insDerivada, ['d10', 10, 5120, T1, 'repeticao'], 'UNIQUE', 'uma só repetição por demanda')
rodar(db, insDerivada, 'd11', 11, 6144, T1, 'copia')
rodar(db, insDerivada, 'd12', 12, 7168, T1, 'copia')
conferir(um(db, "SELECT count(*) n FROM demanda WHERE origem_demanda_id = 'd5' AND origem = 'copia'")!.n === 2,
  'cópias da mesma demanda podem ser várias')

// coluna e quadro arquivados
deveFalhar(db, "UPDATE coluna SET arquivada_em = ?, arquivada_por = 'u-adm' WHERE id = 'k-rafa'", [T2], 'coluna_com_demandas',
  'arquivar coluna com card ativo é recusado')
rodar(db, "UPDATE coluna SET arquivada_em = ?, arquivada_por = 'u-adm' WHERE id = 'k-cli'", T2)
deveFalhar(db, "UPDATE demanda SET coluna_id = 'k-cli', status_desde = ?, atualizado_por = 'u-am' WHERE id = 'd6'", [T3],
  'destino_arquivado', 'mover para coluna arquivada é recusado')
rodar(db, "UPDATE demanda SET arquivado_em = ?, arquivado_por = 'u-am', atualizado_por = 'u-am' WHERE id = 'd6'", T3)
rodar(db, "UPDATE coluna SET arquivada_em = ?, arquivada_por = 'u-adm' WHERE id = 'k-rafa'", T3)
rodar(db, "INSERT INTO coluna (id, quadro_id, nome, responsavel_id, pos) VALUES ('k-rafa2','q-cri','Rafa','u-rafa',2560)")
conferir(um(db, "SELECT count(*) n FROM coluna WHERE responsavel_id = 'u-rafa' AND quadro_id = 'q-cri'")!.n === 2,
  'arquivar a coluna da pessoa libera uma nova coluna para ela')
deveFalhar(db, "UPDATE demanda SET arquivado_em = NULL, arquivado_por = NULL, atualizado_por = 'u-am' WHERE id = 'd6'", [],
  'destino_arquivado', 'restaurar para coluna arquivada é recusado (o serviço escolhe outra)')
rodar(db, "UPDATE demanda SET arquivado_em = NULL, arquivado_por = NULL, coluna_id = 'k-fila', status_desde = ?, atualizado_por = 'u-am' WHERE id = 'd6'", T4)
conferir(um(db, "SELECT coluna_id c FROM demanda WHERE id = 'd6'")!.c === 'k-fila', 'restaurar em outra coluna funciona')
rodar(db, "UPDATE quadro SET arquivado_em = ?, arquivado_por = 'u-adm' WHERE id = 'q-soc'", T3)
deveFalhar(db, "UPDATE demanda SET quadro_id = 'q-soc', coluna_id = 'k-s-fila', status_desde = ?, atualizado_por = 'u-am' WHERE id = 'd6'",
  [T5], 'destino_arquivado', 'mover para quadro arquivado é recusado')
rodar(db, "UPDATE quadro SET arquivado_em = NULL, arquivado_por = NULL WHERE id = 'q-soc'")

// capa
rodar(db, "INSERT INTO arquivo (id, nome, mime, bytes, sha256, enviado_por) VALUES ('a-img','capa.png','image/png',10,'i','u-am')")
rodar(db, "INSERT INTO arquivo (id, nome, mime, bytes, sha256, enviado_por) VALUES ('a-pdf','ref.pdf','application/pdf',10,'p','u-am')")
rodar(db, "INSERT INTO arquivo (id, nome, mime, bytes, sha256, enviado_por) VALUES ('a-img5','outra.png','image/png',10,'o','u-am')")
const insAnexo = 'INSERT INTO anexo (id, demanda_id, tipo, nome, arquivo_id, url, pos) VALUES (?, ?, ?, ?, ?, ?, ?)'
rodar(db, insAnexo, 'ax-img', 'd1', 'arquivo', 'capa.png', 'a-img', null, 1)
rodar(db, insAnexo, 'ax-pdf', 'd1', 'arquivo', 'ref.pdf', 'a-pdf', null, 2)
rodar(db, insAnexo, 'ax-link', 'd1', 'link', 'Drive', null, 'https://drive.google.com/x', 3)
rodar(db, insAnexo, 'ax-d5', 'd5', 'arquivo', 'outra.png', 'a-img5', null, 1)
conferir(um(db, "SELECT n_anexos n FROM demanda WHERE id = 'd1'")!.n === 3, 'n_anexos conta anexos')
rodar(db, "UPDATE demanda SET capa_anexo_id = 'ax-img', atualizado_por = 'u-am' WHERE id = 'd1'")
deveFalhar(db, "UPDATE demanda SET capa_anexo_id = 'ax-pdf' WHERE id = 'd1'", [], 'capa_nao_e_imagem', 'capa com PDF é recusada')
deveFalhar(db, "UPDATE demanda SET capa_anexo_id = 'ax-link' WHERE id = 'd1'", [], 'capa_nao_e_imagem', 'capa com link é recusada')
deveFalhar(db, "UPDATE demanda SET capa_anexo_id = 'ax-d5' WHERE id = 'd1'", [], 'FOREIGN KEY', 'capa com anexo de outra demanda é recusada')
deveFalhar(db, "UPDATE demanda SET capa_cor = 'rosa' WHERE id = 'd1'", [], 'CHECK', 'capa é cor OU imagem')
deveFalhar(db, "UPDATE anexo SET excluido_em = ? WHERE id = 'ax-img'", [agora()], 'anexo_e_capa', 'excluir o anexo da capa é recusado')
deveFalhar(db, "INSERT INTO demanda (id, numero, quadro_id, coluna_id, posicao, titulo, status_desde, criado_por, capa_anexo_id) VALUES ('d20',20,'q-cri','k-fila',1,'X',?, 'u-am','ax-img')",
  [T0], 'capa_nao_e_imagem', 'criar já com capa de imagem é recusado (ainda não há anexo)')
rodar(db, "UPDATE demanda SET capa_anexo_id = NULL, capa_cor = 'rosa', atualizado_por = 'u-am' WHERE id = 'd1'")
rodar(db, "UPDATE anexo SET excluido_em = ? WHERE id = 'ax-link'", agora())
conferir(um(db, "SELECT n_anexos n FROM demanda WHERE id = 'd1'")!.n === 2, 'n_anexos ignora excluídos')
deveFalhar(db, insAnexo, ['ax-x', 'd1', 'link', 'x', null, 'http://x', 9], 'CHECK', 'link sem https é recusado')
rodar(db, "INSERT INTO anexo (id, demanda_id, tipo, nome, pos, excluido_em) VALUES ('ax-anon','d1','link','Anexo removido',9,?)", agora())
conferir(um(db, "SELECT url FROM anexo WHERE id = 'ax-anon'")!.url === null, 'anexo excluído (demanda anonimizada) fica sem url')

// checklists, comentários e contadores
rodar(db, "INSERT INTO checklist (id, demanda_id, titulo, pos) VALUES ('ck1','d1','Checklist',1024)")
rodar(db, "INSERT INTO checklist_item (id, checklist_id, demanda_id, texto, pos) VALUES ('i1','ck1','d1','a',1),('i2','ck1','d1','b',2)")
rodar(db, "UPDATE checklist_item SET feito_em = ?, feito_por = 'u-rafa' WHERE id = 'i1'", agora())
let cont = um(db, "SELECT n_check_total t, n_check_feitos f FROM demanda WHERE id = 'd1'")!
conferir(cont.t === 2 && cont.f === 1, `contadores do checklist (2/1): ${JSON.stringify(cont)}`)
deveFalhar(db, "INSERT INTO checklist_item (id, checklist_id, demanda_id, texto, pos) VALUES ('i9','ck1','d5','x',3)", [],
  'FOREIGN KEY', 'item com demanda diferente da do checklist é recusado')
rodar(db, "DELETE FROM checklist WHERE id = 'ck1'")
cont = um(db, "SELECT n_check_total t, n_check_feitos f FROM demanda WHERE id = 'd1'")!
conferir(cont.t === 0 && cont.f === 0, `apagar checklist zera os contadores (cascade): ${JSON.stringify(cont)}`)
deveFalhar(db, "INSERT INTO comentario (id, demanda_id, autor_id, corpo_md) VALUES ('cm0','d1','u-am','')", [], 'CHECK',
  'comentário vazio é recusado')
rodar(db, "INSERT INTO comentario (id, demanda_id, autor_id, corpo_md) VALUES ('cm1','d1','u-am','Oi @Rafa'),('cm2','d1','u-rafa','Ok')")
conferir(um(db, "SELECT n_comentarios n FROM demanda WHERE id = 'd1'")!.n === 2, 'n_comentarios conta comentários')
rodar(db, "UPDATE comentario SET excluido_em = ?, corpo_md = '' WHERE id = 'cm2'", agora())
conferir(um(db, "SELECT n_comentarios n FROM demanda WHERE id = 'd1'")!.n === 1, 'n_comentarios ignora excluídos')
deveFalhar(db, "INSERT INTO anexo (id, demanda_id, comentario_id, tipo, nome, url, pos) VALUES ('ax-c','d5','cm1','link','x','https://x.com',1)",
  [], 'FOREIGN KEY', 'anexo preso a comentário de outra demanda é recusado')

// busca
conferir(todos(db, "SELECT rowid FROM demanda_fts WHERE demanda_fts MATCH 'acao'").length === 1, 'busca ignora acento')
conferir(todos(db, "SELECT rowid FROM demanda_fts WHERE demanda_fts MATCH 'outub*'").length === 1, 'busca por prefixo')
conferir(todos(db, "SELECT rowid FROM demanda_fts WHERE demanda_fts MATCH 'v2'").length === 1, 'busca acompanha o título novo')

// nada se apaga
deveFalhar(db, "UPDATE demanda SET numero = 7 WHERE id = 'd1'", [], 'demanda_numero_fixo', 'número não muda')
deveFalhar(db, "DELETE FROM demanda WHERE id = 'd1'", [], 'demanda_nao_se_apaga', 'demanda não se apaga')
deveFalhar(db, "DELETE FROM usuario WHERE id = 'u-rafa'", [], 'usuario_nao_se_apaga', 'usuário não se apaga')
deveFalhar(db, "DELETE FROM quadro WHERE id = 'q-cri'", [], 'quadro_com_historico', 'quadro com demandas não se apaga')
deveFalhar(db, "DELETE FROM quadro WHERE id = 'q-soc'", [], 'quadro_com_historico', 'quadro por onde passou demanda não se apaga')
deveFalhar(db, "DELETE FROM demanda_movimento", [], 'demanda_movimento_imutavel', 'histórico de movimentação não se apaga')
deveFalhar(db, "UPDATE demanda_movimento SET entrou_em = ? WHERE demanda_id = 'd1'", [T4], 'demanda_movimento_imutavel',
  'entrada no histórico não muda')
deveFalhar(db, "UPDATE demanda_movimento SET saiu_em = ? WHERE demanda_id = 'd1' AND saiu_em IS NOT NULL", [T4],
  'demanda_movimento_imutavel', 'passagem fechada não reabre')

// quadro vazio se apaga com tudo o que é dele
rodar(db, insQuadro, 'q-vazio', 'Teste', 'teste', null, 9000, 'u-adm')
rodar(db, insColuna, 'k-v1', 'q-vazio', 'A fazer', null, 'normal', 1)
rodar(db, insEtiqueta, 'e-v1', 'q-vazio', 'Teste', 'azul', 1)
rodar(db, "INSERT INTO quadro_usuario (usuario_id, quadro_id, favorito_pos) VALUES ('u-am','q-vazio',1)")
rodar(db, insAuto, 'q-vazio', 'concluida', 'q-vazio', 'k-v1')
rodar(db, insAuto, 'q-soc', 'ajuste_pedido', 'q-vazio', 'k-v1')
rodar(db, "INSERT INTO modelo_demanda (id, quadro_id, nome, pos) VALUES ('md-v1','q-vazio','Post',1)")
rodar(db, "INSERT INTO modelo_demanda_item (id, modelo_id, texto, pos) VALUES ('mdi-v1','md-v1','Item',1)")
rodar(db, "DELETE FROM quadro WHERE id = 'q-vazio'")
conferir(um(db, "SELECT (SELECT count(*) FROM coluna WHERE quadro_id = 'q-vazio') + (SELECT count(*) FROM etiqueta WHERE quadro_id = 'q-vazio') + (SELECT count(*) FROM quadro_usuario WHERE quadro_id = 'q-vazio') + (SELECT count(*) FROM modelo_demanda_item WHERE modelo_id = 'md-v1') n")!.n === 0,
  'apagar quadro vazio leva colunas, etiquetas, estrelas e modelos dele')
conferir(um(db, "SELECT count(*) n FROM automacao_quadro WHERE destino_coluna_id = 'k-v1'")!.n === 0,
  'automação de outro quadro que apontava para ele também sai')

// modelos de demanda
deveFalhar(db, "INSERT INTO modelo_demanda (id, nome, pos) VALUES ('md-x','post',1)", [], 'UNIQUE', 'modelo global de mesmo nome')
rodar(db, "INSERT INTO modelo_demanda (id, quadro_id, nome, pos) VALUES ('md-q1','q-cri','Post',1)")
rodar(db, "INSERT INTO modelo_demanda_etiqueta (modelo_id, nome, cor) VALUES ('md-q1','Feed','azul')")
deveFalhar(db, "INSERT INTO modelo_demanda_etiqueta (modelo_id, nome, cor) VALUES ('md-q1','Feed','rosa')", [], 'UNIQUE',
  'etiqueta padrão repetida no modelo')
deveFalhar(db, "INSERT INTO modelo_demanda (id, nome, icone, pos) VALUES ('md-y','Y','Imagem',1)", [], 'CHECK',
  'ícone fora do padrão lucide é recusado')

// horas: cronômetro (um ativo por pessoa) e lançar tempo
const insCrono = "INSERT INTO apontamento (id, usuario_id, demanda_id, cliente_id, data, origem, iniciado_em) VALUES (?, ?, 'd1', 'c-he', '2030-01-02', 'cronometro', ?)"
rodar(db, insCrono, 't1', 'u-rafa', T0)
deveFalhar(db, insCrono, ['t2', 'u-rafa', T1], 'UNIQUE', 'segundo cronômetro ligado da mesma pessoa é recusado')
rodar(db, insCrono, 't3', 'u-am', T0)
conferir(um(db, "SELECT minutos_registrados m FROM demanda WHERE id = 'd1'")!.m === 0, 'cronômetro ligado não soma minutos')
deveFalhar(db, "UPDATE apontamento SET parado_em = ? WHERE id = 't1'", [T1], 'CHECK', 'parar sem gravar os minutos é recusado')
deveFalhar(db, "INSERT INTO apontamento (id, usuario_id, demanda_id, data, origem) VALUES ('t9','u-am','d1','2030-01-02','manual')", [],
  'CHECK', 'lançamento manual sem minutos é recusado')
deveFalhar(db, "INSERT INTO apontamento (id, usuario_id, cliente_id, data, origem, iniciado_em) VALUES ('t9','u-adm','c-he','2030-01-02','cronometro',?)",
  [T0], 'NOT NULL', 'cronômetro sem demanda é recusado')
deveFalhar(db, "INSERT INTO apontamento (id, usuario_id, cliente_id, data, minutos) VALUES ('t9','u-adm','c-he','2030-01-02',30)",
  [], 'NOT NULL', 'lançar tempo sem demanda é recusado (horas sem demanda: v1)')
rodar(db, "UPDATE apontamento SET parado_em = ?, minutos = 90 WHERE id = 't1'", '2030-01-02T13:30:00.000Z')
conferir(um(db, "SELECT minutos_registrados m FROM demanda WHERE id = 'd1'")!.m === 90, 'parar o cronômetro soma os minutos')
rodar(db, insCrono, 't4', 'u-rafa', T1)
rodar(db, "INSERT INTO apontamento (id, usuario_id, demanda_id, cliente_id, data, minutos) VALUES ('t5','u-am','d1','c-he','2030-01-02',30)")
conferir(um(db, "SELECT minutos_registrados m FROM demanda WHERE id = 'd1'")!.m === 120, 'lançar tempo soma')
rodar(db, "UPDATE apontamento SET excluido_em = ? WHERE id = 't5'", agora())
conferir(um(db, "SELECT minutos_registrados m FROM demanda WHERE id = 'd1'")!.m === 90, 'minutos_registrados ignora excluídos')
deveFalhar(db, "DELETE FROM apontamento WHERE id = 't1'", [], 'apontamento_nao_se_apaga', 'apontamento não se apaga')
deveFalhar(db, "UPDATE apontamento SET parado_em = ?, minutos = 5 WHERE id = 't3'", ['2029-12-31T00:00:00.000Z'], 'CHECK',
  'parar antes de iniciar é recusado')
rodar(db, "UPDATE apontamento SET parado_em = iniciado_em, minutos = 1 WHERE id = 't3'")
conferir(um(db, "SELECT minutos m FROM apontamento WHERE id = 't3'")!.m === 1,
  'ligar e parar no mesmo instante vale (relógio parado dos testes; minutos = max(1, ...))')

// rodadas, versões, envio, aprovação
rodar(db, "INSERT INTO rodada (id, demanda_id, numero, origem, prazo, prazo_original) VALUES ('r1','d1',1,'inicial','2030-01-11','2030-01-11')")
deveFalhar(db, "INSERT INTO rodada (id, demanda_id, numero, origem) VALUES ('r2','d1',2,'cliente')", [], 'CHECK',
  'rodada de ajuste sem motivo e prazo é recusada')
rodar(db, "INSERT INTO versao (id, demanda_id, numero, rodada_id, criada_por) VALUES ('v1','d1',1,'r1','u-rafa')")
rodar(db, "INSERT INTO versao_item (id, versao_id, demanda_id, tipo, nome, url, provedor, pos) VALUES ('vi1','v1','d1','link','Arte','https://drive.google.com/file/d/abc','drive',1)")
let d = um(db, "SELECT n_versoes n, versao_atual_id va, versao_enviada_id ve FROM demanda WHERE id = 'd1'")!
conferir(d.n === 1 && d.va === 'v1' && d.ve === null, `versão atualiza n_versoes/versao_atual_id: ${JSON.stringify(d)}`)
deveFalhar(db, "UPDATE demanda SET envio_pendente_em = ? WHERE id = 'd1'", [T2], 'CHECK', 'envio pendente exige versão enviada')
rodar(db, "UPDATE versao SET enviada_cliente_em = ?, enviada_via = 'fora' WHERE id = 'v1'", T2)
d = um(db, "SELECT versao_enviada_id ve FROM demanda WHERE id = 'd1'")!
conferir(d.ve === 'v1', 'envio marca versao_enviada_id')
rodar(db, "UPDATE demanda SET envio_pendente_em = ?, atualizado_por = 'u-am' WHERE id = 'd1'", T2)
deveFalhar(db, "UPDATE versao SET enviada_via = 'link' WHERE id = 'v1'", [], 'versao_imutavel', 'primeiro envio não muda')
deveFalhar(db, "DELETE FROM versao WHERE id = 'v1'", [], 'versao_imutavel', 'versão não se apaga')
deveFalhar(db, "UPDATE versao_item SET url = 'https://outro' WHERE id = 'vi1'", [], 'versao_item_imutavel', 'item de versão não troca de link')
deveFalhar(db, "INSERT INTO envio (id, demanda_id, versao_id, via, canal, enviado_por) VALUES ('e0','d1','v1','fora','whatsapp','u-am')",
  [], 'NOT NULL', 'envio sem o quadro de onde saiu é recusado')
rodar(db, "INSERT INTO envio (id, demanda_id, quadro_id, versao_id, via, canal, enviado_por) VALUES ('e1','d1','q-soc','v1','fora','whatsapp','u-am')")
deveFalhar(db, "UPDATE envio SET canal = 'email' WHERE id = 'e1'", [], 'envio_imutavel', 'envio é imutável')

rodar(db, "INSERT INTO cliente_contato (id, cliente_id, nome, padrao) VALUES ('ct1','c-he','Fulana',1)")
deveFalhar(db, "INSERT INTO cliente_contato (id, cliente_id, nome, padrao) VALUES ('ct2','c-he','Beltrana',1)", [], 'UNIQUE',
  'um só contato padrão por cliente')
const insApr = `INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, canal, contato_id, registrado_por, comentario,
  quadro_antes_id, coluna_antes_id) VALUES (?, 'd1', 'v1', ?, 'manual', 'whatsapp', ?, 'u-am', ?, ?, ?)`
deveFalhar(db, insApr, ['ap0', 'aprovado', 'ct1', null, 'q-cri', 'k-s-fila'], 'FOREIGN KEY', 'lugar de antes com coluna de outro quadro')
const insAprEvid = `INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, canal, contato_id, registrado_por,
  evidencia_anexo_id, quadro_antes_id, coluna_antes_id) VALUES (?, 'd1', 'v1', 'aprovado', 'manual', 'whatsapp', 'ct1', 'u-am', ?, 'q-soc', 'k-s-fila')`
deveFalhar(db, insAprEvid, ['ap0', 'ax-d5'], 'FOREIGN KEY', 'evidência com anexo de outra demanda é recusada')
rodar(db, insApr, 'ap1', 'aprovado', 'ct1', null, 'q-soc', 'k-s-fila')
deveFalhar(db, "UPDATE aprovacao SET coluna_antes_id = 'k-s-agendar' WHERE id = 'ap1'", [], 'aprovacao_imutavel',
  'o lugar de antes é imutável (anular devolve para ele)')
deveFalhar(db, insApr, ['ap2', 'aprovado', 'ct1', null, 'q-soc', 'k-s-fila'], 'UNIQUE', 'uma decisão válida por versão')
deveFalhar(db, insApr, ['ap3', 'ajuste', 'ct1', null, 'q-soc', 'k-s-fila'], 'CHECK', 'ajuste sem comentário é recusado')
deveFalhar(db, "UPDATE aprovacao SET decisao = 'ajuste' WHERE id = 'ap1'", [], 'aprovacao_imutavel', 'decisão é imutável')
rodar(db, "UPDATE aprovacao SET anulada_em = ?, anulada_por = 'u-am' WHERE id = 'ap1'", agora())
// 090: quem da agência usava a mesma rede da decisão pelo link (lista JSON de ids), imutável como o resto
deveFalhar(db, `INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, canal, contato_id, registrado_por, quadro_antes_id,
  coluna_antes_id, rede_interna) VALUES ('ap9', 'd1', 'v1', 'aprovado', 'manual', 'whatsapp', 'ct1', 'u-am', 'q-soc', 'k-s-fila', ?)`,
['{"u-am":1}'], 'CHECK', 'rede_interna é uma lista JSON')
deveFalhar(db, `UPDATE aprovacao SET rede_interna = '["u-am"]' WHERE id = 'ap1'`, [], 'aprovacao_imutavel',
  'a marca da rede interna não se põe nem se tira depois da decisão')
rodar(db, "INSERT INTO anexo (id, demanda_id, finalidade, tipo, nome, url, pos) VALUES ('ax-ev','d1','evidencia','link','Print','https://drive.google.com/p',20)")
rodar(db, insAprEvid, 'ap4', 'ax-ev')
conferir(um(db, "SELECT count(*) n FROM aprovacao WHERE versao_id = 'v1'")!.n === 2, 'anular libera nova decisão na versão')
deveFalhar(db, "UPDATE anexo SET excluido_em = ? WHERE id = 'ax-ev'", [agora()], 'anexo_e_evidencia',
  'o print de evidência de uma decisão não sai')
deveFalhar(db, "UPDATE demanda SET aprovada_em = ? WHERE id = 'd1'", [agora()], 'CHECK', 'aprovada_em exige aprovada_versao_id')
rodar(db, "UPDATE demanda SET aprovada_em = ?, aprovada_versao_id = 'v1', envio_pendente_em = NULL, atualizado_por = 'u-am' WHERE id = 'd1'", agora())
deveFalhar(db, "UPDATE demanda SET aprovada_versao_id = 'v-inexistente', atualizado_por = 'u-am' WHERE id = 'd1'", [],
  'FOREIGN KEY', 'versão aprovada precisa ser da mesma demanda')

// identidade na trilha: contato do cliente da demanda; link e idempotência
rodar(db, "INSERT INTO cliente (id, nome, sigla) VALUES ('c-icc','ICC','ICC')")
rodar(db, "INSERT INTO cliente_contato (id, cliente_id, nome) VALUES ('ct9','c-icc','Beltrana')")
const insLink = 'INSERT INTO link_publico (id, token_hash, token_cifrado, cliente_id, contato_id, expira_em, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)'
deveFalhar(db, insLink, ['l9', 'h9', 'c9', 'c-he', 'ct9', '2030-01-01', 'u-am'], 'FOREIGN KEY', 'link com contato de outro cliente é recusado')
rodar(db, insLink, 'l1', 'h1', 'c1', 'c-he', 'ct1', '2030-01-01', 'u-am')
rodar(db, insLink, 'l2', 'h2', 'c2', 'c-he', null, '2030-01-01', 'u-am')
rodar(db, insLink, 'l9', 'h9', 'c9', 'c-icc', 'ct9', '2030-01-01', 'u-am')
const insItemLink = 'INSERT INTO link_publico_item (link_id, demanda_id, pos) VALUES (?, ?, 1)'
rodar(db, insItemLink, 'l1', 'd1')
deveFalhar(db, insItemLink, ['l9', 'd1'], 'demanda_de_outro_cliente', 'link não leva demanda de outro cliente')
deveFalhar(db, "INSERT INTO envio (id, demanda_id, quadro_id, versao_id, via, canal, contato_id, enviado_por) VALUES ('e9','d1','q-soc','v1','fora','whatsapp','ct9','u-am')",
  [], 'contato_de_outro_cliente', 'envio para contato de outro cliente é recusado')
rodar(db, "INSERT INTO versao (id, demanda_id, numero, rodada_id, criada_por) VALUES ('v2','d1',2,'r1','u-rafa')")
const insEnvioLink = "INSERT INTO envio (id, demanda_id, quadro_id, versao_id, via, link_id, contato_id, enviado_por) VALUES (?, 'd1', 'q-soc', 'v2', 'link', ?, ?, 'u-am')"
deveFalhar(db, insEnvioLink, ['e9', 'l2', null], 'FOREIGN KEY', 'envio por um link que não contém a demanda é recusado')
rodar(db, insEnvioLink, 'e2', 'l1', 'ct1')
const insAprLink = `INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, link_id, contato_id, nome_informado,
  idempotency_key, idempotency_hash, quadro_antes_id, coluna_antes_id) VALUES (?, 'd1', 'v2', 'aprovado', 'link', ?, ?, ?, ?, ?, 'q-soc', 'k-s-fila')`
deveFalhar(db, insAprLink, ['ap9', 'l1', 'ct9', null, 'k9', 'h'], 'contato_de_outro_cliente', 'decisão com contato de outro cliente é recusada')
deveFalhar(db, insAprLink, ['ap5', 'l1', null, null, 'k1', 'h'], 'CHECK', 'decisão pelo link sem contato e sem nome é recusada')
deveFalhar(db, insAprLink, ['ap5', 'l1', 'ct1', null, 'k1', null], 'CHECK', 'chave de idempotência exige o hash do pedido')
deveFalhar(db, insAprLink, ['ap5', 'l2', null, 'Fulano', 'k5', 'h'], 'FOREIGN KEY', 'decisão por um link que não contém a demanda é recusada')
rodar(db, insItemLink, 'l2', 'd1')
rodar(db, insAprLink, 'ap6', 'l1', 'ct1', null, 'k1', 'h')
rodar(db, "UPDATE aprovacao SET anulada_em = ?, anulada_por = 'u-am' WHERE id = 'ap6'", agora())
deveFalhar(db, insAprLink, ['ap7', 'l1', 'ct1', null, 'k1', 'h'], 'UNIQUE', 'a mesma chave não se repete no mesmo link')
rodar(db, insAprLink, 'ap8', 'l2', null, 'Fulano da Silva', 'k1', 'h')
conferir(um(db, "SELECT count(*) n FROM aprovacao WHERE idempotency_key = 'k1'")!.n === 2, 'a chave vale por link (outro link aceita)')

// o cliente não muda depois do envio; as horas acompanham o cliente da demanda
deveFalhar(db, "UPDATE demanda SET cliente_id = 'c-icc', atualizado_por = 'u-am' WHERE id = 'd1'", [], 'cliente_fixo_apos_envio',
  'trocar o cliente de uma demanda já enviada é recusado')
rodar(db, "INSERT INTO apontamento (id, usuario_id, demanda_id, cliente_id, data, minutos) VALUES ('t6','u-am','d5','c-he','2030-01-02',15)")
rodar(db, "UPDATE demanda SET cliente_id = 'c-icc', atualizado_por = 'u-am' WHERE id = 'd5'")
conferir(um(db, "SELECT cliente_id c FROM apontamento WHERE id = 't6'")!.c === 'c-icc', 'as horas acompanham a troca de cliente')

// arquivos em uso não vão para o lixo
rodar(db, "INSERT INTO arquivo (id, nome, mime, bytes, sha256, enviado_por) VALUES ('a2','arte.png','image/png',10,'y','u-rafa')")
rodar(db, "INSERT INTO versao_item (id, versao_id, demanda_id, tipo, nome, arquivo_id, pos) VALUES ('vi2','v2','d1','arquivo','arte.png','a2',2)")
deveFalhar(db, "UPDATE arquivo SET excluido_em = ? WHERE id = 'a2'", [agora()], 'arquivo_em_uso', 'arquivo de versão não vai para o lixo')
deveFalhar(db, "UPDATE arquivo SET excluido_em = ? WHERE id = 'a-pdf'", [agora()], 'arquivo_em_uso', 'arquivo de anexo ativo não vai para o lixo')
rodar(db, "UPDATE cliente SET logo_arquivo_id = 'a-img5' WHERE id = 'c-he'")
rodar(db, "UPDATE anexo SET excluido_em = ? WHERE id = 'ax-d5'", agora())
deveFalhar(db, "UPDATE arquivo SET excluido_em = ? WHERE id = 'a-img5'", [agora()], 'arquivo_em_uso', 'logo do cliente não vai para o lixo')
rodar(db, "UPDATE anexo SET excluido_em = ? WHERE id = 'ax-pdf'", agora())
rodar(db, "UPDATE arquivo SET excluido_em = ? WHERE id = 'a-pdf'", agora())
conferir(um(db, "SELECT excluido_em e FROM arquivo WHERE id = 'a-pdf'")!.e !== null, 'arquivo sem uso vai para o lixo')
deveFalhar(db, insAnexo, ['ax-lixo', 'd1', 'arquivo', 'ref.pdf', 'a-pdf', null, 30], 'arquivo_no_lixo', 'anexo com arquivo no lixo é recusado')
deveFalhar(db, "INSERT INTO versao_item (id, versao_id, demanda_id, tipo, nome, arquivo_id, pos) VALUES ('vi9','v2','d1','arquivo','ref.pdf','a-pdf',9)",
  [], 'arquivo_no_lixo', 'item de versão com arquivo no lixo é recusado')
deveFalhar(db, "UPDATE cliente SET logo_arquivo_id = 'a-pdf' WHERE id = 'c-icc'", [], 'arquivo_no_lixo', 'logo com arquivo no lixo é recusado')
deveFalhar(db, "INSERT INTO cliente (id, nome, sigla, logo_arquivo_id) VALUES ('c-x','X','XX','a-pdf')", [], 'arquivo_no_lixo',
  'cliente novo com logo no lixo é recusado')

// convite/redefinição e tentativas
const insToken = "INSERT INTO token_acesso (id, usuario_id, finalidade, token_hash, expira_em) VALUES (?, 'u-rafa', ?, ?, '2030-01-01')"
rodar(db, insToken, 'tk1', 'convite', 'th1')
deveFalhar(db, insToken, ['tk2', 'convite', 'th2'], 'UNIQUE', 'dois convites pendentes para a mesma pessoa são recusados')
rodar(db, insToken, 'tk3', 'redefinicao', 'th3')
rodar(db, "UPDATE token_acesso SET revogado_em = ? WHERE id = 'tk1'", agora())
rodar(db, insToken, 'tk2', 'convite', 'th2')
conferir(um(db, "SELECT count(*) n FROM token_acesso WHERE usuario_id = 'u-rafa' AND usado_em IS NULL AND revogado_em IS NULL")!.n === 2,
  'revogar o anterior libera um novo convite')
deveFalhar(db, "INSERT INTO login_tentativa (tipo, email, ip, ok) VALUES ('outro', 'x@x.com', '1.1.1.1', 0)", [], 'CHECK',
  'tentativa só de login ou de troca de senha')

// trilhas imutáveis, notificações e evento (SSE)
rodar(db, "INSERT INTO atividade (demanda_id, ator_id, ator_tipo, tipo, dados) VALUES ('d1','u-am','usuario','demanda.movida','{}')")
deveFalhar(db, 'DELETE FROM atividade', [], 'atividade_imutavel', 'atividade não se apaga')
deveFalhar(db, "UPDATE atividade SET tipo = 'x.y'", [], 'atividade_imutavel', 'tipo da atividade não muda')
deveFalhar(db, "INSERT INTO atividade (ator_tipo, tipo) VALUES ('usuario','semponto')", [], 'CHECK', 'tipo de atividade é area.acao')
deveFalhar(db, "INSERT INTO atividade (ator_tipo, tipo) VALUES ('agente','demanda.criada')", [], 'CHECK', 'ator agente saiu do MVP')
for (const t of TIPOS_NOTIFICACAO) {
  rodar(db, "INSERT INTO notificacao (usuario_id, tipo, demanda_id, resumo) VALUES ('u-rafa', ?, 'd1', 'x')", t)
}
deveFalhar(db, "INSERT INTO notificacao (usuario_id, tipo, resumo) VALUES ('u-rafa','triagem','x')", [], 'CHECK',
  'notificação de triagem (fluxo único) é recusada')
rodar(db, "INSERT INTO evento (entidade, entidade_id, demanda_id, op, patch, campos) VALUES ('demanda','d1','d1','upsert','{\"colunaId\":\"k-s-fila\"}','[\"colunaId\"]')")
deveFalhar(db, "INSERT INTO evento (entidade, entidade_id, op, patch, publico) VALUES ('quadro_usuario','q-cri','upsert','{}','usuario')", [],
  'CHECK', 'evento para um usuário exige usuario_id')
for (const p of PUBLICOS_EVENTO) {
  rodar(db, "INSERT INTO evento (entidade, entidade_id, op, patch, publico, usuario_id) VALUES ('link_publico','l1','upsert','{}',?,'u-am')", p)
}
deveFalhar(db, "INSERT INTO evento (entidade, entidade_id, op, patch, publico) VALUES ('demanda','d1','upsert','{}','todos')", [],
  'CHECK', 'público fora de PUBLICOS_EVENTO é recusado')
conferir((um(db, "SELECT seq FROM sqlite_sequence WHERE name = 'evento'")?.seq as number) >= 1, 'seq do evento em sqlite_sequence')

// ─── Fase 2: OAuth (100) ───
const CH = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'   // base64url(sha256(verifier)) sem '=': 43 caracteres
rodar(db, `INSERT INTO oauth_cliente (id, nome, redirect_uris) VALUES ('oc1', 'Claude', '["https://claude.ai/api/mcp/auth_callback"]')`)
deveFalhar(db, "INSERT INTO oauth_cliente (id, nome, redirect_uris) VALUES ('oc9', 'X', '[]')", [], 'CHECK',
  'cliente OAuth sem redirect_uri é recusado')
deveFalhar(db, `INSERT INTO oauth_cliente (id, nome, redirect_uris, metodo_auth) VALUES ('oc9', 'X', '["https://claude.ai/x"]',
  'client_secret_post')`, [], 'CHECK', 'só cliente público (token_endpoint_auth_method none)')
const NAV = 'a'.repeat(64)   // sha256 hex do cookie do pedido
const insPedido = `INSERT INTO oauth_pedido (id, cliente_id, redirect_uri, code_challenge, escopo, resource, navegador_hash, expira_em)
  VALUES (?, ?, 'https://claude.ai/api/mcp/auth_callback', ?, 'pauta', 'https://demandas.example/mcp', ?, '2030-01-01')`
rodar(db, insPedido, 'op1', 'oc1', CH, NAV)
deveFalhar(db, insPedido, ['op9', 'oc1', CH.slice(1), NAV], 'CHECK', 'code_challenge que não tem o tamanho do S256 é recusado')
deveFalhar(db, insPedido, ['op9', 'oc1', CH.slice(1) + '=', NAV], 'CHECK', 'code_challenge fora do base64url é recusado')
deveFalhar(db, insPedido, ['op9', 'oc1', CH, null], 'NOT NULL', 'pedido sem o cookie do navegador é recusado')
deveFalhar(db, insPedido, ['op9', 'oc1', CH, 'cookie-em-claro'], 'CHECK', 'o pedido guarda só o sha256 hex do cookie')
deveFalhar(db, "UPDATE oauth_pedido SET substituir = 1 WHERE id = 'op1'", [], 'CHECK', '"substituir" só com o pedido permitido')
deveFalhar(db, "UPDATE oauth_pedido SET decisao = 'permitido', decidido_em = ? WHERE id = 'op1'", [T0], 'CHECK',
  'decisão sem quem decidiu é recusada')
deveFalhar(db, `UPDATE oauth_pedido SET decisao = 'negado', decidido_em = ?, usuario_id = 'u-rafa', codigo_hash = 'cod0',
  codigo_expira_em = ? WHERE id = 'op1'`, [T0, T1], 'CHECK', 'pedido negado não gera código')
rodar(db, `UPDATE oauth_pedido SET decisao = 'permitido', decidido_em = ?, usuario_id = 'u-rafa', codigo_hash = 'cod1',
  codigo_expira_em = ?, substituir = 1 WHERE id = 'op1'`, T0, T1)
const insConcessao = `INSERT INTO oauth_concessao (id, usuario_id, cliente_id, redirect_uri, resource)
  VALUES (?, 'u-rafa', 'oc1', 'https://claude.ai/api/mcp/auth_callback', 'https://demandas.example/mcp')`
deveFalhar(db, `INSERT INTO oauth_concessao (id, usuario_id, cliente_id, redirect_uri)
  VALUES ('cx9', 'u-rafa', 'oc1', 'https://claude.ai/api/mcp/auth_callback')`, [], 'NOT NULL', 'conexão sem a audiência (resource)')
rodar(db, insConcessao, 'cx1')
deveFalhar(db, "UPDATE oauth_concessao SET resource = 'https://outro.example/mcp' WHERE id = 'cx1'", [], 'oauth_concessao_imutavel',
  'a audiência da conexão não muda')
deveFalhar(db, insConcessao, ['cx2'], 'UNIQUE', 'uma conexão ativa por pessoa e cliente (autorizar de novo substitui)')
deveFalhar(db, "UPDATE oauth_pedido SET concessao_id = 'cx1' WHERE id = 'op1'", [], 'CHECK', 'código não usado não emitiu conexão')
rodar(db, "UPDATE oauth_pedido SET codigo_usado_em = ?, concessao_id = 'cx1' WHERE id = 'op1'", T0)
const insTokenOAuth = 'INSERT INTO oauth_token (hash, concessao_id, tipo, criado_em, expira_em) VALUES (?, ?, ?, ?, ?)'
rodar(db, insTokenOAuth, 'tk-a1', 'cx1', 'acesso', T0, T1)
rodar(db, insTokenOAuth, 'tk-r1', 'cx1', 'atualizacao', T0, T5)
deveFalhar(db, insTokenOAuth, ['tk-x', 'cx1', 'sessao', T0, T1], 'CHECK', 'tipo de token fora de TIPOS_TOKEN_OAUTH')
deveFalhar(db, insTokenOAuth, ['tk-x', 'cx1', 'acesso', T1, T0], 'CHECK', 'token que vence antes de nascer é recusado')
deveFalhar(db, "UPDATE oauth_token SET trocado_em = ? WHERE hash = 'tk-a1'", [T0], 'CHECK', 'só o refresh é trocado (rotação)')
deveFalhar(db, "UPDATE oauth_token SET filho_cifrado = 'iv.tag.cifra' WHERE hash = 'tk-r1'", [], 'CHECK',
  'o par filho só existe num refresh já trocado')
rodar(db, "UPDATE oauth_token SET trocado_em = ?, filho_cifrado = 'iv.tag.cifra' WHERE hash = 'tk-r1'", T0)
rodar(db, "UPDATE oauth_token SET filho_cifrado = NULL WHERE hash = 'tk-r1'")
deveFalhar(db, "UPDATE oauth_concessao SET usuario_id = 'u-am' WHERE id = 'cx1'", [], 'oauth_concessao_imutavel',
  'a conexão não muda de dono')
deveFalhar(db, "UPDATE oauth_concessao SET revogada_em = ? WHERE id = 'cx1'", [T1], 'CHECK', 'revogar exige o motivo')

// ─── Fase 2: via Claude (101) ───
const traco = `${PREFIXO_TRACE_MCP}0f8fad5b-d9cb-469f-a165-70867728950e`
const insTraco = 'INSERT INTO mcp_traco (trace_id, concessao_id, usuario_id, ferramenta) VALUES (?, ?, ?, ?)'
deveFalhar(db, insTraco, ['0f8fad5b-d9cb-469f-a165-70867728950e', 'cx1', 'u-rafa', 'comentar'], 'CHECK',
  'traço sem o prefixo mcp- é recusado (o navegador só manda uuid puro)')
deveFalhar(db, insTraco, [traco, 'cx1', 'u-am', 'comentar'], 'mcp_traco_de_outra_pessoa', 'traço de outra pessoa que não a dona da conexão')
deveFalhar(db, insTraco, [traco, 'cx1', 'u-rafa', 'Comentar'], 'CHECK', 'nome de ferramenta só com minúsculas e _')
rodar(db, insTraco, traco, 'cx1', 'u-rafa', 'comentar')
deveFalhar(db, "UPDATE mcp_traco SET ferramenta = 'checklist'", [], 'mcp_traco_imutavel', 'o traço não muda')
deveFalhar(db, 'DELETE FROM mcp_traco', [], 'mcp_traco_imutavel', 'o traço não se apaga')
const insAtivTraco = `INSERT INTO atividade (demanda_id, ator_id, ator_tipo, tipo, dados, trace_id)
  VALUES ('d1', ?, 'usuario', 'comentario.criado', '{}', ?)`
rodar(db, insAtivTraco, 'u-rafa', traco)
rodar(db, insAtivTraco, 'u-am', traco)
const vias = todos(db, `SELECT a.ator_id, m.trace_id IS NOT NULL AS via FROM atividade a
  LEFT JOIN mcp_traco m ON m.trace_id = a.trace_id AND m.usuario_id = a.ator_id WHERE a.trace_id = ? ORDER BY a.id`, traco)
conferir(vias.length === 2 && vias[0]!.via === 1 && vias[1]!.via === 0,
  `"via Claude" só na atividade da dona do traço (${JSON.stringify(vias)})`)
rodar(db, "UPDATE oauth_concessao SET ultimo_uso_em = ? WHERE id = 'cx1'", T1)
rodar(db, "UPDATE oauth_concessao SET revogada_em = ?, revogada_por = 'u-rafa', motivo_revogacao = 'usuario' WHERE id = 'cx1'", T2)
deveFalhar(db, "UPDATE oauth_concessao SET revogada_em = NULL, revogada_por = NULL, motivo_revogacao = NULL WHERE id = 'cx1'", [],
  'oauth_concessao_imutavel', 'conexão revogada não volta')
deveFalhar(db, "UPDATE oauth_concessao SET motivo_revogacao = 'admin' WHERE id = 'cx1'", [], 'oauth_concessao_imutavel',
  'o motivo da revogação não muda')
deveFalhar(db, "UPDATE oauth_concessao SET ultimo_uso_em = ? WHERE id = 'cx1'", [T3], 'oauth_concessao_imutavel',
  'conexão revogada não registra uso')
deveFalhar(db, insTokenOAuth, ['tk-a2', 'cx1', 'acesso', T2, T3], 'concessao_revogada', 'nenhum token nasce numa conexão revogada')
deveFalhar(db, insTraco, [`${PREFIXO_TRACE_MCP}1f8fad5b-d9cb-469f-a165-70867728950e`, 'cx1', 'u-rafa', 'comentar'],
  'concessao_revogada', 'nenhuma ferramenta escreve por uma conexão revogada')
deveFalhar(db, "DELETE FROM oauth_concessao WHERE id = 'cx1'", [], 'oauth_concessao_imutavel', 'conexão não se apaga')
rodar(db, insConcessao, 'cx2')
conferir(um(db, "SELECT count(*) n FROM oauth_concessao WHERE usuario_id = 'u-rafa' AND cliente_id = 'oc1'")!.n === 2,
  'depois de revogar, a pessoa conecta o mesmo cliente de novo')
deveFalhar(db, "DELETE FROM oauth_cliente WHERE id = 'oc1'", [], 'FOREIGN KEY', 'cliente OAuth com conexão não é podado')
rodar(db, `INSERT INTO oauth_cliente (id, nome, redirect_uris, tipo) VALUES ('oc2', 'Claude Code', '["http://127.0.0.1/callback"]', 'native')`)
rodar(db, insPedido, 'op2', 'oc2', CH, NAV)
rodar(db, "DELETE FROM oauth_cliente WHERE id = 'oc2'")
conferir(um(db, "SELECT count(*) n FROM oauth_pedido WHERE id = 'op2'")!.n === 0, 'podar o cliente sem conexão leva os pedidos dele')

// ─── Fase 2: Windsor (102) ───
const insLigacao = 'INSERT INTO cliente_conta_resultados (id, cliente_id, conector, conta_id, nome, ligada_por) VALUES (?, ?, ?, ?, ?, ?)'
rodar(db, insLigacao, 'cl1', 'c-he', 'facebook', '1000000000000001', 'HE Meta', 'u-am')
rodar(db, insLigacao, 'cl2', 'c-he', 'google_ads', '000-000-0001', 'HE Google', 'u-am')
rodar(db, insLigacao, 'cl3', 'c-icc', 'googleanalytics4', '100000001', 'Grupo GA4', 'u-am')
rodar(db, insLigacao, 'cl4', 'c-he', 'googleanalytics4', '100000001', 'Grupo GA4', 'u-am')
deveFalhar(db, insLigacao, ['cl9', 'c-he', 'facebook', '1000000000000001', 'x', 'u-am'], 'UNIQUE', 'a mesma conta duas vezes no cliente')
deveFalhar(db, insLigacao, ['cl9', 'c-he', 'tiktok', '1', 'x', 'u-am'], 'CHECK', 'conector fora de CONECTORES_WINDSOR')
deveFalhar(db, insLigacao, ['cl9', 'c-he', 'facebook', 'act_1', 'x', 'u-am'], 'CHECK', 'id com "act_" é recusado (o serviço tira o prefixo)')
deveFalhar(db, insLigacao, ['cl9', 'c-he', 'facebook', '1,2', 'x', 'u-am'], 'CHECK', 'id com vírgula é recusado (vai em select_accounts)')
const insCache = `INSERT INTO resultado_cache (cliente_id, conector, de, ate, de_anterior, ate_anterior, contas, dados, buscado_em,
  tentado_em, erro) VALUES ('c-he', 'facebook', ?, ?, ?, ?, '["1000000000000001"]', ?, ?, ?, ?)`
rodar(db, insCache, '2026-10-12', '2026-10-18', '2026-10-05', '2026-10-11', '{}', T0, T0, null)
deveFalhar(db, insCache, ['2026-10-12', '2026-10-18', '2026-10-06', '2026-10-12', '{}', T0, T0, null], 'CHECK',
  'período de comparação que encosta no atual é recusado')
deveFalhar(db, insCache, ['2026-09-12', '2026-09-18', '2026-09-05', '2026-09-11', null, T0, T0, null], 'CHECK',
  'hora da busca sem os dados é recusada')
deveFalhar(db, insCache, ['2026-08-12', '2026-08-18', '2026-08-05', '2026-08-11', null, null, T0, 'timeout'], 'CHECK',
  'erro fora de ERROS_WINDSOR')
rodar(db, "UPDATE resultado_cache SET erro = 'fora_do_ar', tentado_em = ? WHERE cliente_id = 'c-he'", T1)
conferir(um(db, "SELECT buscado_em b FROM resultado_cache WHERE cliente_id = 'c-he'")!.b === T0,
  'erro numa busca mantém os dados e a hora da busca boa de antes')
deveFalhar(db, "INSERT INTO windsor_uso (dia, chamadas, ultimo_erro) VALUES ('2030-01-02', 1, 'limite')", [], 'CHECK',
  'último erro da Windsor exige o instante')
deveFalhar(db, "INSERT INTO windsor_conta (conector, conta_id, nome, vista_em) VALUES ('facebook', 'act_1', 'X', ?)", [T0], 'CHECK',
  'lista de contas com id fora do formato é recusada')

// ─── Fase 2: agendas externas (103) ───
const insAgenda = `INSERT INTO agenda_externa (id, nome, cor, url_cifrada, url_dica, url_hash, pos, criada_por)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
rodar(db, insAgenda, 'ag1', 'Melt', 'roxo', 'iv.tag.cifra', 'calendar.google.com · agencia · …a1b2', 'h-ag1', 1024, 'u-adm')
deveFalhar(db, insAgenda, ['ag9', 'Outra', 'azul', 'x', 'y', 'h-ag1', 2048, 'u-adm'], 'UNIQUE', 'o mesmo endereço não entra duas vezes')
deveFalhar(db, insAgenda, ['ag9', 'Outra', 'laranja', 'x', 'y', 'h-ag9', 2048, 'u-adm'], 'CHECK', 'laranja nunca é cor de agenda')
deveFalhar(db, "UPDATE agenda_externa SET erro = 'http_500' WHERE id = 'ag1'", [], 'CHECK', 'erro fora de ERROS_AGENDA_EXTERNA')
deveFalhar(db, "UPDATE agenda_externa SET ok_em = ? WHERE id = 'ag1'", [T0], 'CHECK', 'busca boa sem tentativa registrada')
const insOcorrencia = `INSERT INTO agenda_ocorrencia (agenda_id, chave, titulo, dia_inteiro, inicio, fim, dia_inicio, dia_fim, local,
  link_reuniao, descricao, privado) VALUES ('ag1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
rodar(db, insOcorrencia, 'b1@google.com', 'Reunião', 0, '2026-10-20T13:00:00.000Z', '2026-10-20T14:00:00.000Z', '2026-10-20',
  '2026-10-20', 'Sala 2', 'https://meet.google.com/abc-defg-hij', 'Pauta da semana', 0)
rodar(db, insOcorrencia, 'c2@google.com', 'Congresso', 1, null, null, '2026-11-10', '2026-11-12', null, null, null, 0)
rodar(db, insOcorrencia, 'g8@google.com', 'Ocupado', 0, '2026-10-30T17:00:00.000Z', '2026-10-30T18:00:00.000Z', '2026-10-30',
  '2026-10-30', null, null, null, 1)
rodar(db, insOcorrencia, 'h11@google.com', 'Virada', 0, '2026-10-24T01:00:00.000Z', '2026-10-24T04:00:00.000Z', '2026-10-23',
  '2026-10-24', null, null, null, 0)
deveFalhar(db, insOcorrencia, ['x1', 'X', 1, '2026-10-20T13:00:00.000Z', '2026-10-20T14:00:00.000Z', '2026-10-20', '2026-10-20',
  null, null, null, 0], 'CHECK', 'dia inteiro não guarda instantes')
deveFalhar(db, insOcorrencia, ['x1', 'X', 0, '2026-10-20T13:00:00.000Z', '2026-10-20T12:00:00.000Z', '2026-10-20', '2026-10-20',
  null, null, null, 0], 'CHECK', 'fim antes do início é recusado')
deveFalhar(db, insOcorrencia, ['x1', 'X', 1, null, null, '2026-10-21', '2026-10-20', null, null, null, 0], 'CHECK',
  'último dia antes do primeiro é recusado')
deveFalhar(db, insOcorrencia, ['x1', 'X', 1, null, null, '2026-10-21', '2026-10-21', null, 'http://zoom.us/j/1', null, 0], 'CHECK',
  'link de reunião só https')
for (const ruim of ['https://evil.example/meet.google.com/x', 'https://meet.google.com.evil.example/x', 'https://evilzoom.us/j/1',
  'https://meet.google.com:8443/x', 'https://u:p@meet.google.com/x', 'https://MEET.google.com/x', 'https://meet.google.com']) {
  deveFalhar(db, insOcorrencia, ['x1', 'X', 1, null, null, '2026-10-21', '2026-10-21', null, ruim, null, 0], 'CHECK',
    `link de reunião fora de Meet, Zoom e Teams é recusado (${ruim})`)
}
for (const [i, bom] of ['https://us02web.zoom.us/j/1', 'https://teams.microsoft.com/l/meetup-join/x', 'https://zoom.us/j/2',
  'https://teams.live.com/meet/3'].entries()) {
  rodar(db, insOcorrencia, `ok${i}`, 'X', 1, null, null, '2026-10-21', '2026-10-21', null, bom, null, 0)
}
deveFalhar(db, insOcorrencia, ['x1', 'Ocupado', 1, null, null, '2026-10-21', '2026-10-21', 'Sala 2', null, null, 1], 'CHECK',
  'evento privado não guarda local, descrição nem link')
deveFalhar(db, insOcorrencia, ['b1@google.com', 'Dup', 1, null, null, '2026-10-21', '2026-10-21', null, null, null, 0], 'UNIQUE',
  'a mesma chave duas vezes na agenda')
const noDia24 = todos(db, `SELECT chave FROM agenda_ocorrencia WHERE agenda_id = 'ag1' AND dia_inicio <= ? AND dia_fim >= ?
  ORDER BY chave`, '2026-10-24', '2026-10-24').map((l) => l.chave)
conferir(JSON.stringify(noDia24) === JSON.stringify(['h11@google.com']),
  `evento que atravessa a meia-noite aparece também no dia seguinte (${JSON.stringify(noDia24)})`)
const no11 = todos(db, "SELECT chave FROM agenda_ocorrencia WHERE dia_inicio <= '2026-11-11' AND dia_fim >= '2026-11-11'")
conferir(no11.length === 1 && no11[0]!.chave === 'c2@google.com', 'dia inteiro de vários dias cai em cada dia dele')
rodar(db, "DELETE FROM agenda_externa WHERE id = 'ag1'")
conferir(um(db, "SELECT count(*) n FROM agenda_ocorrencia WHERE agenda_id = 'ag1'")!.n === 0, 'excluir a agenda leva as ocorrências')

integridade('dentro da fumaça')
db.exec('ROLLBACK')
integridade('após desfazer a fumaça')

const tabelas = todos(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'demanda_fts%' ORDER BY name")
console.log(`${tabelas.length} tabelas: ${tabelas.map((t) => t.name).join(', ')}`)
console.log(`${checagens} checagens, ${falhas} falha(s)`)
db.close()
process.exit(falhas === 0 ? 0 : 1)
