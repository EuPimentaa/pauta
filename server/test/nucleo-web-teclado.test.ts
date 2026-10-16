/** NÚCLEO-WEB: notação das teclas e a decisão do despachante de atalhos (web/src/teclado). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { casaPasso, passosDe, temModificador, type EventoTecla } from '../../web/src/teclado/teclas.ts'
import { decidir, type AtalhoBase, type EstadoTeclado } from '../../web/src/teclado/despachar.ts'

const tecla = (key: string, extra: Partial<EventoTecla> = {}): EventoTecla => ({
  key, code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : '', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...extra,
})

describe('teclas', () => {
  test('notação', () => {
    assert.deepEqual(passosDe('shift+n'), [{ tecla: 'n', shift: true, mod: false, alt: false }])
    assert.deepEqual(passosDe('mod+k')[0].mod, true)
    assert.deepEqual(passosDe('g a').map((p) => p.tecla), ['g', 'a'])
    assert.equal(passosDe('space')[0].tecla, 'space')
    assert.equal(temModificador('mod+k'), true)
    assert.equal(temModificador('shift+n'), false)
  })

  test('letras conferem Shift; Ctrl no Windows e Cmd no Mac', () => {
    const n = passosDe('n')[0], shiftN = passosDe('shift+n')[0], modK = passosDe('mod+k')[0]
    assert.equal(casaPasso(n, tecla('n'), false), true)
    assert.equal(casaPasso(n, tecla('N', { shiftKey: true }), false), false)
    assert.equal(casaPasso(shiftN, tecla('N', { shiftKey: true }), false), true)
    assert.equal(casaPasso(n, tecla('n', { ctrlKey: true }), false), false)
    assert.equal(casaPasso(modK, tecla('k', { ctrlKey: true }), false), true)
    assert.equal(casaPasso(modK, tecla('k', { metaKey: true }), true), true)
    assert.equal(casaPasso(modK, tecla('k', { ctrlKey: true }), true), false)
  })

  test('símbolos valem como saem do teclado; barra invertida pela posição (ABNT2)', () => {
    assert.equal(casaPasso(passosDe('?')[0], tecla('?', { shiftKey: true }), false), true)
    assert.equal(casaPasso(passosDe(',')[0], tecla(','), false), true)
    assert.equal(casaPasso(passosDe('\\')[0], tecla('\\', { code: 'IntlBackslash' }), false), true)
    assert.equal(casaPasso(passosDe('\\')[0], tecla('|', { code: 'IntlBackslash', shiftKey: true }), false), false)
    assert.equal(casaPasso(passosDe('shift+\\')[0], tecla('|', { code: 'Backslash', shiftKey: true }), false), true)
    assert.equal(casaPasso(passosDe('space')[0], tecla(' ', { code: 'Space' }), false), true)
  })
})

describe('despachante', () => {
  const lista: AtalhoBase[] = [
    { id: 'paleta', teclas: 'mod+k', escopo: 'global' },
    { id: 'membro-card', teclas: 'space', escopo: 'card' },
    { id: 'membro-modal', teclas: 'space', escopo: 'modal' },
    { id: 'nova', teclas: 'shift+n', escopo: 'global' },
    { id: 'quadro-n', teclas: 'n', escopo: 'quadro' },
    { id: 'ir-agenda', teclas: 'g a', escopo: 'global' },
  ]
  const estado = (extra: Partial<EstadoTeclado> = {}): EstadoTeclado => ({
    escopos: ['card', 'quadro', 'global'], emCampo: false, ligados: true, mac: false, acorde: null, ...extra,
  })
  const ids = (d: ReturnType<typeof decidir>) => (d?.tipo === 'executar' ? d.candidatos.map((c) => c.atalho.id) : d)

  test('só os escopos ativos, do mais específico para o geral', () => {
    assert.deepEqual(ids(decidir(lista, tecla(' ', { code: 'Space' }), estado())), ['membro-card'])
    assert.deepEqual(ids(decidir(lista, tecla(' ', { code: 'Space' }), estado({ escopos: ['modal', 'global'] }))), ['membro-modal'])
    assert.equal(decidir(lista, tecla('n'), estado({ escopos: ['modal', 'global'] })), null)
  })

  test('dentro de campo de texto ou com os atalhos desligados, só com Ctrl/Cmd', () => {
    assert.equal(decidir(lista, tecla('N', { shiftKey: true }), estado({ emCampo: true })), null)
    assert.deepEqual(ids(decidir(lista, tecla('k', { ctrlKey: true }), estado({ emCampo: true }))), ['paleta'])
    assert.equal(decidir(lista, tecla('n'), estado({ ligados: false })), null)
  })

  test('acorde: G arma, a segunda tecla decide', () => {
    assert.deepEqual(decidir(lista, tecla('g'), estado()), { tipo: 'acorde', primeira: 'g' })
    assert.deepEqual(ids(decidir(lista, tecla('a'), estado({ acorde: 'g' }))), ['ir-agenda'])
    assert.equal(decidir(lista, tecla('z'), estado({ acorde: 'g' })), null)
  })
})
