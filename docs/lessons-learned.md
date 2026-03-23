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

## BUG-046 — Perda de env vars após docker rebuild

**Data:** anterior
**Fix:** `npm run backup` antes de qualquer deploy; ver `scripts/backup-env.sh`
