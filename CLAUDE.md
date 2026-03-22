# CLAUDE.md — Palanca Bot Engine v2.0

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

## Watchtower (BI)

- Scaffold em `services/watchtower/` (extract, anonymizer, analyze, deliver).
- Tabela Supabase: `docs/pa_daily_insights.sql`.
- Cron semanal (sexta 18h) comentado em cron-manager; activar quando houver 3+ clientes.
