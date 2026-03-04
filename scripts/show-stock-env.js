/**
 * Mostra no terminal as variáveis de env e contagens de stock (para debug da IA a ler zero).
 * Uso: node scripts/show-stock-env.js
 */
require('dotenv').config();

console.log('--- .env (stock/sheet) ---');
console.log('GOOGLE_SHEET_ID:', process.env.GOOGLE_SHEET_ID ? process.env.GOOGLE_SHEET_ID.substring(0, 12) + '...' : '(vazio ou ausente)');
console.log('SHEET_NAME:', process.env.SHEET_NAME || '(usa default Página1)');

const gs = require('../googleSheets');

(async () => {
  try {
    const nf1 = await gs.countAvailableProfiles('netflix').catch(e => ({ erro: e.message }));
    const nfFull = await gs.countAvailableProfiles('Netflix', 'full_account').catch(e => ({ erro: e.message }));
    const nfShared = await gs.countAvailableProfiles('Netflix', 'shared_profile').catch(e => ({ erro: e.message }));
    const pv1 = await gs.countAvailableProfiles('prime_video').catch(e => ({ erro: e.message }));
    const pvFull = await gs.countAvailableProfiles('Prime Video', 'full_account').catch(e => ({ erro: e.message }));
    const pvShared = await gs.countAvailableProfiles('Prime Video', 'shared_profile').catch(e => ({ erro: e.message }));

    console.log('--- Contagens (googleSheets.countAvailableProfiles) ---');
    console.log('countAvailableProfiles("netflix") [1 arg, usado no webhook]:', nf1);
    console.log('countAvailableProfiles("Netflix", "full_account"):', nfFull);
    console.log('countAvailableProfiles("Netflix", "shared_profile"):', nfShared);
    console.log('countAvailableProfiles("prime_video") [1 arg, usado no webhook]:', pv1);
    console.log('countAvailableProfiles("Prime Video", "full_account"):', pvFull);
    console.log('countAvailableProfiles("Prime Video", "shared_profile"):', pvShared);

    const n = typeof nf1 === 'number' ? nf1 : 0;
    const p = typeof pv1 === 'number' ? pv1 : 0;
    const stockInfoStr = `Netflix: ${n} perfis disponíveis | Prime Video: ${p} perfis disponíveis`;
    console.log('--- String que a IA recebe (STOCK_PLACEHOLDER) ---');
    console.log(stockInfoStr);
  } catch (e) {
    console.error('Erro:', e.message);
  }
})();
