// api/attach-card.js — прив'язка картки через сторінку Monobank (токенізація).
// Клієнт вводить картку на стороні банку (PCI-safe). Ми отримуємо лише токен + last4.
const { requireClient, mono } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const clientId = await requireClient(req);
  if (!clientId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const base = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
    const inv = await mono('/invoice/create', { body: {
      amount: 100, ccy: 980,                       // 1 грн hold для верифікації, потім скасуємо
      merchantPaymInfo: { reference: 'card:' + clientId, destination: "Прив'язка картки" },
      redirectUrl: base + '/?card=done',
      webHookUrl: base + '/api/mono-webhook',
      validity: 3600,
      paymentType: 'hold',
      saveCardData: { saveCard: true, walletId: clientId }, // walletId = id клієнта
    }});
    return res.status(200).json({ pageUrl: inv.pageUrl, invoiceId: inv.invoiceId });
  } catch (e) {
    console.error('attach-card', e.status, e.body || e.message);
    return res.status(502).json({ error: 'mono_failed' });
  }
};
