// services/watchtower/extract.js
// TODO: puxa transcrições últimas 24h do Supabase, agrupa por clientSlug

module.exports = async function extract(clientSlug) {
  return { messages: [], date: new Date().toISOString().slice(0, 10) };
};
