# Pedidos do dono do produto

## Cloudflare na frente da VPS (confirmado em 16/10/2026)

O domínio passa pela Cloudflare (proxy laranja) antes do Traefik do EasyPanel.

- Produção usa `TRUST_PROXY_HOPS=2` (Cloudflare + Traefik). Documente isso no deploy (ARQUITETURA e README).
- O limite de tentativas de login deve contar o IP real do visitante; teste com `X-Forwarded-For: <cliente>, <cloudflare>`.
- SSE: a Cloudflare corta conexões ociosas em 100 s; o ping de 25 s resolve. Garanta `Cache-Control: no-cache`,
  `X-Accel-Buffering: no` e que nada comprima/bufferize `text/event-stream`.
- Recomendações para o README de deploy: SSL "Full (strict)", Rocket Loader desligado (quebra a CSP e os scripts),
  regra de cache "Bypass" para `/api/*` e `/a/*`, sem "Always Online" para a página pública.

## Repositório

Código em https://github.com/EuPimentaa/pauta (privado), branch `master`. O EasyPanel faz o build a partir dele.
