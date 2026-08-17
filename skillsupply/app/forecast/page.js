  'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Layout from '../../components/Layout';
import KpiCard from '../../components/KpiCard';

export default function ForecastPage() {
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterRisk, setFilterRisk] = useState('all');
  const [smaWindow, setSmaWindow] = useState(3); // months (3,6,12)

  const fetchForecasts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/forecast?window=${smaWindow}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Normalize fields: backend returns item_id/item_name and `stock` or `quantity_on_hand`.
        const normalized = Array.isArray(data) ? data.map(it => ({
          id: it.item_id ?? it.id ?? it.itemId,
          name: it.item_name ?? it.name ?? it.itemName,
          current_stock: it.stock ?? it.quantity_on_hand ?? it.current_stock ?? it.quantity ?? 0,
          sma: Number(it.sma ?? it.SMA ?? 0), // daily SMA
          days_left: it.daysLeft ?? it.days_left ?? null,
          category_name: it.category_name ?? it.category ?? null,
          severity: it.severity ?? it.alert ?? null,
        })) : [];
        console.log('Forecast data:', normalized); // Debug log to see what we're getting
        setForecasts(normalized);
      } else {
        setError('Failed to load forecast data.');
      }
    } catch (err) {
      setError('Server error loading forecasts.');
    } finally {
      setLoading(false);
    }
  }, [smaWindow]);

  const searchParams = useSearchParams();

  useEffect(() => {
    fetchForecasts();
  }, [fetchForecasts]);

  useEffect(() => {
    const querySearch = searchParams?.get('search') || '';
    setSearch(querySearch);
  }, [searchParams]);

  const getRiskLevel = (item) => {
    // Use daysLeft from API if available, otherwise calculate from SMA
    const daysLeft = item.days_left !== undefined ? item.days_left : (item.sma > 0 ? Math.floor(Number(item.current_stock ?? 0) / Number(item.sma)) : 999);
    
    if (item.severity && item.severity !== 'ok') return item.severity;
    
    if (daysLeft <= 7) return 'critical';
    if (daysLeft <= 30) return 'warning';
    return 'safe';
  };


  const riskConfig = {
    critical: { label: 'Critical', bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500', border: 'border-red-200' },
    warning: { label: 'Warning', bg: 'bg-yellow-100', text: 'text-yellow-700', bar: 'bg-yellow-500', border: 'border-yellow-200' },
    safe: { label: 'Safe', bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-500', border: 'border-green-200' },
    unknown: { label: 'N/A', bg: 'bg-gray-100', text: 'text-gray-600', bar: 'bg-gray-300', border: 'border-gray-200' },
  };

  const filtered = forecasts.filter(item => {
    const matchSearch = item.name?.toLowerCase().includes(search.toLowerCase());
    const risk = getRiskLevel(item);
    const matchRisk = filterRisk === 'all' || risk === filterRisk;
    return matchSearch && matchRisk;
  });

  const criticalCount = forecasts.filter(i => getRiskLevel(i) === 'critical').length;
  const warningCount = forecasts.filter(i => getRiskLevel(i) === 'warning').length;
  const safeCount = forecasts.filter(i => getRiskLevel(i) === 'safe').length;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Demand Forecast</h1>
            <p className="text-sm text-gray-500 mt-1">Stock depletion predictions using <span className="font-medium text-blue-600">Simple Moving Average (SMA)</span></p>
          </div>
          <div className="flex items-center gap-3">
            {[3,6,12].map(n => (
              <button key={n} onClick={() => setSmaWindow(n)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${smaWindow===n ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                {n} months
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* SMA Explanation */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-1">About Simple Moving Average (SMA)</h3>
          <p className="text-xs text-blue-700 leading-relaxed">
            SMA estimates consumption using the last <strong>{smaWindow} months</strong> of transaction history. Use the window selector to change the period.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Critical" value={criticalCount} />
          <KpiCard label="Warning" value={warningCount} />
          <KpiCard label="Normal" value={safeCount} />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            {['all', 'critical', 'warning', 'safe'].map((r) => (
              <button
                key={r}
                onClick={() => setFilterRisk(r)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition ${
                  filterRisk === r ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Forecast Cards */}
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading forecast data...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No items match your filter.</div>
        ) : (
          <>
            {/* Table View */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Item', 'Category', 'Stock', 'Monthly Avg', 'Depletion', 'Progress', 'Alert'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((item) => {
                      const risk = getRiskLevel(item);
                      const cfg = riskConfig[risk];
                      const stock = item.current_stock ?? item.stock ?? item.quantity;
                      const dailySma = Number(item.sma) || 0;
                      const monthlyAvg = dailySma > 0 ? (dailySma * 30) : 0;
                      const daysLeft = item.days_left !== null && item.days_left !== undefined ? item.days_left : (dailySma > 0 ? Math.floor(Number(stock) / Number(dailySma)) : null);
                      const maxDays = 90;
                      const noConsumption = dailySma === 0;
                      const barPct = noConsumption ? 100 : (daysLeft !== null ? Math.min(100, Math.round((daysLeft / maxDays) * 100)) : 0);


                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{item.category_name}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-800">{item.current_stock ?? item.quantity}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{monthlyAvg ? Number(monthlyAvg).toFixed(1) : '0.0'}</td>
                          <td className="px-4 py-3 text-sm font-semibold">
                            {noConsumption ? (
                              <span className="text-green-600">No consumption</span>
                            ) : daysLeft !== null ? (
                              <span className={cfg.text}>{daysLeft}d</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 w-40">
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${noConsumption ? 'bg-green-500' : cfg.bar}`} style={{ width: `${barPct}%` }} />
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{barPct}% of 90d</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                              {cfg.label === 'Safe' ? 'Normal' : cfg.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SMA Breakdown Cards for Critical Items */}
            {criticalCount > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-red-700 mb-3">⚠️ Critical Items — Immediate Attention Required</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {forecasts.filter(i => getRiskLevel(i) === 'critical').map(item => {
                    const daysLeft = item.days_left !== undefined ? item.days_left : (item.sma > 0 ? Math.floor(item.current_stock / item.sma) : 0);
                    return (
                      <div key={item.id} className="bg-white border border-red-200 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-400">{item.category_name}</p>
                          </div>
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">Critical</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-lg font-bold text-gray-800">{item.current_stock ?? item.quantity}</p>
                            <p className="text-xs text-gray-400">Stock</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-lg font-bold text-blue-600">{Number(item.sma).toFixed(1)}</p>
                            <p className="text-xs text-gray-400">SMA/day</p>
                          </div>
                          <div className="bg-red-50 rounded-lg p-2">
                            <p className="text-lg font-bold text-red-600">{daysLeft}d</p>
                            <p className="text-xs text-gray-400">Left</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
