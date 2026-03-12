# Palanca AI — QA-as-a-Service

Sistema autónomo de QA onde um modelo de linguagem (Claude) atua como **juiz de qualidade** para testar chatbots via WhatsApp, com orquestração via Telegram, auditoria em Supabase e relatórios em Notion.

---

## Arquitetura

A Palanca AI segue um modelo **LLM-as-a-Judge**:

| Componente | Função |
|------------|--------|
| **Claude (Anthropic)** | Juiz de QA: gera mensagens de teste e avalia respostas do bot alvo (APROVADO/REPROVADO). |
| **WhatsApp** | Canal de teste: envia e recebe mensagens do chatbot em avaliação (whatsapp-web.js). |
| **Telegram** | Controlo: comando `/testar_bot` para iniciar testes; alertas e relatórios para administradores. |
| **Supabase** | Auditoria: registo de sessões, turnos e resultados. |
| **Notion** | Relatórios detalhados e documentação de testes. |

Fluxo típico: administrador envia `/testar_bot [numero_whatsapp] [tipo_bot]` no Telegram → orquestrador inicia sessão → Claude gera a primeira mensagem → WhatsApp envia ao número alvo → respostas do bot são reenviadas ao Claude → ciclo até avaliação final (APROVADO/REPROVADO) ou timeout.

---

## Execução local

### Pré-requisitos

- Node.js ≥ 20
- Contas/API keys: Telegram Bot, Anthropic (Claude), Supabase, Notion (conforme uso)

### Passos

1. **Instalar dependências**
   ```bash
   cd palanca-ai
   npm install
   ```

2. **Configurar ambiente**
   ```bash
   cp .env.example .env
   ```
   Editar `.env` e preencher:
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_IDS`
   - `ANTHROPIC_API_KEY` (e opcionalmente `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS`)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (se usar auditoria)
   - `NOTION_API_KEY`, `NOTION_PARENT_PAGE_ID` (se usar relatórios)
   - `PORT=3000` (para o servidor de health check; opcional, default 3000)
   - `WA_SESSION_PATH=./.wwebjs_auth` (pasta da sessão WhatsApp)

3. **Build**
   ```bash
   npm run build
   ```

4. **Iniciar a aplicação**
   ```bash
   npm start
   ```

5. **Escanear o QR Code** no terminal para ligar a sessão WhatsApp (whatsapp-web.js). Após o primeiro pareamento, a sessão fica guardada em `.wwebjs_auth`.

---

## Utilização do bot

- **Comando (Telegram):** `/testar_bot [numero] [bot_type]`
  - `numero`: número de WhatsApp do chatbot a testar (ex.: 351912345678).
  - `bot_type`: tipo/contexto do bot (ex.: suporte, vendas).

- **Exemplo:** `/testar_bot 351912345678 suporte`

Apenas utilizadores com `chat_id` listado em `TELEGRAM_ADMIN_CHAT_IDS` podem executar o comando. Os alertas e confirmações são enviados via Telegram.

---

## Health Check

A aplicação expõe um servidor HTTP leve para verificações de saúde (Easypanel / Docker):

- **Porta:** `PORT` (variável de ambiente; fallback: `3000`).
- **Endpoint:** `GET /health` (ou `GET /`).
- **Resposta:** `200` com JSON:
  ```json
  { "status": "Palanca AI QA Automations is RUNNING", "timestamp": "2025-03-12T..." }
  ```

O servidor sobe logo no arranque, permitindo que o orquestrador de containers verifique a saúde mesmo enquanto o WhatsApp está a conectar.

---

## Deploy no Easypanel

### Imagem

- Build da imagem a partir do `Dockerfile` na raiz do projeto (multi-stage; porta 3000 exposta).

### Configuração no Easypanel

1. **Porta**
   - Mapear a porta do contentor `3000` para uma porta do host (ex.: 3000). O serviço escuta em `PORT` (default 3000).

2. **Variáveis de ambiente**
   - Copiar as variáveis de `.env.example` para o painel e preencher (incluindo `PORT=3000` se quiser manter consistência).

3. **Volume para sessão WhatsApp**
   - **Path no contentor:** `/app/.wwebjs_auth` (ou o valor de `WA_SESSION_PATH` se alterado no Dockerfile).
   - Mapear para um volume persistente no host (ex.: volume nomeado `palanca-wwebjs-auth`).
   - Sem este mapeamento, a sessão WhatsApp perde-se em cada redeploy e será necessário escanear o QR Code novamente.

4. **Health Check**
   - **URL:** `http://<serviço>:3000/health` (ou a porta mapeada).
   - **Método:** GET. Esperar HTTP 200 para considerar o contentor saudável e evitar reinícios indevidos do worker.

### Resumo rápido

| Item | Valor |
|------|--------|
| Porta do contentor | 3000 |
| Health check URL | `http://localhost:3000/health` (ou porta mapeada) |
| Volume obrigatório | `.wwebjs_auth` → volume persistente |

---

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run build` | Compila TypeScript para `dist/`. |
| `npm start` | Executa `node dist/index.js`. |
| `npm run dev` | Desenvolvimento com `tsx watch src/index.ts`. |
| `npm run lint` | ESLint em `src/`. |

---

## Licença e contacto

Uso interno / empresarial. Para dúvidas sobre integração ou deploy, contactar a equipa responsável pela Palanca AI.
