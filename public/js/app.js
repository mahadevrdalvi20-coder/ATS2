import {
  STAGES, CLOSED, ALL_STAGES, HM_VISIBLE_STAGES, SOURCES, REJECT_REASONS, DROP_REASONS, BGV_STATUSES, INTERVIEW_RESULTS, ROLE_LABEL, LOCATIONS,
  computeMetrics, offerRisk, noticeFit, earliestJoin, isActiveApp, normPhone
} from './core.js';
import { createStore } from './store.js';
import {
  esc, fmtDate, fmtDateTime, rel, daysSince, lakhs, inr, pct, initials, stageBadge, icon, lvlBadge, toast, openModal, closeModal, modalOpen,
  formData, field, readFileAsDataUrl, parseCsv, toCsv, download, bars, installTooltips, toLocalInput
} from './ui.js';

const S = { store: null, user: null, data: null, ix: null, f: {}, stale: false };
const $ = (sel, root = document) => root.querySelector(sel);
const app = document.getElementById('app');
const isStaff = () => S.user && (S.user.role === 'head' || S.user.role === 'recruiter');
const isHead = () => S.user?.role === 'head';

// ---------- data ----------
function group(arr, key) { const m = new Map(); for (const x of arr) { const k = x[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }
function buildIndex() {
  const d = S.data; const m = (a) => new Map(a.map((x) => [x.id, x]));
  S.ix = {
    cand: m(d.candidates), job: m(d.jobs), user: m(d.users), client: m(d.clients), app: m(d.applications),
    appsByJob: group(d.applications, 'jobId'), appsByCand: group(d.applications, 'candidateId'),
    ivByApp: group(d.interviews, 'applicationId'), notesByCand: group(d.notes, 'candidateId'), emailsByCand: group(d.emails, 'candidateId')
  };
}
async function refresh(force = false) {
  try {
    const d = await S.store.load(force);
    if (!d) return false;
    S.data = d; buildIndex();
    return true;
  } catch (e) {
    if (e.status === 401) { S.user = null; renderLogin(); }
    return false;
  }
}
const uname = (id) => S.ix.user.get(id)?.name || (id === 'portal' ? 'Careers portal' : '—');
const cname = (id) => S.ix.client.get(id)?.name || '—';
const appsOfJob = (id) => S.ix.appsByJob.get(id) || [];
const appsOfCand = (id) => S.ix.appsByCand.get(id) || [];
const lastMove = (a) => a.history[a.history.length - 1]?.at || a.updatedAt;
const nextStage = (s) => STAGES[STAGES.indexOf(s) + 1];
const prevStage = (s) => STAGES[STAGES.indexOf(s) - 1];

async function act(name, payload, { ok, form, silent } = {}) {
  const errBox = form && form.querySelector('.form-error');
  if (errBox) errBox.classList.add('hidden');
  try {
    const r = await S.store.act(name, payload);
    await refresh(true);
    if (ok) toast(ok);
    if (!silent) renderContent();
    return r;
  } catch (e) {
    if (errBox) { errBox.textContent = e.message; errBox.classList.remove('hidden'); errBox.scrollIntoView({ block: 'nearest' }); } else toast(e.message, 'err');
    throw e;
  }
}

// ---------- routing ----------
function route() {
  const h = location.hash.slice(1) || '/dashboard';
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '') };
}
const go = (h) => { if (location.hash === h) renderContent(); else location.hash = h; };

const NAV = [
  { k: 'dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['head', 'recruiter', 'hm'] },
  { k: 'jobs', label: 'Requisitions', hmLabel: 'My requisitions', icon: 'briefcase', roles: ['head', 'recruiter', 'hm'] },
  { k: 'pipeline', label: 'Pipeline', icon: 'columns', roles: ['head', 'recruiter'] },
  { k: 'candidates', label: 'Candidates', hmLabel: 'Shortlisted', icon: 'users', roles: ['head', 'recruiter', 'hm'] },
  { k: 'interviews', label: 'Interviews', icon: 'calendar', roles: ['head', 'recruiter', 'hm'] },
  { k: 'offers', label: 'Offers & joining', icon: 'offer', roles: ['head', 'recruiter'] },
  { k: 'reports', label: 'Reports', icon: 'chart', roles: ['head', 'recruiter'], section: 'Insights' },
  { k: 'compliance', label: 'Data privacy', icon: 'shield', roles: ['head'], section: 'Admin' },
  { k: 'audit', label: 'Audit log', icon: 'list', roles: ['head'] },
  { k: 'settings', label: 'Settings', icon: 'settings', roles: ['head'] }
];

// ---------- shell ----------
function renderShell() {
  app.innerHTML = `<div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="brand-mark">M</div><div><b>Meridian ATS</b><span>Talent Acquisition</span></div></div>
      <nav class="nav" id="nav"></nav>
      <div class="sidebar-foot">
        <a href="careers.html" target="_blank" rel="noopener" style="color:#c9cfda">${icon('globe')} Careers portal ↗</a>
        <div style="margin-top:10px"><span class="mode-pill ${S.store.mode === 'local' ? 'local' : ''}"><i></i>${S.store.mode === 'local' ? 'Demo · data in this browser' : 'Live · shared server'}</span></div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn ghost sm menu-btn" data-act="menu" aria-label="Menu">${icon('menu')}</button>
        <div class="search">${icon('search')}<input id="gsearch" placeholder="Search candidates by name, phone, email or skill · jobs by code" autocomplete="off" aria-label="Search">
          <div class="search-results hidden" id="gresults"></div></div>
        ${isStaff() ? `<button class="btn primary" data-act="new-candidate">${icon('plus')}<span class="hide-sm">Add candidate</span></button>` : ''}
        <div class="user-chip">
          <button class="btn ghost sm" data-act="theme" title="Toggle theme" aria-label="Toggle theme">${icon('moon')}</button>
          <span class="avatar">${esc(initials(S.user.name))}</span>
          <div class="who"><div style="font-weight:600;font-size:13px">${esc(S.user.name)}</div><div class="small muted">${ROLE_LABEL[S.user.role]}</div></div>
          <button class="btn ghost sm" data-act="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button>
        </div>
      </header>
      <main class="content" id="content"></main>
    </div>
  </div>`;
}
function renderNav() {
  const cur = route().parts[0] || 'dashboard';
  const counts = {
    interviews: S.data.interviews.filter((i) => i.result === 'Scheduled' && new Date(i.at) < new Date()).length,
    compliance: S.data.retention?.length || 0
  };
  let section = '';
  $('#nav').innerHTML = NAV.filter((n) => n.roles.includes(S.user.role)).map((n) => {
    const head = n.section && n.section !== section ? `<div class="nav-label">${(section = n.section)}</div>` : '';
    const c = counts[n.k] ? `<span class="count" title="${n.k === 'interviews' ? 'Interviews awaiting feedback' : 'Records due for erasure'}">${counts[n.k]}</span>` : '';
    return `${head}<a href="#/${n.k}" class="${cur === n.k || (cur === 'job' && n.k === 'jobs') || (cur === 'candidate' && n.k === 'candidates') ? 'active' : ''}">${icon(n.icon)}${S.user.role === 'hm' && n.hmLabel ? n.hmLabel : n.label}${c}</a>`;
  }).join('');
}

function renderContent() {
  if (!S.user || !S.data) return;
  const { parts, q } = route();
  const page = parts[0] || 'dashboard';
  const allowed = NAV.find((n) => n.k === page)?.roles || (['job', 'candidate'].includes(page) ? ['head', 'recruiter', 'hm'] : null);
  renderNav();
  const el = $('#content');
  const focus = document.activeElement; const fid = focus?.id; const pos = focus?.selectionStart;
  let html;
  if (!allowed || !allowed.includes(S.user.role)) html = emptyState('Page not available', 'You do not have access to this page.');
  else {
    try { html = PAGES[page](parts[1], q); } catch (e) { console.error(e); html = emptyState('Something went wrong', esc(e.message)); }
  }
  const banner = S.store.mode === 'local' ? `<div class="banner info no-print">${icon('alert')}<span><b>Demo mode.</b> Data is stored in this browser only and the role switch is not a security boundary. Run the Node server for a shared, access-controlled system.</span></div>` : '';
  el.innerHTML = banner + html;
  if (fid && fid !== 'gsearch') { const f = document.getElementById(fid); if (f) { f.focus(); try { if (pos != null) f.setSelectionRange(pos, pos); } catch { /* select */ } } }
  $('#sidebar')?.classList.remove('open');
  S.stale = false; $('#updates')?.remove();
  afterRender();
}
let afterHooks = [];
function afterRender() { const hooks = afterHooks; afterHooks = []; hooks.forEach((f) => f()); }
const emptyState = (title, sub = '', ic = 'search') => `<div class="card"><div class="empty">${icon(ic)}<div style="font-weight:600;color:var(--text-2)">${title}</div><div class="small">${sub}</div></div></div>`;
const pageHead = (title, sub = '', actions = '', crumbs = '') => `<div class="page-head"><div>${crumbs ? `<div class="crumbs">${crumbs}</div>` : ''}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row no-print">${actions}</div></div>`;

// ---------- shared bits ----------
function candLink(c, sub = '') { if (!c) return '—'; return `<a href="#/candidate/${c.id}" class="cell-title">${esc(c.name)}</a>${sub ? `<div class="cell-sub">${sub}</div>` : ''}`; }
function jobLabel(j) { return j ? `${esc(j.title)} <span class="muted">· ${esc(j.code)}</span>` : '—'; }
function fitBadge(c, j) { const f = noticeFit(c, j); return f.level === 'unknown' ? '' : lvlBadge(f.level, f.label, `Earliest joining ${fmtDate(earliestJoin(c))} · project starts ${fmtDate(j.projectStart)}`); }
function riskOf(a) { const c = S.ix.cand.get(a.candidateId); return offerRisk(a, c, S.ix.job.get(a.jobId)); }
function riskBadge(a) {
  if (!['Offered', 'BGV'].includes(a.stage)) return '';
  const r = riskOf(a);
  return lvlBadge(r.level, `${r.level[0].toUpperCase()}${r.level.slice(1)} drop risk`, r.reasons.join(' · ') || 'No risk signals');
}
function noticeLabel(c) { if (c.noticeDays === null || c.noticeDays === undefined) return '—'; return c.lastWorkingDay ? `LWD ${fmtDate(c.lastWorkingDay)}` : `${c.noticeDays}d`; }
function scopedData(jobFilter) {
  const jobs = S.data.jobs.filter(jobFilter); const ids = new Set(jobs.map((j) => j.id));
  return { ...S.data, jobs, applications: S.data.applications.filter((a) => ids.has(a.jobId)) };
}
function selectOpts(list, value, all) { return `${all ? `<option value="">${all}</option>` : ''}${list.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}`; }
const staffUsers = () => S.data.users.filter((u) => u.active !== false && (u.role === 'recruiter' || u.role === 'head'));
const hmUsers = () => S.data.users.filter((u) => u.active !== false && u.role === 'hm');
function miniPipeline(jobId) {
  const apps = appsOfJob(jobId);
  const c = (stages) => apps.filter((a) => stages.includes(a.stage)).length;
  return `<div class="mini-stats"><span title="Applied + Screened"><b>${c(['Applied', 'Screened'])}</b> new</span><span title="Internal interview"><b>${c(['Internal Interview'])}</b> int</span><span title="Client round"><b>${c(['Client Round'])}</b> client</span><span title="Offered + BGV"><b>${c(['Offered', 'BGV'])}</b> offer</span></div>`;
}

// =====================================================================
// PAGES
// =====================================================================
const PAGES = {};

// ---------- dashboard ----------
PAGES.dashboard = () => {
  if (S.user.role === 'hm') return hmDashboard();
  const isRec = S.user.role === 'recruiter';
  const scope = S.f.dashScope || (isRec ? 'mine' : 'all');
  const v = scope === 'mine' ? scopedData((j) => j.recruiterId === S.user.id) : S.data;
  const m = computeMetrics(v);
  const now = new Date();
  const dropRate = m.offerOutcomes ? m.offerDropped / m.offerOutcomes : null;
  const at = (n) => new Date(Date.now() + n * 86400000);
  const actives = v.applications.filter(isActiveApp);

  const risky = v.applications.filter((a) => ['Offered', 'BGV'].includes(a.stage)).map((a) => ({ a, r: riskOf(a) }))
    .filter((x) => x.r.level !== 'low').sort((x, y) => y.r.score - x.r.score).slice(0, 6);

  const attention = v.jobs.filter((j) => j.status === 'Open').map((j) => {
    const apps = appsOfJob(j.id); const issues = [];
    if (j.targetDate && new Date(j.targetDate) < now) issues.push(lvlBadge('critical', `${daysSince(j.targetDate)}d past target`));
    const late = apps.filter((a) => isActiveApp(a) && noticeFit(S.ix.cand.get(a.candidateId), j).level === 'critical').length;
    if (j.projectStart && new Date(j.projectStart) < at(21) && !apps.some((a) => ['Offered', 'BGV', 'Joined'].includes(a.stage))) issues.push(lvlBadge('serious', `Starts ${fmtDate(j.projectStart)}, no offer yet`));
    if (late && late === apps.filter(isActiveApp).length) issues.push(lvlBadge('warning', 'All candidates join after start'));
    if (daysSince(j.createdAt) > 7 && !apps.some((a) => STAGES.indexOf(a.stage) >= 2 || a.stage === 'Joined')) issues.push(lvlBadge('warning', 'No interviews after 7 days'));
    return { j, issues };
  }).filter((x) => x.issues.length).slice(0, 8);

  const upcoming = S.data.interviews.filter((i) => { const t = new Date(i.at); const a = S.ix.app.get(i.applicationId); return t > now && t < at(7) && a && v.applications.includes(a); })
    .sort((a, b) => a.at.localeCompare(b.at)).slice(0, 7);

  const recRows = staffUsers().filter((u) => u.role === 'recruiter').map((u) => {
    const jobs = S.data.jobs.filter((j) => j.recruiterId === u.id && j.status === 'Open');
    const ids = new Set(S.data.jobs.filter((j) => j.recruiterId === u.id).map((j) => j.id));
    const apps = S.data.applications.filter((a) => ids.has(a.jobId));
    const q0 = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return { u, open: jobs.reduce((s, j) => s + j.openings, 0), reqs: jobs.length, active: apps.filter(isActiveApp).length,
      offers: apps.filter((a) => ['Offered', 'BGV'].includes(a.stage)).length, joined: apps.filter((a) => a.stage === 'Joined' && new Date(a.joinedAt || a.updatedAt) >= q0).length };
  });

  const followUps = isRec ? actives.filter((a) => {
    const c = S.ix.cand.get(a.candidateId); const last = [...(c?.contacts || [])].map((x) => x.at).sort().pop() || a.updatedAt;
    return daysSince(lastMove(a)) >= 5 && daysSince(last) >= 3;
  }).sort((a, b) => lastMove(a).localeCompare(lastMove(b))).slice(0, 8) : [];

  return `${pageHead(`Good ${now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'}, ${esc(S.user.name.split(' ')[0])}`,
    `${fmtDate(now)} · ${scope === 'mine' ? 'Your requisitions' : 'All requisitions'}`,
    `<div class="btn-group"><button class="btn sm ${scope === 'mine' ? 'on' : ''}" data-act="set" data-k="dashScope" data-v="mine">My requisitions</button><button class="btn sm ${scope === 'all' ? 'on' : ''}" data-act="set" data-k="dashScope" data-v="all">All</button></div>`)}
  <div class="kpis">
    <div class="card kpi"><div class="label">${icon('briefcase')}Open positions</div><div class="value">${m.openPositions}</div><div class="sub">${m.openJobs} requisitions · ${m.overdue.length} past target date</div></div>
    <div class="card kpi"><div class="label">${icon('check')}Joined this quarter</div><div class="value">${m.joinedThisQ}${scope === 'all' ? `<small> / ${m.quarterTarget}</small>` : ''}</div>
      ${scope === 'all' ? `<div class="progress" title="${pct(m.joinedThisQ / m.quarterTarget)} of quarterly target"><i style="width:${Math.min(100, (m.joinedThisQ / m.quarterTarget) * 100)}%"></i></div>` : '<div class="sub">Candidates who actually joined</div>'}</div>
    <div class="card kpi"><div class="label">${icon('clock')}Avg time to offer</div><div class="value">${m.avgTimeToOffer ?? '—'}<small> days</small></div><div class="sub">To joining: ${m.avgTimeToFill ?? '—'} days (n=${m.ttfSample})</div></div>
    <div class="card kpi"><div class="label">${icon('offer')}Offer → join rate</div><div class="value">${pct(m.offerJoinRate)}</div><div class="sub">${m.offerDropped} of ${m.offerOutcomes} decided offers dropped (${pct(dropRate)})</div></div>
    <div class="card kpi"><div class="label">${icon('users')}Active pipeline</div><div class="value">${m.activeCandidates}</div><div class="sub">${m.byStage['Client Round']} at client round · ${m.byStage.Offered + m.byStage.BGV} with offers</div></div>
  </div>
  <div class="grid g-main">
    <div class="card"><div class="card-h"><div><h2>Candidates by stage</h2><p>Where everyone in an active process is right now</p></div><a class="btn sm" href="#/pipeline">Open pipeline</a></div>
      <div class="card-b">${bars(STAGES.filter((s) => s !== 'Joined').map((s) => ({ label: s, value: m.byStage[s] })), { tip: (r) => `${r.label}: ${r.value} candidates` })}
      <div class="mini-stats" style="margin-top:14px"><span>Joined (all time) <b>${m.byStage.Joined}</b></span><span>Rejected <b>${m.byStage.Rejected}</b></span><span>Dropped out <b>${m.byStage['Dropped Out']}</b></span></div></div></div>
    <div class="card"><div class="card-h"><div><h2>Offers at risk</h2><p>Rule-based flags — hover for reasons</p></div><a class="btn sm" href="#/offers">All offers</a></div>
      <div class="card-b flush">${risky.length ? `<table class="t"><tbody>${risky.map(({ a, r }) => { const c = S.ix.cand.get(a.candidateId); const j = S.ix.job.get(a.jobId); return `<tr class="click" data-href="#/candidate/${c.id}"><td>${candLink(c, `${esc(j?.title)} · joins ${fmtDate(a.offer?.joiningDate)}`)}<div class="cell-sub">${esc(r.reasons.slice(0, 2).join(' · '))}</div></td><td class="right">${riskBadge(a)}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty small">No offers at risk right now</div>'}</div></div>
  </div>
  <div class="grid g-main" style="margin-top:16px">
    <div class="card"><div class="card-h"><div><h2>Requisitions needing attention</h2><p>Past target, close to project start, or stalled</p></div></div>
      <div class="card-b flush table-wrap">${attention.length ? `<table class="t"><thead><tr><th>Requisition</th><th>Issues</th><th class="hide-sm">Pipeline</th></tr></thead><tbody>${attention.map(({ j, issues }) => `<tr class="click" data-href="#/job/${j.id}"><td><span class="cell-title">${esc(j.title)}</span><div class="cell-sub">${esc(j.code)} · ${esc(cname(j.clientId))} · ${esc(uname(j.recruiterId))}</div></td><td><div class="row" style="gap:4px">${issues.join('')}</div></td><td class="hide-sm">${miniPipeline(j.id)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty small">All requisitions on track</div>'}</div></div>
    <div class="card"><div class="card-h"><div><h2>Interviews · next 7 days</h2></div><a class="btn sm" href="#/interviews">All</a></div>
      <div class="card-b flush">${upcoming.length ? `<table class="t"><tbody>${upcoming.map((i) => { const a = S.ix.app.get(i.applicationId); const c = S.ix.cand.get(a.candidateId); return `<tr class="click" data-href="#/candidate/${c.id}"><td>${candLink(c, `${esc(i.round)} · ${esc(S.ix.job.get(a.jobId)?.title)}`)}</td><td class="right nowrap small">${fmtDateTime(i.at)}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty small">No interviews scheduled this week</div>'}</div></div>
  </div>
  ${isRec ? `<div class="card" style="margin-top:16px"><div class="card-h"><div><h2>Your follow-ups</h2><p>Stuck 5+ days in a stage with no contact for 3+ days</p></div></div><div class="card-b flush table-wrap">${followUps.length ? `<table class="t"><thead><tr><th>Candidate</th><th>Stage</th><th>In stage</th><th>Last contact</th><th></th></tr></thead><tbody>${followUps.map((a) => { const c = S.ix.cand.get(a.candidateId); const lc = [...(c.contacts || [])].sort((x, y) => y.at.localeCompare(x.at))[0]; return `<tr><td>${candLink(c, jobLabel(S.ix.job.get(a.jobId)))}</td><td>${stageBadge(a.stage)}</td><td>${daysSince(lastMove(a))}d</td><td class="small">${lc ? `${rel(lc.at)} by ${esc(uname(lc.by))}` : '—'}</td><td class="right"><button class="btn sm" data-act="log-contact" data-id="${c.id}">${icon('phone')}Log call</button></td></tr>`; }).join('')}</tbody></table>` : '<div class="empty small">Nothing overdue — nice.</div>'}</div></div>` : ''}
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-h"><div><h2>Source effectiveness</h2><p>Which channels produce joiners, and what they cost</p></div><a class="btn sm" href="#/reports/sources">Full report</a></div>
      <div class="card-b flush table-wrap"><table class="t"><thead><tr><th>Source</th><th class="num">Apps</th><th class="num">Joined</th><th class="num">Conv.</th><th class="num">Cost / hire</th></tr></thead><tbody>
      ${m.sourceRows.slice(0, 7).map((s) => `<tr><td>${esc(s.source)}</td><td class="num">${s.applications}</td><td class="num">${s.joined}</td><td class="num">${pct(s.conversion, 1)}</td><td class="num">${s.costPerHire ? inr(s.costPerHire) : '—'}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="card-h"><div><h2>Recruiter workload</h2><p>Open requisitions and active candidates per recruiter</p></div></div>
      <div class="card-b flush table-wrap"><table class="t"><thead><tr><th>Recruiter</th><th class="num">Reqs</th><th class="num">Openings</th><th class="num">Active</th><th class="num">Offers</th><th class="num">Joined (Q)</th></tr></thead><tbody>
      ${recRows.map((r) => `<tr><td><div class="row"><span class="avatar sm">${initials(r.u.name)}</span>${esc(r.u.name)}</div></td><td class="num">${r.reqs}</td><td class="num">${r.open}</td><td class="num">${r.active}</td><td class="num">${r.offers}</td><td class="num">${r.joined}</td></tr>`).join('')}</tbody></table></div></div>
  </div>`;
};

function hmDashboard() {
  const now = new Date();
  const jobs = S.data.jobs.filter((j) => j.status === 'Open');
  const needFeedback = S.data.interviews.filter((i) => i.result === 'Scheduled' && new Date(i.at) < now);
  const upcoming = S.data.interviews.filter((i) => new Date(i.at) >= now).sort((a, b) => a.at.localeCompare(b.at)).slice(0, 8);
  const review = S.data.applications.filter((a) => ['Internal Interview', 'Client Round'].includes(a.stage));
  const ivRow = (i, btn) => { const a = S.ix.app.get(i.applicationId); const c = S.ix.cand.get(a?.candidateId); return `<tr><td>${candLink(c, `${esc(i.round)} round · ${esc(S.ix.job.get(a?.jobId)?.title)}`)}</td><td class="small nowrap">${fmtDateTime(i.at)}</td><td class="right">${btn ? `<button class="btn sm primary" data-act="feedback" data-id="${i.id}">Add feedback</button>` : ''}</td></tr>`; };
  return `${pageHead(`Welcome, ${esc(S.user.name.split(' ')[0])}`, 'Shortlisted candidates for your requisitions. Salary and contact details are handled by Talent Acquisition.')}
  <div class="kpis">
    <div class="card kpi"><div class="label">My open requisitions</div><div class="value">${jobs.length}</div><div class="sub">${jobs.reduce((s, j) => s + j.openings, 0)} openings</div></div>
    <div class="card kpi"><div class="label">Awaiting your review</div><div class="value">${review.length}</div><div class="sub">At internal or client round</div></div>
    <div class="card kpi"><div class="label">Feedback pending</div><div class="value">${needFeedback.length}</div><div class="sub">Interviews already held</div></div>
  </div>
  <div class="grid g2">
    <div class="card"><div class="card-h"><h2>Feedback pending</h2></div><div class="card-b flush">${needFeedback.length ? `<table class="t"><tbody>${needFeedback.map((i) => ivRow(i, true)).join('')}</tbody></table>` : '<div class="empty small">All feedback submitted</div>'}</div></div>
    <div class="card"><div class="card-h"><h2>Upcoming interviews</h2></div><div class="card-b flush">${upcoming.length ? `<table class="t"><tbody>${upcoming.map((i) => ivRow(i)).join('')}</tbody></table>` : '<div class="empty small">Nothing scheduled</div>'}</div></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h2>My requisitions</h2></div><div class="card-b flush table-wrap"><table class="t"><thead><tr><th>Requisition</th><th>Client · project</th><th>Target</th><th>Shortlist</th></tr></thead><tbody>
    ${jobs.map((j) => `<tr class="click" data-href="#/job/${j.id}"><td><span class="cell-title">${esc(j.title)}</span><div class="cell-sub">${esc(j.code)} · ${j.openings} opening${j.openings > 1 ? 's' : ''}</div></td><td>${esc(cname(j.clientId))}<div class="cell-sub">${esc(j.project)}</div></td><td>${fmtDate(j.targetDate)}</td><td>${miniPipeline(j.id)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No open requisitions assigned to you</td></tr>'}
  </tbody></table></div></div>`;
}

// ---------- jobs ----------
PAGES.jobs = () => {
  const f = S.f; const status = f.jobStatus ?? 'Open'; const q = (f.jobQ || '').toLowerCase();
  let jobs = S.data.jobs.filter((j) => (!status || j.status === status) && (!f.jobClient || j.clientId === f.jobClient) && (!f.jobRec || j.recruiterId === f.jobRec)
    && (!q || `${j.title} ${j.code} ${j.project} ${j.skills.join(' ')} ${cname(j.clientId)}`.toLowerCase().includes(q)));
  jobs = jobs.sort((a, b) => (a.targetDate || '9').localeCompare(b.targetDate || '9'));
  const filled = (j) => appsOfJob(j.id).filter((a) => a.stage === 'Joined').length;
  return `${pageHead(S.user.role === 'hm' ? 'My requisitions' : 'Requisitions', 'Every open position is tied to a client project and a billing rate.', isStaff() ? `<button class="btn primary" data-act="new-job">${icon('plus')}New requisition</button>` : '')}
  <div class="filters">
    <input class="input wide" id="jobQ" data-filter="jobQ" placeholder="Search title, code, skill, client…" value="${esc(f.jobQ || '')}">
    <select data-filter="jobStatus">${selectOpts(['Open', 'On Hold', 'Filled', 'Closed'], status, 'All statuses')}</select>
    <select data-filter="jobClient">${selectOpts(S.data.clients.map((c) => [c.id, c.name]), f.jobClient, 'All clients')}</select>
    ${isStaff() ? `<select data-filter="jobRec">${selectOpts(staffUsers().map((u) => [u.id, u.name]), f.jobRec, 'All recruiters')}</select>` : ''}
    <span class="muted small">${jobs.length} requisition${jobs.length === 1 ? '' : 's'}</span>
  </div>
  <div class="card table-wrap"><table class="t"><thead><tr><th>Requisition</th><th>Client · project</th><th class="num">Filled</th><th>Pipeline</th><th>Target date</th><th class="hide-sm">Project start</th>${isStaff() ? '<th class="hide-sm">Recruiter</th>' : ''}<th>Status</th></tr></thead><tbody>
  ${jobs.map((j) => { const od = j.status === 'Open' && j.targetDate && new Date(j.targetDate) < new Date(); return `<tr class="click" data-href="#/job/${j.id}">
    <td><span class="cell-title">${esc(j.title)}</span><div class="cell-sub">${esc(j.code)} · ${esc(j.location)} · ${j.expMin}–${j.expMax} yrs${j.type === 'Bench' ? ' · Bench' : ''}</div></td>
    <td>${esc(cname(j.clientId))}<div class="cell-sub">${esc(j.project)}</div></td>
    <td class="num">${filled(j)} / ${j.openings}</td><td>${miniPipeline(j.id)}</td>
    <td class="nowrap">${od ? lvlBadge('critical', fmtDate(j.targetDate), 'Past target closure date') : fmtDate(j.targetDate)}</td>
    <td class="hide-sm nowrap">${fmtDate(j.projectStart)}</td>
    ${isStaff() ? `<td class="hide-sm">${esc(uname(j.recruiterId))}</td>` : ''}
    <td>${statusBadge(j.status)}</td></tr>`; }).join('') || `<tr><td colspan="8">${emptyState('No requisitions match', 'Try clearing filters')}</td></tr>`}
  </tbody></table></div>`;
};
const statusBadge = (s) => `<span class="badge ${({ Open: 'lvl-good', 'On Hold': 'lvl-warning', Filled: 'st-Screened', Closed: '' })[s] || ''}">${esc(s)}</span>`;

PAGES.job = (id, q) => {
  const j = S.ix.job.get(id);
  if (!j) return emptyState('Requisition not found', 'It may have been removed or you may not have access.');
  const tab = q.get('tab') || 'pipeline';
  const apps = appsOfJob(j.id);
  const joined = apps.filter((a) => a.stage === 'Joined').length;
  const kv = [
    ['Client', esc(cname(j.clientId))], ['Project', esc(j.project || '—')], ['Type', j.type],
    ['Experience', `${j.expMin}–${j.expMax} years`], ...(isStaff() ? [['CTC band', `${lakhs(j.ctcMin)} – ${lakhs(j.ctcMax)}`], ['Billing rate', j.billingRate ? `${j.billingCurrency} ${j.billingRate}/hr` : '—']] : []),
    ['Location', esc(j.location)], ['Openings', `${joined} filled of ${j.openings}`], ['Target closure', fmtDate(j.targetDate)], ['Project start', fmtDate(j.projectStart)],
    ['Recruiter', esc(uname(j.recruiterId))], ['Hiring manager', esc(uname(j.hiringManagerId))], ['Opened', `${fmtDate(j.createdAt)} (${daysSince(j.createdAt)}d ago)`],
    ...(isStaff() ? [['Careers portal', j.published ? 'Published' : 'Not published']] : [])
  ];
  const tabs = [['pipeline', 'Pipeline'], ...(isStaff() ? [['matches', 'Matching candidates']] : []), ['details', 'Job description']];
  let body = '';
  if (tab === 'pipeline') body = kanban(apps, { job: j });
  if (tab === 'matches') body = matches(j);
  if (tab === 'details') body = `<div class="card"><div class="card-b"><p style="white-space:pre-wrap">${esc(j.description || 'No description yet.')}</p><div class="section-title">Skills required</div>${j.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div></div>`;
  return `${pageHead(`${esc(j.title)} ${statusBadge(j.status)}`, `${esc(j.code)} · ${esc(cname(j.clientId))} · ${esc(j.project)}`,
    isStaff() ? `<button class="btn" data-act="edit-job" data-id="${j.id}">${icon('edit')}Edit</button><button class="btn primary" data-act="new-candidate" data-job="${j.id}" ${j.status !== 'Open' ? 'disabled' : ''}>${icon('plus')}Add candidate</button>` : '',
    `<a href="#/jobs">Requisitions</a> / ${esc(j.code)}`)}
  <div class="card" style="margin-bottom:16px"><div class="card-b"><dl class="kv" style="grid-template-columns:repeat(auto-fill,minmax(110px,max-content) minmax(150px,1fr))">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div style="margin-top:10px">${j.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div></div></div>
  <div class="tabs">${tabs.map(([k, l]) => `<a href="#/job/${j.id}?tab=${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
  ${body}`;
};

function matches(j) {
  const want = j.skills.map((s) => s.toLowerCase());
  const inJob = new Set(appsOfJob(j.id).map((a) => a.candidateId));
  const rows = S.data.candidates.filter((c) => !c.erased && !inJob.has(c.id)).map((c) => {
    const have = (c.skills || []).map((s) => s.toLowerCase());
    const hits = want.filter((w) => have.some((h) => h.includes(w) || w.includes(h)));
    const expOk = c.totalExp >= j.expMin && c.totalExp <= j.expMax + 1;
    const busy = appsOfCand(c.id).filter(isActiveApp);
    return { c, hits, score: hits.length * 2 + (expOk ? 1 : 0), expOk, busy };
  }).filter((x) => x.hits.length >= Math.min(2, want.length)).sort((a, b) => b.score - a.score || (a.c.noticeDays ?? 999) - (b.c.noticeDays ?? 999)).slice(0, 25);
  return `<div class="card"><div class="card-h"><div><h2>Candidates already in your database</h2><p>Skill overlap with this requisition (simple keyword match, not AI). Re-engaging a known candidate is faster and cheaper than sourcing.</p></div></div>
  <div class="card-b flush table-wrap"><table class="t"><thead><tr><th>Candidate</th><th>Matched skills</th><th class="num">Exp</th><th>Notice fit</th><th>Currently</th><th></th></tr></thead><tbody>
  ${rows.map(({ c, hits, expOk, busy }) => `<tr><td>${candLink(c, `${esc(c.currentCompany)} · ${esc(c.location)}`)}</td>
    <td>${(c.skills || []).map((s) => `<span class="chip ${hits.some((h) => s.toLowerCase().includes(h) || h.includes(s.toLowerCase())) ? 'hit' : ''}">${esc(s)}</span>`).join('')}</td>
    <td class="num">${c.totalExp ?? '—'}${expOk ? '' : ' <span class="muted small">(out of band)</span>'}</td><td>${fitBadge(c, j) || noticeLabel(c)}</td>
    <td>${busy.length ? busy.map((a) => stageBadge(a.stage)).join(' ') : '<span class="muted small">Not in process</span>'}</td>
    <td class="right"><button class="btn sm" data-act="quick-apply" data-cand="${c.id}" data-job="${j.id}" ${j.status !== 'Open' ? 'disabled' : ''}>${icon('plus')}Add to job</button></td></tr>`).join('') || `<tr><td colspan="6">${emptyState('No strong matches', 'No one in the database shares at least two of the required skills.')}</td></tr>`}
  </tbody></table></div></div>`;
}

// ---------- kanban ----------
function kanban(apps, { job = null } = {}) {
  const draggable = isStaff();
  const stages = S.user.role === 'hm' ? HM_VISIBLE_STAGES : STAGES.filter((s) => !(job?.type === 'Bench' && s === 'Client Round'));
  const showJob = !job;
  const card = (a) => {
    const c = S.ix.cand.get(a.candidateId); const j = S.ix.job.get(a.jobId); if (!c) return '';
    const days = daysSince(lastMove(a));
    return `<div class="kcard" ${draggable ? 'draggable="true"' : ''} data-app="${a.id}" data-href="#/candidate/${c.id}">
      <div class="row between"><span class="name">${esc(c.name)}</span>${c.ownerId ? `<span class="avatar sm" title="Owner: ${esc(uname(c.ownerId))}">${initials(uname(c.ownerId))}</span>` : ''}</div>
      <div class="meta">${showJob ? `${esc(j?.code)} · ${esc(j?.title)}<br>` : ''}${esc(c.currentCompany || '')}${c.totalExp != null ? ` · ${c.totalExp}y` : ''} · notice ${noticeLabel(c)}</div>
      <div class="tags">${a.stage !== 'Joined' ? fitBadge(c, j) : ''}${riskBadge(a)}${a.stage === 'Client Round' ? clientApprovalBadge(a) : ''}<span class="badge" title="Days in this stage">${icon('clock')}${days}d</span></div></div>`;
  };
  const cols = stages.map((s) => {
    const list = apps.filter((a) => a.stage === s).sort((x, y) => lastMove(x).localeCompare(lastMove(y)));
    const shown = s === 'Joined' ? list.slice(-15) : list;
    return `<div class="kcol" data-stage="${s}"><div class="kcol-h"><span>${s}</span><span class="badge">${list.length}</span></div>
      <div class="kcol-b">${shown.map(card).join('') || '<div class="muted small" style="padding:8px;text-align:center">—</div>'}${s === 'Joined' && list.length > 15 ? `<div class="muted small" style="text-align:center">+${list.length - 15} earlier</div>` : ''}</div></div>`;
  }).join('');
  const closed = apps.filter((a) => CLOSED.includes(a.stage)).length;
  return `<div class="kanban" id="kanban">${cols}</div>
  ${draggable ? `<div class="kdrop"><div class="zone" data-stage="Rejected">${icon('x')} Drop here to reject</div><div class="zone" data-stage="Dropped Out">${icon('logout')} Drop here if candidate dropped out</div></div>` : ''}
  <p class="muted small" style="margin-top:8px">${closed} closed application${closed === 1 ? '' : 's'} (rejected / dropped out) are on each candidate's record.${draggable ? ' Drag cards between columns to move them, forward or back — every move is timestamped.' : ''}</p>`;
}
const clientApprovalBadge = (a) => (a.clientApproval?.status === 'Approved' ? lvlBadge('good', 'Client approved') : a.clientApproval?.status === 'Rejected' ? lvlBadge('critical', 'Client rejected') : lvlBadge('warning', 'Awaiting client'));

PAGES.pipeline = () => {
  const f = S.f; const scope = f.pipeScope || (S.user.role === 'recruiter' ? 'mine' : 'all');
  const openJobs = S.data.jobs.filter((j) => j.status === 'Open');
  const job = f.pipeJob && S.ix.job.get(f.pipeJob);
  let apps = S.data.applications.filter((a) => { const j = S.ix.job.get(a.jobId); return j && j.status === 'Open'; });
  if (job) apps = appsOfJob(job.id);
  else if (scope === 'mine') apps = apps.filter((a) => S.ix.job.get(a.jobId).recruiterId === S.user.id);
  if (f.pipeClient && !job) apps = apps.filter((a) => S.ix.job.get(a.jobId).clientId === f.pipeClient);
  const q = (f.pipeQ || '').toLowerCase();
  if (q) apps = apps.filter((a) => (S.ix.cand.get(a.candidateId)?.name || '').toLowerCase().includes(q));
  return `${pageHead('Pipeline', 'Every active candidate across open requisitions. Drag to move.', `<div class="btn-group"><button class="btn sm ${scope === 'mine' ? 'on' : ''}" data-act="set" data-k="pipeScope" data-v="mine">My requisitions</button><button class="btn sm ${scope === 'all' ? 'on' : ''}" data-act="set" data-k="pipeScope" data-v="all">All</button></div>`)}
  <div class="filters">
    <select data-filter="pipeJob">${selectOpts(openJobs.map((j) => [j.id, `${j.code} · ${j.title} (${cname(j.clientId)})`]), f.pipeJob, 'All open requisitions')}</select>
    <select data-filter="pipeClient" ${job ? 'disabled' : ''}>${selectOpts(S.data.clients.map((c) => [c.id, c.name]), f.pipeClient, 'All clients')}</select>
    <input class="input" id="pipeQ" data-filter="pipeQ" placeholder="Filter by name…" value="${esc(f.pipeQ || '')}">
    <span class="muted small">${apps.filter(isActiveApp).length} active</span>
  </div>
  ${kanban(apps, { job })}`;
};

// ---------- candidates ----------
function candidateMatches(c, f) {
  if (c.erased && !f.showErased) return false;
  const q = (f.cq || '').trim().toLowerCase();
  if (q) {
    const digits = q.replace(/\D/g, '');
    const hay = `${c.name} ${c.email || ''} ${c.currentCompany || ''} ${c.currentTitle || ''} ${(c.skills || []).join(' ')}`.toLowerCase();
    if (!hay.includes(q) && !(digits.length >= 4 && (c.phone || '').includes(digits))) return false;
  }
  if (f.cskills) {
    const want = f.cskills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const have = (c.skills || []).map((s) => s.toLowerCase());
    if (!want.every((w) => have.some((h) => h.includes(w)))) return false;
  }
  if (f.cnotice && (c.noticeDays == null || c.noticeDays > Number(f.cnotice))) return false;
  if (f.cexpMin && (c.totalExp ?? 0) < Number(f.cexpMin)) return false;
  if (f.cexpMax && (c.totalExp ?? 99) > Number(f.cexpMax)) return false;
  if (f.csource && c.source !== f.csource) return false;
  if (f.cloc && c.location !== f.cloc) return false;
  if (f.cowner && c.ownerId !== f.cowner) return false;
  if (f.cstage) {
    const apps = appsOfCand(c.id);
    if (f.cstage === '__active' && !apps.some(isActiveApp)) return false;
    if (f.cstage === '__none' && apps.some(isActiveApp)) return false;
    if (!f.cstage.startsWith('__') && !apps.some((a) => a.stage === f.cstage)) return false;
  }
  return true;
}
PAGES.candidates = () => {
  const f = S.f; const staff = isStaff();
  const list = S.data.candidates.filter((c) => candidateMatches(c, f));
  const sort = f.csort || 'recent';
  const sorters = { recent: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''), name: (a, b) => a.name.localeCompare(b.name), notice: (a, b) => (a.noticeDays ?? 999) - (b.noticeDays ?? 999), exp: (a, b) => (b.totalExp ?? 0) - (a.totalExp ?? 0) };
  list.sort(sorters[sort]);
  const shown = list.slice(0, 200);
  const want = (f.cskills || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const locs = [...new Set(S.data.candidates.map((c) => c.location).filter(Boolean))].sort();
  return `${pageHead(staff ? 'Candidates' : 'Shortlisted candidates', staff ? 'One shared record per person — phone number is the unique key.' : 'Candidates at interview stage or later on your requisitions.',
    staff ? `<button class="btn" data-act="import">${icon('upload')}Import CSV</button><button class="btn" data-act="export-candidates">${icon('download')}Export</button><button class="btn primary" data-act="new-candidate">${icon('plus')}Add candidate</button>` : '')}
  <div class="filters">
    <input class="input wide" id="cq" data-filter="cq" placeholder="Name, phone, email, company…" value="${esc(f.cq || '')}">
    <input class="input" id="cskills" data-filter="cskills" placeholder="Skills, comma separated" value="${esc(f.cskills || '')}">
    <select data-filter="cnotice">${selectOpts([['15', 'Notice ≤ 15 days'], ['30', 'Notice ≤ 30 days'], ['60', 'Notice ≤ 60 days'], ['90', 'Notice ≤ 90 days']], f.cnotice, 'Any notice period')}</select>
    <input class="input" style="min-width:90px;width:90px" id="cexpMin" data-filter="cexpMin" type="number" min="0" placeholder="Exp min" value="${esc(f.cexpMin || '')}">
    <input class="input" style="min-width:90px;width:90px" id="cexpMax" data-filter="cexpMax" type="number" min="0" placeholder="Exp max" value="${esc(f.cexpMax || '')}">
    ${staff ? `<select data-filter="csource">${selectOpts(SOURCES, f.csource, 'All sources')}</select>` : ''}
    <select data-filter="cloc">${selectOpts(locs, f.cloc, 'All locations')}</select>
    ${staff ? `<select data-filter="cstage">${selectOpts([['__active', 'In an active process'], ['__none', 'Not in any process'], ...ALL_STAGES.map((s) => [s, `Stage: ${s}`])], f.cstage, 'Any status')}</select>
    <select data-filter="cowner">${selectOpts(staffUsers().map((u) => [u.id, `Owner: ${u.name}`]), f.cowner, 'Any owner')}</select>` : ''}
    <select data-filter="csort">${selectOpts([['recent', 'Recently updated'], ['name', 'Name'], ['notice', 'Shortest notice'], ['exp', 'Most experience']], sort)}</select>
    ${Object.keys(f).some((k) => k.startsWith('c') && f[k]) ? '<button class="btn ghost sm" data-act="clear-cfilters">Clear</button>' : ''}
  </div>
  <div class="muted small" style="margin-bottom:8px">${list.length} candidate${list.length === 1 ? '' : 's'}${list.length > 200 ? ' · showing first 200, refine filters to narrow down' : ''}</div>
  <div class="card table-wrap"><table class="t"><thead><tr><th>Candidate</th><th class="num">Exp</th><th>Notice</th>${staff ? '<th class="num">CTC (cur → exp)</th>' : ''}<th>Skills</th>${staff ? '<th class="hide-sm">Source</th>' : ''}<th>Applications</th>${staff ? '<th class="hide-sm">Owner</th>' : ''}</tr></thead><tbody>
  ${shown.map((c) => `<tr class="click" data-href="#/candidate/${c.id}">
    <td>${candLink(c, `${esc(c.currentTitle || '')}${c.currentCompany ? ` @ ${esc(c.currentCompany)}` : ''}${c.location ? ` · ${esc(c.location)}` : ''}`)}</td>
    <td class="num">${c.totalExp ?? '—'}</td><td class="nowrap">${noticeLabel(c)}</td>
    ${staff ? `<td class="num nowrap">${lakhs(c.currentCtc)} → ${lakhs(c.expectedCtc)}</td>` : ''}
    <td>${(c.skills || []).slice(0, 5).map((s) => `<span class="chip ${want.some((w) => s.toLowerCase().includes(w)) ? 'hit' : ''}">${esc(s)}</span>`).join('')}</td>
    ${staff ? `<td class="hide-sm small">${esc(c.source)}${c.source === 'Consultancy' ? `<div class="cell-sub">${esc(c.sourceDetail)}</div>` : ''}</td>` : ''}
    <td>${appsOfCand(c.id).map((a) => `<div class="nowrap small" style="margin:1px 0">${stageBadge(a.stage)} <span class="muted">${esc(S.ix.job.get(a.jobId)?.code || '')}</span></div>`).join('') || '<span class="muted small">—</span>'}</td>
    ${staff ? `<td class="hide-sm small">${esc(uname(c.ownerId))}</td>` : ''}</tr>`).join('') || `<tr><td colspan="8">${emptyState('No candidates match these filters')}</td></tr>`}
  </tbody></table></div>`;
};

PAGES.candidate = (id) => {
  const c = S.ix.cand.get(id);
  if (!c) return emptyState('Candidate not found', 'They may have been erased, or are not shortlisted for your requisitions.');
  const staff = isStaff();
  const apps = appsOfCand(c.id).sort((a, b) => Number(isActiveApp(b)) - Number(isActiveApp(a)) || b.updatedAt.localeCompare(a.updatedAt));
  const notes = (S.ix.notesByCand.get(c.id) || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const emails = (S.ix.emailsByCand.get(c.id) || []).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const contacts = [...(c.contacts || [])].sort((a, b) => b.at.localeCompare(a.at));
  const active = apps.filter(isActiveApp);
  const other = active.filter((a) => S.ix.job.get(a.jobId)?.recruiterId !== S.user.id);
  const details = [
    ...(staff ? [['Mobile', c.phone ? `<a href="tel:+91${esc(c.phone)}">+91 ${esc(c.phone)}</a>` : '—'], ['Email', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—']] : []),
    ['Current role', `${esc(c.currentTitle || '—')}${c.currentCompany ? ` @ ${esc(c.currentCompany)}` : ''}`], ['Total experience', c.totalExp != null ? `${c.totalExp} years` : '—'],
    ['Notice period', c.noticeDays != null ? `${c.noticeDays} days${c.lastWorkingDay ? ` · LWD ${fmtDate(c.lastWorkingDay)}` : ''}` : '—'], ['Earliest joining', fmtDate(earliestJoin(c))],
    ...(staff ? [['Current CTC', lakhs(c.currentCtc)], ['Expected CTC', `${lakhs(c.expectedCtc)}${c.currentCtc && c.expectedCtc ? ` <span class="muted">(+${Math.round((c.expectedCtc / c.currentCtc - 1) * 100)}%)</span>` : ''}`], ['Other offers', c.competingOffers ? lvlBadge('warning', `${c.competingOffers} in hand`) : 'None reported']] : []),
    ['Location', esc(c.location || '—')],
    ...(staff ? [['Source', `${esc(c.source)}${c.sourceDetail ? ` · ${esc(c.sourceDetail)}` : ''}`], ['Owner', esc(uname(c.ownerId))], ['Added', `${fmtDate(c.createdAt)} by ${esc(uname(c.createdBy))}`]] : [])
  ];
  return `${pageHead(`${esc(c.name)}`, `${esc(c.currentTitle || '')}${c.currentCompany ? ` @ ${esc(c.currentCompany)}` : ''}`,
    staff && !c.erased ? `<button class="btn" data-act="email" data-id="${c.id}">${icon('mail')}Email</button><button class="btn" data-act="log-contact" data-id="${c.id}">${icon('phone')}Log call</button>
      <button class="btn" data-act="edit-candidate" data-id="${c.id}">${icon('edit')}Edit</button><button class="btn primary" data-act="apply" data-id="${c.id}">${icon('plus')}Add to job</button>` : '',
    `<a href="#/candidates">Candidates</a> / ${esc(c.name)}`)}
  ${c.erased ? `<div class="banner">${icon('shield')}Personal data erased on ${fmtDate(c.erasedAt)} (${esc(c.erasureReason)}). Pipeline history is kept anonymously for reporting.</div>` : ''}
  ${staff && other.length ? `<div class="banner">${icon('alert')}<span><b>Already in process with a colleague:</b> ${other.map((a) => `${esc(S.ix.job.get(a.jobId)?.title)} (${esc(a.stage)}) — ${esc(uname(S.ix.job.get(a.jobId)?.recruiterId))}`).join('; ')}. Coordinate before reaching out.</span></div>` : ''}
  ${c.erasureRequested && !c.erased ? `<div class="banner">${icon('shield')}Candidate has requested erasure of their data.</div>` : ''}
  <div class="grid g-main">
    <div class="stack">
      <div class="section-title" style="margin-top:0">Applications (${apps.length})</div>
      ${apps.map(appCard).join('') || emptyState('Not in any process yet', staff ? 'Use “Add to job” to start.' : '')}
      <div class="card"><div class="card-h"><h2>Notes</h2><span class="muted small">Internal — never shown to the candidate</span></div><div class="card-b">
        ${!c.erased ? `<form data-form="note" data-id="${c.id}" style="margin-bottom:12px"><div class="form-error hidden"></div><div class="field"><textarea name="body" placeholder="Add a note — call summary, feedback, context for colleagues…" required></textarea></div>
          <div class="row between" style="margin-top:8px">${apps.length > 1 ? `<select name="applicationId" class="input" style="width:auto">${selectOpts(apps.map((a) => [a.id, `Re: ${S.ix.job.get(a.jobId)?.title}`]), '', 'General note')}</select>` : `<input type="hidden" name="applicationId" value="${apps[0]?.id || ''}">`}<button class="btn primary sm">Add note</button></div></form>` : ''}
        ${notes.map((n) => `<div class="note"><div class="by"><b>${esc(uname(n.authorId))}</b> · ${fmtDateTime(n.createdAt)}${n.applicationId ? ` · ${esc(S.ix.job.get(S.ix.app.get(n.applicationId)?.jobId)?.title || '')}` : ''}</div><div class="body">${esc(n.body)}</div></div>`).join('') || '<div class="muted small">No notes yet</div>'}
      </div></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-h"><h2>Profile</h2>${staff && !c.erased ? `<button class="btn ghost sm" data-act="edit-candidate" data-id="${c.id}">${icon('edit')}</button>` : ''}</div><div class="card-b">
        <dl class="kv">${details.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        <div class="section-title">Skills</div>${(c.skills || []).map((s) => `<span class="chip">${esc(s)}</span>`).join('') || '<span class="muted small">—</span>'}
      </div></div>
      <div class="card"><div class="card-h"><h2>Resume</h2></div><div class="card-b">
        ${c.resume ? `<div class="row between"><div class="row">${icon('file')}<div><div style="font-weight:600">${esc(c.resume.name)}</div><div class="small muted">${Math.round(c.resume.size / 1024)} KB · ${fmtDate(c.resume.uploadedAt)}</div></div></div><button class="btn sm" data-act="view-resume" data-id="${c.resume.fileId}">Open</button></div>` : '<div class="muted small">No resume on file</div>'}
        ${staff && !c.erased ? `<label class="btn sm" style="margin-top:10px">${icon('upload')}${c.resume ? 'Replace' : 'Upload'} resume<input type="file" accept=".pdf,.doc,.docx,.txt" hidden data-upload="${c.id}"></label>` : ''}
      </div></div>
      ${staff ? `<div class="card"><div class="card-h"><h2>Contact log</h2><button class="btn ghost sm" data-act="log-contact" data-id="${c.id}">${icon('plus')}</button></div><div class="card-b">
        <ul class="timeline">${contacts.slice(0, 8).map((x) => `<li><b>${esc(x.channel)}</b> · ${esc(uname(x.by))} · <span class="muted">${rel(x.at)}</span>${x.summary ? `<div class="muted">${esc(x.summary)}</div>` : ''}</li>`).join('') || '<li class="muted">No contact logged</li>'}</ul>
        ${emails.length ? `<div class="section-title">Emails</div><ul class="timeline">${emails.slice(0, 6).map((m) => `<li><b>${esc(m.subject)}</b><div class="muted">${esc(uname(m.sentBy))} · ${fmtDateTime(m.sentAt)}</div></li>`).join('')}</ul>` : ''}
      </div></div>
      <div class="card"><div class="card-h"><h2>Consent & retention</h2>${icon('shield')}</div><div class="card-b small">
        <dl class="kv"><dt>Consent</dt><dd>${c.consent?.given ? `Given ${fmtDate(c.consent.at)}` : '—'}</dd><dt>Method</dt><dd>${esc(c.consent?.method || '—')}</dd><dt>Purpose</dt><dd>${esc(c.consent?.purpose || '—')}</dd>
        <dt>Retention</dt><dd>Erased ${S.data.settings.retentionMonths} months after last activity unless joined or in process</dd></dl>
        ${isHead() && !c.erased ? `<button class="btn danger sm" style="margin-top:10px" data-act="erase" data-id="${c.id}">${icon('trash')}Erase personal data</button>` : ''}
      </div></div>` : ''}
    </div>
  </div>`;
};

function appCard(a) {
  const j = S.ix.job.get(a.jobId); const c = S.ix.cand.get(a.candidateId); const staff = isStaff();
  const closed = CLOSED.includes(a.stage);
  const reachedIdx = Math.max(...a.history.map((h) => STAGES.indexOf(h.to)));
  const steps = STAGES.filter((s) => !(j?.type === 'Bench' && s === 'Client Round'));
  const ivs = (S.ix.ivByApp.get(a.id) || []).sort((x, y) => x.at.localeCompare(y.at));
  const nxt = nextStage(a.stage); const prv = prevStage(a.stage);
  const r = ['Offered', 'BGV'].includes(a.stage) ? riskOf(a) : null;
  return `<div class="app-card">
    <div class="app-h"><div><a href="#/job/${j?.id}" class="cell-title">${esc(j?.title || 'Requisition')}</a> <span class="muted small">${esc(j?.code)} · ${esc(a.ref)}</span>
      <div class="cell-sub">${esc(cname(j?.clientId))} · ${esc(j?.project || '')} · recruiter ${esc(uname(j?.recruiterId))}</div></div>
      <div class="row">${stageBadge(a.stage)}${!closed && a.stage !== 'Joined' && j ? fitBadge(c, j) : ''}${riskBadge(a)}</div></div>
    <div class="app-b">
      <div class="stepper ${closed ? 'closed' : ''}">${steps.map((s) => { const i = STAGES.indexOf(s); const cur = s === a.stage || (closed && i === reachedIdx); return `<div class="s ${i < reachedIdx || (!closed && i <= reachedIdx && !cur) || (a.stage === 'Joined' && i <= reachedIdx) ? 'done' : ''} ${cur ? 'cur' : ''}"><i></i>${s}</div>`; }).join('')}</div>
      ${closed ? `<p><b>${esc(a.stage)}</b>${a.rejectReason || a.dropReason ? ` — ${esc(a.rejectReason || a.dropReason)}` : ''} <span class="muted small">${fmtDate(a.updatedAt)}</span></p>` : ''}
      ${staff && !c?.erased ? `<div class="row" style="margin-bottom:12px">
        ${!closed && prv ? `<button class="btn sm" data-act="move" data-app="${a.id}" data-to="${j?.type === 'Bench' && prv === 'Client Round' ? 'Internal Interview' : prv}">${icon('left')}Back</button>` : ''}
        ${!closed && nxt ? `<button class="btn sm primary" data-act="move" data-app="${a.id}" data-to="${j?.type === 'Bench' && nxt === 'Client Round' ? 'Offered' : nxt}">Move to ${j?.type === 'Bench' && nxt === 'Client Round' ? 'Offered' : nxt}${icon('right')}</button>` : ''}
        ${!closed ? `<button class="btn sm" data-act="schedule" data-app="${a.id}">${icon('calendar')}Interview</button>` : ''}
        ${['Client Round', 'Offered'].includes(a.stage) && j?.type !== 'Bench' ? `<button class="btn sm" data-act="approval" data-app="${a.id}">Client approval</button>` : ''}
        ${['Offered', 'BGV', 'Joined'].includes(a.stage) ? `<button class="btn sm" data-act="offer" data-app="${a.id}">${icon('offer')}Offer</button>` : ''}
        ${['BGV', 'Joined'].includes(a.stage) ? `<button class="btn sm" data-act="bgv" data-app="${a.id}">${icon('shield')}BGV</button>` : ''}
        ${!closed && a.stage !== 'Joined' ? `<button class="btn sm danger" data-act="move" data-app="${a.id}" data-to="Rejected">Reject</button><button class="btn sm ghost" data-act="move" data-app="${a.id}" data-to="Dropped Out">Dropped out</button>` : ''}
        ${closed ? `<button class="btn sm" data-act="reopen" data-app="${a.id}">Reopen</button>` : ''}
      </div>` : ''}
      <div class="grid g2" style="gap:12px">
        ${a.clientApproval || ['Client Round', 'Offered', 'BGV'].includes(a.stage) && j?.type !== 'Bench' ? `<div><div class="section-title" style="margin-top:0">Client approval</div>${a.clientApproval ? `${clientApprovalBadge(a)} <span class="small muted">${esc(a.clientApproval.by || '')} · ${fmtDate(a.clientApproval.at)}</span>` : clientApprovalBadge(a)}</div>` : ''}
        ${a.offer ? `<div><div class="section-title" style="margin-top:0">Offer</div><div class="small">${a.offer.ctc ? `<b>${lakhs(a.offer.ctc)}</b> · ` : ''}joining ${fmtDate(a.offer.joiningDate)}${a.offer.offeredAt ? `<br>${a.offer.acceptedAt ? `Accepted ${fmtDate(a.offer.acceptedAt)}` : `Offered ${fmtDate(a.offer.offeredAt)} · not yet accepted`}` : ''}</div></div>` : ''}
        ${a.bgv ? `<div><div class="section-title" style="margin-top:0">Background verification</div>${lvlBadge(a.bgv.status === 'Clear' ? 'good' : a.bgv.status === 'Discrepancy' ? 'critical' : 'warning', a.bgv.status)} <span class="small muted">${esc(a.bgv.vendor || '')}</span></div>` : ''}
        ${r && r.reasons.length ? `<div><div class="section-title" style="margin-top:0">Why the risk flag</div><ul class="small risk-list" style="margin:0;padding-left:16px">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      </div>
      ${ivs.length ? `<div class="section-title">Interviews</div><div class="table-wrap"><table class="t"><tbody>${ivs.map((i) => `<tr><td class="nowrap">${fmtDateTime(i.at)}</td><td>${esc(i.title)}<div class="cell-sub">${esc(i.round)} · ${esc(i.mode)} · ${esc(i.panel.join(', '))}</div>${i.feedback ? `<div class="small" style="margin-top:4px">“${esc(i.feedback)}”${i.rating ? ` · ${i.rating}/5` : ''}</div>` : ''}</td><td>${lvlBadge(i.result === 'Selected' ? 'good' : i.result === 'Rejected' || i.result === 'No show' ? 'critical' : 'warning', i.result)}</td><td class="right"><button class="btn sm ghost" data-act="feedback" data-id="${i.id}">Feedback</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      <details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">Stage history (${a.history.length})</summary><ul class="timeline" style="margin-top:8px">
        ${[...a.history].reverse().map((h) => `<li><b>${h.from ? `${esc(h.from)} → ` : ''}${esc(h.to)}</b>${h.reason ? ` — ${esc(h.reason)}` : ''} <span class="muted">· ${esc(uname(h.by))} · ${fmtDateTime(h.at)}</span>${h.note ? `<div class="muted">${esc(h.note)}</div>` : ''}</li>`).join('')}</ul></details>
    </div></div>`;
}

// ---------- interviews ----------
PAGES.interviews = (sub) => {
  const tab = sub || 'upcoming'; const now = new Date();
  let ivs = S.data.interviews.filter((i) => S.ix.app.get(i.applicationId));
  if (S.user.role === 'recruiter' && (S.f.ivScope || 'mine') === 'mine') ivs = ivs.filter((i) => S.ix.job.get(S.ix.app.get(i.applicationId).jobId)?.recruiterId === S.user.id);
  const sets = {
    upcoming: ivs.filter((i) => new Date(i.at) >= now).sort((a, b) => a.at.localeCompare(b.at)),
    feedback: ivs.filter((i) => new Date(i.at) < now && i.result === 'Scheduled').sort((a, b) => a.at.localeCompare(b.at)),
    past: ivs.filter((i) => new Date(i.at) < now && i.result !== 'Scheduled').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 150)
  };
  const rows = sets[tab] || [];
  return `${pageHead('Interviews', 'Internal and client rounds, with panel and feedback.', S.user.role === 'recruiter' ? `<div class="btn-group"><button class="btn sm ${(S.f.ivScope || 'mine') === 'mine' ? 'on' : ''}" data-act="set" data-k="ivScope" data-v="mine">My requisitions</button><button class="btn sm ${S.f.ivScope === 'all' ? 'on' : ''}" data-act="set" data-k="ivScope" data-v="all">All</button></div>` : '')}
  <div class="tabs">${[['upcoming', 'Upcoming'], ['feedback', 'Awaiting feedback'], ['past', 'Completed']].map(([k, l]) => `<a href="#/interviews/${k}" class="${tab === k ? 'on' : ''}">${l} <span class="badge">${sets[k].length}</span></a>`).join('')}</div>
  <div class="card table-wrap"><table class="t"><thead><tr><th>When</th><th>Candidate</th><th>Requisition</th><th>Round</th><th class="hide-sm">Panel</th><th>Result</th><th></th></tr></thead><tbody>
  ${rows.map((i) => { const a = S.ix.app.get(i.applicationId); const c = S.ix.cand.get(a.candidateId); const j = S.ix.job.get(a.jobId); return `<tr>
    <td class="nowrap">${fmtDateTime(i.at)}<div class="cell-sub">${rel(i.at)} · ${i.durationMin} min</div></td><td>${candLink(c)}</td><td>${jobLabel(j)}<div class="cell-sub">${esc(cname(j?.clientId))}</div></td>
    <td>${esc(i.title)}<div class="cell-sub">${esc(i.round)} · ${esc(i.mode)}</div></td><td class="hide-sm small">${esc(i.panel.join(', '))}</td>
    <td>${lvlBadge(i.result === 'Selected' ? 'good' : ['Rejected', 'No show'].includes(i.result) ? 'critical' : 'warning', i.result)}</td>
    <td class="right"><button class="btn sm ${tab === 'feedback' ? 'primary' : ''}" data-act="feedback" data-id="${i.id}">Feedback</button></td></tr>`; }).join('') || `<tr><td colspan="7">${emptyState('Nothing here', '', 'calendar')}</td></tr>`}
  </tbody></table></div>`;
};

// ---------- offers ----------
PAGES.offers = () => {
  const now = new Date();
  const live = S.data.applications.filter((a) => ['Offered', 'BGV'].includes(a.stage)).map((a) => ({ a, r: riskOf(a) })).sort((x, y) => y.r.score - x.r.score);
  const m = computeMetrics(S.data);
  const in30 = live.filter(({ a }) => a.offer?.joiningDate && new Date(a.offer.joiningDate) <= new Date(now.getTime() + 30 * 86400000)).length;
  const recent = S.data.applications.filter((a) => a.history.some((h) => h.to === 'Offered') && ['Joined', 'Dropped Out'].includes(a.stage) && daysSince(a.updatedAt) <= 120).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `${pageHead('Offers & joining', 'From offer to first day — the stretch where candidates disappear.')}
  <div class="kpis">
    <div class="card kpi"><div class="label">Offers out</div><div class="value">${live.filter(({ a }) => a.stage === 'Offered').length}</div><div class="sub">${live.filter(({ a }) => a.stage === 'Offered' && !a.offer?.acceptedAt).length} not yet accepted</div></div>
    <div class="card kpi"><div class="label">In BGV</div><div class="value">${live.filter(({ a }) => a.stage === 'BGV').length}</div><div class="sub">${live.filter(({ a }) => a.bgv?.status === 'Discrepancy').length} with discrepancy</div></div>
    <div class="card kpi"><div class="label">Joining in 30 days</div><div class="value">${in30}</div></div>
    <div class="card kpi"><div class="label">High drop risk</div><div class="value">${live.filter((x) => x.r.level === 'high').length}</div><div class="sub">${live.filter((x) => x.r.level === 'medium').length} medium</div></div>
    <div class="card kpi"><div class="label">Offer → join (all time)</div><div class="value">${pct(m.offerJoinRate)}</div><div class="sub">${m.offerDropped} of ${m.offerOutcomes} decided offers never joined</div></div>
  </div>
  <div class="card table-wrap" style="margin-bottom:16px"><div class="card-h"><div><h2>Offers in flight</h2><p>Sorted by drop risk. The flag is a transparent points score, not a prediction model — hover to see why.</p></div></div>
  <table class="t"><thead><tr><th>Candidate</th><th>Requisition</th><th class="num">Offered</th><th>Accepted</th><th>Joining</th><th>Notice fit</th><th>BGV</th><th>Risk</th></tr></thead><tbody>
  ${live.map(({ a }) => { const c = S.ix.cand.get(a.candidateId); const j = S.ix.job.get(a.jobId); return `<tr class="click" data-href="#/candidate/${c.id}">
    <td>${candLink(c, `${esc(c.currentCompany || '')} · notice ${noticeLabel(c)}`)}</td><td>${jobLabel(j)}<div class="cell-sub">${esc(cname(j?.clientId))}</div></td>
    <td class="num">${lakhs(a.offer?.ctc)}<div class="cell-sub">exp. ${lakhs(c.expectedCtc)}</div></td><td>${a.offer?.acceptedAt ? lvlBadge('good', 'Yes') : lvlBadge('warning', 'Pending')}</td>
    <td class="nowrap">${fmtDate(a.offer?.joiningDate)}<div class="cell-sub">${a.offer?.joiningDate ? rel(a.offer.joiningDate) : ''}</div></td>
    <td>${fitBadge(c, j) || '—'}</td><td>${a.bgv ? esc(a.bgv.status) : '—'}</td><td>${riskBadge(a)}</td></tr>`; }).join('') || `<tr><td colspan="8">${emptyState('No offers in flight')}</td></tr>`}
  </tbody></table></div>
  <div class="card table-wrap"><div class="card-h"><div><h2>Recent outcomes</h2><p>Offers decided in the last 120 days</p></div></div><table class="t"><thead><tr><th>Candidate</th><th>Requisition</th><th>Outcome</th><th>Reason</th><th>Date</th></tr></thead><tbody>
  ${recent.map((a) => { const c = S.ix.cand.get(a.candidateId); return `<tr><td>${candLink(c)}</td><td>${jobLabel(S.ix.job.get(a.jobId))}</td><td>${stageBadge(a.stage)}</td><td class="small">${esc(a.dropReason || '')}</td><td class="nowrap">${fmtDate(a.updatedAt)}</td></tr>`; }).join('') || `<tr><td colspan="5">${emptyState('No outcomes yet')}</td></tr>`}
  </tbody></table></div>`;
};

// ---------- reports ----------
PAGES.reports = (sub) => {
  const tab = sub || 'sources';
  const tabs = [['sources', 'Source effectiveness'], ['client', 'Client status report'], ['funnel', 'Funnel & reasons'], ['ttf', 'Time to fill']];
  const body = { sources: reportSources, client: reportClient, funnel: reportFunnel, ttf: reportTtf }[tab]();
  return `${pageHead('Reports', 'Answers in a minute, not a day and a half.', `<button class="btn" data-act="print">${icon('print')}Print / PDF</button>`)}
  <div class="tabs no-print">${tabs.map(([k, l]) => `<a href="#/reports/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>${body}`;
};
function reportSources() {
  const m = computeMetrics(S.data);
  const rows = m.sourceRows;
  const tot = rows.reduce((s, r) => ({ a: s.a + r.applications, j: s.j + r.joined, f: s.f + r.fees }), { a: 0, j: 0, f: 0 });
  return `<div class="grid g2" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><div><h2>Joiners by source</h2><p>Count of candidates who actually joined</p></div></div><div class="card-b">${bars(rows.map((r) => ({ label: r.source, value: r.joined })), { tip: (r) => `${r.label}: ${r.value} joined` })}</div></div>
    <div class="card"><div class="card-h"><div><h2>Application → join conversion</h2><p>Share of applications from each source that ended in a joiner</p></div></div><div class="card-b">${bars([...rows].sort((a, b) => b.conversion - a.conversion).map((r) => ({ label: r.source, value: r.conversion })), { fmt: (v) => pct(v, 1), tip: (r) => `${r.label}: ${pct(r.value, 1)} of applications joined` })}</div></div>
  </div>
  <div class="card table-wrap"><div class="card-h"><div><h2>Source effectiveness</h2><p>Consultancy fee = ${S.data.settings.consultancyFeePct}% of offered annual CTC, charged only on joiners. Total consultancy spend: <b>${inr(tot.f)}</b>.</p></div><button class="btn sm no-print" data-act="export-sources">${icon('download')}CSV</button></div>
  <table class="t"><thead><tr><th>Source</th><th class="num">Applications</th><th class="num">Interviewed</th><th class="num">Offered</th><th class="num">Joined</th><th class="num">Dropped after offer</th><th class="num">Conversion</th><th class="num">Offer → join</th><th class="num">Avg days to fill</th><th class="num">Fees paid</th><th class="num">Cost / hire</th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td class="cell-title">${esc(r.source)}</td><td class="num">${r.applications}</td><td class="num">${r.interviewed}</td><td class="num">${r.offered}</td><td class="num">${r.joined}</td><td class="num">${r.dropped}</td><td class="num">${pct(r.conversion, 1)}</td><td class="num">${pct(r.offerJoinRate)}</td><td class="num">${r.avgDaysToFill ?? '—'}</td><td class="num">${r.fees ? inr(r.fees) : '—'}</td><td class="num">${r.costPerHire ? inr(r.costPerHire) : '—'}</td></tr>`).join('')}
  <tr><td class="cell-title">Total</td><td class="num">${tot.a}</td><td colspan="2"></td><td class="num">${tot.j}</td><td colspan="4"></td><td class="num">${inr(tot.f)}</td><td></td></tr>
  </tbody></table></div>`;
}
function reportClient() {
  const clientId = S.f.repClient || S.data.clients.find((c) => S.data.jobs.some((j) => j.clientId === c.id && j.status === 'Open'))?.id;
  const client = S.ix.client.get(clientId);
  const jobs = S.data.jobs.filter((j) => j.clientId === clientId && (j.status === 'Open' || daysSince(j.closedAt || j.createdAt) < 30));
  const lines = [];
  const html = jobs.map((j) => {
    const apps = appsOfJob(j.id); const cnt = (s) => apps.filter((a) => s.includes(a.stage)).length;
    const joined = cnt(['Joined']);
    const late = apps.filter((a) => ['Client Round', 'Offered', 'BGV', 'Joined'].includes(a.stage));
    lines.push(`${j.code} ${j.title} (${j.project}) — ${joined}/${j.openings} filled; ${cnt(['Applied', 'Screened', 'Internal Interview'])} in internal process, ${cnt(['Client Round'])} at client round, ${cnt(['Offered', 'BGV'])} offered.${late.length ? ` Key candidates: ${late.map((a) => `${S.ix.cand.get(a.candidateId)?.name} (${a.stage}${a.offer?.joiningDate && a.stage !== 'Joined' ? `, joining ${fmtDate(a.offer.joiningDate)}` : ''})`).join('; ')}.` : ''}`);
    return `<div class="card" style="margin-bottom:12px"><div class="card-h"><div><h2>${esc(j.title)} <span class="muted small">${esc(j.code)}</span></h2><p>${esc(j.project)} · ${j.openings} opening${j.openings > 1 ? 's' : ''} · target ${fmtDate(j.targetDate)} · project start ${fmtDate(j.projectStart)}</p></div>${statusBadge(j.status)}</div>
      <div class="card-b"><div class="mini-stats" style="margin-bottom:10px"><span>Filled <b>${joined}/${j.openings}</b></span><span>Internal process <b>${cnt(['Applied', 'Screened', 'Internal Interview'])}</b></span><span>Client round <b>${cnt(['Client Round'])}</b></span><span>Offered / BGV <b>${cnt(['Offered', 'BGV'])}</b></span><span>Last update <b>${apps.length ? rel(apps.map((a) => a.updatedAt).sort().pop()) : '—'}</b></span></div>
      ${late.length ? `<table class="t"><thead><tr><th>Candidate</th><th>Stage</th><th>Experience</th><th>Available from</th></tr></thead><tbody>${late.map((a) => { const c = S.ix.cand.get(a.candidateId); return `<tr><td>${esc(c?.name)}</td><td>${stageBadge(a.stage)}</td><td>${c?.totalExp ?? '—'} yrs</td><td>${a.offer?.joiningDate ? fmtDate(a.offer.joiningDate) : fmtDate(earliestJoin(c))}</td></tr>`; }).join('')}</tbody></table>` : '<div class="muted small">No candidates at client stage yet.</div>'}</div></div>`;
  }).join('');
  S.clientReportText = `Hiring status — ${client?.name} — ${fmtDate(new Date())}\n\n${lines.join('\n\n')}\n\nRegards,\n${S.user.name}\nTalent Acquisition, Meridian Technologies`;
  return `<div class="filters no-print"><select data-filter="repClient">${selectOpts(S.data.clients.map((c) => [c.id, c.name]), clientId)}</select><button class="btn" data-act="copy-report">${icon('copy')}Copy as email text</button><span class="muted small">Client-safe: no salaries, billing rates or internal notes.</span></div>
  <div class="card" style="margin-bottom:12px"><div class="card-b"><h2>${esc(client?.name || '')} — hiring status</h2><p class="muted" style="margin:4px 0 0">Prepared ${fmtDateTime(new Date())} by ${esc(S.user.name)}, Meridian Technologies</p></div></div>
  ${html || emptyState('No active requisitions for this client')}`;
}
function reportFunnel() {
  const m = computeMetrics(S.data);
  const reached = STAGES.map((s) => ({ label: s, value: S.data.applications.filter((a) => a.history.some((h) => h.to === s)).length }));
  return `<div class="card" style="margin-bottom:16px"><div class="card-h"><div><h2>Conversion funnel</h2><p>Applications that ever reached each stage (all time, all requisitions)</p></div></div><div class="card-b">
    ${bars(reached, { tip: (r) => `${r.label}: ${r.value} applications reached this stage (${pct(r.value / (reached[0].value || 1), 1)} of all)` })}</div></div>
  <div class="grid g2"><div class="card"><div class="card-h"><div><h2>Reject reasons</h2><p>Why we said no</p></div></div><div class="card-b">${bars(m.rejectReasons.map(([label, value]) => ({ label, value })))}</div></div>
  <div class="card"><div class="card-h"><div><h2>Drop-out reasons</h2><p>Why candidates said no</p></div></div><div class="card-b">${bars(m.dropReasons.map(([label, value]) => ({ label, value })))}</div></div></div>`;
}
function reportTtf() {
  const rows = S.data.jobs.map((j) => {
    const apps = appsOfJob(j.id);
    const firstOffer = apps.map((a) => a.offer?.offeredAt).filter(Boolean).sort()[0];
    const joins = apps.filter((a) => a.stage === 'Joined').map((a) => a.joinedAt || a.updatedAt).sort();
    return { j, firstOffer, firstJoin: joins[0], filled: joins.length, tto: firstOffer ? Math.round((new Date(firstOffer) - new Date(j.createdAt)) / 86400000) : null, ttf: joins[0] ? Math.round((new Date(joins[0]) - new Date(j.createdAt)) / 86400000) : null };
  }).sort((a, b) => b.j.createdAt.localeCompare(a.j.createdAt));
  return `<div class="banner info">${icon('alert')}<span><b>Definitions.</b> Time to offer = requisition opened → first offer made. Time to fill = requisition opened → first candidate actually joined (includes notice period). Agreed with TA Head.</span></div>
  <div class="card table-wrap"><table class="t"><thead><tr><th>Requisition</th><th>Client</th><th>Opened</th><th>Status</th><th class="num">Filled</th><th class="num">Days to first offer</th><th class="num">Days to first join</th></tr></thead><tbody>
  ${rows.map((r) => `<tr class="click" data-href="#/job/${r.j.id}"><td><span class="cell-title">${esc(r.j.title)}</span><div class="cell-sub">${esc(r.j.code)}</div></td><td>${esc(cname(r.j.clientId))}</td><td class="nowrap">${fmtDate(r.j.createdAt)}</td><td>${statusBadge(r.j.status)}</td><td class="num">${r.filled}/${r.j.openings}</td><td class="num">${r.tto ?? '—'}</td><td class="num">${r.ttf ?? '—'}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// ---------- compliance ----------
PAGES.compliance = () => {
  const q = S.data.retention || [];
  const erased = S.data.candidates.filter((c) => c.erased).length;
  const total = S.data.candidates.filter((c) => !c.erased).length;
  return `${pageHead('Data privacy (DPDP Act)', 'Candidate data is held for a purpose and for a limited time.', q.length ? `<button class="btn danger solid" data-act="run-retention">${icon('trash')}Erase ${q.length} due record${q.length > 1 ? 's' : ''}</button>` : '')}
  <div class="kpis">
    <div class="card kpi"><div class="label">Records held</div><div class="value">${total}</div><div class="sub">All with recorded consent</div></div>
    <div class="card kpi"><div class="label">Retention period</div><div class="value">${S.data.settings.retentionMonths}<small> months</small></div><div class="sub">After last activity · <a href="#/settings">change</a></div></div>
    <div class="card kpi"><div class="label">Due for erasure</div><div class="value">${q.length}</div><div class="sub">${q.filter((x) => x.requested).length} by candidate request</div></div>
    <div class="card kpi"><div class="label">Erased to date</div><div class="value">${erased}</div></div>
  </div>
  <div class="card" style="margin-bottom:16px"><div class="card-b small">
    <b>Policy implemented in this system</b>
    <ul style="margin:6px 0 0;padding-left:18px;line-height:1.8">
      <li>Consent is recorded for every candidate (recruiter entry, bulk import or careers portal) with date, method and purpose.</li>
      <li>Candidates not hired and not in an active process are erased ${S.data.settings.retentionMonths} months after their last activity. Joiners move to the HR system and are out of scope here.</li>
      <li>Erasure removes name, phone, email, employer, salary, resume, notes, emails and interview feedback. Anonymous stage history is kept so hiring metrics stay accurate.</li>
      <li>Hiring managers never see salary or contact details; the careers portal shows candidates only their own status, never internal notes or reasons.</li>
      <li>Every change is written to the audit log.</li>
    </ul></div></div>
  <div class="card table-wrap"><div class="card-h"><h2>Erasure queue</h2></div><table class="t"><thead><tr><th>Candidate</th><th>Reason</th><th>Last activity</th><th></th></tr></thead><tbody>
  ${q.map((x) => `<tr><td>${candLink(S.ix.cand.get(x.id))}</td><td>${x.requested ? lvlBadge('critical', 'Candidate requested erasure') : lvlBadge('warning', 'Retention period expired')}</td><td>${fmtDate(x.lastActivity)} <span class="muted small">(${rel(x.lastActivity)})</span></td><td class="right"><button class="btn sm danger" data-act="erase" data-id="${x.id}">Erase now</button></td></tr>`).join('') || `<tr><td colspan="4">${emptyState('Nothing due', 'No records are past the retention period.', 'shield')}</td></tr>`}
  </tbody></table></div>`;
};

// ---------- audit ----------
PAGES.audit = () => {
  const q = (S.f.auq || '').toLowerCase();
  const rows = [...S.data.audit].reverse().filter((a) => (!S.f.auUser || a.userId === S.f.auUser) && (!q || a.summary.toLowerCase().includes(q))).slice(0, 300);
  return `${pageHead('Audit log', 'Who changed what, and when. Kept for accountability and DPDP compliance.')}
  <div class="filters"><input class="input wide" id="auq" data-filter="auq" placeholder="Search…" value="${esc(S.f.auq || '')}"><select data-filter="auUser">${selectOpts([...S.data.users.map((u) => [u.id, u.name]), ['portal', 'Careers portal']], S.f.auUser, 'All users')}</select></div>
  <div class="card table-wrap"><table class="t"><thead><tr><th>When</th><th>User</th><th>What</th></tr></thead><tbody>
  ${rows.map((a) => `<tr><td class="nowrap small">${fmtDateTime(a.at)}</td><td class="nowrap">${esc(uname(a.userId))}</td><td>${esc(a.summary)}</td></tr>`).join('') || `<tr><td colspan="3">${emptyState('No entries')}</td></tr>`}
  </tbody></table></div>`;
};

// ---------- settings ----------
PAGES.settings = () => {
  const s = S.data.settings;
  return `${pageHead('Settings')}
  <div class="grid g2">
    <div class="card"><div class="card-h"><h2>Policies & targets</h2></div><div class="card-b"><form data-form="settings"><div class="form-error hidden"></div><div class="form-grid">
      ${field('Retention period (months)', 'retentionMonths', { type: 'number', value: s.retentionMonths, attrs: 'min="1" max="60"', hint: 'DPDP: erase unhired candidates after this much inactivity' })}
      ${field('Quarterly hiring target', 'quarterTarget', { type: 'number', value: s.quarterTarget, attrs: 'min="1"' })}
      ${field('Default consultancy fee (%)', 'consultancyFeePct', { type: 'number', value: s.consultancyFeePct, attrs: 'step="0.01" min="0"', hint: '% of annual CTC, on joiners only' })}
    </div><button class="btn primary" style="margin-top:12px">Save</button></form></div></div>
    <div class="card"><div class="card-h"><h2>Clients</h2><button class="btn sm" data-act="client">${icon('plus')}Add</button></div><div class="card-b flush"><table class="t"><tbody>
      ${S.data.clients.map((c) => `<tr><td class="cell-title">${esc(c.name)}</td><td>${esc(c.country)} · ${esc(c.industry)}</td><td class="right"><button class="btn sm ghost" data-act="client" data-id="${c.id}">${icon('edit')}</button></td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="card"><div class="card-h"><h2>Users</h2><button class="btn sm" data-act="user">${icon('plus')}Add</button></div><div class="card-b flush table-wrap"><table class="t"><tbody>
      ${S.data.users.map((u) => `<tr><td><div class="row"><span class="avatar sm">${initials(u.name)}</span><div><div class="cell-title">${esc(u.name)}</div><div class="cell-sub">${esc(u.email)}</div></div></div></td><td>${ROLE_LABEL[u.role]}</td><td>${u.active ? '' : '<span class="badge">Inactive</span>'}</td><td class="right"><button class="btn sm ghost" data-act="user" data-id="${u.id}">${icon('edit')}</button></td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="card"><div class="card-h"><h2>Staffing consultancies</h2><button class="btn sm" data-act="consultancy">${icon('plus')}Add</button></div><div class="card-b flush"><table class="t"><tbody>
      ${S.data.consultancies.map((c) => `<tr><td class="cell-title">${esc(c.name)}</td><td class="num">${c.feePct}% of CTC</td><td class="right"><button class="btn sm ghost" data-act="consultancy" data-id="${c.id}">${icon('edit')}</button></td></tr>`).join('')}
    </tbody></table></div></div>
  </div>
  ${S.store.mode === 'local' ? `<div class="card" style="margin-top:16px"><div class="card-h"><div><h2>Demo data</h2><p>Restore the original sample data in this browser.</p></div><button class="btn danger" data-act="reset-demo">${icon('refresh')}Reset demo</button></div></div>` : ''}`;
};

// =====================================================================
// MODALS
// =====================================================================
const footer = (label, form, danger = false) => `<button class="btn" data-act="close-modal" type="button">Cancel</button><button class="btn ${danger ? 'danger solid' : 'primary'}" type="submit" form="${form}">${label}</button>`;

function candidateModal(c = null, jobId = '') {
  const v = c || { source: 'Naukri', noticeDays: 30 };
  const openJobs = S.data.jobs.filter((j) => j.status === 'Open');
  openModal(c ? `Edit ${esc(c.name)}` : 'Add candidate', `<form id="fcand" data-form="candidate" ${c ? `data-id="${c.id}"` : ''}><div class="form-error hidden"></div><div id="dupbox"></div>
    <div class="form-grid">
      ${field('Full name', 'name', { value: v.name, required: true })}
      ${field('Mobile number', 'phone', { value: v.phone, required: true, type: 'tel', placeholder: '98xxxxxxxx', hint: 'Checked for duplicates as you type', attrs: 'data-dup="1" inputmode="tel"' })}
      ${field('Email', 'email', { value: v.email, type: 'email', attrs: 'data-dup="1"' })}
      ${field('Location', 'location', { value: v.location, attrs: 'list="loclist"' })}
      ${field('Current company', 'currentCompany', { value: v.currentCompany })}
      ${field('Current designation', 'currentTitle', { value: v.currentTitle })}
      ${field('Total experience (years)', 'totalExp', { type: 'number', value: v.totalExp, attrs: 'step="0.1" min="0"' })}
      ${field('Notice period (days)', 'noticeDays', { type: 'number', value: v.noticeDays, attrs: 'min="0" max="180"' })}
      ${field('Current CTC (₹ lakhs p.a.)', 'currentCtc', { type: 'number', value: v.currentCtc, attrs: 'step="0.1" min="0"' })}
      ${field('Expected CTC (₹ lakhs p.a.)', 'expectedCtc', { type: 'number', value: v.expectedCtc, attrs: 'step="0.1" min="0"' })}
      ${field('Last working day (if serving notice)', 'lastWorkingDay', { type: 'date', value: v.lastWorkingDay?.slice(0, 10) })}
      ${field('Other offers in hand', 'competingOffers', { type: 'number', value: v.competingOffers ?? 0, attrs: 'min="0"' })}
      ${field('Skills', 'skills', { value: (v.skills || []).join(', '), full: true, placeholder: 'Java, Spring Boot, Kafka', hint: 'Comma separated' })}
      ${field('Source', 'source', { options: SOURCES, value: v.source, required: true, attrs: 'data-source="1"' })}
      <div class="field" id="srcdetail">${sourceDetailInput(v.source, v.sourceDetail)}</div>
      ${!c ? field('Add to requisition', 'jobId', { options: [['', '— Not yet —'], ...openJobs.map((j) => [j.id, `${j.code} · ${j.title} (${cname(j.clientId)})`])], value: jobId, full: true }) : ''}
      ${c ? field('Owner (recruiter)', 'ownerId', { options: staffUsers().map((u) => [u.id, u.name]), value: c.ownerId }) : ''}
      ${!c ? `<div class="field full"><label>Resume (optional)</label><input type="file" name="resume" accept=".pdf,.doc,.docx,.txt"></div>
      <label class="check full"><input type="checkbox" name="consent" required> <span>The candidate has consented to Meridian Technologies processing their personal data for recruitment (DPDP Act). <span class="muted">Required.</span></span></label>` : ''}
    </div><datalist id="loclist">${LOCATIONS.concat(['Mumbai', 'Hyderabad', 'Chennai']).map((l) => `<option value="${l}">`).join('')}</datalist></form>`,
  { wide: true, footer: footer(c ? 'Save changes' : 'Save candidate', 'fcand') });
}
function sourceDetailInput(source, value = '') {
  if (source === 'Consultancy') return `<label>Consultancy <span class="req">*</span></label><select name="sourceDetail" required>${selectOpts(S.data.consultancies.map((c) => c.name), value, '— Select —')}</select>`;
  if (source === 'Referral') return `<label>Referred by</label><input name="sourceDetail" value="${esc(value)}" placeholder="Employee name">`;
  return `<label>Source detail</label><input name="sourceDetail" value="${esc(value)}" placeholder="Optional">`;
}
function dupHtml(d) {
  if (!d?.length) return '';
  return `<div class="dup-box" style="margin-bottom:12px"><h4>${icon('alert')}This person may already be in the system</h4>${d.map((x) => `<div style="margin-top:6px"><b>${esc(x.name)}</b> <span class="muted small">matched on ${x.matchedOn} · owner ${esc(x.owner)}${x.lastContact ? ` · last contacted ${rel(x.lastContact.at)} by ${esc(x.lastContact.by)}` : ''}</span>
    <div class="small">${x.applications.length ? x.applications.map((a) => `${esc(a.jobTitle)} — <b>${esc(a.stage)}</b>`).join(' · ') : 'No applications'}</div>
    <a href="#/candidate/${x.id}" data-act="close-modal-go" data-href="#/candidate/${x.id}" class="small">Open existing record →</a></div>`).join('')}
    <label class="check" style="margin-top:10px"><input type="checkbox" name="force"> <span class="small">This is a different person — save anyway</span></label></div>`;
}

function jobModal(j = null) {
  const v = j || { type: 'Project', openings: 1, billingCurrency: 'USD', recruiterId: S.user.role === 'recruiter' ? S.user.id : '', published: true };
  openModal(j ? `Edit ${esc(j.code)}` : 'New requisition', `<form id="fjob" data-form="job" ${j ? `data-id="${j.id}"` : ''}><div class="form-error hidden"></div><div class="form-grid">
    ${field('Job title', 'title', { value: v.title, required: true, full: true })}
    ${field('Client', 'clientId', { options: [['', '— Select —'], ...S.data.clients.map((c) => [c.id, c.name])], value: v.clientId, required: true })}
    ${field('Project', 'project', { value: v.project })}
    ${field('Type', 'type', { options: [['Project', 'Client project'], ['Bench', 'Bench (no client round)']], value: v.type })}
    ${field('Openings', 'openings', { type: 'number', value: v.openings, attrs: 'min="1"' })}
    ${field('Experience min (yrs)', 'expMin', { type: 'number', value: v.expMin, attrs: 'min="0"' })}
    ${field('Experience max (yrs)', 'expMax', { type: 'number', value: v.expMax, attrs: 'min="0"' })}
    ${field('CTC min (₹ lakhs)', 'ctcMin', { type: 'number', value: v.ctcMin, attrs: 'step="0.1"' })}
    ${field('CTC max (₹ lakhs)', 'ctcMax', { type: 'number', value: v.ctcMax, attrs: 'step="0.1"' })}
    ${field('Billing rate (per hour)', 'billingRate', { type: 'number', value: v.billingRate, attrs: 'step="0.5"' })}
    ${field('Billing currency', 'billingCurrency', { options: ['USD', 'GBP', 'EUR', 'INR'], value: v.billingCurrency })}
    ${field('Location', 'location', { options: LOCATIONS, value: v.location })}
    ${field('Target closure date', 'targetDate', { type: 'date', value: v.targetDate?.slice(0, 10), required: true })}
    ${field('Project start date', 'projectStart', { type: 'date', value: v.projectStart?.slice(0, 10), hint: 'Used to check every candidate\'s notice period' })}
    ${field('Recruiter', 'recruiterId', { options: [['', '— Unassigned —'], ...staffUsers().map((u) => [u.id, u.name])], value: v.recruiterId })}
    ${field('Hiring manager', 'hiringManagerId', { options: [['', '— None —'], ...hmUsers().map((u) => [u.id, u.name])], value: v.hiringManagerId })}
    ${j ? field('Status', 'status', { options: ['Open', 'On Hold', 'Filled', 'Closed'], value: v.status }) : ''}
    ${field('Skills required', 'skills', { value: (v.skills || []).join(', '), full: true, hint: 'Comma separated — used for matching and search' })}
    ${field('Job description', 'description', { type: 'textarea', value: v.description, full: true })}
    <label class="check full"><input type="checkbox" name="published" ${v.published ? 'checked' : ''}> Publish on careers portal (client name and pay are never shown)</label>
  </div></form>`, { wide: true, footer: footer(j ? 'Save changes' : 'Create requisition', 'fjob') });
}

function reasonModal(a, to) {
  const reasons = to === 'Rejected' ? REJECT_REASONS : DROP_REASONS;
  const c = S.ix.cand.get(a.candidateId);
  openModal(`${to === 'Rejected' ? 'Reject' : 'Mark as dropped out'} — ${esc(c.name)}`, `<form id="freason" data-form="reason" data-app="${a.id}" data-to="${to}"><div class="form-error hidden"></div>
    ${field(to === 'Rejected' ? 'Reject reason' : 'Why did they drop out?', 'reason', { options: [['', '— Select —'], ...reasons], required: true })}
    <div style="margin-top:12px">${field('Note (optional)', 'note', { type: 'textarea' })}</div>
    <p class="small muted" style="margin-top:8px">Reason codes feed the funnel report. The candidate will only ever see “Closed”.</p></form>`, { footer: footer(to === 'Rejected' ? 'Reject' : 'Mark dropped out', 'freason', true) });
}
function offerModal(a, thenMove = '') {
  const c = S.ix.cand.get(a.candidateId); const o = a.offer || {};
  const def = new Date(earliestJoin(c)); const j = S.ix.job.get(a.jobId);
  openModal(`Offer — ${esc(c.name)}`, `<form id="foffer" data-form="offer" data-app="${a.id}" data-then="${thenMove}"><div class="form-error hidden"></div>
    <div class="mini-stats" style="margin-bottom:12px"><span>Current <b>${lakhs(c.currentCtc)}</b></span><span>Expected <b>${lakhs(c.expectedCtc)}</b></span><span>Band <b>${lakhs(j?.ctcMin)}–${lakhs(j?.ctcMax)}</b></span><span>Earliest joining <b>${fmtDate(def)}</b></span></div>
    <div class="form-grid">${field('Offered CTC (₹ lakhs p.a.)', 'ctc', { type: 'number', value: o.ctc, required: true, attrs: 'step="0.1" min="0"' })}
    ${field('Joining date', 'joiningDate', { type: 'date', value: o.joiningDate || def.toISOString().slice(0, 10), required: true })}
    ${field('Joining bonus (₹)', 'joiningBonus', { type: 'number', value: o.joiningBonus })}
    <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="noticeBuyout" ${o.noticeBuyout ? 'checked' : ''}> Notice buyout offered</label></div>
    <label class="check full"><input type="checkbox" name="accepted" ${o.acceptedAt ? 'checked' : ''}> Candidate has accepted the offer</label></div></form>`, { footer: footer(thenMove ? `Save & move to ${thenMove}` : 'Save offer', 'foffer') });
}
function approvalModal(a, thenMove = '') {
  const c = S.ix.cand.get(a.candidateId); const j = S.ix.job.get(a.jobId); const v = a.clientApproval || {};
  openModal(`Client approval — ${esc(c.name)}`, `<form id="fappr" data-form="approval" data-app="${a.id}" data-then="${thenMove}"><div class="form-error hidden"></div>
    ${thenMove ? `<p class="small muted">${esc(cname(j.clientId))} must approve this candidate before an offer can be made.</p>` : ''}
    <div class="form-grid">${field('Decision', 'status', { options: ['Approved', 'Pending', 'Rejected'], value: v.status || 'Approved' })}
    ${field('Approved by (client contact)', 'approver', { value: v.by || S.ix.client.get(j.clientId)?.contact || '' })}
    ${field('Note', 'note', { type: 'textarea', value: v.note, full: true })}</div></form>`, { footer: footer(thenMove ? 'Save & continue' : 'Save', 'fappr') });
}
function bgvModal(a, thenMove = '') {
  const c = S.ix.cand.get(a.candidateId); const v = a.bgv || {};
  openModal(`Background verification — ${esc(c.name)}`, `<form id="fbgv" data-form="bgv" data-app="${a.id}" data-then="${thenMove}">${thenMove ? '<p class="small muted">Background verification must be Clear before the candidate can be marked as joined.</p>' : ''}<div class="form-error hidden"></div><div class="form-grid">
    ${field('Status', 'status', { options: BGV_STATUSES, value: v.status || 'Initiated' })}${field('Vendor', 'vendor', { value: v.vendor })}
    ${field('Remarks', 'remarks', { type: 'textarea', value: v.remarks, full: true })}</div></form>`, { footer: footer(thenMove ? 'Save & continue' : 'Save', 'fbgv') });
}
function interviewModal(a) {
  const c = S.ix.cand.get(a.candidateId); const j = S.ix.job.get(a.jobId);
  const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(11, 0, 0, 0);
  const isClient = a.stage === 'Client Round';
  openModal(`Schedule interview — ${esc(c.name)}`, `<form id="fint" data-form="interview" data-app="${a.id}"><div class="form-error hidden"></div><div class="form-grid">
    ${field('Round', 'round', { options: [['Internal', 'Internal'], ['Client', 'Client']], value: isClient ? 'Client' : 'Internal' })}
    ${field('Title', 'title', { value: isClient ? `${cname(j.clientId)} technical round` : 'Technical round' })}
    ${field('Date & time', 'at', { type: 'datetime-local', value: toLocalInput(t), required: true })}
    ${field('Duration (minutes)', 'durationMin', { type: 'number', value: 60 })}
    ${field('Panel', 'panel', { value: isClient ? `${S.ix.client.get(j.clientId)?.contact || ''}, ${uname(j.hiringManagerId)}` : uname(j.hiringManagerId), required: true, full: true, hint: 'Comma separated names' })}
    ${field('Mode', 'mode', { options: ['Video', 'In person', 'Phone'] })}${field('Meeting link', 'link', { placeholder: 'https://…' })}</div></form>`,
  { footer: footer('Schedule', 'fint') });
}
function feedbackModal(iv) {
  const a = S.ix.app.get(iv.applicationId); const c = S.ix.cand.get(a.candidateId);
  openModal(`Interview feedback — ${esc(c.name)}`, `<form id="ffb" data-form="feedback" data-id="${iv.id}"><div class="form-error hidden"></div>
    <p class="small muted">${esc(iv.title)} · ${fmtDateTime(iv.at)} · panel: ${esc(iv.panel.join(', '))}</p><div class="form-grid">
    ${field('Result', 'result', { options: INTERVIEW_RESULTS, value: iv.result === 'Scheduled' && new Date(iv.at) < new Date() ? 'Selected' : iv.result })}
    ${field('Rating (1–5)', 'rating', { type: 'number', value: iv.rating, attrs: 'min="1" max="5"' })}
    ${field('Feedback', 'feedback', { type: 'textarea', value: iv.feedback, full: true, placeholder: 'Strengths, gaps, recommendation…' })}</div></form>`, { footer: footer('Save feedback', 'ffb') });
}
function contactModal(c) {
  openModal(`Log contact — ${esc(c.name)}`, `<form id="fcontact" data-form="contact" data-id="${c.id}"><div class="form-error hidden"></div><div class="form-grid">
    ${field('Channel', 'channel', { options: ['Call', 'WhatsApp', 'SMS', 'Email'] })}${field('Other offers in hand', 'competingOffers', { type: 'number', value: c.competingOffers ?? 0, attrs: 'min="0"', hint: 'Updating this feeds the drop-risk flag' })}
    ${field('Summary', 'summary', { type: 'textarea', full: true, placeholder: 'What was discussed?' })}</div>
    <p class="small muted">Logged contacts are visible to every recruiter, so nobody calls the same candidate twice in a day.</p></form>`, { footer: footer('Log', 'fcontact') });
}
function applyModal(c) {
  const mine = new Set(appsOfCand(c.id).map((a) => a.jobId));
  const jobs = S.data.jobs.filter((j) => j.status === 'Open' && !mine.has(j.id));
  openModal(`Add ${esc(c.name)} to a requisition`, `<form id="fapply" data-form="apply" data-id="${c.id}"><div class="form-error hidden"></div>
    ${field('Requisition', 'jobId', { options: [['', '— Select —'], ...jobs.map((j) => { const f = noticeFit(c, j); return [j.id, `${j.code} · ${j.title} (${cname(j.clientId)})${f.level === 'critical' ? ' — notice too long' : ''}`]; })], required: true })}
    ${appsOfCand(c.id).filter(isActiveApp).length ? `<div class="banner" style="margin-top:12px">${icon('alert')}Already active in ${appsOfCand(c.id).filter(isActiveApp).length} other process(es). Coordinate with the owning recruiter.</div>` : ''}</form>`, { footer: footer('Add to pipeline', 'fapply') });
}
const TEMPLATES = {
  'Interview invitation': { subject: 'Interview invitation — {{job}} | Meridian Technologies', body: 'Dear {{first}},\n\nThank you for your interest in the {{job}} role at Meridian Technologies. We would like to invite you for an interview on {{interview}}.\n\nPlease reply to confirm your availability.\n\nRegards,\n{{me}}\nTalent Acquisition, Meridian Technologies' },
  'BGV documents': { subject: 'Documents required for background verification', body: 'Dear {{first}},\n\nCongratulations once again on your offer for {{job}}. To start background verification, please share:\n\n• Last 3 months\' payslips\n• Relieving letters from previous employers\n• Highest education certificate\n• PAN and Aadhaar (masked)\n\nRegards,\n{{me}}' },
  'Offer follow-up': { subject: 'Checking in — your joining on {{joining}}', body: 'Dear {{first}},\n\nJust checking in ahead of your joining date ({{joining}}). Is there anything we can help with — notice period, relocation or documents?\n\nLooking forward to having you on board.\n\nRegards,\n{{me}}' },
  'Status update': { subject: 'Update on your application — {{job}}', body: 'Dear {{first}},\n\nA quick update on your application for {{job}}: we are currently at the {{stage}} stage. I will get back to you as soon as we hear more.\n\nYou can also track your status online with reference {{ref}}.\n\nRegards,\n{{me}}' },
  Regret: { subject: 'Your application — {{job}}', body: 'Dear {{first}},\n\nThank you for your time and interest in the {{job}} role. After careful consideration, we will not be moving forward at this time. We will keep you in mind for future openings that match your profile.\n\nRegards,\n{{me}}' },
  Blank: { subject: '', body: '' }
};
function emailModal(c) {
  const apps = appsOfCand(c.id).sort((a, b) => Number(isActiveApp(b)) - Number(isActiveApp(a)));
  openModal(`Email ${esc(c.name)}`, `<form id="fmail" data-form="email" data-id="${c.id}"><div class="form-error hidden"></div><div class="form-grid">
    ${field('Template', 'template', { options: Object.keys(TEMPLATES), attrs: 'data-tpl="1"' })}
    ${field('Regarding', 'applicationId', { options: apps.map((a) => [a.id, S.ix.job.get(a.jobId)?.title]), attrs: 'data-tpl="1"' })}
    ${field('To', 'to', { value: c.email, attrs: 'disabled' })}
    ${field('Subject', 'subject', { required: true, full: true })}
    ${field('Message', 'body', { type: 'textarea', full: true, attrs: 'rows="11"' })}</div>
    <p class="small muted">Opens in your email app (Outlook/Gmail) with this text and records it on the candidate's timeline.</p></form>`, { wide: true, footer: footer(`${icon('mail')} Open in email app & log`, 'fmail') });
  fillTemplate();
}
function fillTemplate() {
  const f = $('#fmail'); if (!f) return;
  const c = S.ix.cand.get(f.dataset.id); const a = S.ix.app.get(f.applicationId?.value); const j = a && S.ix.job.get(a.jobId);
  const iv = a && (S.ix.ivByApp.get(a.id) || []).filter((i) => new Date(i.at) > new Date()).sort((x, y) => x.at.localeCompare(y.at))[0];
  const vars = { first: c.name.split(' ')[0], name: c.name, job: j?.title || 'the role', stage: a?.stage || '', ref: a?.ref || '', joining: fmtDate(a?.offer?.joiningDate), interview: iv ? fmtDateTime(iv.at) : '[date and time]', me: S.user.name };
  const t = TEMPLATES[f.template.value]; const sub = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  f.subject.value = sub(t.subject); f.body.value = sub(t.body);
}
function importModal() {
  const openJobs = S.data.jobs.filter((j) => j.status === 'Open');
  openModal('Import candidates from Excel / CSV', `<form id="fimport" data-form="import"><div class="form-error hidden"></div>
    <p class="small">Save your Excel sheet as CSV. Recognised columns: <b>name, phone</b> (required), email, company, designation, current ctc, expected ctc, notice, experience, skills, location, source, consultancy. Duplicates (same phone or email) are skipped and reported.</p>
    <p><a href="#" data-act="csv-template">${icon('download')} Download a template</a></p>
    <div class="form-grid"><div class="field full"><label>CSV file <span class="req">*</span></label><input type="file" name="file" accept=".csv,text/csv" required data-csv="1"></div>
    ${field('Add everyone to requisition (optional)', 'jobId', { options: [['', '— None —'], ...openJobs.map((j) => [j.id, `${j.code} · ${j.title}`])], full: true })}</div>
    <div id="csvpreview" class="small" style="margin-top:10px"></div>
    <label class="check" style="margin-top:12px"><input type="checkbox" name="consent" required> These candidates consented to processing of their data for recruitment.</label></form>`, { wide: true, footer: footer('Import', 'fimport') });
}
const CSV_MAP = { name: ['name', 'full name', 'candidate', 'candidate name'], phone: ['phone', 'mobile', 'mobile number', 'contact', 'phone number'], email: ['email', 'email id', 'e-mail'], currentCompany: ['company', 'current company', 'employer'], currentTitle: ['designation', 'title', 'current designation', 'role'], currentCtc: ['current ctc', 'ctc', 'cctc'], expectedCtc: ['expected ctc', 'ectc'], noticeDays: ['notice', 'notice period', 'notice days'], totalExp: ['experience', 'total experience', 'exp', 'total exp'], skills: ['skills', 'key skills', 'skillset'], location: ['location', 'city', 'current location'], source: ['source'], sourceDetail: ['consultancy', 'source detail', 'referred by'] };
function csvRows(text) {
  const rows = parseCsv(text); if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(Object.entries(CSV_MAP).map(([k, alts]) => [k, head.findIndex((h) => alts.includes(h))]));
  return rows.slice(1).map((r) => { const o = {}; for (const [k, i] of Object.entries(idx)) if (i >= 0) o[k] = (r[i] || '').trim(); if (o.skills) o.skills = o.skills.replace(/;/g, ','); if (o.source && !SOURCES.includes(o.source)) o.source = SOURCES.find((s) => s.toLowerCase() === o.source.toLowerCase()) || 'Direct'; return o; });
}
function userModal(u = null) {
  const v = u || { role: 'recruiter', active: true };
  openModal(u ? 'Edit user' : 'Add user', `<form id="fuser" data-form="user" ${u ? `data-id="${u.id}"` : ''}><div class="form-error hidden"></div><div class="form-grid">
    ${field('Name', 'name', { value: v.name, required: true })}${field('Email', 'email', { value: v.email, type: 'email', required: true })}
    ${field('Role', 'role', { options: Object.entries(ROLE_LABEL), value: v.role })}${field('Status', 'active', { options: [['true', 'Active'], ['false', 'Inactive']], value: String(v.active !== false) })}
    ${S.store.mode === 'server' ? field(u ? 'New password (leave blank to keep)' : 'Password', 'password', { type: 'password', required: !u, hint: 'At least 8 characters' }) : ''}</div></form>`, { footer: footer('Save', 'fuser') });
}
function clientModal(c = null) {
  const v = c || {};
  openModal(c ? 'Edit client' : 'Add client', `<form id="fclient" data-form="client" ${c ? `data-id="${c.id}"` : ''}><div class="form-error hidden"></div><div class="form-grid">
    ${field('Name', 'name', { value: v.name, required: true })}${field('Country', 'country', { value: v.country })}${field('Industry', 'industry', { value: v.industry })}${field('Client contact (for approvals)', 'contact', { value: v.contact })}</div></form>`, { footer: footer('Save', 'fclient') });
}
function consultancyModal(c = null) {
  const v = c || { feePct: S.data.settings.consultancyFeePct };
  openModal(c ? 'Edit consultancy' : 'Add consultancy', `<form id="fcons" data-form="consultancy" ${c ? `data-id="${c.id}"` : ''}><div class="form-error hidden"></div><div class="form-grid">
    ${field('Name', 'name', { value: v.name, required: true })}${field('Fee (% of annual CTC)', 'feePct', { type: 'number', value: v.feePct, attrs: 'step="0.01"' })}</div></form>`, { footer: footer('Save', 'fcons') });
}

// =====================================================================
// ACTIONS
// =====================================================================
async function moveTo(appId, to) {
  const a = S.ix.app.get(appId); if (!a || a.stage === to) return;
  const j = S.ix.job.get(a.jobId);
  if (CLOSED.includes(to)) return reasonModal(a, to);
  const toIdx = STAGES.indexOf(to);
  if (toIdx >= STAGES.indexOf('Offered') && j.type !== 'Bench' && a.clientApproval?.status !== 'Approved') return approvalModal(a, to);
  if (toIdx >= STAGES.indexOf('BGV') && !a.offer?.ctc) return offerModal(a, to);
  if (to === 'Joined' && a.bgv?.status !== 'Clear') return bgvModal(a, to);
  await act('moveStage', { applicationId: appId, to }, { ok: `Moved to ${to}` }).catch(() => {});
  if (to === 'Offered' && !S.ix.app.get(appId)?.offer) offerModal(S.ix.app.get(appId));
}

const ACT = {
  'close-modal': () => closeModal(),
  'close-modal-go': (el) => { closeModal(); go(el.dataset.href); },
  menu: () => $('#sidebar').classList.toggle('open'),
  theme: () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next;
    try { localStorage.setItem('mats-theme', next); } catch { /* ignore */ }
  },
  logout: async () => { await S.store.logout(); S.user = null; S.data = null; location.hash = ''; renderLogin(); },
  set: (el) => { S.f[el.dataset.k] = el.dataset.v; renderContent(); },
  'clear-cfilters': () => { for (const k of Object.keys(S.f)) if (k.startsWith('c')) delete S.f[k]; renderContent(); },
  'new-candidate': (el) => candidateModal(null, el.dataset.job || ''),
  'edit-candidate': (el) => candidateModal(S.ix.cand.get(el.dataset.id)),
  'new-job': () => jobModal(),
  'edit-job': (el) => jobModal(S.ix.job.get(el.dataset.id)),
  move: (el) => moveTo(el.dataset.app, el.dataset.to),
  reopen: (el) => { const a = S.ix.app.get(el.dataset.app); const back = [...a.history].reverse().find((h) => STAGES.includes(h.to) && h.to !== 'Joined')?.to || 'Applied'; act('moveStage', { applicationId: a.id, to: back, note: 'Reopened' }, { ok: `Reopened at ${back}` }).catch(() => {}); },
  schedule: (el) => interviewModal(S.ix.app.get(el.dataset.app)),
  offer: (el) => offerModal(S.ix.app.get(el.dataset.app)),
  bgv: (el) => bgvModal(S.ix.app.get(el.dataset.app)),
  approval: (el) => approvalModal(S.ix.app.get(el.dataset.app)),
  feedback: (el) => feedbackModal(S.data.interviews.find((i) => i.id === el.dataset.id)),
  'log-contact': (el) => contactModal(S.ix.cand.get(el.dataset.id)),
  email: (el) => emailModal(S.ix.cand.get(el.dataset.id)),
  apply: (el) => applyModal(S.ix.cand.get(el.dataset.id)),
  'quick-apply': (el) => act('applyToJob', { candidateId: el.dataset.cand, jobId: el.dataset.job }, { ok: 'Added to pipeline' }).catch(() => {}),
  import: () => importModal(),
  'csv-template': () => download('candidates-template.csv', toCsv([['name', 'phone', 'email', 'company', 'designation', 'current ctc', 'expected ctc', 'notice', 'experience', 'skills', 'location', 'source', 'consultancy'], ['Asha Verma', '9876543210', 'asha@example.com', 'Infosys', 'Senior Engineer', '14', '19', '60', '6', 'Java; Spring Boot; Kafka', 'Pune', 'Naukri', '']])),
  'export-candidates': () => {
    const list = S.data.candidates.filter((c) => candidateMatches(c, S.f) && !c.erased);
    download(`candidates-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([['Name', 'Phone', 'Email', 'Company', 'Designation', 'Experience', 'Notice days', 'Current CTC (L)', 'Expected CTC (L)', 'Skills', 'Location', 'Source', 'Source detail', 'Owner', 'Applications'],
      ...list.map((c) => [c.name, c.phone, c.email, c.currentCompany, c.currentTitle, c.totalExp, c.noticeDays, c.currentCtc, c.expectedCtc, (c.skills || []).join('; '), c.location, c.source, c.sourceDetail, uname(c.ownerId), appsOfCand(c.id).map((a) => `${S.ix.job.get(a.jobId)?.code}:${a.stage}`).join('; ')])]));
  },
  'export-sources': () => { const m = computeMetrics(S.data); download('source-effectiveness.csv', toCsv([['Source', 'Applications', 'Interviewed', 'Offered', 'Joined', 'Dropped after offer', 'Conversion %', 'Fees (INR)', 'Cost per hire (INR)'], ...m.sourceRows.map((r) => [r.source, r.applications, r.interviewed, r.offered, r.joined, r.dropped, (r.conversion * 100).toFixed(1), r.fees, r.costPerHire])])); },
  'copy-report': async () => { try { await navigator.clipboard.writeText(S.clientReportText); toast('Copied — paste into your email to the client'); } catch { toast('Could not access clipboard', 'err'); } },
  print: () => window.print(),
  'view-resume': async (el) => {
    try {
      const f = await S.store.file(el.dataset.id);
      const blob = await (await fetch(f.dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank'); if (!w) download(f.name, blob, blob.type);
    } catch (e) { toast(e.message, 'err'); }
  },
  erase: (el) => {
    const c = S.ix.cand.get(el.dataset.id);
    openModal('Erase personal data?', `<form id="ferase" data-form="erase" data-id="${c.id}"><div class="form-error hidden"></div><p>This permanently removes <b>${esc(c.name)}</b>'s name, contact details, salary, resume, notes, emails and interview feedback. Anonymous pipeline history is kept for reporting. <b>This cannot be undone.</b></p>
      ${field('Reason', 'reason', { options: ['Candidate requested erasure', 'Retention period expired', 'Consent withdrawn', 'Data entered in error'], value: c.erasureRequested ? 'Candidate requested erasure' : 'Retention period expired' })}</form>`, { footer: footer('Erase permanently', 'ferase', true) });
  },
  'run-retention': () => openModal('Run retention?', `<form id="fret" data-form="retention"><p>Erase personal data for <b>${S.data.retention.length}</b> candidate record(s) that are past the ${S.data.settings.retentionMonths}-month retention period or asked to be erased. This cannot be undone.</p></form>`, { footer: footer('Erase all due records', 'fret', true) }),
  user: (el) => userModal(el.dataset.id ? S.data.users.find((u) => u.id === el.dataset.id) : null),
  client: (el) => clientModal(el.dataset.id ? S.ix.client.get(el.dataset.id) : null),
  consultancy: (el) => consultancyModal(el.dataset.id ? S.data.consultancies.find((c) => c.id === el.dataset.id) : null),
  'reset-demo': async () => { if (!confirm('Reset all demo data in this browser?')) return; await S.store.reset(); await refresh(true); renderContent(); toast('Demo data restored'); }
};

const num = (v) => (v === '' ? undefined : v);
const FORMS = {
  candidate: async (f) => {
    const d = formData(f); const id = f.dataset.id;
    const file = f.resume?.files?.[0];
    if (file && file.size > 2 * 1024 * 1024) { const e = f.querySelector('.form-error'); e.textContent = 'Resume must be under 2 MB'; e.classList.remove('hidden'); return; }
    try {
      const r = await act(id ? 'updateCandidate' : 'createCandidate', { ...d, id, force: !!d.force }, { form: f, ok: id ? 'Candidate updated' : 'Candidate added', silent: true });
      const cid = id || r.candidate.id;
      if (file) await S.store.act('uploadResume', { candidateId: cid, name: file.name, dataUrl: await readFileAsDataUrl(file) }).catch((e) => toast(`Saved, but resume upload failed: ${e.message}`, 'err'));
      closeModal(); await refresh(true);
      if (!id) go(`#/candidate/${cid}`); else renderContent();
    } catch (e) { if (e.duplicates) $('#dupbox').innerHTML = dupHtml(e.duplicates); }
  },
  job: async (f) => {
    const d = formData(f); const id = f.dataset.id;
    const r = await act(id ? 'updateJob' : 'createJob', { ...d, id }, { form: f, ok: id ? 'Requisition updated' : 'Requisition created', silent: true }).catch(() => null);
    if (!r) return; closeModal(); if (!id) go(`#/job/${r.job.id}`); else renderContent();
  },
  reason: async (f) => { const d = formData(f); await act('moveStage', { applicationId: f.dataset.app, to: f.dataset.to, reason: d.reason, note: d.note }, { form: f, ok: `Marked ${f.dataset.to.toLowerCase()}` }).then(closeModal).catch(() => {}); },
  offer: async (f) => {
    const d = formData(f);
    try {
      await act('saveOffer', { applicationId: f.dataset.app, ...d, ctc: num(d.ctc), joiningBonus: num(d.joiningBonus) }, { form: f, ok: 'Offer saved', silent: true });
      closeModal();
      if (f.dataset.then) await moveTo(f.dataset.app, f.dataset.then); else renderContent();
    } catch { /* shown */ }
  },
  approval: async (f) => {
    const d = formData(f);
    try {
      await act('setClientApproval', { applicationId: f.dataset.app, ...d }, { form: f, ok: `Client approval: ${d.status}`, silent: true });
      closeModal();
      if (f.dataset.then && d.status === 'Approved') await moveTo(f.dataset.app, f.dataset.then); else renderContent();
    } catch { /* shown */ }
  },
  bgv: async (f) => {
    const d = formData(f);
    try {
      await act('updateBgv', { applicationId: f.dataset.app, ...d }, { form: f, ok: 'BGV updated', silent: true });
      closeModal();
      if (f.dataset.then && d.status === 'Clear') await moveTo(f.dataset.app, f.dataset.then); else renderContent();
    } catch { /* shown */ }
  },
  interview: async (f) => { const d = formData(f); await act('scheduleInterview', { applicationId: f.dataset.app, ...d, at: new Date(d.at).toISOString() }, { form: f, ok: 'Interview scheduled' }).then(closeModal).catch(() => {}); },
  feedback: async (f) => { await act('updateInterview', { id: f.dataset.id, ...formData(f) }, { form: f, ok: 'Feedback saved' }).then(closeModal).catch(() => {}); },
  contact: async (f) => { await act('logContact', { candidateId: f.dataset.id, ...formData(f) }, { form: f, ok: 'Contact logged' }).then(closeModal).catch(() => {}); },
  apply: async (f) => { await act('applyToJob', { candidateId: f.dataset.id, jobId: formData(f).jobId }, { form: f, ok: 'Added to pipeline' }).then(closeModal).catch(() => {}); },
  note: async (f) => { const d = formData(f); await act('addNote', { candidateId: f.dataset.id, body: d.body, applicationId: d.applicationId || null }, { form: f, ok: 'Note added' }).catch(() => {}); },
  email: async (f) => {
    const d = formData(f); const c = S.ix.cand.get(f.dataset.id);
    try {
      await act('logEmail', { candidateId: c.id, subject: d.subject, body: d.body, template: d.template }, { form: f, ok: 'Email logged', silent: true });
      window.location.href = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
      closeModal(); renderContent();
    } catch { /* shown */ }
  },
  import: async (f) => {
    const file = f.file.files[0]; if (!file) return;
    const rows = csvRows(await file.text());
    if (!rows.length) { const e = f.querySelector('.form-error'); e.textContent = 'No rows found — check the header row'; e.classList.remove('hidden'); return; }
    const d = formData(f);
    const r = await act('importCandidates', { rows, jobId: d.jobId || null, consent: d.consent }, { form: f, silent: true }).catch(() => null);
    if (!r) return;
    $('#csvpreview').innerHTML = `<div class="banner info">Imported <b>${r.added}</b> candidate(s). ${r.skipped.length ? `Skipped ${r.skipped.length}:` : ''}</div>${r.skipped.length ? `<table class="t"><tbody>${r.skipped.slice(0, 50).map((s) => `<tr><td>Row ${s.row}</td><td>${esc(s.name || '')}</td><td>${esc(s.why)}</td></tr>`).join('')}</tbody></table>` : ''}`;
    f.closest('dialog').querySelector('.modal-f').innerHTML = '<button class="btn primary" data-act="close-modal">Done</button>';
    renderContent();
  },
  erase: async (f) => { await act('eraseCandidate', { id: f.dataset.id, reason: formData(f).reason }, { form: f, ok: 'Personal data erased' }).then(closeModal).catch(() => {}); },
  retention: async (f) => { await act('runRetention', {}, { form: f }).then((r) => { toast(`Erased ${r.erased} record(s)`); closeModal(); }).catch(() => {}); },
  settings: async (f) => { await act('updateSettings', formData(f), { form: f, ok: 'Settings saved' }).catch(() => {}); },
  user: async (f) => { await act('saveUser', { ...formData(f), id: f.dataset.id }, { form: f, ok: 'User saved' }).then(closeModal).catch(() => {}); },
  client: async (f) => { await act('saveClient', { ...formData(f), id: f.dataset.id }, { form: f, ok: 'Client saved' }).then(closeModal).catch(() => {}); },
  consultancy: async (f) => { await act('saveConsultancy', { ...formData(f), id: f.dataset.id }, { form: f, ok: 'Consultancy saved' }).then(closeModal).catch(() => {}); }
};

// ---------- global events ----------
function installEvents() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) { e.preventDefault(); ACT[a.dataset.act]?.(a, e); return; }
    const row = e.target.closest('[data-href]');
    if (row && !e.target.closest('a, button, input, select, label')) { go(row.dataset.href); return; }
    if (!e.target.closest('.search')) $('#gresults')?.classList.add('hidden');
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]');
    if (f) { e.preventDefault(); const btn = document.querySelector(`button[form="${f.id}"]`) || f.querySelector('button:not([type=button])'); if (btn) btn.disabled = true; Promise.resolve(FORMS[f.dataset.form](f)).finally(() => { if (btn) btn.disabled = false; }); }
  });
  let t;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.filter && el.tagName === 'INPUT') { S.f[el.dataset.filter] = el.value; clearTimeout(t); t = setTimeout(renderContent, 220); }
    if (el.id === 'gsearch') globalSearch(el.value);
    if (el.dataset.dup) { clearTimeout(t); t = setTimeout(() => checkDup(el.form), 350); }
  });
  document.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.filter && el.tagName === 'SELECT') { S.f[el.dataset.filter] = el.value; renderContent(); }
    if (el.dataset.source) $('#srcdetail').innerHTML = sourceDetailInput(el.value);
    if (el.dataset.tpl) fillTemplate();
    if (el.dataset.upload) {
      const file = el.files[0]; if (!file) return;
      if (file.size > 2 * 1024 * 1024) return toast('Resume must be under 2 MB', 'err');
      act('uploadResume', { candidateId: el.dataset.upload, name: file.name, dataUrl: await readFileAsDataUrl(file) }, { ok: 'Resume uploaded' }).catch(() => {});
    }
    if (el.dataset.csv) {
      const rows = csvRows(await el.files[0].text());
      $('#csvpreview').innerHTML = rows.length ? `<b>${rows.length}</b> rows found. First rows:<div class="table-wrap"><table class="t"><tbody>${rows.slice(0, 5).map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${esc(r.email)}</td><td>${esc(r.skills)}</td></tr>`).join('')}</tbody></table></div>` : '<span style="color:var(--crit)">No rows recognised. Make sure the first row has column names.</span>';
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { e.preventDefault(); $('#gsearch')?.focus(); }
    if (e.target.id === 'gsearch' && e.key === 'Enter') { const first = $('#gresults a'); if (first) { go(first.getAttribute('href')); $('#gresults').classList.add('hidden'); e.target.value = ''; } }
    if (e.target.id === 'gsearch' && e.key === 'Escape') { $('#gresults').classList.add('hidden'); e.target.blur(); }
  });
  // Kanban drag & drop
  let dragId = null;
  document.addEventListener('dragstart', (e) => { const c = e.target.closest?.('.kcard'); if (!c) return; dragId = c.dataset.app; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
  document.addEventListener('dragend', (e) => { e.target.closest?.('.kcard')?.classList.remove('dragging'); document.querySelectorAll('.over').forEach((x) => x.classList.remove('over')); });
  document.addEventListener('dragover', (e) => { const z = e.target.closest?.('.kcol, .zone'); if (z && dragId) { e.preventDefault(); document.querySelectorAll('.over').forEach((x) => x !== z && x.classList.remove('over')); z.classList.add('over'); } });
  document.addEventListener('drop', (e) => { const z = e.target.closest?.('.kcol, .zone'); if (!z || !dragId) return; e.preventDefault(); z.classList.remove('over'); const id = dragId; dragId = null; moveTo(id, z.dataset.stage); });
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); renderContent(); });
  document.getElementById('modal').addEventListener('close', () => { if (S.stale) renderContent(); });
}
async function checkDup(form) {
  if (!form || form.dataset.form !== 'candidate') return;
  const phone = normPhone(form.phone.value); const email = form.email.value.trim();
  if (phone.length < 10 && !email.includes('@')) { $('#dupbox').innerHTML = ''; return; }
  try { const r = await S.store.act('checkDuplicate', { phone: phone.length >= 10 ? phone : '', email: email.includes('@') ? email : '', excludeId: form.dataset.id }); $('#dupbox').innerHTML = dupHtml(r.duplicates); } catch { /* ignore */ }
}
function globalSearch(v) {
  const box = $('#gresults'); const q = v.trim().toLowerCase();
  if (q.length < 2) { box.classList.add('hidden'); return; }
  const digits = q.replace(/\D/g, '');
  const cands = S.data.candidates.filter((c) => !c.erased && (`${c.name} ${c.email || ''} ${(c.skills || []).join(' ')} ${c.currentCompany || ''}`.toLowerCase().includes(q) || (digits.length >= 4 && (c.phone || '').includes(digits)))).slice(0, 8);
  const jobs = S.data.jobs.filter((j) => `${j.code} ${j.title} ${cname(j.clientId)}`.toLowerCase().includes(q)).slice(0, 4);
  box.innerHTML = [...jobs.map((j) => `<a href="#/job/${j.id}">${icon('briefcase')}<div><b>${esc(j.title)}</b><div class="small muted">${esc(j.code)} · ${esc(cname(j.clientId))} · ${esc(j.status)}</div></div></a>`),
    ...cands.map((c) => `<a href="#/candidate/${c.id}"><span class="avatar sm">${initials(c.name)}</span><div><b>${esc(c.name)}</b><div class="small muted">${esc(c.currentCompany || '')}${c.phone && isStaff() ? ` · ${esc(c.phone)}` : ''} · ${appsOfCand(c.id).map((a) => a.stage).join(', ') || 'no applications'}</div></div></a>`)].join('') || '<div class="empty small">No matches</div>';
  box.classList.remove('hidden');
  box.onclick = () => { box.classList.add('hidden'); $('#gsearch').value = ''; };
}

// =====================================================================
// LOGIN & BOOT
// =====================================================================
async function renderLogin(err = '') {
  const local = S.store.mode === 'local';
  const users = local ? await S.store.users() : [];
  const order = { head: 0, recruiter: 1, hm: 2 };
  app.innerHTML = `<div class="login">
    <div class="login-art"><div class="brand" style="padding:0"><div class="brand-mark">M</div><div><b>Meridian ATS</b><span>Meridian Technologies Pvt. Ltd.</span></div></div>
      <div><h1>Hire for client projects, not spreadsheets.</h1><ul>
        <li>One shared candidate record — duplicate phone numbers flagged instantly</li>
        <li>Client approval rounds and notice-period fit against project start dates</li>
        <li>Offer-drop risk flags and offer→join tracking</li>
        <li>Source ROI including consultancy fees · DPDP-ready retention</li></ul></div>
      <div class="small" style="color:#8a93a3">Pune · Bangalore · Goa</div></div>
    <div class="login-form"><div class="box">
      <h1>Sign in</h1><p class="muted">${local ? 'Demo mode — pick a role to explore. Data stays in this browser.' : 'Use your Meridian account.'}</p>
      ${err ? `<div class="form-error">${esc(err)}</div>` : ''}
      ${local ? `<div class="demo-users">${users.sort((a, b) => order[a.role] - order[b.role]).map((u) => `<button data-login="${u.id}"><span class="avatar">${initials(u.name)}</span><span><b>${esc(u.name)}</b><br><span class="small muted">${ROLE_LABEL[u.role]}</span></span></button>`).join('')}</div>`
    : `<form id="loginf" class="stack" style="margin-top:16px">
        <div class="field"><label for="le">Email</label><input id="le" name="email" type="email" required autocomplete="username" value="${S.store.demo ? 'head@meridian.demo' : ''}"></div>
        <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" required autocomplete="current-password"></div>
        <button class="btn primary" style="width:100%;justify-content:center;padding:10px">Sign in</button>
        ${S.store.demo ? `<p class="small muted">Demo accounts (password <code>meridian123</code>): head@, priya@, rohan@, sneha@, arjun@ (recruiters), vikram@, meera@ (hiring managers) — all <code>@meridian.demo</code></p>` : ''}
      </form>`}
      <p class="small" style="margin-top:20px"><a href="careers.html">Looking for a job? Visit our careers portal →</a></p>
    </div></div></div>`;
  app.querySelectorAll('[data-login]').forEach((b) => b.addEventListener('click', async () => { S.user = await S.store.loginAs(b.dataset.login); start(); }));
  $('#loginf')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const d = formData(e.target);
    try { S.user = await S.store.login(d.email, d.password); start(); } catch (x) { renderLogin(x.message); }
  });
}
let pollTimer = null;
async function start() {
  S.f = {}; S.store.version = 0;
  await refresh(true);
  if (!S.data) return renderLogin('Could not load data');
  renderShell(); renderContent();
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!S.user || document.hidden) return;
    if (await refresh()) {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (modalOpen() || typing) { S.stale = true; if (!$('#updates')) document.body.insertAdjacentHTML('beforeend', `<button id="updates" class="btn primary sm updates-pill" onclick="this.remove()">${icon('refresh')} New updates from your team</button>`); $('#updates').onclick = () => renderContent(); }
      else renderContent();
    }
  }, S.store.mode === 'server' ? 10000 : 4000);
}
async function boot() {
  try { const t = localStorage.getItem('mats-theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* ignore */ }
  S.store = await createStore();
  installEvents(); installTooltips();
  if (S.store.mode === 'local') window.addEventListener('storage', async (e) => { if (e.key === 'mats-demo-db-v1') { await S.store.reloadFromStorage(); } });
  S.user = await S.store.restore();
  if (S.user) start(); else renderLogin();
}
boot();
