# Lessons Learned — Palanca Bot Engine

Registo de bugs não-óbvios e as suas soluções, para evitar regressões futuras.

---

## BUG-067 — `\b` regex incompatível com caracteres acentuados PT

**Data:** 2026-03-23
**Ficheiro:** `src/engine/intentDetector.js`
**Impacto:** Detecção de saudação falhava para "Olá", "olá", "Olá!" → retornava `INTENT_DESCONHECIDO`

### Causa Raiz

Em JavaScript, `\b` (word boundary) considera apenas `[a-zA-Z0-9_]` como word characters.

Caracteres acentuados do Português (á, ã, é, ê, í, ó, ô, õ, ú, ç) são **non-word** para o engine de regex do V8. Isto significa:

```js
/^(ol[aá])\b/i.test('Olá')  // FALSE ← bug
/^(ol[aá])\b/i.test('Ola')  // TRUE  ← funciona (termina em ASCII)
```

O `\b` após `á` falha porque:
- `á` é non-word (não está em `[a-zA-Z0-9_]`)
- Para `\b` fazer match no fim de string após `á`, precisaria de uma transição word→non-word
- Como `á` é non-word, não há essa transição → `\b` falha

### Fix

Implementar `normalizePattern(str)` que substitui `\b` por lookahead/lookbehind que inclui **Latin Extended U+00C0–U+024F**:

```js
function normalizePattern(str) {
  const UW = '[\\w\\u00C0-\\u024F]';
  return str
    .replace(/\\b(?=[\w\[(])/g, `(?<!${UW})`)  // \b início: não precedido de letra/acento
    .replace(/\\b/g, `(?!${UW})`);              // \b fim: não seguido de letra/acento
}

// Uso:
saudacao: new RegExp(
  normalizePattern('^(ol[aá]|ola|oi+|bom dia|boa tarde|boa noite|hey|hi|hello)\\b'),
  'i'
),
```

### Regra Geral

> **Nunca usar `\b` em patterns que possam conter ou estar adjacentes a chars acentuados PT.**
> Usar sempre `normalizePattern()` exportado de `src/engine/intentDetector.js`.

### Testes Adicionados

`tests/engine/intent-saudacao.test.js` — 14 testes cobrindo:
- "Olá", "olá", "Olá!" → `INTENT_SAUDACAO`
- False positives: "Olátimo", "bom diazinho" → não SAUDACAO
- "Já paguei", "Não funciona" → intents corrects (sem `\b`)

---

## BUG-071 — CRM repetia lead tracking em cada mensagem da mesma sessão

**Data:** 2026-03-24
**Ficheiro:** `src/routes/webhook.js`
**Impacto:** `upsertLead` e `getClientByPhone` eram chamados em CADA mensagem → logs repetidos `[CRM] XXXX → cliente: NOVO | retornante: false`; chamadas desnecessárias à BD

### Causa Raiz

O bloco CRM no webhook não verificava se a sessão já tinha processado o contacto. Cada mensagem recalculava tudo do zero.

### Fix

No início do webhook (após `resolveNumber` / `senderNum`), numa única passagem por sessão:

- `session.crmProcessed` — `upsertLead` só na 1ª mensagem.
- `session.crmCache` — `checkClienteExistente` (Sheets) + `getClientByPhone` (Supabase) + `pa_clients` / `classifyClient`, com campos `sheetsClienteExistente` e `clientType`. O pipeline LLM só lê o cache.

O log `pa_conversations.customer_name` usa `crmCache.customerName` ou `pushName` normalizado quando disponível.

### Regra Geral

> **Estado de sessão (CRM, prompt, intent) deve ser persistido na sessão em memória e reutilizado, não recalculado em cada mensagem.**

---

## BUG-072 — Números LID sem código país não faziam match com Google Sheet

**Data:** 2026-03-24
**Ficheiro:** `src/utils/phone.js`, `src/crm/leads.js`
**Impacto:** `checkClienteExistente` devolvia `existente: false` para clientes reais quando o número vinha como LID angolano (`0XXXXXXXXX`)

### Causa Raiz

`extractPhoneNumber` não tratava números com 10 dígitos a começar por `0` (formato LID angolano). Retornava string vazia, tornando o match impossível.

### Fix (actualizado 2026-03-24)

- **09XXXXXXXX** (nacional Angola com zero) → `244` + 9 dígitos.
- **08… / outros 10 dígitos com 0** — tratados como possível LID interno: **não** prefixar `244` automaticamente; preferir resolução via Evolution API (`resolveNumber` / `findContacts`).

```javascript
// Só 09… → Angola; 08… mantém-se como identificador
if (digits.length === 10 && digits.startsWith('09')) {
  return '244' + digits.slice(1);
}

// Portugal: 351 + 9 dígitos = 12 dígitos
if (digits.length === 12 && digits.startsWith('351')) {
  return digits;
}
```

Log de debug adicionado em `checkClienteExistente` quando há normalização:
```javascript
console.log(`[CRM] Normalização: raw="${numero}" → normalized="${normalized}"`);
```

### Regra Geral

> **Normalizar telefones antes de comparar, mas não assumir que todo o número com 10 dígitos e zero inicial é Angola — LID interno pode colidir. Usar `normalizePhone` / `resolveNumber` conforme a origem do JID.**

---

## BUG-074 — "Tem plano de 3 ecrãs?" classificado como suporte_conta (falso positivo)

**Data:** 2026-03-24  
**Ficheiro:** `src/engine/intentDetector.js`  
**Impacto:** Clientes em funil de compra eram escalados ao supervisor como suporte técnico.

### Causa Raiz

Regex de `suporte_conta` incluía tokens ambíguos (`plano`, `meu plano`, etc.) que também aparecem em perguntas de venda.

### Fix

- **Camada 1:** `SUPORTE_HARD_PATTERNS` — só frases inequívocas de suporte (conta bloqueada, expirou, código de verificação, etc.).
- **Camada 2:** `VENDA_OVERRIDE_PATTERNS` — perguntas de catálogo/preço; se **ambos** fazem match → preferir **VENDA** (não escalar).
- **Excepção:** `isStreamingCatalogPacoteQuestion` — frases tipo "Têm pacotes do Disney plus?" **não** entram em override de venda → `INTENT_DESCONHECIDO` para o LLM responder.
- Regra: **na dúvida entre venda e suporte, preferir venda** — o LLM clarifica; escalação só com alta confiança.

### Testes

- `tests/test-intent-detection-v2.js` — casos positivos/negativos.
- `tests/test-intent-regression.js` — bugs reais de produção; **cada novo bug de intent deve acrescentar um caso aqui antes do fix.**

### Regras Gerais (BUG-074 + operação)

1. Na dúvida venda vs suporte → **VENDA** (nunca escalar).
2. Cada regressão de intent em produção → entrada em `test-intent-regression.js` **antes** de corrigir (TDD de regressão).
3. `npm test` corre antes de `npm start` (`prestart`).
4. LID não é garantidamente telefone — resolver via Evolution `findContacts` quando possível; não assumir `08…` como Angola (`normalizePhone` / `extractPhoneNumber`: só `09…` → `244`).
5. Alertas **INFRA** (watchdog: `[PA INFO]` / `[PA ALERTA]`, health, inactividade) → **só** `BOSS_NUMBER` / `ALERT_PHONE` (Don). **Nunca** `SUPERVISOR_NUMBERS` (supervisor do negócio do cliente). Escalação de **cliente** continua só para o supervisor da instância.

---

## BUG-075 — Watchdog enviava alertas técnicos para o supervisor do cliente

**Data:** 2026-03-26  
**Ficheiros:** `engine/lib/watchdog.js`, `index.js`, `engine/lib/infraRecipients.js`  
**Impacto:** Mensagens `ℹ️ [PA INFO] Bot … sem mensagens há …` e `⚠️ [PA ALERTA]` chegavam ao número em `SUPERVISOR_NUMBERS` (ex.: Bráulio — cliente StreamZone), não só ao Don.

### Causa Raiz

O `Watchdog` unia `infraRecipients` com `supervisors` (derivados de `config.supervisors` / `SUPERVISOR_NUMBERS`). Os supervisores são para **escalação de conversas de clientes**, não para monitorização interna.

### Fix

- Destinatários de `alert()` = **apenas** `infraRecipients`, resolvidos por `getInfraAlertRecipientsFromEnv()`: `BOSS_NUMBER` (CSV) → fallback `ALERT_PHONE` → `244941713216`.
- Tokens com mais de 12 dígitos (LID colado por engano no `.env`) são **ignorados**.

### Regra Geral

> **SUPERVISOR_NUMBERS** = negócio do cliente. **BOSS_NUMBER** = operação Palanca / alertas técnicos.

---

## BUG-073 — Intent detection recalculava prompt variant em cada mensagem

**Data:** 2026-03-24
**Ficheiro:** `src/routes/webhook.js`
**Impacto:** Persona do bot alternava inconsistentemente: Msg 1 (saudação → prompt normal), Msg 2 (desconhecido → `[REGRA CRÍTICA]`), Msg 3 (venda → volta ao normal)

### Causa Raiz

O `promptVariant` era determinado em cada mensagem com base no `intent` actual, sem considerar o que tinha sido definido nas mensagens anteriores da mesma sessão.

### Fix (actualizado 2026-03-24)

`session.promptVariant` inicia em `default` na primeira atribuição. **Apenas** `suporte_conta` (detecção de alta confiança, BUG-074) força `critical_rules`. `INTENT_DESCONHECIDO` já **não** activa `critical_rules` por defeito — o LLM responde com prompt normal.

```javascript
if (!session.promptVariant) session.promptVariant = 'default';
if (intent === INTENTS.SUPORTE_CONTA) session.promptVariant = 'critical_rules';
```

### Regra Geral

> **Manter o variant estável na sessão. Só escalação `suporte_conta` muda para regras críticas; intenção desconhecida não deve alternar o prompt entre mensagens.**

---

## BUG-046 — Perda de env vars após docker rebuild

**Data:** anterior
**Fix:** `npm run backup` antes de qualquer deploy; ver `scripts/backup-env.sh`
