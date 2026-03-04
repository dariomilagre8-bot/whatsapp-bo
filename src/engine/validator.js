// src/engine/validator.js

function validate(response, config) {
  const { officialPrices, blocks, maxLength, fallbacks } = config.validation;

  // 1. Verificar bloqueios
  for (const block of blocks) {
    // Reset lastIndex
    if (block.pattern.global) block.pattern.lastIndex = 0;
    if (block.pattern.test(response)) {
      if (block.pattern.global) block.pattern.lastIndex = 0;
      console.log(`[VALIDATOR] BLOCKED: ${block.reason}`);
      return { valid: false, reason: block.reason, replacement: fallbacks[block.reason] || fallbacks.termo_interno };
    }
  }

  // 2. Verificar preços inventados
  const priceMatches = response.match(/(\d[\d.,]*)\s*kz/gi);
  if (priceMatches) {
    for (const m of priceMatches) {
      const value = parseInt(m.replace(/[^\d]/g, ''));
      if (value > 0 && !officialPrices.includes(value)) {
        console.log(`[VALIDATOR] BLOCKED: invented price ${value}`);
        return { valid: false, reason: 'preco_inventado', replacement: fallbacks.preco_inventado };
      }
    }
  }

  // 3. Verificar tamanho
  if (response.length > maxLength) {
    console.log(`[VALIDATOR] BLOCKED: too long (${response.length} chars)`);
    return { valid: false, reason: 'muito_longo', replacement: fallbacks.muito_longo };
  }

  return { valid: true };
}

module.exports = { validate };
