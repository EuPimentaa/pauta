/** Lógica pura do ciclo (F2): textos para WhatsApp (API.md §6). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { primeiroNome, textoWhatsapp } from '../../shared/logica/texto-whatsapp.ts'

describe('textoWhatsapp', () => {
  const base = { contatoNome: 'Fulana de Tal', titulo: 'Outubro Rosa', versao: 2 }

  test('os quatro modelos no tom da marca: uma ideia por linha, o link sozinho e o título em negrito', () => {
    assert.equal(textoWhatsapp('envio', { ...base, url: 'https://x/a/t', prazoRetorno: '2026-10-16', prazoRetornoHora: null }),
      'Olá, Fulana.\nSegue a V2 de *Outubro Rosa* para aprovação:\nhttps://x/a/t\n\nRetorno até sex, 16/10, 18h.')
    assert.equal(textoWhatsapp('envio', { ...base, prazoRetorno: '2026-10-16', prazoRetornoHora: '14:30' }),
      'Olá, Fulana.\nSegue a V2 de *Outubro Rosa* para aprovação.\n\nRetorno até sex, 16/10, 14h30.')
    assert.equal(textoWhatsapp('lembrete', { ...base, url: 'https://x/a/t' }),
      'Olá, Fulana.\nPassando para lembrar da V2 de *Outubro Rosa*, que aguarda o seu retorno:\nhttps://x/a/t')
    assert.equal(textoWhatsapp('aprovado', base), 'Obrigado, Fulana.\nRegistramos a aprovação da V2 de *Outubro Rosa*.')
    assert.equal(textoWhatsapp('ajuste', { ...base, prazoAjuste: '2026-10-17', prazoAjusteHora: null }),
      'Obrigado, Fulana.\nRecebemos os ajustes da V2 de *Outubro Rosa*.\nA V3 fica pronta até sáb, 17/10, 18h.')
  })

  test('sem contato a saudação é pergunta; sem link e sem prazo; asterisco do título não quebra o negrito', () => {
    assert.equal(textoWhatsapp('envio', { ...base, contatoNome: null }), 'Olá, tudo bem?\nSegue a V2 de *Outubro Rosa* para aprovação.')
    assert.equal(textoWhatsapp('lembrete', { ...base, contatoNome: '  ' }),
      'Olá, tudo bem?\nPassando para lembrar da V2 de *Outubro Rosa*, que aguarda o seu retorno.')
    assert.equal(textoWhatsapp('aprovado', { ...base, contatoNome: null }), 'Obrigado.\nRegistramos a aprovação da V2 de *Outubro Rosa*.')
    assert.equal(textoWhatsapp('aprovado', { ...base, titulo: ' *Promo*  de  Natal ' }), 'Obrigado, Fulana.\nRegistramos a aprovação da V2 de *Promo de Natal*.')
  })

  test('primeiro nome, com o tratamento quando o nome começa por um', () => {
    assert.equal(primeiroNome(' Maria  Clara '), 'Maria')
    assert.equal(primeiroNome(''), null)
    assert.equal(primeiroNome('Seu Joaquim'), 'Seu Joaquim')
    assert.equal(primeiroNome('dona Maria das Graças'), 'dona Maria')
    assert.equal(primeiroNome('Dr. Paulo Lima'), 'Dr. Paulo')
    assert.equal(primeiroNome('Dona'), 'Dona')
  })
})
