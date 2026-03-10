# Arquitectura do Palanca Bot Engine (Zara / StreamZone)

**Versão:** 2.0 — Março 2026  
**Negócio:** Revenda de contas Netflix e Prime Video em Angola  
**Stack:** Node.js + Express + Gemini 2.5 Flash + Supabase + Google Sheets + Evolution API (WhatsApp)

---

## 1. Visão Geral do Fluxo de Mensagem

```
Cliente (WhatsApp)
        │
        ▼
Evolution API ──► POST /webhook
        │
        ▼
┌─────────────────────────────────────────────┐
│  CAMADA 0: PRÉ-PROCESSAMENTO                │
│  - Filtrar mensagens próprias (fromMe)       │
│  - Extrair senderNum, pushName, tipo media   │
│  - Ignorar grupos (@g.us)                   │
└─────────────────────┬───────────────────────┘
                      │
        ┌─────────────▼─────────────┐
        │  SUPERVISOR?              │
        │  (isSupervisor check)     │
        └─────────────┬─────────────┘
               SIM ───┤─── NÃO
                │      │
                ▼      ▼
         Comandos #    CRM: upsertLead()
         (#sim, #nao,
          #leads, #lead,
          #waitlist, #stock,
          #expirados, #renovar,
          #libertar, #teste)
                │
                ▼
     ┌─────────────────────────┐
     │  INTERCEPTORES (camada  │
     │  pre-LLM, em ordem):    │
     │  1. Sessão pausada?     │
     │  2. Media (audio/img/   │
     │     doc)?               │
     │  3. Cliente existente?  │
     │     (planilha Telefone) │
     │  4. Reclamação?         │
     │     (keywords técnicas) │
     │  5. Cancelamento?       │
     │  6. Pedido humano?      │
     └─────────────┬───────────┘
                   │
                   ▼
     ┌─────────────────────────┐
     │  PIPELINE LLM-FIRST     │
     │  A: Inventário (Sheets) │
     │  A+: Supabase (cliente) │
     │  B: Histórico (5 msgs)  │
     │  C: Gemini 2.5 Flash    │
     │  D: Processar resposta  │
     └─────────────┬───────────┘
                   │
     ┌─────────────▼──────────────────────────────┐
     │  DETECÇÃO DE TAGS NA RESPOSTA DO LLM        │
     │  #RESUMO_VENDA  → pendingSale na sessão     │
     │  #WAITLIST      → stock_waitlist Supabase   │
     │  #RECLAMACAO    → pausa + notif supervisor  │
     │  #CANCELAMENTO  → pausa + notif supervisor  │
     │  #INDICACAO     → notif supervisor          │
     │  #MESES         → mesesPagamento na sessão  │
     └─────────────┬──────────────────────────────┘
                   │
                   ▼
           sendText() → cliente
```

---

## 2. Módulos do Projecto

```
whatsapp-bot/
├── index.js                    ← Entry point: init serviços + cron jobs + rotas
├── config/
│   ├── streamzone.js           ← Identidade, produtos, preços, stock config, comandos
│   └── bot_settings.json       ← Tabela de preços, nome do bot, metadata_tag
├── prompts/
│   ├── streamzone.txt          ← System prompt principal (Zara)
│   └── nichos/                 ← Prompts alternativos (clínica, loja, etc.)
├── src/
│   ├── routes/
│   │   ├── webhook.js          ← Handler principal (toda a lógica de routing)
│   │   └── reconnect.js        ← Reconexão Evolution API
│   ├── engine/
│   │   ├── llm.js              ← Gemini: buildDynamicPrompt + generate
│   │   ├── state-machine.js    ← Sessões em memória + histórico
│   │   ├── sender.js           ← sendText via Evolution API
│   │   ├── validator.js        ← Anti-alucinação (preços, termos internos)
│   │   ├── matcher.js          ← (legacy) matcher de regex
│   │   └── handlers.js         ← (legacy) handlers de estados
│   ├── integrations/
│   │   ├── supabase.js         ← getClientByPhone, getClient
│   │   ├── google-sheets.js    ← Stock, alocação, renovação, expiração
│   │   └── evolution.js        ← sendImage, getInstanceStatus
│   ├── billing/
│   │   └── reminder.js         ← Billing de clientes do bot (cron dia 1/8/16)
│   ├── stock/
│   │   ├── waitlist.js         ← Lista de espera de stock (Supabase)
│   │   └── stock-notifier.js   ← Cron 30min + #stock trigger
│   ├── renewal/
│   │   └── renewal-cron.js     ← Lembretes de renovação (cron 09:00)
│   ├── crm/
│   │   ├── leads.js            ← CRM: upsert, status, compras, resumo
│   │   ├── followup.js         ← Follow-up 30 dias (cron 10:00)
│   │   └── complaints.js       ← Detecção de reclamações + escalação
│   └── utils/
│       ├── logger.js           ← Logger
│       └── name-extractor.js   ← Extrai primeiro nome do pushName
└── docs/
    ├── ARCHITECTURE.md         ← Este ficheiro
    ├── ENTREGA.md              ← Estado da entrega e roadmap
    ├── billing-schema.sql      ← Schema Supabase: tabela clientes (billing)
    ├── crm-schema.sql          ← Schema Supabase: tabela leads
    └── stock-waitlist-schema.sql ← Schema Supabase: tabela stock_waitlist
```

---

## 3. Integrações Externas

| Integração | Propósito | Configuração |
|---|---|---|
| **Evolution API** | Envio/recepção de mensagens WhatsApp | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` |
| **Gemini 2.5 Flash** | LLM para geração de respostas | `GEMINI_API_KEY` |
| **Google Sheets** | Planilha de stock (Página1) + operações de alocação/renovação | `GOOGLE_SHEETS_ID`, `credentials.json` |
| **Supabase** | CRM (leads), lista de espera (stock_waitlist), clientes (billing) | `SUPABASE_URL`, `SUPABASE_KEY` |
| **node-cron** | Agendamento de tarefas periódicas | — |

---

## 4. Estrutura da Planilha Google Sheets (Página1)

| Col | Campo | Valores / Notas |
|---|---|---|
| A | Plataforma | Netflix, Prime Video |
| B | Email | Credencial da conta |
| C | Senha | Credencial da conta |
| D | NomePerfil | Nome do perfil |
| E | PIN | PIN do perfil (opcional) |
| F | Status | `disponivel` \| `indisponivel` \| `a_verificar` \| `uso_interno` |
| G | Cliente | Nome do cliente |
| H | Telefone | Número WhatsApp do cliente |
| I | Data_Venda | Data da venda (YYYY-MM-DD) |
| J | Data_Expiracao | Data de expiração (YYYY-MM-DD ou DD/MM/YYYY) |
| M | Plano | Individual, Partilha, Família, Família Completa |
| N | Valor | Preço em Kz |

**Status lifecycle:**
```
disponivel → indisponivel (após venda aprovada via #sim)
           → a_verificar  (1 dia após expiração sem renovação)
           → disponivel   (3 dias após expiração → libertado)
```

---

## 5. Tabelas Supabase

### `leads` — CRM de leads/clientes
```sql
id, numero, nome, status (novo|interessado|comprou|recorrente|inactivo),
primeiro_contacto, ultimo_contacto, total_mensagens, total_compras,
valor_total_compras, ultima_compra, produtos_interesse[], fonte,
follow_up_enviado, data_follow_up
```

### `stock_waitlist` — Lista de espera de stock
```sql
id, numero_cliente, nome_cliente, produto_desejado,
data_pedido, notificado, data_notificacao, vendido, data_venda
```

### `clientes` — Clientes do serviço de bot (billing)
```sql
id, nome_empresa, numero_whatsapp, pacote, valor_mensal_kz,
activo, ultimo_pagamento
```

---

## 6. Cron Jobs

| Job | Horário (Angola/UTC+1) | Variável de activação |
|---|---|---|
| Lembretes de renovação (3d, hoje, +1d, +3d libertar) | 09:00 todos os dias | `RENEWAL_ENABLED=true` |
| Notificação de stock reposto (waitlist) | a cada 30 minutos | `STOCK_NOTIFICATIONS_ENABLED=true` |
| Follow-up automático (30 dias após compra) | 10:00 todos os dias | `FOLLOWUP_ENABLED=true` |
| Billing: lembrete pagamento bot | dia 1 às 10:00 | `BILLING_ENABLED=true` |
| Billing: lembrete atraso | dia 8 às 10:00 | `BILLING_ENABLED=true` |
| Billing: pausa inadimplentes | dia 16 às 10:00 | `BILLING_ENABLED=true` |
| CRM: marcar inactivos (60 dias) | segunda-feira 03:00 | automático |

---

## 7. Comandos do Supervisor

| Comando | Acção |
|---|---|
| `#sim [número]` | Aprova venda → aloca perfil + envia credenciais ao cliente |
| `#nao [número]` | Rejeita comprovativo → desbloqueia cliente |
| `#pausar [número]` | Pausa bot para número específico |
| `#retomar [número]` | Retoma bot para número específico |
| `#reset` / `#reset [número]` | Reseta sessões (todos ou um) |
| `#status` | Mostra sessões activas/pausadas |
| `#teste on/off` | Modo teste (supervisor fala como cliente) |
| `#leads` | Resumo CRM (novos, interessados, compraram, recorrentes) |
| `#lead [número]` | Detalhe de um lead específico |
| `#waitlist` | Resumo da lista de espera de stock |
| `#stock [produto]` | Trigger manual: notifica clientes na waitlist |
| `#expirados` | Lista perfis com Data_Expiracao < hoje |
| `#renovar [telefone]` | Marca renovação manual (+30 dias) |
| `#libertar [email] [perfil]` | Liberta perfil manualmente |

---

## 8. Tags Internas (LLM → Webhook)

Tags que o LLM inclui na resposta e o webhook intercepta (removendo antes de enviar ao cliente):

| Tag | Acção no webhook |
|---|---|
| `#RESUMO_VENDA: [info]` | Guarda pendingSale na sessão (aguarda #sim) |
| `#WAITLIST: [produto]` | Adiciona à stock_waitlist no Supabase |
| `#RECLAMACAO: [desc]` | Pausa bot + notifica supervisor |
| `#CANCELAMENTO: [info]` | Pausa bot + notifica supervisor |
| `#INDICACAO: [nome] [número]` | Notifica supervisor com dados do indicado |
| `#MESES: [n]` | Guarda mesesPagamento na sessão (pagamento antecipado) |

---

## 9. Variáveis de Ambiente (.env)

```env
# Core
PORT=80
GEMINI_API_KEY=...

# Evolution API (WhatsApp)
EVOLUTION_API_URL=...
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=...

# Google Sheets
GOOGLE_SHEETS_ID=...

# Supabase
SUPABASE_URL=...
SUPABASE_KEY=...

# Supervisor
SUPERVISOR_NUMBER=244946014060
SUPERVISOR_NUMBERS=244946014060

# Funcionalidades (activar/desactivar)
RENEWAL_ENABLED=true
STOCK_NOTIFICATIONS_ENABLED=true
FOLLOWUP_ENABLED=true
BILLING_ENABLED=false
```

---

## 10. Princípios de Design

1. **Non-blocking:** Todos os módulos CRM/stock capturam erros internamente. Se falharem, o bot continua.
2. **LLM-First:** Texto vai sempre para o Gemini. Interceptores só actuam em casos determinísticos (media, pausa, reclamação).
3. **Supervisor-in-the-loop:** Vendas, reclamações e cancelamentos sempre passam pelo supervisor antes de acção final.
4. **Rate limiting:** Máx. 10 mensagens de renovação/dia; máx. 5 notificações de stock/min.
5. **Horário Angola:** Crons e envios respeitam UTC+1 (Africa/Luanda).
