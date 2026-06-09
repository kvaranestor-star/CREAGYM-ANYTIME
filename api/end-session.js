// api/end-session.js — завершення: finalize фактичної суми, решта holdʼа відпускається.
const { requireClient, dbSelect, dbUpdate, mono } = require('./_lib');
const { HOLD } = require('./_tariff');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const clientId = await requireClient(req);
  if (!clientId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const rows = await dbSelect('sessions', `client_id=eq.${clientId}&ended_at=is.null&order=started_at.desc&limit=1`);
    const s = rows[0];
    if (!s) return res.status(400).json({ error: 'no_session' });

    const minutes = Math.max(1, Math.ceil((Date.now() - new Date(s.started_at).getTime()) / 60000));
    let amount = Math.round((s.rate / 60) * minutes);   // ₴
    if (amount > HOLD) amount = HOLD;                    // не більше депозиту

    // finalize холду на фактичну суму (часткова фіналізація відпускає решту)
    await mono('/invoice/finalize', { body: { invoiceId: s.hold_id, amount: amount * 100 } });

    const upd = await dbUpdate('sessions', `id=eq.${s.id}`, {
      ended_at: new Date().toISOString(), amount, end_reason: 'manual',
    });
    // вихід завжди вільний — замок на вихід не чіпаємо
    return res.status(200).json({ ok: true, minutes, amount });
  } catch (e) {
    console.error('end-session', e.status, e.body || e.message);
    return res.status(502).json({ error: 'finalize_failed' });
  }
};
