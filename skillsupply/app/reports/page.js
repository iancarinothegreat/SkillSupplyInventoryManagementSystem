'use client';
import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import KpiCard from '../../components/KpiCard';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend);

export default function ReportsPage() {
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [selectedDivision, setSelectedDivision] = useState('all');
  const [monthlyChart, setMonthlyChart] = useState({ labels: [], datasets: [] });

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const [invRes, txRes, divRes, monthlyRes] = await Promise.all([
        fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/transactions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/divisions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/dashboard/monthly-trend', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (invRes.ok) setInventory(await invRes.json());
      if (txRes.ok) setTransactions(await txRes.json());
      if (divRes.ok) {
        const divData = await divRes.json();
        setDivisions(Array.isArray(divData) ? divData : divData.divisions || []);
      }
      if (monthlyRes.ok) {
        const monthlyData = await monthlyRes.json();
        if (Array.isArray(monthlyData) && monthlyData.length > 0) {
          setMonthlyChart({
            labels: monthlyData.map(d => d.month),
            datasets: [
              {
                label: 'Issued',
                data: monthlyData.map(d => d.issued),
                borderColor: '#1e40af',
                backgroundColor: '#1e40af',
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
              },
              {
                label: 'Returned',
                data: monthlyData.map(d => d.returned),
                borderColor: '#16a34a',
                backgroundColor: '#16a34a',
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
              }
            ]
          });
        } else {
          setMonthlyChart({
            labels: ['No Data'],
            datasets: [
              { label: 'Issued', data: [0], borderColor: '#1e40af', backgroundColor: '#1e40af', tension: 0.3, pointRadius: 4 },
              { label: 'Returned', data: [0], borderColor: '#16a34a', backgroundColor: '#16a34a', tension: 0.3, pointRadius: 4 }
            ]
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ report: 'dashboard', ...dateRange });
      const res = await fetch(`/api/reports/export-pdf?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SkillSupply_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        alert('Export failed. Please try again.');
      }
    } catch (err) {
      alert('Export error: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Normalize inventory
  const normalizedInventory = inventory.map((item) => {
    const quantityOnHand = item.quantity_on_hand ?? item.quantity ?? 0;
    return {
      ...item,
      name: item.name ?? item.item_name,
      category_name: item.category_name ?? item.category,
      quantity: quantityOnHand,
      unit_price: item.unit_price ?? 0,
    };
  });

  // Filter transactions by date and division
  const filteredTransactions = transactions.filter(t => {
    if (!dateRange.from && !dateRange.to && selectedDivision === 'all') return true;
    const d = new Date(t.borrow_date);
    if (dateRange.from && d < new Date(dateRange.from)) return false;
    if (dateRange.to && d > new Date(dateRange.to)) return false;
    if (selectedDivision !== 'all' && String(t.borrower_division_id) !== String(selectedDivision)) return false;
    return true;
  });

  // Calculate KPIs
  const totalItems = normalizedInventory.length;
  const totalIssued = filteredTransactions.filter(t => t.status !== 'Returned').length;
  const totalReturned = filteredTransactions.filter(t => t.status === 'Returned').length;
  const totalValue = normalizedInventory.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  // Monthly trend is now fetched from API

  // Top items by issuance
  const itemIssuance = {};
  filteredTransactions.forEach(t => {
    if (!itemIssuance[t.item_name]) itemIssuance[t.item_name] = 0;
    itemIssuance[t.item_name]++;
  });
  const topItems = Object.entries(itemIssuance)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Consumption details (total borrowed per item)
  const consumptionData = {};
  filteredTransactions.forEach(t => {
    if (!consumptionData[t.item_name]) {
      consumptionData[t.item_name] = {
        item_name: t.item_name,
        opening: 0,
        issued: 0,
        returned: 0,
        closing: 0,
        value: 0,
      };
    }
    const qty = parseInt(t.quantity) || 0;
    if (t.status === 'Returned') {
      consumptionData[t.item_name].returned += qty;
    } else {
      consumptionData[t.item_name].issued += qty;
    }
  });
  const consumption = Object.values(consumptionData).slice(0, 10);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          </div>
          <button
            onClick={handleExportPDF}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 items-end flex-wrap bg-white border border-gray-200 rounded-xl p-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Division</label>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Divisions</option>
              {divisions.map(d => (
                <option key={d.id ?? d.division_id} value={d.id ?? d.division_id}>
                  {d.division_name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { setDateRange({ from: '', to: '' }); setSelectedDivision('all'); }}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Clear
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading report data...</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard label="Total Items" value={totalItems} />
              <KpiCard label="Total Issued" value={totalIssued} />
              <KpiCard label="Total Returned" value={totalReturned} />
              <KpiCard label="Total Value" value={`₱${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Monthly Trend Chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Monthly Trend (6 months)</h3>
                <div style={{ height: 320 }}>
                  <Line data={monthlyChart} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }} />
                </div>
              </div>

              {/* Top Items Chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Items by Issuance</h3>
                <div className="space-y-3">
                  {topItems.length === 0 ? (
                    <p className="text-sm text-gray-400">No transaction data available</p>
                  ) : (
                    topItems.map(([item, count]) => {
                      const maxCount = Math.max(...topItems.map(i => i[1]), 1);
                      const pct = (count / maxCount) * 100;
                      return (
                        <div key={item}>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs text-gray-600 truncate">{item}</span>
                            <span className="text-xs font-medium text-gray-800">{count}</span>
                          </div>
                          <div className="h-6 bg-gray-100 rounded overflow-hidden">
                            <div className="h-full bg-blue-600 rounded transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Consumption Details Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">Consumption Details</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Item', 'Category', 'Opening', 'Issued', 'Returned', 'Closing', 'Value'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {consumption.map((item, idx) => (
                      <tr key={`${item.item_name}-${idx}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.item_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">—</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.opening}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.issued}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.returned}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.issued - item.returned}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-800">₱{((item.issued - item.returned) * 50).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

