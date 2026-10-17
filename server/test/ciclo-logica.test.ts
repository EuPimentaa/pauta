/** Lógica pura do ciclo (F2): textos para WhatsApp (API.md §6). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nomeDaPeca, primeiroNome, textoWhatsapp } from '../../shared/logica/texto-whatsapp.ts'

describe('textoWhatsapp', () => {
  const base = { contatoNome: 'Fulana de Tal', modeloNome: 'Carrossel', titulo: 'Outubro Rosa', versao: 2 }

  test('os quatro modelos no tom da marca', () => {
    assert.equal(textoWhatsapp('envio', { ...base, url: 'https://x/a/t', prazoRetorno: '2026-10-16', prazoRetornoHora: null }),
      'Olá, Fulana. Segue Carrossel Outubro Rosa (V2) para aprovação: https://x/a/t Prazo para retorno: sex, 16/10, 18h.')
    assert.equal(textoWhatsapp('envio', { ...base, prazoRetorno: '2026-10-16', prazoRetornoHora: '14:30' }),
      'Olá, Fulana. Segue Carrossel Outubro Rosa (V2) para aprovação. Prazo para retorno: sex, 16/10, 14h30.')
    assert.equal(textoWhatsapp('lembrete', { ...base, url: 'https://x/a/t' }),
      'Olá, Fulana. Passando para lembrar de Carrossel Outubro Rosa (V2), que aguarda o seu retorno: https://x/a/t')
    assert.equal(textoWhatsapp('aprovado', base), 'Obrigado, Fulana. Registramos a aprovação de Carrossel Outubro Rosa (V2).')
    assert.equal(textoWhatsapp('ajuste', { ...base, prazoAjuste: '2026-10-17', prazoAjusteHora: null }),
      'Obrigado, Fulana. Recebemos os ajustes de Carrossel Outubro Rosa. A V3 fica pronta até sáb, 17/10, 18h.')
  })

  test('sem contato, sem link e sem prazo', () => {
    assert.equal(textoWhatsapp('envio', { ...base, contatoNome: null }), 'Olá, tudo bem. Segue Carrossel Outubro Rosa (V2) para aprovação.')
    assert.equal(textoWhatsapp('lembrete', { ...base, contatoNome: '  ' }),
      'Olá, tudo bem. Passando para lembrar de Carrossel Outubro Rosa (V2), que aguarda o seu retorno.')
    assert.equal(textoWhatsapp('aprovado', { ...base, contatoNome: null }), 'Obrigado. Registramos a aprovação de Carrossel Outubro Rosa (V2).')
  })

  test('nome da peça não repete o modelo; primeiro nome', () => {
    assert.equal(nomeDaPeca('Carrossel', 'carrossel de outubro'), 'carrossel de outubro')
    assert.equal(nomeDaPeca('Post', 'Ação de Natal'), 'Post Ação de Natal')
    assert.equal(nomeDaPeca(null, 'Banner'), 'Banner')
    assert.equal(primeiroNome(' Maria  Clara '), 'Maria')
    assert.equal(primeiroNome(''), null)
  })
})
