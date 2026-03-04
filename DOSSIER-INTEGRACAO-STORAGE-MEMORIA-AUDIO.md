# Dossier: Integração Storage, Memória Persistente e Áudio [CPA]

**Stack:** Node.js (CommonJS), Express, Evolution API v2.3.0, Supabase, SDK Gemini (@google/generative-ai).  
**Ficheiro principal:** `src/routes/webhook.js`.

---

## 1. Novos Módulos Criados

### 1.1 Gestão de Ficheiros (Comprovativos) — `src/services/storage.js`

- **Função:** Interceptar imagens/documentos do webhook da Evolution API, fazer upload para o bucket **comprovativos** no Supabase Storage e devolver URL pública.
- **Exportações:**
  - `uploadComprovativo(dadosImagem, nomeOriginal, mimeType)` — upload directo (base64 ou Buffer).
  - `processarComprativo(mensagem)` — pipeline completo: extrai imagem do payload → upload → `{ url, path }`.
  - `extrairImagemEvolution(mensagem)` — parser do payload `imageMessage`/documento da Evolution API.
- **Bucket Supabase:** `comprovativos`; path dos ficheiros: `pagamentos/{timestamp}_{random}.{ext}`.

### 1.2 Memória Persistente — `src/agent/memoria-db.js`

- **Função:** Substituir o histórico em memória (Map/chatHistories) por persistência na tabela **historico_sessoes** do Supabase, evitando “amnésia” do bot após reinício do contentor.
- **Exportações:**
  - `obterSessao(telefone)` — devolve `{ contexto, ultimaPlataforma }` ou `null` (TTL 24h).
  - `guardarSessao(telefone, contexto, ultimaPlataforma)` — upsert na tabela.
  - `deletarSessao(telefone)` — apaga sessão.
  - `adicionarMensagem(telefone, novaMensagem, ultimaPlataforma, maxMensagens)` — adiciona mensagem ao histórico e persiste (limite padrão 40 mensagens).
- **Tabela Supabase:** `historico_sessoes` — colunas esperadas: `telefone` (PK), `contexto` (jsonb), `ultima_plataforma`, `atualizado_em`.

### 1.3 Transcrição de Áudio — `src/services/audio.js`

- **Função:** Receber áudio OGG/Opus (base64 ou buffer) da Evolution API, enviar ao **gemini-2.5-flash** e devolver apenas o texto transcrito.
- **Exportações:**
  - `transcreverAudio(dadosAudio, mimeType)` — transcrição via Gemini `inlineData`.
  - `processarAudio(mensagem)` — pipeline: extrai áudio do webhook (`audioMessage`/`pttMessage`) → transcrição → texto.
  - `extrairAudioEvolution(mensagem)` — parser do payload de áudio.
- **Credenciais:** `GEMINI_API_KEY` no `.env`. Sem ffmpeg, Whisper ou dependências externas pesadas.

---

## 2. Integração no Webhook (`src/routes/webhook.js`)

### 2.1 Importações

- Removido: `memoria-local` (Map em memória).
- Adicionado: `obterSessao`, `adicionarMensagem` de `../agent/memoria-db`; `processarComprativo` de `../services/storage`; `processarAudio` de `../services/audio`.

### 2.2 Memória persistente

- **Carregar sessão:** No início do processamento da mensagem, `chatHistory` e `ultimaPlataforma` passam a vir de `await obterSessao(senderNum)` (Supabase).
- **Guardar mensagens:** Após cada troca user/model com a IA (escolha_servico, aguardando_comprovativo, escolha_plano), é chamado `await adicionarMensagem(telefone, mensagem, ultimaPlataforma)` para persistir no Supabase.
- **Memórias leves (sem Map persistente):** Pausa global/por número, saudação já enviada (24h) e contador de reembolso continuam em objectos locais `_mem` no webhook (pausar/retomar/saudação/reembolso), para não depender de Redis/DB em cada mensagem.

### 2.3 Pipeline de áudio

- Imediatamente após extrair `textMessage`, se a mensagem for `audioMessage` ou `pttMessage`:
  - `textoAudio = await processarAudio(messageData)`.
  - `textMessage` é substituído pelo texto transcrito; o resto do fluxo trata como mensagem escrita (respostas fixas, IA, etc.).

### 2.4 Pipeline de anexos (imagens/documentos)

- **Upload:** Sempre que há imagem ou documento, `const { url } = await processarComprativo(messageData)` (upload para Supabase).
- **Triagem (Compra vs Suporte):**
  - **Fluxo compra:** se `state.step === 'aguardando_comprovativo'` OU carrinho com itens OU legenda contém "pago"/"comprovativo"/"transfer" → resposta `RESPOSTA_COMPROVATIVO_RECEBIDO` + notificação ao supervisor com pedido e URL do comprovativo.
  - **Fluxo suporte:** caso contrário → mensagem de “print recebido, encaminhado para equipa técnica” + notificação ao supervisor como *TICKET DE SUPORTE (Print/Anexo)* com URL e legenda.
- Em ambos os casos o bot é pausado (`_pausar(senderNum)`).

### 2.5 Legendas (captions)

- A variável `textMessage` foi alargada para incluir legendas de imagens e documentos:
  - `messageData.message?.imageMessage?.caption`
  - `messageData.message?.documentMessage?.caption`
- Assim, a triagem comprovativo vs. print de suporte e as notificações ao supervisor usam também o texto da legenda quando o cliente envia imagem/documento com caption.

---

## 3. Regras preservadas

- **Cliente lookup:** Supabase/Sheets (cliente antigo, vendas, stock) mantido.
- **Saudação inteligente:** Formal por nome, renovação quando `diasRestantes <= 7` ou expirado; TTL 24h para não repetir saudação.
- **Validadores anti-alucinação:** `validarRespostaZara` e respostas fixas mantidos.
- **Comandos do supervisor:** `#pausar`, `#retomar`, `#status`, `#stock`, `#cliente`, `#ajuda` (agora usando `_mem` e `pausedClients`).

---

## 4. Commits realizados

| Mensagem | Descrição |
|----------|-----------|
| `feat: modulos storage, memoria e audio gemini [CPA]` | Criação dos 3 módulos e primeiro commit. |
| `fix: triagem inteligente entre comprovativos e prints de erro [CPA]` | Triagem compra vs. suporte no pipeline de anexos. |
| `fix: captura de legendas em imagens e documentos para triagem [CPA]` | Inclusão de `imageMessage.caption` e `documentMessage.caption` em `textMessage`. |

---

## 5. Ficheiros alterados/criados

| Ficheiro | Acção |
|----------|--------|
| `src/services/storage.js` | Criado |
| `src/agent/memoria-db.js` | Criado |
| `src/services/audio.js` | Criado |
| `src/routes/webhook.js` | Integração dos 3 módulos, triagem anexos, legendas, memória persistente |

---

*Dossier gerado para referência do projecto CPA (Cursor/Claude).*
