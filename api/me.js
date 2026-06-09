// api/me.js — профіль клієнта + статус залу + власна активна сесія. За токеном клієнта.
const { requireClient, dbSelect } = require('./_lib');

module.exports = async (req, res) => {
  const clientId = await requireClient(req);
  if (!clientId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const cs = await dbSelect('clients', `id=eq.${clientId}&limit=1`);
    const c = cs[0];
    if (!c) return res.status(404).json({ error: 'no_client' });

    const open = await dbSelect('sessions', `ended_at=is.null&limit=1`);
    const busy = !!open[0];
    const mine = open[0] && open[0].client_id === clientId ? open[0] : null;

    return res.status(200).json({
      client: { id: c.id, name: c.name, phone: c.phone, card_last4: c.card_last4 || null },
      gymBusy: busy,
      active: mine ? { startedAt: mine.started_at, rate: mine.rate, tariff: mine.tariff } : null,
    });
  } catch (e) {
    console.error('me', e.message);
    return res.status(500).json({ error: 'server' });
  }
};
