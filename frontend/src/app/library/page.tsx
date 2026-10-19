'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import { api, fmtDate, localDate } from '@/lib/api';

type Book = { id: number; book_no: string; title: string; author: string; qty_total: number; qty_available: number };
type Issue = { id: number; book_title: string; book_no: string; student_name?: string; teacher_name?: string; issue_date: string; due_date: string; return_date?: string; status: string; fine: number };

export default function LibraryPage() {
  const [tab, setTab] = useState<null | 'books' | 'issues'>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [issueFilter, setIssueFilter] = useState<'issued' | ''>('issued');
  const [error, setError] = useState<string | null>(null);
  const [addBook, setAddBook] = useState(false);
  const [addIssue, setAddIssue] = useState(false);
  const [bookForm, setBookForm] = useState<any>({ book_no: '', title: '', author: '', publisher: '', category: '', qty_total: 1, qty_available: 1, rack: '', price: '' });
  const [issueForm, setIssueForm] = useState<any>({ borrower: 'student', book_id: '', student_id: '', teacher_id: '', due_date: '' });

  async function load() {
    try {
      setBooks(await api<Book[]>('/books'));
      setIssues(await api<Issue[]>('/book-issues'));
      setStudents((await api<any[]>('/students')).filter(s => (s.status || 'active') === 'active'));
      setTeachers(await api('/teachers'));
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function createBook(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = { ...bookForm, qty_total: Number(bookForm.qty_total), qty_available: Number(bookForm.qty_available), price: bookForm.price ? Number(bookForm.price) : null };
      await api('/books', { method: 'POST', body: JSON.stringify(payload) });
      setAddBook(false); setBookForm({ book_no: '', title: '', author: '', publisher: '', category: '', qty_total: 1, qty_available: 1, rack: '', price: '' });
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function issueBook(e: React.FormEvent) {
    e.preventDefault();
    try {
      const staff = issueForm.borrower === 'staff';
      const r = await api<{ due_date: string }>('/lib/issue', { method: 'POST', body: JSON.stringify({
        book_id: Number(issueForm.book_id),
        student_id: staff ? null : Number(issueForm.student_id), teacher_id: staff ? Number(issueForm.teacher_id) : null,
        due_date: issueForm.due_date || null,
      }) });
      setError(null);
      alert(`Book issued. Due back on ${fmtDate(r.due_date)}.`);
      setAddIssue(false); setIssueForm({ borrower: issueForm.borrower, book_id: '', student_id: '', teacher_id: '', due_date: '' }); load();
    } catch (e: any) { setError(e.message); }
  }

  // Shows the late fine worked out at the library rate; the desk can accept, change or waive it.
  async function returnBook(id: number, lost = false) {
    try {
      const pv = await api<{ fine: number; days_late: number; fine_per_day: number }>(`/lib/return/${id}/preview`);
      const hint = lost ? 'Charge for the lost book (₹):'
        : pv.days_late > 0 ? `Returned ${pv.days_late} day(s) late at ₹${pv.fine_per_day}/day. Fine (₹):` : 'Returned on time. Fine (₹):';
      const fine = prompt(hint, String(lost ? '' : pv.fine));
      if (fine === null) return;
      await api(`/lib/return/${id}`, { method: 'POST', body: JSON.stringify({ fine: fine === '' ? 0 : Number(fine), lost }) });
      setError(null); load();
    } catch (e: any) { setError(e.message); }
  }

  function openIssue(borrower: 'student' | 'staff') {
    setTab('issues'); setAddIssue(true); setIssueForm((f: any) => ({ ...f, borrower }));
  }

  return (
    <Shell>
      <ExploreOptions
        icon="📖"
        title="Library Management"
        subtitle="Books, Members & Reports — Explore Options"
        breadcrumb={['Dashboard', 'Library Management']}
        columns={3}
        groups={[
          { title: 'Catalogue', actions: [
            { label: 'Books Management', onClick: () => { setTab('books'); } },
            { label: 'Member Management', href: '/library/members' },
            { label: 'Track Book History', href: '/report/book-history' },
          ]},
          { title: 'Issue / Return', actions: [
            { label: 'Book Issue Student', onClick: () => openIssue('student') },
            { label: 'Book Return Student', onClick: () => { setTab('issues'); setIssueFilter('issued'); } },
            { label: 'Book Issue Member', onClick: () => openIssue('student') },
            { label: 'Book Return Member', onClick: () => { setTab('issues'); setIssueFilter('issued'); } },
            { label: 'Book Issue Staff', onClick: () => openIssue('staff') },
            { label: 'Book Return Staff', onClick: () => { setTab('issues'); setIssueFilter('issued'); } },
          ]},
          { title: 'Reports', actions: [
            { label: 'Book Issue Report', href: '/report/book-issue' },
            { label: 'Books Return Delay Report', href: '/report/books-return-delay' },
          ]},
        ]}
      />

      {tab && (
        <>
          <div className="flex items-center justify-between mt-6 mb-3">
            <div className="flex gap-2">
              <button className={`btn text-sm ${tab === 'books' ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setTab('books')}>Books</button>
              <button className={`btn text-sm ${tab === 'issues' ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setTab('issues')}>Issue / Return</button>
            </div>
            <button className="text-xs text-gray-500 hover:underline" onClick={() => setTab(null)}>Close</button>
          </div>

          {error && <div className="text-red-700 text-sm mb-2">{error}</div>}

          {tab === 'books' && (
            <>
              <button className="btn btn-primary text-sm mb-3" onClick={() => setAddBook(v => !v)}>{addBook ? 'Cancel' : '+ Add Book'}</button>
              {addBook && (
                <form onSubmit={createBook} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
                  <div><label className="label">Book No *</label><input className="input" required value={bookForm.book_no} onChange={e => setBookForm({ ...bookForm, book_no: e.target.value })} /></div>
                  <div><label className="label">Title *</label><input className="input" required value={bookForm.title} onChange={e => setBookForm({ ...bookForm, title: e.target.value })} /></div>
                  <div><label className="label">Author</label><input className="input" value={bookForm.author} onChange={e => setBookForm({ ...bookForm, author: e.target.value })} /></div>
                  <div><label className="label">Publisher</label><input className="input" value={bookForm.publisher} onChange={e => setBookForm({ ...bookForm, publisher: e.target.value })} /></div>
                  <div><label className="label">Category</label><input className="input" value={bookForm.category} onChange={e => setBookForm({ ...bookForm, category: e.target.value })} /></div>
                  <div><label className="label">Rack</label><input className="input" value={bookForm.rack} onChange={e => setBookForm({ ...bookForm, rack: e.target.value })} /></div>
                  <div><label className="label">Qty Total</label><input className="input" type="number" value={bookForm.qty_total} onChange={e => setBookForm({ ...bookForm, qty_total: e.target.value, qty_available: e.target.value })} /></div>
                  <div><label className="label">Price</label><input className="input" type="number" value={bookForm.price} onChange={e => setBookForm({ ...bookForm, price: e.target.value })} /></div>
                  <div className="md:col-span-3"><button className="btn btn-primary">Save Book</button></div>
                </form>
              )}
              <div className="card p-4 overflow-x-auto">
                <table className="table min-w-max">
                  <thead><tr><th>Book No</th><th>Title</th><th>Author</th><th>Category</th><th>Total</th><th>Available</th><th>Rack</th></tr></thead>
                  <tbody>
                    {books.map(b => (
                      <tr key={b.id}><td>{b.book_no}</td><td>{b.title}</td><td>{(b as any).author}</td>
                        <td>{(b as any).category}</td><td>{b.qty_total}</td>
                        <td><span className={`badge ${b.qty_available > 0 ? 'badge-green' : 'badge-red'}`}>{b.qty_available}</span></td>
                        <td>{(b as any).rack}</td></tr>
                    ))}
                    {!books.length && <tr><td colSpan={7} className="text-center py-4 text-gray-500">No books.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'issues' && (
            <>
              <button className="btn btn-primary text-sm mb-3" onClick={() => setAddIssue(v => !v)}>{addIssue ? 'Cancel' : '+ Issue Book'}</button>
              {addIssue && (
                <form onSubmit={issueBook} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
                  <div><label className="label">Book</label>
                    <select className="input" required value={issueForm.book_id} onChange={e => setIssueForm({ ...issueForm, book_id: e.target.value })}>
                      <option value="">-- Select --</option>
                      {books.filter(b => b.qty_available > 0).map(b => <option key={b.id} value={b.id}>{b.book_no} — {b.title}</option>)}
                    </select></div>
                  <div><label className="label">Issue To</label>
                    <select className="input" value={issueForm.borrower} onChange={e => setIssueForm({ ...issueForm, borrower: e.target.value })}>
                      <option value="student">Student</option><option value="staff">Staff</option>
                    </select></div>
                  {issueForm.borrower === 'staff' ? (
                    <div><label className="label">Staff</label>
                      <select className="input" required value={issueForm.teacher_id} onChange={e => setIssueForm({ ...issueForm, teacher_id: e.target.value })}>
                        <option value="">-- Select --</option>
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.employee_no} — {t.full_name}</option>)}
                      </select></div>
                  ) : (
                    <div><label className="label">Student</label>
                      <select className="input" required value={issueForm.student_id} onChange={e => setIssueForm({ ...issueForm, student_id: e.target.value })}>
                        <option value="">-- Select --</option>
                        {students.map(s => <option key={s.id} value={s.id}>{s.admission_no} — {s.full_name}</option>)}
                      </select></div>
                  )}
                  <div><label className="label">Due Date</label><input className="input" type="date" value={issueForm.due_date} onChange={e => setIssueForm({ ...issueForm, due_date: e.target.value })} />
                    <div className="text-[11px] text-gray-500 mt-1">Leave blank to use the library loan period.</div></div>
                  <div className="md:col-span-3"><button className="btn btn-primary">Issue</button></div>
                </form>
              )}
              <div className="card p-4 overflow-x-auto">
                <label className="text-sm flex items-center gap-2 mb-2">
                  <input type="checkbox" checked={issueFilter === 'issued'} onChange={e => setIssueFilter(e.target.checked ? 'issued' : '')} />
                  Show only books not yet returned
                </label>
                <table className="table min-w-max">
                  <thead><tr><th>Book</th><th>Borrower</th><th>Issue Date</th><th>Due</th><th>Return</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {issues.filter(i => !issueFilter || i.status === issueFilter).map(i => (
                      <tr key={i.id}>
                        <td>{i.book_no} — {i.book_title}</td>
                        <td>{i.student_name || i.teacher_name}</td>
                        <td>{fmtDate(i.issue_date)}</td>
                        <td className={i.status === 'issued' && i.due_date && i.due_date < localDate() ? 'text-red-600 font-semibold' : ''}>{fmtDate(i.due_date)}</td>
                        <td>{fmtDate(i.return_date)}</td>
                        <td><span className={`badge ${i.status === 'returned' ? 'badge-green' : i.status === 'lost' ? 'badge-red' : 'badge-amber'}`}>{i.status}</span></td>
                        <td className="whitespace-nowrap">{i.status === 'issued' && (
                          <>
                            <button className="btn btn-primary text-xs py-1 mr-2" onClick={() => returnBook(i.id)}>Mark Returned</button>
                            <button className="text-xs text-red-600 hover:underline" onClick={() => returnBook(i.id, true)}>Lost</button>
                          </>
                        )}{i.status !== 'issued' && i.fine > 0 && <span className="text-xs">Fine ₹{i.fine}</span>}</td>
                      </tr>
                    ))}
                    {!issues.length && <tr><td colSpan={7} className="text-center py-4 text-gray-500">No issues.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
