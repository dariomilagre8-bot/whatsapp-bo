/**
 * [CPA] Validação anti-alucinação das respostas da Zara.
 * Bloqueia senhas, emails de contas, PINs, códigos, placeholders e termos internos.
 */
function validarRespostaZara(resposta) {
  if (typeof resposta !== 'string' || !resposta.trim()) {
    return { valido: false, motivo: 'Resposta vazia' };
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
  ];

  for (const { regex, msg } of proibidos) {
    if (regex.test(resposta)) {
      return { valido: false, motivo: `Resposta contém conteúdo proibido: ${msg}` };
    }
  }
  return { valido: true };
}

module.exports = { validarRespostaZara };
