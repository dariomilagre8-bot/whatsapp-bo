// Supervisor: comandos (assumir, retomar, liberar, sim, nao, reposto, alternativa, cancelar, perdas, recuperar, localizacao, pin) + processApproval/processRejection
const config = require('../config');
const estados = require('../utils/estados');
const { sendWhatsAppMessage, sendCredentialsEmail, sendPaymentMessages } = require('../whatsapp');
const {
  todayDate,
  fetchAllRows,
  updateSheetCell,
  markProfileSold,
  markProfileAvailable,
  checkClientInSheet,
  findAvailableProfiles,
  findClientProfiles,
} = require('../../googleSheets');
const { supabase } = require('../../supabase');
const branding = require('../../branding');
const notif = require('../utils/notificacoes');

const {
  ALL_SUPERVISORS,
  MAIN_BOSS,
  CATALOGO,
  PLAN_SLOTS,
  PLAN_PROFILE_TYPE,
} = config;

const { clientStates, pendingVerifications, pausedClients, cleanupSession, initClientState, markDirty } = estados;
const { logLostSale, lostSales } = notif;

function isSupervisor(senderNum) {
  return ALL_SUPERVISORS.includes(senderNum);
}

async function processApproval(targetClient, senderNum) {
  const pedido = pendingVerifications[targetClient];
  if (!pedido) return { success: false, allSuccess: false };

  const results = [];
  let allSuccess = true;

  for (const item of pedido.cart) {
    const totalSlots = item.totalSlots || item.slotsNeeded;
    const qty = item.quantity || 1;
    const profileType = PLAN_PROFILE_TYPE[item.plan.toLowerCase()] || 'shared_profile';
    let profiles = null;

    if (pedido.isRenewal) {
      const clientProfiles = await findClientProfiles(targetClient);
      if (clientProfiles) {
        const platProfiles = clientProfiles.filter(p =>
          p.plataforma.toLowerCase().includes(item.plataforma.toLowerCase())
        );
        if (platProfiles.length > 0) profiles = platProfiles.map(p => ({ ...p, isRenewal: true }));
      }
    } else {
      console.log(`🔍 processApproval: Buscando ${totalSlots} perfis para ${item.plataforma} ${item.plan} (type: ${profileType})`);
      profiles = await findAvailableProfiles(item.plataforma, totalSlots, profileType);
      if (!profiles) {
        const altType = profileType === 'full_account' ? 'shared_profile' : 'full_account';
        profiles = await findAvailableProfiles(item.plataforma, totalSlots, altType);
        if (profiles && senderNum) {
          await sendWhatsAppMessage(senderNum, `ℹ️ Fallback: ${item.plataforma} ${item.plan} usou tipo ${altType} em vez de ${profileType}.`);
        }
      }
    }

    if (profiles && profiles.length > 0) {
      results.push({ item, profiles, success: true });
    } else {
      results.push({ item, profiles: null, success: false });
      allSuccess = false;
    }
  }

  const allCreds = [];
  for (const result of results) {
    if (result.success) {
      const profs = result.profiles;
      const planLower = result.item.plan.toLowerCase();
      const slotsPerUnit = PLAN_SLOTS[planLower] || 1;
      const qty = result.item.quantity || 1;
      for (let unitIdx = 0; unitIdx < qty; unitIdx++) {
        for (let si = 0; si < slotsPerUnit; si++) {
          const pi = unitIdx * slotsPerUnit + si;
          if (pi < profs.length) {
            allCreds.push({
              plataforma: result.item.plataforma,
              plan: result.item.plan,
              unitLabel: qty > 1 ? `Conta ${unitIdx + 1}` : '',
              email: profs[pi].email,
              senha: profs[pi].senha,
              nomePerfil: profs[pi].nomePerfil || '',
              pin: profs[pi].pin || '',
            });
          }
        }
      }
    }
  }

  if (results.some(r => r.success)) {
    const waCheck = await sendWhatsAppMessage(targetClient, '✅ *Pagamento confirmado!*\n\nAqui estão os dados da sua conta 😊');

    if (waCheck.invalidNumber) {
      if (pedido.email && allCreds.length > 0) {
        const productName = pedido.cart.map(i => `${i.plataforma} ${i.plan}`).join(', ');
        await sendCredentialsEmail(pedido.email, pedido.clientName || 'Cliente', productName, allCreds);
      }
      if (MAIN_BOSS) {
        const emailStatus = pedido.email
          ? `📧 Credenciais enviadas para: ${pedido.email}`
          : '❌ Sem email alternativo — entregar manualmente.';
        await sendWhatsAppMessage(MAIN_BOSS, `⚠️ *NÚMERO FALSO/INVÁLIDO*\n👤 ${pedido.clientName || 'N/A'} — ${targetClient}\n❌ O número não tem WhatsApp (exists: false).\n${emailStatus}`);
      }
      if (senderNum) {
        await sendWhatsAppMessage(senderNum, `⚠️ Número ${targetClient} inválido (sem WhatsApp).\n${pedido.email ? `📧 Credenciais enviadas para ${pedido.email}.` : '❌ Sem email — entregar manualmente.'}`);
      }
    } else {
      for (const result of results) {
        if (result.success) {
          const profs = result.profiles;
          const qty = result.item.quantity || 1;
          const svcEmoji = result.item.plataforma.toLowerCase().includes('netflix') ? '🎬' : '📺';
          const qtyLabel = qty > 1 ? ` (${qty}x ${result.item.plan})` : '';
          const planLower = result.item.plan.toLowerCase();
          const slotsPerUnit = PLAN_SLOTS[planLower] || 1;
          let entrega = `${svcEmoji} *${result.item.plataforma}*${qtyLabel}\n`;
          if (slotsPerUnit > 1 && profs.length >= slotsPerUnit) {
            for (let unitIdx = 0; unitIdx < qty; unitIdx++) {
              if (qty > 1) entrega += `\n📦 *Conta ${unitIdx + 1}:*`;
              const startIdx = unitIdx * slotsPerUnit;
              const endIdx = Math.min(startIdx + slotsPerUnit, profs.length);
              for (let i = startIdx; i < endIdx; i++) {
                const profileNum = (i - startIdx) + 1;
                entrega += `\n✅ Perfil ${profileNum}: ${profs[i].email} | ${profs[i].senha}`;
                if (profs[i].nomePerfil) entrega += ` | ${profs[i].nomePerfil}`;
                if (profs[i].pin) entrega += ` | PIN: ${profs[i].pin}`;
              }
            }
          } else {
            for (let i = 0; i < profs.length; i++) {
              entrega += `\n✅ Perfil ${i + 1}: ${profs[i].email} | ${profs[i].senha}`;
              if (profs[i].nomePerfil) entrega += ` | ${profs[i].nomePerfil}`;
              if (profs[i].pin) entrega += ` | PIN: ${profs[i].pin}`;
            }
          }
          await sendWhatsAppMessage(targetClient, entrega);
        }
      }
      const emailEnviado = pedido.email && allCreds.length > 0;
      if (emailEnviado) {
        await sendCredentialsEmail(pedido.email, pedido.clientName || 'Cliente', pedido.cart.map(i => `${i.plataforma} ${i.plan}`).join(', '), allCreds);
      }
      const confirmMsg = emailEnviado
        ? `✅ Credenciais enviadas aqui via WhatsApp e também para o teu email *${pedido.email}*.\n\n💾 *Guarda bem os dados de acesso!* (tira screenshot desta conversa)\n\nObrigado por escolheres a ${branding.nome}! 🎉 Qualquer dúvida, estamos aqui. 😊`
        : `✅ Credenciais enviadas aqui via WhatsApp.\n\n💾 *Guarda bem os dados de acesso!* (tira screenshot desta conversa)\n\nObrigado por escolheres a ${branding.nome}! 🎉 Qualquer dúvida, estamos aqui. 😊`;
      await sendWhatsAppMessage(targetClient, confirmMsg);
    }

    for (const result of results) {
      if (result.success) {
        for (const p of result.profiles) {
          if (p.isRenewal) {
            await updateSheetCell(p.rowIndex, 'H', todayDate());
          } else {
            await markProfileSold(p.rowIndex, pedido.clientName || '', targetClient, 1);
          }
        }
      }
    }

    if (supabase) {
      try {
        const { data: cliente } = await supabase
          .from('clientes')
          .upsert({ whatsapp: targetClient, nome: pedido.clientName || '' }, { onConflict: 'whatsapp' })
          .select()
          .single();

        for (const result of results) {
          if (result.success) {
            const svcInfo = CATALOGO[result.item.plataforma.toLowerCase()] || {};
            const pricePerUnit = svcInfo.planos ? (svcInfo.planos[result.item.plan.toLowerCase()] || 0) : 0;
            const qty = result.item.quantity || 1;

            await supabase.from('vendas').insert({
              cliente_id: cliente ? cliente.id : null,
              whatsapp: targetClient,
              plataforma: result.item.plataforma,
              plano: result.item.plan,
              quantidade: qty,
              valor_total: pricePerUnit * qty,
              data_expiracao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });
          }
        }
      } catch (e) {
        console.error('Supabase registo falhou (não crítico):', e.message);
      }
    }
  }

  if (senderNum && !results.some(r => r.success && !r.success)) {
    if (allSuccess) {
      const grandTotalSlots = pedido.cart.reduce((sum, item) => sum + (item.totalSlots || item.slotsNeeded), 0);
      const totalProfiles = results.reduce((sum, r) => sum + (r.profiles ? r.profiles.length : 0), 0);
      const cartDesc = pedido.cart.map(item => {
        const q = item.quantity || 1;
        return `${q > 1 ? q + 'x ' : ''}${item.plataforma} ${item.plan}`;
      }).join(', ');
      await sendWhatsAppMessage(senderNum, `✅ Entrega realizada para ${pedido.clientName || targetClient}! ${cartDesc} (${grandTotalSlots} slot(s), ${totalProfiles} perfil(s) marcados).`);
    } else {
      const failed = results.filter(r => !r.success);
      const failedNames = failed.map(r => {
        const q = r.item.quantity || 1;
        return `${q > 1 ? q + 'x ' : ''}${r.item.plataforma} ${r.item.plan}`;
      }).join(', ');
      if (results.some(r => r.success)) {
        await sendWhatsAppMessage(targetClient, `⚠️ Alguns serviços serão enviados manualmente: ${failedNames}`);
      } else {
        await sendWhatsAppMessage(targetClient, 'Pagamento recebido! A equipa vai enviar os dados em breve. 😊');
      }
      await sendWhatsAppMessage(senderNum, `⚠️ *SEM STOCK* para: ${failedNames}. Envie manualmente!`);
    }
  }

  const savedNameAfter = clientStates[targetClient]?.clientName;
  cleanupSession(targetClient);
  clientStates[targetClient] = initClientState({ clientName: savedNameAfter || '', step: 'escolha_servico' });
  markDirty(targetClient);
  return { success: true, allSuccess, totalDelivered: results.filter(r => r.success).length };
}

async function processRejection(targetClient, senderNum) {
  await sendWhatsAppMessage(targetClient, '❌ Comprovativo inválido. Por favor, envie o comprovativo de pagamento APENAS em formato PDF. 📄');
  if (clientStates[targetClient]) {
    clientStates[targetClient].step = 'aguardando_comprovativo';
  }
  delete pendingVerifications[targetClient];
  if (senderNum) await sendWhatsAppMessage(senderNum, '❌ Rejeitado. Cliente pode reenviar.');
  return { success: true };
}

/**
 * Trata mensagens de supervisor (assumir, retomar, liberar, sim, nao, reposto, alternativa, cancelar, perdas, recuperar, localizacao, pin).
 * Envia res e retorna true se foi tratado; retorna false se o remetente não for supervisor.
 */
async function handleSupervisorCommand(res, senderNum, textMessage, quotedText) {
  if (!isSupervisor(senderNum)) return false;

  console.log('👑 Supervisor detetado.');
  const lower = textMessage.toLowerCase().trim();
  const parts = lower.split(/\s+/);
  const command = parts[0];

  if (command === 'assumir' && parts[1]) {
    const targetNum = parts[1].replace(/\D/g, '');
    pausedClients[targetNum] = true;
    await sendWhatsAppMessage(senderNum, `⏸️ Bot pausado para ${targetNum}. Pode falar diretamente.`);
    res.status(200).send('OK');
    return true;
  }

  if (command === 'retomar' && parts[1]) {
    const targetNum = parts[1].replace(/\D/g, '');
    delete pausedClients[targetNum];
    await sendWhatsAppMessage(senderNum, `▶️ Bot reativado para ${targetNum}.`);
    res.status(200).send('OK');
    return true;
  }

  if (command === 'liberar' && parts[1]) {
    const targetNum = parts[1].replace(/\D/g, '');
    const existing = await checkClientInSheet(targetNum);
    if (existing) {
      await markProfileAvailable(existing.rowIndex);
      cleanupSession(targetNum);
      await sendWhatsAppMessage(senderNum, `🔓 Perfil de ${targetNum} libertado (${existing.plataforma}).`);
    } else {
      await sendWhatsAppMessage(senderNum, `⚠️ Nenhum perfil encontrado para ${targetNum}.`);
    }
    res.status(200).send('OK');
    return true;
  }

  if (command === 'reposto' && parts[1]) {
    const targetNum = parts[1].replace(/\D/g, '');
    const targetState = clientStates[targetNum];
    if (!targetState || targetState.step !== 'aguardando_reposicao') {
      await sendWhatsAppMessage(senderNum, `⚠️ Cliente ${targetNum} não está a aguardar reposição de stock.`);
      res.status(200).send('OK');
      return true;
    }
    const recovery = targetState.pendingRecovery;
    if (!recovery) {
      await sendWhatsAppMessage(senderNum, `⚠️ Sem dados de recuperação para ${targetNum}.`);
      res.status(200).send('OK');
      return true;
    }
    const profileType = PLAN_PROFILE_TYPE[recovery.plan.toLowerCase()] || 'shared_profile';
    let stockProfiles = await findAvailableProfiles(recovery.service, recovery.totalSlots, profileType);
    if (!stockProfiles) {
      const altType = profileType === 'full_account' ? 'shared_profile' : 'full_account';
      stockProfiles = await findAvailableProfiles(recovery.service, recovery.totalSlots, altType);
    }
    if (!stockProfiles) {
      await sendWhatsAppMessage(senderNum, `❌ Stock ainda insuficiente para ${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.service} ${recovery.plan} (${recovery.totalSlots} slots).`);
      res.status(200).send('OK');
      return true;
    }
    const planLabel = recovery.plan;
    const qty = recovery.qty;
    const price = CATALOGO[recovery.serviceKey] ? CATALOGO[recovery.serviceKey].planos[recovery.plan.toLowerCase()] : 0;
    const totalPrice = price * qty;
    const slotsPerUnit = PLAN_SLOTS[recovery.plan.toLowerCase()] || 1;
    targetState.cart = [{
      serviceKey: recovery.serviceKey,
      plataforma: recovery.service,
      plan: planLabel,
      price: price,
      quantity: qty,
      slotsNeeded: slotsPerUnit,
      totalSlots: recovery.totalSlots,
      totalPrice: totalPrice
    }];
    targetState.totalValor = totalPrice;
    targetState.step = 'aguardando_comprovativo';
    delete targetState.pendingRecovery;
    targetState.supervisorResponded = true;
    await sendWhatsAppMessage(targetNum, `✅ Boa notícia${targetState.clientName ? ', ' + targetState.clientName : ''}! Já temos disponibilidade para o teu pedido de ${qty > 1 ? qty + 'x ' : ''}*${planLabel}* de ${recovery.service}. 🎉`);
    await sendPaymentMessages(targetNum, targetState);
    await sendWhatsAppMessage(senderNum, `✅ Venda retomada para ${targetNum}. Pagamento enviado ao cliente.`);
    res.status(200).send('OK');
    return true;
  }

  if (command === 'alternativa' && parts[1]) {
    const altPlan = parts[1].toLowerCase();
    const targetNum = (parts[2] || '').replace(/\D/g, '');
    if (!targetNum) {
      await sendWhatsAppMessage(senderNum, '⚠️ Formato: alternativa [plano] [número do cliente]');
      res.status(200).send('OK');
      return true;
    }
    const targetState = clientStates[targetNum];
    if (!targetState || targetState.step !== 'aguardando_reposicao') {
      await sendWhatsAppMessage(senderNum, `⚠️ Cliente ${targetNum} não está a aguardar reposição.`);
      res.status(200).send('OK');
      return true;
    }
    const recovery = targetState.pendingRecovery;
    if (!recovery) {
      await sendWhatsAppMessage(senderNum, `⚠️ Sem dados de recuperação para ${targetNum}.`);
      res.status(200).send('OK');
      return true;
    }
    const svcCat = CATALOGO[recovery.serviceKey];
    if (!svcCat || !svcCat.planos[altPlan]) {
      const available = svcCat ? Object.keys(svcCat.planos).join(', ') : 'N/A';
      await sendWhatsAppMessage(senderNum, `⚠️ Plano "${altPlan}" não existe para ${recovery.service}. Disponíveis: ${available}`);
      res.status(200).send('OK');
      return true;
    }
    const altPrice = svcCat.planos[altPlan];
    const altPlanLabel = altPlan.charAt(0).toUpperCase() + altPlan.slice(1);
    const altQty = recovery.qty;
    const altTotal = altPrice * altQty;
    targetState.pendingRecovery.suggestedPlan = altPlan;
    targetState.pendingRecovery.suggestedPrice = altPrice;
    targetState.step = 'aguardando_resposta_alternativa';
    targetState.supervisorResponded = true;
    await sendWhatsAppMessage(targetNum, `💡 ${targetState.clientName ? targetState.clientName + ', t' : 'T'}emos uma alternativa para ti!\n\nEm vez de ${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.plan}, podemos oferecer:\n\n📦 ${altQty > 1 ? altQty + 'x ' : ''}*${altPlanLabel}* de ${recovery.service} — ${altTotal.toLocaleString('pt')} Kz\n\nAceitas? (sim / não)`);
    await sendWhatsAppMessage(senderNum, `✅ Alternativa enviada ao cliente ${targetNum}: ${altPlanLabel} (${altTotal.toLocaleString('pt')} Kz).`);
    res.status(200).send('OK');
    return true;
  }

  if (command === 'cancelar' && parts[1]) {
    const targetNum = parts[1].replace(/\D/g, '');
    const targetState = clientStates[targetNum];
    if (targetState && (targetState.step === 'aguardando_reposicao' || targetState.step === 'aguardando_resposta_alternativa')) {
      const nome = targetState.clientName;
      await sendWhatsAppMessage(targetNum, `😔 ${nome ? nome + ', l' : 'L'}amentamos mas não foi possível processar o teu pedido desta vez. Esperamos ver-te em breve!\n\nSe precisares de algo, estamos aqui. 😊`);
      logLostSale(targetNum, nome, targetState.interestStack || [], targetState.step, 'Cancelado pelo supervisor');
      cleanupSession(targetNum);
      await sendWhatsAppMessage(senderNum, `✅ Pedido de ${targetNum} cancelado e cliente notificado.`);
    } else {
      await sendWhatsAppMessage(senderNum, `⚠️ Cliente ${targetNum} não tem pedido pendente de reposição.`);
    }
    res.status(200).send('OK');
    return true;
  }

  if (command === 'recuperar' && parts[1]) {
    const saleId = parseInt(parts[1], 10);
    const customMsg = textMessage.substring(textMessage.indexOf(parts[1]) + parts[1].length).trim();
    const sale = lostSales.find(s => s.id === saleId && !s.recovered);
    if (sale) {
      sale.recovered = true;
      delete pausedClients[sale.phone];
      clientStates[sale.phone] = initClientState({
        step: 'escolha_servico',
        clientName: sale.clientName,
      });
      const msg = customMsg || `Olá${sale.clientName ? ' ' + sale.clientName : ''}! 😊 Notámos que ficou interessado nos nossos serviços. Ainda podemos ajudar?\n\n🎬 *Netflix*\n📺 *Prime Video*`;
      await sendWhatsAppMessage(sale.phone, msg);
      await sendWhatsAppMessage(senderNum, `✅ Cliente ${sale.phone} re-contactado. Venda #${sale.id} marcada como recuperada.`);
    } else {
      await sendWhatsAppMessage(senderNum, `⚠️ Venda #${saleId || '?'} não encontrada ou já recuperada.`);
    }
    res.status(200).send('OK');
    return true;
  }

  if (command === 'localizacao' && parts[1]) {
    const targetNum = parts[1].replace(/\D/g, '');
    const targetState = clientStates[targetNum];
    const nome = targetState?.clientName || '';
    const msgCliente = (
      `Olá${nome ? ' ' + nome : ''}! 😊\n\n` +
      `Detetámos um acesso à tua conta Netflix fora da localização habitual.\n\n` +
      `*O que deves fazer:*\n` +
      `1️⃣ Abre o Netflix no teu dispositivo\n` +
      `2️⃣ Vai a *Conta → Gerir acesso e dispositivos*\n` +
      `3️⃣ Confirma a tua localização principal\n\n` +
      `Se não conseguires resolver, responde aqui e nós ajudamos! 🙏`
    );
    await sendWhatsAppMessage(targetNum, msgCliente);
    await sendWhatsAppMessage(senderNum, `✅ Mensagem de localização enviada para ${targetNum}${nome ? ' (' + nome + ')' : ''}.`);
    res.status(200).send('OK');
    return true;
  }

  const pinMatch = textMessage.match(/\bpin\b\s*[:\-]?\s*(\d{4,6})\s+(?:para\s+)?(.+)/i);
  if (pinMatch) {
    const novoPin = pinMatch[1];
    const targetNome = pinMatch[2].trim().toLowerCase();
    const rows = await fetchAllRows();
    let updated = false;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const nomePerfil = (row[3] || '').toLowerCase();
      const clienteRaw = (row[6] || '').toLowerCase();
      if (nomePerfil.includes(targetNome) || clienteRaw.split(' - ')[0].includes(targetNome)) {
        await updateSheetCell(i + 1, 'E', novoPin);
        updated = true;
        await sendWhatsAppMessage(senderNum, `✅ PIN ${novoPin} atualizado para "${row[3] || row[6]}" (linha ${i + 1}).`);
        break;
      }
    }
    if (!updated) {
      await sendWhatsAppMessage(senderNum, `⚠️ Perfil "${pinMatch[2].trim()}" não encontrado na Sheet. Verifica o nome.`);
    }
    res.status(200).send('OK');
    return true;
  }

  if (command === 'perdas') {
    const pending = lostSales.filter(s => !s.recovered);
    if (pending.length === 0) {
      await sendWhatsAppMessage(senderNum, '✅ Nenhuma venda perdida pendente.');
    } else {
      const lines = pending.map(s => {
        const date = new Date(s.timestamp);
        const dateStr = `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        return `#${s.id} | ${s.phone}${s.clientName ? ' (' + s.clientName + ')' : ''} | ${s.reason} | ${dateStr}`;
      });
      await sendWhatsAppMessage(senderNum, `📉 *VENDAS PERDIDAS (${pending.length}):*\n\n${lines.join('\n')}\n\nUse *recuperar <ID> <mensagem>* para re-contactar.`);
    }
    res.status(200).send('OK');
    return true;
  }

  let action = null;
  if (['sim', 's', 'ok', 'aprovado'].includes(command)) action = 'approve';
  if (['nao', 'n', 'no', 'rejeitado'].includes(command)) action = 'reject';

  if (action) {
    let targetClient = textMessage.match(/\d{9,}/) ? textMessage.match(/\d{9,}/)[0] : null;

    if (!targetClient && quotedText) {
      const quotedMatch = quotedText.match(/(\d{9,})/);
      if (quotedMatch) {
        targetClient = quotedMatch[1];
        console.log(`🔍 FIX#2: Número extraído da quoted message: ${targetClient}`);
      }
    }

    if (!targetClient) {
      const pendingList = Object.keys(pendingVerifications);
      if (pendingList.length === 1) targetClient = pendingList[0];
      else if (pendingList.length > 1) {
        const pendingDetails = pendingList.map(num => {
          const pv = pendingVerifications[num];
          return `• ${num}${pv.clientName ? ' (' + pv.clientName + ')' : ''}`;
        }).join('\n');
        await sendWhatsAppMessage(senderNum, `⚠️ Tenho ${pendingList.length} pedidos pendentes:\n${pendingDetails}\n\nEspecifique o número ou responda à notificação do cliente.`);
        res.status(200).send('OK');
        return true;
      } else {
        await sendWhatsAppMessage(senderNum, '✅ Nada pendente.');
        res.status(200).send('OK');
        return true;
      }
    }

    const pedido = pendingVerifications[targetClient];
    if (!pedido) {
      await sendWhatsAppMessage(senderNum, `⚠️ Cliente ${targetClient} não encontrado nos pendentes.`);
      res.status(200).send('OK');
      return true;
    }

    if (action === 'approve') {
      await sendWhatsAppMessage(senderNum, '🔄 Aprovado! A processar...');
      await processApproval(targetClient, senderNum);
    } else {
      await processRejection(targetClient, senderNum);
    }
  }

  res.status(200).send('OK');
  return true;
}

module.exports = {
  handleSupervisorCommand,
  isSupervisor,
  processApproval,
  processRejection,
};
