// engine/renewal/renewalMessages.js — Templates de aviso de renovação (PT-AO)

'use strict';

const TEMPLATES = {
  AVISO_3_DIAS:
    'Olá {name}! 👋 Aqui é a StreamZone. A sua subscrição {plan} expira em 3 dias (dia {expiry_date_formatted}).\n\n' +
    'Para renovar e continuar a ter acesso, fale connosco por aqui ou contacte o nosso suporte.\n\n' +
    'Não queremos que perca o acesso! 😊',
  AVISO_DIA:
    'Olá {name}! A sua subscrição {plan} na StreamZone expira HOJE.\n\n' +
    'Para renovar: responda a esta mensagem ou contacte o suporte.\n\n' +
    'Após a expiração, o acesso será suspenso. Renove agora para manter tudo activo! 🙏',
  EXPIRADO:
    'Olá {name}, a sua subscrição {plan} na StreamZone expirou.\n\n' +
    'O seu acesso foi suspenso, mas pode reactivar a qualquer momento — basta contactar-nos por aqui.\n\n' +
    'Esperamos ter consigo de volta! 💙',
};

function formatExpiryDatePt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const s = new Intl.DateTimeFormat('pt-AO', { day: 'numeric', month: 'long' }).format(d);
  return s.replace(/ de ([a-záàâãéêíóôõúç]+)/i, (_, m) => ` de ${m.charAt(0).toUpperCase()}${m.slice(1)}`);
}

function renderRenewalMessage(templateKey, client) {
  const tpl = TEMPLATES[templateKey];
  if (!tpl) throw new Error(`Template desconhecido: ${templateKey}`);
  const name = (client && client.name) || 'Cliente';
  const plan = (client && client.plan) || 'subscrição';
  const expiry_date_formatted = formatExpiryDatePt(client && client.expiry_date);
  return tpl
    .replace(/\{name\}/g, name)
    .replace(/\{plan\}/g, plan)
    .replace(/\{expiry_date_formatted\}/g, expiry_date_formatted);
}

module.exports = { TEMPLATES, formatExpiryDatePt, renderRenewalMessage };
