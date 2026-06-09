// api/verify-otp.js — крок 2: перевірити код, створити/знайти клієнта, видати токен сесії.
const crypto = require('crypto');
const { dbSelect, dbInsert, dbUpdate, sha256, normalizePhone } = require('./_lib');

const MAX_ATTEMPTS = 5;
const SESSION_TTL_DAYS = 90;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const { phone, code } = req.body || {};
    const p = normalizePhone(phone);
    if (!p || !/^\d{4}$/.test(code || '')) return res.status(400).json({ error: 'bad_input' });

    const rows = await dbSelect('otp_codes', `phone=eq.${p}&used=eq.false&order=created_at.desc&limit=1`);
    const otp = rows[0];
    if (!otp) return res.status(400).json({ error: 'no_code' });
    if (new Date(otp.expires_at) < new Date()) return res.status(400).json({ error: 'expired' });
    if (otp.attempts >= MAX_ATTEMPTS) return res.status(429).json({ error: 'too_many' });

    if (otp.code_hash !== sha256(p + ':' + code)) {
      await dbUpdate('otp_codes', `id=eq.${otp.id}`, { attempts: otp.attempts + 1 });
      return res.status(400).json({ error: 'wrong_code' });
    }
    await dbUpdate('otp_codes', `id=eq.${otp.id}`, { used: true });

    // знайти або створити клієнта за телефоном
    let found = await dbSelect('clients', `phone=eq.${p}&limit=1`);
    let client = found[0];
    if (!client) {
      const created = await dbInsert('clients', { phone: p, name: otp.name || 'Клієнт' });
      client = created[0];
    }

    // opaque-токен сесії для браузера
    const token = crypto.randomBytes(32).toString('hex');
    await dbInsert('app_sessions', {
      token,
      client_id: client.id,
      expires_at: new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString(),
    }, 'return=minimal');

    return res.status(200).json({
      token,
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        card_last4: client.card_last4 || null,
      },
    });
  } catch (e) {
    console.error('verify-otp', e);
    return res.status(500).json({ error: 'server' });
  }
};
