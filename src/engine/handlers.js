// src/engine/handlers.js

function formatPrice(value) {
  // Separador de milhares com ponto (convenção angolana) — independente do SO
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function buildPriceTable(config, stock) {
  let msg = '';
  let hasAny = false;

  for (const [platformName, platformData] of Object.entries(config.products)) {
    const available = stock[platformName] || 0;
    if (available > 0) {
      hasAny = true;
      msg += `${platformData.emoji} *${platformName}:*\n`;
      for (const [planName, planData] of Object.entries(platformData.plans)) {
        msg += `• ${planName} — ${formatPrice(planData.price)} Kz (${planData.devices} dispositivo${planData.devices > 1 ? 's' : ''})\n`;
      }
      msg += '\n';
    } else {
      msg += `${platformData.emoji} ${platformName} — *Esgotado de momento* ❌\n\n`;
    }
  }

  if (!hasAny) {
    return config.systemMessages.stockZeroAll;
  }

  msg += 'Qual lhe interessa? 😊';
  return msg;
}

function buildClosingMessage(config, platform, plan) {
  const product = config.products[platform];
  const planData = product.plans[plan];
  const p = config.payment;

  return `📦 *${platform} - Plano ${plan}*\n` +
    `💰 Valor: *${formatPrice(planData.price)} ${p.currency}/mês*\n` +
    `📱 Dispositivos: ${planData.devices} em simultâneo\n\n` +
    `🏦 *Dados para pagamento:*\n` +
    `• IBAN: ${p.iban}\n` +
    `• Multicaixa Express: ${p.multicaixa}\n` +
    `• Titular: ${p.titular}\n\n` +
    `Após o pagamento, envie o comprovativo (foto ou PDF) por aqui e entregamos o seu acesso! ✅`;
}

// ═══════ HANDLERS ═══════

const handlers = {

  // Saudação dinâmica com stock. context opcional: { customerName, isReturningCustomer, lastSale: { data_expiracao } }
  greeting: (session, config, stock, context) => {
    const name = (context && context.customerName) || session.name || config.identity.fallbackName;

    if (context && context.isReturningCustomer && context.lastSale && context.lastSale.data_expiracao) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expDate = new Date(context.lastSale.data_expiracao);
      expDate.setHours(0, 0, 0, 0);
      const diasRestantes = Math.ceil((expDate - today) / (24 * 60 * 60 * 1000));

      if (diasRestantes > 7) {
        return {
          response: `Caríssimo(a) ${name}, bem-vindo(a) de volta à StreamZone. Em que posso ajudá-lo(a) hoje?`,
          nextState: 'menu',
        };
      }
      if (diasRestantes <= 7 && diasRestantes > 0) {
        return {
          response: `Caríssimo(a) ${name}, o seu acesso expira em ${diasRestantes} dia(s). Deseja renovar?`,
          nextState: 'menu',
        };
      }
      if (diasRestantes <= 0) {
        return {
          response: `Caríssimo(a) ${name}, o seu acesso expirou. Deseja renovar o seu plano?`,
          nextState: 'menu',
        };
      }
    }

    const greet = `Olá, Caríssimo(a) ${name}! 👋 ${config.identity.greeting}\n\n`;
    const table = buildPriceTable(config, stock);
    return { response: greet + table, nextState: 'menu' };
  },

  // Compra directa (ex: "quero Netflix Individual")
  direct_purchase: (session, config, stock, params) => {
    const { platform, plan } = params;
    const available = stock[platform] || 0;

    if (available <= 0) {
      // Cross-sell
      const alt = Object.keys(config.products).find(p => p !== platform);
      const altStock = alt ? (stock[alt] || 0) : 0;
      if (alt && altStock > 0) {
        const altMinPrice = Math.min(...Object.values(config.products[alt].plans).map(p => p.price));
        return {
          response: `De momento *${platform}* está esgotado. 😔\n\nMas temos *${alt}* disponível a partir de ${formatPrice(altMinPrice)} Kz/mês! Gostaria de conhecer os planos?`,
          nextState: 'menu',
        };
      }
      return { response: config.systemMessages.stockZeroAll };
    }

    // Fecho directo
    session.platform = platform;
    session.plan = plan;
    const closing = buildClosingMessage(config, platform, plan);
    return { response: `Excelente escolha! 🎉\n\n${closing}`, nextState: 'aguardando_comprovativo' };
  },

  // Quer plataforma sem plano específico
  want_platform: (session, config, stock, params) => {
    const { platform } = params;
    const available = stock[platform] || 0;

    if (available <= 0) {
      // Cross-sell
      const alt = Object.keys(config.products).find(p => p !== platform);
      const altStock = alt ? (stock[alt] || 0) : 0;
      if (alt && altStock > 0) {
        const altMinPrice = Math.min(...Object.values(config.products[alt].plans).map(p => p.price));
        return {
          response: `De momento *${platform}* está esgotado. 😔\n\nMas temos *${alt}* disponível a partir de ${formatPrice(altMinPrice)} Kz/mês! Gostaria de conhecer os planos?`,
          nextState: 'menu',
        };
      }
      return { response: config.systemMessages.stockZeroAll };
    }

    // Mostrar planos da plataforma
    session.platform = platform;
    const product = config.products[platform];
    let msg = `${product.emoji} *Planos ${platform}:*\n`;
    for (const [planName, planData] of Object.entries(product.plans)) {
      msg += `• ${planName} — ${formatPrice(planData.price)} Kz (${planData.devices} dispositivo${planData.devices > 1 ? 's' : ''})\n`;
    }
    msg += '\nQual prefere? 😊';
    return { response: msg, nextState: 'escolha_plano' };
  },

  // Selecção de plano (quando já escolheu plataforma)
  select_plan: (session, config, stock, params) => {
    const { plan } = params;
    const platform = session.platform;

    if (!platform) {
      return {
        response: 'Qual plataforma prefere — Netflix ou Prime Video? 😊',
        nextState: 'menu',
      };
    }

    const available = stock[platform] || 0;
    if (available <= 0) {
      const alt = Object.keys(config.products).find(p => p !== platform);
      return {
        response: `Infelizmente ${platform} esgotou entretanto. ${alt ? `Temos ${alt} disponível!` : ''} 😔`,
        nextState: 'menu',
      };
    }

    session.plan = plan;
    const closing = buildClosingMessage(config, platform, plan);
    return { response: `Excelente escolha! 🎉\n\n${closing}`, nextState: 'aguardando_comprovativo' };
  },

  // Mostrar preços
  show_prices: (session, config, stock, params) => {
    if (params.platform === 'all') {
      return { response: buildPriceTable(config, stock) };
    }

    const platform = params.platform;
    const available = stock[platform] || 0;

    if (available <= 0) {
      const alt = Object.keys(config.products).find(p => p !== platform);
      const altStock = alt ? (stock[alt] || 0) : 0;
      if (alt && altStock > 0) {
        const altMinPrice = Math.min(...Object.values(config.products[alt].plans).map(p => p.price));
        return {
          response: `${platform} está esgotado de momento. Mas temos *${alt}* a partir de ${formatPrice(altMinPrice)} Kz/mês! 😊`,
        };
      }
      return { response: config.systemMessages.stockZeroAll };
    }

    const product = config.products[platform];
    let msg = `${product.emoji} *Planos ${platform}:*\n`;
    for (const [planName, planData] of Object.entries(product.plans)) {
      msg += `• ${planName} — ${formatPrice(planData.price)} Kz (${planData.devices} dispositivo${planData.devices > 1 ? 's' : ''})\n`;
    }
    msg += '\nQual prefere? 😊';
    return { response: msg };
  },

  // Confirmar contexto (respondeu "sim")
  confirm_context: (session, config, stock) => {
    switch (session.state) {
      case 'menu':
        return { response: buildPriceTable(config, stock) };
      case 'escolha_plano':
        if (session.platform) {
          return handlers.select_plan(session, config, stock, { plan: 'Individual' });
        }
        return { response: 'Qual plataforma prefere — Netflix ou Prime Video? 😊' };
      case 'aguardando_comprovativo':
        return { response: config.systemMessages.alreadyWaitingProof };
      default:
        return { response: buildPriceTable(config, stock), nextState: 'menu' };
    }
  },

  // Negar contexto (respondeu "não")
  deny_context: (session, config, stock) => {
    switch (session.state) {
      case 'aguardando_comprovativo':
        return {
          response: 'Sem problema! Se mudar de ideia, estou aqui. Tenha um bom dia! 😊',
          nextState: 'menu',
        };
      default:
        return { response: 'Tudo bem! Em que posso ajudá-lo(a)? 😊' };
    }
  },

  // Verificar renovação
  check_renewal: (session, config, stock) => {
    return { response: 'Para renovar, basta escolher o plano e fazer a transferência como da primeira vez! Quer ver os planos? 😊' };
  },
};

module.exports = { handlers, buildPriceTable, buildClosingMessage };
