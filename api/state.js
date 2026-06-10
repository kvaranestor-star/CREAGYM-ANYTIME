// api/admin/state.js — живі дані по всіх локаціях.
const { requireAdmin, dbSelect } = require('../_lib');

module.exports = async (req, res) => {
  if (!(await requireAdmin(req))) return res.status(401).json({ error: 'unauthorized' });
  try {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const [locs, today, openAll] = await Promise.all([
      dbSelect('locations', `order=number.asc`),
      dbSelect('sessions', `started_at=gte.${startOfDay.toISOString()}&order=started_at.desc&limit=300`),
      dbSelect('sessions', `ended_at=is.null`),
    ]);

    const locById = Object.fromEntries(locs.map(l => [l.id, l]));

    // імена клієнтів
    const ids = [...new Set(today.map(s => s.client_id).filter(Boolean))];
    let names = {};
    if (ids.length) {
      const cs = await dbSelect('clients', `id=in.(${ids.join(',')})&select=id,name`);
      names = Object.fromEntries(cs.map(c => [c.id, c.name]));
    }

    const openByLoc = {};
    openAll.forEach(s => { openByLoc[s.location_id] = s; });

    // статус кожної локації
    const locations = locs.map(l => {
      const o = openByLoc[l.id];
      const todays = today.filter(s => s.location_id === l.id);
      const closed = todays.filter(s => s.ended_at);
      return {
        number: l.number, name: l.name, address: l.address || '', active: l.active,
        busy: !!o,
        live: o ? { client: names[o.client_id] || 'Клієнт', startedAt: o.started_at, rate: o.rate, tariff: o.tariff } : null,
        revenueToday: closed.reduce((a, s) => a + (s.amount || 0), 0),
        countToday: closed.length,
      };
    });

    const closedAll = today.filter(s => s.ended_at);
    const sessions = today.map(s => ({
      time: new Date(s.started_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
      client: names[s.client_id] || 'Клієнт',
      loc: locById[s.location_id] ? ('№' + locById[s.location_id].number) : '—',
      live: !s.ended_at,
      amount: s.amount,
    }));

    return res.status(200).json({
      locations,
      busyCount: openAll.length,
      sessions,
      revenueToday: closedAll.reduce((a, s) => a + (s.amount || 0), 0),
      countToday: closedAll.length,
    });
  } catch (e) {
    console.error('admin/state', e.message);
    return res.status(500).json({ error: 'server' });
  }
};
