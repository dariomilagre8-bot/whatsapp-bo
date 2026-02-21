FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build do frontend (streamzone-frontend ou frontend), se existir
RUN if [ -d "streamzone-frontend" ]; then \
      cd streamzone-frontend && npm ci && npm run build; \
    elif [ -d "frontend" ]; then \
      cd frontend && npm ci && npm run build; \
    fi

EXPOSE 80

CMD ["npm", "start"]