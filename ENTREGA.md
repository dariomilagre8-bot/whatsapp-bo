# ENTREGA — Estado do Projecto Zara Bot

**Última actualização:** Março 2026  
**Negócio:** StreamZone Connect — Revenda de Netflix e Prime Video em Angola  
**Bot:** Zara (Palanca Bot Engine v2.0)

---

## Estado Actual: OPERACIONAL ✅

O bot está em produção no Easypanel. Todos os sistemas core estão implementados e testados.

---

## Funcionalidades Implementadas

### ✅ Core — Vendas

| Funcionalidade | Ficheiro | Estado |
|---|---|---|
| Fluxo de venda novo cliente | `src/routes/webhook.js` | ✅ Produção |
| Stock em tempo real (Google Sheets) | `src/integrations/google-sheets.js` | ✅ Produção |
| Bloqueio de venda sem stock | `src/engine/llm.js` | ✅ Produção |
| Dados de pagamento (IBAN + Multicaixa) | `config/streamzone.js` | ✅ Produção |
| Tag `#RESUMO_VENDA` → pendingSale | `src/routes/webhook.js` | ✅ Produção |
| Aprovação #sim → aloca perfil + credenciais | `src/routes/webhook.js` | ✅ Produção |
| Rejeição #nao → desbloqueia cliente | `src/routes/webhook.js` | ✅ Produção |
| Anti-alucinação (preços, termos internos) | `src/engine/validator.js` | ✅ Produção |

### ✅ Gestão de Clientes

| Funcionalidade | Ficheiro | Estado |
|---|---|---|
| Detecção de cliente existente (planilha Telefone) | `src/routes/webhook.js` | ✅ Implementado |
| Reconhecimento por Supabase (tabela clientes) | `src/integrations/supabase.js` | ✅ Produção |
| Memória de sessão (5 mensagens) | `src/engine/state-machine.js` | ✅ Produção |
| CRM de leads (upsert por mensagem) | `src/crm/leads.js` | ✅ Implementado |

### ✅ Renovação Automática (Sistema 1)

| Funcionalidade | Estado |
|---|---|
| Lembrete 3 dias antes da expiração | ✅ Implementado |
| Lembrete no dia da expiração | ✅ Implementado |
| Marcar `a_verificar` + último aviso (+1 dia) | ✅ Implementado |
| Libertar perfil automaticamente (+3 dias) | ✅ Implementado |
| Notificação supervisor ao expirar | ✅ Implementado |
| Pagamento antecipado (Data_Expiracao × meses) | ✅ Implementado |
| Activação: `RENEWAL_ENABLED=true` | ✅ |

### ✅ Notificação de Stock (Sistema 2)

| Funcionalidade | Estado |
|---|---|
| Lista de espera `stock_waitlist` (Supabase) | ✅ Implementado |
| Cron 30min: detectar reposição e notificar | ✅ Implementado |
| Tag `#WAITLIST` detectada na resposta LLM | ✅ Implementado |
| Comando `#stock [produto]` — trigger manual | ✅ Implementado |
| Activação: `STOCK_NOTIFICATIONS_ENABLED=true` | ✅ |

### ✅ CRM e Follow-up (Sistema 3)

| Funcionalidade | Estado |
|---|---|
| CRM automático (novo, interessado, comprou, recorrente) | ✅ Implementado |
| Follow-up 30 dias após compra | ✅ Implementado |
| Comandos `#leads`, `#lead [número]` | ✅ Implementado |
| Activação: `FOLLOWUP_ENABLED=true` | ✅ |

### ✅ Gestão de Reclamações (Lacuna 4)

| Funcionalidade | Estado |
|---|---|
| Interceptor pré-LLM (keywords técnicas) | ✅ Implementado |
| Pausa bot + notificação supervisor com contexto | ✅ Implementado |
| Tag `#RECLAMACAO` (backup via LLM) | ✅ Implementado |
| NÃO tenta vender durante reclamação | ✅ Implementado |

### ✅ Cancelamento (Lacuna 10)

| Funcionalidade | Estado |
|---|---|
| Interceptor de cancelamento (keywords fortes) | ✅ Implementado |
| Pausa bot + notificação supervisor | ✅ Implementado |
| Tag `#CANCELAMENTO` (confirmação via LLM) | ✅ Implementado |

### ✅ FAQ Automático (Lacuna 9)

| Pergunta | Estado |
|---|---|
| Tempo de activação | ✅ No prompt LLM |
| Número de dispositivos por plano | ✅ No prompt LLM |
| Mudança de senha | ✅ No prompt LLM |
| Moeda aceite | ✅ No prompt LLM |
| Como funciona o serviço | ✅ No prompt LLM |
| Funciona offline? | ✅ No prompt LLM |
| Funciona em que países? | ✅ No prompt LLM |

### ✅ Indicação de Clientes (Lacuna 6)

| Funcionalidade | Estado |
|---|---|
| Detecção de referência no LLM | ✅ Implementado |
| Tag `#INDICACAO` → notificação supervisor | ✅ Implementado |

### ✅ Pagamento Antecipado (Lacuna 3)

| Funcionalidade | Estado |
|---|---|
| LLM calcula valor × meses | ✅ No prompt LLM |
| Tag `#MESES: N` guardada na sessão | ✅ Implementado |
| `allocateProfile` usa meses → Data_Expiracao correcta | ✅ Implementado |

### ✅ Comandos do Supervisor

| Comando | Estado |
|---|---|
| `#sim`, `#nao` | ✅ Produção |
| `#pausar`, `#retomar`, `#reset`, `#status` | ✅ Produção |
| `#teste on/off` | ✅ Produção |
| `#leads`, `#lead [número]` | ✅ Implementado |
| `#waitlist` | ✅ Implementado |
| `#stock [produto]` | ✅ Implementado |
| `#expirados` | ✅ Implementado |
| `#renovar [telefone]` | ✅ Implementado |
| `#libertar [email] [perfil]` | ✅ Implementado |

---

## Tabelas Supabase a Criar

Execute estes scripts no SQL Editor do Supabase antes de activar as funcionalidades:

```
docs/crm-schema.sql          → tabela leads
docs/stock-waitlist-schema.sql → tabela stock_waitlist
docs/billing-schema.sql      → tabela clientes (só se BILLING_ENABLED)
```

---

## Variáveis de Ambiente a Configurar

```env
# Activar renovação automática
RENEWAL_ENABLED=true

# Activar notificações de stock reposto
STOCK_NOTIFICATIONS_ENABLED=true

# Activar follow-up automático (30 dias)
FOLLOWUP_ENABLED=true
```

---

## Lacunas Restantes (Menor Prioridade)

| Lacuna | Descrição | Prioridade |
|---|---|---|
| Lacuna 5: Upgrade/Downgrade | Detectar e processar mudança de plano programaticamente | Baixa |
| Lacuna 8: Múltiplos produtos simultâneos | Carrinho multi-produto numa transacção | Baixa |
| Dashboard web | Painel de analytics para o supervisor | Futuro |

---

## Arquitectura

Ver `docs/ARCHITECTURE.md` para diagrama completo de módulos, fluxo de mensagens, tabelas Supabase e variáveis de ambiente.

---

## Próximos Passos Recomendados

1. **Executar os schemas SQL** no Supabase (se ainda não feito)
2. **Activar `RENEWAL_ENABLED=true`** — é o sistema mais crítico para o negócio
3. **Verificar colunas J (Data_Expiracao) e D (NomePerfil)** na planilha Página1
4. **Testar comando `#expirados`** para ver perfis em risco
5. **Monitorar logs** nos primeiros dias após activar a renovação automática
