import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDb, perform, viewFor, findDuplicates, offerRisk, noticeFit, retentionQueue, computeMetrics, publicApply, portalStatus, publicJobs } from '../public/js/core.js';
import { buildSeed } from '../public/js/seed.js';

function fixture() {
  const db = emptyDb();
  const head = { id: 'u_head', name: 'Head', email: 'h@x', role: 'head' };
  const rec = { id: 'u_rec', name: 'Rec', email: 'r@x', role: 'recruiter' };
  const hm = { id: 'u_hm', name: 'HM', email: 'm@x', role: 'hm' };
  db.users.push(head, rec, hm);
  db.clients.push({ id: 'c1', name: 'Northbridge Bank', country: 'UK' });
  const job = perform(db, rec, 'createJob', { title: 'Java Dev', clientId: 'c1', skills: 'Java, Spring', expMin: 3, expMax: 6, ctcMin: 10, ctcMax: 18, billingRate: 40, hiringManagerId: 'u_hm', projectStart: new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10), published: true }).job;
  const bench = perform(db, rec, 'createJob', { title: 'Bench Java', clientId: 'c1', type: 'Bench' }).job;
  return { db, head, rec, hm, job, bench };
}
const addCand = (db, u, extra = {}) => perform(db, u, 'createCandidate', { name: 'Asha Verma', phone: '9876543210', email: 'asha@example.com', currentCtc: 12, expectedCtc: 16, noticeDays: 30, consent: true, ...extra });

test('consent is mandatory (DPDP)', () => {
  const { db, rec } = fixture();
  assert.throws(() => perform(db, rec, 'createCandidate', { name: 'A', phone: '9876543210' }), /consent/);
});

test('duplicate phone is detected across formats and blocks save unless forced', () => {
  const { db, rec } = fixture();
  addCand(db, rec);
  assert.equal(findDuplicates(db, { phone: '+91 98765-43210' }).length, 1);
  assert.equal(findDuplicates(db, { phone: '098765 43210' }).length, 1);
  assert.throws(() => addCand(db, rec, { email: 'other@x.com' }), (e) => e.status === 409 && e.duplicates.length === 1);
  assert.ok(addCand(db, rec, { email: 'other@x.com', force: true }).candidate);
});

test('one candidate can be in several jobs at different stages', () => {
  const { db, rec, job, bench } = fixture();
  const { candidate } = addCand(db, rec, { jobId: job.id });
  const a2 = perform(db, rec, 'applyToJob', { candidateId: candidate.id, jobId: bench.id }).application;
  perform(db, rec, 'moveStage', { applicationId: a2.id, to: 'Rejected', reason: 'Skills mismatch' });
  const stages = db.applications.filter((a) => a.candidateId === candidate.id).map((a) => a.stage).sort();
  assert.deepEqual(stages, ['Applied', 'Rejected']);
  assert.throws(() => perform(db, rec, 'applyToJob', { candidateId: candidate.id, jobId: job.id }), /already in the pipeline/);
});

test('stage moves are timestamped, can go backwards, and need reasons to close', () => {
  const { db, rec, job } = fixture();
  const { application: a } = addCand(db, rec, { jobId: job.id });
  perform(db, rec, 'moveStage', { applicationId: a.id, to: 'Screened' });
  perform(db, rec, 'moveStage', { applicationId: a.id, to: 'Internal Interview' });
  perform(db, rec, 'moveStage', { applicationId: a.id, to: 'Screened' });
  assert.equal(a.history.length, 4);
  assert.ok(a.history.every((h) => h.at && h.by));
  assert.throws(() => perform(db, rec, 'moveStage', { applicationId: a.id, to: 'Rejected' }), /reject reason/);
  assert.throws(() => perform(db, rec, 'moveStage', { applicationId: a.id, to: 'Dropped Out', reason: 'Skills mismatch' }), /drop-out reason/);
});

test('client approval, offer and clear BGV gate the later stages', () => {
  const { db, rec, job, bench } = fixture();
  const { application: a } = addCand(db, rec, { jobId: job.id });
  perform(db, rec, 'moveStage', { applicationId: a.id, to: 'Client Round' });
  assert.throws(() => perform(db, rec, 'moveStage', { applicationId: a.id, to: 'Offered' }), /client must approve/);
  perform(db, rec, 'setClientApproval', { applicationId: a.id, status: 'Approved', approver: 'Oliver' });
  perform(db, rec, 'moveStage', { applicationId: a.id, to: 'Offered' });
  assert.throws(() => perform(db, rec, 'moveStage', { applicationId: a.id, to: 'BGV' }), /offer/);
  perform(db, rec, 'saveOffer', { applicationId: a.id, ctc: 15, joiningDate: '2027-01-10' });
  perform(db, rec, 'moveStage', { applicationId: a.id, to: 'BGV' });
  assert.throws(() => perform(db, rec, 'moveStage', { applicationId: a.id, to: 'Joined' }), /verification/);
  perform(db, rec, 'updateBgv', { applicationId: a.id, status: 'Clear' });
  perform(db, rec, 'moveStage', { applicationId: a.id, to: 'Joined' });
  assert.equal(a.stage, 'Joined');
  // bench roles have no client round
  const b = perform(db, rec, 'applyToJob', { candidateId: addCand(db, rec, { phone: '9000000001', email: 'b@x.com' }).candidate.id, jobId: bench.id }).application;
  perform(db, rec, 'moveStage', { applicationId: b.id, to: 'Offered' });
  assert.equal(b.stage, 'Offered');
});

test('hiring managers see only shortlisted candidates, never salary or contact details', () => {
  const { db, rec, hm, job } = fixture();
  const { application: a } = addCand(db, rec, { jobId: job.id });
  const { application: b } = addCand(db, rec, { jobId: job.id, phone: '9000000002', email: 'z@x.com', name: 'Second' });
  perform(db, rec, 'moveStage', { applicationId: a.id, to: 'Internal Interview' });
  perform(db, rec, 'moveStage', { applicationId: b.id, to: 'Rejected', reason: 'Skills mismatch' });
  const v = viewFor(db, hm);
  assert.equal(v.candidates.length, 1);
  const c = v.candidates[0];
  for (const k of ['currentCtc', 'expectedCtc', 'phone', 'email', 'source']) assert.ok(!(k in c), `HM must not see ${k}`);
  assert.ok(!('billingRate' in v.jobs[0]));
  assert.equal(v.audit.length, 0);
  assert.throws(() => perform(db, hm, 'moveStage', { applicationId: a.id, to: 'Client Round' }), /permission/);
});

test('notice-period fit compares earliest joining with project start', () => {
  const start = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  assert.equal(noticeFit({ noticeDays: 15 }, { projectStart: start }).level, 'good');
  assert.equal(noticeFit({ noticeDays: 40 }, { projectStart: start }).level, 'warning');
  assert.equal(noticeFit({ noticeDays: 90 }, { projectStart: start }).level, 'critical');
});

test('offer-drop risk is explained, not a black box', () => {
  const c = { noticeDays: 90, competingOffers: 2, currentCtc: 10, expectedCtc: 16, contacts: [] };
  const r = offerRisk({ offer: { ctc: 14, offeredAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }, c, null);
  assert.equal(r.level, 'high');
  assert.ok(r.reasons.some((x) => /other offer/.test(x)));
  assert.equal(offerRisk({ offer: { ctc: 12 }, updatedAt: new Date().toISOString() }, { noticeDays: 15, competingOffers: 0, currentCtc: 10, expectedCtc: 12, contacts: [] }, null).level, 'low');
});

test('retention erases personal data but keeps anonymous history', () => {
  const { db, rec, head, job } = fixture();
  const { candidate, application } = addCand(db, rec, { jobId: job.id });
  perform(db, rec, 'moveStage', { applicationId: application.id, to: 'Rejected', reason: 'Skills mismatch' });
  perform(db, rec, 'addNote', { candidateId: candidate.id, body: 'private note' });
  const old = new Date(Date.now() - 400 * 864e5).toISOString();
  candidate.createdAt = candidate.updatedAt = old; application.updatedAt = old; db.notes[0].createdAt = old; candidate.contacts = [];
  assert.equal(retentionQueue(db).length, 1);
  assert.throws(() => perform(db, rec, 'runRetention', {}), /permission/);
  perform(db, head, 'runRetention', {});
  assert.equal(candidate.erased, true);
  assert.equal(candidate.phone, ''); assert.equal(candidate.currentCtc, null);
  assert.equal(db.notes.length, 0);
  assert.equal(db.applications.length, 1);
});

test('careers portal: public jobs hide client and pay; status hides internal stages', () => {
  const { db, rec, job } = fixture();
  const pj = publicJobs(db);
  assert.equal(pj.length, 1);
  for (const k of ['clientId', 'ctcMin', 'billingRate', 'project']) assert.ok(!(k in pj[0]));
  const { ref } = publicApply(db, { jobId: job.id, name: 'Ravi K', phone: '9811111111', email: 'r@k.com', consent: true });
  const app = db.applications.find((a) => a.ref === ref);
  perform(db, rec, 'moveStage', { applicationId: app.id, to: 'Rejected', reason: 'CTC expectation too high' });
  const s = portalStatus(db, { ref, phone: '+91 98111 11111' });
  assert.equal(s.status, 'Closed');
  assert.ok(!JSON.stringify(s).includes('CTC expectation'));
  assert.throws(() => portalStatus(db, { ref, phone: '9000000000' }), /could not find/);
});

test('demo seed produces a believable dataset and metrics', () => {
  const db = buildSeed(new Date('2026-11-17T10:00:00Z'));
  const m = computeMetrics(viewFor(db, db.users[0]));
  assert.ok(db.candidates.length > 300);
  assert.ok(m.openJobs >= 10);
  assert.ok(m.offerJoinRate > 0.4 && m.offerJoinRate < 0.85);
  assert.ok(m.sourceRows.some((r) => r.fees > 0));
});
