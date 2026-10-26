// Platform console UI (no framework). Every value from the server is escaped before it reaches innerHTML.
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const chip = (s) => `<span class="chip ${esc(s)}">${esc(s)}</span>`;
let token = sessionStorage.getItem('platform_token') || '';
let areas = [];
let plans = [];

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') { logout(); throw new Error('Please sign in again'); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function flash(text, ok = true) {
  const f = $('#flash');
  f.className = `flash ${ok ? 'ok' : 'bad'}`;
  f.textContent = text;
  if (ok) setTimeout(() => f.classList.add('hidden'), 4000);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
const fail = (e) => flash(e.message, false);

function openDialog(html, onMount) {
  $('#dlgBody').innerHTML = html;
  $('#dlg').showModal();
  onMount && onMount($('#dlgBody'));
}
const closeDialog = () => $('#dlg').close();
const formData = (form) => Object.fromEntries(new FormData(form).entries());

/* ---------- Auth ---------- */
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    const r = await api('/auth/login', { method: 'POST', body: formData(e.target) });
    token = r.token; sessionStorage.setItem('platform_token', token);
    start();
  } catch (err) { $('#loginErr').textContent = err.message; }
});
function logout() { token = ''; sessionStorage.removeItem('platform_token'); $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
$('#logout').addEventListener('click', logout);

/* ---------- Tabs ---------- */
const loaders = { dashboard: loadDashboard, schools: loadSchools, plans: loadPlans, renewals: loadRenewals, activity: loadActivity, system: loadSystem };
function show(tab) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('main section').forEach(s => s.classList.toggle('hidden', s.id !== `tab-${tab}`));
  loaders[tab]().catch(fail);
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));

async function start() {
  try {
    const me = await api('/me');
    $('#ownerName').textContent = me.name;
    [areas, plans] = await Promise.all([api('/areas'), api('/plans')]);
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    show('dashboard');
  } catch { logout(); }
}

/* ---------- Dashboard ---------- */
async function loadDashboard() {
  const d = await api('/dashboard');
  const c = d.counts;
  $('#tab-dashboard').innerHTML = `
    <div class="stats">
      <div class="stat"><span>Schools</span><b>${d.total}</b></div>
      <div class="stat"><span>Active</span><b>${c.active || 0}</b></div>
      <div class="stat"><span>Trial</span><b>${c.trial || 0}</b></div>
      <div class="stat"><span>Suspended / expired</span><b>${(c.suspended || 0) + (c.expired || 0)}</b></div>
      <div class="stat"><span>Students (all schools)</span><b>${d.students.toLocaleString('en-IN')}</b></div>
      <div class="stat"><span>Annual recurring</span><b>${money(d.annual_recurring)}</b></div>
      <div class="stat"><span>Received this FY</span><b>${money(d.revenue_this_fy)}</b></div>
    </div>
    <div class="card"><h2>Expiring in the next 30 days</h2>
      ${d.expiring_soon.length ? table(['School', 'Plan', 'Expires', ''], d.expiring_soon.map(s => [esc(s.name), esc(s.plan_name), esc(s.expires_on),
        `<button class="btn" data-renew="${s.id}">Renew</button>`])) : '<p class="muted">Nothing expiring soon.</p>'}
    </div>
    <div class="card"><h2>All schools</h2>${schoolTable(d.schools)}</div>`;
  wireSchoolRows($('#tab-dashboard'));
}

function table(head, rows) {
  return `<div class="scroll"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="muted">Nothing yet.</td></tr>`
  }</tbody></table></div>`;
}

function schoolTable(list) {
  const rows = list.map(s => `<tr class="click" data-school="${s.id}">
    <td><b>${esc(s.name)}</b><div class="muted">${esc(s.code)} · ${esc(s.url)}</div></td>
    <td>${chip(s.effective_status)}</td><td>${esc(s.plan_name)}</td><td>${esc(s.expires_on)}</td>
    <td>${s.usage && !s.usage.error ? `${s.usage.students}${s.student_limit ? ` / ${s.student_limit}` : ''}` : `<span class="muted">${esc(s.usage?.error || '—')}</span>`}</td>
    <td>${esc(s.port)}</td></tr>`).join('');
  return `<div class="scroll"><table><thead><tr><th>School</th><th>Status</th><th>Plan</th><th>Expires</th><th>Students</th><th>Port</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">No schools yet. Add one on the Schools tab.</td></tr>'}</tbody></table></div>`;
}
function wireSchoolRows(root) {
  root.querySelectorAll('[data-school]').forEach(r => r.addEventListener('click', () => openSchool(r.dataset.school)));
  root.querySelectorAll('[data-renew]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); renewDialog(b.dataset.renew); }));
}

/* ---------- Schools ---------- */
const planOptions = (sel) => plans.filter(p => p.active).map(p => `<option value="${p.id}" ${String(sel) === String(p.id) ? 'selected' : ''}>${esc(p.name)} — ${money(p.price_per_year)}/yr</option>`).join('');

async function loadSchools() {
  const list = await api('/schools');
  $('#tab-schools').innerHTML = `
    <div class="row"><h1>Schools</h1><span class="spacer"></span><button class="btn primary" id="addSchool">+ Add School</button></div>
    <div class="card">${schoolTable(list)}</div>`;
  $('#addSchool').addEventListener('click', addSchoolDialog);
  wireSchoolRows($('#tab-schools'));
}

function addSchoolDialog() {
  openDialog(`<h2>Add a school</h2>
    <form id="fAdd">
      <div class="grid2">
        <label>School name *<input name="name" required minlength="3"></label>
        <label>Code * <span class="muted">(e.g. dps2)</span><input name="code" required pattern="[a-z][a-z0-9]{1,19}"></label>
        <label>Subdomain <span class="muted">(blank = code)</span><input name="subdomain" pattern="[a-z0-9-]{1,32}"></label>
        <label>Plan *<select name="plan_id" required>${planOptions()}</select></label>
        <label>Start as<select name="status"><option value="trial">Trial</option><option value="active">Active (paid)</option></select></label>
        <label>Trial / first period (days)<input name="trial_days" type="number" min="0" max="365" value="30"></label>
        <label>Contact person<input name="contact_name"></label>
        <label>Contact phone<input name="contact_phone"></label>
        <label>Contact email<input name="contact_email" type="email"></label>
        <label>Student limit <span class="muted">(blank = plan)</span><input name="max_students" type="number" min="1"></label>
      </div>
      <label>Notes<textarea name="notes" rows="2"></textarea></label>
      <div class="error" id="addErr"></div>
      <div class="row"><button class="btn primary">Create School</button><button type="button" class="btn" id="cancel">Cancel</button></div>
    </form>`, (root) => {
    $('#cancel', root).addEventListener('click', closeDialog);
    $('#fAdd', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button.primary'); btn.disabled = true; btn.textContent = 'Creating…';
      try {
        const r = await api('/schools', { method: 'POST', body: formData(e.target) });
        openDialog(`<h2>${esc(r.school.name)} is ready</h2>
          <p>Address: <b>${esc(r.url)}</b> (backend port ${esc(r.school.port)})</p>
          <p>First sign-in for the school's administrator. <b>This password is shown only once</b>; they must change it after signing in.</p>
          <div class="secret">Username: ${esc(r.admin.username)}<br>Password: ${esc(r.admin.password)}</div>
          <p class="muted">Next: open the Server tab and press Apply so nginx and pm2 pick up the new school.</p>
          <button class="btn primary" id="done">Done</button>`, (root2) => $('#done', root2).addEventListener('click', () => { closeDialog(); loadSchools(); }));
      } catch (err) { $('#addErr', root).textContent = err.message; btn.disabled = false; btn.textContent = 'Create School'; }
    });
  });
}

async function openSchool(id) {
  const s = await api(`/schools/${id}`);
  const u = s.usage && !s.usage.error ? s.usage : null;
  openDialog(`<div class="row"><h2>${esc(s.name)}</h2>${chip(s.effective_status)}<span class="spacer"></span><button class="btn" id="x">Close</button></div>
    <p class="muted">${esc(s.url)} · code ${esc(s.code)} · port ${esc(s.port)} · ${esc(s.plan_name)} · expires ${esc(s.expires_on)}</p>
    <div class="stats">
      <div class="stat"><span>Active students</span><b>${u ? u.students : '—'}</b></div>
      <div class="stat"><span>Staff</span><b>${u ? u.staff : '—'}</b></div>
      <div class="stat"><span>Last sign-in</span><b style="font-size:14px">${u?.last_login_at ? esc(new Date(u.last_login_at).toLocaleString()) : esc(s.usage?.error || '—')}</b></div>
    </div>
    ${s.status === 'archived' ? `<p>Archived to <code>${esc(s.archive_path)}</code>.</p>` : `
    <form id="fEdit"><div class="grid2">
      <label>Name<input name="name" value="${esc(s.name)}"></label>
      <label>Plan<select name="plan_id">${planOptions(s.plan_id)}</select></label>
      <label>Expiry<input name="expires_on" type="date" value="${esc(s.expires_on)}"></label>
      <label>Student limit <span class="muted">(blank = plan)</span><input name="max_students" type="number" min="1" value="${esc(s.max_students ?? '')}"></label>
      <label>Contact person<input name="contact_name" value="${esc(s.contact_name)}"></label>
      <label>Contact phone<input name="contact_phone" value="${esc(s.contact_phone)}"></label>
      <label>Contact email<input name="contact_email" type="email" value="${esc(s.contact_email)}"></label>
    </div><label>Notes<textarea name="notes" rows="2">${esc(s.notes)}</textarea></label>
    <div class="row"><button class="btn primary">Save</button>
      <button type="button" class="btn" id="renew">Record payment / renew</button>
      ${s.status === 'suspended' ? '<button type="button" class="btn" id="resume">Resume</button>' : '<button type="button" class="btn" id="suspend">Suspend</button>'}
      <button type="button" class="btn" id="lic">Licence file</button>
      <span class="spacer"></span><button type="button" class="btn danger" id="archive">Archive…</button></div></form>`}
    <h2 style="margin-top:16px">Payments</h2>
    ${table(['Paid on', 'Amount', 'Months', 'New expiry', 'Mode / ref'], s.renewals.map(r => [esc(r.paid_on), money(r.amount), esc(r.months), esc(r.new_expires_on), `${esc(r.mode)} ${esc(r.reference)}`]))}
    <h2 style="margin-top:16px">History</h2>
    ${table(['When', 'Action', 'By', 'Detail'], s.events.map(e => [esc(e.created_at), esc(e.action), esc(e.owner_name), esc(e.detail)]))}`, (root) => {
    $('#x', root).addEventListener('click', closeDialog);
    if (s.status === 'archived') return;
    $('#fEdit', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api(`/schools/${s.id}`, { method: 'PUT', body: formData(e.target) }); flash('Saved.'); openSchool(s.id); refreshTab(); } catch (err) { fail(err); }
    });
    $('#renew', root).addEventListener('click', () => renewDialog(s.id));
    $('#suspend', root)?.addEventListener('click', async () => {
      if (!confirm(`Suspend ${s.name}? Its ERP becomes read-only until you resume it.`)) return;
      try { await api(`/schools/${s.id}/suspend`, { method: 'POST' }); flash(`${s.name} suspended.`); openSchool(s.id); refreshTab(); } catch (err) { fail(err); }
    });
    $('#resume', root)?.addEventListener('click', async () => {
      try { await api(`/schools/${s.id}/resume`, { method: 'POST' }); flash(`${s.name} resumed.`); openSchool(s.id); refreshTab(); } catch (err) { fail(err); }
    });
    $('#lic', root).addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/schools/${s.id}/licence-file`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Could not create the licence file');
        const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = `licence-${s.code}.jwt`; a.click();
      } catch (err) { fail(err); }
    });
    $('#archive', root).addEventListener('click', async () => {
      const code = prompt(`Archiving stops ${s.name}'s ERP and moves its data to the archive folder.\nType the school code (${s.code}) to confirm:`);
      if (!code) return;
      try { const r = await api(`/schools/${s.id}`, { method: 'DELETE', body: { confirm_code: code } }); closeDialog(); flash(`Archived to ${r.archive_path}.`); refreshTab(); } catch (err) { fail(err); }
    });
  });
}

function renewDialog(id) {
  openDialog(`<h2>Record payment / renew</h2>
    <form id="fRenew"><div class="grid2">
      <label>Extend by (months)<input name="months" type="number" min="1" max="60" value="12" required></label>
      <label>Amount received (₹)<input name="amount" type="number" min="0" step="1" value="0"></label>
      <label>Paid on<input name="paid_on" type="date"></label>
      <label>Mode<select name="mode"><option>Bank transfer</option><option>UPI</option><option>Cheque</option><option>Cash</option><option>Other</option></select></label>
      <label>Reference<input name="reference"></label>
    </div><label>Note<input name="note"></label>
    <p class="muted">Renewing before expiry extends from the current expiry date; after expiry it starts today.</p>
    <div class="error" id="rErr"></div>
    <div class="row"><button class="btn primary">Save</button><button type="button" class="btn" id="c">Cancel</button></div></form>`, (root) => {
    $('#c', root).addEventListener('click', closeDialog);
    $('#fRenew', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const s = await api(`/schools/${id}/renew`, { method: 'POST', body: formData(e.target) }); closeDialog(); flash(`${s.name} renewed until ${s.expires_on}.`); refreshTab(); }
      catch (err) { $('#rErr', root).textContent = err.message; }
    });
  });
}

/* ---------- Plans ---------- */
async function loadPlans() {
  plans = await api('/plans');
  const label = (k) => areas.find(a => a.key === k)?.label || k;
  $('#tab-plans').innerHTML = `<div class="row"><h1>Plans</h1><span class="spacer"></span><button class="btn primary" id="addPlan">+ Add Plan</button></div>
    <p class="muted">A plan decides which parts of the ERP a school can use and how many active students it may have. Prices are for your records and the revenue summary.</p>
    <div class="card">${table(['Plan', 'Price / year', 'Students', 'Areas', 'Schools', ''], plans.map(p => [
      `<b>${esc(p.name)}</b>${p.active ? '' : ' <span class="muted">(hidden)</span>'}`, money(p.price_per_year), esc(p.max_students ?? 'Unlimited'),
      `<span class="muted">${p.areas.map(a => esc(label(a))).join(', ')}</span>`, esc(p.schools), `<button class="btn" data-plan="${p.id}">Edit</button>`]))}</div>`;
  $('#addPlan').addEventListener('click', () => planDialog(null));
  document.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', () => planDialog(plans.find(p => String(p.id) === b.dataset.plan))));
}

function planDialog(p) {
  const has = (k) => !p || p.areas.includes(k);
  openDialog(`<h2>${p ? 'Edit plan' : 'Add plan'}</h2>
    <form id="fPlan"><div class="grid2">
      <label>Name<input name="name" required value="${esc(p?.name)}"></label>
      <label>Price per year (₹)<input name="price_per_year" type="number" min="0" value="${esc(p?.price_per_year ?? 0)}"></label>
      <label>Active student limit <span class="muted">(blank = unlimited)</span><input name="max_students" type="number" min="1" value="${esc(p?.max_students ?? '')}"></label>
      ${p ? `<label>Offer to new schools<select name="active"><option value="1" ${p.active ? 'selected' : ''}>Yes</option><option value="0" ${p.active ? '' : 'selected'}>No (hidden)</option></select></label>` : ''}
    </div>
    <b>Included areas</b>
    <div class="areas">${areas.map(a => `<label><input type="checkbox" name="area" value="${esc(a.key)}" ${has(a.key) ? 'checked' : ''}> ${esc(a.label)}</label>`).join('')}</div>
    <p class="muted">Changes apply to every school on this plan within a few minutes.</p>
    <div class="error" id="pErr"></div>
    <div class="row"><button class="btn primary">Save</button><button type="button" class="btn" id="c">Cancel</button></div></form>`, (root) => {
    $('#c', root).addEventListener('click', closeDialog);
    $('#fPlan', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const body = { name: f.get('name'), price_per_year: f.get('price_per_year'), max_students: f.get('max_students'), areas: f.getAll('area') };
      if (p) body.active = f.get('active') === '1';
      try { await api(p ? `/plans/${p.id}` : '/plans', { method: p ? 'PUT' : 'POST', body }); closeDialog(); flash('Plan saved.'); loadPlans(); }
      catch (err) { $('#pErr', root).textContent = err.message; }
    });
  });
}

/* ---------- Renewals, activity ---------- */
async function loadRenewals() {
  const r = await api('/renewals');
  const total = r.reduce((a, x) => a + (x.amount || 0), 0);
  $('#tab-renewals').innerHTML = `<h1>Payments &amp; renewals</h1><p class="muted">${r.length} payment(s), ${money(total)} in total.</p>
    <div class="card">${table(['Paid on', 'School', 'Amount', 'Months', 'Old → new expiry', 'Mode / ref', 'By'], r.map(x => [esc(x.paid_on), esc(x.school_name),
      money(x.amount), esc(x.months), `${esc(x.old_expires_on)} → ${esc(x.new_expires_on)}`, `${esc(x.mode)} ${esc(x.reference)}`, esc(x.owner_name)]))}</div>`;
}
async function loadActivity() {
  const ev = await api('/events');
  $('#tab-activity').innerHTML = `<h1>Activity</h1><div class="card">${table(['When', 'Action', 'School', 'By', 'Detail'],
    ev.map(e => [esc(e.created_at), esc(e.action), esc(e.school_name), esc(e.owner_name), esc(e.detail)]))}</div>`;
}

/* ---------- Server ---------- */
async function loadSystem() {
  const s = await api('/system');
  $('#tab-system').innerHTML = `<h1>Server configuration</h1>
    <div class="card"><p>Schools are served at <b>&lt;subdomain&gt;.${esc(s.base_domain)}</b>; this console at <b>${esc(s.console_host)}</b>. SSL mode: <b>${esc(s.ssl_mode)}</b>.</p>
      <p>Apply writes <code>${esc(s.ecosystem_path)}</code> and <code>${esc(s.nginx_conf_path)}</code>, then runs:</p>
      <pre>${s.commands.map(esc).join('\n')}</pre>
      ${s.apply_enabled ? '' : '<p class="muted">Dry-run mode: commands are only shown. Set APPLY_ENABLED=true in platform/.env when the server is ready.</p>'}
      <button class="btn primary" id="apply">Apply now</button><div id="applyOut"></div></div>
    <div class="card"><h2>nginx</h2><pre>${esc(s.nginx)}</pre></div>
    <div class="card"><h2>pm2 ecosystem (secrets hidden)</h2><pre>${esc(s.ecosystem)}</pre></div>`;
  $('#apply').addEventListener('click', async () => {
    try {
      const r = await api('/system/apply', { method: 'POST' });
      $('#applyOut').innerHTML = `<pre>${r.steps.map(x => `${x.ok ? '✔' : '✘'} ${esc(x.command)}\n${esc(x.output)}`).join('\n\n')}</pre>`;
      flash(r.dryRun ? 'Config files written (dry run, no commands run).' : r.steps.every(x => x.ok) ? 'Applied.' : 'A command failed; see output.', r.dryRun || r.steps.every(x => x.ok));
    } catch (err) { fail(err); }
  });
}

function refreshTab() {
  const active = document.querySelector('#tabs button.active')?.dataset.tab || 'dashboard';
  loaders[active]().catch(fail);
}

if (token) start(); else logout();
