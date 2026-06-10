// api/start-session.js — старт у конкретній локації; тариф і депозит — локації.
const { requireClient, dbSelect, dbInsert, mono } = require('./_lib');
const { tariffForLocation, DEFAULT_HOLD } = require('./_tariff');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const clientId = await requireClient(req);
  if (!clientId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const num = parseInt((req.body || {}).location, 10);
    if (!num) return res.status(400).json({ error: 'no_location' });

    const ls = await dbSelect('locations', `number=eq.${num}&active=eq.true&limit=1`);
    const loc = ls[0];
    if (!loc) return res.status(404).json({ error: 'bad_location' });

    const cs = await dbSelect('clients', `id=eq.${clientId}&limit=1`);
    const client = cs[0];
    if (!client || !client.card_token) return res.status(409).json({ error: 'no_card' });

    const open = await dbSelect('sessions', `location_id=eq.${loc.id}&ended_at=is.null&limit=1`);
    if (open[0]) return res.status(409).json({ error: 'busy' });

    const t = tariffForLocation(loc);
    const hold = loc.hold || DEFAULT_HOLD;

    const pay = await mono('/wallet/payment', { body: {
      cardToken: client.card_token,
      amount: hold * 100, ccy: 980,
      merchantPaymInfo: { reference: 'session:' + clientId + ':' + Date.now(), destination: 'Депозит · ' + loc.name },
      initiationKind: 'merchant', paymentType: 'hold',
    }});

    const row = await dbInsert('sessions', {
      client_id: clientId, location_id: loc.id,
      started_at: new Date().toISOString(),
      tariff: t.id, rate: t.rate, hold, hold_id: pay.invoiceId,
    });

    // TODO ESP32: POST {loc.esp32_url}/unlock
    return res.status(200).json({ ok: true, rate: t.rate, hold, startedAt: row[0]?.started_at,
      location: { number: loc.number, name: loc.name } });
  } catch (e) {
    console.error('start-session', e.status, e.body || e.message);
    return res.status(502).json({ error: 'charge_failed' });
  }
};
