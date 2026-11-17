// Meridian ATS — domain core.
// Pure functions shared by the Node server and the browser (demo mode).
// Every write goes through perform(), which checks the role, mutates the db,
// writes an audit entry and returns a result. Every read goes through viewFor(),
// which strips what the role must not see. Keep this file dependency-free.

export const STAGES = ['Applied', 'Screened', 'Internal Interview', 'Client Round', 'Offered', 'BGV', 'Joined'];
export const CLOSED = ['Rejected', 'Dropped Out'];
export const ALL_STAGES = [...STAGES, ...CLOSED];
export const HM_VISIBLE_STAGES = ['Internal Interview', 'Client Round', 'Offered', 'BGV', 'Joined'];
export const SOURCES = ['Naukri', 'LinkedIn', 'Referral', 'Consultancy', 'Direct', 'Careers Portal'];
export const REJECT_REASONS = [
  'Skills mismatch', 'Experience below band', 'Notice period too long', 'CTC expectation too high',
  'Failed internal interview', 'Rejected by client', 'Communication skills', 'Duplicate / already in process',
  'Position closed / on hold', 'Other'
];
export const DROP_REASONS = [
  'Accepted competing offer', 'Counter-offer from current employer', 'Relocation not possible',
  'Personal reasons', 'Not reachable / ghosted', 'Notice period could not be bought out', 'BGV discrepancy', 'Other'
];
export const BGV_STATUSES = ['Not started', 'Initiated', 'In progress', 'Clear', 'Discrepancy'];
export const INTERVIEW_RESULTS = ['Scheduled', 'Selected', 'Rejected', 'On hold', 'No show'];
export const ROLE_LABEL = { head: 'TA Head', recruiter: 'Recruiter', hm: 'Hiring Manager' };
export const LOCATIONS = ['Pune', 'Bangalore', 'Goa', 'Remote'];

export class AppError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}

// ---------- small utils ----------
export const DAY = 86400000;
export function uid(prefix) {
  const r = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return `${prefix}_${r}`;
}
export function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length > 10 && (d.startsWith('91') || d.startsWith('0'))) return d.slice(-10);
  return d;
}
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const skillsOf = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map((s) => s.trim()).filter(Boolean).slice(0, 30);
const isClosed = (stage) => CLOSED.includes(stage);
export const isActiveApp = (a) => !isClosed(a.stage) && a.stage !== 'Joined';

export function emptyDb() {
  return {
    meta: { version: 1, seq: { job: 0, app: 0 }, createdAt: new Date().toISOString() },
    settings: { retentionMonths: 12, quarterTarget: 60, consultancyFeePct: 8.33, company: 'Meridian Technologies Pvt. Ltd.' },
    users: [], clients: [], consultancies: [], jobs: [], candidates: [], applications: [],
    interviews: [], notes: [], emails: [], files: {}, audit: []
  };
}

// ---------- permissions ----------
const STAFF = ['head', 'recruiter'];
const ANY = ['head', 'recruiter', 'hm'];
const PERMS = {
  createJob: STAFF, updateJob: STAFF,
  createCandidate: STAFF, updateCandidate: STAFF, checkDuplicate: STAFF, importCandidates: STAFF,
  applyToJob: STAFF, moveStage: STAFF, addNote: ANY, logContact: STAFF, logEmail: STAFF,
  scheduleInterview: STAFF, updateInterview: ANY, saveOffer: STAFF, updateBgv: STAFF, setClientApproval: STAFF,
  uploadResume: STAFF, eraseCandidate: ['head'], runRetention: ['head'], updateSettings: ['head'],
  saveUser: ['head'], saveClient: ['head'], saveConsultancy: ['head']
};
export const READ_ONLY = new Set(['checkDuplicate']);
export function can(user, action) { return !!user && (PERMS[action] || []).includes(user.role); }

// ---------- lookups ----------
const byId = (list, id) => list.find((x) => x.id === id);
function need(list, id, what) {
  const x = byId(list, id);
  if (!x) throw new AppError(`${what} not found`, 404);
  return x;
}

export function findDuplicates(db, { phone, email }, excludeId) {
  const p = normPhone(phone); const e = normEmail(email);
  return db.candidates.filter((c) => c.id !== excludeId && !c.erased && (
    (p && p.length >= 10 && c.phone === p) || (e && c.email === e)
  )).map((c) => {
    const apps = db.applications.filter((a) => a.candidateId === c.id);
    const owner = byId(db.users, c.ownerId);
    const lastContact = [...(c.contacts || [])].sort((a, b) => b.at.localeCompare(a.at))[0];
    return {
      id: c.id, name: c.name, matchedOn: c.phone === p ? 'phone' : 'email', owner: owner?.name || '—',
      lastContact: lastContact ? { at: lastContact.at, by: byId(db.users, lastContact.by)?.name } : null,
      applications: apps.map((a) => ({ jobTitle: byId(db.jobs, a.jobId)?.title, stage: a.stage, ref: a.ref }))
    };
  });
}

// ---------- domain rules ----------
/** When could this candidate actually join? */
export function earliestJoin(cand, now = new Date()) {
  if (cand.lastWorkingDay) return new Date(new Date(cand.lastWorkingDay).getTime() + DAY);
  return new Date(new Date(now).getTime() + (cand.noticeDays ?? 0) * DAY);
}
/** Does the notice period land before the project needs the person? */
export function noticeFit(cand, job, now = new Date()) {
  if (!job?.projectStart || cand.noticeDays === null || cand.noticeDays === undefined) return { level: 'unknown', label: 'No start date', days: null };
  const late = daysBetween(job.projectStart, earliestJoin(cand, now));
  if (late <= 0) return { level: 'good', label: 'Fits start date', days: late };
  if (late <= 14) return { level: 'warning', label: `${late}d after start`, days: late };
  return { level: 'critical', label: `${late}d after start`, days: late };
}

/** Rule-based (not AI) offer-drop risk. Transparent: every point has a reason. */
export function offerRisk(app, cand, job, now = new Date()) {
  const reasons = []; let score = 0;
  const add = (pts, why) => { score += pts; reasons.push(why); };
  if (!cand) return { level: 'low', score: 0, reasons };
  if (cand.noticeDays >= 90) add(2, `${cand.noticeDays}-day notice period`);
  else if (cand.noticeDays >= 60) add(1, `${cand.noticeDays}-day notice period`);
  if (cand.competingOffers > 0) add(2, `Holding ${cand.competingOffers} other offer${cand.competingOffers > 1 ? 's' : ''}`);
  const offered = app.offer?.ctc; const expected = cand.expectedCtc;
  if (offered && expected && offered < expected) add(2, `Offer ₹${offered}L below expectation ₹${expected}L`);
  if (cand.currentCtc && expected && expected / cand.currentCtc > 1.5) add(1, `Expects ${Math.round((expected / cand.currentCtc - 1) * 100)}% hike`);
  if (app.offer?.joiningDate) {
    const d = daysBetween(now, app.offer.joiningDate);
    if (d > 45) add(1, `Joining is ${d} days away`);
  }
  const last = [...(cand.contacts || [])].map((c) => c.at).sort().pop() || app.updatedAt;
  if (last && daysBetween(last, now) > 7) add(1, `No contact for ${daysBetween(last, now)} days`);
  if (app.offer && !app.offer.acceptedAt && app.offer.offeredAt && daysBetween(app.offer.offeredAt, now) > 5) add(1, 'Offer not accepted after 5 days');
  if (app.bgv?.status === 'Discrepancy') add(2, 'BGV discrepancy');
  const level = score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low';
  return { level, score, reasons };
}

export function consultancyFee(app, cand, db) {
  if (cand?.source !== 'Consultancy' || app.stage !== 'Joined' || !app.offer?.ctc) return 0;
  const c = db.consultancies.find((x) => x.name === cand.sourceDetail);
  const pct = c?.feePct ?? db.settings.consultancyFeePct;
  return Math.round(app.offer.ctc * 100000 * pct / 100);
}

/** Candidate-friendly status — never exposes internal stage names or reject reasons. */
export function publicStatus(stage) {
  return ({
    Applied: 'Received', Screened: 'Under review', 'Internal Interview': 'Interviewing', 'Client Round': 'Interviewing',
    Offered: 'Offer stage', BGV: 'Background verification', Joined: 'Joined — welcome aboard', Rejected: 'Closed', 'Dropped Out': 'Closed'
  })[stage] || 'Received';
}

function lastActivity(db, cand) {
  const dates = [cand.updatedAt, cand.createdAt, ...(cand.contacts || []).map((c) => c.at)];
  for (const a of db.applications) if (a.candidateId === cand.id) dates.push(a.updatedAt);
  for (const n of db.notes) if (n.candidateId === cand.id) dates.push(n.createdAt);
  return dates.filter(Boolean).sort().pop();
}
/** DPDP: who is past the retention window? Joined staff and anyone in an active process are exempt. */
export function retentionQueue(db, now = new Date()) {
  const months = db.settings.retentionMonths || 12;
  const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - months);
  return db.candidates.filter((c) => !c.erased).map((c) => {
    const apps = db.applications.filter((a) => a.candidateId === c.id);
    const last = lastActivity(db, c);
    return { c, apps, last };
  }).filter(({ c, apps, last }) => {
    if (c.erasureRequested) return true;
    if (apps.some((a) => a.stage === 'Joined' || isActiveApp(a))) return false;
    return last && new Date(last) < cutoff;
  }).map(({ c, last }) => ({ id: c.id, name: c.name, lastActivity: last, requested: !!c.erasureRequested }));
}

// ---------- write actions ----------
const A = {};

A.createJob = (db, u, p, now) => {
  const title = str(p.title, 120); if (!title) throw new AppError('Job title is required');
  need(db.clients, p.clientId, 'Client');
  db.meta.seq.job += 1;
  const job = {
    id: uid('job'), code: `MER-${String(db.meta.seq.job).padStart(4, '0')}`,
    status: 'Open', createdAt: now, createdBy: u.id, ...jobFields(p)
  };
  db.jobs.push(job);
  return { job, audit: `Opened requisition ${job.code} — ${job.title}` };
};
function jobFields(p) {
  return {
    title: str(p.title, 120), clientId: p.clientId, project: str(p.project, 120),
    type: p.type === 'Bench' ? 'Bench' : 'Project', skills: skillsOf(p.skills),
    expMin: num(p.expMin) ?? 0, expMax: num(p.expMax) ?? 0, ctcMin: num(p.ctcMin), ctcMax: num(p.ctcMax),
    billingRate: num(p.billingRate), billingCurrency: ['USD', 'GBP', 'INR', 'EUR'].includes(p.billingCurrency) ? p.billingCurrency : 'USD',
    location: str(p.location, 60), openings: Math.max(1, num(p.openings) ?? 1), targetDate: p.targetDate || null,
    projectStart: p.projectStart || null, recruiterId: p.recruiterId || null, hiringManagerId: p.hiringManagerId || null,
    description: str(p.description, 4000), published: !!p.published
  };
}
A.updateJob = (db, u, p, now) => {
  const job = need(db.jobs, p.id, 'Job');
  const fields = jobFields({ ...job, ...p });
  Object.assign(job, fields, { updatedAt: now });
  if (p.status && ['Open', 'On Hold', 'Closed', 'Filled'].includes(p.status)) {
    if (job.status !== p.status && ['Closed', 'Filled'].includes(p.status)) job.closedAt = now;
    job.status = p.status;
  }
  return { job, audit: `Updated requisition ${job.code}` };
};

function candidateFields(p) {
  const source = SOURCES.includes(p.source) ? p.source : 'Direct';
  return {
    name: str(p.name, 100), phone: normPhone(p.phone), email: normEmail(p.email),
    currentCompany: str(p.currentCompany, 100), currentTitle: str(p.currentTitle, 100),
    currentCtc: num(p.currentCtc), expectedCtc: num(p.expectedCtc), noticeDays: num(p.noticeDays),
    lastWorkingDay: p.lastWorkingDay || null, totalExp: num(p.totalExp), skills: skillsOf(p.skills),
    location: str(p.location, 60), source, sourceDetail: str(p.sourceDetail, 100),
    competingOffers: Math.max(0, num(p.competingOffers) ?? 0), linkedin: str(p.linkedin, 200)
  };
}
function validateCandidate(c) {
  if (!c.name) throw new AppError('Candidate name is required');
  if (c.phone.length !== 10) throw new AppError('Enter a valid 10-digit mobile number');
  if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) throw new AppError('Email address looks invalid');
  if (c.source === 'Consultancy' && !c.sourceDetail) throw new AppError('Pick which consultancy sourced this candidate');
}

A.createCandidate = (db, u, p, now) => {
  const fields = candidateFields(p);
  validateCandidate(fields);
  if (!p.consent) throw new AppError('Record the candidate\'s consent to process their data (DPDP Act)');
  const dups = findDuplicates(db, fields);
  if (dups.length && !p.force) throw new AppError('Possible duplicate candidate', 409, { duplicates: dups });
  const cand = {
    id: uid('cand'), ...fields, ownerId: u.id, createdAt: now, createdBy: u.id, updatedAt: now,
    consent: { given: true, at: now, method: p.consentMethod || 'Recorded by recruiter', purpose: 'Recruitment at Meridian Technologies' },
    contacts: [], resume: null
  };
  db.candidates.push(cand);
  let app = null;
  if (p.jobId) app = newApplication(db, u, cand, p.jobId, now);
  return { candidate: cand, application: app, audit: `Added candidate ${cand.name}${dups.length ? ' (duplicate warning overridden)' : ''}` };
};
A.updateCandidate = (db, u, p, now) => {
  const cand = need(db.candidates, p.id, 'Candidate');
  if (cand.erased) throw new AppError('This record has been erased');
  const fields = candidateFields({ ...cand, ...p });
  validateCandidate(fields);
  const dups = findDuplicates(db, fields, cand.id);
  if (dups.length && !p.force) throw new AppError('Another candidate has this phone or email', 409, { duplicates: dups });
  Object.assign(cand, fields, { updatedAt: now });
  if (p.ownerId && byId(db.users, p.ownerId)) cand.ownerId = p.ownerId;
  return { candidate: cand, audit: `Edited candidate ${cand.name}` };
};
A.checkDuplicate = (db, u, p) => ({ duplicates: findDuplicates(db, p, p.excludeId) });

A.importCandidates = (db, u, p, now) => {
  if (!p.consent) throw new AppError('Confirm that these candidates consented to processing');
  const rows = Array.isArray(p.rows) ? p.rows.slice(0, 1000) : [];
  const added = []; const skipped = [];
  for (const [i, row] of rows.entries()) {
    try {
      const fields = candidateFields(row); validateCandidate(fields);
      if (findDuplicates(db, fields).length) { skipped.push({ row: i + 1, name: fields.name, why: 'Duplicate phone/email' }); continue; }
      const cand = { id: uid('cand'), ...fields, ownerId: u.id, createdAt: now, createdBy: u.id, updatedAt: now,
        consent: { given: true, at: now, method: 'Bulk import — consent confirmed by importer', purpose: 'Recruitment at Meridian Technologies' }, contacts: [], resume: null };
      db.candidates.push(cand); added.push(cand.id);
      if (p.jobId) newApplication(db, u, cand, p.jobId, now);
    } catch (e) { skipped.push({ row: i + 1, name: row.name, why: e.message }); }
  }
  return { added: added.length, skipped, audit: `Bulk imported ${added.length} candidates (${skipped.length} skipped)` };
};

function newApplication(db, u, cand, jobId, now) {
  const job = need(db.jobs, jobId, 'Job');
  if (job.status !== 'Open') throw new AppError(`${job.code} is ${job.status}; reopen it first`);
  const existing = db.applications.find((a) => a.candidateId === cand.id && a.jobId === jobId);
  if (existing) throw new AppError(`${cand.name} is already in the pipeline for ${job.title} (${existing.stage})`);
  db.meta.seq.app += 1;
  const app = {
    id: uid('app'), ref: `APP-${String(db.meta.seq.app).padStart(5, '0')}`, candidateId: cand.id, jobId,
    stage: 'Applied', createdAt: now, updatedAt: now, createdBy: u.id,
    history: [{ from: null, to: 'Applied', at: now, by: u.id }],
    offer: null, bgv: null, clientApproval: null, rejectReason: null, dropReason: null
  };
  db.applications.push(app);
  return app;
}
A.applyToJob = (db, u, p, now) => {
  const cand = need(db.candidates, p.candidateId, 'Candidate');
  const app = newApplication(db, u, cand, p.jobId, now);
  return { application: app, audit: `Added ${cand.name} to ${byId(db.jobs, p.jobId).code}` };
};

A.moveStage = (db, u, p, now) => {
  const app = need(db.applications, p.applicationId, 'Application');
  const to = p.to;
  if (!ALL_STAGES.includes(to)) throw new AppError('Unknown stage');
  if (to === app.stage) return { application: app };
  const cand = byId(db.candidates, app.candidateId);
  const job = byId(db.jobs, app.jobId);
  if (to === 'Rejected' && !REJECT_REASONS.includes(p.reason)) throw new AppError('Pick a reject reason');
  if (to === 'Dropped Out' && !DROP_REASONS.includes(p.reason)) throw new AppError('Pick a drop-out reason');
  const toIdx = STAGES.indexOf(to);
  if (toIdx > STAGES.indexOf('Client Round') && STAGES.includes(to) && job?.type !== 'Bench' && app.clientApproval?.status !== 'Approved') {
    throw new AppError('The client must approve this candidate before an offer (record approval on the Client Round)');
  }
  if ((to === 'BGV' || to === 'Joined') && !app.offer?.ctc) throw new AppError('Record the offer (CTC and joining date) first');
  if (to === 'Joined' && app.bgv?.status !== 'Clear') throw new AppError('Background verification must be Clear before joining');
  const from = app.stage;
  app.history.push({ from, to, at: now, by: u.id, note: str(p.note, 500) || undefined, reason: p.reason || undefined });
  app.stage = to; app.updatedAt = now;
  if (to === 'Rejected') app.rejectReason = p.reason;
  if (to === 'Dropped Out') app.dropReason = p.reason;
  if (STAGES.includes(to)) { app.rejectReason = null; app.dropReason = null; }
  if (to === 'BGV' && !app.bgv) app.bgv = { status: 'Initiated', vendor: '', updatedAt: now };
  if (to === 'Joined') {
    app.joinedAt = p.joinedAt || now;
    const filled = db.applications.filter((a) => a.jobId === job.id && a.stage === 'Joined').length;
    if (filled >= job.openings && job.status === 'Open') { job.status = 'Filled'; job.closedAt = now; }
  }
  const dir = STAGES.indexOf(to) < STAGES.indexOf(from) && STAGES.includes(to) && STAGES.includes(from) ? ' (moved back)' : '';
  return { application: app, audit: `${cand?.name}: ${from} → ${to}${dir} on ${job?.code}${p.reason ? ` — ${p.reason}` : ''}` };
};

A.setClientApproval = (db, u, p, now) => {
  const app = need(db.applications, p.applicationId, 'Application');
  if (!['Approved', 'Rejected', 'Pending'].includes(p.status)) throw new AppError('Invalid approval status');
  app.clientApproval = { status: p.status, by: str(p.approver, 100), at: now, recordedBy: u.id, note: str(p.note, 500) };
  app.updatedAt = now;
  return { application: app, audit: `Client approval ${p.status} for ${app.ref}` };
};

A.addNote = (db, u, p, now) => {
  const cand = need(db.candidates, p.candidateId, 'Candidate');
  const body = str(p.body, 4000); if (!body) throw new AppError('Note is empty');
  if (u.role === 'hm' && !hmCanSeeCandidate(db, u, cand.id)) throw new AppError('Not allowed', 403);
  const note = { id: uid('note'), candidateId: cand.id, applicationId: p.applicationId || null, body, authorId: u.id, createdAt: now };
  db.notes.push(note);
  return { note, audit: `Note on ${cand.name}` };
};
A.logContact = (db, u, p, now) => {
  const cand = need(db.candidates, p.candidateId, 'Candidate');
  cand.contacts = cand.contacts || [];
  cand.contacts.push({ at: now, by: u.id, channel: ['Call', 'WhatsApp', 'Email', 'SMS'].includes(p.channel) ? p.channel : 'Call', summary: str(p.summary, 300) });
  if (p.competingOffers !== undefined && p.competingOffers !== '') cand.competingOffers = Math.max(0, num(p.competingOffers) ?? 0);
  cand.updatedAt = now;
  return { candidate: cand, audit: `Logged ${p.channel || 'call'} with ${cand.name}` };
};
A.logEmail = (db, u, p, now) => {
  const cand = need(db.candidates, p.candidateId, 'Candidate');
  if (!cand.email) throw new AppError('Candidate has no email address');
  const email = { id: uid('mail'), candidateId: cand.id, to: cand.email, subject: str(p.subject, 200), body: str(p.body, 8000), template: p.template || null, sentBy: u.id, sentAt: now };
  db.emails.push(email);
  cand.contacts = cand.contacts || [];
  cand.contacts.push({ at: now, by: u.id, channel: 'Email', summary: email.subject });
  return { email, audit: `Emailed ${cand.name}: ${email.subject}` };
};

A.scheduleInterview = (db, u, p, now) => {
  const app = need(db.applications, p.applicationId, 'Application');
  if (!p.at) throw new AppError('Pick a date and time');
  const panel = skillsOf(p.panel);
  if (!panel.length) throw new AppError('Add at least one panel member');
  const iv = {
    id: uid('int'), applicationId: app.id, round: p.round === 'Client' ? 'Client' : 'Internal', title: str(p.title, 100) || (p.round === 'Client' ? 'Client round' : 'Technical round'),
    at: p.at, durationMin: num(p.durationMin) ?? 60, panel, mode: ['Video', 'In person', 'Phone'].includes(p.mode) ? p.mode : 'Video',
    link: str(p.link, 300), result: 'Scheduled', feedback: '', createdBy: u.id, createdAt: now
  };
  db.interviews.push(iv);
  const cand = byId(db.candidates, app.candidateId);
  return { interview: iv, audit: `Scheduled ${iv.round.toLowerCase()} interview for ${cand?.name}` };
};
A.updateInterview = (db, u, p, now) => {
  const iv = need(db.interviews, p.id, 'Interview');
  if (u.role === 'hm') {
    const app = byId(db.applications, iv.applicationId);
    if (!hmCanSeeCandidate(db, u, app.candidateId)) throw new AppError('Not allowed', 403);
  } else {
    if (p.at) iv.at = p.at;
    if (p.panel) iv.panel = skillsOf(p.panel);
  }
  if (p.result && INTERVIEW_RESULTS.includes(p.result)) iv.result = p.result;
  if (p.feedback !== undefined) iv.feedback = str(p.feedback, 4000);
  if (p.rating !== undefined) iv.rating = Math.min(5, Math.max(0, num(p.rating) ?? 0));
  iv.updatedAt = now; iv.updatedBy = u.id;
  return { interview: iv, audit: `Interview ${iv.result.toLowerCase()} — feedback recorded` };
};

A.saveOffer = (db, u, p, now) => {
  const app = need(db.applications, p.applicationId, 'Application');
  const ctc = num(p.ctc); if (!ctc) throw new AppError('Offered CTC is required');
  if (!p.joiningDate) throw new AppError('Joining date is required');
  app.offer = {
    ...(app.offer || {}), ctc, joiningDate: p.joiningDate, offeredAt: app.offer?.offeredAt || p.offeredAt || now,
    acceptedAt: p.accepted ? (app.offer?.acceptedAt || now) : null, joiningBonus: num(p.joiningBonus), noticeBuyout: !!p.noticeBuyout
  };
  app.updatedAt = now;
  return { application: app, audit: `Offer saved for ${app.ref}: ₹${ctc}L, joining ${p.joiningDate}` };
};
A.updateBgv = (db, u, p, now) => {
  const app = need(db.applications, p.applicationId, 'Application');
  if (!BGV_STATUSES.includes(p.status)) throw new AppError('Invalid BGV status');
  app.bgv = { status: p.status, vendor: str(p.vendor, 100), remarks: str(p.remarks, 500), updatedAt: now };
  app.updatedAt = now;
  return { application: app, audit: `BGV ${p.status} for ${app.ref}` };
};
A.uploadResume = (db, u, p, now) => {
  const cand = need(db.candidates, p.candidateId, 'Candidate');
  const data = String(p.dataUrl || '');
  if (!/^data:(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain);base64,/.test(data)) throw new AppError('Upload a PDF, DOC, DOCX or TXT resume');
  if (data.length > 3_000_000) throw new AppError('Resume must be under 2 MB');
  if (cand.resume?.fileId) delete db.files[cand.resume.fileId];
  const fileId = uid('file');
  db.files[fileId] = { name: str(p.name, 150), dataUrl: data };
  cand.resume = { fileId, name: str(p.name, 150), size: Math.round(data.length * 0.75), uploadedAt: now };
  return { candidate: cand, audit: `Uploaded resume for ${cand.name}` };
};

A.eraseCandidate = (db, u, p, now) => {
  const cand = need(db.candidates, p.id, 'Candidate');
  eraseOne(db, cand, now, p.reason || 'Erasure request');
  return { audit: `Erased personal data for candidate ${cand.id} (${p.reason || 'erasure request'})` };
};
function eraseOne(db, cand, now, reason) {
  if (cand.resume?.fileId) delete db.files[cand.resume.fileId];
  Object.assign(cand, {
    name: `Erased candidate`, phone: '', email: '', currentCompany: '', currentTitle: '', currentCtc: null, expectedCtc: null,
    linkedin: '', skills: cand.skills, resume: null, contacts: [], lastWorkingDay: null,
    erased: true, erasedAt: now, erasureReason: reason, erasureRequested: false
  });
  db.notes = db.notes.filter((n) => n.candidateId !== cand.id);
  db.emails = db.emails.filter((m) => m.candidateId !== cand.id);
  for (const iv of db.interviews) {
    const a = byId(db.applications, iv.applicationId);
    if (a?.candidateId === cand.id) iv.feedback = '';
  }
}
A.runRetention = (db, u, p, now) => {
  const due = retentionQueue(db, new Date(now));
  for (const d of due) eraseOne(db, byId(db.candidates, d.id), now, d.requested ? 'Erasure request' : `Retention period (${db.settings.retentionMonths} months) expired`);
  return { erased: due.length, audit: `Retention run: erased ${due.length} candidate records` };
};
A.updateSettings = (db, u, p) => {
  const s = db.settings;
  if (p.retentionMonths !== undefined) s.retentionMonths = Math.min(60, Math.max(1, num(p.retentionMonths) ?? 12));
  if (p.quarterTarget !== undefined) s.quarterTarget = Math.max(1, num(p.quarterTarget) ?? 60);
  if (p.consultancyFeePct !== undefined) s.consultancyFeePct = Math.max(0, num(p.consultancyFeePct) ?? 8.33);
  return { settings: s, audit: 'Updated settings' };
};
A.saveUser = (db, u, p, now) => {
  if (!['head', 'recruiter', 'hm'].includes(p.role)) throw new AppError('Pick a role');
  const email = normEmail(p.email); if (!email) throw new AppError('Email is required');
  let user = p.id ? need(db.users, p.id, 'User') : null;
  if (db.users.some((x) => x.email === email && x.id !== user?.id)) throw new AppError('A user with this email exists');
  if (!user) { user = { id: uid('usr'), createdAt: now }; db.users.push(user); }
  Object.assign(user, { name: str(p.name, 100), email, role: p.role, active: p.active !== false && p.active !== 'false' });
  if (p.passwordHash) user.passwordHash = p.passwordHash;
  return { user: { ...user, passwordHash: undefined }, audit: `Saved user ${user.name} (${ROLE_LABEL[user.role]})` };
};
A.saveClient = (db, u, p, now) => {
  const name = str(p.name, 100); if (!name) throw new AppError('Client name is required');
  let c = p.id ? need(db.clients, p.id, 'Client') : null;
  if (!c) { c = { id: uid('cli'), createdAt: now }; db.clients.push(c); }
  Object.assign(c, { name, country: str(p.country, 40), industry: str(p.industry, 60), contact: str(p.contact, 100) });
  return { client: c, audit: `Saved client ${name}` };
};
A.saveConsultancy = (db, u, p, now) => {
  const name = str(p.name, 100); if (!name) throw new AppError('Consultancy name is required');
  let c = p.id ? need(db.consultancies, p.id, 'Consultancy') : null;
  if (!c) { c = { id: uid('con'), createdAt: now }; db.consultancies.push(c); }
  Object.assign(c, { name, feePct: num(p.feePct) ?? db.settings.consultancyFeePct, contact: str(p.contact, 100) });
  return { consultancy: c, audit: `Saved consultancy ${name}` };
};

/** The one entry point for writes. */
export function perform(db, user, action, payload = {}, nowDate = new Date()) {
  if (!A[action]) throw new AppError(`Unknown action ${action}`, 404);
  if (!can(user, action)) throw new AppError('You do not have permission to do that', 403);
  const now = nowDate.toISOString();
  const result = A[action](db, user, payload || {}, now);
  if (result?.audit && !READ_ONLY.has(action)) {
    db.audit.push({ id: uid('aud'), at: now, userId: user.id, action, summary: result.audit });
    if (db.audit.length > 20000) db.audit.splice(0, db.audit.length - 20000);
    db.meta.version += 1;
  }
  return result;
}

// ---------- reads / redaction ----------
function hmCanSeeCandidate(db, u, candidateId) {
  return db.applications.some((a) => a.candidateId === candidateId && HM_VISIBLE_STAGES.includes(a.stage)
    && byId(db.jobs, a.jobId)?.hiringManagerId === u.id);
}
const publicUser = (x) => ({ id: x.id, name: x.name, email: x.email, role: x.role, active: x.active !== false });

/** Everything a signed-in user is allowed to see. The server only ever sends this. */
export function viewFor(db, u) {
  const users = db.users.map(publicUser);
  if (u.role === 'head' || u.role === 'recruiter') {
    return {
      settings: db.settings, users, clients: db.clients, consultancies: db.consultancies, jobs: db.jobs,
      candidates: db.candidates, applications: db.applications, interviews: db.interviews, notes: db.notes,
      emails: db.emails, audit: u.role === 'head' ? db.audit.slice(-2000) : [],
      retention: u.role === 'head' ? retentionQueue(db) : []
    };
  }
  // Hiring manager: own requisitions, shortlisted candidates only, no salary, no contact details, no billing.
  const jobs = db.jobs.filter((j) => j.hiringManagerId === u.id)
    .map(({ billingRate, billingCurrency, ctcMin, ctcMax, ...j }) => j);
  const jobIds = new Set(jobs.map((j) => j.id));
  const applications = db.applications.filter((a) => jobIds.has(a.jobId) && HM_VISIBLE_STAGES.includes(a.stage))
    .map((a) => ({ ...a, offer: a.offer ? { joiningDate: a.offer.joiningDate } : null, history: a.history.map(({ reason, ...h }) => h) }));
  const candIds = new Set(applications.map((a) => a.candidateId));
  const candidates = db.candidates.filter((c) => candIds.has(c.id)).map((c) => ({
    id: c.id, name: c.name, currentCompany: c.currentCompany, currentTitle: c.currentTitle, totalExp: c.totalExp,
    noticeDays: c.noticeDays, lastWorkingDay: c.lastWorkingDay, skills: c.skills, location: c.location, resume: c.resume, createdAt: c.createdAt
  }));
  const appIds = new Set(applications.map((a) => a.id));
  return {
    settings: { retentionMonths: db.settings.retentionMonths }, users, clients: db.clients, consultancies: [], jobs, candidates, applications,
    interviews: db.interviews.filter((i) => appIds.has(i.applicationId)),
    notes: db.notes.filter((n) => candIds.has(n.candidateId)), emails: [], audit: [], retention: []
  };
}
export function canReadFile(db, u, fileId) {
  const cand = db.candidates.find((c) => c.resume?.fileId === fileId);
  if (!cand) return false;
  if (u.role === 'head' || u.role === 'recruiter') return true;
  return hmCanSeeCandidate(db, u, cand.id);
}

// ---------- public careers portal ----------
export function publicJobs(db) {
  return db.jobs.filter((j) => j.status === 'Open' && j.published).map((j) => ({
    id: j.id, code: j.code, title: j.title, location: j.location, expMin: j.expMin, expMax: j.expMax,
    skills: j.skills, description: j.description, type: j.type, postedAt: j.createdAt
  }));
}
export function publicApply(db, p, nowDate = new Date()) {
  const job = db.jobs.find((j) => j.id === p.jobId && j.status === 'Open' && j.published);
  if (!job) throw new AppError('This position is no longer open', 404);
  if (!p.consent) throw new AppError('Please accept the privacy notice to apply');
  const now = nowDate.toISOString();
  const fields = candidateFields({ ...p, source: 'Careers Portal' });
  validateCandidate(fields);
  if (!fields.email) throw new AppError('Email is required');
  const system = { id: 'portal', role: 'recruiter', name: 'Careers portal' };
  let cand = db.candidates.find((c) => !c.erased && c.phone === fields.phone);
  if (cand) {
    if (db.applications.some((a) => a.candidateId === cand.id && a.jobId === job.id)) throw new AppError('You have already applied for this role. Use "Track application" to see your status.', 409);
  } else {
    cand = { id: uid('cand'), ...fields, ownerId: job.recruiterId, createdAt: now, createdBy: 'portal', updatedAt: now,
      consent: { given: true, at: now, method: 'Careers portal privacy notice', purpose: 'Recruitment at Meridian Technologies' }, contacts: [], resume: null };
    db.candidates.push(cand);
  }
  if (p.resume?.dataUrl) { try { A.uploadResume(db, system, { candidateId: cand.id, ...p.resume }, now); } catch (e) { /* resume optional */ } }
  const app = newApplication(db, system, cand, job.id, now);
  db.audit.push({ id: uid('aud'), at: now, userId: 'portal', action: 'portalApply', summary: `Careers portal application ${app.ref}: ${cand.name} → ${job.code}` });
  db.meta.version += 1;
  return { ref: app.ref, jobTitle: job.title };
}
export function portalStatus(db, p) {
  const app = db.applications.find((a) => a.ref === String(p.ref || '').trim().toUpperCase());
  const cand = app && db.candidates.find((c) => c.id === app.candidateId);
  if (!app || !cand || cand.erased || cand.phone !== normPhone(p.phone)) throw new AppError('We could not find an application with that reference and mobile number', 404);
  const job = db.jobs.find((j) => j.id === app.jobId);
  const reached = new Set(app.history.map((h) => publicStatus(h.to)));
  return {
    ref: app.ref, name: cand.name.split(' ')[0], jobTitle: job?.title, appliedAt: app.createdAt, status: publicStatus(app.stage),
    closed: CLOSED.includes(app.stage), updatedAt: app.updatedAt,
    steps: ['Received', 'Under review', 'Interviewing', 'Offer stage', 'Background verification', 'Joined — welcome aboard']
      .map((s) => ({ label: s, done: reached.has(s) })),
    upcoming: db.interviews.filter((i) => i.applicationId === app.id && i.result === 'Scheduled' && new Date(i.at) > new Date())
      .map((i) => ({ at: i.at, mode: i.mode, durationMin: i.durationMin }))
  };
}

// ---------- metrics (computed on whatever the viewer can see) ----------
export function computeMetrics(v, now = new Date()) {
  const cand = new Map(v.candidates.map((c) => [c.id, c]));
  const jobs = new Map(v.jobs.map((j) => [j.id, j]));
  const apps = v.applications;
  const openJobs = v.jobs.filter((j) => j.status === 'Open');
  const filledCount = (jid) => apps.filter((a) => a.jobId === jid && a.stage === 'Joined').length;
  const openPositions = openJobs.reduce((s, j) => s + Math.max(0, j.openings - filledCount(j.id)), 0);
  const byStage = Object.fromEntries(ALL_STAGES.map((s) => [s, 0]));
  for (const a of apps) byStage[a.stage] += 1;

  // Quarter
  const q0 = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const joinedThisQ = apps.filter((a) => a.stage === 'Joined' && new Date(a.joinedAt || a.updatedAt) >= q0).length;

  // Time to fill: requisition opened → candidate joined (days). Time to offer: opened → offer made.
  const ttf = apps.filter((a) => a.stage === 'Joined' && jobs.get(a.jobId)).map((a) => daysBetween(jobs.get(a.jobId).createdAt, a.joinedAt || a.updatedAt));
  const tto = apps.filter((a) => a.offer?.offeredAt && jobs.get(a.jobId)).map((a) => daysBetween(jobs.get(a.jobId).createdAt, a.offer.offeredAt));
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

  // Offer → join: of offers whose outcome is known (Joined, or Dropped Out after reaching Offered)
  const reachedOffer = (a) => a.history.some((h) => h.to === 'Offered');
  const offerOutcomes = apps.filter((a) => reachedOffer(a) && (a.stage === 'Joined' || a.stage === 'Dropped Out'));
  const offerJoined = offerOutcomes.filter((a) => a.stage === 'Joined').length;
  const offerDropped = offerOutcomes.length - offerJoined;

  // Source effectiveness
  const sources = {};
  for (const a of apps) {
    const c = cand.get(a.candidateId); if (!c) continue;
    const key = c.source === 'Consultancy' && c.sourceDetail ? `Consultancy · ${c.sourceDetail}` : c.source;
    const s = sources[key] ||= { source: key, applications: 0, interviewed: 0, offered: 0, joined: 0, dropped: 0, fees: 0, days: [] };
    s.applications += 1;
    if (a.history.some((h) => h.to === 'Internal Interview')) s.interviewed += 1;
    if (reachedOffer(a)) s.offered += 1;
    if (a.stage === 'Joined') { s.joined += 1; if (jobs.get(a.jobId)) s.days.push(daysBetween(jobs.get(a.jobId).createdAt, a.joinedAt || a.updatedAt)); }
    if (a.stage === 'Dropped Out' && reachedOffer(a)) s.dropped += 1;
    if (c.source === 'Consultancy' && a.stage === 'Joined' && a.offer?.ctc) {
      const con = v.consultancies.find((x) => x.name === c.sourceDetail);
      s.fees += Math.round(a.offer.ctc * 100000 * (con?.feePct ?? v.settings.consultancyFeePct ?? 8.33) / 100);
    }
  }
  const sourceRows = Object.values(sources).map((s) => ({
    ...s, conversion: s.applications ? s.joined / s.applications : 0, avgDaysToFill: avg(s.days),
    offerJoinRate: s.joined + s.dropped ? s.joined / (s.joined + s.dropped) : null, costPerHire: s.joined ? Math.round(s.fees / s.joined) : 0
  })).sort((a, b) => b.joined - a.joined || b.applications - a.applications);

  const reasons = (field) => {
    const out = {};
    for (const a of apps) if (a[field]) out[a[field]] = (out[a[field]] || 0) + 1;
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  };
  const overdue = openJobs.filter((j) => j.targetDate && new Date(j.targetDate) < now);

  return {
    openJobs: openJobs.length, openPositions, byStage, joinedThisQ, quarterTarget: v.settings.quarterTarget,
    activeCandidates: apps.filter(isActiveApp).length,
    avgTimeToFill: avg(ttf), avgTimeToOffer: avg(tto), ttfSample: ttf.length,
    offerOutcomes: offerOutcomes.length, offerJoined, offerDropped,
    offerJoinRate: offerOutcomes.length ? offerJoined / offerOutcomes.length : null,
    sourceRows, rejectReasons: reasons('rejectReason'), dropReasons: reasons('dropReason'), overdue
  };
}
