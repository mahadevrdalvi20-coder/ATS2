// Deterministic demo data for Meridian Technologies (all people and clients are fictional).
import { emptyDb, STAGES, REJECT_REASONS, DROP_REASONS, DAY } from './core.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const FIRST = ['Aarav', 'Aditi', 'Akash', 'Ananya', 'Arjun', 'Bhavna', 'Chetan', 'Deepika', 'Dhruv', 'Divya', 'Farhan', 'Gauri', 'Harish', 'Isha', 'Jatin', 'Kavya', 'Kiran', 'Lakshmi', 'Manish', 'Meghna', 'Nikhil', 'Neha', 'Omkar', 'Pooja', 'Pranav', 'Rahul', 'Ritika', 'Sahil', 'Sanya', 'Shreyas', 'Siddharth', 'Sneha', 'Tanvi', 'Tejas', 'Uday', 'Varun', 'Vidya', 'Yash', 'Zoya', 'Abhishek', 'Pallavi', 'Rohit', 'Swati', 'Vishal', 'Nandini', 'Gaurav', 'Shruti', 'Amol', 'Rucha', 'Sameer'];
const LAST = ['Sharma', 'Patil', 'Kulkarni', 'Iyer', 'Reddy', 'Nair', 'Deshpande', 'Joshi', 'Menon', 'Rao', 'Gupta', 'Shetty', 'Naik', 'Pillai', 'Kamat', 'Bhat', 'Fernandes', 'Sawant', 'Chatterjee', 'Mehta', 'Verma', 'Gawde', 'Hegde', 'Pai', 'Dsouza', 'Khan', 'Agarwal', 'Bose', 'Mishra', 'Kapoor'];
const COMPANIES = ['Infosys', 'TCS', 'Wipro', 'Cognizant', 'Capgemini', 'Accenture', 'Tech Mahindra', 'HCLTech', 'LTIMindtree', 'Persistent Systems', 'Mphasis', 'Zensar', 'KPIT', 'Hexaware', 'Birlasoft', 'Coforge', 'a fintech startup', 'Barclays GCC', 'Deutsche Bank GCC', 'Walmart Global Tech'];

export function buildSeed(now = new Date()) {
  const R = rng(20261117);
  const pick = (xs) => xs[Math.floor(R() * xs.length)];
  const between = (a, b) => a + Math.floor(R() * (b - a + 1));
  const iso = (d) => new Date(d).toISOString();
  const ago = (days) => new Date(now.getTime() - days * DAY);
  const db = emptyDb();
  let n = 0; const id = (p) => `${p}_${(++n).toString(36).padStart(5, '0')}`;

  const U = (name, email, role) => { const u = { id: id('usr'), name, email, role, active: true, createdAt: iso(ago(400)) }; db.users.push(u); return u; };
  const head = U('Anjali Kulkarni', 'head@meridian.demo', 'head');
  const recruiters = [U('Priya Nair', 'priya@meridian.demo', 'recruiter'), U('Rohan Desai', 'rohan@meridian.demo', 'recruiter'),
    U('Sneha Fernandes', 'sneha@meridian.demo', 'recruiter'), U('Arjun Rao', 'arjun@meridian.demo', 'recruiter')];
  const hms = [U('Vikram Shetty', 'vikram@meridian.demo', 'hm'), U('Meera Iyer', 'meera@meridian.demo', 'hm'), U('Karan Malhotra', 'karan@meridian.demo', 'hm'),
    U('Deepa Naik', 'deepa@meridian.demo', 'hm'), U('Sanjay Pai', 'sanjay@meridian.demo', 'hm')];

  const C = (name, country, industry, contact) => { const c = { id: id('cli'), name, country, industry, contact, createdAt: iso(ago(500)) }; db.clients.push(c); return c; };
  const northbridge = C('Northbridge Bank', 'UK', 'Banking', 'Oliver Grant');
  const halcyon = C('Halcyon Retail Group', 'US', 'Retail', 'Jessica Moore');
  const transatlas = C('TransAtlas Logistics', 'US', 'Logistics', 'Daniel Brooks');
  const crestline = C('Crestline Building Society', 'UK', 'Banking', 'Amelia Hughes');
  const bench = C('Meridian (Bench)', 'India', 'Internal', '—');

  const consult = ['TalentBridge Consulting', 'PeopleFirst Staffing', 'CoreHire Solutions'].map((name) => {
    const c = { id: id('con'), name, feePct: 8.33, contact: '', createdAt: iso(ago(500)) }; db.consultancies.push(c); return c;
  });

  // ---- requisitions ----
  const J = [
    // title, client, project, skills, exp, ctc, rate, loc, openings, ageDays, hm
    ['Senior Java Developer', northbridge, 'Payments Modernisation', 'Java, Spring Boot, Microservices, Kafka, SQL', [6, 9], [18, 28], 48, 'Pune', 4, 34, 0],
    ['Java Full Stack Developer', northbridge, 'Payments Modernisation', 'Java, Spring Boot, Angular, REST', [4, 7], [12, 20], 40, 'Pune', 3, 30, 0],
    ['QA Automation Engineer', northbridge, 'Payments Modernisation', 'Selenium, Java, RestAssured, CI/CD', [3, 6], [8, 14], 32, 'Pune', 2, 26, 0],
    ['React Developer', halcyon, 'Storefront Rebuild', 'React, TypeScript, Redux, GraphQL', [3, 6], [10, 18], 42, 'Bangalore', 3, 21, 1],
    ['Node.js Backend Engineer', halcyon, 'Storefront Rebuild', 'Node.js, TypeScript, AWS, PostgreSQL', [4, 8], [14, 24], 45, 'Bangalore', 2, 19, 1],
    ['Salesforce Developer', halcyon, 'Loyalty CRM', 'Salesforce, Apex, LWC, Integration', [4, 8], [14, 22], 50, 'Bangalore', 2, 48, 1],
    ['Data Engineer', transatlas, 'Fleet Analytics Platform', 'Python, Spark, Airflow, Snowflake, SQL', [4, 8], [15, 26], 52, 'Goa', 3, 15, 2],
    ['DevOps Engineer', transatlas, 'Fleet Analytics Platform', 'AWS, Terraform, Kubernetes, Jenkins', [4, 8], [14, 24], 50, 'Goa', 1, 12, 2],
    ['Android Developer', transatlas, 'Driver App', 'Kotlin, Android, Jetpack Compose, REST', [3, 6], [10, 18], 38, 'Goa', 2, 40, 2],
    ['.NET Developer', crestline, 'Mortgage Origination', 'C#, .NET Core, Azure, SQL Server', [4, 8], [12, 22], 44, 'Pune', 3, 9, 3],
    ['Business Analyst — Banking', crestline, 'Mortgage Origination', 'Business Analysis, Mortgages, JIRA, UAT', [5, 9], [14, 22], 46, 'Pune', 1, 6, 3],
    ['Scrum Master', crestline, 'Mortgage Origination', 'Scrum, SAFe, JIRA, Stakeholder Management', [7, 12], [20, 30], 55, 'Pune', 1, 4, 3],
    ['Java Developer (Bench)', bench, 'Bench — Java pool', 'Java, Spring Boot, SQL', [2, 5], [6, 12], null, 'Pune', 4, 55, 4],
    ['Python Developer', transatlas, 'Route Optimisation', 'Python, Django, PostgreSQL, Docker', [3, 6], [10, 18], 40, 'Goa', 2, 2, 2],
    // closed / filled history (older)
    ['Senior Java Developer', crestline, 'Core Banking Integration', 'Java, Spring, Oracle, MQ', [6, 10], [18, 28], 48, 'Pune', 3, 150, 3],
    ['React Developer', halcyon, 'Checkout Revamp', 'React, JavaScript, CSS', [2, 5], [8, 14], 38, 'Bangalore', 3, 140, 1],
    ['QA Engineer', transatlas, 'Warehouse WMS', 'Manual Testing, SQL, JIRA', [2, 4], [5, 9], 28, 'Goa', 2, 120, 2],
    ['Data Analyst', northbridge, 'Risk Reporting', 'SQL, Power BI, Python', [3, 6], [9, 15], 40, 'Pune', 2, 110, 0],
    ['DevOps Engineer', halcyon, 'Cloud Migration', 'Azure, Terraform, Kubernetes', [4, 7], [14, 22], 50, 'Bangalore', 2, 95, 1],
    ['Angular Developer', northbridge, 'Retail Banking Portal', 'Angular, TypeScript, RxJS', [3, 6], [10, 16], 40, 'Pune', 2, 80, 0],
  ];
  const jobs = J.map(([title, client, project, skills, exp, ctc, rate, loc, openings, age, hmIdx], i) => {
    const created = ago(age);
    const isBench = client === bench;
    const job = {
      id: id('job'), code: `MER-${String(i + 1).padStart(4, '0')}`, title, clientId: client.id, project, type: isBench ? 'Bench' : 'Project',
      skills: skills.split(', '), expMin: exp[0], expMax: exp[1], ctcMin: ctc[0], ctcMax: ctc[1], billingRate: rate,
      billingCurrency: client.country === 'UK' ? 'GBP' : 'USD', location: loc, openings,
      targetDate: iso(new Date(created.getTime() + 21 * DAY)).slice(0, 10),
      projectStart: isBench ? null : iso(new Date(created.getTime() + between(40, 80) * DAY)).slice(0, 10),
      recruiterId: recruiters[i % 4].id, hiringManagerId: hms[hmIdx].id, status: 'Open', createdAt: iso(created), createdBy: head.id,
      description: `We are looking for a ${title} with ${exp[0]}–${exp[1]} years of experience in ${skills}. Work from our ${loc} delivery centre with overlap to ${client.country} hours.`,
      published: age < 60
    };
    db.jobs.push(job); return job;
  });
  db.meta.seq.job = jobs.length;

  // ---- candidates & applications ----
  const SRC = ['Naukri', 'Naukri', 'Naukri', 'LinkedIn', 'LinkedIn', 'Referral', 'Referral', 'Consultancy', 'Consultancy', 'Direct', 'Careers Portal'];
  const usedPhones = new Set();
  const makeCand = (createdAt, job, overrides = {}) => {
    let phone; do { phone = `9${between(100000000, 999999999)}`; } while (usedPhones.has(phone)); usedPhones.add(phone);
    const first = pick(FIRST); const last = pick(LAST);
    const exp = Math.max(1, Math.round((job.expMin + R() * (job.expMax - job.expMin + 2) - 1) * 10) / 10);
    const cur = Math.round((job.ctcMin * 0.7 + R() * (job.ctcMax - job.ctcMin) * 0.8) * 10) / 10;
    const source = pick(SRC);
    const notice = pick([15, 30, 30, 30, 60, 60, 60, 90, 90]);
    const owner = R() < 0.7 ? job.recruiterId : pick(recruiters).id;
    const c = {
      id: id('cand'), name: `${first} ${last}`, phone, email: `${first}.${last}${between(1, 99)}@example.com`.toLowerCase(),
      currentCompany: pick(COMPANIES), currentTitle: job.title.replace(/ \(.*\)| — .*/g, ''), currentCtc: cur,
      expectedCtc: Math.round(cur * (1.15 + R() * 0.45) * 10) / 10, noticeDays: notice, lastWorkingDay: null, totalExp: exp,
      skills: [...job.skills.slice(0, between(2, job.skills.length)), ...(R() < 0.3 ? [pick(['Git', 'Docker', 'Agile', 'AWS', 'Linux'])] : [])],
      location: R() < 0.75 ? job.location : pick(['Pune', 'Bangalore', 'Goa', 'Mumbai', 'Hyderabad']), source,
      sourceDetail: source === 'Consultancy' ? pick(consult).name : source === 'Referral' ? `Referred by ${pick(FIRST)} ${pick(LAST)} (employee)` : '',
      competingOffers: R() < 0.25 ? between(1, 2) : 0, linkedin: '', ownerId: owner, createdAt: iso(createdAt), createdBy: owner, updatedAt: iso(createdAt),
      consent: { given: true, at: iso(createdAt), method: source === 'Careers Portal' ? 'Careers portal privacy notice' : 'Recorded by recruiter', purpose: 'Recruitment at Meridian Technologies' },
      contacts: [], resume: null, ...overrides
    };
    db.candidates.push(c); return c;
  };

  let appSeq = 0;
  const makeApp = (cand, job, start, plan) => {
    // plan: target stage the application reaches, and terminal outcome (if any)
    const app = { id: id('app'), ref: `APP-${String(++appSeq).padStart(5, '0')}`, candidateId: cand.id, jobId: job.id, stage: 'Applied',
      createdAt: iso(start), updatedAt: iso(start), createdBy: cand.ownerId, history: [{ from: null, to: 'Applied', at: iso(start), by: cand.ownerId }],
      offer: null, bgv: null, clientApproval: null, rejectReason: null, dropReason: null };
    let t = start.getTime();
    const step = (to, minD, maxD, extra = {}) => {
      const next = Math.min(t + between(minD, maxD) * DAY + between(1, 8) * 3600000, now.getTime() - 3600000);
      if (next <= t) return false;
      t = next;
      app.history.push({ from: app.stage, to, at: iso(t), by: job.recruiterId, ...extra });
      app.stage = to; app.updatedAt = iso(t);
      return true;
    };
    const targetIdx = STAGES.indexOf(plan.reach);
    for (let i = 1; i <= targetIdx; i++) {
      const to = STAGES[i];
      if (to === 'Client Round' && job.type === 'Bench') continue;
      const gap = { Screened: [1, 3], 'Internal Interview': [2, 5], 'Client Round': [3, 7], Offered: [2, 6], BGV: [2, 6], Joined: [cand.noticeDays * 0.6, cand.noticeDays + 5] }[to];
      if (to === 'Offered') {
        app.clientApproval = job.type === 'Bench' ? null : { status: 'Approved', by: 'Client panel', at: iso(t + DAY), recordedBy: job.recruiterId, note: '' };
      }
      if (!step(to, Math.round(gap[0]), Math.round(gap[1]))) break;
      if (to === 'Internal Interview' || to === 'Client Round') {
        const ivD = new Date(t + between(1, 3) * DAY); ivD.setHours(between(10, 17), pick([0, 30]), 0, 0); const ivAt = ivD.getTime();
        const done = ivAt < now.getTime();
        const hm = db.users.find((u) => u.id === job.hiringManagerId);
        db.interviews.push({ id: id('int'), applicationId: app.id, round: to === 'Client Round' ? 'Client' : 'Internal',
          title: to === 'Client Round' ? `${db.clients.find((c) => c.id === job.clientId).name} technical round` : 'Technical round',
          at: iso(ivAt), durationMin: 60, panel: to === 'Client Round' ? [db.clients.find((c) => c.id === job.clientId).contact, hm.name] : [hm.name, pick(['Rahul Kamat', 'Neha Joshi', 'Amit Bhat'])],
          mode: 'Video', link: '', result: done ? (i < targetIdx || plan.reach !== to ? 'Selected' : pick(['Selected', 'Selected', 'On hold', 'Scheduled'])) : 'Scheduled',
          feedback: done ? pick(['Strong fundamentals, good communication.', 'Solid hands-on skills; weak on system design.', 'Good culture fit, technically adequate.', 'Excellent problem solving.']) : '',
          rating: done ? between(3, 5) : undefined, createdBy: job.recruiterId, createdAt: iso(t) });
      }
      if (to === 'Offered') {
        const ctc = Math.min(job.ctcMax, Math.round(cand.expectedCtc * (0.88 + R() * 0.15) * 10) / 10);
        const joining = new Date(t + (cand.noticeDays + between(0, 10)) * DAY);
        app.offer = { ctc, joiningDate: iso(joining).slice(0, 10), offeredAt: iso(t), acceptedAt: R() < 0.85 ? iso(t + 2 * DAY) : null, joiningBonus: null, noticeBuyout: false };
      }
      if (to === 'BGV') app.bgv = { status: 'Initiated', vendor: pick(['SecureCheck India', 'VerifyNow']), remarks: '', updatedAt: iso(t) };
      if (to === 'Joined') { app.bgv = { ...app.bgv, status: 'Clear' }; app.joinedAt = iso(t); }
    }
    if (app.stage === 'BGV' && R() < 0.6) app.bgv.status = 'In progress';
    if (app.stage === 'BGV' && R() < 0.4 && new Date(app.offer.joiningDate) < now) app.bgv.status = 'Clear';
    if (plan.end === 'Rejected') {
      const reason = app.stage === 'Client Round' ? 'Rejected by client' : app.stage === 'Internal Interview' ? pick(['Failed internal interview', 'Communication skills', 'Skills mismatch'])
        : pick(['Skills mismatch', 'Notice period too long', 'CTC expectation too high', 'Experience below band']);
      if (step('Rejected', 1, 4, { reason })) app.rejectReason = reason;
      if (app.stage === 'Client Round' || reason === 'Rejected by client') app.clientApproval = { status: 'Rejected', by: 'Client panel', at: app.updatedAt, recordedBy: job.recruiterId };
    } else if (plan.end === 'Dropped Out') {
      const reason = app.offer ? pick(['Accepted competing offer', 'Accepted competing offer', 'Counter-offer from current employer', 'Counter-offer from current employer', 'Notice period could not be bought out', 'Not reachable / ghosted', 'Relocation not possible'])
        : pick(['Accepted competing offer', 'Not reachable / ghosted', 'Personal reasons']);
      if (step('Dropped Out', 3, Math.max(5, Math.round(cand.noticeDays * 0.6)), { reason })) app.dropReason = reason;
    }
    db.applications.push(app);
    // contacts & notes
    cand.contacts.push({ at: app.createdAt, by: cand.ownerId, channel: 'Call', summary: 'Intro call — interested, shared JD' });
    if (app.stage !== 'Applied' && R() < 0.5) cand.contacts.push({ at: app.updatedAt, by: job.recruiterId, channel: pick(['Call', 'WhatsApp']), summary: 'Status update shared' });
    if ((app.stage === 'Offered' || app.stage === 'BGV') && R() < 0.75) {
      cand.contacts.push({ at: iso(Math.min(now.getTime() - 3600000, new Date(app.updatedAt).getTime() + between(1, 6) * DAY)), by: job.recruiterId, channel: 'Call', summary: 'Offer follow-up — confirmed joining date' });
    }
    cand.updatedAt = app.updatedAt;
    return app;
  };

  const planFor = (job, ageOfApp) => {
    const x = R();
    const old = ageOfApp > 50;
    if (x < 0.32) return { reach: pick(['Applied', 'Screened', 'Screened', 'Internal Interview']), end: 'Rejected' };
    if (x < 0.40) return { reach: pick(['Screened', 'Internal Interview', 'Client Round']), end: 'Dropped Out' };
    if (x < 0.48) return { reach: 'Client Round', end: 'Rejected' };
    if (x < 0.66 || !old) {
      if (old) return { reach: 'Offered', end: R() < 0.47 ? 'Dropped Out' : null };
      return { reach: pick(['Applied', 'Applied', 'Screened', 'Screened', 'Internal Interview', 'Internal Interview', 'Client Round', 'Offered', 'BGV']), end: null };
    }
    return R() < 0.22 ? { reach: 'Offered', end: 'Dropped Out' } : { reach: 'Joined', end: null };
  };

  for (const job of jobs) {
    const age = Math.round((now - new Date(job.createdAt)) / DAY);
    const count = Math.min(26, Math.max(4, Math.round(age / 2.2) + between(2, 6)));
    for (let k = 0; k < count; k++) {
      const offset = between(0, Math.max(1, Math.min(age - 1, 25)));
      const start = new Date(new Date(job.createdAt).getTime() + offset * DAY + between(9, 18) * 3600000);
      if (start > now) continue;
      const cand = makeCand(start, job);
      const appAge = Math.round((now - start) / DAY);
      let plan = planFor(job, appAge);
      if (job.status !== 'Open' && !plan.end && plan.reach !== 'Joined') plan = { reach: plan.reach, end: 'Rejected' };
      makeApp(cand, job, start, plan);
    }
    const joined = db.applications.filter((a) => a.jobId === job.id && a.stage === 'Joined').length;
    if (age > 70) {
      job.status = joined >= job.openings ? 'Filled' : 'Closed'; job.closedAt = iso(ago(Math.max(1, age - 70))); job.published = false;
      for (const a of db.applications.filter((x) => x.jobId === job.id && !['Joined', 'Rejected', 'Dropped Out'].includes(x.stage))) {
        const to = a.offer ? 'Dropped Out' : 'Rejected';
        const reason = a.offer ? pick(['Accepted competing offer', 'Counter-offer from current employer']) : 'Position closed / on hold';
        const at = new Date(Math.min(new Date(a.updatedAt).getTime() + 10 * DAY, now.getTime() - DAY)).toISOString();
        a.history.push({ from: a.stage, to, at, by: job.recruiterId, reason });
        a.stage = to; a.updatedAt = at; if (a.offer) a.dropReason = reason; else a.rejectReason = reason;
      }
    }
    else if (joined >= job.openings) { job.status = 'Filled'; job.closedAt = iso(ago(1)); }
  }

  // A few candidates in two processes at once — the brief's LinkedIn incident.
  const kavyaJob1 = jobs[0]; const kavyaJob2 = jobs[1];
  const kavya = makeCand(ago(12), kavyaJob1, { name: 'Kavya Menon', email: 'kavya.menon@example.com', phone: '9822012345', noticeDays: 60, currentCompany: 'Persistent Systems', totalExp: 6.5, source: 'LinkedIn', sourceDetail: '', currentCtc: 16, expectedCtc: 22, ownerId: recruiters[0].id, competingOffers: 1 });
  makeApp(kavya, kavyaJob1, ago(12), { reach: 'Client Round', end: null });
  makeApp(kavya, kavyaJob2, ago(10), { reach: 'Screened', end: null });
  kavya.contacts.push({ at: iso(ago(1)), by: recruiters[1].id, channel: 'Call', summary: 'Discussed Java Full Stack role' });

  // High-risk offers in flight (demo the risk flag)
  for (const [i, job] of [jobs[3], jobs[6], jobs[9]].entries()) {
    const c = makeCand(ago(20 - i), job, { noticeDays: 90, competingOffers: 2, currentCtc: 12 + i, expectedCtc: 20 + i });
    const a = makeApp(c, job, ago(20 - i), { reach: 'Offered', end: null });
    if (a.offer) { a.offer.ctc = 17 + i; a.offer.acceptedAt = null; a.offer.joiningDate = iso(new Date(now.getTime() + 75 * DAY)).slice(0, 10); }
    c.contacts = c.contacts.map((x) => ({ ...x, at: iso(ago(12)) }));
  }

  // Old, inactive records → appear in the DPDP retention queue
  for (let k = 0; k < 7; k++) {
    const job = jobs[14 + (k % 5)];
    const start = ago(between(400, 470));
    const c = makeCand(start, job);
    const a = { id: id('app'), ref: `APP-${String(++appSeq).padStart(5, '0')}`, candidateId: c.id, jobId: job.id, stage: 'Rejected', createdAt: iso(start), updatedAt: iso(start.getTime() + 3 * DAY), createdBy: c.ownerId,
      history: [{ from: null, to: 'Applied', at: iso(start), by: c.ownerId }, { from: 'Applied', to: 'Rejected', at: iso(start.getTime() + 3 * DAY), by: c.ownerId, reason: 'Skills mismatch' }],
      offer: null, bgv: null, clientApproval: null, rejectReason: 'Skills mismatch', dropReason: null };
    db.applications.push(a); c.updatedAt = a.updatedAt;
  }
  db.candidates.find((c) => c.source === 'Careers Portal' && !c.erased).erasureRequested = true;

  // Notes
  const NOTE = ['Spoke to candidate — open to relocation to Goa.', 'Asked for notice buyout; current employer may release in 45 days.', 'Strong on Spring Boot, needs to brush up on Kafka before client round.',
    'Candidate mentioned another offer from a product company — follow up weekly.', 'Shared client JD; candidate confirmed interest.', 'Prefers hybrid; ok with 3 days in office.'];
  for (const a of db.applications) {
    if (R() < 0.22) {
      const at = new Date(Math.min(new Date(a.updatedAt).getTime() + DAY, now.getTime()));
      db.notes.push({ id: id('note'), candidateId: a.candidateId, applicationId: a.id, body: pick(NOTE), authorId: db.jobs.find((j) => j.id === a.jobId).recruiterId, createdAt: iso(at) });
    }
  }
  db.notes.push({ id: id('note'), candidateId: kavya.id, applicationId: null, body: 'Kavya is already in Client Round for MER-0001 with Priya. Coordinate before calling her for anything else.', authorId: recruiters[0].id, createdAt: iso(ago(1)) });

  db.meta.seq.app = appSeq;
  db.audit.push({ id: id('aud'), at: iso(now), userId: head.id, action: 'seed', summary: 'Loaded demo data (fictional people and clients)' });
  return db;
}
