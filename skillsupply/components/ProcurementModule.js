'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import KpiCard from './KpiCard';
import Pagination from './Pagination';

const STATUS_STYLES = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-blue-100 text-blue-800',
  Received: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
  Cancelled: 'bg-gray-100 text-gray-600',
};

const TABLE_HEADERS = ['ID', 'Division', 'Items', 'Supplier', 'Status', 'Date', 'Action'];

export default function ProcurementModule() {
  const searchParams = useSearchParams();
  const refId = searchParams?.get('ref');
  const openedRef = useRef(null);
  const [requests, setRequests] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const [form, setForm] = useState({
    division_id: '',
    justification: '',
    supplier_name: '',
    reference_number: '',
    notes: '',
    items: [{ item_id: '', quantity_requested: '', unit_cost: '' }],
  });

  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [receiveItems, setReceiveItems] = useState([]);

  const fetchAll = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const [pRes, iRes, dRes] = await Promise.all([
        fetch('/api/procurement', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/divisions', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (pRes.ok) setRequests(await pRes.json());
      if (iRes.ok) {
        const inv = await iRes.json();
        setInventory(Array.isArray(inv) ? inv : inv.items || []);
      }
      if (dRes.ok) {
        const div = await dRes.json();
        setDivisions(Array.isArray(div) ? div : div.divisions || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = filterStatus === 'all' ? requests : requests.filter((r) => r.status === filterStatus);
  const pendingCount = requests.filter((r) => r.status === 'Pending').length;
  const approvedCount = requests.filter((r) => r.status === 'Approved').length;
  const receivedCount = requests.filter((r) => r.status === 'Received').length;

  const procPageSize = 10;
  const procPageCount = Math.max(1, Math.ceil(filtered.length / procPageSize));
  const procPage = Math.min(page, procPageCount);
  const pagedRequests = filtered.slice((procPage - 1) * procPageSize, procPage * procPageSize);

  const openCreate = () => {
    setForm({ division_id: '', justification: '', supplier_name: '', reference_number: '', notes: '', items: [{ item_id: '', quantity_requested: '', unit_cost: '' }] });
    setError('');
    setShowModal(true);
  };

  const setItemField = (idx, key, value) => {
    setForm((f) => {
      const items = f.items.map((it, i) => (i === idx ? { ...it, [key]: value } : it));
      return { ...f, items };
    });
  };

  const addItemRow = () => {
    setForm((f) => ({ ...f, items: [...f.items, { item_id: '', quantity_requested: '', unit_cost: '' }] }));
  };

  const removeItemRow = (idx) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Procurement request #${data.procurement_id} created.`);
        setShowModal(false);
        fetchAll();
      } else {
        setError(data.error || 'Failed to create request.');
      }
    } catch (err) {
      setError('Server error.');
    } finally {
      setSubmitting(false);
    }
  };

  const openReview = (r) => {
    setSelected(r);
    setApprovalRemarks(r.approval_remarks || '');
    setReceiveItems((r.items || []).map((it) => ({ procurement_item_id: it.procurement_item_id, quantity_received: String(it.quantity_requested) })));
    setError('');
    setSuccess('');
  };

  useEffect(() => {
    if (!refId || openedRef.current === refId) return;
    const r = requests.find((x) => String(x.procurement_id) === String(refId));
    if (r && !loading && requests.length > 0) {
      openedRef.current = refId;
      setFilterStatus('all');
      openReview(r);
    }
  }, [refId, requests, loading]);

  const handleStatus = async (id, status, extra = {}) => {
    setSubmitting(true);
    setError('');
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch(`/api/procurement/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, ...extra }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Procurement #${id} is now ${status}.`);
        setSelected(null);
        fetchAll();
      } else {
        setError(data.error || 'Failed to update.');
      }
    } catch (err) {
      setError('Server error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Procurement</h2>
          <p className="text-sm text-gray-500 mt-1">Plan and track procurement requests for low-stock items</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 transition"
        >
          + New Procurement Request
        </button>
      </div>

      {success && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">{success}</div>}
      {error && !showModal && !selected && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Pending Requests" value={pendingCount} sub="Purchase requests awaiting approval" />
        <KpiCard label="Approved (Awaiting Delivery)" value={approvedCount} sub="Approved, not yet received" />
        <KpiCard label="Received" value={receivedCount} sub="Items received from suppliers" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          {['all', 'Pending', 'Approved', 'Received', 'Rejected', 'Cancelled'].map((s) => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPage(1); }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${filterStatus === s ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {TABLE_HEADERS.map((h) => (
                  <th key={h} className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} className="px-6 py-10 text-center text-sm text-gray-400">
                    No procurement requests found.
                  </td>
                </tr>
              )}
              {pagedRequests.map((r) => (
                <tr key={r.procurement_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">#{r.procurement_id}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{r.division_name || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {(r.items || []).map((it) => (
                      <div key={it.procurement_item_id} className="text-xs">
                        {it.item_name} — {it.quantity_requested} {it.unit_of_measure}
                        {Number(it.quantity_received) > 0 && <span className="text-green-600"> (recv {it.quantity_received})</span>}
                      </div>
                    ))}
                    {(r.items || []).length === 0 && <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{r.supplier_name || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLES[r.status] || 'bg-gray-100 text-gray-600'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => openReview(r)}
                      className="text-xs px-3 py-1.5 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 font-medium transition"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={procPage}
          pageSize={procPageSize}
          total={filtered.length}
          onPageChange={setPage}
        />
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">New Procurement Request</h2>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Division *</label>
                  <select
                    required
                    value={form.division_id}
                    onChange={(e) => setForm({ ...form, division_id: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select division...</option>
                    {divisions.map((d) => <option key={d.division_id} value={d.division_id}>{d.division_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                  <input
                    type="text"
                    value={form.supplier_name}
                    onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Supplier name (optional)"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Justification *</label>
                <textarea
                  required rows={2}
                  value={form.justification}
                  onChange={(e) => setForm({ ...form, justification: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Why these items need to be procured"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Items *</label>
                {form.items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      required
                      value={it.item_id}
                      onChange={(e) => setItemField(idx, 'item_id', e.target.value)}
                      className="col-span-6 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select item...</option>
                      {inventory.map((i) => (
                        <option key={i.item_id} value={i.item_id}>
                          {i.item_name} (Stock: {i.quantity_on_hand})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number" min="1" required
                      value={it.quantity_requested}
                      onChange={(e) => setItemField(idx, 'quantity_requested', e.target.value)}
                      placeholder="Qty"
                      className="col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number" min="0" step="0.01"
                      value={it.unit_cost}
                      onChange={(e) => setItemField(idx, 'unit_cost', e.target.value)}
                      placeholder="Unit cost"
                      className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      disabled={form.items.length === 1}
                      className="col-span-1 text-red-600 text-sm disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addItemRow}
                  className="text-xs text-blue-700 font-medium hover:underline"
                >
                  + Add another item
                </button>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition">
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Procurement #{selected.procurement_id}</h2>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLES[selected.status] || 'bg-gray-100 text-gray-600'}`}>
                {selected.status}
              </span>
            </div>
            <div className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Division</span><span>{selected.division_name || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Requested By</span><span>{selected.requested_by_name || '—'}</span></div>
                <div className="flex justify-between gap-4"><span className="text-gray-500">Justification</span><span className="text-right max-w-xs">{selected.justification || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Supplier</span><span>{selected.supplier_name || '—'}</span></div>
                {selected.approval_remarks && (
                  <div className="flex justify-between gap-4"><span className="text-gray-500">Approval Remarks</span><span className="text-right max-w-xs">{selected.approval_remarks}</span></div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Items</h4>
                <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
                  {(selected.items || []).map((it) => {
                    const recv = receiveItems.find((r) => r.procurement_item_id === it.procurement_item_id);
                    return (
                      <div key={it.procurement_item_id} className="px-4 py-3 flex items-center justify-between text-sm gap-3">
                        <div>
                          <div className="font-medium text-gray-900">{it.item_name}</div>
                          <div className="text-xs text-gray-500">Requested: {it.quantity_requested} {it.unit_of_measure}</div>
                        </div>
                        {selected.status === 'Approved' ? (
                          <input
                            type="number" min="0"
                            value={recv ? recv.quantity_received : ''}
                            onChange={(e) => setReceiveItems((prev) => prev.map((r) => r.procurement_item_id === it.procurement_item_id ? { ...r, quantity_received: e.target.value } : r))}
                            className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-xs text-gray-500">Received: {it.quantity_received || 0}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {selected.status === 'Pending' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <textarea
                    rows={2}
                    value={approvalRemarks}
                    onChange={(e) => setApprovalRemarks(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Optional remarks"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                {selected.status === 'Pending' && (
                  <>
                    <button
                      onClick={() => handleStatus(selected.procurement_id, 'Approved', { approval_remarks: approvalRemarks })}
                      disabled={submitting}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatus(selected.procurement_id, 'Rejected', { approval_remarks: approvalRemarks })}
                      disabled={submitting}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition"
                    >
                      Reject
                    </button>
                  </>
                )}
                {selected.status === 'Approved' && (
                  <button
                    onClick={() => handleStatus(selected.procurement_id, 'Received', { received_items: receiveItems })}
                    disabled={submitting}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    Mark Received (adds to stock)
                  </button>
                )}
                {['Pending', 'Approved'].includes(selected.status) && (
                  <button
                    onClick={() => handleStatus(selected.procurement_id, 'Cancelled')}
                    disabled={submitting}
                    className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                  >
                    Cancel Request
                  </button>
                )}
                <button
                  onClick={() => setSelected(null)}
                  className="ml-auto px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
