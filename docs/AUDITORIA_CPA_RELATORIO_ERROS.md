# Relatório de Erros e Auditoria – Projeto WhatsApp Bot (CPA)

**Objetivo:** Permitir que o Claude (ou outro revisor) analise os erros reportados, faça auditoria do projeto e proponha melhorias/correções (coaching técnico).

---

## 1. Erros reportados / observados

### 1.1 Stock Netflix a zero (crítico, persistente)

- **Sintoma:** O bot responde que o stock do plano "Netflix Partilha" (e qualquer plano Netflix) "esgotou", mesmo com a planilha a mostrar várias linhas Netflix com status "disponivel".
- **Evidência em runtime:**
  - `[STOCK EM TEMPO REAL]` no prompt: `Netflix Individual: 0 | Netflix Partilha: 0 | ... | Prime Individual: 4 | Prime Partilha: 2 | ...`
  - `[INVENTÁRIO ATUAL]`: apenas "Prime Video - Individual (3000 Kz): 4 perfis" (nenhuma linha Netflix listada).
- **Canal:** WhatsApp / Instagram (mesmo backend).
- **Comportamento:** Prime Video vende normalmente; Netflix nunca mostra stock.

### 1.2 Falsos negativos por dependência da coluna M (Plano)

- **Problema inicial:** A contagem de stock dependia da coluna M (Plano) e de `isRowIndividualPlan()`. Valores como "Individua" (truncado) ou células vazias geravam falsos negativos.
- **Correção aplicada:** Remoção da dependência da coluna Plano para contagem; contagem apenas por Plataforma (A) e Status (F). Persistência do Netflix a zero indica que a causa principal é outra (ex.: leitura da plataforma ou estrutura da folha).

### 1.3 Range da API Google Sheets

- **Problema:** Uso de `!A:N` ou `!A:K` podia deixar colunas M/N fora do range e causar `undefined` ou leituras incorretas.
- **Correção aplicada:** Todas as chamadas `values.get` passaram a usar `!A:Z`.

### 1.4 Erros de digitação / Unicode na planilha

- **Problemas:** "Individua" em vez de "Individual"; possível uso de ligadura Unicode "ﬂ" em "Netflix" (Netﬂix).
- **Correções aplicadas:** `normalizePlatformForMatch` (ligadura U+FB02 → "fl"), `isRowIndividualPlan` com radical "individu", depois remoção do filtro por Plano; deteção de Netflix alargada com `isNetflixPlatform()` (netflix, netfix, net+flix).

### 1.5 Bug na lógica "primeira linha = dados" (corrigido)

- **Problema:** A primeira linha era considerada "dados" se `firstCell` contivesse `'prime'`. O cabeçalho "Plataforma" contém "prime", pelo que a linha de cabeçalho era tratada como dados.
- **Correção aplicada:** Só se considera primeira linha como dados se NÃO parecer cabeçalho: `looksLikeHeader = /plataforma|email|senha|status|plano|nome|telefone|valor/.test(firstCell)` e `firstRowIsData = !looksLikeHeader && (isNetflixPlatform(firstCell) || firstCell.includes('prime'))`.

---

## 2. Ficheiros relevantes para auditoria

| Ficheiro | Função |
|----------|--------|
| `src/integrations/google-sheets.js` | Leitura da planilha, contagem de stock (`getStockCountsForPrompt`), `hasStockForPendingSale`, `allocateProfile`, `getStock`, `getInventoryForPrompt`. Normalização (normalizeText, normalizePlatformForMatch, isNetflixPlatform, platformFromCell). |
| `src/routes/webhook.js` | Pipeline de mensagens, chamada a `getStockCountsForPrompt`, construção do prompt, comandos #sim/#nao, interceptor de supervisor. |
| `src/engine/llm.js` | `buildDynamicPrompt`: injeta `[STOCK EM TEMPO REAL]` com os valores de `stockCountsResult.counts`. Regras de bloqueio (não enviar pagamento se stock 0). |
| `config/streamzone.js` | `stock.sheetName` (ex.: `'Página1'`), configuração de pagamento, comandos de supervisor. |
| `config/bot_settings.json` | Nome do bot, tabela de preços, `metadata_tag` (#RESUMO_VENDA). |

---

## 3. Fluxo de dados do stock (resumo)

1. **Webhook** recebe mensagem → chama `getStockCountsForPrompt(config.stock)`.
2. **getStockCountsForPrompt** faz `sheets.spreadsheets.values.get` com `range: ${sheetName}!A:Z`, percorre as linhas (a partir de `startIndex`), para cada linha:
   - Lê plataforma de `row[0]` ou `row[1]` (fallback).
   - Lê status de `row[5]`.
   - Considera "disponivel" só se `status === 'disponivel'`.
   - Conta Netflix com `isNetflixPlatform(plataforma)` e Prime com `plataforma.includes('prime')`.
3. Calcula Partilha/Família/Família Completa com `Math.floor(total/2)`, `/4`, `/5`.
4. **llm.js** recebe `stockCountsResult` e interpola no prompt em `[STOCK EM TEMPO REAL]`.
5. Se Netflix vier a 0, o LLM segue a regra de bloqueio e diz que o stock esgotou.

---

## 4. Hipóteses ainda por validar (para o revisor)

1. **Nome/estrutura da folha em produção:** O `GOOGLE_SHEETS_ID` ou o nome da aba (`sheetName`) em produção podem apontar para uma folha ou aba onde as linhas Netflix estão noutro formato (ex.: plataforma noutra coluna, ou primeira linha não ser cabeçalho).
2. **Conteúdo real da coluna A (ou B):** Nas linhas que o utilizador considera "Netflix", o valor em A (ou B) pode não conter a substring "netflix" após normalização (ex.: sigla, nome diferente, ou caractere especial não tratado).
3. **Status nas linhas Netflix:** Pode haver variação ("Disponível", "0 disponivel", etc.) que não coincide com a comparação estrita `=== 'disponivel'`.
4. **Bug firstRowIsData:** Como referido em 1.5, "Plataforma" contém "prime" e pode fazer a primeira linha (cabeçalho) ser tratada como dados.

---

## 5. O que o revisor deve fazer (checklist de auditoria)

- [x] Revisar `getStockCountsForPrompt`: correção aplicada (cabeçalho excluído via `looksLikeHeader`). Revisor pode validar e alargar regex se necessário.
- [ ] Confirmar que a leitura da plataforma (A vs B, normalização, `isNetflixPlatform`) está alinhada com a estrutura real da planilha em produção (e documentar essa estrutura num comentário ou doc).
- [ ] Verificar consistência entre `getStockCountsForPrompt`, `getInventoryForPrompt`, `getStock`, `hasStockForPendingSale` e `allocateProfile` (mesma lógica de plataforma/status e mesma decisão de cabeçalho, se aplicável).
- [ ] Propor regras de normalização de status mais resilientes (se necessário) sem considerar "0 disponivel" como disponível.
- [ ] Sugerir um teste automatizado ou script que, com um mock da resposta da API (rows com Netflix e Prime), verifique que os totais Netflix e Prime são > 0 quando esperado.
- [ ] Recomendar remoção ou condicional do `console.warn` de amostra em produção (ou envio para um sistema de logs), após a causa do Netflix a zero estar resolvida.

---

## 6. Trechos de código críticos (referência)

- **Definição de primeira linha como dados:**  
  `src/integrations/google-sheets.js` (aprox. linhas 201–204):  
  `firstCell`, `firstRowIsData = isNetflixPlatform(firstCell) || firstCell.includes('prime')`, `startIndex`.
- **Contagem por plataforma e status:**  
  Mesmo ficheiro, loop `for (let i = startIndex; i < rows.length; i++)` e uso de `platformRaw`, `plataforma`, `status`, `isNetflixPlatform(plataforma)`, `plataforma.includes('prime')`.
- **Injeção do stock no prompt:**  
  `src/engine/llm.js`: variável `stockCountsText` construída a partir de `counts.*` e interpolada em `[STOCK EM TEMPO REAL]`.

---

*Documento gerado para auditoria e coaching do projeto. Última atualização: contexto da conversa sobre stock Netflix a zero e correções aplicadas.*
