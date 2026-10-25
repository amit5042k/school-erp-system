/**
 * Report registry. Modules call registerReport() once at load time; the core routes expose
 * GET /report-catalog and GET /report/:key so the generic frontend page can render any report.
 *
 * Definition:
 *   key      unique slug, used in the URL (/report/<key>)
 *   title    heading shown to the user
 *   group    catalog section, e.g. 'Finance'
 *   roles    who may run it (default admin)
 *   params   [{ name, label, type, required, default, options }]
 *            type: text | number | date | month | select | class | student | teacher | session
 *            default: a literal, or 'today' | 'monthStart' | 'yearStart' | 'currentMonth' | 'session'
 *   columns  [{ key, label, type?: 'text'|'number'|'money'|'date'|'percent', total?: boolean }]
 *   run      (params, user) => rows[]   params arrive as strings ('' when blank)
 *   columnsFor optional (params) => columns, when columns depend on the filters (e.g. days in a month)
 *   description  optional one-line help text
 */
const reports = new Map();

function registerReport(def) {
  if (!def || !def.key || !def.title || typeof def.run !== 'function' || !Array.isArray(def.columns)) {
    throw new Error(`Invalid report definition: ${def && def.key}`);
  }
  if (reports.has(def.key)) throw new Error(`Duplicate report key: ${def.key}`);
  reports.set(def.key, { group: 'General', roles: ['admin'], params: [], description: '', ...def });
}

const meta = (r) => ({
  key: r.key, title: r.title, group: r.group, description: r.description, params: r.params, columns: r.columns,
});

module.exports = { registerReport, reports, meta };
