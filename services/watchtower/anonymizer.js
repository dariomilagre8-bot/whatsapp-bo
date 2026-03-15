// services/watchtower/anonymizer.js
// TODO: mascara PII (telefones, nomes) com regex antes de enviar ao LLM

module.exports = function anonymize(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\b244\d{9}\b/g, '244*********')
    .replace(/\b\d{9,12}\b/g, '***');
};
