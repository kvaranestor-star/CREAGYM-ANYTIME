// api/start-session.js — старт тренування: hold депозиту на збереженій картці + запис сесії.
const { requireClient, dbSelect, dbInsert, mono } = require('./_lib');
const { HOLD, tariffNow } = require('./_tariff');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const clientId = await requireClient(req);
  if (!clientId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const cs = await dbSelect('clients', `id=eq.${clientId}&limit=1`);
    const client = cs[0];
    if (!client || !client.card_token) return res.status(409).json({ error: 'no_card' });

    // зал вільний?
    const open = await dbSelect('sessions', `ended_at=is.null&limit=1`);
    if (open[0]) return res.status(409).json({ error: 'busy' });

    const t = tariffNow();

    // hold депозиту на збереженій картці (без участі клієнта)
    const pay = await mono('/wallet/payment', { body: {
      cardToken: client.card_token,
      amount: HOLD * 100, ccy: 980,
      merchantPaymInfo: { reference: 'session:' + clientId + ':' + Date.now(), destination: 'Депозит за зал' },
      initiationKind: 'merchant',
      paymentType: 'hold',
    }});

    const row = await dbInsert('sessions', {
      client_id: clientId,
      started_at: new Date().toISOString(),
      tariff: t.id, rate: t.rate,
      hold_id: pay.invoiceId,
    });

    // TODO ESP32: POST {ESP32_URL}/unlock — відкрити вхідний замок
    return res.status(200).json({ ok: true, sessionId: row[0]?.id, rate: t.rate, startedAt: row[0]?.started_at });
  } catch (e) {
    console.error('start-session', e.status, e.body || e.message);
    return res.status(502).json({ error: 'charge_failed' });
  }
};
