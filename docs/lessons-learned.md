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

Flag `session.crmProcessed` e `session.crmCache` na sessão em memória:

```javascript
// Apenas na 1ª mensagem da sessão
if (!session.crmProcessed) {
  await upsertLead(sbClient, senderNum, ...);
  session.crmProcessed = true;
} else {
  console.log(`[CRM] ${senderNum} → sessão activa, skip lead tracking`);
}

// Cache do resultado Supabase
if (!session.crmCache) {
  const result = await getClientByPhone(senderNum);
  session.crmCache = result;
} else {
  // Usar cache — sem chamada à BD
}
```

### Regra Geral

> **Estado de sessão (CRM, prompt, intent) deve ser persistido na sessão em memória e reutilizado, não recalculado em cada mensagem.**

---

## BUG-072 — Números LID sem código país não faziam match com Google Sheet

**Data:** 2026-03-24
**Ficheiro:** `src/utils/phone.js`, `src/crm/leads.js`
**Impacto:** `checkClienteExistente` devolvia `existente: false` para clientes reais quando o número vinha como LID angolano (`0XXXXXXXXX`)

### Causa Raiz

`extractPhoneNumber` não tratava números com 10 dígitos a começar por `0` (formato LID angolano). Retornava string vazia, tornando o match impossível.

### Fix

Adicionados dois novos casos em `extractPhoneNumber`:

```javascript
// LID angolano: 10 dígitos a começar por 0 → 244 + últimos 9
if (digits.length === 10 && digits.startsWith('0')) {
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

> **Normalizar SEMPRE os telefones antes de comparar. Nunca assumir formato consistente entre fontes (Evolution API, Google Sheets, Supabase).**

---

## BUG-073 — Intent detection recalculava prompt variant em cada mensagem

**Data:** 2026-03-24
**Ficheiro:** `src/routes/webhook.js`
**Impacto:** Persona do bot alternava inconsistentemente: Msg 1 (saudação → prompt normal), Msg 2 (desconhecido → `[REGRA CRÍTICA]`), Msg 3 (venda → volta ao normal)

### Causa Raiz

O `promptVariant` era determinado em cada mensagem com base no `intent` actual, sem considerar o que tinha sido definido nas mensagens anteriores da mesma sessão.

### Fix

`session.promptVariant` persistido na sessão em memória. Determinado apenas na 1ª mensagem. Excepção: `suporte_conta` força sempre `critical_rules` (escalação prioritária):

```javascript
if (intent === INTENTS.SUPORTE_CONTA && session.promptVariant !== 'critical_rules') {
  session.promptVariant = 'critical_rules'; // excepção: escalação
} else if (!session.promptVariant) {
  // Definir apenas na 1ª mensagem
  session.promptVariant = (intent === INTENTS.DESCONHECIDO) ? 'critical_rules' : 'default';
}
// Usar session.promptVariant (não intent actual) para construir o prompt
```

### Regra Geral

> **O variant do prompt deve ser definido uma vez na sessão e mantido. Só deve mudar por escalação explícita (suporte_conta), nunca por mudança de intent entre mensagens normais.**

---

## BUG-046 — Perda de env vars após docker rebuild

**Data:** anterior
**Fix:** `npm run backup` antes de qualquer deploy; ver `scripts/backup-env.sh`
