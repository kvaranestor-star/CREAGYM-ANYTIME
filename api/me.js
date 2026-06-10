// api/me.js — профіль + локації зі статусом + власна активна сесія. За токеном клієнта.
const { requireClient, dbSelect } = require('./_lib');

module.exports = async (req, res) => {
  const clientId = await requireClient(req);
  if (!clientId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const cs = await dbSelect('clients', `id=eq.${clientId}&limit=1`);
    const c = cs[0];
    if (!c) return res.status(404).json({ error: 'no_client' });

    // усі активні локації + які з них зайняті
    const locs = await dbSelect('locations', `active=eq.true&order=number.asc`);
    const open = await dbSelect('sessions', `ended_at=is.null`);
    const busyByLoc = new Set(open.map(s => s.location_id));

    const locations = locs.map(l => ({
      number: l.number, name: l.name, address: l.address || '',
      busy: busyByLoc.has(l.id),
    }));

    // власна активна сесія
    const mine = open.find(s => s.client_id === clientId) || null;
    let active = null;
    if (mine) {
      const loc = locs.find(l => l.id === mine.location_id);
      active = { startedAt: mine.started_at, rate: mine.rate, tariff: mine.tariff,
                 location: loc ? { number: loc.number, name: loc.name } : null };
    }

    return res.status(200).json({
      client: { id: c.id, name: c.name, phone: c.phone, card_last4: c.card_last4 || null },
      locations, active,
    });
  } catch (e) {
    console.error('me', e.message);
    return res.status(500).json({ error: 'server' });
  }
};
