# Checklist Pré-28 Mar — Renovações StreamZone

> Verificar na véspera (27 Mar) e 30 min antes do disparo (07:30 Angola)

---

## Parte 1 — Verificar na VÉSPERA (27 Mar, qualquer hora)

### 1.1 Container em produção

```bash
ssh root@46.224.99.52 "docker ps --format '{{.Names}}' | grep whatssiru"
```
✅ Esperado: `jules_whatssiru.1.XXXX` aparece

```bash
ssh root@46.224.99.52 "docker exec jules_whatssiru.1.XXXX curl -s http://localhost:80/api/health | python3 -m json.tool"
```
✅ Esperado: `"status": "ok"`

---

### 1.2 RENEWAL_ENABLED está activo

```bash
ssh root@46.224.99.52 "docker exec jules_whatssiru.1.XXXX printenv RENEWAL_ENABLED"
```
✅ Esperado: `true`

---

### 1.3 Google Sheets conectado

```bash
ssh root@46.224.99.52 "docker exec jules_whatssiru.1.XXXX node scripts/test-cron-renovacao.js 2>&1"
```

**Hoje (27 Mar) ainda deve retornar 0 clientes** — isso é CORRECTO porque o cron de 3 dias
só apanha clientes que expiram em 30 Mar. Os nossos clientes expiram em 31 Mar.

**Preocupar apenas se aparecer erro de autenticação Google Sheets:**
```
Error: Could not load the default credentials
Error: PERMISSION_DENIED
```
→ Nesse caso, ver secção "Emergência" abaixo.

---

### 1.4 credentials.json presente

```bash
ssh root@46.224.99.52 "docker exec jules_whatssiru.1.XXXX ls /usr/src/app/credentials.json && echo OK"
```
✅ Esperado: `/usr/src/app/credentials.json` + `OK`

---

### 1.5 Evolution API conectada (instância Streamzone Braulio)

```bash
ssh root@46.224.99.52 "docker exec jules_whatssiru.1.XXXX printenv EVOLUTION_INSTANCE_NAME"
```
✅ Esperado: `Streamzone Braulio`

```bash
# Verificar estado da ligação WhatsApp
curl -s -H "apikey: 429683C4C977415CAAFCCE10F7D57E11" \
  "https://whatsapp-evolution-api.oxuzyt.easypanel.host/instance/connectionState/Streamzone Braulio"
```
✅ Esperado: `{"instance":{"state":"open"}}`

---

### 1.6 Planilha Google Sheets — dados corretos

Abrir: `https://docs.google.com/spreadsheets/d/1P5N1ulKdnGRfLNjEIShaGNGvD1bJuaXUcNwTn3gNyxc`

Verificar aba **Página1**:
- [ ] Todos os 21 clientes têm `Status` = `indisponivel` ou `vendido`
- [ ] Todos têm `Data_Expiracao` (coluna J) preenchida com `31/03/2026` ou `2026-03-31`
- [ ] Todos têm `Telefone` (coluna H) preenchido com formato `244XXXXXXXXX`
- [ ] Nenhuma célula de Data_Expiracao está em branco

---

## Parte 2 — Verificar NO DIA (28 Mar, 07:30 Angola)

> O cron dispara às **09:00 Angola (08:00 UTC)**. Verificar 30 min antes.

### 2.1 Container ainda em execução

```bash
ssh root@46.224.99.52 "docker ps --format '{{.Names}} {{.Status}}' | grep whatssiru"
```
✅ Esperado: `... Up X hours`

---

### 2.2 Dry-run na manhã de 28 Mar (OBRIGATÓRIO antes do cron)

```bash
ssh root@46.224.99.52 "docker exec jules_whatssiru.1.XXXX node scripts/test-cron-renovacao.js 2>&1"
```

**Agora deve retornar 21 clientes!** Exemplo de saída esperada:
```
[RENEWAL] 21 cliente(s) a verificar (3 dias antes)
[DRY RUN] Enviaria para 244XXXXXXXXX:
  "Olá [Nome]! A sua conta Netflix (Individual) expira no dia 31/03/2026..."
```

Se retornar 0 → **ACTIVAR PLANO B IMEDIATAMENTE** (ver abaixo)

---

### 2.3 Verificar logs após 09:00 Angola

```bash
ssh root@46.224.99.52 "docker logs jules_whatssiru.1.XXXX 2>&1 | grep -i RENEWAL | tail -30"
```

Esperado (após 09:00 Angola):
```
[RENEWAL] Cron iniciado
[RENEWAL] 21 cliente(s) a verificar (3 dias antes)
[RENEWAL] ✅ Lembrete enviado para 244XXXXXXXXX (1/50)
[RENEWAL] ✅ Lembrete enviado para 244XXXXXXXXX (2/50)
...
```

---

### 2.4 Confirmar com Bráulio (supervisor)

Após 09:15 Angola, Bráulio (244946014060) deve receber confirmação de execução
ou ver as mensagens enviadas no histórico do WhatsApp.

---

## Parte 3 — PLANO B (activar se cron falhar)

> Se às 09:30 Angola os clientes não receberam mensagem OU o dry-run às 07:30 deu 0 clientes.

### Opção A — Script manual remoto

```bash
# 1. SSH para o VPS
ssh root@46.224.99.52

# 2. Entrar no container
docker exec -it jules_whatssiru.1.XXXX sh

# 3. Dry-run primeiro (verificar)
node scripts/plano-b-renovacao-28mar.js --dry-run

# 4. Se tudo OK, enviar de verdade
node scripts/plano-b-renovacao-28mar.js

# 5. Sair
exit; exit
```

### Opção B — Forçar cron manualmente (via comando WhatsApp)

Bráulio envia para o número do bot (244941529470):
```
#renovacao
```

> ⚠️ Nota: O comando `#renovacao` ainda não está implementado no engine.
> Usar sempre a Opção A.

### Opção C — Mensagem manual (último recurso)

Se nem SSH nem container funcionar, o Bráulio envia manualmente para cada cliente:

```
Olá [Nome]! A sua conta [Plataforma] ([Plano]) expira no dia 31/03/2026.

Para continuar sem interrupção, basta renovar o pagamento de [Valor] Kz.

Dados de pagamento:
• Transferência — IBAN: 0040.0000.7685.3192.1018.3 (Braulio Manuel)
• Multicaixa Express: 946014060

Após o pagamento, envie o comprovativo por aqui! 🙏
```

---

## Calendário de Alertas

| Data | Hora Angola | Evento | Acção |
|------|-------------|--------|-------|
| 27 Mar | Qualquer | Véspera | Executar checklist Parte 1 |
| 28 Mar | 07:30 | Manhã | Dry-run + verificar container |
| 28 Mar | 09:00 | **CRON DISPARA** | Aguardar logs |
| 28 Mar | 09:15 | Pós-cron | Verificar logs (esperar 21 mensagens) |
| 28 Mar | 09:30 | Se falhou | Activar Plano B |
| 31 Mar | 09:00 | Cron "expira hoje" | Monitorizar novamente |
| 01 Abr | 09:00 | Cron "1 dia expirado" | Marcar a_verificar + última mensagem |
| 03 Abr | 09:00 | Cron "libertar perfis" | Clientes não renovados são libertados |

---

## Emergências

### credentials.json corrompido / expirado

```bash
# No VPS, verificar validade
docker exec jules_whatssiru.1.XXXX node -e "
const {google} = require('googleapis');
const auth = new google.auth.GoogleAuth({
  keyFile: '/usr/src/app/credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
auth.getClient().then(() => console.log('OK')).catch(e => console.error('ERRO:', e.message));
"
```

### Container caiu

```bash
# Reiniciar via Easypanel ou:
ssh root@46.224.99.52 "docker service update --force jules_whatssiru"
```

### WhatsApp desconectado

Aceder ao Easypanel → whatssiru → QR Code → reconectar conta 244941529470

---

*Checklist criado: 23 Mar 2026 | Bot: Zara (StreamZone) | Supervisor: Bráulio 244946014060*
