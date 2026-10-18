'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import KpiCard from '@/components/KpiCard';
import { SkeletonKpiCard, SkeletonTableRow, SkeletonChart } from '@/components/Skeleton';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import {
  formatCurrency,
  createBarTooltipConfig,
  createDoughnutTooltipConfig,
  buildAnalyticsCharts
} from '@/components/AnalyticsShared';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend, Filler);

function DoughnutPercentageLegend({ labels, data, colors }) {
  const total = data.reduce((sum, v) => sum + Number(v || 0), 0);
  return (
    <div className="flex flex-col justify-center gap-3 min-w-[150px] flex-shrink-0">
      {labels.map((label, i) => {
        const value = Number(data[i] || 0);
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return (
          <div key={label} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: colors[i] }} />
            <span className="text-gray-600 truncate">{label}</span>
            <span className="font-semibold text-gray-900 ml-auto">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Filter state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterDivision, setFilterDivision] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterItem, setFilterItem] = useState('');
  const [divisions, setDivisions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);

  // Data state
  const [kpis, setKpis] = useState({
    totalItems: 0,
    lowStock: 0,
    itemsOnLoan: 0,
    totalTransactions: 0,
    returnRate: 0,
    totalValue: 0
  });
  const [divisionConsumption, setDivisionConsumption] = useState({ labels: [], datasets: [] });
  const [stockStatusChart, setStockStatusChart] = useState({ labels: [], datasets: [] });
  const [recentTransactions, setRecentTransactions] = useState([]);

  async function fetchFilters() {
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [divRes, catRes, invRes] = await Promise.all([
        fetch('/api/public/divisions', { headers }),
        fetch('/api/categories', { headers }),
        fetch('/api/inventory', { headers })
      ]);
      const divData = await divRes.json();
      const catData = await catRes.json();
      const invData = await invRes.json();
      setDivisions(Array.isArray(divData) ? divData : []);
      setCategories(Array.isArray(catData) ? catData : (catData.categories || []));
      setInventoryItems(Array.isArray(invData) ? invData : []);
    } catch (e) {
      console.error('Filter fetch error:', e);
    }
  }

  async function fetchDashboard({ silent = false } = {}) {
    if (!silent) setLoading(true);
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('from', dateFrom);
      if (dateTo) params.append('to', dateTo);
      if (filterDivision) params.append('division_id', filterDivision);
      if (filterCategory) params.append('category_id', filterCategory);
      if (filterStatus) params.append('status', filterStatus);
      if (filterItem) params.append('item_id', filterItem);

      const fetchOpts = { headers, cache: 'no-store' };
      const [analyticsRes, txRes] = await Promise.all([
        fetch(`/api/dashboard/analytics?${params.toString()}`, fetchOpts),
        fetch('/api/transactions', fetchOpts)
      ]);

      const safeJson = async (res) => {
        const text = await res.text();
        try { return JSON.parse(text); } catch { return {}; }
      };

      const analytics = await safeJson(analyticsRes);
      const txData = await safeJson(txRes);

      if (analytics.kpis) {
        setKpis({
          totalItems: analytics.kpis.totalItems,
          lowStock: analytics.kpis.lowStock,
          itemsOnLoan: analytics.kpis.itemsOnLoan,
          totalTransactions: analytics.kpis.totalTransactions,
          returnRate: analytics.kpis.returnRate,
          totalValue: analytics.kpis.totalValue
        });
      }

      const charts = buildAnalyticsCharts(analytics);
      setDivisionConsumption(charts.divisionConsumption);
      setStockStatusChart(charts.stockStatusChart);

      // Recent transactions
      const transactions = Array.isArray(txData) ? txData : (txData.transactions || []);
      setRecentTransactions(transactions.slice(0, 10));

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }

  useEffect(() => {
    fetchFilters();
    fetchDashboard();
    const interval = setInterval(() => fetchDashboard({ silent: true }), 30000);
    return () => clearInterval(interval);
  }, [dateFrom, dateTo, filterDivision, filterCategory, filterStatus, filterItem]);

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setFilterDivision('');
    setFilterCategory('');
    setFilterStatus('');
    setFilterItem('');
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
      tooltip: createBarTooltipConfig()
    },
    scales: { y: { beginAtZero: true } },
    barPercentage: 0.7,
    categoryPercentage: 0.8
  };

  const doughnutOptions = (position = 'bottom', showLegend = true) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: showLegend, position, labels: { boxWidth: 12, padding: 8, font: { size: 11 } } },
      tooltip: createDoughnutTooltipConfig()
    },
    cutout: '60%'
  });

  const kpiCards = [
    { label: 'TOTAL ITEMS', value: loading ? '...' : kpis.totalItems, color: 'text-blue-600' },
    { label: 'CRITICAL STOCK', value: loading ? '...' : kpis.lowStock, color: 'text-red-600' },
    { label: 'ITEMS ON LOAN', value: loading ? '...' : kpis.itemsOnLoan, color: 'text-orange-600' },
    { label: 'TOTAL TRANSACTIONS', value: loading ? '...' : kpis.totalTransactions, color: 'text-purple-600' },
    { label: 'RETURN RATE', value: loading ? '...' : `${kpis.returnRate}%`, color: 'text-green-600' },
    { label: 'TOTAL VALUE', value: loading ? '...' : formatCurrency(kpis.totalValue), color: 'text-cyan-600' }
  ];

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Division</label>
            <select
              value={filterDivision}
              onChange={(e) => setFilterDivision(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Divisions</option>
              {divisions.map(d => (
                <option key={d.division_id || d.id} value={d.division_id || d.id}>{d.division_name || d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.category_id || c.id} value={c.category_id || c.id}>{c.category_name || c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Transaction Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Borrowed">Borrowed</option>
              <option value="Returned">Returned</option>
              <option value="Overdue">Overdue</option>
              <option value="Approved">Approved</option>
              <option value="Released">Released</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Item</label>
            <select
              value={filterItem}
              onChange={(e) => setFilterItem(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Items</option>
              {inventoryItems.map(item => (
                <option key={item.item_id} value={item.item_id}>{item.item_name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Both charts below (division consumption and stock status) use these filters.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {!hasLoaded ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonKpiCard key={i} />)
        ) : (
          kpiCards.map((kpi, i) => (
            <KpiCard key={i} label={kpi.label} value={kpi.value} />
          ))
        )}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Division-wise Consumption */}
        <div className="bg-white rounded-xl shadow-sm p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Division Consumption Analytics</h2>
          {!hasLoaded ? (
            <SkeletonChart className="border-0 p-0 shadow-none" />
          ) : (
            <div style={{ height: 320 }}>
              <Bar data={divisionConsumption} options={chartOptions} />
            </div>
          )}
        </div>

        {/* Stock Status */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Stock Status Distribution</h2>
          {!hasLoaded ? (
            <SkeletonChart className="border-0 p-0 shadow-none" />
          ) : (
            <div style={{ height: 280 }} className="flex items-center justify-center gap-4">
              {stockStatusChart.labels.length > 0 ? (
                <>
                  <div className="flex-1 h-full min-w-0">
                    <Doughnut data={stockStatusChart} options={doughnutOptions('bottom', false)} />
                  </div>
                  <DoughnutPercentageLegend
                    labels={stockStatusChart.labels}
                    data={stockStatusChart.datasets[0].data}
                    colors={stockStatusChart.datasets[0].backgroundColor}
                  />
                </>
              ) : (
                <p className="text-sm text-gray-400">No data</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent Issuances */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Recent Borrowed Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 pb-3 w-[25%]">Item</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3 w-[20%]">Borrower</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3 w-[22%]">Division</th>
                <th className="text-center text-xs font-medium text-gray-400 pb-3 w-[8%]">Qty</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3 w-[13%]">Date</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3 w-[12%]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonTableRow key={i} widths={['w-28', 'w-20', 'w-24', 'w-10', 'w-20', 'w-16']} />
                ))
              ) : recentTransactions.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">No recent transactions</td></tr>
              ) : (
                recentTransactions.map((tx, idx) => (
                  <tr key={`${tx.id ?? tx.transaction_id ?? tx.item_id}-${idx}`} className="hover:bg-gray-50">
                    <td className="py-3 text-sm font-medium text-gray-800">{tx.item_name}</td>
                    <td className="py-3 text-sm text-gray-600">{tx.borrower_name}</td>
                    <td className="py-3 text-sm text-gray-600">{tx.division_name}</td>
                    <td className="py-3 text-sm text-gray-600 text-center">{tx.quantity_borrowed ?? tx.quantity}</td>
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
    </div>
  );
}
