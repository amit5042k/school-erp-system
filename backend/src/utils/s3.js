// Minimal S3-compatible upload (AWS S3, Cloudflare R2, Backblaze B2, Wasabi, MinIO) using Signature V4.
const crypto = require('crypto');

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
// RFC 3986 encoding per path segment, as S3 requires.
const encodePath = (p) => p.split('/').map(seg => encodeURIComponent(seg).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

/**
 * Signature V4 Authorization header for a request.
 * headers: lower-case names → values (must include host, x-amz-date, x-amz-content-sha256).
 */
function signV4({ method, path, query = '', headers, payloadHash, region, accessKey, secretKey, service = 's3' }) {
  const amzDate = headers['x-amz-date'];
  const date = amzDate.slice(0, 8);
  const names = Object.keys(headers).map(h => h.toLowerCase()).sort();
  const canonicalHeaders = names.map(h => `${h}:${String(headers[h]).trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + secretKey, date), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/** Config from env, or null when off-site backup isn't set up. */
function config() {
  const { BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY } = process.env;
  if (!BACKUP_S3_ENDPOINT || !BACKUP_S3_BUCKET || !BACKUP_S3_ACCESS_KEY || !BACKUP_S3_SECRET_KEY) return null;
  return {
    endpoint: BACKUP_S3_ENDPOINT.replace(/\/+$/, ''), bucket: BACKUP_S3_BUCKET,
    accessKey: BACKUP_S3_ACCESS_KEY, secretKey: BACKUP_S3_SECRET_KEY,
    region: process.env.BACKUP_S3_REGION || 'auto', prefix: (process.env.BACKUP_S3_PREFIX || 'school-erp/').replace(/^\/+/, ''),
  };
}

/** Upload a buffer as <prefix><name> (path-style URL, which every S3-compatible service accepts). */
async function putObject(name, body, contentType = 'application/octet-stream', cfg = config()) {
  if (!cfg) throw new Error('Off-site backup is not configured');
  const url = new URL(cfg.endpoint);
  const path = encodePath(`/${cfg.bucket}/${cfg.prefix}${name}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const payloadHash = sha256(body);
  const headers = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, 'content-type': contentType };
  const authorization = signV4({ method: 'PUT', path, headers, payloadHash, region: cfg.region, accessKey: cfg.accessKey, secretKey: cfg.secretKey });
  const res = await fetch(`${url.origin}${url.pathname.replace(/\/+$/, '')}${path}`, {
    method: 'PUT', headers: { ...headers, Authorization: authorization }, body,
  });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return `${cfg.bucket}/${cfg.prefix}${name}`;
}

module.exports = { signV4, putObject, config, sha256 };
