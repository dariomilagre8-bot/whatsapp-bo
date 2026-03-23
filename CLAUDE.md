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
5. Zero breaking changes nos testes existentes.
6. Deploy produção = `whatsapp-bot/`. Deploy manual: `npm run deploy`.
7. **CommonJS** (require/module.exports). Node.js 20. Sem TypeScript.
8. Toda melhoria ao engine beneficia todos os clientes.
9. **trace_id** em todos os logs (via createLogger(traceId, clientSlug, module)).
10. **Evolution — instância de envio:** `engine/lib/sender.js` / `src/engine/sender.js` resolvem o nome da instância por ordem: `clientConfig.evolutionInstance` → `evolutionConfig.instance` → `EVOLUTION_INSTANCE` / `EVOLUTION_INSTANCE_NAME` no `.env`. O webhook usa o `tenantConfig` do registry (`req.clientConfig`) para cada mensagem.

## Comandos

| Comando | Descrição |
|--------|-----------|
| `npm test` | Todos os testes (StreamZone + engine, incl. sender) |
| `npm run eval` | Testes adversariais (4 personas) |
| `npm run deploy` | Deploy produção (scripts/deploy.sh) |
| `npm run backup` | Backup env vars do container (BUG-046 fix) |
| `npm run new-client` | Criar novo cliente (engine/scripts/novo-cliente.sh) |

## Deploy

- **Servidor:** 46.224.99.52 (Hetzner)
- **Easypanel:** jules/whatssiru
- **Manual:** `npm run deploy` (rsync + docker rebuild)
- **Health:** GET `/api/health` e GET `/api/metrics` (Prometheus text)

## Estrutura de rotas

- POST `/webhook` e POST `/webhook/messages` — Webhook router (200 imediato, dedup, trace_id, routing por instanceName).
- GET `/api/health` — Estado dos serviços.
- GET `/api/metrics` — Métricas por cliente (formato Prometheus).

## Bugs Conhecidos / Fixes

| Bug | Ficheiro | Descrição | Fix |
|-----|----------|-----------|-----|
| BUG-046 | scripts/backup-env.sh | Perda de env vars após rebuild | `npm run backup` antes de deploy |
| BUG-067 | src/engine/intentDetector.js | `\b` regex falha com acentos PT (á, ã, é) | `normalizePattern()` usa lookahead/lookbehind Unicode-aware (U+00C0–U+024F) |

## Watchtower (BI)

- Scaffold em `services/watchtower/` (extract, anonymizer, analyze, deliver).
- Tabela Supabase: `docs/pa_daily_insights.sql`.
- Cron semanal (sexta 18h) comentado em cron-manager; activar quando houver 3+ clientes.
