// api/mono-webhook.js — пінг від Monobank. Не довіряємо тілу: перепитуємо статус за токеном.
const { mono, dbSelect, dbUpdate } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });
  try {
    const invoiceId = (req.body && req.body.invoiceId) || '';
    if (!invoiceId) return res.status(200).json({ ok: true });

    const st = await mono('/invoice/status?invoiceId=' + encodeURIComponent(invoiceId), { method: 'GET' });
    const ref = st.reference || '';

    // прив'язка картки
    if (ref.startsWith('card:') && (st.status === 'success' || st.status === 'hold')) {
      const clientId = ref.slice(5);
      try {
        const w = await mono('/wallet?walletId=' + encodeURIComponent(clientId), { method: 'GET' });
        const card = (w.wallet || [])[0];
        if (card) {
          const last4 = (card.maskedPan || '').slice(-4) || null;
          await dbUpdate('clients', `id=eq.${clientId}`, { card_token: card.cardToken, card_last4: last4 });
        }
        // скасувати верифікаційний hold (1 грн), щоб клієнта не списало
        if (st.status === 'hold') await mono('/invoice/cancel', { body: { invoiceId } }).catch(() => {});
      } catch (e) { console.error('wallet fetch', e.message); }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('mono-webhook', e.message);
    return res.status(200).json({ ok: true }); // завжди 200, щоб Monobank не ретраїв безкінечно
  }
};
