  'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import KpiCard from '../../components/KpiCard';
import { SkeletonKpiCard, SkeletonTableRow } from '../../components/Skeleton';
import { broadcastRequisitionUpdate } from '../../lib/events';
import ProcurementModule from '../../components/ProcurementModule';
import Pagination from '../../components/Pagination';

export default function RequisitionsPage() {
  const searchParams = useSearchParams();
  const refId = searchParams?.get('ref');
  const openedRef = useRef(null);
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [processing, setProcessing] = useState(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [selectedReq, setSelectedReq] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [approvedQty, setApprovedQty] = useState('');
  const [mrNumber, setMrNumber] = useState('');
  const [allotment, setAllotment] = useState(null);
  const [page, setPage] = useState(1);

  const openReview = (r) => {
    setSelectedReq(r);
    setRemarks('');
    setApprovedQty(String(r.quantity ?? ''));
    setMrNumber(r.mr_number || '');
    setError('');
    setSuccess('');
    setAllotment(null);
    if (r.per_division_limit != null && r.division_id) {
      const token = sessionStorage.getItem('token');
      fetch(`/api/requests/allotment?item_id=${r.item_id}&division_id=${r.division_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => setAllotment(data))
        .catch(() => setAllotment(null));
    }
  };

  const closeReview = () => {
    setSelectedReq(null);
    setRemarks('');
    setApprovedQty('');
    setMrNumber('');
  };

  const fetchRequisitions = useCallback(async () => {
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

  useEffect(() => {
    fetchRequisitions();
  }, [fetchRequisitions]);

  useEffect(() => {
    if (!refId || openedRef.current === refId) return;
    const r = requisitions.find((x) => String(x.id) === String(refId));
    if (r) {
      openedRef.current = refId;
      openReview(r);
    }
  }, [refId, requisitions]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchRequisitions();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchRequisitions]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'requisition-updated') fetchRequisitions();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [fetchRequisitions]);

  const handleAction = async (id, action) => {
    setProcessing(id);
    setError('');
    setSuccess('');
    try {
      const token = sessionStorage.getItem('token');
      const body = { status: action, remarks };
      if (action === 'Approved' && approvedQty !== '') {
        body.approved_quantity = Number(approvedQty);
      }
      if (action === 'Released' && mrNumber.trim()) {
        body.mr_number = mrNumber.trim();
      }
      const res = await fetch(`/api/requests/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Request #${id} has been ${action.toLowerCase()}.`);
        closeReview();
        fetchRequisitions();
        broadcastRequisitionUpdate();
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError(data.error || data.message || 'Action failed.');
      }
    } catch (err) {
      setError('Server error.');
    } finally {
      setProcessing(null);
    }
  };

  const filtered = filterStatus === 'all' ? requisitions : requisitions.filter(r => r.status === filterStatus);

  const reqPageSize = 10;
  const reqPageCount = Math.max(1, Math.ceil(filtered.length / reqPageSize));
  const reqPage = Math.min(page, reqPageCount);
  const pagedRequisitions = filtered.slice((reqPage - 1) * reqPageSize, reqPage * reqPageSize);

  const statusBadge = (status) => {
    const map = {
      Pending: 'bg-yellow-100 text-yellow-800',
      Approved: 'bg-green-100 text-green-800',
      Rejected: 'bg-red-100 text-red-800',
      Released: 'bg-blue-100 text-blue-800',
    };
    return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-800'}`;
  };

  const counts = {
    all: requisitions.length,
    Pending: requisitions.filter(r => r.status === 'Pending').length,
    Approved: requisitions.filter(r => r.status === 'Approved').length,
    Rejected: requisitions.filter(r => r.status === 'Rejected').length,
    Released: requisitions.filter(r => r.status === 'Released').length,
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Requisitions</h1>
          <p className="text-sm text-gray-500 mt-1">Review and process supply requests from Division Staff</p>
        </div>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonKpiCard key={i} />)
          ) : [
            { label: 'Total', value: counts.all },
            { label: 'Pending', value: counts.Pending },
            { label: 'Approved', value: counts.Approved },
            { label: 'Released', value: counts.Released },
            { label: 'Rejected', value: counts.Rejected },
          ].map((s) => (
            <KpiCard key={s.label} label={`${s.label} Requests`} value={s.value} />
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {['all', 'Pending', 'Approved', 'Released', 'Rejected'].map((s) => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'All' : s} {s !== 'all' && `(${counts[s]})`}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['ID', 'Requested By', 'Division', 'Item', 'Qty', 'Stock', 'Purpose', 'Date', 'Status', 'Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonTableRow key={i} widths={['w-10', 'w-24', 'w-20', 'w-24', 'w-10', 'w-28', 'w-20', 'w-16', 'w-14']} className="border-b border-gray-50" />
                ))}
              </tbody>
            </table>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No requisitions found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['ID', 'Requested By', 'Division', 'Item', 'Qty', 'Stock', 'Purpose', 'Date', 'Status', 'Action'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pagedRequisitions.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-sm text-gray-500">#{r.id}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.requester_name || r.username}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.division_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{r.item_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {r.quantity}
                        {r.quantity_approved !== null && typeof r.quantity_approved !== 'undefined' && Number(r.quantity_approved) !== Number(r.quantity) && (
                          <span className="block text-xs text-orange-600 font-medium">Approved: {r.quantity_approved}</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm ${Number(r.available_stock) < Number(r.quantity) ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                        {r.available_stock ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{r.purpose}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3"><span className={statusBadge(r.status)}>{r.status}</span></td>
                      <td className="px-4 py-3">
                        {r.status === 'Pending' ? (
                          <button
                            onClick={() => openReview(r)}
                            className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium transition"
                          >
                            Review
                          </button>
                        ) : r.status === 'Approved' ? (
                          <button
                            onClick={() => openReview(r)}
                            className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium transition"
                          >
                            Release
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">{r.status === 'Released' ? 'Released' : '—'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={reqPage}
            pageSize={reqPageSize}
            total={filtered.length}
            onPageChange={setPage}
          />
        </div>

        {/* Procurement section */}
        <hr className="border-gray-200" />
        <ProcurementModule />

      {/* Review Modal */}
      {selectedReq && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedReq.status === 'Approved' ? 'Release Request' : 'Review Request'} #{selectedReq.id}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Requested by</span><span className="font-medium">{selectedReq.requester_name || selectedReq.username}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Division</span><span>{selectedReq.division_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Item</span><span className="font-medium">{selectedReq.item_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Requested Quantity</span><span>{selectedReq.quantity} {selectedReq.unit_of_measure || ''}</span></div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Available Stock</span>
                  <span className={Number(selectedReq.available_stock) < Number(selectedReq.quantity) ? 'font-semibold text-red-600' : 'font-semibold text-gray-800'}>
                    {selectedReq.available_stock ?? '—'} {selectedReq.unit_of_measure || ''}
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-gray-500">Purpose</span><span className="text-right max-w-xs">{selectedReq.purpose}</span></div>
                {selectedReq.per_division_limit != null && allotment ? (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Division Allotment</span>
                    <span className={`font-semibold ${allotment.remaining < Number(selectedReq.quantity) ? 'text-red-600' : 'text-gray-800'}`}>
                      {allotment.used}/{allotment.per_division_limit} used ({allotment.remaining} remaining)
                    </span>
                  </div>
                ) : selectedReq.per_division_limit != null ? (
                  <div className="flex justify-between"><span className="text-gray-500">Division Allotment</span><span className="text-gray-400">Loading…</span></div>
                ) : null}
                {selectedReq.requires_mr ? (
                  <div className="flex justify-between"><span className="text-gray-500">MR Receipt</span><span className="text-blue-600 font-medium">Required</span></div>
                ) : null}
              </div>
              {selectedReq.status === 'Pending' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Approved Quantity {Number(selectedReq.available_stock) < Number(selectedReq.quantity) ? '(stock is short — adjust as needed)' : ''}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedReq.quantity}
                    value={approvedQty}
                    onChange={(e) => setApprovedQty(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Requested {selectedReq.quantity} • Available {selectedReq.available_stock ?? '—'}
                    {Number(approvedQty) > Number(selectedReq.quantity) ? ' • Cannot approve more than requested' : ''}
                    {Number(approvedQty) > Number(selectedReq.available_stock) ? ' • Exceeds available stock' : ''}
                    {allotment && allotment.per_division_limit != null && allotment.used + Number(approvedQty) > allotment.per_division_limit ? ' • Exceeds division allotment' : ''}
                  </p>
                </div>
              )}
              {selectedReq.status === 'Pending' && <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks (optional)</label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add remarks..."
                />
              </div>}
              {selectedReq.status === 'Approved' && selectedReq.requires_mr && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MR (Memorandum Receipt) Number *</label>
                  <input
                    type="text"
                    required
                    value={mrNumber}
                    onChange={(e) => setMrNumber(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. MR-2026-001"
                  />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeReview}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                {selectedReq.status === 'Pending' ? (
                  <>
                    <button
                      onClick={() => handleAction(selectedReq.id, 'Rejected')}
                      disabled={processing === selectedReq.id}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleAction(selectedReq.id, 'Approved')}
                      disabled={processing === selectedReq.id
                        || approvedQty === ''
                        || Number(approvedQty) < 1
                        || Number(approvedQty) > Number(selectedReq.quantity)
                        || Number(approvedQty) > Number(selectedReq.available_stock)
                        || (allotment && allotment.per_division_limit != null && allotment.used + Number(approvedQty) > allotment.per_division_limit)}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
                    >
                      Approve
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleAction(selectedReq.id, 'Released')}
                    disabled={processing === selectedReq.id || (selectedReq.requires_mr && !mrNumber.trim())}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    Release Item
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
  );
}
