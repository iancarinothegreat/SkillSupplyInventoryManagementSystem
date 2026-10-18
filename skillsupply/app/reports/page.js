  'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import KpiCard from '../../components/KpiCard';
import { SkeletonKpiCard, SkeletonChart } from '@/components/Skeleton';
import Pagination from '@/components/Pagination';
import {
  COLORS,
  buildAnalyticsCharts,
  barChartOptions,
  doughnutChartOptions,
  DoughnutPercentageLegend
} from '@/components/AnalyticsShared';
import * as XLSX from 'xlsx';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, BarElement, ArcElement, Tooltip, Legend, Filler);

const TABS = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'borrowing', label: 'Borrowing' },
  { value: 'requisitions', label: 'Requisition & Procurement' },
];

const REPORT_TYPES = [
  { group: 'Inventory', tab: 'inventory', value: 'inventory', label: 'Inventory Status' },
  { group: 'Inventory', tab: 'inventory', value: 'inventory_value', label: 'Inventory Valuation' },
  { group: 'Inventory', tab: 'inventory', value: 'lowstock', label: 'Critical Reorder Report' },
  { group: 'Inventory', tab: 'inventory', value: 'outofstock', label: 'Critical Stock' },
  { group: 'Inventory', tab: 'inventory', value: 'inventory_category', label: 'Inventory by Category' },
  { group: 'Inventory', tab: 'inventory', value: 'inventory_division', label: 'Inventory by Division' },
  { group: 'Inventory', tab: 'inventory', value: 'defective', label: 'Defective Stock' },
  { group: 'Inventory', tab: 'inventory', value: 'item_detail', label: 'Item Detail' },
  { group: 'Transactions', tab: 'borrowing', value: 'transactions', label: 'Transaction Log' },
  { group: 'Transactions', tab: 'borrowing', value: 'returns', label: 'Returns Report' },
  { group: 'Transactions', tab: 'borrowing', value: 'overdue', label: 'Overdue Items' },
  { group: 'Transactions', tab: 'borrowing', value: 'borrowed', label: 'Currently Borrowed' },
  { group: 'Consumption', tab: 'borrowing', value: 'consumption', label: 'Consumption by Item' },
  { group: 'Consumption', tab: 'borrowing', value: 'most_used', label: 'Most Used Items' },
  { group: 'Consumption', tab: 'borrowing', value: 'least_used', label: 'Least Used Items' },
  { group: 'Consumption', tab: 'borrowing', value: 'monthly_trend', label: 'Monthly Issued vs Returned' },
  { group: 'Requisitions', tab: 'requisitions', value: 'requisitions', label: 'Requisition Status' },
  { group: 'Requisitions', tab: 'requisitions', value: 'requisition_status', label: 'Requisitions by Status' },
  { group: 'Requisitions', tab: 'requisitions', value: 'requisition_division', label: 'Requisitions by Division' },
  { group: 'Requisitions', tab: 'requisitions', value: 'requisition_approval', label: 'Approval Time' },
  { group: 'Requisitions', tab: 'requisitions', value: 'requisition_purpose', label: 'Purpose Analysis' },
  { group: 'Forecasting', tab: 'requisitions', value: 'forecast', label: 'Demand Forecast' },
  { group: 'Forecasting', tab: 'requisitions', value: 'forecast_risk', label: 'Forecast Risk' },
  { group: 'Administration', tab: 'all', value: 'audit', label: 'Audit Trail' },
  { group: 'Administration', tab: 'all', value: 'login_audit', label: 'Login Audit Logs' },
];

function formatAuditValue(val, categories, divisions) {
  if (val === null || val === undefined || val === 'â€”') return 'â€”';
  if (typeof val !== 'object') return val;
  const obj = typeof val === 'string' ? (() => { try { return JSON.parse(val); } catch { return val; } })() : val;
  if (typeof obj !== 'object' || obj === null) return String(obj);
  if (obj.action) return `${obj.action}${obj.count ? ` (${obj.count} items)` : ''}`;
  const categoryLookup = Object.fromEntries((categories || []).map(c => [c.category_id, c.category_name]));
  const divisionLookup = Object.fromEntries((divisions || []).map(d => [d.division_id, d.division_name]));
  const cat = obj.category_id ? categoryLookup[obj.category_id] : obj.category_name;
  const div = obj.division_id ? divisionLookup[obj.division_id] : obj.division_name;
  const parts = [];
  if (obj.item_name) parts.push(obj.item_name);
  if (obj.full_name || obj.borrower_name) parts.push(`Borrower: ${obj.full_name || obj.borrower_name}`);
  if (obj.status) parts.push(`Status: ${obj.status}`);
  if (obj.quantity_on_hand !== undefined) parts.push(`Qty: ${obj.quantity_on_hand}`);
  if (obj.quantity_borrowed) parts.push(`Qty: ${obj.quantity_borrowed}`);
  if (obj.quantity_returned) parts.push(`Returned: ${obj.quantity_returned}`);
  if (cat) parts.push(`Category: ${cat}`);
  if (div) parts.push(`Division: ${div}`);
  if (obj.purpose) parts.push(`Purpose: ${obj.purpose}`);
  if (obj.notes) parts.push(`Notes: ${obj.notes}`);
  if (obj.unit_cost) parts.push(`Cost: ${Number(obj.unit_cost).toFixed(2)}`);
  if (parts.length === 0) return JSON.stringify(obj);
  return parts.join(' | ');
}

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const requestedReport = searchParams.get('report');
  const initialReport = REPORT_TYPES.some((report) => report.value === requestedReport) ? requestedReport : 'inventory';
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedReport, setSelectedReport] = useState(initialReport);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [selectedDivision, setSelectedDivision] = useState('all');
  const [reportRows, setReportRows] = useState([]);
  const [reportTitle, setReportTitle] = useState('Inventory Status');
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [expandedCell, setExpandedCell] = useState(null);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditAction, setAuditAction] = useState('all');
  const [auditSort, setAuditSort] = useState('timestamp');
  const [auditOrder, setAuditOrder] = useState('DESC');
  const [reportPage, setReportPage] = useState(1);
  const [activeTab, setActiveTab] = useState('inventory');
  const [analyticsCharts, setAnalyticsCharts] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [procurementRows, setProcurementRows] = useState([]);
  const [forecastRows, setForecastRows] = useState([]);

  const getToken = () => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('token') || '';
  };

  const getStatusOptions = (report) => {
    if (report === 'inventory') {
      return ['Critical', 'Low Stock', 'In Stock'];
    }
    if (
      report === 'transactions' ||
      report === 'borrowed' ||
      report === 'overdue' ||
      report === 'consumption' ||
      report === 'most_used' ||
      report === 'least_used' ||
      report === 'monthly_trend'
    ) {
      return ['Borrowed', 'Returned', 'Overdue', 'Cancelled', 'Active', 'Issued'];
    }
    if (report.startsWith('requisition') || report === 'requisitions') {
      return ['Pending', 'Approved', 'Rejected', 'Issued', 'Returned'];
    }
    return [];
  };

  const fetchData = useCallback(async () => {
    try {
      const token = getToken();
      const [invRes, txRes, divRes, categoryRes] = await Promise.all([
        fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/transactions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/divisions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/categories', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (invRes.ok) setInventory(await invRes.json());
      if (txRes.ok) setTransactions(await txRes.json());
      if (divRes.ok) {
        const divData = await divRes.json();
        setDivisions(Array.isArray(divData) ? divData : divData.divisions || []);
      }
      if (categoryRes.ok) {
        const categoryData = await categoryRes.json();
        setCategories(Array.isArray(categoryData) ? categoryData : categoryData.categories || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReport = useCallback(async (showLoading = true) => {
    const requestStartedAt = Date.now();
    if (showLoading) setReportLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        report: selectedReport,
        ...dateRange,
        ...(dateRange.to ? { to: `${dateRange.to}T23:59:59` } : {}),
        division: selectedDivision,
        category: selectedCategory,
        status: selectedStatus,
      });
      if (selectedReport === 'audit' || selectedReport === 'login_audit') {
        if (auditSearch) params.set('search', auditSearch);
        if (auditAction !== 'all') params.set('action', auditAction);
        params.set('sort', auditSort);
        params.set('order', auditOrder);
      }
      const response = await fetch(`/api/reports/data?${params}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load report');
      setReportTitle(data.title);
      setReportRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      console.error(err);
      setReportRows([]);
    } finally {
      setReportLoading(false);
    }
  }, [selectedReport, dateRange, selectedDivision, selectedCategory, selectedStatus, auditSearch, auditAction, auditSort, auditOrder]);

  useEffect(() => {
    queueMicrotask(fetchData);
  }, [fetchData]);

  useEffect(() => {
    queueMicrotask(fetchReport);
  }, [fetchReport]);

  useEffect(() => {
    setReportPage(1);
  }, [selectedReport, selectedDivision, selectedCategory, selectedStatus, dateRange, auditSearch, auditAction, auditOrder]);

  const fetchTabCharts = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (dateRange.from) params.set('from', dateRange.from);
      if (dateRange.to) params.set('to', `${dateRange.to}T23:59:59`);
      if (selectedDivision !== 'all') params.set('division_id', selectedDivision);
      if (selectedCategory !== 'all') params.set('category_id', selectedCategory);
      if (selectedStatus !== 'all' && selectedStatus !== 'Critical' && selectedStatus !== 'Low Stock' && selectedStatus !== 'In Stock') {
        params.set('status', selectedStatus);
      }

      const jobs = [fetch(`/api/dashboard/analytics?${params}`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })];
      if (activeTab === 'requisitions') {
        jobs.push(fetch('/api/procurement', { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } }));
        jobs.push(fetch(`/api/dashboard/request-forecast?${params}`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } }));
      }
      const [analyticsRes, procurementRes, forecastRes] = await Promise.all(jobs);

      const safeJson = async (res) => {
        const text = await res.text();
        try { return JSON.parse(text); } catch { return {}; }
      };
      const analytics = await safeJson(analyticsRes);
      setAnalyticsCharts(buildAnalyticsCharts(analytics || {}));

      if (activeTab === 'requisitions') {
        const procData = await safeJson(procurementRes);
        setProcurementRows(Array.isArray(procData) ? procData : (procData.rows || []));
        const forecastData = await safeJson(forecastRes);
        setForecastRows(Array.isArray(forecastData) ? forecastData : (forecastData.rows || []));
      }
    } catch (err) {
      console.error(err);
      setAnalyticsCharts(buildAnalyticsCharts({}));
    } finally {
      setAnalyticsLoading(false);
    }
  }, [activeTab, dateRange, selectedDivision, selectedCategory, selectedStatus]);

  useEffect(() => {
    queueMicrotask(fetchTabCharts);
  }, [fetchTabCharts]);

  // Keep the selected report type valid for the active tab
  useEffect(() => {
    const belongs = REPORT_TYPES.some((r) => r.value === selectedReport && (r.tab === activeTab || r.tab === 'all'));
    if (!belongs) {
      const first = REPORT_TYPES.find((r) => r.tab === activeTab);
      if (first) setSelectedReport(first.value);
    }
  }, [activeTab, selectedReport]);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        report: selectedReport,
        ...dateRange,
        ...(dateRange.to ? { to: `${dateRange.to}T23:59:59` } : {}),
        division: selectedDivision,
        category: selectedCategory,
        status: selectedStatus,
        format: 'pdf',
      });
      const res = await fetch(`/api/reports/data?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SkillSupply_${selectedReport}_${new Date().toISOString().slice(0, 10)}.pdf`;
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

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const generatedAt = new Date();
      let userObj = {};
      try {
        userObj = JSON.parse((typeof window !== 'undefined' && sessionStorage.getItem('user')) || '{}');
      } catch {}
      const generatedBy = userObj.full_name || userObj.username || 'Current user';
      const heading = [[reportTitle], [`As of: ${generatedAt.toLocaleDateString('en-PH')}`], []];
      const worksheet = XLSX.utils.aoa_to_sheet(heading);
      XLSX.utils.sheet_add_json(worksheet, reportRows, { origin: 'A5', skipHeader: false });
      XLSX.utils.sheet_add_aoa(
        worksheet,
        [
          [],
          [`Date Generated: ${generatedAt.toLocaleString('en-PH')}`],
          [`Generated by: ${generatedBy}`],
        ],
        { origin: -1 }
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
      XLSX.writeFile(
        workbook,
        `SkillSupply_${selectedReport}_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
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
      unit_price: item.unit_price ?? item.unit_cost ?? 0,
    };
  });

  // Filter transactions by date and division
  const filteredTransactions = transactions.filter((t) => {
    if (!dateRange.from && !dateRange.to && selectedDivision === 'all') return true;
    const d = new Date(t.borrow_date);
    if (dateRange.from && d < new Date(dateRange.from)) return false;
    if (dateRange.to && d > new Date(dateRange.to)) return false;
    if (selectedDivision !== 'all' && String(t.borrower_division_id) !== String(selectedDivision))
      return false;
    return true;
  });

  // Calculate KPIs
  const totalItems = normalizedInventory.length;
  const totalIssued = filteredTransactions
    .filter((t) => t.status !== 'Returned')
    .reduce((sum, t) => sum + Number(t.quantity_borrowed ?? t.quantity ?? 0), 0);
  const totalReturned = filteredTransactions
    .filter((t) => t.status === 'Returned')
    .reduce((sum, t) => sum + Number(t.quantity_borrowed ?? t.quantity ?? 0), 0);
  const totalValue = normalizedInventory.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  // Top items by issuance
  const itemIssuance = {};
  filteredTransactions.forEach((t) => {
    if (!itemIssuance[t.item_name]) itemIssuance[t.item_name] = 0;
    itemIssuance[t.item_name]++;
  });
  const topItems = Object.entries(itemIssuance)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Consumption details (total borrowed per item)
  const consumptionData = {};
  filteredTransactions.forEach((t) => {
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
    const qty = Number(t.quantity_borrowed ?? t.quantity ?? t.qty ?? 0) || 0;
    if (t.status === 'Returned') {
      consumptionData[t.item_name].returned += qty;
    } else {
      consumptionData[t.item_name].issued += qty;
    }
  });
  const consumption = Object.values(consumptionData)
    .map((row) => {
      const inventoryItem = normalizedInventory.find(
        (item) => (item.item_name ?? item.name) === row.item_name
      );
      const currentStock = Number(inventoryItem?.quantity ?? 0);
      const unitPrice = Number(inventoryItem?.unit_price ?? 0);
      const category = inventoryItem?.category_name ?? 'â€”';
      const closing = currentStock;
      const opening = currentStock + row.issued - row.returned;
      return {
        ...row,
        category,
        unit: inventoryItem?.unit_of_measure ?? inventoryItem?.unit ?? 'unit',
        opening,
        closing,
        value: closing * unitPrice,
      };
    })
    .slice(0, 10);

  const reportPageSize = 10;
  const reportPageCount = Math.max(1, Math.ceil(reportRows.length / reportPageSize));
  const reportCurrentPage = Math.min(reportPage, reportPageCount);
  const pagedReportRows = reportRows.slice(
    (reportCurrentPage - 1) * reportPageSize,
    reportCurrentPage * reportPageSize
  );

  const tabCharts = analyticsCharts || {
    divisionConsumption: { labels: [], datasets: [] },
    divisionDetails: [],
    divisionDetailsChart: { labels: [], datasets: [] },
    monthlyTrend: { labels: [], datasets: [] },
    categoryChart: { labels: [], datasets: [] },
    stockStatusChart: { labels: [], datasets: [] },
    requisitionChart: { labels: [], datasets: [] },
  };

  const procurementStatusCounts = {
    Pending: procurementRows.filter((r) => r.status === 'Pending').length,
    Approved: procurementRows.filter((r) => r.status === 'Approved').length,
    Received: procurementRows.filter((r) => r.status === 'Received').length,
    Rejected: procurementRows.filter((r) => r.status === 'Rejected').length,
    Cancelled: procurementRows.filter((r) => r.status === 'Cancelled').length,
  };
  const procurementStatusChart = {
    labels: Object.keys(procurementStatusCounts).filter((k) => procurementStatusCounts[k] > 0),
    datasets: [{
      data: Object.keys(procurementStatusCounts).filter((k) => procurementStatusCounts[k] > 0).map((k) => procurementStatusCounts[k]),
      backgroundColor: [COLORS.yellow, COLORS.blue, COLORS.green, COLORS.red, '#9ca3af'].filter(
        (_, i) => procurementStatusCounts[['Pending', 'Approved', 'Received', 'Rejected', 'Cancelled'][i]] > 0
      ),
      borderWidth: 0
    }]
  };

  const procurementQty = {};
  procurementRows.forEach((r) => {
    (r.items || []).forEach((it) => {
      if (!procurementQty[it.item_name]) {
        procurementQty[it.item_name] = { requested: 0, received: 0 };
      }
      procurementQty[it.item_name].requested += Number(it.quantity_requested || 0);
      procurementQty[it.item_name].received += Number(it.quantity_received || 0);
    });
  });
  const procurementQtyTop = Object.entries(procurementQty)
    .sort((a, b) => b[1].requested - a[1].requested)
    .slice(0, 8);
  const procurementQtyChart = {
    labels: procurementQtyTop.map(([name]) => name),
    datasets: [
      { label: 'Requested', data: procurementQtyTop.map(([, v]) => v.requested), backgroundColor: COLORS.yellow, borderRadius: 4 },
      { label: 'Received', data: procurementQtyTop.map(([, v]) => v.received), backgroundColor: COLORS.green, borderRadius: 4 }
    ]
  };

  const requestForecastChart = {
    labels: forecastRows.map(d => d.division),
    datasets: [
      {
        label: 'Historical Requests (avg/month)',
        data: forecastRows.map(d => Number(d.historical_avg || 0)),
        backgroundColor: COLORS.blue,
        borderRadius: 4
      },
      {
        label: 'Predicted Max Requests (next month)',
        data: forecastRows.map(d => Number(d.predicted_max || 0)),
        backgroundColor: COLORS.orange,
        borderRadius: 4
      }
    ]
  };

  const divisionSummaryOptions = {
    ...barChartOptions(),
    indexAxis: 'y',
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: function(context) {
            const division = tabCharts.divisionDetails[context.dataIndex];
            if (!division) return '';
            const label = context.dataset.label;
            if (label === 'Items') return `Items: ${division.totalItems}`;
            if (label === 'Quantity') return `Quantity: ${division.totalQuantity.toLocaleString()}`;
            if (label === 'Value') return `Value: â‚±${Number(division.totalValue || 0).toLocaleString('en-PH')}`;
            return '';
          }
        }
      }
    },
    scales: {
      x: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' } },
      y: { ticks: { font: { size: 12 } } }
    }
  };

  const emptyDoughnut = (title) => (
    <p className="text-sm text-gray-400 flex items-center justify-center" style={{ height: 280 }}>{title}</p>
  );

  return (
    <>
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>

          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedReport}
              onChange={(e) => {
                setSelectedReport(e.target.value);
                setSelectedStatus('all');
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {[...new Set(REPORT_TYPES.filter((r) => r.tab === activeTab || r.tab === 'all').map((r) => r.group))].map((group) => (
                <optgroup key={group} label={group}>
                  {REPORT_TYPES.filter((r) => r.group === group && (r.tab === activeTab || r.tab === 'all')).map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              onClick={handleExportPDF}
              disabled={exporting || loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {exporting ? 'Exporting...' : 'Export PDF'}
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting || loading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {exporting ? 'Exporting...' : 'Export Excel'}
            </button>
          </div>
        </div>

        {/* Analytics tabs */}
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                activeTab === t.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
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
              {divisions.map((d) => (
                <option key={d.id ?? d.division_id} value={d.id ?? d.division_id}>
                  {d.division_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.category_id ?? c.id} value={c.category_id ?? c.id}>
                  {c.category_name ?? c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              {getStatusOptions(selectedReport).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              setDateRange({ from: '', to: '' });
              setSelectedDivision('all');
              setSelectedCategory('all');
              setSelectedStatus('all');
              setAuditSearch('');
              setAuditAction('all');
              setAuditSort('timestamp');
              setAuditOrder('DESC');
            }}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Clear
          </button>
        </div>

        {/* Audit-specific filters */}
        {(selectedReport === 'audit' || selectedReport === 'login_audit') && (
          <div className="flex gap-3 items-end flex-wrap bg-white border border-gray-200 rounded-xl p-4 mt-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Search Audit Logs</label>
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search by user, action, table, or record ID..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Action Type</label>
              <select
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="RESTORE">Restore</option>
                <option value="UPDATE_STATUS">Status Change</option>
                <option value="BULK_UPDATE">Bulk Update</option>
                <option value="BULK_DELETE">Bulk Delete</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sort By</label>
              <select
                value={auditSort}
                onChange={(e) => setAuditSort(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="timestamp">Timestamp</option>
                <option value="action">Action</option>
                <option value="table_name">Table</option>
                <option value="user_id">User</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Order</label>
              <select
                value={auditOrder}
                onChange={(e) => setAuditOrder(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="DESC">Newest First</option>
                <option value="ASC">Oldest First</option>
              </select>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonKpiCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard label="Total Items" value={totalItems} />
            <KpiCard label="Total Issued" value={totalIssued} />
            <KpiCard label="Total Returned" value={totalReturned} />
            <KpiCard
              label="Total Value"
              value={`â‚±${totalValue.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`}
            />
          </div>
        )}

        {/* Tabbed analytics charts */}
        {analyticsLoading ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SkeletonChart />
              <SkeletonChart />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <SkeletonChart />
            </div>
          </>
        ) : activeTab === 'inventory' ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Stock Status Distribution</h3>
                {tabCharts.stockStatusChart.labels.length > 0 ? (
                  <div style={{ height: 280 }} className="flex items-center justify-center gap-4">
                    <div className="flex-1 h-full min-w-0">
                      <Doughnut data={tabCharts.stockStatusChart} options={doughnutChartOptions('bottom', false)} />
                    </div>
                    <DoughnutPercentageLegend
                      labels={tabCharts.stockStatusChart.labels}
                      data={tabCharts.stockStatusChart.datasets[0].data}
                      colors={tabCharts.stockStatusChart.datasets[0].backgroundColor}
                    />
                  </div>
                ) : emptyDoughnut('No inventory data')}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Inventory by Category</h3>
                {tabCharts.categoryChart.labels.length > 0 ? (
                  <div style={{ height: 280 }} className="flex items-center justify-center gap-4">
                    <div className="flex-1 h-full min-w-0">
                      <Doughnut data={tabCharts.categoryChart} options={doughnutChartOptions('right', false)} />
                    </div>
                    <DoughnutPercentageLegend
                      labels={tabCharts.categoryChart.labels}
                      data={tabCharts.categoryChart.datasets[0].data}
                      colors={tabCharts.categoryChart.datasets[0].backgroundColor}
                    />
                  </div>
                ) : emptyDoughnut('No category data')}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Division Inventory Summary</h3>
              {tabCharts.divisionDetailsChart.labels.length > 0 ? (
                <div style={{ height: 300 }}>
                  <Bar data={tabCharts.divisionDetailsChart} options={divisionSummaryOptions} />
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No division data</p>
              )}
            </div>
          </>
        ) : activeTab === 'borrowing' ? (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Division Consumption Analytics
              </h3>
              {tabCharts.divisionConsumption.labels.length > 0 ? (
                <div style={{ height: 320 }}>
                  <Bar data={tabCharts.divisionConsumption} options={barChartOptions()} />
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center" style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No borrow transactions</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Monthly Consumption Trend by Division
                {dateRange.from || dateRange.to ? ` (${dateRange.from || 'start'} to ${dateRange.to || 'today'})` : ''}
              </h3>
              {tabCharts.monthlyTrend.labels.length > 0 ? (
                <div style={{ height: 280 }}>
                  <Line data={tabCharts.monthlyTrend} options={barChartOptions()} />
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center" style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No trend data</p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Items by Issuance</h3>
                <div className="space-y-3">
                  {topItems.length === 0 ? (
                    <p className="text-sm text-gray-400">No transaction data available</p>
                  ) : (
                    topItems.map(([item, count]) => {
                      const maxCount = Math.max(...topItems.map((i) => i[1]), 1);
                      const pct = (count / maxCount) * 100;
                      return (
                        <div key={item}>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs text-gray-600 truncate">{item}</span>
                            <span className="text-xs font-medium text-gray-800">{count}</span>
                          </div>
                          <div className="h-6 bg-gray-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Consumption Details</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Item', 'Category', 'Opening', 'Issued', 'Returned', 'Closing', 'Value'].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {consumption.map((item, idx) => (
                        <tr key={`${item.item_name}-${idx}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {item.item_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{item.category}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {item.opening} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {item.issued} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {item.returned} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {item.closing} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-800">
                            â‚±
                            {item.value.toLocaleString('en-PH', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Requisition Analytics</h3>
                {tabCharts.requisitionChart.labels.length > 0 ? (
                  <div style={{ height: 280 }}>
                    <Bar data={tabCharts.requisitionChart} options={barChartOptions()} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center" style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No requisition data</p>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Procurement Status Distribution</h3>
                {procurementStatusChart.labels.length > 0 ? (
                  <div style={{ height: 280 }} className="flex items-center justify-center gap-4">
                    <div className="flex-1 h-full min-w-0">
                      <Doughnut data={procurementStatusChart} options={doughnutChartOptions('bottom', false)} />
                    </div>
                    <DoughnutPercentageLegend
                      labels={procurementStatusChart.labels}
                      data={procurementStatusChart.datasets[0].data}
                      colors={procurementStatusChart.datasets[0].backgroundColor}
                    />
                  </div>
                ) : emptyDoughnut('No procurement data')}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Predicted Maximum Requests per Division</h3>
              <p className="text-xs text-gray-400 mb-4">
                Estimated request volume for the next month based on the last 6 months of requisitions and borrow requests.
              </p>
              {requestForecastChart.labels.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">No request history yet</p>
              ) : (
                <div style={{ height: 300 }}>
                  <Bar data={requestForecastChart} options={barChartOptions()} />
                </div>
              )}
              {forecastRows.length > 0 && (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400">
                        <th className="py-2 pr-4">Division</th>
                        <th className="py-2 pr-4">Historical Requests (6 mo.)</th>
                        <th className="py-2 pr-4">Average / Month</th>
                        <th className="py-2 pr-4">Predicted Max (next month)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {forecastRows.map((row) => (
                        <tr key={row.division}>
                          <td className="py-2 pr-4 text-gray-700">{row.division}</td>
                          <td className="py-2 pr-4 text-gray-600">{row.total_requests}</td>
                          <td className="py-2 pr-4 text-gray-600">{Number(row.historical_avg || 0).toFixed(1)}</td>
                          <td className="py-2 pr-4 font-semibold text-orange-600">{row.predicted_max}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Requested vs Received per Item</h3>
              {procurementQtyChart.labels.length > 0 ? (
                <div style={{ height: 300 }}>
                  <Bar data={procurementQtyChart} options={barChartOptions()} />
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No procurement items</p>
              )}
            </div>
          </>
        )}

        {/* Dynamic Report Table Card */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                {reportTitle} as of {new Date().toLocaleDateString('en-PH')}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {reportLoading
                  ? 'Refreshing data...'
                  : `${reportRows.length} result${reportRows.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchReport(true)}
              disabled={reportLoading}
              className="px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50"
            >
              Refresh report
            </button>
          </div>
          <div className="overflow-x-auto">
            {reportLoading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading report data...</div>
            ) : reportRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No results match the selected filters.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {Object.keys(reportRows[0]).map((column) => (
                      <th
                        key={column}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {column.replaceAll('_', ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pagedReportRows.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      {Object.keys(reportRows[0]).map((column) => {
                        const val = row[column];
                        let formattedVal = val ?? 'â€”';
                        if (selectedReport === 'audit' && (column === 'Previous Value' || column === 'New Value')) {
                          formattedVal = formatAuditValue(val, categories, divisions);
                        } else if (column === 'Unit Cost' && typeof val === 'number') {
                          formattedVal = val.toFixed(2);
                        } else if (
                          column === 'Unit Cost' &&
                          !isNaN(Number(val)) &&
                          val !== null &&
                          val !== ''
                        ) {
                          formattedVal = Number(val).toFixed(2);
                        } else if (typeof formattedVal === 'object' && formattedVal !== null) {
                          formattedVal = JSON.stringify(formattedVal);
                        }
                        const isAuditCell = selectedReport === 'audit' && (column === 'Previous Value' || column === 'New Value');
                        return (
                          <td
                            key={column}
                            onClick={isAuditCell && formattedVal !== 'â€”' ? (e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setExpandedCell({ text: String(formattedVal), x: rect.left, y: rect.bottom + 4 });
                            } : undefined}
                            className={`px-4 py-3 text-sm text-gray-700 ${isAuditCell ? 'max-w-[280px] truncate' : 'whitespace-nowrap'} ${isAuditCell && formattedVal !== 'â€”' ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                          >
                            {formattedVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Pagination
            page={reportCurrentPage}
            pageSize={reportPageSize}
            total={reportRows.length}
            onPageChange={setReportPage}
          />
        </div>
    </div>
    {expandedCell && (
      <div className="fixed inset-0 z-50" onClick={() => setExpandedCell(null)}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute max-w-lg p-4 bg-white border border-gray-200 rounded-lg shadow-xl whitespace-normal break-words text-sm text-gray-700"
          style={{ left: Math.min(expandedCell.x, window.innerWidth - 420), top: expandedCell.y, maxHeight: '60vh', overflowY: 'auto' }}
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-medium text-gray-400 uppercase">Full Details</span>
            <button onClick={() => setExpandedCell(null)} className="text-gray-400 hover:text-gray-600 ml-4 text-lg leading-none">&times;</button>
          </div>
          {expandedCell.text}
        </div>
      </div>
    )}
    </>
  );
}
