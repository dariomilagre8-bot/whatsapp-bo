# Arquitectura — Palanca Automações

> Documentação técnica da infraestrutura e fluxo de mensagens.
> Última actualização: 2026-03-23

---

## Fluxo de Mensagem

```
Cliente WhatsApp
    │
    ▼
Evolution API (whatsapp-evolution-api.oxuzyt.easypanel.host)
    │
    ├── webhook → http://jules_whatssiru:80/webhook         (Zara — multi-tenant)
    ├── webhook → http://jules_demo-moda:80/webhook         (Bia — demo)
    └── webhook → https://automacoes-palanca-ai.oxuzyt.easypanel.host/webhook  (Luna)
         │
         ▼
    Engine (Node.js 20 / CommonJS)
    ├── Dedup (Redis — idempotência, ignora duplicados em 30s)
    ├── Rate Limiter (5 msg/30s por número)
    ├── Webhook Router (routing por instanceName → clientConfig)
    ├── Intent Detection (7 categorias + suporte_conta)
    ├── Config Loader → clients/<slug>/config.js
    ├── Circuit Breaker (LLM: 3 falhas→open 60s | Evolution: 3 falhas→open 60s)
    ├── LLM Pipeline (Claude Sonnet 4 → Gemini fallback → fixedResponses)
    ├── Sender → Evolution API → WhatsApp
    ├── Watchdog (check cada 5min → auto-recovery Evolution → alertas WhatsApp)
    └── Health Check (/api/health — cache 30s)
         │
         ▼
    Serviços Externos
    ├── Supabase (pa-engine) → logs de mensagens, analytics, CRM
    ├── Redis → idempotência/dedup, cache de sessões
    └── Google Sheets → catálogos e inventário (StreamZone)
```

---

## Serviços Easypanel

| Projecto | Serviço | Porta interna | Função |
|----------|---------|---------------|--------|
| jules | whatssiru | 80 | Engine multi-tenant (Zara + novos clientes) |
| jules | demo-moda | 80 | Engine demo (Bia) |
| automacoes | palanca-ai | 3001 | Luna — codebase v1 (legado) |
| automacoes | redis | 6379 | Redis para palanca-ai |
| whatsapp | evolution-api | 8080 | Evolution API (gestão WhatsApp) |
| whatsapp | evolution-api-db | 5432 | PostgreSQL para Evolution |
| whatsapp | evolution-api-redis | 6379 | Redis para Evolution |

---

## VPS

| Propriedade | Valor |
|-------------|-------|
| Provedor | Hetzner Cloud |
| IP | 46.224.99.52 |
| SO | Ubuntu 22.04 |
| Docker | 26.1.4 (HOLD — não actualizar) |
| Easypanel | 2.27.0 |
| RAM | 4 GB |
| Disco | 80 GB (uso ~79%) |
| Localização | Nuremberg, DE |

---

## Monorepo — Estrutura de Pastas

```
whatsapp-bot/
├── engine/                  # Código genérico — ZERO referências a clientes
│   ├── lib/
│   │   ├── circuit-breaker.js
│   │   ├── dedup.js
│   │   ├── handlers.js
│   │   ├── health.js
│   │   ├── llm.js
│   │   ├── logger.js
│   │   ├── matcher.js
│   │   ├── metrics.js
│   │   ├── rate-limiter.js
│   │   ├── sender.js
│   │   ├── state-machine.js
│   │   ├── validator.js
│   │   └── watchdog.js        ← Novo (Fase 3)
│   ├── middleware/
│   │   ├── health.js
│   │   └── webhook-router.js
│   ├── templates/
│   │   └── nichos/            ← Novo (Fase 3)
│   │       ├── nicho-ecommerce.config.js
│   │       ├── nicho-restaurante.config.js
│   │       ├── nicho-beleza.config.js
│   │       ├── nicho-streaming.config.js
│   │       └── nicho-generico.config.js
│   └── utils/
├── clients/                 # Config por cliente
│   ├── streamzone/config.js  (Zara)
│   ├── luna/config.js        (Luna)
│   └── demo/config.js        (Bia)
├── src/                     # Código legado StreamZone
│   ├── engine/
│   ├── routes/
│   ├── crm/
│   ├── billing/
│   ├── stock/
│   └── integrations/
├── config/                  # Configs base e streamzone
├── scripts/
│   ├── novo-cliente.sh       ← Wizard interactivo (Fase 3)
│   ├── deploy.sh
│   └── backup-env.sh
├── services/
│   └── watchtower/          # BI scaffold (inactivo)
├── tests/                   # Testes unitários
├── docs/
│   ├── runbook.md            ← Novo (Fase 3)
│   └── arquitectura.md      ← Este ficheiro (Fase 3)
└── index.js                 # Entry point
```

---

## Multi-Tenant — Como funciona

O `index.js` mantém um `registry` (Map) que associa `instanceName → { config, handler }`:

1. **Cliente primário** (`config.evolutionInstance`) carregado no boot
2. **StreamZone** sempre registado (`Streamzone Braulio` + `Zara-Teste`)
3. **clients/<slug>/config.js** auto-registados ao boot (exceto streamzone e primário)
4. **Webhook router** recebe POST → extrai `instanceName` do payload → rota para o handler correcto
5. Cada handler tem o seu `StateMachine`, `evolutionConfig` e `clientConfig`

Para adicionar um novo cliente: basta criar `clients/<slug>/config.js` e reiniciar o serviço.

---

## Watchdog — Ciclo de vida

```
Boot → setTimeout(30s) → primeiro check
         │
         ▼
check() a cada 5 minutos:
  ├── getHealth(dependencies) → status?
  │     ├── healthy → ok, nothing to do
  │     └── unhealthy/degraded → handleDegraded()
  │           ├── Evolution error? → tryRecoverEvolution() (PUT /instance/restart)
  │           └── alert() → enviar WhatsApp para supervisores
  │                 (throttle: 30min entre alertas do mesmo tipo)
  └── checkInactivity()
        └── sem msgs há 6h em horário comercial (8-22h Angola)?
              → alert() supervisores
```

---

## Circuit Breakers

| Serviço | Threshold | Timeout reset | Comportamento aberto |
|---------|-----------|---------------|----------------------|
| LLM (Claude/Gemini) | 3 falhas | 60s | Usar `fixedResponses` do config |
| Evolution API | 3 falhas | 60s | Log erro, não enviar |
| Rate Limiter | 5 msg/30s por número | janela 30s | Ignorar mensagem silenciosamente |

---

## Variáveis de Ambiente (.env)

```env
# Evolution API
EVOLUTION_API_URL=https://whatsapp-evolution-api.oxuzyt.easypanel.host
EVOLUTION_API_KEY=7d39b8fa-7176-4ac8-90a3-effefe0d7103
EVOLUTION_INSTANCE=Streamzone Braulio

# LLM
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...

# Supabase
SUPABASE_URL=https://vxrziqsyfpnmpzkjkxli.supabase.co
SUPABASE_KEY=eyJ...

# Redis (opcional)
REDIS_URL=redis://localhost:6379

# Bot
BOT_NAME=Zara
BUSINESS_NAME=StreamZone Connect
SUPERVISOR_NUMBERS=244946014060

# Funcionalidades
BILLING_ENABLED=false
STOCK_NOTIFICATIONS_ENABLED=false
FOLLOWUP_ENABLED=false
RENEWAL_ENABLED=false
```
