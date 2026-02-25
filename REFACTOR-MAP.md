# Mapa index.js → Módulos (refactor 25 Fev 2026)

## Secções do index.js original

| Linhas (aprox) | Secção | O que faz | Dependências | Destino |
|----------------|--------|-----------|--------------|---------|
| 1-18 | Imports | dotenv, express, cors, axios, https, multer, path, fs, Gemini, googleSheets, supabase | — | index.js |
| 20-27 | Express + CORS | app básico | — | index.js |
| 30-31 | port, genAI | Config | process.env | config.js |
| 34-66 | POST /api/web-checkout | Checkout site | CATALOGO, findAvailableProfiles, markProfileSold, sendWhatsAppMessage, MAIN_BOSS | routes/checkout.js |
| 68-134 | multer + POST /api/upload-comprovativo | Upload comprovativo site | pendingVerifications, clientStates, initClientState, sendWhatsAppMessage, SUPERVISOR | routes/checkout.js |
| 136-144 | RAW_SUPERVISORS, MAIN_BOSS, ALL_SUPERVISORS | Config supervisor | process.env | config.js |
| 146-218 | CATALOGO, PLAN_SLOTS, buildServiceMenuMsg, PAYMENT, PLAN_PROFILE_TYPE, SUPPORT_KEYWORDS, HUMAN_TRANSFER_PATTERN, LOCATION_ISSUE_PATTERN, ESCALATION_PATTERN, INTRO_COOLDOWN_MS, shouldSendIntro, markIntroSent | Constantes + helpers | branding, hasAnyStock | config.js + utils/loops.js |
| 228-267 | removeAccents, formatPriceTable, PLAN_LABELS, planChoicesText, PLAN_DETECT_PATTERNS, findPlan, detectServices, detectSupportIssue, detectQuantity | Funções puras | CATALOGO | fluxo/* (partilhadas) ou utils |
| 311-366 | BOT_NAME, BOT_IDENTITY, SYSTEM_PROMPT, SYSTEM_PROMPT_COMPROVATIVO, SYSTEM_PROMPT_CHAT_WEB_BASE | Prompts Gemini | branding | config.js ou manter inline onde usado |
| 368-451 | chatHistories, clientStates, pendingVerifications, pausedClients, lastIntroTimes, httpsAgent, dirtySessions, markDirty, persistSession, cleanupSession, loadSessionsOnStartup, setInterval flush | Estados + Supabase | supabase | utils/estados.js |
| 453-470 | NETFLIX_HOUSEHOLD_KEYWORDS, recentMessagesHaveNetflixKeyword | Netflix keywords | chatHistories, removeAccents | handlers/imagens.js |
| 472-509 | GET /qr | Página QR Evolution | axios, branding, httpsAgent, process.env | routes/qr.js |
| 511-555 | GET /api/stock-public, GET /api/planos-disponiveis | Stock público | hasAnyStock, countAvailableProfiles, CATALOGO | routes (admin ou index) |
| 558-593 | stockWaitlist, POST /api/notify-me, GET /api/waitlist | Lista espera stock | sendWhatsAppMessage | routes + estado em estados ou config |
| 595-661 | webChatHistories, POST /api/chat | Chat widget site | countAvailableProfiles, branding, genAI, BOT_NAME | routes/chat.js |
| 663-734 | lostSales, logLostSale, setInterval sweep aguardando_reposicao, setInterval 2h inactivos | Vendas perdidas + sweeps | clientStates, sendWhatsAppMessage, MAIN_BOSS, appendLostSale, cleanupSession, logLostSale | utils/notificacoes.js + fluxo/stock.js (sweeps) |
| 736-864 | sendWhatsAppMessage, sendCredentialsEmail, sendPaymentMessages, initClientState, CHANGE_MIND_PATTERNS, handleChangeMind | WhatsApp + estado inicial | cleanNumber, axios, branding, PAYMENT, CATALOGO | whatsapp.js + fluxo ou utils |
| 866-1116 | processApproval, processRejection | Aprovação/rejeição comprovativo | pendingVerifications, findAvailableProfiles, sendWhatsAppMessage, clientStates, cleanupSession, initClientState, markDirty, CATALOGO, PLAN_SLOTS, etc. | handlers/supervisor (parte) ou fluxo |
| 1119-2273 | app.post('/') — webhook Evolution: supervisor, cliente, steps (inicio, captura_nome, confirmacao_renovacao, escolha_servico, escolha_plano, resumo_pedido, aguardando_comprovativo, esperando_supervisor, aguardando_reposicao, aguardando_resposta_alternativa) | Toda a máquina de estados | Tudo | fluxo/* + handlers/* + index (orquestra) |
| 2275-3133 | adminRouter — stats, pending, approve, reject, stock, lost-sales, recover, expiracoes, expiracoes-db, avisar, broadcast, clientes, clientes-db, financeiro, financeiro-db, chat/:phone, active-sessions, session/pausar, session/retomar, broadcast, broadcast/expiracoes | Rotas admin | clientStates, pendingVerifications, sendWhatsAppMessage, etc. | routes/admin.js |
| 3126-3132 | GET /api/branding, GET /api/version | Público | branding | index ou routes |
| 3134-3149 | app.use('/api/admin', adminRouter), expiracao-modulo.iniciar, loadSessionsOnStartup, app.listen | Montagem e arranque | — | index.js |

## Dependências entre módulos

- **config.js**: só process.env e branding (para CATALOGO/preços).
- **utils/estados.js**: supabase, exporta objetos e funções de sessão.
- **utils/notificacoes.js**: sendWhatsAppMessage, MAIN_BOSS (recebe por injecção ou config).
- **utils/loops.js**: lastIntroTimes (estados), detecção de loop, throttle intro.
- **whatsapp.js**: axios, https, cleanNumber (googleSheets), branding, config (PAYMENT, CATALOGO).
- **handlers/imagens.js**: estados (chatHistories), recentMessagesHaveNetflixKeyword, sendWhatsAppMessage, MAIN_BOSS, BOT_NAME, branding.
- **handlers/supervisor.js**: comandos supervisor, processApproval, processRejection, estados, sendWhatsAppMessage, etc.
- **handlers/escalacao.js**: ESCALATION_PATTERN, HUMAN_TRANSFER_PATTERN, LOCATION_ISSUE_PATTERN, pausa + notificação.
- **handlers/expiracoes.js**: re-exporta expiracao-modulo.iniciar (deps injetadas no index).
- **fluxo/inicio.js**: steps inicio, captura_nome; checkClientInSheet, findClientByName, updateClientPhone, buildServiceMenuMsg, etc.
- **fluxo/renovacao.js**: step confirmacao_renovacao.
- **fluxo/venda.js**: escolha_servico, escolha_plano, resumo_pedido, aguardando_comprovativo, esperando_supervisor.
- **fluxo/stock.js**: aguardando_reposicao, aguardando_resposta_alternativa; sweeps (setIntervals).
- **routes/admin.js**: todas as rotas /api/admin/*, usa estados, sendWhatsAppMessage, processApproval, processRejection, etc.
- **routes/chat.js**: POST /api/chat.
- **routes/checkout.js**: POST /api/web-checkout, POST /api/upload-comprovativo.
- **routes/qr.js**: GET /qr.
- **index.js**: require todos, app.use(express.json()), app.use(cors), monta rotas, loadSessionsOnStartup().then(() => app.listen()).

## Ordem de criação (sem alterar lógica)

1. config.js  
2. utils/estados.js  
3. utils/notificacoes.js  
4. utils/loops.js  
5. whatsapp.js  
6. handlers/supervisor.js  
7. handlers/imagens.js  
8. handlers/escalacao.js  
9. handlers/expiracoes.js  
10. fluxo/venda.js, renovacao.js, stock.js, inicio.js  
11. routes/admin.js, chat.js, checkout.js, qr.js  
12. index.js (entry <100 linhas)
