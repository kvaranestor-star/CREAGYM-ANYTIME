// api/_tariff.js — тарифні вікна (мають збігатися з фронтом).
const HOLD = 300; // депозит-блок, ₴  (на час тестів постав 1–2)
const TARIFFS = [
  { id: 'night', name: 'Ніч',  from: 0,  to: 7,  rate: 60 },
  { id: 'day',   name: 'День', from: 7,  to: 18, rate: 80 },
  { id: 'prime', name: 'Прайм',from: 18, to: 24, rate: 120 },
];
function tariffNow(d = new Date()) {
  const h = d.getHours();
  return TARIFFS.find(t => h >= t.from && h < t.to) || TARIFFS[1];
}
module.exports = { HOLD, TARIFFS, tariffNow };
