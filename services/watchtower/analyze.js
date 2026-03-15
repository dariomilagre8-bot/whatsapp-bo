// services/watchtower/analyze.js
// TODO: fase 1 = queries SQL simples, fase 2 = LLM Map-Reduce (sentimento, motivo perda)

module.exports = async function analyze(extracted) {
  return {
    messages_total: 0,
    sentiment_positive: 0,
    sentiment_negative: 0,
    sentiment_neutral: 0,
    loss_reasons: [],
  };
};
