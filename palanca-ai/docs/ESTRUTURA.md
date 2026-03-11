# Palanca AI — Estrutura de Diretórios

```
palanca-ai/
├── src/
│   ├── config/
│   │   └── index.ts              # Configurações centralizadas e env
│   ├── errors/
│   │   ├── index.ts              # Barrel export dos erros customizados
│   │   ├── TestTimeoutError.ts   # Erro de timeout do teste
│   │   └── LLMParsingError.ts    # Erro de parsing do JSON do Claude
│   ├── services/
│   │   ├── claude.service.ts     # Integração Claude (Anthropic SDK) — Juiz de QA
│   │   ├── telegram.service.ts   # Comandos admin e alertas (node-telegram-bot-api)
│   │   ├── whatsapp.service.ts   # Sessão WhatsApp para fluxo de teste (whatsapp-web.js ou Baileys)
│   │   ├── supabase.service.ts   # Logs de auditoria e histórico de baterias
│   │   └── notion.service.ts     # Relatórios detalhados (Notion API)
│   ├── orchestrator/
│   │   └── test.orchestrator.ts  # State Machine: INICIANDO → TESTANDO → AVALIANDO → CONCLUIDO / FALHA_CRITICA
│   ├── types/
│   │   └── index.ts              # Interfaces: TestSession, TestResult, BotContext, etc.
│   └── index.ts                  # Entrypoint: inicia Telegram bot e orquestrador
├── docs/
│   └── ESTRUTURA.md              # Este ficheiro
├── package.json
├── tsconfig.json
├── .env.example
├── Dockerfile
└── docker-compose.yml
```

## Descrição dos Módulos

| Módulo | Responsabilidade |
|--------|------------------|
| **config** | Variáveis de ambiente, constantes e configuração do LLM/Telegram/WhatsApp. |
| **errors** | Classes de erro customizadas para timeout, parsing e desconexão WhatsApp. |
| **services** | Injeção de dependências: Claude, Telegram, WhatsApp, Supabase, Notion. |
| **orchestrator** | Máquina de estados do teste; coordena Claude ↔ WhatsApp e pipeline pós-teste. |
| **types** | Contratos TypeScript (TestSession, TestResult, relatório JSON do Claude). |
