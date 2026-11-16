// Online database + login for the hosted app (Railway). Only active when DATABASE_URL is set;
// without it the API answers 404 and the browser app keeps working from localStorage alone.
//
// Data model: the app's state is a handful of JSON collections (the same asm_* keys it keeps in
// localStorage). Each is stored as one row with a version number; a write must name the version it
// was based on, so two devices editing at once get a conflict instead of silently overwriting.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scrypt = promisify(scryptCb);

const SESSION_COOKIE = 'fs_session';
const SESSION_DAYS = 30;
const MAX_BODY = 25 * 1024 * 1024;
const DATA_KEY = /^asm_[a-z0-9_]{1,40}$/;
const USERNAME = /^[A-Za-z0-9._@-]{3,40}$/;
const MIN_PASSWORD = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

let pool = null;

export async function initApi() {
  if (!process.env.DATABASE_URL) return false;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash    TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_data (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      version    INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  return true;
}

// ── Passwords & sessions ─────────────────────────────────────────────────────

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

// The cookie carries a random token; only its hash is stored, so a database leak can't be used
// to hijack sessions.
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [sha256(token), userId],
  );
  return token;
}

function cookieHeader(req, token, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readCookie(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

async function currentUser(req) {
  const token = readCookie(req);
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] || null;
}

// ── Brute-force protection (per client IP, in memory) ────────────────────────

const failures = new Map(); // ip -> { count, since }

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function tooManyFailures(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.since > LOGIN_WINDOW_MS) return false;
  return f.count >= LOGIN_MAX_FAILURES;
}

function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.since > LOGIN_WINDOW_MS) failures.set(ip, { count: 1, since: Date.now() });
  else f.count++;
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function send(res, code, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 });
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

async function session(req, res) {
  const user = await currentUser(req);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  send(res, 200, { mode: 'online', authenticated: !!user, user: user && { username: user.username }, needsSetup: rows[0].n === 0 });
}

// Creating the first (owner) account needs SETUP_CODE from the Railway variables, so nobody who
// merely finds the URL can claim the site before the owner does.
async function setup(req, res) {
  const ip = clientIp(req);
  if (tooManyFailures(ip)) return send(res, 429, { error: 'too_many_attempts' });
  const { setupCode, username, password } = await readJson(req);
  if (!process.env.SETUP_CODE || !sameSecret(String(setupCode || '').trim(), process.env.SETUP_CODE)) {
    recordFailure(ip);
    return send(res, 403, { error: 'bad_setup_code' });
  }
  if (!USERNAME.test(username || '')) return send(res, 400, { error: 'bad_username' });
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return send(res, 400, { error: 'weak_password' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const { rows } = await client.query('SELECT count(*)::int AS n FROM users');
    if (rows[0].n > 0) {
      await client.query('ROLLBACK');
      return send(res, 409, { error: 'already_set_up' });
    }
    const ins = await client.query('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
      [username, await hashPassword(password)]);
    await client.query('COMMIT');
    const token = await createSession(ins.rows[0].id);
    send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, token, SESSION_DAYS * 86400) });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function login(req, res) {
  const ip = clientIp(req);
  if (tooManyFailures(ip)) return send(res, 429, { error: 'too_many_attempts' });
  const { username, password } = await readJson(req);
  const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE username = $1', [String(username || '')]);
  const ok = rows[0] && typeof password === 'string' && await verifyPassword(password, rows[0].password_hash);
  if (!ok) {
    recordFailure(ip);
    return send(res, 401, { error: 'bad_credentials' });
  }
  failures.delete(ip);
  const token = await createSession(rows[0].id);
  send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, token, SESSION_DAYS * 86400) });
}

async function logout(req, res) {
  const token = readCookie(req);
  if (token) await pool.query('DELETE FROM sessions WHERE id_hash = $1', [sha256(token)]);
  send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, '', 0) });
}

async function changePassword(req, res, user) {
  const { currentPassword, newPassword } = await readJson(req);
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  if (!(await verifyPassword(String(currentPassword || ''), rows[0].password_hash))) return send(res, 403, { error: 'bad_credentials' });
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD) return send(res, 400, { error: 'weak_password' });
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(newPassword), user.id]);
  // Sign out every other device.
  await pool.query('DELETE FROM sessions WHERE user_id = $1 AND id_hash <> $2', [user.id, sha256(readCookie(req))]);
  send(res, 200, { ok: true });
}

async function getData(req, res) {
  const { rows } = await pool.query('SELECT key, value, version FROM app_data');
  const items = {};
  for (const r of rows) items[r.key] = { value: r.value, version: r.version };
  send(res, 200, { items });
}

async function putData(req, res, user, key) {
  if (!DATA_KEY.test(key)) return send(res, 400, { error: 'bad_key' });
  const { value, baseVersion } = await readJson(req);
  if (typeof value !== 'string') return send(res, 400, { error: 'value must be a JSON string' });
  try { JSON.parse(value); } catch { return send(res, 400, { error: 'value is not valid JSON' }); }
  const base = Number.isInteger(baseVersion) ? baseVersion : 0;

  const result = base === 0
    ? await pool.query(
      `INSERT INTO app_data (key, value, version, updated_by) VALUES ($1, $2, 1, $3)
       ON CONFLICT (key) DO NOTHING RETURNING version`, [key, value, user.id])
    : await pool.query(
      `UPDATE app_data SET value = $2, version = version + 1, updated_at = now(), updated_by = $4
        WHERE key = $1 AND version = $3 RETURNING version`, [key, value, base, user.id]);
  if (result.rows.length) return send(res, 200, { version: result.rows[0].version });

  const { rows } = await pool.query('SELECT version FROM app_data WHERE key = $1', [key]);
  send(res, 409, { error: 'conflict', version: rows[0]?.version ?? 0 });
}

// Returns true when it handled the request.
export async function handleApi(req, res, urlPath) {
  if (!urlPath.startsWith('/api/')) return false;
  if (!pool) {
    send(res, 404, { error: 'no database' });
    return true;
  }
  try {
    // Every state-changing request must carry this header. Browsers won't send a custom header
    // cross-site without a CORS preflight, which this server never approves — so other sites
    // can't make a signed-in browser write data (CSRF).
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'fetch') return send(res, 403, { error: 'forbidden' }), true;

    if (req.method === 'GET' && urlPath === '/api/session') return await session(req, res), true;
    if (req.method === 'POST' && urlPath === '/api/setup') return await setup(req, res), true;
    if (req.method === 'POST' && urlPath === '/api/login') return await login(req, res), true;
    if (req.method === 'POST' && urlPath === '/api/logout') return await logout(req, res), true;

    const user = await currentUser(req);
    if (!user) return send(res, 401, { error: 'not_signed_in' }), true;
    if (req.method === 'POST' && urlPath === '/api/password') return await changePassword(req, res, user), true;
    if (req.method === 'GET' && urlPath === '/api/data') return await getData(req, res), true;
    const m = urlPath.match(/^\/api\/data\/([^/]+)$/);
    if (req.method === 'PUT' && m) return await putData(req, res, user, decodeURIComponent(m[1])), true;
    send(res, 404, { error: 'not found' });
  } catch (e) {
    if (e.status) send(res, e.status, { error: e.message });
    else {
      console.error(e);
      send(res, 500, { error: 'server error' });
    }
  }
  return true;
}
