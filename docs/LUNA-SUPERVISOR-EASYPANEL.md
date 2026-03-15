# Luna — Alterar supervisor para 244958765478

## O que foi feito no repositório

- **palanca-ai/.env.example** — Adicionado `SUPERVISOR_NUMBER=244958765478` e `SUPERVISOR_NUMBERS=244958765478` para documentar o número correcto. Em novos deploys, usar estes valores.

## O que fazer no Easypanel (obrigatório para o bot em execução)

O bot Luna (ZapPrincipal 351934937617) lê o supervisor das **variáveis de ambiente** injectadas pelo Easypanel. Para o supervisor passar a ser **244958765478** (2º Angola Don):

1. Aceder a **Easypanel** → projecto **automacoes** → serviço **palanca-ai**.
2. Abrir o separador **Ambiente** (Environment).
3. Localizar **SUPERVISOR_NUMBER** ou **SUPERVISOR_NUMBERS** (ou equivalente).
4. Alterar de `351934937617` para **`244958765478`**.
5. Gravar e reiniciar o serviço (ou fazer redeploy).

Se não existir variável de supervisor, criar:
- **SUPERVISOR_NUMBER** = `244958765478`
- **SUPERVISOR_NUMBERS** = `244958765478`

## Verificação via SSH (opcional)

```bash
ssh root@46.224.99.52 "docker exec \$(docker ps -q --filter 'name=palanca-ai') env" | grep -i super
```

Deve mostrar `SUPERVISOR_NUMBER=244958765478` após a alteração no Easypanel.
