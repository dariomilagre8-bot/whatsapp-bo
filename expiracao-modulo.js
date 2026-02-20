// =====================================================================
// MÓDULO: NOTIFICAÇÕES DE EXPIRAÇÃO
// Estratégia de marketing em 3 momentos:
//   7d antes — aviso suave       (UMA VEZ)
//   3d antes — aviso com urgência (UMA VEZ)
//   0d        — aviso final       (UMA VEZ)
//   após exp. — silêncio total, libertar slot
// =====================================================================

const DIAS_PLANO = parseInt(process.env.DIAS_VALIDADE_EXPIRACAO, 10) || 30;

// Deduplicação em memória: "phone_dataVenda_tipo" (ex: "244xxx_15/01/2024_7d")
// Usa dataVenda (não hoje) para sobreviver a múltiplas execuções no mesmo dia
const avisosEnviados = new Set();

// ─────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────
function parseDatePT(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return isNaN(d.getTime()) ? null : d;
}

function diasAteExpirar(dataVendaStr) {
  const venda = parseDatePT(dataVendaStr);
  if (!venda) return null;
  const expiry = new Date(venda);
  expiry.setDate(expiry.getDate() + DIAS_PLANO);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.round((expiry - hoje) / (1000 * 60 * 60 * 24));
}

// ─────────────────────────────────────────────────────────────────────
// MENSAGENS (templates exactos de marketing)
// ─────────────────────────────────────────────────────────────────────
function msg7Dias(nome, plataforma, website) {
  return (
    `Olá ${nome}! 😊\n\n` +
    `O teu plano 🎬 *${plataforma}* expira daqui a *7 dias*.\n\n` +
    `Aproveita para renovar com antecedência e continua a ver os teus filmes e séries favoritos sem interrupções 🍿\n\n` +
    `👉 Renova aqui: ${website}\n\n` +
    `Qualquer dúvida estamos aqui! 💬`
  );
}

function msg3Dias(nome, plataforma, website) {
  return (
    `${nome}, atenção! ⏰\n\n` +
    `O teu plano 🎬 *${plataforma}* expira em apenas *3 dias*.\n\n` +
    `Não percas o acesso às tuas séries a meio — renova agora em menos de 2 minutos 😊\n\n` +
    `💳 Renova aqui: ${website}\n\n` +
    `Estamos sempre disponíveis para ajudar! 🙌`
  );
}

function msg0Dias(nome, plataforma, website, marcaNome) {
  return (
    `${nome}, hoje é o último dia! 🚨\n\n` +
    `O teu plano 🎬 *${plataforma}* expira *hoje*.\n\n` +
    `Renova agora e continua a ver sem parar 🎬🍿\n\n` +
    `🔗 ${website}\n\n` +
    `Obrigado por escolheres a ${marcaNome}! ❤️`
  );
}

// ─────────────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL — corre uma vez por dia às 9h
// ─────────────────────────────────────────────────────────────────────
async function verificarExpiracoes({ sendWhatsAppMessage, MAIN_BOSS, branding, fetchAllRows, markProfileAvailable, isIndisponivel }) {
  console.log('🔔 [Expiração] A verificar planos...');
  let avisados = 0, libertados = 0;

  try {
    const rows = await fetchAllRows();
    if (!rows || rows.length <= 1) return;

    // Colunas: A=Plataforma B=Email C=Senha D=NomePerfil E=Pin F=Status G=Cliente H=DataVenda I=QNTD J=Tipo
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const plataforma = row[0] || '';
      const status     = row[5] || '';
      const clienteRaw = row[6] || '';
      const dataVenda  = row[7] || '';

      if (!isIndisponivel(status) || !dataVenda || !clienteRaw) continue;

      // Extrair nome e telemóvel do campo "Nome - 244XXXXXXXXX"
      const partes = clienteRaw.split(' - ');
      const nome   = partes[0]?.trim() || '';
      const phone  = partes.length > 1
        ? partes[partes.length - 1].replace(/\D/g, '')
        : partes[0].replace(/\D/g, '');
      if (!phone) continue;

      const dias = diasAteExpirar(dataVenda);
      if (dias === null) continue;

      const keyBase = `${phone}_${dataVenda}`;

      if (dias === 7 && !avisosEnviados.has(`${keyBase}_7d`)) {
        // ── 7 dias antes — aviso suave ──
        await sendWhatsAppMessage(phone, msg7Dias(nome, plataforma, branding.website));
        avisosEnviados.add(`${keyBase}_7d`);
        avisados++;
        console.log(`📩 [Expiração] 7d aviso enviado: ${phone} (${nome}) — ${plataforma}`);

      } else if (dias === 3 && !avisosEnviados.has(`${keyBase}_3d`)) {
        // ── 3 dias antes — aviso com urgência ──
        await sendWhatsAppMessage(phone, msg3Dias(nome, plataforma, branding.website));
        avisosEnviados.add(`${keyBase}_3d`);
        avisados++;
        console.log(`⚠️ [Expiração] 3d aviso enviado: ${phone} (${nome}) — ${plataforma}`);

      } else if (dias === 0 && !avisosEnviados.has(`${keyBase}_0d`)) {
        // ── Dia de expiração — aviso final ──
        await sendWhatsAppMessage(phone, msg0Dias(nome, plataforma, branding.website, branding.nome));
        avisosEnviados.add(`${keyBase}_0d`);
        avisados++;
        console.log(`🚨 [Expiração] Último dia enviado: ${phone} (${nome}) — ${plataforma}`);

      } else if (dias < 0) {
        // ── Após expiração — silêncio ao cliente, libertar slot ──
        await markProfileAvailable(i + 1);
        libertados++;
        console.log(`♻️ [Expiração] Slot libertado: linha ${i + 1} — ${phone} (${plataforma})`);

        // Notificar apenas o supervisor (não o cliente)
        if (MAIN_BOSS) {
          await sendWhatsAppMessage(MAIN_BOSS,
            `♻️ *PLANO EXPIRADO*\n👤 ${nome || phone}\n📱 ${phone}\n🎬 ${plataforma}\n📋 Linha ${i + 1} libertada na Sheet`
          );
        }
      }
      // Qualquer outro valor (dias=6, 5, 4, 2, 1) → silêncio total
    }

    console.log(`✅ [Expiração] Concluído — ${avisados} avisos enviados, ${libertados} slots libertados`);
  } catch (err) {
    console.error('❌ [Expiração] Erro:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────
// SCHEDULER — executa às 9h todos os dias
// ─────────────────────────────────────────────────────────────────────
function iniciar(deps) {
  function msAte9h() {
    const agora = new Date();
    const prox  = new Date();
    prox.setHours(9, 0, 0, 0);
    if (prox <= agora) prox.setDate(prox.getDate() + 1);
    return prox - agora;
  }

  const ms = msAte9h();
  setTimeout(() => {
    verificarExpiracoes(deps);
    setInterval(() => verificarExpiracoes(deps), 24 * 60 * 60 * 1000);
  }, ms);

  const horas = Math.round(ms / 3600000);
  console.log(`🕘 [Expiração] Scheduler iniciado — próxima verificação em ${horas}h (às 9h)`);
}

module.exports = { iniciar, verificarExpiracoes, diasAteExpirar };
