'use client';
import ModulePage from '@/components/ModulePage';
import { api, getUser } from '@/lib/api';

export default function IncidentsPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  return (
    <ModulePage
      title="Incidents"
      endpoint="/incidents"
      canCreate={isAdmin}
      createLabel="+ Log Incident"
      emptyText="No incidents logged."
      searchKeys={['reported_by', 'location', 'description']}
      fields={[
        { name: 'incident_date', label: 'Date', type: 'date', required: true },
        { name: 'reported_by', label: 'Reported By' },
        { name: 'location', label: 'Location' },
        { name: 'description', label: 'Description', type: 'textarea', required: true },
        { name: 'action_taken', label: 'Action Taken', type: 'textarea' },
        { name: 'status', label: 'Status', hideInForm: true,
          formatter: v => <span className={`badge ${v === 'resolved' ? 'badge-green' : 'badge-amber'}`}>{v}</span> },
      ]}
      rowActions={isAdmin ? (row, reload) => (
        <>
          {row.status !== 'resolved' && (
            <button className="text-xs text-brand-600 hover:underline mr-2"
              onClick={async () => { try { await api(`/incidents/${row.id}`, { method: 'PUT', body: JSON.stringify({ status: 'resolved' }) }); reload(); } catch (e: any) { alert(e.message); } }}>
              Mark Resolved
            </button>
          )}
          <button className="text-xs text-red-600 hover:underline"
            onClick={async () => { if (!confirm('Delete this incident?')) return; try { await api(`/incidents/${row.id}`, { method: 'DELETE' }); reload(); } catch (e: any) { alert(e.message); } }}>
            Delete
          </button>
        </>
      ) : undefined}
    />
  );
}
