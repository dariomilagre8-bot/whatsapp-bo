FROM node:20-alpine

# Criar directório da app
WORKDIR /usr/src/app

# Instalar dependências (tira partido da cache do Docker)
COPY package*.json ./
RUN npm install

# Garantir pasta clients/ na imagem (multi-tenant; ACTIVE_CLIENT=demo, etc.)
COPY clients/ ./clients/

# Copiar o resto do código
COPY . .

# Expor a porta
EXPOSE 80

# Comando para iniciar (node directo evita SIGTERM no npm).
# No Easypanel: se "Start Command" estiver definido, use "node index.js" (não use "npm start").
CMD [ "node", "index.js" ]
