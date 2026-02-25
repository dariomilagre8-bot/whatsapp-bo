// Rotas públicas: stock-public, planos-disponiveis, notify-me, waitlist
const express = require('express');
const { hasAnyStock, countAvailableProfiles } = require('../../googleSheets');
const { sendWhatsAppMessage } = require('../whatsapp');

const router = express.Router();

const stockWaitlist = {}; // { 'Netflix': Set<phone>, 'Prime Video': Set<phone> }

router.get('/stock-public', async (req, res) => {
  try {
    const [nfOk, pvOk] = await Promise.all([hasAnyStock('Netflix'), hasAnyStock('Prime Video')]);
    res.json({ netflix: nfOk, prime_video: pvOk });
  } catch (e) {
    res.json({ netflix: true, prime_video: true });
  }
});

router.get('/planos-disponiveis', async (req, res) => {
  try {
    const [nfFull, nfShared, pvFull, pvShared] = await Promise.all([
      countAvailableProfiles('Netflix', 'full_account'),
      countAvailableProfiles('Netflix', 'shared_profile'),
      countAvailableProfiles('Prime Video', 'full_account'),
      countAvailableProfiles('Prime Video', 'shared_profile'),
    ]);
    const nfSlots = (nfFull || 0) + (nfShared || 0);
    const pvSlots = (pvFull || 0) + (pvShared || 0);
    res.json({
      netflix: {
        disponivel: nfSlots > 0,
        slots: nfSlots,
        planos: nfSlots > 0 ? ['Individual', 'Partilha', 'Família'] : [],
      },
      prime: {
        disponivel: pvSlots > 0,
        slots: pvSlots,
        planos: pvSlots > 0 ? ['Individual', 'Partilha', 'Família'] : [],
      },
    });
  } catch (e) {
    console.error('Erro /api/planos-disponiveis:', e.message);
    res.json({
      netflix: { disponivel: true, slots: -1, planos: ['Individual', 'Partilha', 'Família'] },
      prime: { disponivel: true, slots: -1, planos: ['Individual', 'Partilha', 'Família'] },
    });
  }
});

router.post('/notify-me', async (req, res) => {
  try {
    const { phone, service } = req.body;
    if (!phone || !service) return res.status(400).json({ error: 'phone e service obrigatórios' });
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 9) return res.status(400).json({ error: 'Número inválido' });
    const svc = service.trim();
    if (!stockWaitlist[svc]) stockWaitlist[svc] = new Set();
    stockWaitlist[svc].add(cleanPhone);
    console.log(`🔔 Waitlist ${svc}: +${cleanPhone} adicionado (total: ${stockWaitlist[svc].size})`);
    const msg = `🔔 *Aviso de Stock*\n\nCliente *+${cleanPhone}* quer ser notificado quando *${svc}* tiver stock.\n\nTotal na fila: ${stockWaitlist[svc].size} pessoa(s).`;
    await sendWhatsAppMessage(process.env.SUPERVISOR_NUMBER || process.env.BOSS_NUMBER, msg).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    console.error('Erro /api/notify-me:', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/waitlist', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  const adminSecret = process.env.ADMIN_SECRET || 'streamzone2026';
  if (!secret || secret !== adminSecret) return res.status(401).json({ error: 'Unauthorized' });
  const result = {};
  for (const [svc, phones] of Object.entries(stockWaitlist)) {
    result[svc] = Array.from(phones);
  }
  res.json({ waitlist: result });
});

module.exports = router;
module.exports.stockWaitlist = stockWaitlist;
