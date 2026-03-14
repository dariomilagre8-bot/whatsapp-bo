# Teste do cron de renovação

## Comando #renovacao

Envie `#renovacao` no WhatsApp (como supervisor) para executar imediatamente o mesmo job que o cron diário (09:00 Angola), **ignorando o horário** (22h–08h). Resposta esperada: "✅ Cron de renovação executado manualmente."

## Origem dos dados

O cron de renovação lê os dados da **Google Sheet** de stock (não do Supabase). A função `getLinhasRenovacao` usa as colunas: Plataforma, Status, Data_Expiracao, Cliente, Telefone, Plano, Valor, etc.

## Cliente de teste na Google Sheet

Para o cron encontrar alguém a notificar (lembrete "3 dias antes"):

1. Abra a planilha de stock configurada em `config.stock.sheetName`.
2. Adicione ou edite uma linha com:
   - **Status:** `indisponivel` ou `vendido`
   - **Telefone:** o seu número (ex: 244941713216)
   - **Data_Expiracao:** data dentro de **3 dias** (formato igual ao das outras linhas, ex: DD/MM/YYYY)
   - **Cliente:** nome (ex: Don Teste)
   - **Plataforma:** Netflix ou Prime
   - **Plano:** ex: Individual

Se colocar **Data_Expiracao = amanhã**, o cron envia a mensagem do tipo "expira hoje". Se colocar **daqui a 3 dias**, envia o lembrete "3 dias antes".

## Supabase (opcional)

Se o seu projeto tiver uma tabela `clientes` no Supabase com colunas de expiração (por exemplo para outro módulo), pode criar um registo de teste assim. **Adapte os nomes das colunas** ao seu schema (`SELECT column_name FROM information_schema.columns WHERE table_name = 'clientes'`).

Exemplo (schema hipotético com numero_cliente, data_expiracao):

```sql
INSERT INTO clientes (numero_cliente, nome_cliente, plataforma, plano, data_expiracao, status)
VALUES ('244941713216', 'Don Teste', 'Netflix', 'Individual', CURRENT_DATE + INTERVAL '1 day', 'ativo')
ON CONFLICT (numero_cliente) DO UPDATE SET data_expiracao = CURRENT_DATE + INTERVAL '1 day';
```

O cron de renovação **não** lê desta tabela; ele usa apenas a Google Sheet.

## Logs

Após enviar `#renovacao`, verifique os logs no servidor:

- `[RENEWAL] Cron iniciado (execução manual #renovacao)`
- `[RENEWAL] N cliente(s) a verificar (3 dias antes)` / `(expira hoje)` / etc.
- Por cliente: `Cliente 244... — expira DD/MM/YYYY — dias restantes: N`
- `[RENEWAL] ✅ Lembrete enviado para 244...` ou `⏭ 244... — sem acção necessária`

## Duplicados

O rate limit é **10 mensagens/dia** por instância. Se executar `#renovacao` duas vezes no mesmo dia para o mesmo cliente, a segunda vez não envia novo lembrete (limite diário).
