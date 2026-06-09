// api/send-otp.js — крок 1 реєстрації/входу: надіслати код через TurboSMS.
const { dbSelect, dbInsert, getSetting, sha256, normalizePhone } = require('./_lib');

const OTP_TTL_MIN = 5;        // термін дії коду
const RESEND_COOLDOWN_S = 30; // не частіше разу на 30 с

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const { phone, name } = req.body || {};
    const p = normalizePhone(phone);
    if (!p) return res.status(400).json({ error: 'bad_phone' });

    // антиспам: перевірити останній код
    const recent = await dbSelect('otp_codes', `phone=eq.${p}&order=created_at.desc&limit=1`);
    if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < RESEND_COOLDOWN_S * 1000) {
      return res.status(429).json({ error: 'cooldown' });
    }

    const code = String(Math.floor(1000 + Math.random() * 9000)); // 4 цифри
    const expires_at = new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString();
    await dbInsert('otp_codes', {
      phone: p,
      code_hash: sha256(p + ':' + code),
      name: name || null,
      expires_at,
    }, 'return=minimal');

    const sms = await sendSms(p, `${code} — код підтвердження. Діє ${OTP_TTL_MIN} хв.`);
    if (!sms.ok) return res.status(502).json({ error: 'sms_failed' });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send-otp', e);
    return res.status(500).json({ error: 'server' });
  }
};

// --- TurboSMS REST: POST https://api.turbosms.ua/message/send.json ---
// Токен і sender беремо з налаштувань у БД (панель власника), env — як запасний варіант.
async function sendSms(phone, text) {
  try {
    const token = (await getSetting('turbosms_token')) || process.env.TURBOSMS_TOKEN;
    const sender = (await getSetting('turbosms_sender')) || process.env.TURBOSMS_SENDER;
    if (!token || !sender) { console.error('turbosms not configured'); return { ok: false }; }
    const r = await fetch('https://api.turbosms.ua/message/send.json', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipients: [phone],
        sms: { sender, text },
      }),
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
