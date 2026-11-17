// Storage adapters. The app talks to one interface; two implementations:
//  ServerStore — the Node API (shared by the whole team; role checks on the server)
//  LocalStore  — runs core.js in the browser against localStorage (static demo,
//                e.g. GitHub Pages). Same rules, but data lives in this browser only.
import { perform, viewFor, publicJobs, publicApply, portalStatus, canReadFile, AppError, READ_ONLY } from './core.js';

const safe = {
  get(store, k) { try { return store.getItem(k); } catch { return null; } },
  set(store, k, v) { try { store.setItem(k, v); return true; } catch { return false; } },
  del(store, k) { try { store.removeItem(k); } catch { /* ignore */ } }
};
const ls = () => { try { return window.localStorage; } catch { return null; } };

export async function createStore() {
  try {
    const r = await fetch('api/health', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j.mode === 'server') return new ServerStore(j); }
  } catch { /* static hosting */ }
  return new LocalStore();
}

class ServerStore {
  constructor(health) { this.mode = 'server'; this.demo = health.demo; this.token = safe.get(ls(), 'mats-token'); this.version = 0; this.user = null; }
  async req(method, url, body, auth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && auth) { this.token = null; safe.del(ls(), 'mats-token'); }
      throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status, duplicates: j.duplicates });
    }
    return j;
  }
  async restore() { if (!this.token) return null; try { const { user } = await this.req('GET', 'api/me'); this.user = user; return user; } catch { return null; } }
  async login(email, password) {
    const { token, user } = await this.req('POST', 'api/login', { email, password }, false);
    this.token = token; this.user = user; safe.set(ls(), 'mats-token', token); return user;
  }
  async logout() { try { await this.req('POST', 'api/logout'); } catch { /* ignore */ } this.token = null; this.user = null; safe.del(ls(), 'mats-token'); }
  async load(force) {
    const j = await this.req('GET', `api/state${!force && this.version ? `?since=${this.version}` : ''}`);
    if (j.unchanged) return null;
    this.version = j.version; return j.data;
  }
  async act(name, payload) { const j = await this.req('POST', `api/action/${name}`, { payload }); if (!READ_ONLY.has(name)) this.version = 0; return j.result; }
  async file(id) { return this.req('GET', `api/files/${id}`); }
  async publicJobs() { return (await this.req('GET', 'api/public/jobs', null, false)).jobs; }
  async publicApply(p) { return this.req('POST', 'api/public/apply', p, false); }
  async publicStatus(p) { return this.req('POST', 'api/public/status', p, false); }
}

const KEY = 'mats-demo-db-v1';
class LocalStore {
  constructor() { this.mode = 'local'; this.demo = true; this.user = null; this.db = null; this.version = 0; }
  async ensure() {
    if (this.db) return this.db;
    const raw = safe.get(ls(), KEY);
    if (raw) { try { this.db = JSON.parse(raw); } catch { this.db = null; } }
    if (!this.db) { const { buildSeed } = await import('./seed.js'); this.db = buildSeed(new Date()); this.persist(); }
    return this.db;
  }
  persist() {
    if (!safe.set(ls(), KEY, JSON.stringify(this.db))) console.warn('Browser storage unavailable or full — changes will not survive a reload');
  }
  async users() { await this.ensure(); return this.db.users.filter((u) => u.active !== false).map(({ passwordHash, ...u }) => u); }
  async restore() {
    await this.ensure();
    const id = safe.get(window.sessionStorage, 'mats-demo-user');
    this.user = this.db.users.find((u) => u.id === id) || null; return this.user && this.pub(this.user);
  }
  pub(u) { return { id: u.id, name: u.name, email: u.email, role: u.role }; }
  async loginAs(id) { await this.ensure(); this.user = this.db.users.find((u) => u.id === id); safe.set(window.sessionStorage, 'mats-demo-user', id); return this.pub(this.user); }
  async login(email) { await this.ensure(); const u = this.db.users.find((x) => x.email === String(email).trim().toLowerCase()); if (!u) throw new Error('Unknown demo user'); return this.loginAs(u.id); }
  async logout() { this.user = null; safe.del(window.sessionStorage, 'mats-demo-user'); }
  async load(force) {
    await this.ensure();
    if (!force && this.version === this.db.meta.version) return null;
    this.version = this.db.meta.version;
    return structuredClone(viewFor(this.db, this.user));
  }
  async reloadFromStorage() { this.db = null; this.version = 0; await this.ensure(); }
  wrap(fn) { try { return fn(); } catch (e) { throw Object.assign(new Error(e.message), { status: e.status, duplicates: e.duplicates }); } }
  async act(name, payload) {
    await this.ensure();
    const p = { ...payload }; delete p.password;
    const r = this.wrap(() => perform(this.db, this.user, name, p));
    if (!READ_ONLY.has(name)) { this.persist(); this.version = 0; }
    return structuredClone(r);
  }
  async file(id) { if (!canReadFile(this.db, this.user, id)) throw new AppError('File not found', 404); return this.db.files[id]; }
  async publicJobs() { await this.ensure(); return publicJobs(this.db); }
  async publicApply(p) { await this.ensure(); const r = this.wrap(() => publicApply(this.db, p)); this.persist(); return r; }
  async publicStatus(p) { await this.ensure(); return this.wrap(() => portalStatus(this.db, p)); }
  async reset() { safe.del(ls(), KEY); this.db = null; this.version = 0; await this.ensure(); }
}
