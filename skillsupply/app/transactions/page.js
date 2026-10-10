'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import KpiCard from '../../components/KpiCard';
import { SkeletonKpiCard, SkeletonTableRow } from '../../components/Skeleton';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [divisions, setDivisions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All Status');
  const searchParams = useSearchParams();

  const [borrowForm, setBorrowForm] = useState({
    item_id: '',
    division_id: '',
    quantity_borrowed: '',
    borrower_name: '',
    purpose: '',
    expected_return_date: '',
  });


  const [returnForm, setReturnForm] = useState({
    transaction_id: '',
    condition_on_return: 'Good',
    remarks: '',
  });

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

  useEffect(() => {
    fetchTransactions();
    fetchInventory();
    fetchDivisions();
  }, [fetchTransactions, fetchInventory, fetchDivisions]);


  useEffect(() => {
    const querySearch = searchParams?.get('search') || '';
    setSearchQuery(querySearch);
  }, [searchParams]);

  useEffect(() => {
    function onGlobalSearch(e) {
      const v = String(e?.detail ?? '') || '';
      setSearchQuery(v);
    }
    window.addEventListener('global-search', onGlobalSearch);
    return () => window.removeEventListener('global-search', onGlobalSearch);
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleBorrow = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/transactions/borrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(borrowForm),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Borrow transaction recorded successfully.');
        setShowBorrowModal(false);
        setBorrowForm({ item_id: '', division_id: '', quantity_borrowed: '', borrower_name: '', purpose: '', expected_return_date: '' });


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

  const handleReturn = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/transactions/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          borrow_id: returnForm.transaction_id,
          condition_returned: returnForm.condition_on_return,
          notes: returnForm.remarks,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Return processed successfully.');
        setShowReturnModal(false);
        setReturnForm({ transaction_id: '', condition_on_return: 'Good', remarks: '' });
        fetchTransactions();
        fetchInventory();
      } else {
        setError(data.error || data.message || 'Failed to process return.');
      }
    } catch (err) {
      setError('Server error.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeCount = transactions.filter(t => t.status === 'Borrowed' || t.status === 'Issued' || t.status === 'Overdue').length;
  const borrowedCount = transactions.filter(t => t.status === 'Borrowed' || t.status === 'Issued').length;
  const overdueCount = transactions.filter(t => t.status === 'Overdue').length;
  const returnedCount = transactions.filter(t => t.status === 'Returned').length;
  const pendingTransactions = transactions.filter(t => t.status !== 'Returned' && t.status !== 'Cancelled');

  const filteredTransactions = transactions.filter(t => {
    const quantityText = String(t.quantity ?? t.quantity_borrowed ?? '');
    const divisionText = String(t.borrower_division ?? t.division_name ?? '');
    const matchSearch =
      (t.item_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.borrower_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      divisionText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quantityText.includes(searchQuery);

    const matchStatus = filterStatus === 'All Status' || t.status === filterStatus || (filterStatus === 'Borrowed' && t.status === 'Issued');
    return matchSearch && matchStatus;
  });


  const statusBadge = (status) => {
    if (status === 'Returned') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Returned
        </span>
      );
    }
    if (status === 'Overdue') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Overdue
        </span>
      );
    }
    if (status === 'Borrowed' || status === 'Issued') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Borrowed
        </span>
      );
    }
    if (status === 'Cancelled') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          Cancelled
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {status || 'Unknown'}
      </span>
    );
  };

  return (
    <>
    <div className="space-y-6">

        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
            <p className="text-sm text-gray-500 mt-1">Track borrow/issuance and return of inventory items</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowReturnModal(true); setError(''); setSuccess(''); }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Process Return
            </button>
            <button
              onClick={() => { setShowBorrowModal(true); setError(''); setSuccess(''); }}
              className="flex items-center gap-2 px-5 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 transition shadow-sm"
            >
              <span className="text-lg leading-none">+</span> Record Borrow
            </button>
          </div>
        </div>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess('')} className="ml-3 text-green-500 hover:text-green-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonKpiCard key={i} />)
          ) : (
            <>
              <KpiCard label="Active" value={activeCount} />
              <KpiCard label="Borrowed" value={borrowedCount} />
              <KpiCard label="Overdue" value={overdueCount} />
              <KpiCard label="Returned" value={returnedCount} />
            </>
          )}
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table Header */}
          <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">Outstanding Borrow Transactions</h2>
            <div className="flex gap-3">
              {/* Search */}
              <div className="relative">
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transactions..."
                  className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
                />
              </div>
              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
              >
                {['All Status', 'Borrowed', 'Returned', 'Overdue'].map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['ID', 'Item', 'Borrowed By', 'Quantity', 'Division', 'Borrow Date', 'Expected Return', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonTableRow key={i} widths={['w-10', 'w-28', 'w-24', 'w-12', 'w-20', 'w-24', 'w-24', 'w-16', 'w-14']} className="border-b border-gray-50" />
                ))}
              </tbody>
            </table>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-10 text-center text-gray-400">No transactions found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['ID', 'Item', 'Borrowed By', 'Quantity', 'Division', 'Borrow Date', 'Expected Return', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTransactions.map((t, idx) => (
                    <tr key={t.borrow_id ?? `tx-${idx}`} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-500">#{t.borrow_id}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                            </svg>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{t.item_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{t.borrower_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {t.quantity ?? t.quantity_borrowed}
                        {t.status === 'Returned' && (
                          <span className="ml-1 text-xs text-gray-400">(Returned)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{t.borrower_division ?? t.division_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(t.borrow_date ?? t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(t.expected_return_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>

                      <td className="px-6 py-4">{statusBadge(t.status)}</td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        <button
                          onClick={() => { setSelectedTx(t); setShowReviewModal(true); setError(''); }}
                          className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium transition"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Record Borrow Modal */}
      {showBorrowModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Record Borrow</h2>
              <button onClick={() => setShowBorrowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleBorrow} className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
                <select
                  required
                  value={borrowForm.item_id}
                  onChange={(e) => setBorrowForm({ ...borrowForm, item_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select item...</option>
                  {inventory
                    .filter(i => (i.quantity_on_hand ?? 0) > 0)
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
                    value={borrowForm.quantity_borrowed}
                    onChange={(e) => setBorrowForm({ ...borrowForm, quantity_borrowed: e.target.value, })}


                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expected Return *</label>
                  <input
                    type="date" required
                    value={borrowForm.expected_return_date}
                    onChange={(e) => setBorrowForm({ ...borrowForm, expected_return_date: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Borrower Name *</label>
                <input
                  type="text" required
                  value={borrowForm.borrower_name}
                  onChange={(e) => setBorrowForm({ ...borrowForm, borrower_name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Division *</label>
                  <select
                    required
                    value={borrowForm.division_id}
                    onChange={(e) => setBorrowForm({ ...borrowForm, division_id: e.target.value })}
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
                  value={borrowForm.purpose}
                  onChange={(e) => setBorrowForm({ ...borrowForm, purpose: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Reason for borrowing"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowBorrowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition">
                  {submitting ? 'Recording...' : 'Record Borrow'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Process Return Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Process Return</h2>
              <button onClick={() => setShowReturnModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleReturn} className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Active Transaction *</label>
                <select
                  required
                  value={returnForm.transaction_id}
                  onChange={(e) => setReturnForm({ ...returnForm, transaction_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select transaction...</option>
                  {pendingTransactions.map((t) => (
                    <option key={t.borrow_id} value={String(t.borrow_id)}>#{t.borrow_id} — {t.item_name} · {t.borrower_name} ({t.status})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition on Return *</label>
                <select
                  value={returnForm.condition_on_return}
                  onChange={(e) => setReturnForm({ ...returnForm, condition_on_return: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['Good', 'Damaged', 'Lost'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks (optional)</label>
                <textarea
                  rows={2}
                  value={returnForm.remarks}
                  onChange={(e) => setReturnForm({ ...returnForm, remarks: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Any notes..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowReturnModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition">
                  {submitting ? 'Processing...' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
        )}

      {/* Review Transaction Modal */}
      {showReviewModal && selectedTx && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Transaction #{selectedTx.borrow_id}</h2>
              <button onClick={() => { setShowReviewModal(false); setSelectedTx(null); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Item</span><span className="font-medium">{selectedTx.item_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Borrower</span><span>{selectedTx.borrower_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Division</span><span>{selectedTx.borrower_division ?? selectedTx.division_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Quantity</span><span>{selectedTx.quantity ?? selectedTx.quantity_borrowed}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Borrow Date</span><span>{new Date(selectedTx.borrow_date ?? selectedTx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Expected Return</span><span>{new Date(selectedTx.expected_return_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
                {selectedTx.actual_return_date && (
                  <div className="flex justify-between"><span className="text-gray-500">Actual Return</span><span>{new Date(selectedTx.actual_return_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
                )}
                {selectedTx.purpose && (
                  <div className="flex justify-between"><span className="text-gray-500">Purpose</span><span className="text-right max-w-xs">{selectedTx.purpose}</span></div>
                )}
                {selectedTx.condition_returned && (
                  <div className="flex justify-between"><span className="text-gray-500">Return Condition</span><span>{selectedTx.condition_returned}</span></div>
                )}
                {selectedTx.return_remarks && (
                  <div className="flex justify-between gap-4"><span className="text-gray-500">Return Remarks</span><span className="text-right max-w-xs whitespace-pre-wrap">{selectedTx.return_remarks}</span></div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                  <span className="text-gray-500">Status</span>
                  {statusBadge(selectedTx.status)}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                {selectedTx.status !== 'Returned' && (
                <button
                  onClick={async () => {
                    try {
                      const token = sessionStorage.getItem('token');
                      const res = await fetch(`/api/transactions/${selectedTx.borrow_id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ status: 'Borrowed' }),
                      });
                      if (!res.ok) {
                        const data = await res.json();
                        setError(data.error || 'Failed to update status.');
                        return;
                      }
                      setTransactions(prev => prev.map(t =>
                        t.borrow_id === selectedTx.borrow_id ? { ...t, status: 'Borrowed' } : t
                      ));
                      setSelectedTx(prev => prev ? { ...prev, status: 'Borrowed' } : prev);
                      setShowReviewModal(false);
                      setSuccess('Transaction reinstated as Borrowed.');
                    } catch (err) { console.error(err); setError('Server error.'); }
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                >
                  Borrowed
                </button>
                )}
                {selectedTx.status !== 'Returned' && (
                  <button
                    onClick={() => {
                      setShowReviewModal(false);
                      setSelectedTx(null);
                      setReturnForm({ ...returnForm, transaction_id: String(selectedTx.borrow_id) });
                      setShowReturnModal(true);
                      setError('');
                    }}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
                  >
                    Returned
                  </button>
                )}
                {selectedTx.status !== 'Returned' && selectedTx.status !== 'Overdue' && (
                  <button
                    onClick={async () => {
                      try {
                        const token = sessionStorage.getItem('token');
                        const res = await fetch(`/api/transactions/${selectedTx.borrow_id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ status: 'Overdue' }),
                        });
                        if (!res.ok) {
                          const data = await res.json();
                          setError(data.error || 'Failed to update status.');
                          return;
                        }
                        setTransactions(prev => prev.map(t =>
                          t.borrow_id === selectedTx.borrow_id ? { ...t, status: 'Overdue' } : t
                        ));
                        setSelectedTx(prev => prev ? { ...prev, status: 'Overdue' } : prev);
                        setShowReviewModal(false);
                        setSuccess('Transaction marked as Overdue.');
                      } catch (err) { console.error(err); setError('Server error.'); }
                    }}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition"
                  >
                    Overdue
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
