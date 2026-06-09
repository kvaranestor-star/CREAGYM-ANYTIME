// api/login.js — вхід клієнта за телефоном і паролем. БЕЗ SMS (щоб не платити за кожен вхід).
const { dbSelect, issueClientSession, verifyPassword, normalizePhone } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const { phone, password } = req.body || {};
    const p = normalizePhone(phone);
    if (!p || !password) return res.status(400).json({ error: 'bad_input' });

    const rows = await dbSelect('clients', `phone=eq.${p}&limit=1`);
    const client = rows[0];
    if (!client || !client.password_hash || !verifyPassword(password, client.password_hash)) {
      return res.status(401).json({ error: 'bad_credentials' }); // не кажемо, що саме не так
    }

    const token = await issueClientSession(client.id);
    return res.status(200).json({
      token,
      client: { id: client.id, name: client.name, phone: client.phone, card_last4: client.card_last4 || null },
    });
  } catch (e) {
    console.error('login', e);
    return res.status(500).json({ error: 'server' });
  }
};
