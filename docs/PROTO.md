# Meridian ATS: P.R.O.T.O. artifacts

These are the five P.R.O.T.O. artifacts, plus the data model, written before the build and updated after the first working version. The client is Meridian Technologies Pvt. Ltd., an IT services company with 450 people (HQ Pune, delivery centres in Bangalore and Goa).

---

## P: Problem

> Four recruiters at Meridian Technologies keep their candidates in four copies of the same Excel file on a shared drive. Last month two of them called the same candidate on the same day about two different roles, and she complained about it on LinkedIn. When a client asked about the status of a Java position, the Head of Talent Acquisition needed a day and a half to answer. The team has to make 60 hires this quarter. Most roles are tied to client projects that need people within 3 weeks of signing, and attrition of about 20% creates backfills on top. The Head of TA thinks roughly a third of candidates who accept an offer never join, but has no data to prove it.

| Test | Answer |
|---|---|
| Who feels it? | The Head of TA and four recruiters, followed by clients and candidates |
| How often? | Duplicate outreach happens weekly. Client status questions come in several times a week. Offer drop-outs happen with every batch of offers. |
| What does it cost? | 1.5 days per client status answer, reputational damage on LinkedIn, and an unmeasured loss of about 1 in 3 accepted offers. On a 60-hire quarter that is about 20 lost hires. |

---

## R: Research

| Product | Built for whom | Pricing model | One thing it does badly for our user |
|---|---|---|---|
| **Zoho Recruit** | SMB corporate HR and staffing agencies | Per-recruiter monthly subscription, with tiered plans and a free tier | A job is a generic opening. The tool doesn't natively connect a requisition to a client project start date, so it can't tell whether a candidate's notice period will land in time. |
| **Keka (Hire module)** | Indian SMB/mid-market HR teams | Per-employee monthly pricing for the HR suite, with Hire as part of or an add-on to the suite | It's built around in-house corporate hiring. There is no client approval round, no billing rate per position, and no consultancy commission tracking. |
| **Darwinbox (Recruitment)** | Large Indian and Asian enterprises | Custom enterprise quote (per employee, annual) | It's heavy and slow to roll out. "Something working in two weeks" is not realistic, and it's priced for thousands of employees, not 450. |
| **Naukri RMS (InfoEdge)** | Indian recruiters who already buy Naukri job postings and database access | Annual licence, usually bundled with Naukri subscriptions | It's very good for sourcing from Naukri, but it's weak at comparing Naukri with LinkedIn, referrals and consultancies, and it has no model of offer-to-join drop-out. |
| **Greenhouse** (global comparison) | Mid-to-large product companies, mostly US | Custom annual pricing by company size | It has strong structured interviewing, but it's designed for product companies. It has no notice-period logic (a 90-day notice is an Indian reality), no DPDP retention workflow and no INR/lakh conventions. |

*Pricing models were taken from the vendors' public positioning and are approximate. Check current price lists before quoting a figure.*

**The gap we are aiming at, in one sentence:** existing tools treat a requisition as a generic opening. None of them treats it as a billable client-project slot with a hard start date. So none of them can tell an Indian IT-services firm, for each position, three things at once: whether the candidate's notice period lands before the project starts, whether the client has approved the candidate, and how likely the candidate is to vanish between offer and joining.

---

## O: Owners

| Role | Count | Frequency | Primary need | Must NOT see |
|---|---|---|---|---|
| **Recruiter** | 4 | All day, every day | Fast data entry. An instant warning when someone else is already talking to a candidate. One pipeline view instead of Excel. | Admin settings, the audit log and erasure controls (TA Head only) |
| **Hiring manager** (delivery / project lead) | ~15 | A few times a week | Review only the shortlisted candidates for their own requisitions and give interview feedback, including from a phone | Current CTC, expected CTC and offered CTC (it changes the negotiation and can break the law). Also phone and email, billing rates, other managers' requisitions, and rejected or dropped candidates. |
| **TA Head** | 1 | Daily dashboards and weekly reports | Answer any client status question in under a minute. See source ROI and offer-to-join rate. Prove the "one third". | Nothing is hidden. The TA Head is accountable for DPDP. |
| **Candidate** | ~200 per month | Once to apply, then occasionally | Apply quickly and see an honest status at any time | Internal notes, reject reason codes, interview feedback, the client name, the CTC band, billing rates and other candidates |
| **Client** (indirect, receives a report) | ~4 accounts | Weekly | Where is my position? Who is at my round, and when can they join? | Candidate salaries, our billing margin and internal notes. The client report is generated "client-safe". |
| **Staffing consultancy** (no login in v1) | 3 | n/a | Gets paid 8.33% of annual CTC on joiners | Everything. They send CVs by email, and a recruiter records the consultancy as the source. |

---

## T: Tasks (user stories)

Format: *As a [role], I want to [action], so that [benefit]. Done when: [testable conditions].*

| ID | Story | Done when… |
|---|---|---|
| **US-01** | As a **recruiter**, I want to add a candidate against an open requisition, so that my colleagues can see the candidate is already being pursued. | I can save name, phone, email, notice period and CTC. The candidate appears in that requisition's pipeline. If the phone number already exists, in any format (+91, spaces, leading 0), I see a warning before saving that shows the owner, the last contact and the active applications. |
| **US-02** | As a **recruiter**, I want to see who last contacted a candidate and when, so that two of us never call the same person on the same day. | Calls, WhatsApp messages and emails can be logged in one click. The duplicate warning and the candidate page show the last contact (who and how long ago). A banner appears when a colleague owns another active process for the same person. |
| **US-03** | As a **recruiter**, I want to create a requisition with client, project, billing rate, skills, experience band, CTC band, location, target date and project start date, so that every position is tied to a billable client need. | All of these fields save. The requisition gets a code (MER-0001…). It can be assigned to a recruiter and a hiring manager. |
| **US-04** | As a **recruiter**, I want to move a candidate to the next stage, so that the pipeline reflects reality without me editing a spreadsheet. | The candidate visibly moves between stages, whether I drag on the board or click a button. Each change is timestamped with who made it. I can move a candidate backwards if a round is repeated. |
| **US-05** | As a **recruiter**, I want to reject a candidate, or mark them as dropped out, with a reason code at any stage, so that we learn why we lose people. | Rejected and Dropped Out are reachable from every stage. A reason from a fixed list is required. The reasons appear in the funnel report. |
| **US-06** | As a **recruiter**, I want the system to stop an offer until the client has approved the candidate, so that we never offer someone the client hasn't cleared. | Moving a project role past Client Round asks me to record the client's approval (who and when). Bench roles skip this step. |
| **US-07** | As a **recruiter**, I want to see whether a candidate's notice period fits the project start date, so that I don't spend a week on someone who can't join in time. | Each candidate on a project requisition shows "Fits start date", "Nd after start" (amber, within 14 days) or "Nd after start" (red, more than 14 days). The calculation uses the last working day when it is known. |
| **US-08** | As a **recruiter**, I want to record offer details and BGV status, so that nobody joins without verification. | An offer cannot be recorded without a CTC and a joining date. BGV can't start without an offer. Joined is blocked unless BGV is "Clear". |
| **US-09** | As a **hiring manager**, I want to see only the shortlisted candidates for my role, so that I'm not reviewing people the recruiter has already rejected. | I see candidates at Internal Interview and later. I can't see rejected or dropped candidates. I can't see any salary, phone or email field, and the server never sends them to me. |
| **US-10** | As a **hiring manager**, I want to record interview feedback and a result from my phone, so that the recruiter can move the candidate the same day. | The feedback form works at 390px width. The result (Selected, Rejected, On hold, No show), a rating and comments are saved and shown on the candidate's record. |
| **US-11** | As a **recruiter**, I want to schedule internal and client interviews with panel names and times, so that everyone knows who is interviewing whom. | An interview has a round, a date and time, a duration, a panel, a mode and a link. Upcoming interviews and interviews awaiting feedback are listed. |
| **US-12** | As the **TA Head**, I want a dashboard of open positions, candidates per stage, time to fill and offer-to-join rate, so that I can answer leadership without a spreadsheet. | The dashboard shows these numbers using the definitions agreed below. It also shows hires this quarter against the target of 60. |
| **US-13** | As the **TA Head**, I want a client status report per client, so that a client question takes a minute, not a day and a half. | I pick a client and see every requisition with openings, stage counts and named candidates at client round or later, with their availability dates. The report contains no salaries, billing rates or notes. It can be copied as email text or printed to PDF. |
| **US-14** | As the **TA Head**, I want source effectiveness, including the consultancy fee, so that I know which source actually works. | For each source (and each consultancy) I see applications, interviews, offers, joins, conversion, offer-to-join rate, fees paid (8.33% of offered annual CTC, charged on joiners only) and cost per hire. |
| **US-15** | As the **TA Head**, I want offers flagged by drop-out risk, so that we can act before a candidate disappears. | Every offer in progress gets a Low, Medium or High flag with listed reasons: notice period length, competing offers, an offer below expectation, the size of the expected hike, a far-off joining date, no recent contact, an offer not accepted after 5 days, and BGV discrepancies. The score is rule-based, not AI. |
| **US-16** | As the **TA Head**, I want candidate data erased automatically after a retention period, so that we comply with the DPDP Act. | Consent is recorded for every candidate. Records with no activity for N months, where the candidate was not hired and is not in a process, appear in an erasure queue. Erasure removes all personal data but keeps anonymous stage history. Every action is audit-logged. |
| **US-17** | As a **candidate**, I want to apply online and check my status with a reference number, so that I'm not left guessing. | The careers page lists published roles without the client name or pay. Applying requires consent and returns a reference such as APP-00123. The status check needs the reference and my mobile number, and shows only candidate-friendly stages. |
| **US-18** | As a **recruiter**, I want to import my existing Excel sheet, so that we can switch off the shared file on day one. | A CSV with common headers (name, phone, email, notice, CTC, skills…) imports. Duplicates are skipped and listed. Consent confirmation is required. |

---

## The bridge: nouns to data model

The nouns from the stories that become tables are **User, Client, Consultancy, Job (requisition), Candidate, Application, Interview, Note, Email, AuditEntry, File**. Offer, BGV, client approval and stage history are embedded on the Application, because they never exist without one.

| Noun / table | Fields it holds | What it connects to |
|---|---|---|
| **User** | id, name, email, role (head / recruiter / hm), active, passwordHash | Owns candidates. Assigned to jobs as recruiter or hiring manager. Author of notes, moves and audit entries. |
| **Client** | id, name, country, industry, contact (the approver) | One client has many jobs |
| **Consultancy** | id, name, feePct (8.33) | Named as the source of candidates. Used for commission. |
| **Job** (requisition) | id, code, title, clientId, project, type (Project / Bench), skills[], expMin/Max, ctcMin/Max (₹ lakhs), billingRate + currency, location, openings, targetDate, projectStart, recruiterId, hiringManagerId, status, published | One job has many applications |
| **Candidate** | id, name, phone (the unique key, normalised to 10 digits), email, currentCompany, currentTitle, currentCtc, expectedCtc, noticeDays, lastWorkingDay, totalExp, skills[], location, source, sourceDetail, competingOffers, ownerId, consent{at, method, purpose}, contacts[], resume{fileId}, erased | One candidate has many applications, notes, emails and one resume file |
| **Application** ★ | id, ref (APP-00001), candidateId, jobId, stage, history[{from, to, at, by, reason, note}], clientApproval{status, by, at}, offer{ctc, joiningDate, offeredAt, acceptedAt}, bgv{status, vendor}, rejectReason, dropReason, joinedAt | It joins Candidate and Job. One application has many interviews and many stage events. |
| **Interview** | id, applicationId, round (Internal / Client), title, at, durationMin, panel[], mode, link, result, feedback, rating | Belongs to an application |
| **Note** | id, candidateId, applicationId?, body, authorId, createdAt | Belongs to a candidate, and optionally to one application |
| **Email** | id, candidateId, to, subject, body, template, sentBy, sentAt | Belongs to a candidate |
| **AuditEntry** | id, at, userId, action, summary | References any change |
| **File** | id, name, dataUrl | Holds a candidate's resume |

★ **The conceptual leap:** Application is an entity in its own right. That's why Kavya Menon can be at *Client Round* for MER-0001 and *Screened* for MER-0002 at the same time without contradiction.

| Relationship | Reads as |
|---|---|
| Client → Jobs | One client has many requisitions |
| Job → Applications | One job has many applications |
| Candidate → Applications | One candidate has many applications |
| Application → Stage history | One application has one current stage and many timestamped moves |
| Application → Interviews | One application has many interviews |
| Candidate → Notes | One candidate has many notes, each optionally tied to an application |

---

## O: One slice

**The core loop, in one sentence:** *A recruiter can take one candidate from Applied to Joined against a client requisition (through the client's approval, the offer and BGV) without opening Excel, and nobody else on the team will call that candidate by mistake.*

| Must have (build first) | Should have (next) | Could have (someday) | Will NOT have (and why) |
|---|---|---|---|
| Job requisition with client, project and billing | Resume upload | Candidate self-service portal | **Payroll**: a separate product (the HRMS). The ATS hands over at Joined. |
| Candidate record | Skill-based search and filters | Automated email templates | **Onboarding after joining**: it starts where the ATS ends. Scope creep disguised as helpfulness. |
| Application (candidate × job) | Recruiter assignment per job | Consultancy commission calculation | **Performance management**: a different user, problem and lifecycle |
| 7 pipeline stages + Rejected / Dropped Out | Interview scheduling with panel | Client-facing status report | **Anything AI-powered in v1**: risk, matching and search are transparent rules. AI scoring of candidates is a legal and bias risk, and it can't be explained to a candidate or a client. |
| Forward/backward stage moves, timestamped | Offer details (CTC, joining date) | Bulk resume import (CSV) | **Live Naukri / LinkedIn API integration**: needs paid partner APIs and contracts. Recruiters paste or import for now. |
| Duplicate phone warning | Basic dashboard: open positions, per-stage counts, time to fill | Offer-drop risk flag | **Sending email from our own server**: needs SMTP, a domain and deliverability work. v1 opens the recruiter's own Outlook or Gmail with the text and logs the email. |
| Notes with author and time | Reject reason codes | Audit log | |
| Source tracking (incl. consultancy name) | Email the candidate from inside the app | Mobile view for hiring managers | |

**What this build delivers.** Everything in Must and Should works. Of the Could column, all items except the job-board integrations are also in, because they directly answer three of the brief's stated pains: "I can't prove it's a third" (offer-to-join tracking), "which source actually works" (commission and source ROI), and "a day and a half to answer a client" (the client report).

---

## Definitions agreed (Appendix A answers)

| Question | Answer used in the system |
|---|---|
| What makes a candidate unique? | The mobile number, normalised to its last 10 digits (+91, spaces, dashes and a leading 0 are ignored). Email is a secondary match. |
| Same person appears twice legitimately? | One Candidate record and two Applications. Duplicates can be overridden explicitly ("different person — save anyway"), and the override is audit-logged. |
| Can a record move backward? | Yes, every move is logged with a timestamp. Closed applications can be reopened. |
| Can anything be deleted? | Requisitions are closed, not deleted. Candidate personal data is erased, never silently deleted, and only by the TA Head. Anonymous history stays. |
| Time to fill | Requisition opened → first candidate **actually joined**. This includes the notice period and is reported in days. **Time to offer** (opened → first offer made) is reported next to it, because the two numbers differ by 30 to 90 days in India. |
| Offer-to-join rate | Of applications that reached *Offered* and have a final outcome (Joined or Dropped Out), the share that joined. Offers still in progress are excluded. |
| Conversion (source) | Applications from a source that ended in Joined ÷ all applications from that source |
| Cost per hire (source) | Consultancy fees paid ÷ joiners from that source. The fee is 8.33% × offered annual CTC, on joiners only. Free sources show "—". |
| Retention | 12 months after last activity for candidates who were not hired and are not in an active process (configurable). Joiners move to HR systems. |
| Volume check | Designed for about 40 open requisitions, about 200 new candidates a month and 3 years of history (≈7,200 candidates). Search and filters work on the full set. List views cap at 200 rows and ask the user to refine. |
| Success | "I can answer any client's status question in under a minute, and my recruiters stop maintaining the Excel file." |

---

## What broke and how we fixed it

Five problems came up during the build:

- **Typing landed in the wrong field.** The automated walkthrough created a candidate called "Test Candidate10": the current-CTC digits had gone into the name field. The add-candidate dialog moved focus to its first field on a 30 ms timer, and a fast typist (or a test robot) could be in the middle of another field when that timer fired. The fix was to focus synchronously when the dialog opens, and the test now passes.
- **Dashboard bars didn't render.** The bars were empty `<span>`s, which are inline elements and ignore width. Making them block elements fixed it, and screenshots confirmed the result.
- **Client confidentiality leaked through the careers portal.** The demo job descriptions started with the client's name, and the public jobs feed sent the description as-is. Removing the client name fixed it. A unit test now checks that public jobs never include client, pay or project fields.
- **The Joined step stopped halfway.** Moving a candidate to Joined correctly asked for a Clear BGV status, but then didn't finish the move. The BGV dialog now carries the target stage through, the same way the client-approval and offer dialogs already did.
- **Hiding salaries in the browser isn't security.** The fix was structural: the server builds a separate, redacted view for each role (`viewFor`), so a hiring manager's browser never receives a CTC, phone number or billing rate. Hiding the field would not have been enough. The rule is enforced in code and covered by a test.
