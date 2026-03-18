# Webhook Evolution API — Redes Docker (Easypanel)

## Problema

A Evolution API envia webhooks para o bot (whatssiru) quando chegam mensagens WhatsApp. Se os dois serviços estão em **projectos Easypanel diferentes** (ex.: evolution-api em "whatsapp", whatssiru em "jules"), estão em redes Docker overlay distintas e **não se resolvem por nome** (ex.: `jules_whatssiru` não resolve a partir do container da evolution-api).

Sintoma: health check OK, servidor a correr, mas **as mensagens não chegam ao bot**.

## Solução rápida (VPS)

1. **Copiar e executar o script no VPS** (com SSH e chave configurados):

   ```bash
   # No teu PC (com chave SSH):
   scp scripts/fix-webhook-evolution.sh don@46.224.99.52:/tmp/
   ssh don@46.224.99.52 'bash /tmp/fix-webhook-evolution.sh'
   ```

   O script:
   - Mostra em que redes está cada container (evolution-api vs whatssiru).
   - Se estiverem em redes diferentes, tenta ligar a Evolution API à rede do whatssiru (container ou serviço Swarm).
   - Testa, a partir do container da evolution-api, qual URL atinge o `/health` do whatssiru (`jules_whatssiru`, IP interno, gateway, etc.).
   - Actualiza o webhook na Evolution API para esse URL (ex.: `http://jules_whatssiru:80/webhook`).
   - Indica como testar (enviar mensagem e ver logs).

2. **Variáveis (opcional)** — no VPS podes passar:

   ```bash
   EVOLUTION_API_URL="https://whatsapp-evolution-api.oxuzyt.easypanel.host" \
   EVOLUTION_API_KEY="..." \
   bash /tmp/fix-webhook-evolution.sh
   ```

3. **Testar** — enviar mensagem para o número da instância (ex.: 244941529470) e ver logs:

   ```bash
   docker service logs jules_whatssiru --tail 50 -f
   # ou
   docker logs $(docker ps -q -f name=whatssiru) --tail 50 -f
   ```

## Opção manual (Easypanel)

- No Easypanel: no projeto da **Evolution API** ("whatsapp"), adicionar a **rede** do projeto "jules" (onde corre o whatssiru), para que o serviço evolution-api tenha interface nessa rede e consiga resolver `jules_whatssiru`.
- Ou criar uma rede externa partilhada e anexar ambos os serviços a essa rede.

## URL do webhook

- **Dentro da mesma rede Docker:** usar `http://jules_whatssiru:80/webhook` (ou o nome do serviço que resolver).
- **nip.io:** `https://whatssiru.46.224.99.52.nip.io/webhook` **não** é fiável de dentro do Docker (resolução DNS pode falhar).
- O URL tem de ser acessível **a partir do container da Evolution API** (é a Evolution que faz o POST para o bot).

## Registar webhook a partir do repo (Node)

Depois de ter o URL que funciona no VPS, podes guardá-lo no `.env` e usar o script Node:

```bash
# .env
EVOLUTION_API_URL=https://whatsapp-evolution-api.oxuzyt.easypanel.host
EVOLUTION_API_KEY=...
WEBHOOK_URL=http://jules_whatssiru:80/webhook   # o que funcionou no VPS
```

```bash
node scripts/registar-webhook.js
```

(O `registar-webhook.js` usa `WEBHOOK_URL` do `.env` se existir.)
