// POST /api/web-checkout e POST /api/upload-comprovativo (multer)
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const { findAvailableProfiles, markProfileSold } = require('../../googleSheets');
const { sendWhatsAppMessage } = require('../whatsapp');
const estados = require('../utils/estados');

const { CATALOGO, PLAN_PROFILE_TYPE, MAIN_BOSS } = config;
const { pendingVerifications, clientStates, initClientState } = estados;

const router = express.Router();

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    cb(null, allowed.includes(file.mimetype));
  }
});

router.post('/web-checkout', async (req, res) => {
  try {
    const { nome, whatsapp, plataforma, plano, slots } = req.body;
    const totalSlots = parseInt(slots, 10);
    const pType = PLAN_PROFILE_TYPE[plano.toLowerCase()] || 'shared_profile';

    const profiles = await findAvailableProfiles(plataforma, totalSlots, pType);

    if (!profiles || profiles.length < totalSlots) {
      const availableSlots = profiles ? profiles.length : 0;
      const svcInfo = CATALOGO[plataforma.toLowerCase()] || {};
      const pricePerUnit = svcInfo.planos ? (svcInfo.planos[plano.toLowerCase()] || 0) : 0;
      const valorEmRisco = pricePerUnit * parseInt(slots, 10);
      if (MAIN_BOSS) {
        await sendWhatsAppMessage(MAIN_BOSS, `⚠️ STOCK INSUFICIENTE — Ação necessária\n\n📋 Resumo:\n- Cliente (via site): ${nome} / ${whatsapp}\n- Pedido: ${slots}x ${plano} ${plataforma}\n- Slots necessários: ${totalSlots}\n- Slots disponíveis: ${availableSlots}\n- Valor da venda em risco: ${valorEmRisco.toLocaleString('pt')} Kz\n\n🔧 Opções:\n1. Repor stock → responder "reposto ${whatsapp.replace(/\D/g, '')}"\n2. Cancelar → responder "cancelar ${whatsapp.replace(/\D/g, '')}"`);
      }
      return res.status(400).json({ success: false, message: `Sem stock suficiente. Disponível: ${availableSlots}/${totalSlots}` });
    }

    for (const p of profiles) {
      await markProfileSold(p.rowIndex, nome, whatsapp, 1);
    }

    if (MAIN_BOSS) {
      const alerta = `🚀 *VENDA VIA SITE*\n👤 ${nome}\n📱 ${whatsapp}\n📦 ${plataforma} ${plano}\n🔢 ${totalSlots} slots reservados.`;
      await sendWhatsAppMessage(MAIN_BOSS, alerta);
    }

    res.status(200).json({ success: true, message: 'Pedido registado com sucesso!' });
  } catch (error) {
    console.error('Erro no Web Checkout:', error);
    res.status(500).json({ success: false, message: 'Erro no processamento do pedido.' });
  }
});

router.post('/upload-comprovativo', upload.single('comprovativo'), async (req, res) => {
  try {
    const { nome, whatsapp, plataforma, plano, quantidade, total, email } = req.body;
    const filename = req.file ? req.file.filename : 'sem ficheiro';

    const cleanWa = (whatsapp || '').replace(/\D/g, '');
    if (cleanWa) {
      const serviceKey = (plataforma || '').toLowerCase().includes('netflix') ? 'netflix' : 'prime_video';
      const planLower = (plano || 'individual').toLowerCase();
      const slotsPerUnit = config.PLAN_SLOTS[planLower] || 1;
      const qty = parseInt(quantidade, 10) || 1;
      const totalVal = parseInt(total, 10) || 0;
      const unitPrice = CATALOGO[serviceKey]?.planos[planLower] || Math.round(totalVal / qty);
      const planLabel = planLower.charAt(0).toUpperCase() + planLower.slice(1);

      pendingVerifications[cleanWa] = {
        cart: [{
          serviceKey,
          plataforma: CATALOGO[serviceKey]?.nome || plataforma,
          plan: planLabel,
          price: unitPrice,
          quantity: qty,
          slotsNeeded: slotsPerUnit,
          totalSlots: slotsPerUnit * qty,
          totalPrice: totalVal,
        }],
        clientName: nome || '',
        email: email || null,
        fromWebsite: true,
        isRenewal: false,
        totalValor: totalVal,
        timestamp: Date.now(),
      };
      if (!clientStates[cleanWa]) {
        clientStates[cleanWa] = initClientState({ clientName: nome || '', step: 'esperando_supervisor' });
      }
    }

    const SUPERVISOR = (process.env.SUPERVISOR_NUMBER || '').split(',')[0].trim().replace(/\D/g, '');
    if (SUPERVISOR) {
      const msg = `📎 *COMPROVATIVO VIA SITE*\n👤 ${nome}\n📱 ${whatsapp}\n📦 ${quantidade}x ${plano} ${plataforma}\n💰 Total: ${parseInt(total || 0, 10).toLocaleString('pt')} Kz\n📄 Ficheiro: ${filename}${email ? `\n📧 Email: ${email}` : ''}\n\nResponda: *sim ${cleanWa}* ou *nao ${cleanWa}*`;
      await sendWhatsAppMessage(SUPERVISOR, msg);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro upload comprovativo:', error);
    res.status(500).json({ success: false, message: 'Erro no upload.' });
  }
});

module.exports = router;
