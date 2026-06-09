// api/verify-otp.js — перевірити код.
// purpose 'register' → створити клієнта з паролем; 'reset' → встановити новий пароль.
const { dbSelect, dbInsert, dbUpdate, issueClientSession, hashPassword, sha256, normalizePhone } = require('./_lib');

const MAX_ATTEMPTS = 5;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const { phone, code, password } = req.body || {};
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

    let client;
    if (otp.purpose === 'reset') {
      if (!password || String(password).length < 6) return res.status(400).json({ error: 'bad_password' });
      const found = await dbSelect('clients', `phone=eq.${p}&limit=1`);
      if (!found[0]) return res.status(404).json({ error: 'no_account' });
      const upd = await dbUpdate('clients', `id=eq.${p ? found[0].id : ''}`, { password_hash: hashPassword(password) });
      client = upd[0];
    } else {
      // register
      const data = otp.payload ? JSON.parse(otp.payload) : {};
      const found = await dbSelect('clients', `phone=eq.${p}&limit=1`);
      if (found[0]) {
        const upd = await dbUpdate('clients', `id=eq.${found[0].id}`, {
          name: data.name || found[0].name,
          password_hash: data.password_hash || found[0].password_hash,
        });
        client = upd[0];
      } else {
        const created = await dbInsert('clients', {
          phone: p, name: data.name || 'Клієнт', password_hash: data.password_hash || null,
        });
        client = created[0];
      }
    }

    const token = await issueClientSession(client.id);
    return res.status(200).json({
      token,
      client: { id: client.id, name: client.name, phone: client.phone, card_last4: client.card_last4 || null },
    });
  } catch (e) {
    console.error('verify-otp', e);
    return res.status(500).json({ error: 'server' });
  }
};
