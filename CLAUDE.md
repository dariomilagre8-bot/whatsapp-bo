# CLAUDE.md — Palanca Bot Engine v2.0

## Monorepo

- **engine/** — Código genérico (ZERO referências a clientes). Inclui: lib (logger, state-machine, matcher, validator, handlers, llm, sender, dedup, metrics, cron-manager), middleware (health, webhook-router), evals (personas, simulator, judge), scripts, templates.
- **clients/** — Config por cliente (streamzone; futuros: kitanda, etc.). Cada cliente tem config.js, opcionalmente prompts.js e validators.js.
- **services/** — Microserviços (watchtower: BI em scaffold).
- **tests/** — engine.test.js (59 testes StreamZone) + tests/engine/* (dedup, logger, metrics, config-loader).

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

## Comandos

| Comando | Descrição |
|--------|-----------|
| `npm test` | Todos os testes (59 + engine) |
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

## Watchtower (BI)

- Scaffold em `services/watchtower/` (extract, anonymizer, analyze, deliver).
- Tabela Supabase: `docs/pa_daily_insights.sql`.
- Cron semanal (sexta 18h) comentado em cron-manager; activar quando houver 3+ clientes.
