// api/_tariff.js — вікна доби спільні, ставки беруться з локації.
const WINDOWS = [
  { id: 'night', name: 'Ніч',   from: 0,  to: 7,  field: 'rate_night' },
  { id: 'day',   name: 'День',  from: 7,  to: 18, field: 'rate_day' },
  { id: 'prime', name: 'Прайм', from: 18, to: 24, field: 'rate_prime' },
];
const DEFAULT_HOLD = 300;

// поточне вікно + ставка для конкретної локації
function tariffForLocation(loc, d = new Date()) {
  const h = d.getHours();
  const w = WINDOWS.find(x => h >= x.from && h < x.to) || WINDOWS[1];
  return { id: w.id, name: w.name, rate: (loc && loc[w.field]) || 80 };
}
module.exports = { WINDOWS, DEFAULT_HOLD, tariffForLocation };
