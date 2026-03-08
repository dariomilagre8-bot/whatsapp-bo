# Health Check — Palanca Bot Engine

## Endpoint

```
GET /health
```

**URL de produção:** `https://automacoes-palanca-ai.oxuzyt.easypanel.host/health`

## Resposta (200 OK)

Quando todos os serviços estão operacionais:

```json
{
  "status": "ok",
  "engine": "Palanca Bot Engine (LLM-First)",
  "bot": "Zara",
  "business": "StreamZone Connect",
  "sessions": 5,
  "uptime": 86400,
  "timestamp": "2026-03-08T10:00:00.000Z",
  "services": {
    "supabase": "ok",
    "evolution": "ok"
  }
}
```

## Resposta (503 Service Unavailable)

Quando algum serviço crítico está em baixo:

```json
{
  "status": "degraded",
  "services": {
    "supabase": "down",
    "evolution": "ok"
  }
}
```

## Estados dos Serviços

| Estado           | Significado                          |
|------------------|--------------------------------------|
| `ok`             | Serviço operacional                  |
| `degraded`       | Serviço com problemas mas acessível  |
| `down`           | Serviço indisponível                 |
| `not_configured` | Variáveis de ambiente não definidas  |

## Configurar UptimeRobot

1. Criar conta em [uptimerobot.com](https://uptimerobot.com)
2. Adicionar novo monitor:
   - **Tipo:** HTTP(s)
   - **URL:** `https://automacoes-palanca-ai.oxuzyt.easypanel.host/health`
   - **Intervalo:** 5 minutos
   - **Keyword:** `"status":"ok"` (tipo: keyword exists)
3. Configurar alertas:
   - Email do administrador
   - Webhook para WhatsApp (via Evolution API) se desejado

## Webhook de Alerta para WhatsApp

Para receber alertas no WhatsApp quando o bot ficar offline, configurar um webhook no UptimeRobot que chama:

```
POST https://[EVOLUTION_API_URL]/message/sendText/[INSTANCE]
Headers: { "apikey": "[API_KEY]", "Content-Type": "application/json" }
Body: { "number": "[SUPERVISOR_NUMBER]@s.whatsapp.net", "text": "⚠️ ALERTA: O bot está offline! Verificar servidor." }
```

## Campos da Resposta

| Campo      | Tipo    | Descrição                               |
|------------|---------|------------------------------------------|
| `status`   | string  | `ok` ou `degraded`                       |
| `uptime`   | number  | Tempo de actividade em segundos          |
| `timestamp`| string  | Data/hora actual em ISO 8601             |
| `sessions` | number  | Número de sessões activas                |
| `services` | object  | Estado de cada serviço integrado         |
