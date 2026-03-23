# Runbook de Operações — Palanca Automações

> Guia de resposta a incidentes para os bots WhatsApp (Zara, Luna, Bia, e futuros).
> Última actualização: 2026-03-23

---

## 1. Bot não responde

**Sintomas:** Cliente envia mensagem e não recebe resposta.

1. Verificar Easypanel → o serviço está a correr? (verde = running)
2. `GET /api/health` — qual componente reporta erro?
3. Verificar Evolution Manager → instância está `connected`?
4. Ver logs do serviço no Easypanel → erros recentes?
5. Se tudo ok mas ainda não responde → verificar dedup (mensagem duplicada ignorada?)
6. Último recurso: redeploy do serviço no Easypanel

**Comandos úteis:**
```bash
# Health check rápido
curl -s http://jules_whatssiru:80/api/health | python3 -m json.tool

# Logs em tempo real (no servidor VPS)
docker logs -f --tail=50 jules_whatssiru
```

---

## 2. Evolution disconnected

**Sintomas:** Health check reporta `evolution: error` ou `connected: false`.

1. Ir ao Evolution Manager (`https://whatsapp-evolution-api.oxuzyt.easypanel.host`)
2. Seleccionar a instância → clicar "Reconectar"
3. Escanear o QR Code com o telemóvel associado ao número
4. Se não funcionar: **DELETE instância** → criar nova com o mesmo nome → scan QR
5. Após recriar: reconfigurar webhook (ver secção 9)
6. Verificar nos logs que o bot voltou a receber mensagens

**Nota:** O Watchdog tenta restart automático. Se não resolver em 10 min, actuar manualmente.

---

## 3. LLM falha (Claude / Gemini)

**Sintomas:** Bot responde com mensagens genéricas ou erros, sem resposta personalizada.

1. Verificar key Anthropic: https://console.anthropic.com → Usage & Keys
2. Se rate limited (`429`) → esperar ou activar fallback Gemini no `.env`:
   ```env
   LLM_FALLBACK=gemini
   ```
3. Verificar `.env` do serviço → `ANTHROPIC_API_KEY` correcta?
4. Circuit breaker aberto? → após 60s fecha automaticamente
5. Verificar `GET /api/health` → campo `checks.llm` (se presente)

---

## 4. Novo cliente

**Processo standard para onboarding de novo cliente:**

1. Executar wizard interactivo:
   ```bash
   ./scripts/novo-cliente.sh
   ```
2. Seguir o wizard: nome, bot, nicho, número, supervisor, plano
3. Script cria `clients/<slug>/config.js` a partir do template
4. Script cria instância Evolution + configura webhook
5. Escanear QR Code com o número WhatsApp Business do cliente
6. No Easypanel: criar novo serviço (ou adicionar ao multi-tenant `whatssiru`)
7. Testar: enviar "Oi" para o número e verificar resposta
8. Verificar `GET /api/health`

**Multi-tenant (adicionar ao whatssiru existente):**
- O serviço `whatssiru` já carrega automaticamente todos os `clients/<slug>/config.js`
- Basta fazer redeploy do `whatssiru` após adicionar o novo cliente
- Sem necessidade de criar novo serviço Easypanel

---

## 5. Bot alucina / resposta incorrecta

**Sintomas:** Bot dá informações erradas, inventa preços, confunde serviços.

1. Verificar `fixedResponses` no `clients/<slug>/config.js` — estão correctas?
2. Adicionar / melhorar patterns de intent detection
3. Rever system prompt do LLM (`prompts/<slug>.txt` ou `config.js → identity.systemPrompt`)
4. Verificar se há mensagens de contexto anteriores a contaminar a resposta
5. Se persistir → activar `supervisor: true` nos módulos para escalar automaticamente
6. Em último caso: limpar estado do utilizador (sessão no StateMachine)

---

## 6. Deploy falhou

**Sintomas:** Push deu erro, serviço não arranca, erro 502/503 no Easypanel.

1. Ver logs de build no Easypanel → qual erro?
2. Identificar o problema:
   ```bash
   git log --oneline -5
   ```
3. Reverter o último commit problemático:
   ```bash
   git revert HEAD
   git push
   ```
4. Se problema no `.env` → corrigir directamente no Easypanel → redeploy
5. Para rollback de emergência: no Easypanel → Deploy → escolher build anterior

---

## 7. Disco cheio no VPS

**Sintomas:** Serviços não arrancam, logs com "no space left on device".

1. Ver uso do disco:
   ```bash
   df -h
   docker system df
   ```
2. Limpar imagens Docker não usadas (CUIDADO — só imagens não activas):
   ```bash
   docker image prune -a
   ```
3. Limpar containers parados e redes:
   ```bash
   docker system prune -f
   ```
4. Limpar volumes orphan (CUIDADO — confirmar antes):
   ```bash
   docker volume prune
   ```
5. Limpar logs antigos:
   ```bash
   sudo find /var/log -name "*.log" -mtime +7 -delete
   ```
6. Se disco ainda > 90%: contactar Hetzner para expandir

---

## 8. Supabase down

**Sintomas:** Logs sem analytics, `health.checks.supabase: error`.

1. Verificar status: https://status.supabase.com
2. Verificar dashboard: https://supabase.com/dashboard → projecto `pa-engine`
3. Verificar credenciais `.env`: `SUPABASE_URL` e `SUPABASE_KEY`
4. **Impacto:** Os bots continuam a funcionar (só perde logging e analytics)
5. Quando Supabase voltar: as mensagens perdidas durante o downtime não são recuperadas
6. Se problema persistir > 1h: criar ticket no suporte Supabase

---

## 9. Reconfigurar webhook Evolution

Após recriar instância ou mudar URL do bot:

```bash
# Substituir INSTANCE_NAME e WEBHOOK_URL
curl -X PUT "https://whatsapp-evolution-api.oxuzyt.easypanel.host/webhook/set/INSTANCE_NAME" \
  -H "apikey: 7d39b8fa-7176-4ac8-90a3-effefe0d7103" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "http://jules_whatssiru:80/webhook",
      "webhookByEvents": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

---

## Contactos de Emergência

| Serviço | Suporte |
|---------|---------|
| Hetzner VPS | https://console.hetzner.cloud |
| Easypanel | https://easypanel.io/docs |
| Evolution API | https://doc.evolution-api.com |
| Supabase | https://status.supabase.com |
| Anthropic (Claude) | https://console.anthropic.com |
| Google (Gemini) | https://aistudio.google.com |
