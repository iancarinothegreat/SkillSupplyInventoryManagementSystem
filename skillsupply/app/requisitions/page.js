'use client';
import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import KpiCard from '../../components/KpiCard';

export default function RequisitionsPage() {
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [processing, setProcessing] = useState(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [selectedReq, setSelectedReq] = useState(null);
  const [remarks, setRemarks] = useState('');

  const fetchRequisitions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
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

  const handleAction = async (id, action) => {
    setProcessing(id);
    setError('');
    setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/requests/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: action, remarks }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Request #${id} has been ${action.toLowerCase()}.`);
        setSelectedReq(null);
        setRemarks('');
        fetchRequisitions();
      } else {
        setError(data.message || 'Action failed.');
      }
    } catch (err) {
      setError('Server error.');
    } finally {
      setProcessing(null);
    }
  };

  const filtered = filterStatus === 'all' ? requisitions : requisitions.filter(r => r.status === filterStatus);

  const statusBadge = (status) => {
    const map = {
      Pending: 'bg-yellow-100 text-yellow-800',
      Approved: 'bg-green-100 text-green-800',
      Rejected: 'bg-red-100 text-red-800',
    };
    return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-800'}`;
  };

  const counts = {
    all: requisitions.length,
    Pending: requisitions.filter(r => r.status === 'Pending').length,
    Approved: requisitions.filter(r => r.status === 'Approved').length,
    Rejected: requisitions.filter(r => r.status === 'Rejected').length,
  };

  return (
    <Layout>
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
          {[
            { label: 'Total', value: counts.all },
            { label: 'Pending', value: counts.Pending },
            { label: 'Approved', value: counts.Approved },
            { label: 'Rejected', value: counts.Rejected },
          ].map((s) => (
            <KpiCard key={s.label} label={`${s.label} Requests`} value={s.value} />
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
              {s === 'all' ? 'All' : s} {s !== 'all' && `(${counts[s]})`}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading requisitions...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No requisitions found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['ID', 'Requested By', 'Division', 'Item', 'Qty', 'Purpose', 'Date', 'Status', 'Action'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-sm text-gray-500">#{r.id}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.requester_name || r.username}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.division_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{r.item_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{r.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{r.purpose}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3"><span className={statusBadge(r.status)}>{r.status}</span></td>
                      <td className="px-4 py-3">
                        {r.status === 'Pending' ? (
                          <button
                            onClick={() => setSelectedReq(r)}
                            className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium transition"
                          >
                            Review
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Review Modal */}
      {selectedReq && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Review Request #{selectedReq.id}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Requested by</span><span className="font-medium">{selectedReq.requester_name || selectedReq.username}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Division</span><span>{selectedReq.division_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Item</span><span className="font-medium">{selectedReq.item_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Quantity</span><span>{selectedReq.quantity}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Purpose</span><span className="text-right max-w-xs">{selectedReq.purpose}</span></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks (optional)</label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add remarks..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setSelectedReq(null); setRemarks(''); }}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAction(selectedReq.id, 'Rejected')}
                  disabled={processing === selectedReq.id}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleAction(selectedReq.id, 'Approved')}
                  disabled={processing === selectedReq.id}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
