FROM node:18-alpine

# Criar directório da app
WORKDIR /usr/src/app

# Instalar dependências (tira partido da cache do Docker)
COPY package*.json ./
RUN npm install

# Copiar o resto do código
COPY . .

# Expor a porta
EXPOSE 80

# Comando para iniciar
CMD [ "npm", "start" ]
