module.exports = {
  nome: process.env.BRAND_NOME || 'StreamZone',
  slogan: process.env.BRAND_SLOGAN || 'Streaming Premium em Angola',
  emoji: process.env.BRAND_EMOJI || '🎬',
  corPrincipal: process.env.BRAND_COR || '#E50914',
  whatsappSuporte: process.env.BRAND_WHATSAPP || '244941522947',
  website: process.env.BRAND_WEBSITE || 'https://streamzone-frontend.vercel.app',
  precos: {
    netflix: {
      individual: parseInt(process.env.PRECO_NETFLIX_INDIVIDUAL) || 5000,
      partilha: parseInt(process.env.PRECO_NETFLIX_PARTILHA) || 9000,
      familia: parseInt(process.env.PRECO_NETFLIX_FAMILIA) || 13500,
      familia_completa: parseInt(process.env.PRECO_NETFLIX_FAMILIA_COMPLETA) || 25000,
    },
    prime: {
      individual: parseInt(process.env.PRECO_PRIME_INDIVIDUAL) || 3000,
      partilha: parseInt(process.env.PRECO_PRIME_PARTILHA) || 5500,
      familia: parseInt(process.env.PRECO_PRIME_FAMILIA) || 8000,
    }
  }
};
