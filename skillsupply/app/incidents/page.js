'use client';

import { useEffect, useState } from 'react';
import useAutoDismiss from '@/lib/useAutoDismiss';

const INCIDENT_TYPES = ['Theft', 'Loss', 'Damage', 'Missing Parts', 'Expired'];

export default function IncidentsPage() {
  const [inventory, setInventory] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [form, setForm] = useState({ item_id: '', incident_type: 'Damage', incident_date: new Date().toISOString().slice(0, 10), quantity_affected: 1, description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useAutoDismiss(success, setSuccess);
  useAutoDismiss(error, setError);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const refreshIncidents = () => {
      fetch('/api/incidents', { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
        .then((response) => response.ok ? response.json() : [])
        .then((data) => setIncidents(Array.isArray(data) ? data : []))
        .catch(() => setIncidents([]));
    };

    fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setInventory(Array.isArray(data) ? data : data.items || []))
      .catch(() => setInventory([]));
    refreshIncidents();
    const refreshInterval = setInterval(refreshIncidents, 5000);
    return () => clearInterval(refreshInterval);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to submit incident.');
      setSuccess('Incident submitted successfully. The Supply Officer will review it.');
      setForm({ item_id: '', incident_type: 'Damage', incident_date: new Date().toISOString().slice(0, 10), quantity_affected: 1, description: '' });
      const refreshed = await fetch('/api/incidents', { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
      if (refreshed.ok) setIncidents(await refreshed.json());
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Report an Incident</h1>
          <p className="mt-1 text-sm text-gray-500">Report theft, loss, damage, missing parts, or expired supplies.</p>
        </div>
        {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Incident Type
              <select value={form.incident_type} onChange={(event) => setForm({ ...form, incident_type: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal">
                {INCIDENT_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">Incident Date
              <input required type="date" value={form.incident_date} onChange={(event) => setForm({ ...form, incident_date: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Item
              <select value={form.item_id} onChange={(event) => setForm({ ...form, item_id: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal">
                <option value="">Item not specified</option>
                {inventory.map((item) => <option key={item.item_id} value={item.item_id}>{item.item_name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">Quantity Affected
              <input required min="1" type="number" value={form.quantity_affected} onChange={(event) => setForm({ ...form, quantity_affected: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" />
            </label>
          </div>
          <label className="block text-sm font-medium text-gray-700">Description
            <textarea required rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe what happened..." className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" />
          </label>
          <button type="submit" disabled={submitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit Incident'}</button>
          </form>
          <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">My Incident Reports</h2>
          {incidents.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">No incident reports submitted yet.</p>
          ) : incidents.map((incident) => (
            <div key={incident.incident_id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-gray-900">{incident.incident_type} {incident.item_name ? `- ${incident.item_name}` : ''}</p>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{incident.status}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{new Date(incident.incident_date).toLocaleDateString('en-PH')} · Quantity: {incident.quantity_affected}</p>
              <p className="mt-2 text-sm text-gray-700">{incident.description}</p>
              {incident.investigation_remarks && <p className="mt-2 text-xs italic text-gray-500">Review: {incident.investigation_remarks}</p>}
              {incident.reviewed_by_name && (
                <p className="mt-2 text-xs text-gray-500">
                  Reviewed by {incident.reviewed_by_name}
                  {incident.reviewed_at ? ` on ${new Date(incident.reviewed_at).toLocaleString('en-PH')}` : ''}
                </p>
              )}
            </div>
          ))}
          </section>
        </div>
      </div>
  );
}