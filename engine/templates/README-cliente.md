# Novo cliente — Palanca Bot Engine

1. Execute `node engine/scripts/novo-cliente.js` ou use o script interactivo (bash).
2. Edite `clients/<slug>/config.js` com identidade, preços, estados e respostas fixas.
3. Opcional: `prompts.js` e `validators.js` para overrides.
4. Execute `npm test` e depois `npm run deploy`.

Regras: remetente = `data.key.remoteJid`; nunca use LID em supervisors; bot nunca revela comandos `#` ao cliente.
