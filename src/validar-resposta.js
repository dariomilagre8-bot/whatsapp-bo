/** [CPA] Preços oficiais (Kz) — qualquer outro valor na resposta da IA é alucinação */
const PRECOS_OFICIAIS_KZ = [3000, 5500, 8000, 5000, 9000, 13500];

/** Mensagem de fallback quando IA inventa preço */
const MSG_PRECO_INVALIDO = 'Vou pedir ao responsável para lhe confirmar os valores exactos neste momento.';

/**
 * [CPA] Validação anti-alucinação das respostas da Zara.
 * Bloqueia senhas, emails de contas, PINs, códigos, placeholders, termos internos e preços inventados.
 */
function validarRespostaZara(resposta) {
  if (typeof resposta !== 'string' || !resposta.trim()) {
    return { valido: false, motivo: 'Resposta vazia', substituir: null };
  }

  const proibidos = [
    { regex: /senha[:\s]+\S+/i, msg: 'senha exposta' },
    { regex: /email[:\s]+\S+@\S+/i, msg: 'email de conta exposto' },
    { regex: /pin[:\s]+\d+/i, msg: 'PIN exposto' },
    { regex: /c[oó]dig[oa][:\s]+\d+/i, msg: 'código exposto' },
    { regex: /\[.+?\]/, msg: 'placeholder' },
    { regex: /dashboard/i, msg: 'dashboard' },
    { regex: /admin/i, msg: 'admin' },
    { regex: /supabase/i, msg: 'supabase' },
    { regex: /google\s*sheets/i, msg: 'google sheets' },
    { regex: /planilha/i, msg: 'planilha' },
    { regex: /netfixxxdabanda/i, msg: 'email interno conta' },
  ];

  for (const { regex, msg } of proibidos) {
    if (regex.test(resposta)) {
      return { valido: false, motivo: `Resposta contém conteúdo proibido: ${msg}`, substituir: null };
    }
  }

  // [CPA] Bloquear "X Kz" quando X não está nos preços oficiais (ex.: 5.000, 13500 Kz)
  const matchKz = resposta.match(/\d+[.,]?\d*\s*Kz/gi);
  if (matchKz) {
    for (const m of matchKz) {
      const numStr = m.replace(/\s*kz/gi, '').replace(/[.,]/g, '').trim();
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > 0 && !PRECOS_OFICIAIS_KZ.includes(num)) {
        return { valido: false, motivo: 'Preço Kz não oficial (alucinação)', substituir: MSG_PRECO_INVALIDO };
      }
    }
  }
  return { valido: true, substituir: null };
}

module.exports = { validarRespostaZara, MSG_PRECO_INVALIDO };
