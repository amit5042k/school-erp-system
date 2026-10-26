// Online tests (MCQ): teachers build and publish tests for a class; students take them once within the
// window with a server-enforced timer; answers are graded automatically and released by the teacher.
const crypto = require('crypto');
const { db, ROLES, auth, role, safe, isStaff, num, badUrl, registerReport } = require('./_kit');

db.exec(`
  CREATE TABLE IF NOT EXISTS ot_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subject TEXT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    all_sections INTEGER NOT NULL DEFAULT 0,
    instructions TEXT,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    shuffle_questions INTEGER NOT NULL DEFAULT 0,
    shuffle_options INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
    results_released INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT
  );
  CREATE TABLE IF NOT EXISTS ot_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER NOT NULL REFERENCES ot_tests(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    image_url TEXT,
    options TEXT NOT NULL,
    correct TEXT NOT NULL,
    marks REAL NOT NULL DEFAULT 1,
    negative REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS ix_ot_questions_test ON ot_questions(test_id, position);
  CREATE TABLE IF NOT EXISTS ot_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER NOT NULL REFERENCES ot_tests(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    user_id INTEGER,
    started_at TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    submitted_at TEXT,
    auto_submitted INTEGER NOT NULL DEFAULT 0,
    layout TEXT NOT NULL,
    answers TEXT NOT NULL DEFAULT '{}',
    saved_at TEXT,
    score REAL,
    max_score REAL,
    correct_count INTEGER,
    wrong_count INTEGER,
    UNIQUE(test_id, student_id)
  );
`);

// Answers saved this long after the deadline still count, to cover a slow network on the last autosave.
const GRACE_MS = 15 * 1000;
const err = (status, message) => Object.assign(new Error(message), { status });
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const nowIso = () => new Date().toISOString();

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ---------- Lookups ---------- */
const getTest = (id) => db.prepare(`
  SELECT t.*, c.name AS class_name, c.section AS class_section, u.full_name AS created_by_name
  FROM ot_tests t JOIN classes c ON c.id = t.class_id LEFT JOIN users u ON u.id = t.created_by WHERE t.id = ?`).get(id);
const questionsOf = (testId) => db.prepare('SELECT * FROM ot_questions WHERE test_id = ? ORDER BY position, id').all(testId)
  .map(q => ({ ...q, options: parse(q.options, []), correct: parse(q.correct, []) }));

// Classes (sections) a test is for: one section, or every section of that class name.
function classIdsOf(test) {
  if (!test.all_sections) return [test.class_id];
  return db.prepare('SELECT id FROM classes WHERE name = (SELECT name FROM classes WHERE id = ?)').all(test.class_id).map(r => r.id);
}
const studentFor = (user) => (user.linked_id ? db.prepare('SELECT * FROM students WHERE id = ?').get(user.linked_id) : null);

function assertManage(user, test) {
  if (!test) throw err(404, 'Test not found');
  if (user.role !== 'admin' && test.created_by !== user.id) throw err(403, 'Only the teacher who created this test (or an admin) can change it');
}

function assertCanSee(user, test) {
  if (!test) throw err(404, 'Test not found');
  if (isStaff(user)) return null;
  const st = studentFor(user);
  if (!st || !classIdsOf(test).includes(st.class_id) || test.status === 'draft') throw err(404, 'Test not found');
  return st;
}

/* ---------- Validation ---------- */
function cleanQuestion(q, i) {
  const text = String(q.text || '').trim();
  if (!text) throw err(400, `Question ${i + 1}: enter the question text`);
  const opts = (Array.isArray(q.options) ? q.options : []).map(o => String(typeof o === 'string' ? o : o?.text || '').trim());
  if (opts.length < 2 || opts.length > 6) throw err(400, `Question ${i + 1}: give between 2 and 6 options`);
  if (opts.some(o => !o)) throw err(400, `Question ${i + 1}: an option is empty`);
  const correct = [...new Set((Array.isArray(q.correct) ? q.correct : []).map(Number))];
  if (!correct.length) throw err(400, `Question ${i + 1}: mark at least one correct option`);
  if (correct.some(c => !Number.isInteger(c) || c < 0 || c >= opts.length)) throw err(400, `Question ${i + 1}: a correct option is out of range`);
  const marks = num(q.marks ?? 1), negative = num(q.negative ?? 0);
  if (!(marks > 0)) throw err(400, `Question ${i + 1}: marks must be more than 0`);
  if (!(negative >= 0) || negative > marks) throw err(400, `Question ${i + 1}: negative marks must be between 0 and the question's marks`);
  const bad = badUrl(q.image_url, `Question ${i + 1} image`);
  if (bad) throw err(400, bad);
  return { text, image_url: q.image_url || null, options: opts.map((t, id) => ({ id, text: t })), correct, marks: round2(marks), negative: round2(negative) };
}

function cleanTest(b, existing) {
  const t = { ...existing, ...b };
  const title = String(t.title || '').trim();
  if (!title) throw err(400, 'Enter a title for the test');
  if (!t.class_id || !db.prepare('SELECT 1 FROM classes WHERE id = ?').get(t.class_id)) throw err(400, 'Choose a class');
  const start = Date.parse(t.start_at), end = Date.parse(t.end_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw err(400, 'Choose when the test opens and closes');
  if (end <= start) throw err(400, 'The test must close after it opens');
  const duration = Number(t.duration_min);
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) throw err(400, 'Duration must be 1 to 600 minutes');
  return {
    title: title.slice(0, 200), subject: String(t.subject || '').trim().slice(0, 100) || null, class_id: Number(t.class_id),
    all_sections: t.all_sections ? 1 : 0, instructions: String(t.instructions || '').trim().slice(0, 4000) || null,
    start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), duration_min: duration,
    shuffle_questions: t.shuffle_questions ? 1 : 0, shuffle_options: t.shuffle_options ? 1 : 0,
  };
}

/* ---------- Grading ---------- */
// Exact match of the chosen set earns full marks; any other answer loses the negative marks; blank is 0.
function grade(questions, answers) {
  let score = 0, max = 0, right = 0, wrong = 0;
  const detail = questions.map(q => {
    max += q.marks;
    const byNum = (a, b) => a - b;
    const chosen = [...new Set((answers[q.id] || []).map(Number))].sort(byNum);
    const correct = q.correct.slice().sort(byNum);
    let outcome = 'blank', earned = 0;
    if (chosen.length) {
      const ok = chosen.length === correct.length && chosen.every((c, i) => c === correct[i]);
      outcome = ok ? 'correct' : 'wrong';
      earned = ok ? q.marks : -q.negative;
      if (ok) right++; else wrong++;
    }
    score += earned;
    return { question_id: q.id, chosen, correct, outcome, earned: round2(earned) };
  });
  return { score: round2(score), max: round2(max), right, wrong, detail };
}

function finalize(attempt, auto) {
  const questions = questionsOf(attempt.test_id);
  const g = grade(questions, parse(attempt.answers, {}));
  db.prepare(`UPDATE ot_attempts SET submitted_at = ?, auto_submitted = ?, score = ?, max_score = ?, correct_count = ?, wrong_count = ?
    WHERE id = ? AND submitted_at IS NULL`).run(nowIso(), auto ? 1 : 0, g.score, g.max, g.right, g.wrong, attempt.id);
  return db.prepare('SELECT * FROM ot_attempts WHERE id = ?').get(attempt.id);
}

// Any attempt whose time has run out is submitted with the answers saved before the deadline.
function expireDue(testId) {
  const due = db.prepare(`SELECT * FROM ot_attempts WHERE submitted_at IS NULL ${testId ? 'AND test_id = ?' : ''}`).all(...(testId ? [testId] : []))
    .filter(a => Date.now() > Date.parse(a.deadline_at) + GRACE_MS);
  for (const a of due) finalize(a, true);
  return due.length;
}

/* ---------- Notifications ---------- */
function familyUsers(classIds) {
  if (!classIds.length) return [];
  const ph = classIds.map(() => '?').join(',');
  return db.prepare(`SELECT u.id FROM users u JOIN students s ON s.id = u.linked_id
    WHERE u.active = 1 AND u.role IN ('student','parent') AND s.class_id IN (${ph}) AND COALESCE(s.status, 'active') = 'active'`)
    .all(...classIds).map(r => r.id);
}
function notifyFamilies(test, title, body, link) {
  try {
    const { notify } = require('./push');
    notify(familyUsers(classIdsOf(test)), { title, body, link, kind: 'online-test' }).catch(() => {});
  } catch (_) { /* push module is optional */ }
}
const fmtWhen = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: process.env.TZ || 'Asia/Kolkata' });

/* ---------- Handlers: staff ---------- */
const staff = {
  list(req, res) {
    expireDue();
    const mine = req.user.role !== 'admin';
    res.json(db.prepare(`
      SELECT t.*, c.name AS class_name, c.section AS class_section, u.full_name AS created_by_name,
        (SELECT COUNT(*) FROM ot_questions q WHERE q.test_id = t.id) AS questions,
        (SELECT COALESCE(SUM(marks), 0) FROM ot_questions q WHERE q.test_id = t.id) AS total_marks,
        (SELECT COUNT(*) FROM ot_attempts a WHERE a.test_id = t.id) AS attempts,
        (SELECT COUNT(*) FROM ot_attempts a WHERE a.test_id = t.id AND a.submitted_at IS NOT NULL) AS submitted
      FROM ot_tests t JOIN classes c ON c.id = t.class_id LEFT JOIN users u ON u.id = t.created_by
      ${mine ? 'WHERE t.created_by = ?' : ''} ORDER BY t.start_at DESC`).all(...(mine ? [req.user.id] : [])));
  },
  get(req, res) {
    const t = getTest(req.params.id);
    assertManage(req.user, t);
    res.json({ ...t, questions: questionsOf(t.id), attempts: db.prepare('SELECT COUNT(*) AS c FROM ot_attempts WHERE test_id = ?').get(t.id).c });
  },
  create(req, res) {
    const t = cleanTest(req.body, {});
    const qs = (Array.isArray(req.body.questions) ? req.body.questions : []).map(cleanQuestion);
    const id = db.transaction(() => {
      const info = db.prepare(`INSERT INTO ot_tests (title, subject, class_id, all_sections, instructions, start_at, end_at, duration_min,
        shuffle_questions, shuffle_options, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(t.title, t.subject, t.class_id, t.all_sections, t.instructions, t.start_at, t.end_at, t.duration_min, t.shuffle_questions, t.shuffle_options, req.user.id);
      saveQuestions(info.lastInsertRowid, qs);
      return info.lastInsertRowid;
    })();
    res.status(201).json({ id });
  },
  update(req, res) {
    const ex = getTest(req.params.id);
    assertManage(req.user, ex);
    const attempts = db.prepare('SELECT COUNT(*) AS c FROM ot_attempts WHERE test_id = ?').get(ex.id).c;
    if (attempts) throw err(409, 'Students have already started this test, so it can no longer be edited');
    const t = cleanTest(req.body, ex);
    const qs = Array.isArray(req.body.questions) ? req.body.questions.map(cleanQuestion) : null;
    if (ex.status === 'published' && qs && !qs.length) throw err(400, 'A published test needs at least one question');
    db.transaction(() => {
      db.prepare(`UPDATE ot_tests SET title = ?, subject = ?, class_id = ?, all_sections = ?, instructions = ?, start_at = ?, end_at = ?,
        duration_min = ?, shuffle_questions = ?, shuffle_options = ? WHERE id = ?`)
        .run(t.title, t.subject, t.class_id, t.all_sections, t.instructions, t.start_at, t.end_at, t.duration_min, t.shuffle_questions, t.shuffle_options, ex.id);
      if (qs) { db.prepare('DELETE FROM ot_questions WHERE test_id = ?').run(ex.id); saveQuestions(ex.id, qs); }
    })();
    res.json({ ok: true });
  },
  remove(req, res) {
    const t = getTest(req.params.id);
    assertManage(req.user, t);
    const submitted = db.prepare('SELECT COUNT(*) AS c FROM ot_attempts WHERE test_id = ? AND submitted_at IS NOT NULL').get(t.id).c;
    if (submitted && req.user.role !== 'admin') throw err(409, `${submitted} student(s) have submitted this test; only an admin can delete it`);
    db.prepare('DELETE FROM ot_tests WHERE id = ?').run(t.id);
    res.json({ ok: true });
  },
  publish(req, res) {
    const t = getTest(req.params.id);
    assertManage(req.user, t);
    const publish = req.body.publish !== false;
    if (!publish) {
      if (db.prepare('SELECT COUNT(*) AS c FROM ot_attempts WHERE test_id = ?').get(t.id).c) throw err(409, 'Students have started this test; close it instead');
      db.prepare("UPDATE ot_tests SET status = 'draft', published_at = NULL WHERE id = ?").run(t.id);
      return res.json({ ok: true, status: 'draft' });
    }
    if (t.status === 'published') return res.json({ ok: true, status: 'published' });
    if (!questionsOf(t.id).length) throw err(400, 'Add at least one question before publishing');
    if (Date.parse(t.end_at) <= Date.now()) throw err(400, 'The closing time has already passed; change it before publishing');
    db.prepare("UPDATE ot_tests SET status = 'published', published_at = ? WHERE id = ?").run(nowIso(), t.id);
    notifyFamilies(t, `New online test: ${t.title}`, `${t.subject ? t.subject + ' · ' : ''}${t.duration_min} min. Opens ${fmtWhen(t.start_at)}, closes ${fmtWhen(t.end_at)}.`, `/online-tests/take?id=${t.id}`);
    res.json({ ok: true, status: 'published' });
  },
  close(req, res) {
    const t = getTest(req.params.id);
    assertManage(req.user, t);
    if (t.status !== 'published') throw err(400, 'Only a published test can be closed');
    db.prepare("UPDATE ot_tests SET status = 'closed', end_at = CASE WHEN end_at > ? THEN ? ELSE end_at END WHERE id = ?").run(nowIso(), nowIso(), t.id);
    // Students still writing keep the answers they have saved so far.
    for (const a of db.prepare('SELECT * FROM ot_attempts WHERE test_id = ? AND submitted_at IS NULL').all(t.id)) finalize(a, true);
    res.json({ ok: true });
  },
  release(req, res) {
    const t = getTest(req.params.id);
    assertManage(req.user, t);
    const released = req.body.released !== false;
    if (released && Date.parse(t.end_at) > Date.now() && t.status !== 'closed') throw err(400, 'Results can be released after the test closes');
    expireDue(t.id);
    db.prepare('UPDATE ot_tests SET results_released = ? WHERE id = ?').run(released ? 1 : 0, t.id);
    if (released && !t.results_released) notifyFamilies(t, `Result: ${t.title}`, 'Your online test result is now available.', `/online-tests/result?id=${t.id}`);
    res.json({ ok: true, results_released: released });
  },
  results(req, res) {
    const t = getTest(req.params.id);
    assertManage(req.user, t);
    expireDue(t.id);
    const questions = questionsOf(t.id);
    const ids = classIdsOf(t);
    const ph = ids.map(() => '?').join(',');
    const students = db.prepare(`
      SELECT s.id AS student_id, s.full_name, s.admission_no, s.roll_no, c.name || ' ' || c.section AS class,
        a.id AS attempt_id, a.started_at, a.submitted_at, a.auto_submitted, a.score, a.max_score, a.correct_count, a.wrong_count
      FROM students s JOIN classes c ON c.id = s.class_id
      LEFT JOIN ot_attempts a ON a.student_id = s.id AND a.test_id = ?
      WHERE s.class_id IN (${ph}) AND (COALESCE(s.status, 'active') = 'active' OR a.id IS NOT NULL)
      ORDER BY c.section, s.roll_no, s.full_name`).all(t.id, ...ids);
    const attempts = db.prepare('SELECT answers FROM ot_attempts WHERE test_id = ? AND submitted_at IS NOT NULL').all(t.id).map(a => parse(a.answers, {}));
    const analysis = questions.map(q => {
      const picks = q.options.map(() => 0);
      let right = 0, wrongN = 0, blank = 0;
      for (const ans of attempts) {
        const chosen = (ans[q.id] || []).map(Number);
        chosen.forEach(c => { if (picks[c] != null) picks[c]++; });
        if (!chosen.length) blank++;
        else if (grade([q], { [q.id]: chosen }).right) right++; else wrongN++;
      }
      return { question_id: q.id, text: q.text, marks: q.marks, correct: q.correct, options: q.options.map((o, i) => ({ ...o, picked: picks[i] })),
        right, wrong: wrongN, blank, pct_correct: attempts.length ? round2((right / attempts.length) * 100) : 0 };
    });
    const scores = students.filter(s => s.submitted_at).map(s => s.score);
    res.json({
      test: { ...t, total_marks: round2(questions.reduce((a, q) => a + q.marks, 0)), questions: questions.length },
      summary: {
        students: students.length, submitted: scores.length, not_attempted: students.filter(s => !s.attempt_id).length,
        average: scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        highest: scores.length ? Math.max(...scores) : null, lowest: scores.length ? Math.min(...scores) : null,
      },
      students, analysis,
    });
  },
};

function saveQuestions(testId, qs) {
  const ins = db.prepare('INSERT INTO ot_questions (test_id, position, text, image_url, options, correct, marks, negative) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  qs.forEach((q, i) => ins.run(testId, i, q.text, q.image_url, JSON.stringify(q.options), JSON.stringify(q.correct), q.marks, q.negative));
}

/* ---------- Handlers: students & parents ---------- */
function stateOf(t, a) {
  const now = Date.now();
  if (a?.submitted_at) return 'submitted';
  if (a) return now > Date.parse(a.deadline_at) + GRACE_MS ? 'submitted' : 'in_progress';
  if (t.status === 'closed' || now > Date.parse(t.end_at)) return 'missed';
  if (now < Date.parse(t.start_at)) return 'upcoming';
  return 'open';
}

// The question paper as the student sees it: their own order, no correct answers.
function paperFor(attempt) {
  const layout = parse(attempt.layout, []);
  const byId = new Map(questionsOf(attempt.test_id).map(q => [q.id, q]));
  return layout.map(({ q, o }) => {
    const qq = byId.get(q);
    if (!qq) return null;
    return { id: qq.id, text: qq.text, image_url: qq.image_url, marks: qq.marks, negative: qq.negative, multiple: qq.correct.length > 1,
      options: o.map(i => qq.options[i]).filter(Boolean) };
  }).filter(Boolean);
}

const student = {
  mine(req, res) {
    if (isStaff(req.user)) throw err(400, 'This list is for students and parents');
    const st = studentFor(req.user);
    if (!st) return res.json([]);
    expireDue();
    const tests = db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM ot_questions q WHERE q.test_id = t.id) AS questions,
        (SELECT COALESCE(SUM(marks), 0) FROM ot_questions q WHERE q.test_id = t.id) AS total_marks
      FROM ot_tests t WHERE t.status != 'draft' ORDER BY t.start_at DESC`).all()
      .filter(t => classIdsOf(t).includes(st.class_id));
    const att = db.prepare('SELECT * FROM ot_attempts WHERE test_id = ? AND student_id = ?');
    res.json(tests.map(t => {
      const a = att.get(t.id, st.id);
      return {
        id: t.id, title: t.title, subject: t.subject, start_at: t.start_at, end_at: t.end_at, duration_min: t.duration_min,
        questions: t.questions, total_marks: t.total_marks, state: stateOf(t, a), results_released: !!t.results_released,
        score: t.results_released && a?.submitted_at ? a.score : null, max_score: t.results_released && a?.submitted_at ? a.max_score : null,
        can_take: req.user.role === 'student',
      };
    }));
  },
  start(req, res) {
    if (req.user.role !== 'student') throw err(403, 'Only the student can take the test');
    const t = getTest(req.params.id);
    const st = assertCanSee(req.user, t);
    let a = db.prepare('SELECT * FROM ot_attempts WHERE test_id = ? AND student_id = ?').get(t.id, st.id);
    const now = Date.now();
    if (a && !a.submitted_at && now > Date.parse(a.deadline_at) + GRACE_MS) a = finalize(a, true);
    if (a?.submitted_at) throw err(409, 'You have already submitted this test');
    if (!a) {
      if (t.status !== 'published') throw err(400, 'This test is not open');
      if (now < Date.parse(t.start_at)) throw err(400, `This test opens at ${fmtWhen(t.start_at)}`);
      if (now >= Date.parse(t.end_at)) throw err(400, 'This test has closed');
      const qs = questionsOf(t.id);
      if (!qs.length) throw err(400, 'This test has no questions');
      const order = t.shuffle_questions ? shuffle(qs) : qs;
      const layout = order.map(q => ({ q: q.id, o: t.shuffle_options ? shuffle(q.options.map(o => o.id)) : q.options.map(o => o.id) }));
      const deadline = Math.min(now + t.duration_min * 60000, Date.parse(t.end_at));
      try {
        db.prepare('INSERT INTO ot_attempts (test_id, student_id, user_id, started_at, deadline_at, layout) VALUES (?, ?, ?, ?, ?, ?)')
          .run(t.id, st.id, req.user.id, new Date(now).toISOString(), new Date(deadline).toISOString(), JSON.stringify(layout));
      } catch (e) {
        if (!/UNIQUE/.test(e.message)) throw e;   // two tabs started at once: use the attempt that won
      }
      a = db.prepare('SELECT * FROM ot_attempts WHERE test_id = ? AND student_id = ?').get(t.id, st.id);
    }
    res.json({
      attempt_id: a.id, test: { id: t.id, title: t.title, subject: t.subject, instructions: t.instructions, duration_min: t.duration_min },
      server_time: nowIso(), deadline_at: a.deadline_at, answers: parse(a.answers, {}), questions: paperFor(a),
    });
  },
  save(req, res) {
    const a = db.prepare('SELECT * FROM ot_attempts WHERE id = ?').get(req.params.id);
    if (!a || a.user_id !== req.user.id) throw err(404, 'Attempt not found');
    if (a.submitted_at) throw err(409, 'This test has already been submitted');
    if (Date.now() > Date.parse(a.deadline_at) + GRACE_MS) {
      finalize(a, true);
      throw err(409, 'Time is up; your saved answers have been submitted');
    }
    const answers = sanitizeAnswers(a, req.body.answers);
    db.prepare('UPDATE ot_attempts SET answers = ?, saved_at = ? WHERE id = ?').run(JSON.stringify(answers), nowIso(), a.id);
    if (req.body.submit) {
      const done = finalize({ ...a, answers: JSON.stringify(answers) }, false);
      return res.json({ ok: true, submitted: true, submitted_at: done.submitted_at });
    }
    res.json({ ok: true, saved_at: nowIso(), deadline_at: a.deadline_at });
  },
  submit(req, res) {
    req.body = { ...req.body, submit: true };
    if (req.body.answers === undefined) {
      const a = db.prepare('SELECT * FROM ot_attempts WHERE id = ?').get(req.params.id);
      if (a) req.body.answers = parse(a.answers, {});
    }
    return student.save(req, res);
  },
  result(req, res) {
    const t = getTest(req.params.id);
    const st = assertCanSee(req.user, t);
    if (isStaff(req.user)) throw err(400, 'Staff see results on the results page');
    expireDue(t.id);
    const a = db.prepare('SELECT * FROM ot_attempts WHERE test_id = ? AND student_id = ?').get(t.id, st.id);
    if (!a || !a.submitted_at) return res.json({ test: { id: t.id, title: t.title }, attempted: false, released: !!t.results_released });
    if (!t.results_released) return res.json({ test: { id: t.id, title: t.title }, attempted: true, released: false, submitted_at: a.submitted_at });
    const questions = questionsOf(t.id);
    const g = grade(questions, parse(a.answers, {}));
    const byId = new Map(g.detail.map(d => [d.question_id, d]));
    res.json({
      test: { id: t.id, title: t.title, subject: t.subject }, attempted: true, released: true, submitted_at: a.submitted_at,
      auto_submitted: !!a.auto_submitted, score: a.score, max_score: a.max_score, correct_count: a.correct_count, wrong_count: a.wrong_count,
      questions: questions.map(q => ({ id: q.id, text: q.text, image_url: q.image_url, marks: q.marks, negative: q.negative, options: q.options, ...byId.get(q.id) })),
    });
  },
};

function sanitizeAnswers(attempt, raw) {
  const layout = parse(attempt.layout, []);
  const allowed = new Map(layout.map(({ q, o }) => [String(q), new Set(o)]));
  const out = {};
  for (const [qid, picks] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const opts = allowed.get(String(qid));
    if (!opts) continue;
    const list = [...new Set((Array.isArray(picks) ? picks : [picks]).map(Number))].filter(p => opts.has(p));
    if (list.length) out[qid] = list;
  }
  return out;
}

registerReport({
  key: 'online-test-results', title: 'Online Test Results', group: 'Examination', roles: ROLES.STAFF,
  description: 'Scores for every submitted online test in a date range.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'monthStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'class_id', label: 'Class', type: 'class' },
  ],
  columns: [
    { key: 'test', label: 'Test' }, { key: 'subject', label: 'Subject' }, { key: 'class', label: 'Class' },
    { key: 'admission_no', label: 'Adm No' }, { key: 'student', label: 'Student' },
    { key: 'score', label: 'Score', type: 'number' }, { key: 'max_score', label: 'Out Of', type: 'number' },
    { key: 'percent', label: '%', type: 'percent' }, { key: 'submitted', label: 'Submitted' },
  ],
  run: (p, user) => db.prepare(`
    SELECT t.title AS test, t.subject, c.name || ' ' || c.section AS class, s.admission_no, s.full_name AS student,
      a.score, a.max_score, CASE WHEN a.max_score > 0 THEN ROUND(a.score * 100.0 / a.max_score, 1) END AS percent,
      CASE WHEN a.auto_submitted THEN 'Time up' ELSE 'Yes' END AS submitted
    FROM ot_attempts a JOIN ot_tests t ON t.id = a.test_id JOIN students s ON s.id = a.student_id JOIN classes c ON c.id = s.class_id
    WHERE a.submitted_at IS NOT NULL AND date(t.start_at, 'localtime') BETWEEN ? AND ? AND (? = '' OR s.class_id = ?)
      AND (? = 'admin' OR t.created_by = ?)
    ORDER BY t.start_at DESC, c.section, s.roll_no`).all(p.from, p.to, p.class_id, p.class_id, user.role, user.id),
});

function register(router) {
  const S = [auth, role(...ROLES.STAFF)];
  router.get('/online-tests', ...S, safe(staff.list));
  router.post('/online-tests', ...S, safe(staff.create));
  router.get('/online-tests/my', auth, safe(student.mine));
  router.get('/online-tests/:id', ...S, safe(staff.get));
  router.put('/online-tests/:id', ...S, safe(staff.update));
  router.delete('/online-tests/:id', ...S, safe(staff.remove));
  router.post('/online-tests/:id/publish', ...S, safe(staff.publish));
  router.post('/online-tests/:id/close', ...S, safe(staff.close));
  router.post('/online-tests/:id/release', ...S, safe(staff.release));
  router.get('/online-tests/:id/results', ...S, safe(staff.results));
  router.post('/online-tests/:id/start', auth, safe(student.start));
  router.get('/online-tests/:id/my-result', auth, safe(student.result));
  router.put('/online-tests/attempts/:id', auth, safe(student.save));
  router.post('/online-tests/attempts/:id/submit', auth, safe(student.submit));
}

module.exports = { register, grade };
