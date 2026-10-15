'use client';
import { useState, useEffect, useCallback } from 'react';
import KpiCard from '../../components/KpiCard';
import { SkeletonKpiCard, SkeletonTableRow, SkeletonChart } from '../../components/Skeleton';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const COLORS = {
  blue: '#3b82f6',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  pink: '#ec4899',
  cyan: '#06b6d4',
  lime: '#84cc16',
  orange: '#f97316'
};

const PIE_COLORS = [COLORS.blue, COLORS.green, COLORS.yellow, COLORS.red, COLORS.purple, COLORS.pink, COLORS.cyan, COLORS.lime];

const riskConfig = {
  Critical: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
  High: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  Medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  Low: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' }
};

export default function ForecastPage() {
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [smaWindow, setSmaWindow] = useState(3);

  // New state for charts
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [historicalChart, setHistoricalChart] = useState({ labels: [], datasets: [] });
  const [categoryChart, setCategoryChart] = useState({ labels: [], datasets: [] });
  const [topRiskItems, setTopRiskItems] = useState([]);
  const [overallAccuracy, setOverallAccuracy] = useState(0);
  const [totalForecastedDemand, setTotalForecastedDemand] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchForecasts = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch(`/api/forecast?window=${smaWindow}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setForecasts(Array.isArray(data) ? data : []);
      } else {
        setError('Failed to load forecast data.');
      }
    } catch {
      setError('Server error loading forecasts.');
    } finally {
      setLoading(false);
    }
  }, [smaWindow]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const params = new URLSearchParams();
      if (dateFrom) params.append('from', dateFrom);
      if (dateTo) params.append('to', dateTo);
      params.append('window', smaWindow.toString());

      const res = await fetch(`/api/forecast/analytics?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();

        // Historical + Forecast chart
        const allLabels = [...data.historical.map(h => h.month), ...data.forecast.map(f => f.month)];
        const historicalData = data.historical.map(h => h.consumed);
        const forecastData = [...Array(data.historical.length).fill(null), ...data.forecast.map(f => f.consumed)];

        setHistoricalChart({
          labels: allLabels,
          datasets: [
            {
              label: 'Historical Demand',
              data: historicalData,
              borderColor: COLORS.blue,
              backgroundColor: 'rgba(59,130,246,0.1)',
              fill: true,
              tension: 0.4,
              pointRadius: 4
            },
            {
              label: 'Forecast',
              data: forecastData,
              borderColor: COLORS.blue,
              borderDash: [5, 5],
              backgroundColor: 'transparent',
              tension: 0.4,
              pointRadius: 4
            }
          ]
        });

        // Category forecast doughnut
        if (data.categoryForecast && data.categoryForecast.length > 0) {
          setCategoryChart({
            labels: data.categoryForecast.map(c => c.name),
            datasets: [{
              data: data.categoryForecast.map(c => c.forecasted),
              backgroundColor: PIE_COLORS.slice(0, data.categoryForecast.length),
              borderWidth: 0
            }]
          });
        }

        setTopRiskItems(data.topRiskItems || []);
        setOverallAccuracy(parseFloat(data.overallAccuracy) || 0);
        setTotalForecastedDemand(data.totalForecastedDemand || 0);
      }
    } catch {
      console.error('Analytics fetch error');
    } finally {
      setHasLoaded(true);
    }
  }, [dateFrom, dateTo, smaWindow]);

  useEffect(() => {
    fetchForecasts();
    fetchAnalytics();
  }, [fetchForecasts, fetchAnalytics]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchForecasts();
      fetchAnalytics();
    }, 60000);
    return () => clearInterval(timer);
  }, [fetchForecasts, fetchAnalytics]);

  const getRiskLevel = (item) => {
    const stock = Number(item.stock) || 0;
    const reorder = Number(item.reorder_point) || 0;
    if (reorder > 0 && stock <= reorder) return 'critical';
    if (reorder > 0 && stock <= reorder * 1.5) return 'warning';
    if (item.severity === 'critical') return 'critical';
    if (item.severity === 'warning') return 'warning';
    return 'safe';
  };

  const criticalCount = forecasts.filter(i => getRiskLevel(i) === 'critical').length;
  const warningCount = forecasts.filter(i => getRiskLevel(i) === 'warning').length;
  const safeCount = forecasts.filter(i => getRiskLevel(i) === 'safe').length;

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.parsed.y ?? context.parsed ?? 0;
            return `${context.dataset.label}: ${value.toLocaleString()} units`;
          }
        }
      }
    },
    scales: { y: { beginAtZero: true } }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${context.label}: ${value.toLocaleString()} units (${percentage}%)`;
          }
        }
      }
    },
    cutout: '60%'
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Forecasting & Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Demand outlook and projections using <span className="font-medium text-blue-600">Simple Moving Average (SMA)</span></p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Date Range Filter */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-semibold text-gray-700">Date Range</span>
          </div>
          <div className="flex items-center gap-2">
            {[3, 6, 12].map(n => (
              <button key={n} onClick={() => { setSmaWindow(n); setLoading(true); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${smaWindow === n ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                {n} months
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={clearFilters} className="mt-5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg px-3 py-2 text-sm font-medium transition-colors">Clear</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {loading || !hasLoaded ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonKpiCard key={i} />)
        ) : (
          <>
            <KpiCard label="CRITICAL ITEMS" value={criticalCount} />
            <KpiCard label="WARNING ITEMS" value={warningCount} />
            <KpiCard label="SAFE ITEMS" value={safeCount} />
            <KpiCard label="FORECAST ACCURACY" value={`${overallAccuracy}%`} />
            <KpiCard label="FORECASTED DEMAND" value={`${totalForecastedDemand.toLocaleString()} units`} />
          </>
        )}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Demand Forecast Overview */}
        <div className="bg-white rounded-xl shadow-sm p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Demand Forecast Overview</h2>
          {!hasLoaded ? (
            <SkeletonChart className="border-0 p-0 shadow-none" />
          ) : (
            <div style={{ height: 320 }}>
              <Line data={historicalChart} options={chartOptions} />
            </div>
          )}
        </div>

        {/* Forecasted Consumption by Category */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Forecasted by Category</h2>
          {!hasLoaded ? (
            <SkeletonChart className="border-0 p-0 shadow-none" />
          ) : (
            <div style={{ height: 320 }} className="flex items-center justify-center">
              {categoryChart.labels.length > 0 ? (
                <Doughnut data={categoryChart} options={doughnutOptions} />
              ) : (
                <p className="text-sm text-gray-400">No data</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Top Items at Risk */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Items at Risk of Stockout</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 pb-3">Item</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3">Category</th>
                <th className="text-right text-xs font-medium text-gray-400 pb-3">Current Stock</th>
                <th className="text-right text-xs font-medium text-gray-400 pb-3">Reorder Point</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3">Projected Stockout</th>
                <th className="text-left text-xs font-medium text-gray-400 pb-3">Risk Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!hasLoaded ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonTableRow key={i} widths={['w-28', 'w-20', 'w-16', 'w-16', 'w-24', 'w-16']} />
                ))
              ) : topRiskItems.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">No at-risk items</td></tr>
              ) : (
                topRiskItems.map((item, idx) => {
                  const cfg = riskConfig[item.riskLevel] || riskConfig.Low;
                  return (
                    <tr key={item.item_id || idx} className="hover:bg-gray-50">
                      <td className="py-3 text-sm font-medium text-gray-800">{item.item_name}</td>
                      <td className="py-3 text-sm text-gray-600">{item.category || '-'}</td>
                      <td className="py-3 text-sm text-gray-800 text-right font-semibold">{item.stock} {item.unit}</td>
                      <td className="py-3 text-sm text-gray-600 text-right">{item.reorderLevel}</td>
                      <td className="py-3 text-sm text-gray-600">{item.stockoutDate || '-'}</td>
                      <td className="py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
                          {item.riskLevel}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
