// api/admin/login.js — вхід власника. Логін/пароль у Vercel env (не в коді, не в БД).
const crypto = require('crypto');
const { dbInsert } = require('../_lib');

const SESSION_TTL_DAYS = 7;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const { email, password } = req.body || {};
    const okEmail = String(email || '').toLowerCase().trim() === String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const okPass = password && password === process.env.ADMIN_PASSWORD;
    if (!okEmail || !okPass) return res.status(401).json({ error: 'bad_credentials' });

    const token = crypto.randomBytes(32).toString('hex');
    await dbInsert('admin_sessions', {
      token,
      expires_at: new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString(),
    }, 'return=minimal');

    return res.status(200).json({ token });
  } catch (e) {
    console.error('admin/login', e);
    return res.status(500).json({ error: 'server' });
  }
};
