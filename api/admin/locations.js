// api/admin/locations.js — список і редагування локацій + тарифів. Лише за токеном власника.
const { requireAdmin, dbSelect, dbUpdate } = require('../_lib');

const FIELDS = ['name', 'address', 'esp32_url', 'rate_night', 'rate_day', 'rate_prime', 'hold', 'active'];
const NUM = new Set(['rate_night', 'rate_day', 'rate_prime', 'hold']);

module.exports = async (req, res) => {
  if (!(await requireAdmin(req))) return res.status(401).json({ error: 'unauthorized' });
  try {
    if (req.method === 'GET') {
      const locs = await dbSelect('locations', `order=number.asc`);
      return res.status(200).json({ locations: locs });
    }
    if (req.method === 'POST') {
      const { number, ...rest } = req.body || {};
      const num = parseInt(number, 10);
      if (!num) return res.status(400).json({ error: 'no_number' });

      const patch = {};
      for (const k of FIELDS) {
        if (!(k in rest)) continue;
        if (NUM.has(k)) { const v = parseInt(rest[k], 10); if (!isNaN(v)) patch[k] = v; }
        else if (k === 'active') patch[k] = !!rest[k];
        else patch[k] = rest[k];
      }
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing' });

      const upd = await dbUpdate('locations', `number=eq.${num}`, patch);
      return res.status(200).json({ ok: true, location: upd[0] });
    }
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    console.error('admin/locations', e.message);
    return res.status(500).json({ error: 'server' });
  }
};
