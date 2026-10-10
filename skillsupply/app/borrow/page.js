'use client';
import { useState, useEffect, useCallback } from 'react';
import KpiCard from '../../components/KpiCard';
import { SkeletonKpiCard, SkeletonTableRow } from '../../components/Skeleton';

const TABLE_HEADERS = ['ID', 'Item', 'Quantity', 'Division', 'Borrow Date', 'Expected Return', 'Status'];

const isBorrowedStatus = (status) => ['Borrowed', 'Issued', 'Active'].includes(status);

const statusBadge = (status) => {
  const map = {
    Borrowed: 'bg-blue-100 text-blue-700',
    Issued: 'bg-blue-100 text-blue-700',
    Active: 'bg-blue-100 text-blue-700',
    Returned: 'bg-green-100 text-green-700',
    Overdue: 'bg-red-100 text-red-700',
  };
  return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-700'}`;
};

export default function BorrowPage() {
  const [transactions, setTransactions] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const emptyForm = {
    item_id: '',
    quantity_borrowed: '',
    expected_return_date: '',
    borrower_name: '',
    division_id: '',
    purpose: '',
  };
  const [form, setForm] = useState(emptyForm);

  const fetchTransactions = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/transactions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTransactions(await res.json());
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

  const fetchDivisions = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/divisions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDivisions(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const me = await res.json();
      let storedName = '';
      try {
        storedName = JSON.parse(sessionStorage.getItem('user') || '{}').full_name || '';
      } catch {}
      setForm(prev => ({
        ...prev,
        borrower_name: prev.borrower_name || me.full_name || storedName || '',
        division_id: prev.division_id || (me.division_id ? String(me.division_id) : ''),
      }));
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
    fetchInventory();
    fetchDivisions();
    fetchMe();
  }, [fetchTransactions, fetchInventory, fetchDivisions, fetchMe]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleOpenModal = () => {
    setError('');
    setSuccess('');
    fetchMe();
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/transactions/borrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Item borrowed successfully. It will appear in Transactions for processing.');
        setShowModal(false);
        setForm(emptyForm);
        fetchMe();
        fetchTransactions();
        fetchInventory();
      } else {
        setError(data.error || data.message || 'Failed to record borrow.');
      }
    } catch (err) {
      setError('Server error.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeCount = transactions.filter((t) => isBorrowedStatus(t.status)).length;
  const overdueCount = transactions.filter((t) => t.status === 'Overdue').length;
  const returnedCount = transactions.filter((t) => t.status === 'Returned').length;

  const filtered = transactions.filter((t) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'Borrowed') return isBorrowedStatus(t.status);
    return t.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Borrow</h1>
          <p className="text-sm text-gray-500 mt-1">Borrow inventory items and track your active borrows</p>
        </div>
        <button
          onClick={handleOpenModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          + Borrow Item
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
          { label: 'Borrowed', value: activeCount },
          { label: 'Overdue', value: overdueCount },
          { label: 'Returned', value: returnedCount },
        ].map((s) => (
          <KpiCard key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {['all', 'Borrowed', 'Returned', 'Overdue'].map((s) => (
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

      {/* My Borrows Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">My Borrows</h2>
        </div>
        {loading ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {TABLE_HEADERS.map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonTableRow key={i} widths={['w-10', 'w-28', 'w-12', 'w-24', 'w-24', 'w-24', 'w-16']} className="border-b border-gray-50" />
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No borrows found</p>
            <p className="text-gray-400 text-sm mt-1">Click &quot;Borrow Item&quot; to borrow an inventory item</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {TABLE_HEADERS.map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((t, idx) => (
                  <tr key={t.borrow_id ?? `tx-${idx}`} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 text-sm text-gray-500">#{t.borrow_id}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{t.item_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{t.quantity_borrowed}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{t.division_name || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(t.borrow_date ?? t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {t.expected_return_date
                        ? new Date(t.expected_return_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-6 py-4"><span className={statusBadge(t.status)}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Borrow Item Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Borrow Item</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
                <select
                  required
                  value={form.item_id}
                  onChange={(e) => setForm({ ...form, item_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select item...</option>
                  {inventory
                    .filter((i) => (i.quantity_on_hand ?? 0) > 0)
                    .map((item) => (
                      <option key={item.item_id} value={item.item_id}>
                        {item.item_name} (Stock: {item.quantity_on_hand})
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                  <input
                    type="number" min="1" required
                    value={form.quantity_borrowed}
                    onChange={(e) => setForm({ ...form, quantity_borrowed: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expected Return *</label>
                  <input
                    type="date" required
                    value={form.expected_return_date}
                    onChange={(e) => setForm({ ...form, expected_return_date: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Borrower Name *</label>
                <input
                  type="text" required
                  value={form.borrower_name}
                  onChange={(e) => setForm({ ...form, borrower_name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Division *</label>
                <select
                  required
                  value={form.division_id}
                  onChange={(e) => setForm({ ...form, division_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select division...</option>
                  {divisions.map((d) => (
                    <option key={d.division_id} value={d.division_id}>{d.division_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purpose *</label>
                <textarea
                  required rows={2}
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Reason for borrowing"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition">
                  {submitting ? 'Borrowing...' : 'Borrow Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
