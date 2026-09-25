  'use client';
import { useState, useEffect, useCallback } from 'react';
import KpiCard from '../../components/KpiCard';
import { SkeletonKpiCard, SkeletonCard } from '../../components/Skeleton';

export default function MyRequisitionsPage() {
  const [requisitions, setRequisitions] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [form, setForm] = useState({
    item_id: '',
    quantity: '',
    purpose: '',
  });

  const fetchMyRequisitions = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/requests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRequisitions(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/inventory', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setInventory(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchMyRequisitions();
    fetchInventory();
  }, [fetchMyRequisitions, fetchInventory]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchMyRequisitions();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchMyRequisitions]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'requisition-updated') fetchMyRequisitions();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [fetchMyRequisitions]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Request submitted successfully! Awaiting approval.');
        setShowModal(false);
        setForm({ item_id: '', quantity: '', purpose: '' });
        fetchMyRequisitions();
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError(data.message || 'Failed to submit request.');
        setTimeout(() => setError(''), 5000);
      }
    } catch (err) {
      setError('Server error.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status) => {
    const map = {
      Pending: 'bg-yellow-100 text-yellow-800',
      Approved: 'bg-green-100 text-green-800',
      Rejected: 'bg-red-100 text-red-800',
    };
    return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-800'}`;
  };

  const filtered = filterStatus === 'all' ? requisitions : requisitions.filter(r => r.status === filterStatus);

  const counts = {
    Pending: requisitions.filter(r => r.status === 'Pending').length,
    Approved: requisitions.filter(r => r.status === 'Approved').length,
    Rejected: requisitions.filter(r => r.status === 'Rejected').length,
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Requisitions</h1>
            <p className="text-sm text-gray-500 mt-1">Submit and track your supply requests</p>
          </div>
          <button
            onClick={() => { setShowModal(true); setError(''); setSuccess(''); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            + New Request
          </button>
        </div>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonKpiCard key={i} />)
          ) : [
            { label: 'Pending', value: counts.Pending },
            { label: 'Approved', value: counts.Approved },
            { label: 'Rejected', value: counts.Rejected },
          ].map(s => (
            <KpiCard key={s.label} label={s.label} value={s.value} />
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {['all', 'Pending', 'Approved', 'Rejected'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        {/* Requisitions */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No requests found</p>
            <p className="text-gray-400 text-sm mt-1">Click &quot;New Request&quot; to submit a supply request</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs text-gray-400 font-mono">#{r.id}</span>
                      <span className={statusBadge(r.status)}>{r.status}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">{r.item_name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Quantity: {r.quantity} • {r.purpose}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                    {r.remarks && (
                      <p className="text-xs text-gray-500 mt-1 italic">&quot;{r.remarks}&quot;</p>
                    )}
                  </div>
                </div>
                {r.status === 'Pending' && (
                  <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                    <p className="text-xs text-yellow-600">Awaiting review by Supply Officer</p>
                  </div>
                )}
                {r.status === 'Approved' && (
                  <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                    <p className="text-xs text-green-600">Request approved — coordinate with Supply Officer for release</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      {/* New Request Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">New Supply Request</h2>
              <p className="text-xs text-gray-400 mt-0.5">Your request will be reviewed by the Supply Officer</p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item Requested *</label>
                <select
                  required
                  value={form.item_id}
                  onChange={(e) => setForm({ ...form, item_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select item...</option>
                  {inventory.map(item => (
                    <option key={item.item_id} value={item.item_id}>{item.item_name} ({item.category_name})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                <input
                  type="number" min="1" required
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="How many do you need?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purpose / Justification *</label>
                <textarea
                  required rows={3}
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Explain why you need this item..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
  );
}
