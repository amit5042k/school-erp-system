// The only commands the console ever runs. Arguments come from config or from validated school codes, are
// passed as an argv array (no shell), and nothing runs unless APPLY_ENABLED=true.
const { execFile } = require('child_process');
const { cfg } = require('./config');
const { CODE_RE } = require('./generate');

const wrap = (bin, args) => (cfg.useSudo ? ['sudo', ['-n', bin, ...args]] : [bin, args]);

const APPLY_STEPS = () => [
  wrap('pm2', ['startOrReload', cfg.ecosystemPath, '--update-env']),
  wrap('pm2', ['save']),
  wrap('nginx', ['-t']),
  wrap('nginx', ['-s', 'reload']),
];

const STOP_SCHOOL = (code) => {
  if (!CODE_RE.test(code)) throw new Error('Invalid school code');
  return [wrap('pm2', ['delete', `erp-school-${code}`]), wrap('pm2', ['save'])];
};

const show = ([bin, args]) => [bin, ...args].join(' ');

function run([bin, args]) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 60000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ command: show([bin, args]), ok: !err, code: err ? (err.code ?? 1) : 0, output: `${stdout || ''}${stderr || ''}`.trim().slice(-4000) });
    });
  });
}

async function runSteps(steps) {
  if (!cfg.applyEnabled) return { dryRun: true, steps: steps.map(s => ({ command: show(s), ok: true, output: 'dry run (set APPLY_ENABLED=true to run)' })) };
  const results = [];
  for (const s of steps) {
    const r = await run(s);
    results.push(r);
    if (!r.ok) break;
  }
  return { dryRun: false, steps: results };
}

module.exports = { applyAll: () => runSteps(APPLY_STEPS()), stopSchool: (code) => runSteps(STOP_SCHOOL(code)), planned: () => APPLY_STEPS().map(show) };
