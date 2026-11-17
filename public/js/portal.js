// Candidate self-service: browse open roles, apply with consent, track status.
// Never receives client names, salaries, billing rates, notes or reject reasons.
import { createStore } from './store.js';
import { esc, fmtDate, fmtDateTime, icon, toast, openModal, closeModal, formData, field, readFileAsDataUrl } from './ui.js';

const $ = (s) => document.querySelector(s);
let store; let jobs = [];

function renderJobs() {
  const q = $('#pq').value.trim().toLowerCase(); const loc = $('#ploc').value;
  const list = jobs.filter((j) => (!loc || j.location === loc) && (!q || `${j.title} ${j.skills.join(' ')}`.toLowerCase().includes(q)));
  $('#pcount').textContent = `${list.length} open position${list.length === 1 ? '' : 's'}`;
  $('#jobs').innerHTML = list.map((j) => `<article class="card p-job">
    <h3>${esc(j.title)}</h3>
    <div class="meta">${icon('globe')} ${esc(j.location)} · ${j.expMin}–${j.expMax} years · ${esc(j.code)}</div>
    <div>${j.skills.slice(0, 5).map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
    <p class="desc">${esc(j.description)}</p>
    <button class="btn primary" data-apply="${j.id}">Apply now</button></article>`).join('') || '<div class="empty">No open positions match your search.</div>';
}

function applyForm(job) {
  openModal(`Apply — ${esc(job.title)}`, `<form id="fapp"><div class="form-error hidden"></div><div class="form-grid">
    ${field('Full name', 'name', { required: true })}${field('Mobile number', 'phone', { type: 'tel', required: true, placeholder: '98xxxxxxxx' })}
    ${field('Email', 'email', { type: 'email', required: true })}${field('Current location', 'location')}
    ${field('Current company', 'currentCompany')}${field('Current designation', 'currentTitle')}
    ${field('Total experience (years)', 'totalExp', { type: 'number', attrs: 'step="0.1" min="0"' })}${field('Notice period (days)', 'noticeDays', { type: 'number', attrs: 'min="0" max="180"' })}
    ${field('Current CTC (₹ lakhs p.a.)', 'currentCtc', { type: 'number', attrs: 'step="0.1" min="0"' })}${field('Expected CTC (₹ lakhs p.a.)', 'expectedCtc', { type: 'number', attrs: 'step="0.1" min="0"' })}
    ${field('Key skills', 'skills', { full: true, placeholder: 'Comma separated', value: job.skills.slice(0, 2).join(', ') })}
    <div class="field full"><label>Resume (PDF/DOC, max 2 MB)</label><input type="file" name="resume" accept=".pdf,.doc,.docx,.txt"></div>
    <label class="check full"><input type="checkbox" name="consent" required><span>I agree that Meridian Technologies may process the personal data I provide for recruitment purposes, store it for up to 12 months after my last interaction, and contact me about this and similar roles. I can ask for it to be erased at any time. <span class="muted">(Digital Personal Data Protection Act, 2023)</span></span></label>
  </div></form>`, { footer: `<button class="btn" data-close type="button">Cancel</button><button class="btn primary" type="submit" form="fapp">Submit application</button>` });
  $('#fapp').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const d = formData(f); const err = f.querySelector('.form-error');
    const btn = document.querySelector('button[form="fapp"]'); btn.disabled = true;
    try {
      const file = f.resume.files[0];
      if (file && file.size > 2 * 1024 * 1024) throw new Error('Resume must be under 2 MB');
      const resume = file ? { name: file.name, dataUrl: await readFileAsDataUrl(file) } : null;
      const r = await store.publicApply({ ...d, jobId: job.id, resume });
      $('#modal .modal-b').innerHTML = `<div class="empty" style="color:var(--text)">${icon('check')}<h2>Application received</h2>
        <p style="margin-top:8px">Thank you, ${esc(d.name.split(' ')[0])}. Your reference number is</p><p style="font-size:24px;font-weight:800;letter-spacing:.04em">${esc(r.ref)}</p>
        <p class="muted">Save it — with your mobile number it lets you check your status any time on this page.</p></div>`;
      $('#modal .modal-f').innerHTML = '<button class="btn primary" data-close>Done</button>';
      $('#tref').value = r.ref; $('#tphone').value = d.phone;
    } catch (x) { err.textContent = x.message; err.classList.remove('hidden'); btn.disabled = false; }
  });
}

async function track(e) {
  e.preventDefault();
  const out = $('#trackout');
  try {
    const s = await store.publicStatus(formData(e.target));
    out.innerHTML = `<div class="card"><div class="card-b"><div class="row between"><div><b>${esc(s.jobTitle)}</b><div class="small muted">${esc(s.ref)} · applied ${fmtDate(s.appliedAt)} · last update ${fmtDate(s.updatedAt)}</div></div><span class="badge ${s.closed ? '' : 'lvl-good'}">${esc(s.status)}</span></div>
      ${s.closed ? `<p style="margin-top:12px">Hi ${esc(s.name)}, this application is now closed. Thank you for your interest — we keep suitable profiles in mind for future roles.</p>`
    : `<div class="p-steps">${s.steps.map((x) => `<div class="${x.done ? 'done' : ''}"><i>${x.done ? icon('check') : ''}</i>${esc(x.label)}</div>`).join('')}</div>
      ${s.upcoming.length ? `<p style="margin-top:12px"><b>Upcoming interview:</b> ${s.upcoming.map((u) => `${fmtDateTime(u.at)} (${esc(u.mode)}, ${u.durationMin} min)`).join('; ')}</p>` : ''}`}</div></div>`;
  } catch (x) { out.innerHTML = `<div class="form-error">${esc(x.message)}</div>`; }
}

(async () => {
  try { const t = localStorage.getItem('mats-theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* ignore */ }
  store = await createStore();
  if (store.mode === 'local') document.querySelector('.p-hero p').insertAdjacentHTML('afterend', '<p class="small" style="color:#fab219">Demo mode — applications are stored in this browser and appear in the staff app on the same device.</p>');
  try { jobs = await store.publicJobs(); } catch (e) { toast(e.message, 'err'); }
  renderJobs();
  $('#pq').addEventListener('input', renderJobs); $('#ploc').addEventListener('change', renderJobs);
  $('#trackf').addEventListener('submit', track);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-apply]'); if (a) applyForm(jobs.find((j) => j.id === a.dataset.apply));
    if (e.target.closest('[data-close], [data-act="close-modal"]')) closeModal();
  });
})();
