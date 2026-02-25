// buildServiceMenuMsg — stock real para menu de serviço
const { hasAnyStock } = require('../../googleSheets');
const { CATALOGO, formatPriceTable, planChoicesText } = require('../config');

async function buildServiceMenuMsg(state, clientName) {
  const nome = clientName ? `, ${clientName}` : '';
  const netflixOk = await hasAnyStock('Netflix');
  const primeOk   = await hasAnyStock('Prime Video');
  if (netflixOk && primeOk) {
    return { msg: `Sem problemas${nome}! O que gostarias de escolher?\n\n🎬 *Netflix*\n📺 *Prime Video*`, step: 'escolha_servico' };
  }
  if (netflixOk) {
    if (state) { state.serviceKey = 'netflix'; state.plataforma = 'Netflix'; }
    return { msg: `Sem problemas${nome}! Temos *Netflix* disponível:\n\n${formatPriceTable('netflix')}\n\nQual plano preferes? (${planChoicesText('netflix')})`, step: 'escolha_plano' };
  }
  if (primeOk) {
    if (state) { state.serviceKey = 'prime_video'; state.plataforma = 'Prime Video'; }
    return { msg: `Sem problemas${nome}! Temos *Prime Video* disponível:\n\n${formatPriceTable('prime_video')}\n\nQual plano preferes? (${planChoicesText('prime_video')})`, step: 'escolha_plano' };
  }
  return { msg: `Lamentamos${nome}! De momento não temos stock disponível. Vamos notificar-te assim que houver disponibilidade. 😔`, step: 'escolha_servico' };
}

module.exports = { buildServiceMenuMsg };
