# Pauta (melt-demandas)

Sistema interno de demandas da Melt Comunicação: quadros separados por equipe, como no Trello, com o ciclo da peça
(versões, envio ao cliente, aprovação por link, rodadas) por cima. O nome do produto vem de `APP_NOME` (padrão "Pauta").

- Arquitetura, stack e convenções: `docs/ARQUITETURA.md`
- Contrato HTTP: `docs/API.md` · tipos: `shared/tipos/` · banco: `server/migracoes/`
- Plano de construção e donos dos arquivos: `docs/PLANO.md`

## Desenvolvimento

Node 24 (roda TypeScript direto). Copie `.env.example` para `.env` e preencha.

```
npm ci
npm run dev:server                      # API + SSE na 7300
npm run dev:web                         # Vite na 5173 (encaminha /api para API_URL)
npm run seed:demo --workspace server    # dados de exemplo (só desenvolvimento)
```

Pronto = verde em tudo, na raiz (`docs/PLANO.md` §0, regra 8): `npx tsc --noEmit -p server`, `npx tsc --noEmit -p web`,
`npm test`, `node server/scripts/verificar-migracoes.ts`, `npm run build` e o roteiro de navegador (claro e escuro,
1440 e 390 px). No front, também `npm run contraste --workspace web`.

## Deploy (EasyPanel atrás da Cloudflare)

Código em `github.com/EuPimentaa/pauta` (privado), branch `master`; o EasyPanel faz o build pelo `Dockerfile` da raiz.

- Serviço **App**, origem Git, porta `7300`, health check `GET /api/saude`.
- **Volume** em `/app/data` (`DATA_DIR=/app/data`): banco, anexos e `backups/` (backup diário, mantém 14).
- Variáveis: `NODE_ENV=production`, `APP_URL=https://demandas.meltcomunicacao.com.br`, `APP_NOME`, `SEGREDO`
  (32+ bytes), `DATA_DIR=/app/data`, **`TRUST_PROXY_HOPS=2`** e, só no primeiro boot, `ADMIN_EMAIL` e `ADMIN_SENHA`.

### Por que `TRUST_PROXY_HOPS=2`

O pedido passa por dois proxies: a Cloudflare acrescenta o IP do visitante ao `X-Forwarded-For` e o Traefik acrescenta
o da Cloudflare. O servidor lê o 2º item a partir do fim, que é o IP real do visitante. É esse IP que conta nos limites
de login (e-mail+IP e IP). Com `1`, todos os visitantes pareceriam ser a Cloudflare e dividiriam o mesmo limite. Com
`0`, o IP seria sempre o do Traefik.

### Cloudflare

- SSL/TLS em **Full (strict)**.
- **Rocket Loader desligado**: ele reescreve os `<script>`, o que quebra a CSP (`script-src 'self'`) e o app.
- Regra de cache **Bypass** para `/api/*` e `/a/*` (a página pública do cliente e as respostas da API não podem ficar
  em cache; o servidor já manda `no-store`).
- **Always Online desligado** para a página pública (`/a/*`): uma cópia antiga mostraria versões e decisões vencidas.
- Tempo real (SSE em `/api/eventos`): a Cloudflare corta conexões ociosas em 100 s, e o ping de 25 s mantém a conexão
  viva. O servidor responde com `Cache-Control: no-cache` e `X-Accel-Buffering: no` e não comprime `text/event-stream`.
  Não ligue regra de compressão nem de transformação para esse caminho.
