/**
 * [CPA] Lookup de dados reais — cliente, vendas, perfis, stock.
 * Todas as funções em try/catch; falhas retornam null ou array vazio (degradação graciosa).
 */
const { supabase } = require('../supabase');
const { fetchAllRows, isDisponivel, normalizePlataforma, checkClientInSheet } = require('../googleSheets');

/**
 * 1A. Busca cliente por WhatsApp — Supabase primeiro, fallback Google Sheets.
 * @param {string} phone - Número WhatsApp (apenas dígitos)
 * @returns {Promise<{ nome?: string, whatsapp?: string, email?: string, criado_em?: string, ehAntigo: boolean }|null>}
 */
async function buscarClientePorWhatsapp(phone) {
  if (!phone || String(phone).replace(/\D/g, '').length < 9) return null;
  const clean = String(phone).replace(/\D/g, '');

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('clientes')
        .select('nome, whatsapp, email, criado_em')
        .eq('whatsapp', clean)
        .maybeSingle();
      if (!error && data) {
        return {
          nome: data.nome || '',
          whatsapp: data.whatsapp || clean,
          email: data.email || '',
          criado_em: data.criado_em || '',
          ehAntigo: true,
        };
      }
    }
  } catch (e) {
    console.error('[cliente-lookup] buscarClientePorWhatsapp Supabase:', e.message);
  }

  try {
    const existing = await checkClientInSheet(clean);
    if (existing) {
      return {
        nome: (existing.clienteName || existing.cliente || '').trim(),
        whatsapp: clean,
        email: '',
        criado_em: '',
        ehAntigo: true,
      };
    }
  } catch (e) {
    console.error('[cliente-lookup] buscarClientePorWhatsapp Sheet:', e.message);
  }

  return { ehAntigo: false };
}

/**
 * 1B. Vendas do cliente — Supabase, ordenadas por data_venda DESC.
 * @param {string} phone - WhatsApp
 * @returns {Promise<Array<{ plataforma: string, plano: string, data_venda: string, data_expiracao: string, status: string, diasRestantes?: number }>>}
 */
async function buscarVendasDoCliente(phone) {
  if (!phone) return [];
  const clean = String(phone).replace(/\D/g, '');

  try {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('vendas')
      .select('plataforma, plano, data_venda, data_expiracao, status')
      .eq('whatsapp', clean)
      .order('data_venda', { ascending: false });
    if (error) throw new Error(error.message);
    if (!data || !Array.isArray(data)) return [];

    const hoje = new Date();
    return data.map((v) => {
      const expiracao = v.data_expiracao ? new Date(v.data_expiracao) : null;
      const diasRestantes = expiracao
        ? Math.ceil((expiracao - hoje) / (1000 * 60 * 60 * 24))
        : null;
      return {
        plataforma: v.plataforma || '',
        plano: v.plano || '',
        data_venda: v.data_venda || '',
        data_expiracao: v.data_expiracao || '',
        status: v.status || '',
        diasRestantes: diasRestantes !== null ? diasRestantes : undefined,
      };
    });
  } catch (e) {
    console.error('[cliente-lookup] buscarVendasDoCliente:', e.message);
    return [];
  }
}

/**
 * 1C. Perfis do cliente (sem senha nem PIN — só supervisor tem acesso).
 * @param {string} phone - WhatsApp
 * @returns {Promise<Array<{ email_conta: string, nome_perfil: string, plataforma: string }>>}
 */
async function buscarPerfisDoCliente(phone) {
  if (!phone || !supabase) return [];
  const clean = String(phone).replace(/\D/g, '');

  try {
    const { data: vendas } = await supabase
      .from('vendas')
      .select('id')
      .eq('whatsapp', clean)
      .order('data_venda', { ascending: false });
    if (!vendas || vendas.length === 0) return [];

    const ids = vendas.map((v) => v.id).filter(Boolean);
    const { data: perfis } = await supabase
      .from('perfis_entregues')
      .select('email_conta, nome_perfil, plataforma')
      .in('venda_id', ids);
    if (!perfis) return [];
    return perfis.map((p) => ({
      email_conta: p.email_conta || '',
      nome_perfil: p.nome_perfil || '',
      plataforma: p.plataforma || '',
    }));
  } catch (e) {
    console.error('[cliente-lookup] buscarPerfisDoCliente:', e.message);
    return [];
  }
}

/**
 * 1D. Verifica stock na Google Sheet por plataforma e tipo de conta.
 * @param {string} plataforma - "Netflix" ou "Prime Video" (ou "netflix"/"prime")
 * @param {string} tipoConta - "full_account" ou "shared_profile"
 * @returns {Promise<{ disponivel: boolean, quantidade: number }>}
 */
async function verificarStock(plataforma, tipoConta) {
  try {
    const rows = await fetchAllRows();
    if (!rows || rows.length <= 1) return { disponivel: false, quantidade: 0 };

    const platNorm = normalizePlataforma(plataforma);
    const tipo = (tipoConta || 'shared_profile').toLowerCase().trim();
    let quantidade = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowPlat = normalizePlataforma(row[0] || '');
      const status = row[5];
      const tipoRow = (row[11] || 'shared_profile').toLowerCase().trim();
      if (!rowPlat.includes(platNorm) || !isDisponivel(status)) continue;
      if (tipoRow !== tipo) continue;
      quantidade++;
    }

    return { disponivel: quantidade > 0, quantidade };
  } catch (e) {
    console.error('[cliente-lookup] verificarStock:', e.message);
    return { disponivel: false, quantidade: 0 };
  }
}

module.exports = {
  buscarClientePorWhatsapp,
  buscarVendasDoCliente,
  buscarPerfisDoCliente,
  verificarStock,
};
