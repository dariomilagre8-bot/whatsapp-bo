# KNOWN ISSUES — Palanca AI Bot Engine

## Bugs Corrigidos

### [2026-03-11] — 6 bugs persistentes: allocateProfile rows, Premium, #sim, #leads, pós-venda, testes [CPA]
- **Problema 1 — allocateProfile duplicava rows com Plano/Valor vazios:** Partilha preenchia 2 rows mas colunas M (Plano) e N (Valor) não eram escritas. **Solução:** Função `getPlanLabelAndValue()`; escrita em F:N (Status até Valor); Partilha = 2 rows cada com Plano=Partilha, Valor=4500; Familia_Completa = 1 row com QNTD=5, Plano=Familia_Completa, Valor=13500 (outras 4 rows só status=indisponivel).
- **Problema 2 — Plano "Premium" inexistente no prompt:** Bot oferecia plano Premium. **Solução:** Prompt StreamZone com lista explícita: Netflix Individual (5000), Partilha (4500), Família Completa (13500), Prime Individual (3000); regra anti-alucinação e resposta fixa se cliente pedir "Premium".
- **Problema 3 — #sim não respondia (supervisor pendurado):** **Solução:** Logs explícitos [#sim] no handler; fallback para encontrar sessão por número normalizado; mensagens claras ao supervisor (sem pendingSale, erro alocação); confirmação "✅ Venda aprovada para [CLIENTE]" e envio de credenciais ao cliente.
- **Problema 4 — #leads "Erro ao consultar CRM":** **Solução:** Mensagem amigável "⚠️ CRM não configurado. Execute docs/crm-schema.sql no Supabase SQL Editor (Dashboard → SQL Editor...)".
- **Problema 5 — Bot continuava conversa após venda concluída:** **Solução:** Após #sim + credenciais enviadas: limpar pendingSale, definir existingCustomerGreeted=true; próxima mensagem do cliente tratada como cliente existente ("Já tem [PLATAFORMA] activo até...").
- **Problema 6 — Lista de testes incompleta:** **Solução:** Cenários manuais M–V adicionados ao tests/qa-checklist.js (Partilha 2 rows, Família QNTD=5, #sim/#nao, pós-venda, Premium, renovações, 3 meses, dois clientes).
- **Ficheiros:** `src/integrations/google-sheets.js`, `prompts/streamzone.txt`, `src/routes/webhook.js`, `tests/qa-checklist.js`, `docs/KNOWN_ISSUES.md`

---

### [2026-03-10] — QA 10 bugs: telefone, loop cliente, renovação, comprovativo, waitlist, QNTD, meses, pausar, CRM, rate limit
- **Bug 1 — Número de telefone corrompido:** JID (ex.: @lid) gerava número errado na planilha e notificações. **Solução:** Função `extractPhoneNumber(jid)` em `src/utils/phone.js` (extrai antes do @, valida 12 dígitos Angola 244, regex 244\d{9}); uso em webhook (senderNum), allocateProfile (Telefone), notificações, CRM, waitlist, #pausar/#retomar target. Log do rawJid para debug.
- **Bug 9 — Loop no detector de cliente existente:** Cliente existente recebia sempre a mesma mensagem ("Vi que já tem Netflix activa...") em todas as mensagens. **Solução:** Interceptor só na primeira mensagem da sessão (`!session.existingCustomerGreeted` e sem histórico); keywords (cancelar, renovar, reclamação, ajuda) não disparam mensagem genérica — passam aos handlers ou LLM; contexto do cliente existente injetado no prompt LLM (`existingCustomerContext`).
- **Bug 5 — Renovação não completa:** "Sim" após "Quer renovar?" não avançava para pagamento. **Solução:** Estado `renovacaoAguardandoConfirmacao`; ao responder "Sim" envio de dados de pagamento, `pendingSale` tipo renovação, notificação supervisor "🔄 RENOVAÇÃO"; #sim para renovação chama `renovarClientePorTelefone` (actualiza Data_Venda/Data_Expiracao) em vez de alocar nova linha.
- **Bug 10 — Comprovativo confundido com reclamação:** Imagem tratada como screenshot de erro e exigência de PDF. **Solução:** Imagem com `pendingSale` = comprovativo (mensagem de validação, notificação supervisor); imagem sem pendingSale = resposta neutra + "Imagem recebida sem contexto de pagamento"; documentos aceitam imagem (jpg/png) e PDF; removida exigência "apenas PDF".
- **Bug 2 — Waitlist não criava registo:** **Solução:** Logs "[Waitlist] Tentando criar registo...", "Criado com sucesso: id=X" ou "ERRO"; uso de `extractPhoneNumber` no número; reforço no system prompt da tag #WAITLIST; try/catch em #waitlist com mensagem "Execute o schema SQL".
- **Bug 3 — Coluna QNTD não preenchida:** **Solução:** Em `allocateProfile`, escrita na coluna K (COLS.qntd=10) com valor `required` (1/2/4/5 conforme plano).
- **Bug 4 — Pagamento antecipado duplicava rows:** **Solução:** Renovação via #sim usa `renovarClientePorTelefone` (1 actualização por perfil existente); alocação nova mantém `required` por tipo de plano (meses só alteram Data_Expiracao).
- **Bug 6 — #pausar não funcionava:** **Solução:** Comando #pausar implementado (pause + setState pausado); target normalizado com `extractPhoneNumber(parts[1])`.
- **Bug 7 — #leads e #waitlist falhavam:** **Solução:** try/catch nos comandos; em erro responder "Execute o schema SQL" (docs/crm-schema.sql, docs/stock-waitlist-schema.sql).
- **Bug 8 — Spam sem rate limit:** **Solução:** Rate limit 2 respostas por 30 segundos por número; em excesso ignorar silenciosamente; mensagem só emoji → resposta curta "Olá! Em que posso ajudá-lo(a)?" sem LLM.
- **Ficheiros:** `src/utils/phone.js` (novo), `src/routes/webhook.js`, `src/integrations/google-sheets.js`, `src/engine/llm.js`, `src/stock/waitlist.js`, `src/integrations/supabase.js`, `src/crm/leads.js`

---

### [2026-02-25] — Anti-alucinação: respostas fixas + anti-loop + prompt blindado
- **Sintoma:** A IA inventava preços, confirmava pagamentos ou revelava termos internos; loops de qualificação/boas-vindas.
- **Causa:** Prompt e pipeline sem barreiras contra alucinação; respostas dinâmicas sem validação; falta de respostas fixas prioritárias.
- **Solução:** Sistema completo anti-alucinação com respostas hardcoded prioritárias, image handler dedicado, interceptor central, prompt compacto com temperatura 0.3, validação de resposta expandida, truncagem 300 tokens; regras de bloqueio no config (officialPrices, blocks, fallbacks).
- **Ficheiros:** `src/config.js`, `src/handlers/imagens.js`, `src/routes/webhook.js` (estrutura Luna); depois `config/streamzone.js`, `src/engine/llm.js`, `src/engine/validator.js`

---

### [2026-03-05] — Supabase não-bloqueante: bot responde mesmo sem DB
- **Sintoma:** Se o Supabase estiver em baixo ou indisponível, o bot deixava de responder ao cliente.
- **Causa:** Chamadas ao Supabase (ex.: `getClientByPhone`) sem try/catch ou fallback; falha propagava e bloqueava o pipeline LLM.
- **Solução:** Consultas ao Supabase envolvidas em try/catch; em caso de erro retorna `customerName: null`, `isReturningCustomer: false`, `lastSale: null` e o pipeline continua; log de erro sem derrubar a resposta.
- **Ficheiros:** `src/routes/webhook.js`, `src/integrations/supabase.js`

---

### [2026-03-05] — Health check imediato + graceful shutdown SIGTERM
- **Sintoma:** No Easypanel, o contentor não recebia SIGTERM correctamente e o health check não reflectia o estado real; deploy/restart problemáticos.
- **Causa:** Arranque com `npm start` (processo principal era npm, não node); SIGTERM ia para npm e não para o processo Node.
- **Solução:** Dockerfile com `CMD ["node", "index.js"]` para processo principal ser o Node; documentação no DEPLOY.md para usar "Start Command" = `node index.js` no Easypanel.
- **Ficheiros:** `Dockerfile`, `index.js`, `DEPLOY.md`

---

### [2026-03-04] — Remover sendTyping + modelo gemini-1.5-flash
- **Sintoma:** Uso de sendTyping ou chamadas que causavam latência/erros; modelo "gemini-3" inexistente causava falhas na API.
- **Causa:** Código com sendTyping (Evolution/WhatsApp); tentativa de usar modelo gemini-3 que não existe na API.
- **Solução:** Remoção de sendTyping do fluxo; reversão do modelo para `gemini-1.5-flash-latest` (e depois migração para família 2.5-flash); actualização de modelos para família 2.5-flash onde aplicável.
- **Ficheiros:** `src/engine/llm.js`, `src/routes/webhook.js`, `src/engine/sender.js` (se existisse sendTyping)

---

### [2026-03-03] — Remover cliente WhatsApp local: apenas Evolution API e webhook
- **Sintoma:** Confusão entre cliente WhatsApp local e Evolution API; webhook montado em `/` ou instância única.
- **Causa:** Arquitectura antiga com cliente WhatsApp local; webhook na raiz e suporte a uma só instância.
- **Solução:** Remoção do cliente WhatsApp local; toda a comunicação via Evolution API; webhook montado em `/webhook`; suporte a múltiplas instâncias Evolution no webhook.
- **Ficheiros:** `index.js`, `src/routes/webhook.js`, remoção de módulos de cliente local (ex.: `whatsapp.js` antigo)

---

### [2026-03-03] — config.waha → config.evolution, endpoints Evolution API
- **Sintoma:** Erros ao enviar mensagens ou verificar estado; referências a "waha" ou endpoints incorrectos.
- **Causa:** Configuração e código ainda com nomes/URLs da stack "WAHA"; endpoints diferentes dos da Evolution API.
- **Solução:** Renomear/actualizar config para Evolution API (apiUrl, apiKey, instance); usar endpoints Evolution (`/message/sendText/:instance`, `/instance/connectionState/:instance`); evolução para `evolutionConfig` no webhook e no sender.
- **Ficheiros:** `config/streamzone.js` (ou antigo `src/config.js`), `index.js`, `src/integrations/evolution.js`, `src/engine/sender.js`, `src/routes/webhook.js`

---

### [2026-02-21 / 2026-03-04] — Substituir PostgreSQL local por Supabase
- **Sintoma:** Dependência de PostgreSQL local; dificuldade em deploy e escalar; duplicação de dados.
- **Causa:** Schema e lógica de clientes/vendas em PostgreSQL local.
- **Solução:** Migração para Supabase; schema em Supabase (clientes, vendas); uso de `@supabase/supabase-js`; variáveis SUPABASE_URL e SUPABASE_KEY; dashboard e leituras passam a usar Supabase.
- **Ficheiros:** `src/integrations/supabase.js`, `index.js`, remoção de conexão PostgreSQL local; migração de dados e referências em rotas/admin

---

### [2026-03-06] — Número alerta boss PA → 244941713216
- **Sintoma:** Alertas e comandos de supervisor a irem para número errado ou não definido.
- **Causa:** Número do supervisor/boss hardcoded ou incorrecto (ex.: número antigo).
- **Solução:** Definir número oficial do supervisor (244941713216) em `.env.example` e config; blindagem de autorização com normalização de dígitos; SUPERVISOR_NUMBER/SUPERVISOR_NUMBERS como fonte.
- **Ficheiros:** `.env.example`, `config/streamzone.js`, `src/routes/webhook.js`

---

### [2026-02-21] — Dockerfile Node 20, remove next build
- **Sintoma:** Build do Docker falhava ou usava Node desactualizado; build de frontend Next no mesmo contentor.
- **Causa:** Dockerfile com Node 18 ou anterior; etapas de build Next.js no Dockerfile do bot.
- **Solução:** Atualizar para Node 20 (`node:20-alpine`); remover etapas de build Next do Dockerfile do engine; EXPOSE 80 (app na porta 80).
- **Ficheiros:** `Dockerfile`, `package.json` (engine)

---

### [2026-03-04 / deploy] — Prompts no Dockerfile + paths de deploy
- **Sintoma:** Em deploy, ficheiros `prompts/` não encontrados ou app a correr com paths incorrectos.
- **Causa:** `COPY . .` ou `.dockerignore` a excluir `prompts/`; ou Start Command a correr a partir de directório errado.
- **Solução:** Garantir que `prompts/` é copiado no build (não ignorar em `.dockerignore`); documentar paths no DEPLOY (ex.: DEPLOY-PATHS.md ou secção em DEPLOY.md); Easypanel Start Command = `node index.js` a partir do working dir correcto.
- **Ficheiros:** `Dockerfile`, `.dockerignore`, `docs/DEPLOY.md`

---

### [2026-03-07] — Rota reconnect Cannot GET
- **Sintoma:** Aceder a `/reconnect/:instanceId` devolvia "Cannot GET /reconnect/...".
- **Causa:** Rota reconnect não registada com `app.get` ou registada após middleware que bloqueava GET.
- **Solução:** Registar explicitamente `app.get('/reconnect/:instanceId', reconnectHandler)` no `index.js`.
- **Ficheiros:** `index.js`, `src/routes/reconnect.js`

---

### [2026-03-07] — replyJid na sessão para #sim/#nao enviar ao cliente
- **Sintoma:** Ao usar #sim ou #nao, a mensagem de aprovação/rejeição não chegava ao cliente (ou ia para número errado).
- **Causa:** Envio usava apenas o número de telefone; com @lid (WhatsApp LID) o JID correcto é necessário para entregar; senderNum normalizado sem @s.whatsapp.net no sender.
- **Solução:** Guardar `replyJid` na sessão ao processar mensagens; usar `session.replyJid` ou `targetReplyJid` no envio de #sim/#nao; usar JID com `@s.whatsapp.net` no sender; normalizar senderNum para lidar com @lid e @s.whatsapp.net; isSupervisor com suporte a múltiplos números.
- **Ficheiros:** `src/engine/state-machine.js`, `src/routes/webhook.js`, `src/engine/sender.js`, `config/streamzone.js`

---

### [2026-03-06] — Validação PDF e extracção de metadados
- **Sintoma:** Comprovativos não-PDF aceites ou rejeitados incorrectamente; metadados do plano incorrectos.
- **Causa:** Validação de tipo de ficheiro insuficiente (só nome ou só mimetype); extracção de plano/plataforma frágil.
- **Solução:** Validação restrita: aceitar apenas ficheiros com extensão .pdf ou mimetype application/pdf; mensagem clara a pedir reenvio em PDF; extracção de metadados alinhada com a sessão (pendingSale, etc.).
- **Ficheiros:** `src/routes/webhook.js`, `src/engine/llm.js`

---

### [2026-03-06] — Alucinação de preços e transbordo humano
- **Sintoma:** Zara dizia preços errados ou inventados; transbordo para humano inconsistente.
- **Causa:** Prompt sem tabela de preços blindada; sem instrução clara para nunca confirmar pagamento e para escalar.
- **Solução:** Tabela de preços no prompt (buildPricingTableFromSettings); regras "NUNCA confirmar pagamentos"; transbordo com mensagem fixa e pausa de sessão; qualificação e tom formal.
- **Ficheiros:** `src/engine/llm.js`

---

### [2026-03-06] — Mapeamento colunas G, H, I na planilha
- **Sintoma:** Escrita na planilha Google (ex.: alocação de perfil) em colunas erradas ou corrupção de dados.
- **Causa:** Índices ou letras de colunas (G, H, I) mapeados incorrectamente para email, senha, estado.
- **Solução:** Corrigir mapeamento de colunas G, H e I para escrita segura (email, senha, status); alinhar índices da planilha com a lógica de alocação; instrução #sim no alerta ao supervisor.
- **Ficheiros:** `src/integrations/google-sheets.js`, `config/streamzone.js` (se aplicável)

---

### [2026-03-04] — Nome da env var do Supabase e Node
- **Sintoma:** Supabase não inicializava em produção; "supabase key not found".
- **Causa:** Nome da variável diferente entre código e .env (ex.: SUPABASE_SERVICE_KEY vs SUPABASE_KEY); Node antigo.
- **Solução:** Corrigir referência para SUPABASE_KEY ou SUPABASE_SERVICE_KEY conforme documentação; fallbacks no código (SUPABASE_KEY || SUPABASE_SERVICE_KEY); actualizar Node no Dockerfile.
- **Ficheiros:** `index.js`, `Dockerfile`, `src/integrations/supabase.js`

---

### [2026-03-04] — Dockerfile apagado na migração
- **Sintoma:** Build no Easypanel falhava; "Dockerfile not found".
- **Causa:** Dockerfile removido ou não incluído numa migração/refactor.
- **Solução:** Restaurar Dockerfile com Node 20, WORKDIR, COPY, EXPOSE 80, CMD node index.js.
- **Ficheiros:** `Dockerfile`, `.dockerignore`

---

### [2026-03-04] — Respostas cortadas (maxOutputTokens)
- **Sintoma:** Respostas da IA cortadas a meio (ex.: dados de pagamento ou confirmação incompletos).
- **Causa:** maxOutputTokens baixo na chamada ao Gemini.
- **Solução:** Aumentar maxOutputTokens (ex.: 1024) em generationConfig no LLM.
- **Ficheiros:** `src/engine/llm.js`

---

### [2026-03-04] — Normalização de acentos no status da planilha
- **Sintoma:** Stock considerado indisponível mesmo quando na planilha estava "disponível" (ou variante com acento).
- **Causa:** Comparação estrita com string "disponivel" sem normalização de acentos (disponível vs disponivel).
- **Solução:** Normalizar status ao ler (NFD, remover acentos) para comparar com valor canónico (ex.: disponivel).
- **Ficheiros:** `src/integrations/google-sheets.js`, config de stock

---

### [2026-03-06] — Ligaduras Unicode invisíveis na leitura de plataforma
- **Sintoma:** Planos/plataformas não reconhecidos (ex.: "Netﬂix" com ligadura em vez de "Netflix").
- **Causa:** Caracteres Unicode especiais (ligaduras) no nome da plataforma na planilha.
- **Solução:** Normalizar texto ao ler plataforma (remover ligaduras, NFD, etc.) para comparação consistente.
- **Ficheiros:** `src/integrations/google-sheets.js` (ou módulo de leitura de stock)

---

### [2026-03-06] — Falsos negativos de stock (coluna plano)
- **Sintoma:** Stock disponível mas o bot dizia "esgotado" ou não mostrava plano.
- **Causa:** Lógica de stock dependente da coluna "plano" que podia estar vazia ou com valor inesperado.
- **Solução:** Remover dependência da coluna plano para contagem de stock; usar apenas colunas de status/plataforma necessárias para erradicar falsos negativos.
- **Ficheiros:** `src/integrations/google-sheets.js`, config de stock

---

### [2026-03-05] — Comando reset ignorava estado de pausa
- **Sintoma:** #reset não despausava a sessão; cliente continuava sem resposta.
- **Causa:** Comando #reset apenas mudava estado da máquina de estados mas não alterava `session.paused`.
- **Solução:** No handler de #reset, definir `paused = false` e state para 'menu'; aplicar a cliente específico ou a todas as sessões.
- **Ficheiros:** `src/routes/webhook.js`, `config/streamzone.js` (supervisorCommands)

---

### [2026-03-05] — Regra de PDF e falsa disponibilidade de outros serviços
- **Sintoma:** Bot aceitava comprovativos que não eram PDF; mencionava serviços (ex.: Spotify) não disponíveis.
- **Causa:** Validação de tipo de ficheiro fraca; catálogo ou prompt a listar serviços não oferecidos.
- **Solução:** Forçar regra de aceitar apenas PDF para comprovativo; remover referências a outros serviços no funil e no prompt (ex.: Spotify).
- **Ficheiros:** `src/routes/webhook.js`, `config/streamzone.js`, prompts

---

## Bugs Conhecidos (Não Resolvidos)
- **SUPABASE_SERVICE_ROLE_KEY não configurada no Easypanel** — usa SUPABASE_KEY (ou SUPABASE_SERVICE_KEY) como fallback; para operações que exijam service role, configurar SUPABASE_SERVICE_ROLE_KEY no painel.
- **NODE_ENV=development em produção** — em alguns ambientes permanece development; deveria ser `production` para optimizações e menos logs de debug.

---

## Template para Novos Bugs
### [DATA] — [Título]
- **Sintoma:**
- **Causa:**
- **Solução:**
- **Ficheiros:**
