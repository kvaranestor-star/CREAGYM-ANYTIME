// api/send-otp.js — надіслати код через TurboSMS.
// purpose: 'register' (потрібні name+password) | 'reset' (акаунт має існувати).
const { dbSelect, dbInsert, getSetting, sha256, normalizePhone, hashPassword } = require('./_lib');

const OTP_TTL_MIN = 5;
const RESEND_COOLDOWN_S = 60; // не частіше разу на хвилину на номер (антидудос)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const { phone, name, password, purpose = 'register' } = req.body || {};
    const p = normalizePhone(phone);
    if (!p) return res.status(400).json({ error: 'bad_phone' });

    // антидудос: один код на хвилину
    const recent = await dbSelect('otp_codes', `phone=eq.${p}&order=created_at.desc&limit=1`);
    if (recent[0]) {
      const passed = Date.now() - new Date(recent[0].created_at).getTime();
      if (passed < RESEND_COOLDOWN_S * 1000) {
        return res.status(429).json({ error: 'cooldown', wait: Math.ceil((RESEND_COOLDOWN_S * 1000 - passed) / 1000) });
      }
    }

    const existing = await dbSelect('clients', `phone=eq.${p}&limit=1`);

    let payload = null;
    if (purpose === 'register') {
      if (existing[0] && existing[0].password_hash) return res.status(409).json({ error: 'already_registered' });
      if (!name || !password || String(password).length < 6) return res.status(400).json({ error: 'bad_input' });
      payload = JSON.stringify({ name, password_hash: hashPassword(password) });
    } else if (purpose === 'reset') {
      if (!existing[0]) return res.status(404).json({ error: 'no_account' });
    } else {
      return res.status(400).json({ error: 'bad_purpose' });
    }

    const code = String(Math.floor(1000 + Math.random() * 9000));
    await dbInsert('otp_codes', {
      phone: p,
      code_hash: sha256(p + ':' + code),
      purpose,
      payload,
      name: name || null,
      expires_at: new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString(),
    }, 'return=minimal');

    const sms = await sendSms(p, `${code} — код підтвердження. Діє ${OTP_TTL_MIN} хв.`);
    if (!sms.ok) return res.status(502).json({ error: 'sms_failed' });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send-otp', e);
    return res.status(500).json({ error: 'server' });
  }
};

// --- TurboSMS REST. Токен/sender — із налаштувань панелі (env як запасний) ---
async function sendSms(phone, text) {
  try {
    const token = (await getSetting('turbosms_token')) || process.env.TURBOSMS_TOKEN;
    const sender = (await getSetting('turbosms_sender')) || process.env.TURBOSMS_SENDER;
    if (!token || !sender) { console.error('turbosms not configured'); return { ok: false }; }
    const r = await fetch('https://api.turbosms.ua/message/send.json', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: [phone], sms: { sender, text } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('turbosms http', r.status, j); return { ok: false }; }
    const code = j.response_code ?? (j.response_result?.[0]?.response_code);
    return { ok: code === 0 || code === undefined, raw: j };
  } catch (e) {
    console.error('turbosms fetch', e);
    return { ok: false };
  }
}
