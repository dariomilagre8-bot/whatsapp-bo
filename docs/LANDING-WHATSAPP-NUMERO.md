# Landing page — Número WhatsApp 244958765478

A landing **https://palanca-ai.vercel.app/** está num repositório/ficheiros separados (não neste repo whatsapp-bot).

## Alteração necessária

Substituir **todos** os links WhatsApp de **244941713216** (pessoal Don) para **244958765478** (2º Angola Don, para bots/demos/landing):

- `wa.me/244941713216` → `wa.me/244958765478`
- `api.whatsapp.com/send?phone=244941713216` → `...phone=244958765478`
- Qualquer referência a `941713216` ou `244941713216` em HTML/JS/JSx do projeto da landing

Depois: **git add, commit, push** no repo da landing; o Vercel faz deploy automático.

## Onde procurar no repo da landing

```bash
grep -r "244941713216" . --include="*.html" --include="*.js" --include="*.jsx"
grep -r "941713216" . --include="*.html"
grep -r "wa.me" .
```
