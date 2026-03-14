# Novo cliente — Deploy rápido (Palanca Bot Engine)

Objectivo: ter o bot de um novo cliente em produção em **menos de 10 minutos**.

---

## 1. O que preparar antes

- **Evolution API**: instância criada com o nome do cliente (ex.: `Streamzone Braulio`). Anote o nome exacto.
- **Supabase**: projecto e chave (URL + anon key ou service key) para o cliente.
- **Google Sheets**: ID da planilha e ficheiro `credentials.json` (service account) com acesso a essa planilha.
- **Gemini**: API key (pode ser a mesma do projecto ou uma por cliente).
- **Easypanel (ou servidor)**: para fazer deploy do container (ou use o `docker-compose.yml` gerado pelo script).

---

## 2. Como correr o script

No **Git Bash** ou **WSL** (no Windows) ou num terminal Linux/macOS, a partir da raiz do repositório:

```bash
./scripts/novo-cliente.sh \
  --nome "StreamZone Braulio" \
  --instancia "Streamzone Braulio" \
  --numero "244941529470" \
  --gemini-key "GEMINI_KEY" \
  --supabase-url "SUPABASE_URL" \
  --supabase-key "SUPABASE_KEY" \
  --sheets-id "SHEETS_ID" \
  --sheets-credentials "path/to/credentials.json" \
  --evolution-url "https://whatsapp-evolution-api.oxuzyt.easypanel.host" \
  --evolution-key "SUA_EVOLUTION_KEY" \
  --webhook-url "https://whatssiru.46.224.99.52.nip.io"
```

**Parâmetros obrigatórios:**

| Parâmetro | Descrição |
|-----------|-----------|
| `--nome` | Nome do cliente (ex.: "StreamZone Braulio") — usado em `BOT_NAME` e identificação. |
| `--instancia` | Nome exacto da instância na Evolution API. |
| `--numero` | Número do supervisor principal (ex.: 244941529470). O script acrescenta `,244941713216` em `SUPERVISOR_NUMBERS`. |
| `--gemini-key` | Chave da API Gemini. |
| `--supabase-url` | URL do projecto Supabase. |
| `--supabase-key` | Chave Supabase (anon ou service). |
| `--sheets-id` | ID da planilha Google Sheets. |

**Parâmetros opcionais:**

| Parâmetro | Descrição |
|-----------|-----------|
| `--sheets-credentials` | Caminho para `credentials.json` do Google. Se omitido, terá de copiar manualmente para a pasta do deploy. |
| `--evolution-url` | URL da Evolution API (para preencher no `.env` e para registar webhook). |
| `--evolution-key` | Chave da Evolution API (para `.env` e registo do webhook). |
| `--webhook-url` | URL base do bot em produção (ex.: `https://whatssiru.46.224.99.52.nip.io`). Se passada com `--evolution-url` e `--evolution-key`, o script **regista o webhook** na Evolution para esta instância. |
| `--output-dir` | Pasta base de saída. Por defeito: `deploys/<instancia_sanitizada>/`. |

O script:

1. Copia `.env.template` e preenche com os valores passados.
2. Coloca o `.env` e (se indicado) o `credentials.json` numa pasta em `deploys/<instancia>/`.
3. Gera um `docker-compose.yml` pronto para `docker compose up -d`.
4. Se tiver `--evolution-url`, `--evolution-key` e `--webhook-url`, regista o webhook na Evolution API para a instância.
5. Imprime no terminal o **link de reconexão** e os comandos para verificar.

---

## 3. Deploy no Easypanel

- **Opção A — Um serviço por cliente:** No Easypanel, crie um novo App (ex.: “Palanca Bot – Streamzone Braulio”). Use a mesma imagem/build do repositório, defina as variáveis de ambiente a partir do `.env` gerado (ou env file upload). O domínio/URL desse serviço é o que deve usar em `--webhook-url` na próxima vez que correr o script para esse cliente.
- **Opção B — Docker Compose:** Na pasta gerada (`deploys/<instancia>/`), execute `docker compose up -d`. Garanta que o porto 80 está exposto e que o domínio (nip.io ou outro) aponta para esse servidor.

Depois do deploy, confirme que o health check responde:

```bash
curl -s https://SEU_DOMINIO_CLIENTE/health | jq
```

---

## 4. Verificar que está a funcionar

1. **Health:** `GET https://SEU_DOMINIO/health` — deve devolver `supabase` e `evolution` em estado ok/degraded.
2. **Evolution API:** No painel da Evolution, verifique que a instância está conectada e que o **webhook** está configurado com a URL `https://SEU_DOMINIO/webhook`.
3. **WhatsApp:** Envie uma mensagem ao número ligado à instância e confirme que o bot responde.

---

## 5. Entregar o link ao cliente

- **Reconexão (QR Code):** envie ao cliente o link que o script imprimiu, no formato:
  `https://SEU_DOMINIO/reconnect/Nome%20da%20Instancia`
  (com espaços codificados como `%20`).
- Se usar a página de ligação remota (ex.: `/connect/braulio?token=...`), use o mesmo domínio do bot e o token configurado em `CONNECT_TOKEN`.

---

## 6. Teste imediato — Bráulio (Streamzone Braulio)

Para testar o fluxo com a instância **Streamzone Braulio** (mesmas configs que Zara-Teste: mesma Supabase, mesma Sheets, mesmo Gemini):

1. Use o `.env` gerado para Bráulio (ver ficheiro `env.streamzone-braulio.example` na raiz ou em `docs/`). Copie os valores de Supabase, Sheets e Gemini do `.env` da Zara-Teste e preencha; as variáveis específicas já vêm definidas:
   - `EVOLUTION_INSTANCE=Streamzone Braulio`
   - `BOT_NAME=Zara`
   - `SUPERVISOR_NUMBERS=244941529470,244941713216`

2. Registe o webhook da instância **Streamzone Braulio** na Evolution API, apontando para:
   - `https://whatssiru.46.224.99.52.nip.io/webhook`  
   (ou o URL do serviço onde o bot Bráulio estiver em produção, se for outro).

Pode usar o script com `--webhook-url "https://whatssiru.46.224.99.52.nip.io"` para registar o webhook automaticamente, desde que passe também `--evolution-url` e `--evolution-key`.

**Registar webhook (Streamzone Braulio):**

```bash
node scripts/registar-webhook.js
```

Requer `.env` com `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`. O script regista o webhook da instância Streamzone Braulio em `https://whatssiru.46.224.99.52.nip.io/webhook`.
