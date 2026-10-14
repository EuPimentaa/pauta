# Pauta (melt-demandas): imagem do EasyPanel (docs/ARQUITETURA.md, "Deploy").
# Estágio 1 compila o front (web/dist); a imagem final tem o Node 24, as dependências de produção do servidor, o
# código do servidor (TypeScript rodado direto pelo Node) e o web/dist. Dados em /app/data (monte o volume aí).

FROM node:24-slim AS front
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY shared shared
COPY web web
RUN npm run build --workspace web

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=7300 \
    DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server --no-audit --no-fund && npm cache clean --force
COPY shared shared
COPY server/src server/src
COPY server/migracoes server/migracoes
COPY --from=front /app/web/dist web/dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 7300
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 7300) + '/api/saude').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server/src/index.ts"]
