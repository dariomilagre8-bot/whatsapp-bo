// config/streamzone.js
// Configuração completa do negócio StreamZone Connect (Bot: Zara)

module.exports = {
  // ═══════ IDENTIDADE ═══════
  identity: {
    botName: 'Zara',
    businessName: 'StreamZone Connect',
    greeting: 'Sou a *Zara*, Assistente da StreamZone Connect.',
    tone: 'formal-angolano', // Caríssimo(a), Estimado(a)
    fallbackName: 'Estimado(a) Cliente',
    website: 'streamzone-frontend.vercel.app',
  },

  // ═══════ PRODUTOS ═══════
  products: {
    Netflix: {
      emoji: '🎬',
      plans: {
        Individual:  { price: 5000,  devices: 1, profiles: 1 },
        Partilhado:  { price: 9000,  devices: 2, profiles: 2 },
        Família:     { price: 13500, devices: 3, profiles: 3 },
      },
    },
    'Prime Video': {
      emoji: '📺',
      plans: {
        Individual:  { price: 3000,  devices: 1, profiles: 1 },
        Partilhado:  { price: 5500,  devices: 2, profiles: 2 },
        Família:     { price: 8000,  devices: 3, profiles: 3 },
      },
    },
  },

  // ═══════ PAGAMENTO ═══════
  payment: {
    methods: ['Transferência bancária', 'Multicaixa Express'],
    iban: '0040.0000.7685.3192.1018.3',
    multicaixa: '946014060',
    titular: 'Braulio Manuel',
    currency: 'Kz',
  },

  // ═══════ STOCK (Google Sheets) ═══════
  stock: {
    sheetName: 'Página1', // Nome da aba
    platformCol: 'A',     // Coluna da plataforma
    statusCol: 'F',       // Coluna do status
    availableValue: 'disponivel', // Valor que indica disponível
  },

  // ═══════ FUNIL DE ESTADOS ═══════
  states: {
    initial: 'inicio',
    transitions: {
      inicio:                  ['menu'],
      menu:                    ['escolha_plano', 'menu'],
      escolha_plano:           ['aguardando_comprovativo', 'menu', 'escolha_plano'],
      aguardando_comprovativo: ['pausado', 'aguardando_comprovativo', 'menu'],
      pausado:                 ['menu', 'pausado'],
    },
  },

  // ═══════ RESPOSTAS FIXAS (CAMADA 1) ═══════
  // Ordem IMPORTA: primeiro match ganha
  // Cada entrada: { id, patterns: [regex], response: string|function, action: string, priority: number }
  // action: 'reply' | 'reply_and_set_state' | 'dynamic' | 'escalate'
  fixedResponses: [

    // ── SAUDAÇÕES (prioridade máxima — SEMPRE reseta para inicio) ──
    {
      id: 'saudacao',
      patterns: [
        /^(ol[aá]|oi+|bom dia|boa tarde|boa noite|hey|hi|hello|e a[ií]|tudo bem|como est[aá]s?|boa)\s*[!?.]*$/i,
        /^(ol[aá]|oi+|bom dia|boa tarde|boa noite)\b/i,
      ],
      action: 'dynamic',
      handler: 'greeting', // Resolvido no engine: saudação dinâmica com stock
      nextState: 'menu',
    },

    // ── DESPEDIDA ──
    {
      id: 'despedida',
      patterns: [
        /^(obrigad[oa]|valeu|tchau|at[eé]\s*(logo|mais|breve|j[aá])|bye|adeus|xau|fui|falou)\s*[!?.]*$/i,
      ],
      response: 'De nada! 😊 Estou sempre disponível quando precisar. Tenha um excelente dia! 🌟',
      action: 'reply',
    },

    // ── QUERO COMPRAR [PLATAFORMA] [PLANO ESPECÍFICO] ──
    // Estes têm de vir ANTES dos genéricos para capturar "quero netflix individual"
    {
      id: 'compra_netflix_individual',
      patterns: [
        /\b(netflix)\b.*(individual|sozinho|s[oó]\s*(eu|pra\s*mim)|1\s*(dispositivo|perfil)|o\s*(simples|barato|de\s*1))/i,
      ],
      action: 'dynamic',
      handler: 'direct_purchase',
      params: { platform: 'Netflix', plan: 'Individual' },
    },
    {
      id: 'compra_netflix_partilhado',
      patterns: [
        /\b(netflix)\b.*(partilhado|partilha|2\s*(dispositivo|perfil|pessoa)|duo)/i,
      ],
      action: 'dynamic',
      handler: 'direct_purchase',
      params: { platform: 'Netflix', plan: 'Partilhado' },
    },
    {
      id: 'compra_netflix_familia',
      patterns: [
        /\b(netflix)\b.*(fam[ií]lia|familiar|3\s*(dispositivo|perfil|pessoa)|completo)/i,
      ],
      action: 'dynamic',
      handler: 'direct_purchase',
      params: { platform: 'Netflix', plan: 'Família' },
    },
    {
      id: 'compra_prime_individual',
      patterns: [
        /\b(prime)\b.*(individual|sozinho|s[oó]\s*(eu|pra\s*mim)|1\s*(dispositivo|perfil)|o\s*(simples|barato|de\s*1))/i,
      ],
      action: 'dynamic',
      handler: 'direct_purchase',
      params: { platform: 'Prime Video', plan: 'Individual' },
    },
    {
      id: 'compra_prime_partilhado',
      patterns: [
        /\b(prime)\b.*(partilhado|partilha|2\s*(dispositivo|perfil|pessoa)|duo)/i,
      ],
      action: 'dynamic',
      handler: 'direct_purchase',
      params: { platform: 'Prime Video', plan: 'Partilhado' },
    },
    {
      id: 'compra_prime_familia',
      patterns: [
        /\b(prime)\b.*(fam[ií]lia|familiar|3\s*(dispositivo|perfil|pessoa)|completo)/i,
      ],
      action: 'dynamic',
      handler: 'direct_purchase',
      params: { platform: 'Prime Video', plan: 'Família' },
    },

    // ── QUERO [PLATAFORMA] (sem plano específico) ──
    {
      id: 'quero_netflix',
      patterns: [
        /\b(quero|preciso|gostaria|gostava|me\s*d[aá]|manda|bora)\b.*\b(netflix)\b/i,
        /^netflix$/i,
      ],
      action: 'dynamic',
      handler: 'want_platform',
      params: { platform: 'Netflix' },
    },
    {
      id: 'quero_prime',
      patterns: [
        /\b(quero|preciso|gostaria|gostava|me\s*d[aá]|manda|bora)\b.*\b(prime)\b/i,
        /^prime(\s*video)?$/i,
      ],
      action: 'dynamic',
      handler: 'want_platform',
      params: { platform: 'Prime Video' },
    },

    // ── QUERO AMBOS ──
    {
      id: 'quero_ambos',
      patterns: [
        /\b(os\s*dois|ambos|netflix.*(e|mais).*prime|prime.*(e|mais).*netflix|tudo|os\s*2)\b/i,
      ],
      response: 'Excelente! Vamos tratar um de cada vez. Qual prefere começar — Netflix ou Prime Video? 😊',
      action: 'reply',
    },

    // ── SELECÇÃO DE PLANO (só activo quando step = escolha_plano) ──
    {
      id: 'selecao_individual',
      patterns: [
        /^(individual|1|o\s*(primeiro|de\s*1|simples|barato)|b[aá]sico)\s*[!?.]*$/i,
      ],
      action: 'dynamic',
      handler: 'select_plan',
      params: { plan: 'Individual' },
      requireState: 'escolha_plano',
    },
    {
      id: 'selecao_partilhado',
      patterns: [
        /^(partilhado|partilha|2|o\s*(segundo|do\s*meio)|m[eé]dio)\s*[!?.]*$/i,
      ],
      action: 'dynamic',
      handler: 'select_plan',
      params: { plan: 'Partilhado' },
      requireState: 'escolha_plano',
    },
    {
      id: 'selecao_familia',
      patterns: [
        /^(fam[ií]lia|familiar|3|o\s*(terceiro|maior|melhor|completo)|premium)\s*[!?.]*$/i,
      ],
      action: 'dynamic',
      handler: 'select_plan',
      params: { plan: 'Família' },
      requireState: 'escolha_plano',
    },

    // ── PREÇOS ──
    {
      id: 'precos_netflix',
      patterns: [
        /\b(netflix)\b.*(pre[çc]o|quanto|custa|valor|plano)/i,
        /\b(pre[çc]o|quanto|custa|valor)\b.*(netflix)/i,
      ],
      action: 'dynamic',
      handler: 'show_prices',
      params: { platform: 'Netflix' },
    },
    {
      id: 'precos_prime',
      patterns: [
        /\b(prime)\b.*(pre[çc]o|quanto|custa|valor|plano)/i,
        /\b(pre[çc]o|quanto|custa|valor)\b.*(prime)/i,
      ],
      action: 'dynamic',
      handler: 'show_prices',
      params: { platform: 'Prime Video' },
    },
    {
      id: 'precos_geral',
      patterns: [
        /\b(pre[çc]os?|tabela|quanto\s*custa|valores?|planos?)\b/i,
      ],
      action: 'dynamic',
      handler: 'show_prices',
      params: { platform: 'all' },
    },

    // ── COMO FUNCIONA ──
    {
      id: 'como_funciona',
      patterns: [
        /\b(como\s*(funciona|[eé]|faz)|explica|me\s*(diz|diga|explique)|o\s*que\s*[eé]|que\s*servi[çc]o)\b/i,
      ],
      response: 'É muito simples! 😊\n1. Escolhe o plano\n2. Faz a transferência\n3. Envia o comprovativo por aqui\n4. Recebe os dados de acesso!\n\nQuer ver os planos disponíveis?',
      action: 'reply',
    },

    // ── DISPOSITIVOS ──
    {
      id: 'dispositivos',
      patterns: [
        /\b(quantos\s*dispositivo|funciona\s*em|smart\s*tv|telem[oó]vel|computador|tablet|aparelho|quantos\s*(ecr[aã]|tela))\b/i,
        /\b(como\s*assim\s*\d\s*dispositivo)/i,
      ],
      response: 'Funciona em qualquer dispositivo com a app — telemóvel, Smart TV, computador ou tablet! 📱📺💻\n\n• Individual — 1 dispositivo\n• Partilhado — 2 dispositivos\n• Família — 3 dispositivos',
      action: 'reply',
    },

    // ── PAGAMENTO ──
    {
      id: 'pagamento',
      patterns: [
        /\b(como\s*(pago|pagar|fa[çc]o\s*pagamento)|multicaixa|iban|transfer[eê]ncia|dados.*(pagamento|banc)|aceita)\b/i,
      ],
      response: 'Aceitamos transferência bancária e Multicaixa Express! 🏦\n\nEscolha primeiro o plano e envio-lhe os dados completos. Qual plano lhe interessa?',
      action: 'reply',
    },

    // ── DISPONIBILIDADE FUTURA ──
    {
      id: 'disponibilidade_futura',
      patterns: [
        /\b(qu[ae]ndo|qnd|qdo|previs[aã]o|data|prazo)\b.*(ter[aá]|volta|chega|tem|haver[aá]|netflix|prime|stock|dispon)/i,
        /\b(tem|haver[aã])\s*(previs[aã]o|data|prazo)/i,
      ],
      response: 'Ainda não temos data prevista para reposição. Posso notificá-lo(a) assim que estiver disponível! 📢',
      action: 'reply',
    },

    // ── PROBLEMAS TÉCNICOS ──
    {
      id: 'senha_errada',
      patterns: [
        /\b(senha|password|pass|palavra.?passe)\b.*(errad|n[aã]o\s*(funciona|d[aá]|entra)|incorret|inv[aá]lid)/i,
      ],
      response: 'Peço desculpa pelo incómodo! 🔑 Vou verificar e enviar-lhe os dados correctos rapidamente.',
      action: 'escalate',
      escalateType: 'tecnico',
    },
    {
      id: 'conta_bloqueada',
      patterns: [
        /\b(bloquead|suspens)\b/i,
        /\b(n[aã]o)\s*(consigo|d[aá])\s*(entrar|aceder|acessar|abrir|login)\b/i,
        /\b(sem\s*acesso|conta.*(problem|erro))\b/i,
      ],
      response: 'Vou verificar a situação da sua conta imediatamente! 🔍 O responsável irá contactá-lo em breve.',
      action: 'escalate',
      escalateType: 'tecnico',
    },
    {
      id: 'perfil_nao_aparece',
      patterns: [
        /\b(perfil)\b.*(n[aã]o|sem|onde|cad[eê])/i,
        /\b(n[aã]o)\b.*(aparece|vejo|encontro)\b.*(perfil)/i,
      ],
      response: 'Pode ser um atraso na sincronização. Tente sair e entrar novamente na app. Se persistir, passo ao responsável! 📺',
      action: 'reply',
    },
    {
      id: 'codigo_verificacao',
      patterns: [
        /\b(c[oó]digo)\b.*(verifica[çc]|confirma[çc]|sms|email)/i,
        /^\d{4,8}$/,
      ],
      response: 'Isso é normal na primeira utilização! 🔐 Envie-me o código por aqui que passo ao responsável para resolver.',
      action: 'escalate',
      escalateType: 'tecnico',
    },
    {
      id: 'erro_localizacao',
      patterns: [
        /\b(erro|problema|atualizar|mudar)\b.*(localiza[çc][aã]o|household|regi[aã]o)\b/i,
        /\b(sua\s*tv\s*n[aã]o\s*faz\s*parte)\b/i,
      ],
      response: 'Isso pode acontecer com contas partilhadas. Vou passar ao responsável para resolver! 📺',
      action: 'escalate',
      escalateType: 'tecnico',
    },

    // ── RENOVAÇÃO ──
    {
      id: 'renovar',
      patterns: [
        /\b(renov|continuar|manter|prolongar|mais\s*(um|1)\s*m[eê]s|pr[oó]ximo\s*m[eê]s)\b/i,
      ],
      action: 'dynamic',
      handler: 'check_renewal',
    },

    // ── CANCELAR ──
    {
      id: 'cancelar',
      patterns: [
        /\b(cancelar|desistir|n[aã]o\s*quero\s*mais|parar\s*(o\s*servi[çc]o|tudo))\b/i,
      ],
      response: 'Lamento saber! 😔 Posso perguntar o motivo? Se houver algo que possamos melhorar, terei todo o gosto em ajudar.',
      action: 'reply',
    },

    // ── REEMBOLSO ──
    {
      id: 'reembolso',
      patterns: [
        /\b(reembolso|devolver|devolu[çc][aã]o|dinheiro.*(volta|devolver)|estorno)\b/i,
      ],
      response: 'Compreendo a sua preocupação. Após a activação do perfil, não é possível reembolso. Mas posso ajudar a resolver qualquer problema! 🤝',
      action: 'reply',
    },

    // ── CONFIANÇA ──
    {
      id: 'confianca',
      patterns: [
        /\b(confian[çc]a|seguro|segura|fi[aá]vel|golpe|scam|burla|fraude|confi[aá]vel|leg[ií]timo|verdade|pirata)\b/i,
      ],
      response: 'Compreendo perfeitamente! 🤝 A StreamZone tem clientes satisfeitos e suporte contínuo. Visite o nosso site: streamzone-frontend.vercel.app',
      action: 'reply',
    },

    // ── SITE ──
    {
      id: 'site',
      patterns: [
        /\b(site|p[aá]gina|website|link|url)\b/i,
      ],
      response: 'Visite o nosso site: streamzone-frontend.vercel.app 🌐',
      action: 'reply',
    },

    // ── FALAR COM HUMANO ──
    {
      id: 'falar_humano',
      patterns: [
        /\b(falar)\b.*(algu[eé]m|pessoa|humano|atendente|gerente|respons[aá]vel)/i,
        /\b(atendimento\s*humano|pessoa\s*real|gente\s*real)\b/i,
      ],
      response: 'Claro! Vou passar para o responsável. Será contactado(a) em breve. Obrigado(a) pela paciência! 🙏',
      action: 'escalate',
      escalateType: 'humano',
    },

    // ── DOWNLOAD/OFFLINE ──
    {
      id: 'download_offline',
      patterns: [
        /\b(descarregar|download|offline|sem\s*internet|ver\s*sem\s*net)\b/i,
      ],
      response: 'Sim! Com a app pode descarregar conteúdo para ver offline. 📥 Precisa de ligação à internet apenas para o download inicial.',
      action: 'reply',
    },

    // ── TEMPO DE ACTIVAÇÃO ──
    {
      id: 'tempo_activacao',
      patterns: [
        /\b(quanto\s*tempo|quando\s*recebo|demora|r[aá]pido|activar)\b/i,
      ],
      response: 'A activação é feita assim que confirmarmos o pagamento. Normalmente em poucos minutos! ⚡',
      action: 'reply',
    },

    // ── DÓLARES ──
    {
      id: 'dolares',
      patterns: [
        /\b(d[oó]lar|usd|\$|euro|eur)\b/i,
      ],
      response: 'De momento aceitamos apenas pagamento em Kwanzas (Kz). 🇦🇴',
      action: 'reply',
    },

    // ── SIM GENÉRICO (context-aware) ──
    {
      id: 'sim',
      patterns: [
        /^(sim|s|yeah|yes|claro|com\s*certeza|pode\s*ser|bora|vamos|ok|okay|certo|isso|exacto|exato)\s*[!?.]*$/i,
      ],
      action: 'dynamic',
      handler: 'confirm_context',
    },

    // ── NÃO GENÉRICO (context-aware) ──
    {
      id: 'nao',
      patterns: [
        /^(n[aã]o|nop|nope|n|nah|agora\s*n[aã]o|depois|mais\s*tarde)\s*[!?.]*$/i,
      ],
      action: 'dynamic',
      handler: 'deny_context',
    },
  ],

  // ═══════ ANTI-ALUCINAÇÃO ═══════
  validation: {
    // Preços oficiais (únicos valores permitidos em respostas com "Kz")
    officialPrices: [3000, 5500, 8000, 5000, 9000, 13500],

    // Bloqueios (regex que NUNCA podem aparecer numa resposta)
    blocks: [
      { pattern: /[\w.-]+@(gmail|hotmail|outlook|yahoo)\.(com|co|net)/gi, reason: 'email_vazado' },
      { pattern: /\b(senha|password|pass)\s*[:=]\s*\S+/gi, reason: 'senha_vazada' },
      { pattern: /\b(evolution|easypanel|supabase|gemini|webhook|api.?key|node\.?js|docker|n8n|redis)\b/gi, reason: 'termo_interno' },
      { pattern: /#(humano|pausar|retomar|status|clientes)/gi, reason: 'comando_interno' },
      { pattern: /(pagamento|transfer[eê]ncia).{0,20}(confirmad|recebid|aprovad|validad)/gi, reason: 'confirmou_pagamento' },
      { pattern: /(confirmamos|recebemos|aprovamos).{0,20}(pagamento|transfer)/gi, reason: 'confirmou_pagamento' },
      { pattern: /\b(sou\s*(um\s*|uma\s*)?(bot|robô|ia|inteligência artificial|programa|modelo|llm))\b/gi, reason: 'admitiu_bot' },
    ],

    maxLength: 500,

    fallbacks: {
      email_vazado: 'Em que posso ajudá-lo(a)? 😊',
      senha_vazada: 'Em que posso ajudá-lo(a)? 😊',
      termo_interno: 'Em que posso ajudá-lo(a)? 😊',
      comando_interno: 'Em que posso ajudá-lo(a)? 😊',
      confirmou_pagamento: 'O responsável irá verificar o pagamento e confirmar em breve. Obrigado(a) pela paciência! 🙏',
      admitiu_bot: 'Sou a Zara, assistente da StreamZone Connect! Em que posso ajudar? 😊',
      preco_inventado: 'Vou confirmar os valores correctos. Um momento!',
      muito_longo: 'Em que posso ajudá-lo(a)? 😊',
    },
  },

  // ═══════ COMANDOS DO SUPERVISOR ═══════
  supervisorCommands: {
    '#retomar': 'unpause',
    '#pausar': 'pause',
    '#status': 'status',
    '#reset': 'reset_session',
  },

  // ═══════ MENSAGENS DO SISTEMA ═══════
  systemMessages: {
    imageInPaymentStep: 'Recebi o seu comprovativo! ✅ Vou encaminhar ao responsável para validação. Assim que for confirmado, envio-lhe os dados de acesso. Obrigado(a) pela paciência! 🙏',
    imageOutOfContext: 'Recebi a sua imagem! 📷 Pode descrever-me por texto o que precisa? Se for um comprovativo de pagamento, diga-me que encaminho ao responsável.',
    audioReceived: 'Recebi o seu áudio! Para melhor atendimento, pode escrever-me por texto o que precisa? 🎤',
    botUnpaused: 'O responsável já tratou do assunto. Obrigado(a) pela paciência! 😊 Em que mais posso ajudar?',
    alreadyWaitingProof: 'Estou a aguardar o seu comprovativo de pagamento. Após a transferência, envie a foto ou PDF por aqui! 📎',
    unknownInput: 'Não compreendi. Pode reformular? Estou aqui para ajudar com os nossos planos de streaming! 😊',
    stockZeroAll: 'De momento não temos planos disponíveis. Posso notificá-lo(a) quando voltarem ao stock! 📢',
  },
};
