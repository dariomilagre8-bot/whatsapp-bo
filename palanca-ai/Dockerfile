# Palanca AI — QA-as-a-Service
# Build multi-stage para imagem final enxuta

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Stage 2: Produção ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Apenas dependências de produção (sem devDependencies)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Sessão WhatsApp (persistida via volume no docker-compose)
RUN mkdir -p .wwebjs_auth

USER node
EXPOSE 3000

CMD ["node", "dist/index.js"]
