// Runs every report as each role and every master list; flags 5xx, unexpected access, and slow reports.
const B = process.env.API || 'http://localhost:5000/api';
const json = async (r) => { try { return await r.json(); } catch { return null; } };
async function login(u, p) {
  const r = await fetch(`${B}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  return (await json(r)).token;
}
(async () => {
  const users = { admin: await login('admin', 'admin123'), teacher: await login('ritu', 'teacher123'), student: await login('ADM2025001', 'student123') };
  const problems = [];
  const get = (tok, path) => fetch(B + path, { headers: { Authorization: `Bearer ${tok}` } });

  const adminCatalog = await json(await get(users.admin, '/report-catalog'));
  console.log('reports visible to admin:', adminCatalog.length);
  for (const [role, tok] of Object.entries(users)) {
    const cat = await json(await get(tok, '/report-catalog'));
    const visible = new Set(cat.map(c => c.key));
    for (const r of adminCatalog) {
      // Fill required params with something plausible.
      const qs = new URLSearchParams();
      for (const p of r.params) {
        if (!p.required || p.default) continue;
        if (p.type === 'class') qs.set(p.name, '1');
        else if (p.type === 'student') qs.set(p.name, '1');
        else if (p.type === 'teacher') qs.set(p.name, '1');
        else if (p.type === 'month') qs.set(p.name, '2026-04');
        else if (p.type === 'date') qs.set(p.name, '2026-04-01');
        else if (p.type === 'select' && p.options?.length) qs.set(p.name, typeof p.options[0] === 'string' ? p.options[0] : p.options[0].value);
        else if (p.type === 'session') qs.set(p.name, '2026-2027');
        else qs.set(p.name, '1');
      }
      const t0 = Date.now();
      const res = await get(tok, `/report/${r.key}?${qs}`);
      const ms = Date.now() - t0;
      const body = await json(res);
      if (res.status >= 500) problems.push(`${role} ${r.key}: HTTP ${res.status}`);
      else if (visible.has(r.key) && res.status !== 200) problems.push(`${role} ${r.key}: visible in catalog but HTTP ${res.status} ${body?.error || ''}`);
      else if (!visible.has(r.key) && res.status === 200) problems.push(`${role} ${r.key}: not in catalog but runs`);
      if (res.status === 200) {
        if (!Array.isArray(body.rows)) problems.push(`${role} ${r.key}: rows missing`);
        else if (body.rows.length) {
          // Day columns in registers are legitimately empty on days with nothing marked.
          const missing = (body.columns || r.columns).filter(c => !/^d\d+$/.test(c.key) && !body.rows.some(row => c.key in row)).map(c => c.key);
          if (missing.length) problems.push(`${role} ${r.key}: columns not in rows: ${missing.join(',')}`);
        }
      }
      if (ms > 1500) problems.push(`${role} ${r.key}: slow ${ms}ms`);
    }
    if (role === 'admin') console.log('admin report run complete');
  }
  // Students must not see staff-only reports.
  const stuCat = await json(await get(users.student, '/report-catalog'));
  console.log('reports visible to student:', stuCat.map(c => c.key).join(', ') || '(none)');

  const types = await json(await get(users.admin, '/master-types'));
  for (const t of types) {
    const r = await get(users.admin, `/masters/${t.type}`);
    if (r.status !== 200) problems.push(`master ${t.type}: HTTP ${r.status}`);
  }
  console.log('master lists checked:', types.length);
  console.log(problems.length ? `PROBLEMS (${problems.length}):\n  ` + problems.join('\n  ') : 'no problems');
  process.exitCode = problems.length ? 1 : 0;
})();
