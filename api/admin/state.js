// api/admin/state.js — живі дані панелі: активна сесія, сесії за сьогодні, виручка.
const { requireAdmin, dbSelect } = require('../_lib');

module.exports = async (req, res) => {
  if (!(await requireAdmin(req))) return res.status(401).json({ error: 'unauthorized' });
  try {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const today = await dbSelect('sessions',
      `started_at=gte.${startOfDay.toISOString()}&order=started_at.desc&limit=200`);

    const open = today.find(s => !s.ended_at) || (await dbSelect('sessions', `ended_at=is.null&limit=1`))[0];

    // підтягнути імена клієнтів
    const ids = [...new Set(today.map(s => s.client_id).filter(Boolean))];
    let names = {};
    if (ids.length) {
      const cs = await dbSelect('clients', `id=in.(${ids.join(',')})&select=id,name`);
      names = Object.fromEntries(cs.map(c => [c.id, c.name]));
    }

    const closed = today.filter(s => s.ended_at);
    const revenue = closed.reduce((a, s) => a + (s.amount || 0), 0);

    const sessions = today.map(s => ({
      time: new Date(s.started_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
      client: names[s.client_id] || 'Клієнт',
      live: !s.ended_at,
      amount: s.amount,
    }));

    return res.status(200).json({
      gymBusy: !!open,
      live: open ? { client: names[open.client_id] || 'Клієнт', startedAt: open.started_at, rate: open.rate, tariff: open.tariff } : null,
      sessions,
      revenueToday: revenue,
      countToday: closed.length,
    });
  } catch (e) {
    console.error('admin/state', e.message);
    return res.status(500).json({ error: 'server' });
  }
};
