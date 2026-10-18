// Calendar date in the school's timezone (TZ env, default Asia/Kolkata), not UTC.
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Turn SQLite constraint errors into messages a user can act on, without leaking SQL.
function dbError(res, e) {
  const msg = String(e && e.message || '');
  if (msg.includes('UNIQUE')) return res.status(409).json({ error: 'A record with these details already exists' });
  if (msg.includes('FOREIGN KEY')) return res.status(409).json({ error: 'This record is linked to other data (or refers to a record that does not exist)' });
  if (msg.includes('CHECK') || msg.includes('NOT NULL')) return res.status(400).json({ error: 'One or more fields have an invalid or missing value' });
  throw e;
}

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
// Links shown as <a href>; anything but http(s) (e.g. javascript:) could run script in the viewer's browser.
const badUrl = (v, label = 'link') => (v && !/^https?:\/\//i.test(String(v)) ? `${label} must start with http:// or https://` : null);
const num = (v) => (v === '' || v == null ? NaN : Number(v));

module.exports = { today, dbError, isDate, num, badUrl };
