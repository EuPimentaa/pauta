/**
 * Segurança 7 (revisão da leva 2): a chave dos limites em memória juntava o IP e todos os parâmetros da rota. Nos
 * arquivos públicos o limite era por IP+id (ids diferentes nunca levavam 429), não "300 por minuto por IP" como diz a
 * API §4.17; na página, tokens diferentes nunca levavam 429. Agora os arquivos contam por IP e há um limite adicional
 * por IP para tokens desconhecidos (404): estourado, o IP leva 429 em qualquer token por um tempo.
 */
import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { configurar } from '../src/config.ts'
import { ambiente, enviarAoCliente, publico, tokenDe } from './ciclo-ajuda.ts'

const tokenQualquer = () => randomBytes(32).toString('base64url')

describe('limites da página pública', () => {
  // o IP de cada cliente de teste vem do X-Forwarded-For (um proxy confiável, como o Traefik)
  beforeEach(() => { configurar({ trustProxyHops: 1 }) })
  afterEach(() => { configurar({ trustProxyHops: 0 }) })

  test('arquivos: 300 por minuto por IP, somando ids diferentes; outro IP segue', async () => {
    const a = await ambiente()
    const p = publico(a, '200.7.7.7')
    for (let i = 0; i < 300; i++) {
      const r = await p.get(`/api/publico/arquivos/arquivo-${i}?l=x&exp=1&sig=x`)
      assert.equal(r.status, 403, `pedido ${i + 1}`)
    }
    const r = await p.get('/api/publico/arquivos/mais-um?l=x&exp=1&sig=x')
    assert.equal(r.status, 429, r.texto)
    assert.equal(r.corpo.erro.codigo, 'muitas_tentativas')
    assert.equal((await publico(a, '200.7.7.8').get('/api/publico/arquivos/arquivo-0?l=x&exp=1&sig=x')).status, 403)
    a.relogio('2026-10-14T13:01:01.000Z')
    assert.equal((await p.get('/api/publico/arquivos/arquivo-0?l=x&exp=1&sig=x')).status, 403)
  })

  test('tokens desconhecidos: 20 em 10 min por IP; depois, 429 em qualquer token desse IP (o válido também); outro IP segue', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'entregue' })
    const token = tokenDe((await enviarAoCliente(a, d)).link!.url)
    const p = publico(a, '200.8.8.8')
    for (let i = 0; i < 20; i++) assert.equal((await p.pagina(tokenQualquer())).status, 404, `tentativa ${i + 1}`)
    const estouro = await p.pagina(tokenQualquer())
    assert.equal(estouro.status, 429, estouro.texto)
    assert.ok(estouro.corpo.erro.detalhes.tenteEmSegundos > 0)
    assert.equal((await p.pagina(token)).status, 429, 'sem oráculo: o token certo também espera')
    assert.equal((await p.visto(tokenQualquer())).status, 429)
    assert.equal((await publico(a, '200.8.8.9').pagina(token)).status, 200)
    a.relogio('2026-10-14T13:10:01.000Z')
    assert.equal((await p.pagina(token)).status, 200)
  })

  test('o token conhecido não gasta o limite dos desconhecidos', async () => {
    const a = await ambiente()
    const d = await a.criarDemanda({ ate: 'entregue' })
    const token = tokenDe((await enviarAoCliente(a, d)).link!.url)
    const p = publico(a, '200.6.6.6')
    for (let i = 0; i < 25; i++) assert.equal((await p.pagina(token)).status, 200)
    assert.equal((await p.pagina(tokenQualquer())).status, 404)
  })
})
