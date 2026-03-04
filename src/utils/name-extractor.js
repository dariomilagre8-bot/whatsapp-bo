// src/utils/name-extractor.js

function extractName(pushName) {
  if (!pushName || pushName.length < 2) return null;

  // Remover emojis e caracteres especiais
  let name = pushName.replace(/[^\p{L}\s]/gu, '').trim();

  // Usar primeiro nome apenas
  name = name.split(/\s+/)[0];

  if (!name || name.length < 2) return null;

  // Capitalizar
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

module.exports = { extractName };
