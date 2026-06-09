// api/_lib.js — службовий модуль (префікс _ = не маршрут).
// Доступ до Supabase через PostgREST із service_role. Без зовнішніх залежностей.
// fetch — глобальний у Node 18+ на Vercel.

const base = () => process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/';
const head = () => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
  'Content-Type': 'application/json',
});

async function dbSelect(table, query = '') {
  const r = await fetch(base() + table + '?' + query, { headers: head() });
  if (!r.ok) throw new Error(`select ${table} ${r.status} ${await r.text()}`);
  return r.json();
}

async function dbInsert(table, row, prefer = 'return=representation') {
  const r = await fetch(base() + table, {
    method: 'POST',
    headers: { ...head(), Prefer: prefer },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`insert ${table} ${r.status} ${await r.text()}`);
  return prefer.includes('minimal') ? [] : r.json();
}

async function dbUpdate(table, query, patch) {
  const r = await fetch(base() + table + '?' + query, {
    method: 'PATCH',
    headers: { ...head(), Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`update ${table} ${r.status} ${await r.text()}`);
  return r.json();
}

// upsert по первинному ключу (приймає об'єкт або масив об'єктів)
async function dbUpsert(table, rows, onConflict) {
  const r = await fetch(base() + table + '?on_conflict=' + onConflict, {
    method: 'POST',
    headers: { ...head(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`upsert ${table} ${r.status} ${await r.text()}`);
  return true;
}

// читання одного налаштування з таблиці settings
async function getSetting(key) {
  const rows = await dbSelect('settings', `key=eq.${key}&limit=1`);
  return rows[0] ? rows[0].value : null;
}

// перевірка токена власника (заголовок Authorization: Bearer ... або x-admin-token)
async function requireAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-admin-token'] || '');
  if (!token) return false;
  try {
    const rows = await dbSelect('admin_sessions', `token=eq.${token}&limit=1`);
    const s = rows[0];
    return !!s && new Date(s.expires_at) > new Date();
  } catch (e) {
    return false;
  }
}

const crypto = require('crypto');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// --- паролі (scrypt, без зовнішніх залежностей) ---
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const dk = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return salt + ':' + dk;
}
function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, dk] = stored.split(':');
  const test = crypto.scryptSync(String(pw), salt, 32);
  const a = Buffer.from(dk, 'hex');
  return a.length === test.length && crypto.timingSafeEqual(a, test);
}

// видати клієнту токен сесії (зберігається в браузері)
async function issueClientSession(clientId, ttlDays = 90) {
  const token = crypto.randomBytes(32).toString('hex');
  await dbInsert('app_sessions', {
    token,
    client_id: clientId,
    expires_at: new Date(Date.now() + ttlDays * 86400000).toISOString(),
  }, 'return=minimal');
  return token;
}

// +380XXXXXXXXX → нормалізований 12-значний рядок або null
function normalizePhone(x) {
  const d = String(x || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('380')) return d;
  if (d.length === 10 && d.startsWith('0')) return '38' + d;
  if (d.length === 9) return '380' + d;
  return null;
}

// перевірка токена клієнта → повертає client_id або null
async function requireClient(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-session-token'] || '');
  if (!token) return null;
  try {
    const rows = await dbSelect('app_sessions', `token=eq.${token}&limit=1`);
    const s = rows[0];
    if (!s || new Date(s.expires_at) < new Date()) return null;
    return s.client_id;
  } catch (e) {
    return null;
  }
}

// --- Monobank Acquiring API ---
async function mono(path, { method = 'POST', body = null } = {}) {
  const token = (await getSetting('monobank_token')) || process.env.MONOBANK_TOKEN;
  if (!token) throw new Error('monobank_not_configured');
  const r = await fetch('https://api.monobank.ua/api/merchant' + path, {
    method,
    headers: { 'X-Token': token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('mono ' + path + ' ' + r.status); e.status = r.status; e.body = j; throw e; }
  return j;
}

module.exports = { dbSelect, dbInsert, dbUpdate, dbUpsert, getSetting, requireAdmin, requireClient, issueClientSession, hashPassword, verifyPassword, mono, sha256, normalizePhone };
