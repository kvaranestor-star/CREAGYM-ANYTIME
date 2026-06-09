// api/admin/settings.js — читання/запис інтеграцій. Лише за токеном власника.
// Секрети (токени) НІКОЛИ не повертаються у браузер — лише прапорець "збережено".
const { dbSelect, dbUpsert, requireAdmin } = require('../_lib');

const ALL_KEYS = ['turbosms_token', 'turbosms_sender', 'monobank_token', 'esp32_url'];
const SECRET_KEYS = ['turbosms_token', 'monobank_token'];

module.exports = async (req, res) => {
  if (!(await requireAdmin(req))) return res.status(401).json({ error: 'unauthorized' });
  try {
    if (req.method === 'GET') {
      const rows = await dbSelect('settings', `key=in.(${ALL_KEYS.join(',')})`);
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      const out = {};
      for (const k of ALL_KEYS) {
        out[k] = SECRET_KEYS.includes(k)
          ? { set: !!(map[k] && map[k].length) }   // секрет назовні не віддаємо
          : (map[k] || '');
      }
      return res.status(200).json(out);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const updates = [];
      for (const k of ALL_KEYS) {
        if (!(k in body)) continue;
        const v = body[k];
        // порожнє значення секрету = не змінювати (щоб не затерти збережений токен)
        if (SECRET_KEYS.includes(k) && (v == null || v === '')) continue;
        updates.push({ key: k, value: String(v), updated_at: new Date().toISOString() });
      }
      if (updates.length) await dbUpsert('settings', updates, 'key');
      return res.status(200).json({ ok: true, saved: updates.map((u) => u.key) });
    }

    return res.status(405).json({ error: 'method' });
  } catch (e) {
    console.error('admin/settings', e);
    return res.status(500).json({ error: 'server' });
  }
};
