/**
 * Aplica server/migracoes/*.sql num banco :memory: (ou no arquivo passado como argumento, que precisa ser novo),
 * do mesmo jeito que o runner do servidor: cada arquivo numa transação, registrado em _migracoes.
 * Depois roda PRAGMA foreign_key_check e integrity_check, confere os seeds contra shared/tipos e faz um teste de
 * fumaça dos gatilhos dentro de uma transação desfeita no fim.
 *
 *   node server/scripts/verificar-migracoes.ts            # :memory:
 *   node server/scripts/verificar-migracoes.ts /tmp/x.db  # arquivo novo, para inspecionar depois
 */
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AGRUPAMENTOS, CATEGORIAS, CHAVES_CONFIG, CORES, CORES_ETAPA, FAIXAS_CONFIG, LAYOUTS, PUBLICOS_EVENTO, QUEM_TRANSICAO,
  REQUISITOS_TRANSICAO, TIPOS_CAMPO,
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

// ─────────────────────────── 3. seeds de configuração ───────────────────────────
const naoVazias = ['usuario', 'cliente', 'demanda', 'sessao']
for (const t of naoVazias) {
  conferir(um(db, `SELECT count(*) n FROM ${t}`)!.n === 0, `seed não cria ${t} (só configuração)`)
}

const equipes = todos(db, 'SELECT * FROM equipe ORDER BY pos')
conferir(
  JSON.stringify(equipes.map((e) => e.nome)) ===
    JSON.stringify(['Atendimento', 'Criação', 'Social', 'Web', 'Tráfego', 'Gestão']),
  'equipes semeadas: Atendimento, Criação, Social, Web, Tráfego, Gestão',
)
for (const e of equipes) conferir((CORES as readonly string[]).includes(e.cor as string), `cor válida na equipe ${e.nome}`)

const etapas = todos(db, "SELECT * FROM etapa WHERE fluxo_id = 'fl-padrao' ORDER BY pos")
const catsEtapas = etapas.map((e) => e.categoria as string)
conferir(etapas.length === 10, '10 etapas no fluxo padrão')
conferir(new Set(catsEtapas).size === CATEGORIAS.length, 'uma etapa por categoria no fluxo padrão (o MVP depende disso)')
for (const c of CATEGORIAS) conferir(catsEtapas.includes(c), `categoria ${c} tem etapa`)
for (const e of etapas) conferir((CORES_ETAPA as readonly string[]).includes(e.cor as string), `cor da etapa ${e.nome}`)
conferir(um(db, "SELECT pausa_sla p FROM etapa WHERE categoria = 'cliente'")!.p === 1, 'Com o cliente pausa o SLA')

const transicoes = todos(db, 'SELECT * FROM transicao')
for (const t of transicoes) {
  const quem = JSON.parse(t.quem as string) as string[]
  const requer = JSON.parse(t.requer as string) as string[]
  const rot = `${t.de_categoria}→${t.para_categoria}`
  conferir(quem.length > 0 && quem.every((q) => (QUEM_TRANSICAO as readonly string[]).includes(q)), `quem válido em ${rot}`)
  conferir(requer.every((r) => (REQUISITOS_TRANSICAO as readonly string[]).includes(r)), `requer válido em ${rot}`)
  conferir(String(t.negado).endsWith('.'), `mensagem 'negado' em ${rot}`)
}
const temTransicao = (de: string, para: string) => transicoes.some((t) => t.de_categoria === de && t.para_categoria === para)
for (const [de, para] of [
  ['triagem', 'fila'], ['fila', 'producao'], ['producao', 'revisao'], ['ajuste', 'revisao'], ['revisao', 'ajuste'],
  ['revisao', 'cliente'], ['revisao', 'concluido'], ['cliente', 'ajuste'], ['cliente', 'aprovado'],
  ['cliente', 'publicacao'], ['cliente', 'concluido'], ['aprovado', 'publicacao'], ['aprovado', 'concluido'],
  ['publicacao', 'concluido'], ['*', 'cancelado'], ['concluido', 'anterior'], ['cancelado', 'anterior'],
] as const) conferir(temTransicao(de, para), `transição ${de}→${para} (SPEC §7.1)`)
const requerDe = (de: string, para: string) =>
  JSON.parse(String(transicoes.find((t) => t.de_categoria === de && t.para_categoria === para)?.requer ?? '[]')) as string[]
conferir(JSON.stringify(requerDe('cliente', 'aprovado')) === '["retorno"]',
  'cliente→aprovado requer só retorno (soltar um Post em Aprovado abre Registrar retorno, sem 422)')
conferir(requerDe('cliente', 'publicacao').includes('retorno'), 'cliente→publicacao requer retorno')

const tipos = todos(db, 'SELECT * FROM tipo_peca')
conferir(tipos.length <= 13, 'no máximo 12 tipos + Outro')
conferir(tipos.some((t) => t.slug === 'outro'), 'tipo Outro existe')
const outro = tipos.find((t) => t.slug === 'outro')!
conferir(um(db, 'SELECT count(*) n FROM tipo_peca_campo WHERE tipo_peca_id = ? AND obrigatorio = 1', outro.id)!.n === 0,
  'Outro sem campos obrigatórios')
for (const t of tipos) {
  const obrig = um(db, 'SELECT count(*) n FROM tipo_peca_campo WHERE tipo_peca_id = ? AND obrigatorio = 1', t.id)!.n as number
  conferir(obrig <= 2, `seed: no máximo 2 obrigatórios em ${t.nome}`)
  conferir(Array.isArray(JSON.parse(t.checklist_padrao as string)), `checklist_padrao é lista em ${t.nome}`)
  if (t.publicacao === 1) conferir(t.aprovacao_cliente === 1, `${t.nome}: publicação exige aprovação do cliente`)
}
const campos = todos(db, 'SELECT * FROM tipo_peca_campo')
for (const c of campos) {
  conferir((TIPOS_CAMPO as readonly string[]).includes(c.tipo as string), `tipo de campo válido em ${c.id}`)
  conferir(typeof c.ajuda === 'string' && (c.ajuda as string).length > 0, `campo ${c.id} tem ajuda`)
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

const visoes = todos(db, 'SELECT * FROM visao ORDER BY pos')
conferir(
  JSON.stringify(visoes.map((v) => v.slug)) ===
    JSON.stringify(['criacao', 'social', 'web', 'trafego', 'meus-clientes', 'geral']),
  '6 visões semeadas (SPEC §5.1)',
)
type FiltroSeed = { categorias?: string[]; equipes?: string[]; ou?: FiltroSeed[] }
for (const v of visoes) {
  const f = JSON.parse(v.filtros as string) as FiltroSeed
  const rec = JSON.parse(v.recolhidas as string) as string[]
  conferir((LAYOUTS as readonly string[]).includes(v.layout as string), `layout em ${v.slug}`)
  conferir((AGRUPAMENTOS as readonly string[]).includes(v.agrupar_por as string), `agrupamento em ${v.slug}`)
  for (const g of [f, ...(f.ou ?? [])]) {
    conferir((g.categorias ?? []).every((c) => (CATEGORIAS as readonly string[]).includes(c)), `categorias do filtro em ${v.slug}`)
    conferir(!(g.categorias ?? []).includes('triagem'), `${v.slug}: a Triagem não aparece em visão`)
    for (const eq of g.equipes ?? []) conferir(equipes.some((e) => e.id === eq), `equipe ${eq} do filtro existe`)
    conferir(g === f || g.ou === undefined, `${v.slug}: "ou" tem um nível só`)
  }
  conferir(rec.every((c) => (CATEGORIAS as readonly string[]).includes(c)), `recolhidas em ${v.slug}`)
}
const social = JSON.parse(String(visoes.find((v) => v.slug === 'social')?.filtros ?? '{}')) as FiltroSeed
conferir((social.ou ?? []).some((g) => g.equipes === undefined && (g.categorias ?? []).includes('publicacao')),
  'visão Social traz o Agendar de qualquer equipe ("ou")')

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
conferir(valorConfig('passos.tipos_revisados_em') === null, 'tipos ainda não revisados no seed')

const indices = todos(db, "SELECT name FROM sqlite_master WHERE type = 'index'").map((i) => i.name as string)
for (const nome of ['demanda_arquivo_ix', 'demanda_arquivo_cli_ix', 'token_acesso_pendente_uk', 'aprovacao_idem_uk',
  'login_tentativa_email_ix', 'login_tentativa_ip_ix']) conferir(indices.includes(nome), `índice ${nome}`)
const plano = todos(db, `EXPLAIN QUERY PLAN SELECT id FROM demanda
  WHERE excluido_em IS NULL AND (arquivado_em IS NOT NULL OR status IN ('concluido','cancelado'))
    AND coalesce(arquivado_em, concluida_em, status_desde) >= '2026-10-01'`).map((l) => String(l.detail)).join(' | ')
conferir(plano.includes('demanda_arquivo'), `consulta do Arquivo usa o índice parcial (${plano})`)

// ─────────────────────────── 4. fumaça dos gatilhos (desfeita no fim) ───────────────────────────
db.exec('BEGIN')
const agora = () => new Date().toISOString()
rodar(db, "INSERT INTO usuario (id, nome, apelido, email, papel) VALUES ('u-am','Pri','Pri','pri@x.com','atendimento')")
rodar(db, "INSERT INTO usuario (id, nome, apelido, email, papel) VALUES ('u-rafa','Rafael','Rafa','rafa@x.com','executor')")
rodar(db, "INSERT INTO cliente (id, nome, sigla, atendimento_id) VALUES ('c-he','Hospital Evangélico','HE','u-am')")
deveFalhar(db, "INSERT INTO cliente (id, nome, sigla) VALUES ('c-x','X','he')", [], 'CHECK', 'sigla em minúscula é recusada')
deveFalhar(db, "INSERT INTO usuario (id, nome, apelido, email) VALUES ('u-y','Y','rafa','y@x.com')", [], 'UNIQUE',
  'apelido repetido entre ativos é recusado')

const ins = `INSERT INTO demanda (id, numero, titulo, cliente_id, tipo_peca_id, equipe_id, fluxo_id, etapa_id, status,
  status_desde, bola, com_quem_id, solicitante_id, criado_por, posicao, briefing_md)
  VALUES (?, ?, ?, ?, 'tp-carrossel', 'eq-criacao', 'fl-padrao', ?, ?, ?, 'agencia', ?, 'u-am', 'u-am', ?, ?)`
rodar(db, ins, 'd1', 1, 'Carrossel Outubro Rosa', 'c-he', 'et-triagem', 'triagem', agora(), 'u-am', 1024, 'Ação de conscientização')
deveFalhar(db, ins, ['d2', 2, 'X', 'c-he', 'et-fila', 'producao', agora(), null, 2048, ''], 'demanda_status_diferente',
  'status diferente da categoria é recusado')
deveFalhar(db, ins, ['d3', 3, 'X', null, 'et-fila', 'fila', agora(), null, 3072, ''], 'CHECK', 'sem cliente fora da triagem é recusado')

conferir(um(db, "SELECT count(*) n FROM demanda_etapa_hist WHERE demanda_id = 'd1' AND saiu_em IS NULL")!.n === 1,
  'insert abre a linha do histórico de etapa')

deveFalhar(db, "UPDATE demanda SET etapa_id = 'et-fila', status = 'fila', atualizado_por = 'u-am' WHERE id = 'd1'", [],
  'demanda_etapa_anterior', 'trocar de etapa sem gravar etapa_anterior_id é recusado')
const instanteMover = '2030-01-02T12:00:00.000Z'   // como o relógio fixo dos testes: o histórico usa o atualizado_em do app
rodar(db, "UPDATE demanda SET etapa_id = 'et-fila', etapa_anterior_id = 'et-triagem', status = 'fila', status_desde = ?, atualizado_em = ?, com_quem_id = 'u-rafa', responsavel_id = 'u-rafa', atualizado_por = 'u-am' WHERE id = 'd1'",
  instanteMover, instanteMover)
const hist = todos(db, "SELECT * FROM demanda_etapa_hist WHERE demanda_id = 'd1' ORDER BY id")
conferir(hist.length === 2 && hist[0]!.saiu_em !== null && hist[1]!.saiu_em === null && hist[1]!.por === 'u-am',
  'mover fecha o histórico anterior e abre outro com o ator')
conferir(hist[0]!.saiu_em === instanteMover && hist[1]!.entrou_em === instanteMover,
  `histórico usa o atualizado_em gravado pelo app (${hist[0]!.saiu_em}, ${hist[1]!.entrou_em})`)
const rev1 = um(db, "SELECT rev FROM demanda WHERE id = 'd1'")!.rev as number
conferir(rev1 === 2, `trocar etapa sobe o rev (rev=${rev1})`)
rodar(db, "UPDATE demanda SET posicao = 99, atualizado_por = 'u-am' WHERE id = 'd1'")
conferir(um(db, "SELECT rev FROM demanda WHERE id = 'd1'")!.rev === rev1, 'mudar só a posição não sobe o rev')
rodar(db, "UPDATE demanda SET titulo = 'Carrossel Outubro Rosa v2', rev = rev + 1, atualizado_por = 'u-am' WHERE id = 'd1'")
conferir(um(db, "SELECT rev FROM demanda WHERE id = 'd1'")!.rev === rev1 + 1, 'rev subido pelo serviço não sobe de novo')
rodar(db, "UPDATE demanda SET responsavel_sugerido_id = 'u-rafa', atualizado_por = 'u-am' WHERE id = 'd1'")
conferir(um(db, "SELECT rev FROM demanda WHERE id = 'd1'")!.rev === rev1 + 2, 'responsável sugerido sobe o rev (PATCH aceita)')
rodar(db, "UPDATE demanda SET prazo_manual = 1, atualizado_por = 'u-am' WHERE id = 'd1'")
conferir(um(db, "SELECT rev FROM demanda WHERE id = 'd1'")!.rev === rev1 + 3, 'prazo manual sobe o rev (PATCH aceita)')
deveFalhar(db, "UPDATE demanda SET revisao_ok_em = ?, atualizado_por = 'u-am' WHERE id = 'd1'", [agora()], 'CHECK',
  'ok de revisão exige quem deu')
deveFalhar(db, "UPDATE demanda SET etapa_id = 'et-revisao', etapa_anterior_id = 'et-fila', status = 'revisao', revisao_ok_em = ?, revisao_ok_por = 'u-am', atualizado_por = 'u-am' WHERE id = 'd1'",
  [agora()], 'demanda_revisao_ok', 'entrar em Revisão com o ok da entrega anterior é recusado')

conferir(todos(db, "SELECT rowid FROM demanda_fts WHERE demanda_fts MATCH 'acao'").length === 1, 'busca ignora acento')
conferir(todos(db, "SELECT rowid FROM demanda_fts WHERE demanda_fts MATCH 'outub*'").length === 1, 'busca por prefixo')
conferir(todos(db, "SELECT rowid FROM demanda_fts WHERE demanda_fts MATCH 'v2'").length === 1, 'busca acompanha o título novo')

deveFalhar(db, "UPDATE demanda SET numero = 7 WHERE id = 'd1'", [], 'demanda_numero_fixo', 'número não muda')
deveFalhar(db, "DELETE FROM demanda WHERE id = 'd1'", [], 'demanda_nao_se_apaga', 'demanda não se apaga')
deveFalhar(db, "DELETE FROM usuario WHERE id = 'u-rafa'", [], 'usuario_nao_se_apaga', 'usuário não se apaga')
deveFalhar(db, "UPDATE demanda SET prioridade = 2 WHERE id = 'd1'", [], 'CHECK', 'fura-pauta sem motivo é recusado')

// checklists e contadores
rodar(db, "INSERT INTO checklist (id, demanda_id, titulo, pos) VALUES ('ck1','d1','Padrão',1024)")
rodar(db, "INSERT INTO checklist_item (id, checklist_id, demanda_id, texto, pos) VALUES ('i1','ck1','d1','a',1),('i2','ck1','d1','b',2)")
rodar(db, "UPDATE checklist_item SET feito_em = ?, feito_por = 'u-rafa' WHERE id = 'i1'", agora())
let cont = um(db, "SELECT n_check_total t, n_check_feitos f FROM demanda WHERE id = 'd1'")!
conferir(cont.t === 2 && cont.f === 1, `contadores do checklist (2/1): ${JSON.stringify(cont)}`)
deveFalhar(db, "INSERT INTO checklist_item (id, checklist_id, demanda_id, texto, pos) VALUES ('i9','ck1','outra','x',3)", [],
  'FOREIGN KEY', 'item com demanda diferente da do checklist é recusado')
rodar(db, "DELETE FROM checklist WHERE id = 'ck1'")
cont = um(db, "SELECT n_check_total t, n_check_feitos f FROM demanda WHERE id = 'd1'")!
conferir(cont.t === 0 && cont.f === 0, `apagar checklist zera os contadores (cascade): ${JSON.stringify(cont)}`)

// anexos e arquivo
rodar(db, "INSERT INTO arquivo (id, nome, mime, bytes, sha256, enviado_por) VALUES ('a1','print.png','image/png',10,'x','u-am')")
rodar(db, "INSERT INTO anexo (id, demanda_id, tipo, nome, arquivo_id, pos) VALUES ('ax1','d1','arquivo','print.png','a1',1)")
rodar(db, "INSERT INTO anexo (id, demanda_id, tipo, nome, url, pos) VALUES ('ax2','d1','link','Drive','https://drive.google.com/x',2)")
conferir(um(db, "SELECT n_anexos n FROM demanda WHERE id = 'd1'")!.n === 2, 'n_anexos conta anexos')
rodar(db, "UPDATE anexo SET excluido_em = ? WHERE id = 'ax2'", agora())
conferir(um(db, "SELECT n_anexos n FROM demanda WHERE id = 'd1'")!.n === 1, 'n_anexos ignora excluídos')
deveFalhar(db, "INSERT INTO anexo (id, demanda_id, tipo, nome, url, pos) VALUES ('ax3','d1','link','x','http://x',3)", [],
  'CHECK', 'link sem https é recusado')
deveFalhar(db, "INSERT INTO anexo (id, demanda_id, tipo, nome, pos) VALUES ('ax4','d1','link','x',4)", [], 'CHECK',
  'anexo ativo sem url é recusado')
rodar(db, "INSERT INTO anexo (id, demanda_id, tipo, nome, pos, excluido_em) VALUES ('ax5','d1','link','Anexo removido',5,?)", agora())
conferir(um(db, "SELECT url FROM anexo WHERE id = 'ax5'")!.url === null, 'anexo excluído (demanda anonimizada) fica sem url')

// arquivos em uso não vão para o lixo
deveFalhar(db, "UPDATE arquivo SET excluido_em = ? WHERE id = 'a1'", [agora()], 'arquivo_em_uso', 'arquivo de anexo ativo não vai para o lixo')
rodar(db, "INSERT INTO arquivo (id, nome, mime, bytes, sha256, enviado_por) VALUES ('a3','logo.png','image/png',10,'z','u-am')")
rodar(db, "UPDATE cliente SET logo_arquivo_id = 'a3' WHERE id = 'c-he'")
deveFalhar(db, "UPDATE arquivo SET excluido_em = ? WHERE id = 'a3'", [agora()], 'arquivo_em_uso', 'logo do cliente não vai para o lixo')

// comentários
deveFalhar(db, "INSERT INTO comentario (id, demanda_id, autor_id, corpo_md) VALUES ('cm1','d1','u-am','')", [], 'CHECK',
  'comentário vazio é recusado')
rodar(db, "INSERT INTO comentario (id, demanda_id, autor_id, corpo_md, excluido_em) VALUES ('cm2','d1','u-am','',?)", agora())
conferir(um(db, "SELECT corpo_md c FROM comentario WHERE id = 'cm2'")!.c === '', 'comentário excluído fica com o corpo vazio')

// rodadas, versões, envio, aprovação
rodar(db, "INSERT INTO rodada (id, demanda_id, numero, origem, prazo, prazo_original) VALUES ('r1','d1',1,'inicial','2026-10-16','2026-10-16')")
deveFalhar(db, "INSERT INTO rodada (id, demanda_id, numero, origem) VALUES ('r2','d1',2,'cliente')", [], 'CHECK',
  'rodada de ajuste sem motivo e prazo é recusada')
rodar(db, "INSERT INTO versao (id, demanda_id, numero, rodada_id, criada_por) VALUES ('v1','d1',1,'r1','u-rafa')")
rodar(db, "INSERT INTO versao_item (id, versao_id, demanda_id, tipo, nome, url, provedor, pos) VALUES ('vi1','v1','d1','link','Arte','https://drive.google.com/file/d/abc','drive',1)")
let d = um(db, "SELECT n_versoes n, versao_atual_id va, versao_enviada_id ve FROM demanda WHERE id = 'd1'")!
conferir(d.n === 1 && d.va === 'v1' && d.ve === null, `versão atualiza n_versoes/versao_atual_id: ${JSON.stringify(d)}`)
rodar(db, "UPDATE versao SET enviada_cliente_em = ?, enviada_via = 'fora' WHERE id = 'v1'", agora())
d = um(db, "SELECT versao_enviada_id ve FROM demanda WHERE id = 'd1'")!
conferir(d.ve === 'v1', 'envio marca versao_enviada_id')
deveFalhar(db, "UPDATE versao SET enviada_via = 'link' WHERE id = 'v1'", [], 'versao_imutavel', 'primeiro envio não muda')
deveFalhar(db, "DELETE FROM versao WHERE id = 'v1'", [], 'versao_imutavel', 'versão não se apaga')
deveFalhar(db, "UPDATE versao_item SET url = 'https://outro' WHERE id = 'vi1'", [], 'versao_item_imutavel', 'item de versão não troca de link')
rodar(db, "INSERT INTO envio (id, demanda_id, versao_id, via, canal, enviado_por) VALUES ('e1','d1','v1','fora','whatsapp','u-am')")
deveFalhar(db, "UPDATE envio SET canal = 'email' WHERE id = 'e1'", [], 'envio_imutavel', 'envio é imutável')

rodar(db, "INSERT INTO cliente_contato (id, cliente_id, nome, padrao) VALUES ('ct1','c-he','Fulana',1)")
deveFalhar(db, "INSERT INTO cliente_contato (id, cliente_id, nome, padrao) VALUES ('ct2','c-he','Beltrana',1)", [], 'UNIQUE',
  'um só contato padrão por cliente')
rodar(db, "INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, canal, contato_id, registrado_por, responsavel_anterior_id) VALUES ('ap1','d1','v1','aprovado','manual','whatsapp','ct1','u-am','u-rafa')")
deveFalhar(db, "UPDATE aprovacao SET responsavel_anterior_id = 'u-am' WHERE id = 'ap1'", [], 'aprovacao_imutavel',
  'responsável anterior é imutável (anular restaura dele)')
deveFalhar(db, "INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, registrado_por) VALUES ('ap2','d1','v1','aprovado','manual','u-am')",
  [], 'UNIQUE', 'uma decisão válida por versão')
deveFalhar(db, "INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, registrado_por) VALUES ('ap3','d1','v1','ajuste','manual','u-am')",
  [], 'CHECK', 'ajuste sem comentário é recusado')
deveFalhar(db, "UPDATE aprovacao SET decisao = 'ajuste' WHERE id = 'ap1'", [], 'aprovacao_imutavel', 'decisão é imutável')
rodar(db, "UPDATE aprovacao SET anulada_em = ?, anulada_por = 'u-am' WHERE id = 'ap1'", agora())
rodar(db, "INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, registrado_por) VALUES ('ap4','d1','v1','aprovado','manual','u-am')")
conferir(um(db, "SELECT count(*) n FROM aprovacao WHERE versao_id = 'v1'")!.n === 2, 'anular libera nova decisão na versão')
deveFalhar(db, "UPDATE demanda SET aprovada_em = ? WHERE id = 'd1'", [agora()], 'CHECK', 'aprovada_em exige aprovada_versao_id')
rodar(db, "UPDATE demanda SET aprovada_em = ?, aprovada_versao_id = 'v1', atualizado_por = 'u-am' WHERE id = 'd1'", agora())
deveFalhar(db, "UPDATE demanda SET aprovada_versao_id = 'v-inexistente', atualizado_por = 'u-am' WHERE id = 'd1'", [],
  'FOREIGN KEY', 'versão aprovada precisa ser da mesma demanda')

// identidade na trilha: contato do cliente da demanda; link e idempotência
rodar(db, "INSERT INTO cliente (id, nome, sigla) VALUES ('c-icc','ICC','ICC')")
rodar(db, "INSERT INTO cliente_contato (id, cliente_id, nome) VALUES ('ct9','c-icc','Beltrana')")
const insLink = 'INSERT INTO link_publico (id, token_hash, token_cifrado, cliente_id, contato_id, expira_em, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)'
deveFalhar(db, insLink, ['l9', 'h9', 'c9', 'c-he', 'ct9', '2030-01-01', 'u-am'], 'FOREIGN KEY', 'link com contato de outro cliente é recusado')
rodar(db, insLink, 'l1', 'h1', 'c1', 'c-he', 'ct1', '2030-01-01', 'u-am')
rodar(db, insLink, 'l2', 'h2', 'c2', 'c-he', null, '2030-01-01', 'u-am')
deveFalhar(db, "INSERT INTO envio (id, demanda_id, versao_id, via, canal, contato_id, enviado_por) VALUES ('e9','d1','v1','fora','whatsapp','ct9','u-am')",
  [], 'contato_de_outro_cliente', 'envio para contato de outro cliente é recusado')
rodar(db, "INSERT INTO versao (id, demanda_id, numero, rodada_id, criada_por) VALUES ('v2','d1',2,'r1','u-rafa')")
rodar(db, "INSERT INTO envio (id, demanda_id, versao_id, via, link_id, contato_id, enviado_por) VALUES ('e2','d1','v2','link','l1','ct1','u-am')")
const insAprLink = `INSERT INTO aprovacao (id, demanda_id, versao_id, decisao, via, link_id, contato_id, nome_informado,
  idempotency_key, idempotency_hash) VALUES (?, 'd1', 'v2', 'aprovado', 'link', ?, ?, ?, ?, ?)`
deveFalhar(db, insAprLink, ['ap9', 'l1', 'ct9', null, 'k9', 'h'], 'contato_de_outro_cliente', 'decisão com contato de outro cliente é recusada')
deveFalhar(db, insAprLink, ['ap5', 'l1', null, null, 'k1', 'h'], 'CHECK', 'decisão pelo link sem contato e sem nome é recusada')
deveFalhar(db, insAprLink, ['ap5', 'l1', 'ct1', null, 'k1', null], 'CHECK', 'chave de idempotência exige o hash do pedido')
rodar(db, insAprLink, 'ap6', 'l1', 'ct1', null, 'k1', 'h')
rodar(db, "UPDATE aprovacao SET anulada_em = ?, anulada_por = 'u-am' WHERE id = 'ap6'", agora())
deveFalhar(db, insAprLink, ['ap7', 'l1', 'ct1', null, 'k1', 'h'], 'UNIQUE', 'a mesma chave não se repete no mesmo link')
rodar(db, insAprLink, 'ap8', 'l2', null, 'Fulano da Silva', 'k1', 'h')
conferir(um(db, "SELECT count(*) n FROM aprovacao WHERE idempotency_key = 'k1'")!.n === 2, 'a chave vale por link (outro link aceita)')

rodar(db, "INSERT INTO arquivo (id, nome, mime, bytes, sha256, enviado_por) VALUES ('a2','arte.png','image/png',10,'y','u-rafa')")
rodar(db, "INSERT INTO versao_item (id, versao_id, demanda_id, tipo, nome, arquivo_id, pos) VALUES ('vi2','v2','d1','arquivo','arte.png','a2',2)")
deveFalhar(db, "UPDATE arquivo SET excluido_em = ? WHERE id = 'a2'", [agora()], 'arquivo_em_uso', 'arquivo de versão não vai para o lixo')
rodar(db, "UPDATE anexo SET excluido_em = ? WHERE id = 'ax1'", agora())
rodar(db, "UPDATE arquivo SET excluido_em = ? WHERE id = 'a1'", agora())
conferir(um(db, "SELECT excluido_em e FROM arquivo WHERE id = 'a1'")!.e !== null, 'arquivo sem uso vai para o lixo')

// convite/redefinição: um pendente por pessoa e finalidade
const insToken = "INSERT INTO token_acesso (id, usuario_id, finalidade, token_hash, expira_em) VALUES (?, 'u-rafa', ?, ?, '2030-01-01')"
rodar(db, insToken, 'tk1', 'convite', 'th1')
deveFalhar(db, insToken, ['tk2', 'convite', 'th2'], 'UNIQUE', 'dois convites pendentes para a mesma pessoa são recusados')
rodar(db, insToken, 'tk3', 'redefinicao', 'th3')
rodar(db, "UPDATE token_acesso SET revogado_em = ? WHERE id = 'tk1'", agora())
rodar(db, insToken, 'tk2', 'convite', 'th2')
conferir(um(db, "SELECT count(*) n FROM token_acesso WHERE usuario_id = 'u-rafa' AND usado_em IS NULL AND revogado_em IS NULL")!.n === 2,
  'revogar o anterior libera um novo convite')
rodar(db, "INSERT INTO login_tentativa (tipo, email, ip, ok) VALUES ('senha', 'rafa@x.com', '203.0.113.9', 0)")
deveFalhar(db, "INSERT INTO login_tentativa (tipo, email, ip, ok) VALUES ('outro', 'x@x.com', '1.1.1.1', 0)", [], 'CHECK',
  'tentativa só de login ou de troca de senha')
const colunasCliente = todos(db, 'PRAGMA table_info(cliente)').map((c) => c.name as string)
conferir(!colunasCliente.includes('logo_url'), 'cliente sem logo por URL externa (CSP)')

// apontamentos
rodar(db, "INSERT INTO apontamento (id, usuario_id, demanda_id, cliente_id, data, minutos) VALUES ('t1','u-rafa','d1','c-he','2026-10-14',90),('t2','u-am','d1','c-he','2026-10-14',30)")
conferir(um(db, "SELECT minutos_registrados m FROM demanda WHERE id = 'd1'")!.m === 120, 'minutos_registrados soma apontamentos')
rodar(db, "UPDATE apontamento SET excluido_em = ? WHERE id = 't2'", agora())
conferir(um(db, "SELECT minutos_registrados m FROM demanda WHERE id = 'd1'")!.m === 90, 'minutos_registrados ignora excluídos')

// trilhas imutáveis e configuração
rodar(db, "INSERT INTO atividade (demanda_id, ator_id, ator_tipo, tipo, dados) VALUES ('d1','u-am','usuario','demanda.criada','{}')")
deveFalhar(db, "DELETE FROM atividade", [], 'atividade_imutavel', 'atividade não se apaga')
deveFalhar(db, "UPDATE atividade SET tipo = 'x.y'", [], 'atividade_imutavel', 'tipo da atividade não muda')
deveFalhar(db, "DELETE FROM demanda_etapa_hist", [], 'demanda_etapa_hist_imutavel', 'histórico de etapa não se apaga')
deveFalhar(db, "INSERT INTO atividade (ator_tipo, tipo) VALUES ('usuario','semponto')", [], 'CHECK', 'tipo de atividade é area.acao')
deveFalhar(db, "UPDATE etapa SET categoria = 'fila' WHERE id = 'et-revisao'", [], 'etapa_categoria_fixa', 'categoria da etapa é fixa')
rodar(db, "INSERT INTO tipo_peca_campo (id, tipo_peca_id, chave, rotulo, tipo, obrigatorio, ajuda, pos) VALUES ('tcx','tp-post','extra1','Extra','texto',1,'x',9000)")
deveFalhar(db, "INSERT INTO tipo_peca_campo (id, tipo_peca_id, chave, rotulo, tipo, obrigatorio, ajuda, pos) VALUES ('tcy','tp-post','extra2','Extra','texto',1,'x',9001)",
  [], 'tipo_peca_max_3_obrigatorios', 'no máximo 3 campos obrigatórios por tipo')
rodar(db, "INSERT INTO ausencia (id, usuario_id, de, ate, substituto_id, criado_por) VALUES ('au1','u-rafa','2026-10-20','2026-10-31','u-am','u-rafa')")
deveFalhar(db, "INSERT INTO ausencia (id, usuario_id, de, ate, substituto_id, criado_por) VALUES ('au2','u-rafa','2026-10-30','2026-11-05','u-am','u-rafa')",
  [], 'ausencia_sobreposta', 'ausências sobrepostas são recusadas')

// evento (SSE)
rodar(db, "INSERT INTO evento (entidade, entidade_id, demanda_id, op, patch, campos) VALUES ('demanda','d1','d1','upsert','{\"titulo\":\"x\"}','[\"titulo\"]')")
deveFalhar(db, "INSERT INTO evento (entidade, entidade_id, op, patch, publico) VALUES ('notificacao','1','upsert','{}','usuario')", [],
  'CHECK', 'evento para um usuário exige usuario_id')
for (const p of PUBLICOS_EVENTO) {
  rodar(db, "INSERT INTO evento (entidade, entidade_id, op, patch, publico, usuario_id) VALUES ('link_publico','l1','upsert','{}',?,'u-am')", p)
}
conferir(um(db, "SELECT count(*) n FROM evento WHERE publico = 'gestao'")!.n === 1, 'público gestao (link_publico) aceito')
deveFalhar(db, "INSERT INTO evento (entidade, entidade_id, op, patch, publico) VALUES ('demanda','d1','upsert','{}','todos')", [],
  'CHECK', 'público fora de PUBLICOS_EVENTO é recusado')
conferir((um(db, "SELECT seq FROM sqlite_sequence WHERE name = 'evento'")?.seq as number) >= 1, 'seq do evento em sqlite_sequence')

integridade('dentro da fumaça')
db.exec('ROLLBACK')
integridade('após desfazer a fumaça')

const tabelas = todos(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'demanda_fts%' ORDER BY name")
console.log(`${tabelas.length} tabelas: ${tabelas.map((t) => t.name).join(', ')}`)
console.log(`${checagens} checagens, ${falhas} falha(s)`)
db.close()
process.exit(falhas === 0 ? 0 : 1)
