'use strict';

const { supabase } = require('../../supabase');

const TABELA = 'historico_sessoes';
// TTL de 24h em segundos
const TTL_SEGUNDOS = 24 * 60 * 60;

/**
 * Recupera sessão do Supabase. Retorna null se não existir ou expirada.
 * @param {string} telefone
 * @returns {Promise<{contexto: any, ultimaPlataforma: string|null}|null>}
 */
async function obterSessao(telefone) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from(TABELA)
      .select('contexto, ultima_plataforma, atualizado_em')
      .eq('telefone', telefone)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    // Verificar TTL
    const agora = Date.now();
    const atualizadoEm = new Date(data.atualizado_em).getTime();
    if (agora - atualizadoEm > TTL_SEGUNDOS * 1000) {
      await deletarSessao(telefone);
      return null;
    }

    return {
      contexto: data.contexto ?? [],
      ultimaPlataforma: data.ultima_plataforma ?? null,
    };
  } catch (err) {
    console.error('[memoria-db] Erro ao obter sessão:', err.message);
    return null;
  }
}

/**
 * Guarda ou actualiza sessão no Supabase (upsert).
 * @param {string} telefone
 * @param {any} contexto - histórico da conversa (array de mensagens)
 * @param {string|null} ultimaPlataforma
 * @returns {Promise<void>}
 */
async function guardarSessao(telefone, contexto, ultimaPlataforma = null) {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from(TABELA)
      .upsert(
        {
          telefone,
          contexto,
          ultima_plataforma: ultimaPlataforma,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'telefone' }
      );

    if (error) throw error;
  } catch (err) {
    console.error('[memoria-db] Erro ao guardar sessão:', err.message);
  }
}

/**
 * Apaga sessão do Supabase.
 * @param {string} telefone
 * @returns {Promise<void>}
 */
async function deletarSessao(telefone) {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from(TABELA)
      .delete()
      .eq('telefone', telefone);

    if (error) throw error;
  } catch (err) {
    console.error('[memoria-db] Erro ao deletar sessão:', err.message);
  }
}

/**
 * Adiciona mensagem ao contexto existente e persiste.
 * @param {string} telefone
 * @param {{role: string, parts: any[]}} novaMensagem
 * @param {string|null} ultimaPlataforma
 * @param {number} maxMensagens - limite do histórico (evita crescimento infinito)
 * @returns {Promise<any[]>} contexto actualizado
 */
async function adicionarMensagem(telefone, novaMensagem, ultimaPlataforma = null, maxMensagens = 40) {
  const sessao = await obterSessao(telefone);
  const contextoActual = sessao?.contexto ?? [];
  const plataforma = ultimaPlataforma ?? sessao?.ultimaPlataforma ?? null;

  const contextoActualizado = [...contextoActual, novaMensagem].slice(-maxMensagens);

  await guardarSessao(telefone, contextoActualizado, plataforma);

  return contextoActualizado;
}

module.exports = { obterSessao, guardarSessao, deletarSessao, adicionarMensagem };
