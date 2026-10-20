# ---------- Etapa 1: build do frontend ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm install --no-audit --no-fund
COPY client client
RUN npm run build

# ---------- Etapa 2: imagem final (somente dependências de produção) ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3001 DATABASE_PATH=/data/cloud-ai.db
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY client/package.json client/
# Instala só as dependências do servidor (better-sqlite3 usa binários pré-compilados para Linux x64/arm64).
RUN npm install --omit=dev --no-audit --no-fund -w server --include-workspace-root=false
COPY server server
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.js"]
