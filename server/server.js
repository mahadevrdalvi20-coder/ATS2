// Meridian ATS — zero-dependency Node server.
// Serves the web app from /public and a small JSON API. Data lives in one JSON
// file (data/db.json), written atomically after every change. All role checks
// and field redaction happen here, via core.js — the browser never receives
// data its role must not see.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { emptyDb, perform, viewFor, canReadFile, publicJobs, publicApply, portalStatus, AppError, READ_ONLY, normEmail } from '../public/js/core.js';
import { buildSeed } from '../public/js/seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 3000);
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'meridian123';
const SEED = process.env.SEED !== 'none';
const SESSION_HOURS = 12;

// ---------- passwords & sessions ----------
export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(pw), salt, 32).toString('hex')}`;
}
function checkPassword(pw, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(pw), salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}
const sessions = new Map(); // token -> { userId, expires }

// ---------- persistence ----------
function loadDb() {
  if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let db;
  if (SEED) {
    db = buildSeed(new Date());
    db.meta.demo = true;
    const hash = hashPassword(DEMO_PASSWORD);
    for (const u of db.users) u.passwordHash = hash;
    console.log(`Seeded demo data. Sign in as head@meridian.demo / ${DEMO_PASSWORD}`);
  } else {
    db = emptyDb();
    const email = process.env.ADMIN_EMAIL || 'admin@meridian.local';
    const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
    db.users.push({ id: 'usr_admin', name: 'TA Head', email, role: 'head', active: true, passwordHash: hashPassword(pw), createdAt: new Date().toISOString() });
    db.clients.push({ id: 'cli_bench', name: 'Meridian (Bench)', country: 'India', industry: 'Internal', contact: '' });
    console.log(`Empty database created. Sign in as ${email} / ${pw}`);
  }
  saveDb(db);
  return db;
}
function saveDb(d) {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d));
  fs.renameSync(tmp, DB_FILE);
}
let db = loadDb();

// ---------- http helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-src 'self' data: blob:; object-src 'self' data: blob:"
};
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': isObj ? 'application/json' : 'text/plain', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req, limit = 4_500_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new AppError('Request too large', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new AppError('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function authUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const s = token && sessions.get(token);
  if (!s || s.expires < Date.now()) { if (s) sessions.delete(token); return null; }
  const u = db.users.find((x) => x.id === s.userId && x.active !== false);
  return u || null;
}
// naive per-IP limiter for public + login endpoints
const hits = new Map();
function limited(req, key, max) {
  const k = `${key}:${req.socket.remoteAddress}`; const now = Date.now();
  const h = (hits.get(k) || []).filter((t) => now - t < 60000); h.push(now); hits.set(k, h);
  return h.length > max;
}

async function api(req, res, url) {
  const route = url.pathname.replace(/^\/api/, '');
  if (route === '/health') return send(res, 200, { ok: true, mode: 'server', demo: !!db.meta.demo, company: db.settings.company });

  // public careers portal
  if (route === '/public/jobs' && req.method === 'GET') return send(res, 200, { jobs: publicJobs(db), company: db.settings.company });
  if (route === '/public/apply' && req.method === 'POST') {
    if (limited(req, 'apply', 10)) throw new AppError('Too many requests, try again in a minute', 429);
    const out = publicApply(db, await readBody(req)); saveDb(db); return send(res, 200, out);
  }
  if (route === '/public/status' && req.method === 'POST') {
    if (limited(req, 'status', 20)) throw new AppError('Too many requests, try again in a minute', 429);
    return send(res, 200, portalStatus(db, await readBody(req)));
  }

  if (route === '/login' && req.method === 'POST') {
    if (limited(req, 'login', 15)) throw new AppError('Too many attempts, try again in a minute', 429);
    const { email, password } = await readBody(req);
    const u = db.users.find((x) => x.email === normEmail(email) && x.active !== false);
    if (!u || !checkPassword(password, u.passwordHash)) throw new AppError('Email or password is incorrect', 401);
    const token = crypto.randomBytes(24).toString('base64url');
    sessions.set(token, { userId: u.id, expires: Date.now() + SESSION_HOURS * 3600000 });
    return send(res, 200, { token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  }

  const user = authUser(req);
  if (!user) throw new AppError('Please sign in', 401);
  if (route === '/logout' && req.method === 'POST') { sessions.delete((req.headers.authorization || '').slice(7)); return send(res, 200, { ok: true }); }
  if (route === '/me') return send(res, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  if (route === '/state' && req.method === 'GET') {
    const since = Number(url.searchParams.get('since'));
    if (since && since === db.meta.version) return send(res, 200, { unchanged: true, version: db.meta.version });
    return send(res, 200, { version: db.meta.version, user: { id: user.id, name: user.name, email: user.email, role: user.role }, data: viewFor(db, user) });
  }
  const fileMatch = route.match(/^\/files\/([\w-]+)$/);
  if (fileMatch && req.method === 'GET') {
    const f = db.files[fileMatch[1]];
    if (!f || !canReadFile(db, user, fileMatch[1])) throw new AppError('File not found', 404);
    return send(res, 200, { name: f.name, dataUrl: f.dataUrl });
  }
  const actMatch = route.match(/^\/action\/(\w+)$/);
  if (actMatch && req.method === 'POST') {
    const body = await readBody(req);
    const payload = body.payload || {};
    if (actMatch[1] === 'saveUser' && payload.password) {
      if (String(payload.password).length < 8) throw new AppError('Password must be at least 8 characters');
      payload.passwordHash = hashPassword(payload.password); delete payload.password;
    }
    if (actMatch[1] === 'saveUser' && !payload.id && !payload.passwordHash) throw new AppError('Set a password for the new user');
    const result = perform(db, user, actMatch[1], payload);
    if (!READ_ONLY.has(actMatch[1])) saveDb(db);
    return send(res, 200, { result, version: db.meta.version });
  }
  throw new AppError('Not found', 404);
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' ) p = '/index.html';
  if (p === '/careers') p = '/careers.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    send(res, status, { error: status >= 500 ? 'Something went wrong on the server' : e.message, duplicates: e.duplicates });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`Meridian ATS running on http://localhost:${PORT}`));
}
export { server };
