// src/crm/leads.js — CRM básico de tracking de leads
// Non-blocking: todos os erros são capturados internamente, o bot continua a funcionar

const { extractPhoneNumber } = require('../utils/phone');

/**
 * UPSERT lead: 1 linha única por número de telefone.
 * Se o número já existir, atualiza apenas ultimo_contacto e total_mensagens (não altera primeiro_contacto).
 * Se não existir, faz INSERT como novo lead.
 * @param {object} supabase
 * @param {string} numero - JID ou número (será normalizado; nunca gravar raw @lid)
 * @param {string|null} nome - Nome do cliente (pushName ou extraído)
 */
async function upsertLead(supabase, numero, nome) {
  if (!supabase || !numero) return;
  const normalized = extractPhoneNumber(numero);
  if (!normalized) return;

  try {
    const { data: existing } = await supabase
      .from('leads')
      .select('id, total_mensagens, nome, status')
      .eq('numero', normalized)
      .maybeSingle();

    if (existing) {
      const updates = {
        ultimo_contacto: new Date().toISOString(),
        total_mensagens: (existing.total_mensagens || 0) + 1,
        updated_at: new Date().toISOString(),
      };
      if (nome && !existing.nome) updates.nome = nome;
      await supabase.from('leads').update(updates).eq('id', existing.id);
      console.log(`[CRM] ♻️ Lead actualizado: ${normalized}`);
    } else {
      const { error } = await supabase
        .from('leads')
        .upsert(
          {
            numero: normalized,
            nome: nome || null,
            status: 'novo',
            primeiro_contacto: new Date().toISOString(),
            ultimo_contacto: new Date().toISOString(),
            total_mensagens: 1,
            fonte: 'directo',
          },
          { onConflict: 'numero' }
        );
      if (error) throw error;
      console.log(`[CRM] 🆕 Novo lead registado: ${normalized}`);
    }
  } catch (err) {
    console.error('[CRM] upsertLead error:', err.message);
  }
}

/**
 * Actualiza o status de um lead.
 * @param {object} supabase
 * @param {string} numero
 * @param {'novo'|'interessado'|'comprou'|'recorrente'|'inactivo'} status
 * @param {object} extra - Campos adicionais (ex: { ultima_compra, total_compras })
 */
async function updateLeadStatus(supabase, numero, status, extra = {}) {
  if (!supabase || !numero) return;
  const normalized = extractPhoneNumber(numero);
  if (!normalized) return;

  try {
    const { data: existing } = await supabase
      .from('leads')
      .select('id, status, total_compras, valor_total_compras')
      .eq('numero', normalized)
      .maybeSingle();

    if (!existing) return;

    let finalStatus = status;
    if (status === 'comprou' && (existing.total_compras || 0) > 0) {
      finalStatus = 'recorrente';
    }

    const updates = {
      status: finalStatus,
      updated_at: new Date().toISOString(),
      ...extra,
    };

    await supabase.from('leads').update(updates).eq('id', existing.id);
    console.log(`[CRM] 📊 Lead ${normalized} → status: ${finalStatus}`);
  } catch (err) {
    console.error('[CRM] updateLeadStatus error:', err.message);
  }
}

/**
 * Regista compra concluída: incrementa contadores e actualiza status.
 * @param {object} supabase
 * @param {string} numero
 * @param {number} valor - Valor da compra em Kz
 */
async function registarCompra(supabase, numero, valor = 0) {
  if (!supabase || !numero) return;
  const normalized = extractPhoneNumber(numero);
  if (!normalized) return;

  try {
    const { data: existing } = await supabase
      .from('leads')
      .select('id, status, total_compras, valor_total_compras')
      .eq('numero', normalized)
      .maybeSingle();

    if (!existing) return;

    const novoTotal = (existing.total_compras || 0) + 1;
    const novoValor = (existing.valor_total_compras || 0) + valor;
    const novoStatus = novoTotal > 1 ? 'recorrente' : 'comprou';

    await supabase.from('leads').update({
      status: novoStatus,
      total_compras: novoTotal,
      valor_total_compras: novoValor,
      ultima_compra: new Date().toISOString(),
      follow_up_enviado: false,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);

    console.log(`[CRM] 💰 Compra registada para ${normalized} (total: ${novoTotal} compras, ${novoValor} Kz)`);
  } catch (err) {
    console.error('[CRM] registarCompra error:', err.message);
  }
}

/**
 * Adiciona um produto ao array de interesses do lead (status → interessado).
 * @param {object} supabase
 * @param {string} numero
 * @param {string} produto
 */
async function addProdutoInteresse(supabase, numero, produto) {
  if (!supabase || !numero || !produto) return;
  const normalized = extractPhoneNumber(numero);
  if (!normalized) return;

  try {
    const { data: existing } = await supabase
      .from('leads')
      .select('id, status, produtos_interesse')
      .eq('numero', normalized)
      .maybeSingle();

    if (!existing) return;

    const jaInteresse = (existing.produtos_interesse || []);
    if (jaInteresse.some(p => p.toLowerCase().includes(produto.toLowerCase()))) return;

    const newList = [...jaInteresse, produto];
    const updates = {
      produtos_interesse: newList,
      updated_at: new Date().toISOString(),
    };

    if (existing.status === 'novo') {
      updates.status = 'interessado';
    }

    await supabase.from('leads').update(updates).eq('id', existing.id);
    console.log(`[CRM] 🔍 Lead ${normalized} mostrou interesse em "${produto}"`);
  } catch (err) {
    console.error('[CRM] addProdutoInteresse error:', err.message);
  }
}

/**
 * Resumo CRM para o supervisor (#leads).
 */
async function getCrmResumo(supabase) {
  if (!supabase) return '❌ Supabase não configurado.';
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('status, primeiro_contacto');

    if (error) throw error;
    const rows = data || [];

    const agora = new Date();
    const sete = new Date(); sete.setDate(agora.getDate() - 7);

    const novos7dias = rows.filter(r =>
      r.status === 'novo' && new Date(r.primeiro_contacto) >= sete
    ).length;
    const interessados = rows.filter(r => r.status === 'interessado').length;
    const compraram = rows.filter(r => r.status === 'comprou').length;
    const recorrentes = rows.filter(r => r.status === 'recorrente').length;
    const inactivos = rows.filter(r => r.status === 'inactivo').length;
    const total = rows.length;

    return (
      `📊 *CRM Resumo:*\n` +
      `• Novos (7 dias): ${novos7dias}\n` +
      `• Interessados: ${interessados}\n` +
      `• Compraram: ${compraram}\n` +
      `• Recorrentes: ${recorrentes}\n` +
      `• Inactivos: ${inactivos}\n` +
      `• Total leads: ${total}`
    );
  } catch (err) {
    console.error('[CRM] getCrmResumo error:', err.message);
    return '❌ Erro ao consultar CRM.';
  }
}

/**
 * Detalhe de um lead específico para o supervisor (#lead [número]).
 */
async function getLeadDetalhe(supabase, numero) {
  if (!supabase || !numero) return '❌ Número inválido.';
  const normalized = extractPhoneNumber(numero);
  if (!normalized) return '❌ Número inválido (use formato 244XXXXXXXXX).';

  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .or(`numero.eq.${normalized},numero.ilike.%${normalized}%`)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return `❌ Lead "${normalized}" não encontrado.`;

    const d = data;
    const pc = d.primeiro_contacto ? new Date(d.primeiro_contacto).toLocaleDateString('pt-PT') : 'N/D';
    const uc = d.ultimo_contacto ? new Date(d.ultimo_contacto).toLocaleDateString('pt-PT') : 'N/D';
    const uComp = d.ultima_compra ? new Date(d.ultima_compra).toLocaleDateString('pt-PT') : 'Nunca';
    const interesses = (d.produtos_interesse || []).join(', ') || 'Nenhum';

    return (
      `👤 *Lead: ${d.nome || 'Desconhecido'}*\n` +
      `📱 Número: ${d.numero}\n` +
      `📌 Status: ${d.status}\n` +
      `📅 Primeiro contacto: ${pc}\n` +
      `🕐 Último contacto: ${uc}\n` +
      `💬 Total mensagens: ${d.total_mensagens || 0}\n` +
      `🛒 Total compras: ${d.total_compras || 0}\n` +
      `💰 Valor total: ${d.valor_total_compras || 0} Kz\n` +
      `📦 Última compra: ${uComp}\n` +
      `🔍 Interesses: ${interesses}\n` +
      `📣 Follow-up enviado: ${d.follow_up_enviado ? 'Sim' : 'Não'}`
    );
  } catch (err) {
    console.error('[CRM] getLeadDetalhe error:', err.message);
    return '❌ Erro ao consultar lead.';
  }
}

/**
 * Cron semanal: marca leads sem contacto há 60 dias como 'inactivo'.
 */
async function marcarInactivos(supabase) {
  if (!supabase) return;
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);

    const { error, count } = await supabase
      .from('leads')
      .update({ status: 'inactivo', updated_at: new Date().toISOString() })
      .lt('ultimo_contacto', cutoff.toISOString())
      .not('status', 'in', '("inactivo","comprou","recorrente")')
      .select('id', { count: 'exact' });

    if (error) throw error;
    console.log(`[CRM] 💤 ${count || 0} lead(s) marcado(s) como inactivo`);
  } catch (err) {
    console.error('[CRM] marcarInactivos error:', err.message);
  }
}

module.exports = {
  upsertLead,
  updateLeadStatus,
  registarCompra,
  addProdutoInteresse,
  getCrmResumo,
  getLeadDetalhe,
  marcarInactivos,
};
