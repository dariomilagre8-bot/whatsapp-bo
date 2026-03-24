# CLAUDE.md — Palanca Bot Engine v2.0

## ESTADO OPERACIONAL (actualizar a cada deploy)

### Bots Activos
| Bot | Serviço | Instância | Número | Status |
|-----|---------|-----------|--------|--------|
| Zara | whatssiru | Streamzone Braulio | 244941529470 | PRODUÇÃO |
| Luna | palanca-ai | ZapPrincipal | 351934937617 | PRODUÇÃO |
| Bia | demo-moda | demo-moda | 244958765478 | PRODUÇÃO |

### Supervisores
- Zara (SZ): 244946014060 (Bráulio)
- Luna (PA): 244941713216 (Don)
- Bia (Demo): 244941713216 (Don)

### Infra
- VPS: 46.224.99.52 | Docker 26.1.4 | Easypanel 2.27.0
- Evolution: https://whatsapp-evolution-api.oxuzyt.easypanel.host
- Supabase: pa-engine (vxrziqsyfpnmpzkjkxli, eu-west-2)

### Health Checks
- whatssiru: http://jules_whatssiru:80/api/health
- demo-moda: http://jules_demo-moda:80/api/health
- palanca-ai: http://automacoes_palanca-ai:3001/api/health

### Circuit Breakers
- LLM: 3 falhas → open (60s reset)
- Evolution: 3 falhas → open (60s reset)
- Rate limit: 5 msg/30s por número

### Message Queue (BullMQ)
- Queue: `pa-messages` | Worker: concurrency 1 | Retry: 3x (1s → 5s → 30s backoff custom)
- DLQ: `pa-dead-letters` | Mensagens falhadas 3x → DLQ + alerta WhatsApp ao Don (244941713216)
- Activado se `REDIS_URL` definido; sem Redis → modo inline (backward compat)
- Monitorizar: `redis-cli LLEN bull:pa-dead-letters:wait`
- Endpoint readiness: GET `/ready` → `{ status: 'ok'|'degraded', redis, supabase, queue }`

---



## Monorepo

- **engine/** — Código genérico (ZERO referências a clientes). Inclui: lib (logger, state-machine, matcher, validator, handlers, llm, sender, dedup, metrics, cron-manager), middleware (health, webhook-router), evals (personas, simulator, judge), scripts, templates.
- **clients/** — Config por cliente. Registados: **streamzone** (Zara / StreamZone), **luna** (Luna / PA comercial, instância `ZapPrincipal`), **demo** (Bia / Loja Demo, instância `demo-moda`). Pastas `clients/<slug>/config.js` são auto-registadas em `index.js` (excepto `streamzone`, já carregado como primário). Opcionalmente `prompts.js` e `validators.js`.
- **services/** — Microserviços (watchtower: BI em scaffold).
- **tests/** — engine.test.js (59 testes StreamZone) + tests/engine/* (dedup, logger, metrics, config-loader, sender).

## Regras invioláveis

1. **Remetente** = `data.key.remoteJid`. NUNCA `req.body.sender`.
2. **NUNCA** usar LID (`@lid`) em SUPERVISOR_NUMBERS — só JIDs `@s.whatsapp.net`.
3. O bot **NUNCA** revela comandos `#` ao cliente final.
4. **npm test** e **npm run eval** DEVEM passar antes de deploy.
5. **`prestart`:** `npm start` corre `npm test` antes — o bot não arranca com testes a falhar (emergência: `node index.js` sem passar pelo script npm).
6. Zero breaking changes nos testes existentes.
7. Deploy produção = `whatsapp-bot/`. Deploy manual: `npm run deploy`.
8. **CommonJS** (require/module.exports). Node.js 20. Sem TypeScript.
9. Toda melhoria ao engine beneficia todos os clientes.
10. **trace_id** em todos os logs (via createLogger(traceId, clientSlug, module)).
11. **Evolution — instância de envio:** `engine/lib/sender.js` / `src/engine/sender.js` resolvem o nome da instância por ordem: `clientConfig.evolutionInstance` → `evolutionConfig.instance` → `EVOLUTION_INSTANCE` / `EVOLUTION_INSTANCE_NAME` no `.env`. O webhook usa o `tenantConfig` do registry (`req.clientConfig`) para cada mensagem.

## Comandos

| Comando | Descrição |
|--------|-----------|
| `npm test` | Todos os testes (StreamZone + engine, incl. sender + intent v2/regression) |
| `npm run test:intent` | Apenas testes de intent (v2, regressão, suporte, saudação) |
| `npm run eval` | Testes adversariais (4 personas) |
| `npm run deploy` | Deploy produção (scripts/deploy.sh) |
| `npm run backup` | Backup env vars do container (BUG-046 fix) |
| `npm run new-client` | Criar novo cliente (engine/scripts/novo-cliente.sh) |

## Deploy

- **Servidor:** 46.224.99.52 (Hetzner)
- **Easypanel:** jules/whatssiru (porta 3000)
- **Automático:** push para `main` → GitHub Actions → SSH → git pull → Easypanel API redeploy
- **Manual (fallback):** Easypanel UI → projecto `jules` → serviço → botão "Implantar"
- **Health:** GET `/api/health` e GET `/api/metrics` (Prometheus text)

### Estratégia GitHub Actions (`.github/workflows/deploy.yml`)

| Antes | Depois |
|-------|--------|
| `docker build` + `service scale 0/1` + `service update` | SSH → `git pull` → Easypanel API `services.redeploy` |
| Race condition em pushes rápidos ("out of sequence") | `concurrency: cancel-in-progress: true` elimina o problema |
| Comandos Docker directos (frágeis no Swarm) | Easypanel controla build + Swarm update de forma segura |

### Secrets necessários (GitHub → Settings → Secrets → Actions)

| Secret | Valor |
|--------|-------|
| `HOST` | `46.224.99.52` |
| `USERNAME` | `root` |
| `SSH_KEY` | Chave privada SSH do VPS |
| `EASYPANEL_TOKEN` | Password do painel Easypanel (ou API key) |

### Deploy manual (se Easypanel API falhar)

1. Abrir `https://46.224.99.52:3000` → login
2. Projecto `jules` → serviço `whatssiru` → **Implantar**
3. Projecto `jules` → serviço `demo-moda` → **Implantar**
4. Verificar health: `curl https://jules-whatssiru.oxuzyt.easypanel.host/api/health`

### Regras absolutas de deploy

- **NUNCA** `docker service update --force`
- **NUNCA** dois deploys paralelos (o `concurrency` no CI garante isto)
- Docker v26.1.4 no VPS — **NUNCA actualizar**

## Estrutura de rotas

- POST `/webhook` e POST `/webhook/messages` — Webhook router (200 imediato, dedup, trace_id, routing por instanceName).
- GET `/api/health` — Estado dos serviços.
- GET `/api/health/detailed` — Health expandido (Redis, última mensagem, sessões, intentStats).
- GET `/api/metrics` — Métricas por cliente (formato Prometheus).

## Arquitectura Message Queue

### Fluxo completo
```
POST /webhook
  └─ webhook-router.js
       ├─ res.status(200).json({ok:true})   ← imediato (<50ms)
       ├─ dedup (Redis SETNX)
       ├─ rate-limit check
       └─ queue.add('process-message', payload)
            └─ BullMQ Worker (concurrency:1)
                 ├─ entry.handler(mockReq, mockRes)   ← pipeline LLM completo
                 ├─ retry: 1s → 5s → 30s (3 tentativas)
                 └─ falha final → DLQ + notifyDon(244941713216)
```

### Retry e DLQ
- Backoff: tentativa 1 → 1000ms | tentativa 2 → 5000ms | tentativa 3 → 30000ms
- Após 3 falhas: job vai para `pa-dead-letters` com `{ originalMessage, errorStack, timestamp, clientId }`
- Re-processar manualmente: inspecionar DLQ via Redis CLI ou dashboard Bull

### Variáveis de ambiente necessárias
| Var | Descrição |
|-----|-----------|
| `REDIS_URL` | `redis://:password@host:6379` |
| `ALERT_INSTANCE_NAME` | Instância Evolution para alertas (ex: ZapPrincipal) |
| `ALERT_PHONE` | Telefone do Don (default: 244941713216) |

### Monitorizar
```bash
redis-cli LLEN bull:pa-dead-letters:wait      # jobs na DLQ
redis-cli LLEN bull:pa-messages:wait          # jobs pendentes
redis-cli LLEN bull:pa-messages:active        # job a processar agora
redis-cli LLEN bull:pa-messages:failed        # falhas totais
```

---

## Bugs Conhecidos / Fixes

| Bug | Ficheiro | Descrição | Fix |
|-----|----------|-----------|-----|
| BUG-046 | scripts/backup-env.sh | Perda de env vars após rebuild | `npm run backup` antes de deploy |
| BUG-067 | src/engine/intentDetector.js | `\b` regex falha com acentos PT (á, ã, é) | `normalizePattern()` usa lookahead/lookbehind Unicode-aware (U+00C0–U+024F) |
| BUG-071 | src/routes/webhook.js | CRM repetia `upsertLead` + `getClientByPhone` + Sheets em cada mensagem | No início do handler: `crmProcessed` (lead) + `crmCache` com Sheets, Supabase e `pa_clients` — pipeline LLM só lê cache |
| BUG-072 | src/utils/phone.js + `resolveNumber` | LID / `08…` não é telefone real; mismatch Sheets | `extractPhoneNumber`: só `09…`→244; LID resolvido via Evolution `findContacts` e `normalizePhone` no valor final |
| BUG-073 | src/routes/webhook.js | Intent detection recalculava `promptVariant` em cada mensagem → prompt alternava | `session.promptVariant` inicia em `default`; só `suporte_conta` (alta confiança) força `critical_rules` |
| BUG-074 | src/engine/intentDetector.js | "Tem plano de 3 ecrãs?" e similares disparavam `suporte_conta` por regex ampla em "plano" | `SUPORTE_HARD_PATTERNS` + `VENDA_OVERRIDE_PATTERNS`; na ambiguidade preferir VENDA; catálogo streaming ("pacotes Disney…") → `INTENT_DESCONHECIDO` (LLM) via `isStreamingCatalogPacoteQuestion` |

## CRM (pa_clients)

- Tabela `pa_clients` no Supabase pa-engine (migração aplicada via MCP, 23 Mar 2026).
- `engine/lib/crm.js` — `getClientByPhone(phone)` + `classifyClient(client)`.
- `engine/lib/supabase.js` — proxy leve que delega para `src/integrations/supabase.js` (cliente já inicializado).
- Classificações possíveis: `new_lead`, `active`, `expired`, `cancelled`, `trial`.
- Integrado no `src/routes/webhook.js` — classifica na carga CRM única por sessão; log `[CRM]` no LLM usa cache. `pa_conversations.customer_name` preenchido quando há nome no CRM ou `pushName` (migração `docs/migrations/20260324_pa_conversations_customer_name.sql`).
- Não bloqueia o bot em caso de erro (silencioso, continua como `new_lead`).
- 12 testes unitários em `tests/crm.test.js` (mocks do Supabase — zero chamadas reais).

## Daily Intelligence Brief

- Módulo: `engine/intel/` — `dailyBrief.js`, `sendBrief.js`, `briefCron.js`
- Cron: diariamente às **07:00 Angola** (06:00 UTC) — activo se `DAILY_BRIEF_ENABLED=true`
- Destino: Don → 244941713216 via Evolution API (instância `BRIEF_INSTANCE_NAME`)
- Query: `pa_daily_insights` últimas 24h → totais por bot (streamzone/luna/demo)
- Alertas automáticos: bot 0 msgs, DLQ > 0, avg response > 5s, Supabase indisponível
- Template string puro — **zero chamadas LLM**; graceful degradation se Supabase/Redis falharem
- Retry: 1x após 30s se Evolution API falhar
- Testes: `tests/engine/intel/dailyBrief.test.js` (5 cenários) + `sendBrief.test.js` (4 cenários)

### .env vars necessárias

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `DAILY_BRIEF_ENABLED` | Activa o cron do brief | `true` |
| `BRIEF_INSTANCE_NAME` | Instância Evolution para enviar brief | `ZapPrincipal` |

## Watchtower (BI)

- Scaffold em `services/watchtower/` (extract, anonymizer, analyze, deliver).
- Tabela Supabase: `docs/pa_daily_insights.sql`.
- Cron semanal (sexta 18h) comentado em cron-manager; activar quando houver 3+ clientes.
