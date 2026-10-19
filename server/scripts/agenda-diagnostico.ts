/**
 * Diagnóstico de um endereço secreto real (pesquisa-ical §8), uma vez, no shell de quem tem o endereço:
 *   AGENDA_ENDERECO='<endereço secreto>' node server/scripts/agenda-diagnostico.ts
 * Imprime SÓ contagens e nomes de propriedades (nunca título, local, descrição, e-mail, UID nem o endereço), para anotar
 * em docs/fase2/operacao-agenda.md: o VTIMEZONE de São Paulo, as partes de RRULE (e quantas séries o Pauta não entende),
 * STATUS, CLASS, VALARM, RDATE, RANGE, TZID fora do IANA, hora flutuante, se os privados trazem detalhes, tamanho,
 * VEVENT, tempo até o 1º byte e o resultado da leitura (as contagens que a tela mostra).
 * Para conferir o próprio script sem rede: `node server/scripts/agenda-diagnostico.ts --arquivo <arquivo .ics>`.
 */
import { readFileSync } from 'node:fs'
import { validarEnderecoIcal } from '../../shared/logica/agenda-endereco.ts'
import { hojeSP } from '../../shared/logica/datas.ts'
import { TETOS_AGENDA_EXTERNA } from '../../shared/tipos/index.ts'
import { componentesDo, lerComponentes, param, prop, props } from '../src/servicos/agenda-ical-leitura.ts'
import { fusoConhecido } from '../src/servicos/agenda-ical-fuso.ts'
import { lerRegra } from '../src/servicos/agenda-ical-repeticao.ts'
import { lerIcal } from '../src/servicos/agenda-ical.ts'
import { descreverErro } from '../src/servicos/segredos.ts'

const iArquivo = process.argv.indexOf('--arquivo')
const arquivo = iArquivo >= 0 ? process.argv[iArquivo + 1] ?? null : null
const bruto = process.env.AGENDA_ENDERECO ?? ''
const url = validarEnderecoIcal(bruto)
if (!url && !arquivo) {
  console.error('Defina AGENDA_ENDERECO com o "Endereço secreto no formato iCal" do Google Agenda (só no shell).')
  process.exit(2)
}

const conta = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
function tabela(titulo: string, m: Map<string, number>): void {
  console.log(`${titulo}:`)
  if (m.size === 0) console.log('  (nenhum)')
  for (const [k, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`)
}

/** O feed pela rede, com os tempos (o endereço nunca é impresso). */
async function baixar(endereco: string): Promise<Uint8Array> {
  const t0 = performance.now()
  const r = await fetch(endereco, {
    redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(TETOS_AGENDA_EXTERNA.segundos * 1000),
    headers: { Accept: 'text/calendar' },
  })
  const primeiroByte = Math.round(performance.now() - t0)
  console.log(`HTTP ${r.status} · content-type ${r.headers.get('content-type') ?? '-'} · etag ${r.headers.has('etag') ? 'sim' : 'não'}`)
  if (r.status !== 200) process.exit(1)
  const corpo = new Uint8Array(await r.arrayBuffer())
  console.log(`tamanho ${(corpo.byteLength / 1024).toFixed(1)} KB descomprimido · 1º byte ${primeiroByte} ms · total ${Math.round(performance.now() - t0)} ms`)
  return corpo
}

try {
  const corpo = arquivo ? new Uint8Array(readFileSync(arquivo)) : await baixar(url!)

  const { raiz, avisos } = lerComponentes(corpo)
  const vevents = componentesDo(raiz, 'VEVENT')
  console.log(`VEVENT ${vevents.length} · avisos de leitura ${avisos} · VTODO ${componentesDo(raiz, 'VTODO').length}`)
  for (const v of componentesDo(raiz, 'VTIMEZONE')) {
    if ((prop(v, 'TZID')?.valor ?? '') !== 'America/Sao_Paulo') continue
    const partes = v.filhos.map((f) => `${f.nome} ${prop(f, 'TZOFFSETTO')?.valor ?? '?'} desde ${(prop(f, 'DTSTART')?.valor ?? '?').slice(0, 8)}${prop(f, 'RRULE') ? ' com RRULE' : ''}`)
    console.log(`VTIMEZONE America/Sao_Paulo: ${partes.join('; ')}`)
  }

  const freq = new Map<string, number>()
  const partesRegra = new Map<string, number>()
  const status = new Map<string, number>()
  const classe = new Map<string, number>()
  const tzids = new Map<string, number>()
  let series = 0, naoEntendidas = 0, varias = 0, excecoes = 0, range = 0, divididas = 0, valarm = 0, rdate = 0
  let flutuante = 0, diaInteiro = 0, privadosComDetalhe = 0, conferencia = 0
  for (const e of vevents) {
    const regras = props(e, 'RRULE')
    if (regras.length > 0) series++
    if (regras.length > 1) varias++
    for (const rr of regras) {
      for (const par of rr.valor.split(';')) {
        const [k, v] = par.split('=')
        if (!k) continue
        conta(partesRegra, k.toUpperCase())
        if (k.toUpperCase() === 'FREQ') conta(freq, (v ?? '').toUpperCase())
      }
    }
    if (regras.length > 1 || (regras[0] && !lerRegra(regras[0].valor))) naoEntendidas++
    const rec = prop(e, 'RECURRENCE-ID')
    if (rec) { excecoes++; if (param(rec, 'RANGE')) range++ }
    if (/_R\d{8}T\d{6}/.test(prop(e, 'UID')?.valor ?? '')) divididas++
    conta(status, prop(e, 'STATUS')?.valor.trim().toUpperCase() ?? '(sem)')
    const c = prop(e, 'CLASS')?.valor.trim().toUpperCase() ?? '(sem)'
    conta(classe, c)
    if ((c === 'PRIVATE' || c === 'CONFIDENTIAL') && (prop(e, 'LOCATION') || prop(e, 'DESCRIPTION') || (prop(e, 'SUMMARY')?.valor ?? '').trim() !== '')) {
      privadosComDetalhe++
    }
    if (e.filhos.some((f) => f.nome === 'VALARM')) valarm++
    if (prop(e, 'RDATE')) rdate++
    if (prop(e, 'X-GOOGLE-CONFERENCE')) conferencia++
    const ini = prop(e, 'DTSTART')
    if (!ini) continue
    const tz = param(ini, 'TZID')
    if (tz) conta(tzids, fusoConhecido(tz) ? 'IANA (o Intl conhece)' : 'fora do Intl')
    else if ((param(ini, 'VALUE') ?? '').toUpperCase() === 'DATE' || /^\d{8}$/.test(ini.valor.trim())) diaInteiro++
    else if (!ini.valor.trim().endsWith('Z')) flutuante++
  }
  console.log(`séries ${series} (mais de uma RRULE ${varias}; fora do subconjunto ${naoEntendidas}) · exceções ${excecoes} (RANGE ${range}) · "esta e as seguintes" ${divididas}`)
  console.log(`dia inteiro ${diaInteiro} · hora flutuante ${flutuante} · VALARM ${valarm} · RDATE ${rdate} · X-GOOGLE-CONFERENCE ${conferencia}`)
  console.log(`privados com título, local ou descrição no endereço secreto: ${privadosComDetalhe}`)
  tabela('FREQ', freq)
  tabela('partes de RRULE', partesRegra)
  tabela('STATUS', status)
  tabela('CLASS', classe)
  tabela('TZID do DTSTART', tzids)

  const t1 = performance.now()
  const leitura = lerIcal(corpo, { hoje: hojeSP() })
  console.log(`leitura do Pauta: ${Math.round(performance.now() - t1)} ms · ${JSON.stringify(leitura.contagens)} · passou do teto: ${leitura.passouDoTeto ? 'sim' : 'não'}`)
} catch (e) {
  console.error(`falhou: ${descreverErro(e, [bruto, url])}`)
  process.exit(1)
}
