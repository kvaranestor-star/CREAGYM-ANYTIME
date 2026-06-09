// api/attach-card.js — прив'язка картки. Доступ ЛИШЕ за токеном самого клієнта.
// Картка зберігається в його власному рядку clients і нікому, крім нього, не віддається.
// Власник у панелі картку клієнта НЕ бачить (card_token взагалі ніколи не повертається назовні).
const { requireClient, dbUpdate } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  const clientId = await requireClient(req);
  if (!clientId) return res.status(401).json({ error: 'unauthorized' }); // не клієнт — нічого не робимо

  try {
    // TODO Monobank: тут ініціюється токенізація картки через acquiring.
    // Реальний потік: клієнт вводить картку на сторінці Monobank → callback повертає
    // card_token + маскований номер на сервер. card_token пишемо у clients.card_token (приватно).
    // Поки що демонстраційно фіксуємо лише останні 4 цифри для показу клієнту.
    const { card_last4 } = req.body || {};
    const last4 = /^\d{4}$/.test(card_last4 || '') ? card_last4 : '4242';

    const rows = await dbUpdate('clients', `id=eq.${clientId}`, { card_last4: last4 });
    const c = rows[0];
    return res.status(200).json({ card_last4: c ? c.card_last4 : last4 });
  } catch (e) {
    console.error('attach-card', e);
    return res.status(500).json({ error: 'server' });
  }
};
