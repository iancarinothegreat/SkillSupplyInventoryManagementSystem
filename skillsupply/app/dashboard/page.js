'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import KpiCard from '@/components/KpiCard';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalItems: 0,
    lowStockAlerts: 0,
    overdueReturns: 0,
    pendingRequests: 0,
    totalInventoryValue: 0
  });
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [overdueReturns, setOverdueReturns] = useState([]);
  const [divisionChart, setDivisionChart] = useState({ labels: [], datasets: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();

    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') fetchDashboard({ silent: true });
    };
    const refreshInterval = setInterval(() => fetchDashboard({ silent: true }), 5000);
    document.addEventListener('visibilitychange', refreshOnFocus);

    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, []);

  async function fetchDashboard({ silent = false } = {}) {
    if (!silent) setLoading(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [invRes, txRes, reqRes, consumptionRes] = await Promise.all([
        fetch('/api/inventory', { headers }),
        fetch('/api/transactions', { headers }),
        fetch('/api/requests', { headers }),
        fetch('/api/dashboard/consumption', { headers })
      ]);

      const safeJson = async (res) => {
        const text = await res.text();
        try { return JSON.parse(text); } catch { return {}; }
      };

      const invData = await safeJson(invRes);
      const txData = await safeJson(txRes);
      const reqData = await safeJson(reqRes);
      const consumptionData = await safeJson(consumptionRes);

      if (!Array.isArray(consumptionData) || consumptionData.length === 0) {
        setDivisionChart({
          labels: ['No Data'],
          datasets: [
            { label: 'Issued', data: [0], backgroundColor: '#1e40af', borderRadius: 4 },
            { label: 'Returned', data: [0], backgroundColor: '#16a34a', borderRadius: 4 }
          ]
        });
      }

      // Normalize inventory API response
      let itemsRaw = [];
      if (Array.isArray(invData)) itemsRaw = invData;
      else if (invData && Array.isArray(invData.items)) itemsRaw = invData.items;

      const items = itemsRaw.map(i => ({
        id: i.item_id ?? i.id ?? i.itemId,
        name: i.item_name ?? i.name ?? i.itemName,
        quantity: i.quantity_on_hand ?? i.quantity ?? i.qty ?? 0,
        reorder_point: i.reorder_level ?? i.reorder_point ?? i.reorderLevel ?? 10,
        unit_price: i.unit_cost ?? i.unit_price ?? i.price ?? 0,
        category_name: i.category_name ?? i.category ?? null,
        division_name: i.division_name ?? i.division ?? null,
        stock_status: i.stock_status ?? null
      }));

      const transactions = (txData && Array.isArray(txData.transactions)) ? txData.transactions : (Array.isArray(txData) ? txData : []);
      const requests = (reqData && Array.isArray(reqData.requests)) ? reqData.requests : (Array.isArray(reqData) ? reqData : []);

      // KPI calculations
      const lowStock = items.filter(i => i.quantity <= i.reorder_point).length;
      const totalValue = items.reduce((sum, i) => sum + (parseFloat(i.unit_price || 0) * parseInt(i.quantity || 0)), 0);
      const pending = requests.filter(r => (r.status || '').toLowerCase() === 'pending').length;

      const now = new Date();
      const overdue = transactions.filter(tx => {
        if (tx.status !== 'borrowed') return false;
        const borrowed = new Date(tx.borrow_date || tx.created_at);
        const diffDays = (now - borrowed) / (1000 * 60 * 60 * 24);
        return diffDays > 7;
      });

      setStats({
        totalItems: items.length,
        lowStockAlerts: lowStock,
        overdueReturns: overdue.length,
        pendingRequests: pending,
        totalInventoryValue: totalValue
      });

      setOverdueReturns(overdue.slice(0, 5));
      setRecentTransactions(transactions.slice(0, 10));

      // Division-wise consumption chart from API
      if (Array.isArray(consumptionData) && consumptionData.length > 0) {
        setDivisionChart({
          labels: consumptionData.map(d => d.division),
          datasets: [
            {
              label: 'Issued',
              data: consumptionData.map(d => d.issued),
              backgroundColor: '#1e40af',
              borderRadius: 4
            },
            {
              label: 'Returned',
              data: consumptionData.map(d => d.returned),
              backgroundColor: '#16a34a',
              borderRadius: 4
            }
          ]
        });
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
    scales: { y: { beginAtZero: true } }
  };

  const kpis = [
    {
      label: 'TOTAL ITEMS',
      value: loading ? '...' : stats.totalItems,
      icon: '',
      iconBg: 'text-blue-500'
    },
    {
      label: 'LOW STOCK ALERTS',
      value: loading ? '...' : stats.lowStockAlerts,
      icon: '',
      iconBg: 'text-yellow-500'
    },
    {
      label: 'OVERDUE RETURNS',
      value: loading ? '...' : stats.overdueReturns,
      icon: '',
      iconBg: 'text-red-500'
    },
    {
      label: 'PENDING REQUESTS',
      value: loading ? '...' : stats.pendingRequests,
      icon: '',
      iconBg: 'text-blue-400'
    },
    {
      label: 'TOTAL INVENTORY VALUE',
      value: loading ? '...' : `₱${stats.totalInventoryValue.toLocaleString()}`,
      icon: '',
      iconBg: 'text-green-500'
    }
  ];

  return (
    <Layout>
      <div className="p-6 bg-gray-100 min-h-screen">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {kpis.map((kpi, i) => (
            <KpiCard key={i} label={kpi.label} value={kpi.value} />
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Division-wise Consumption */}
          <div className="bg-white rounded-xl shadow-sm p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Division-wise Consumption</h2>
            <div style={{ height: 320 }}>
              <Bar data={divisionChart} options={chartOptions} />
            </div>
          </div>

          {/* Overdue Returns */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Overdue Returns</h2>
            {overdueReturns.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                No overdue returns
              </div>
            ) : (
              <div className="space-y-3">
                {overdueReturns.map((tx, idx) => (
                  <div key={tx.id ?? tx.transaction_id ?? tx.item_id ?? idx} className="border border-red-100 bg-red-50 rounded-lg p-3 text-sm">
                    <p className="font-medium text-gray-800">{tx.item_name}</p>
                    <p className="text-gray-500 text-xs">{tx.borrower_name} · {tx.division_name}</p>
                    <p className="text-red-500 text-xs mt-1">
                      Borrowed: {new Date(tx.borrow_date || tx.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Issuances Table */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Recent Issuances</h2>
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 pb-3">Item</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3">Borrower</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3">Division</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3">Qty</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3">Date</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">Loading...</td></tr>
              ) : recentTransactions.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">No recent transactions</td></tr>
              ) : (
                recentTransactions.map((tx, idx) => (
                  <tr key={tx.id ?? tx.transaction_id ?? tx.item_id ?? idx} className="hover:bg-gray-50">
                    <td className="py-3 text-sm font-medium text-gray-800">{tx.item_name}</td>
                    <td className="py-3 text-sm text-gray-600">{tx.borrower_name}</td>
                    <td className="py-3 text-sm text-gray-600">{tx.division_name}</td>
                    <td className="py-3 text-sm text-gray-600">{tx.quantity}</td>
                    <td className="py-3 text-sm text-gray-600">
                      {new Date(tx.borrow_date || tx.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-sm">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        tx.status === 'returned'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {tx.status || 'borrowed'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
