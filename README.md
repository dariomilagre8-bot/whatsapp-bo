# WhatsApp Bot — Deploy

[![PA QA Pipeline](https://github.com/dariomilagre8-bot/whatsapp-bo/actions/workflows/qa.yml/badge.svg)](https://github.com/dariomilagre8-bot/whatsapp-bo/actions/workflows/qa.yml)

## Deploy sem Easypanel

O Easypanel está crashado devido a incompatibilidade com `Docker 29.x` (ver GitHub issue `#109`). Para contornar, o deploy é feito via `GitHub Actions` (SSH) e também existe um deploy manual por script.

### Secrets / variáveis

No GitHub (Settings → Secrets and variables → Actions), configure:

- `HOST` (ex.: `46.224.99.52`)
- `USERNAME` (ex.: `root`)
- `SSH_KEY` (conteudo da chave privada que dá acesso via SSH)

Para uso manual no servidor via script, as variáveis acima também podem ser usadas como variáveis de ambiente no seu terminal local.

### Deploy manual

Exemplo (bash / Git Bash):

```bash
export HOST="46.224.99.52"
export USERNAME="root"
export SSH_KEY="$(cat ~/.ssh/id_rsa)"

./scripts/deploy-manual.sh whatssiru
./scripts/deploy-manual.sh demo-moda
```

Ou para os dois serviços:

```bash
./scripts/deploy-all.sh
```

### Health check

O script/Workflow valida saúde (HTTP `200`) nas URLs:

- `https://jules-whatssiru.oxuzyt.easypanel.host/health`
- `https://jules-demo-moda.oxuzyt.easypanel.host/health`

