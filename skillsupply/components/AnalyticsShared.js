'use client';

export const COLORS = {
  blue: '#3b82f6',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  pink: '#ec4899',
  cyan: '#06b6d4',
  lime: '#84cc16',
  orange: '#f97316',
  indigo: '#6366f1'
};

export const PIE_COLORS = [COLORS.blue, COLORS.green, COLORS.yellow, COLORS.red, COLORS.purple, COLORS.pink, COLORS.cyan, COLORS.lime];

export function formatCurrency(val) {
  return `₱${Number(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function createBarTooltipConfig(unit = '') {
  return {
    callbacks: {
      label: function(context) {
        const label = context.dataset.label || '';
        const value = context.parsed.y ?? context.parsed ?? 0;
        const total = context.chart.data.datasets.reduce((sum, ds) => sum + ds.data.reduce((a, b) => a + b, 0), 0);
        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
        return `${label}: ${value.toLocaleString()}${unit} (${percentage}%)`;
      }
    }
  };
}

export function createDoughnutTooltipConfig() {
  return {
    callbacks: {
      label: function(context) {
        const label = context.label || '';
        const value = context.parsed || 0;
        const total = context.dataset.data.reduce((a, b) => a + b, 0);
        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
        return `${label}: ${value.toLocaleString()} (${percentage}%)`;
      }
    }
  };
}

export function barChartOptions(unit = '') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
      tooltip: createBarTooltipConfig(unit)
    },
    scales: { y: { beginAtZero: true } },
    barPercentage: 0.7,
    categoryPercentage: 0.8
  };
}

export function doughnutChartOptions(position = 'bottom', showLegend = true) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: showLegend, position, labels: { boxWidth: 12, padding: 8, font: { size: 11 } } },
      tooltip: createDoughnutTooltipConfig()
    },
    cutout: '60%'
  };
}

export function DoughnutPercentageLegend({ labels, data, colors }) {
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

/**
 * Builds chartjs datasets from the /api/dashboard/analytics response.
 * Pure: returns an object; callers pick the subsets they render.
 */
export function buildAnalyticsCharts(analytics) {
  const charts = {
    divisionConsumption: { labels: [], datasets: [] },
    divisionDetails: [],
    divisionDetailsChart: { labels: [], datasets: [] },
    monthlyTrend: { labels: [], datasets: [] },
    categoryChart: { labels: [], datasets: [] },
    stockStatusChart: { labels: [], datasets: [] },
    requisitionChart: { labels: [], datasets: [] },
  };

  // Division consumption
  if (analytics.divisionConsumption && analytics.divisionConsumption.length > 0) {
    charts.divisionConsumption = {
      labels: analytics.divisionConsumption.map(d => d.division),
      datasets: [
        {
          label: 'Issued',
          data: analytics.divisionConsumption.map(d => d.issued),
          backgroundColor: COLORS.blue,
          borderRadius: 4
        },
        {
          label: 'Returned',
          data: analytics.divisionConsumption.map(d => d.returned),
          backgroundColor: COLORS.green,
          borderRadius: 4
        }
      ]
    };
  }

  // Division details + chart (horizontal, normalized percentages)
  if (analytics.divisionDetails && analytics.divisionDetails.length > 0) {
    charts.divisionDetails = analytics.divisionDetails;
    const maxItems = Math.max(...analytics.divisionDetails.map(d => d.totalItems));
    const maxQty = Math.max(...analytics.divisionDetails.map(d => d.totalQuantity));
    const maxValue = Math.max(...analytics.divisionDetails.map(d => d.totalValue));

    charts.divisionDetailsChart = {
      labels: analytics.divisionDetails.map(d => d.division),
      datasets: [
        {
          label: 'Items',
          data: analytics.divisionDetails.map(d => maxItems > 0 ? Math.round((d.totalItems / maxItems) * 100) : 0),
          backgroundColor: COLORS.blue,
          borderRadius: 4
        },
        {
          label: 'Quantity',
          data: analytics.divisionDetails.map(d => maxQty > 0 ? Math.round((d.totalQuantity / maxQty) * 100) : 0),
          backgroundColor: COLORS.green,
          borderRadius: 4
        },
        {
          label: 'Value',
          data: analytics.divisionDetails.map(d => maxValue > 0 ? Math.round((d.totalValue / maxValue) * 100) : 0),
          backgroundColor: COLORS.purple,
          borderRadius: 4
        }
      ]
    };
  }

  // Monthly trend — per-division lines first, fallback to aggregate
  if (analytics.monthlyTrendByDivision && analytics.monthlyTrendByDivision.length > 0) {
    const rows = analytics.monthlyTrendByDivision;
    const months = [...new Set(rows.map(r => r.month))];
    const divNames = [...new Set(rows.map(r => r.division))];
    const divColors = [COLORS.blue, COLORS.green, COLORS.yellow, COLORS.purple, COLORS.pink, COLORS.cyan, COLORS.orange, COLORS.indigo];

    charts.monthlyTrend = {
      labels: months,
      datasets: divNames.map((name, idx) => ({
        label: name,
        data: months.map(m => {
          const row = rows.find(r => r.month === m && r.division === name);
          return row ? row.issued : 0;
        }),
        borderColor: divColors[idx % divColors.length],
        backgroundColor: `${divColors[idx % divColors.length]}33`,
        fill: false,
        tension: 0.4
      }))
    };
  } else if (analytics.monthlyTrend && analytics.monthlyTrend.length > 0) {
    charts.monthlyTrend = {
      labels: analytics.monthlyTrend.map(d => d.month),
      datasets: [
        {
          label: 'Issued',
          data: analytics.monthlyTrend.map(d => d.issued),
          borderColor: COLORS.blue,
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Returned',
          data: analytics.monthlyTrend.map(d => d.returned),
          borderColor: COLORS.green,
          backgroundColor: 'rgba(16,185,129,0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    };
  }

  // Category breakdown
  if (analytics.categories && analytics.categories.length > 0) {
    charts.categoryChart = {
      labels: analytics.categories.map(d => d.name),
      datasets: [{
        label: 'Items',
        data: analytics.categories.map(d => d.quantity),
        backgroundColor: PIE_COLORS.slice(0, analytics.categories.length),
        borderWidth: 0
      }]
    };
  }

  // Stock status
  if (analytics.stockStatus) {
    const ss = analytics.stockStatus;
    charts.stockStatusChart = {
      labels: ['Critical', 'Low', 'Sufficient'],
      datasets: [{
        data: [
          Number(ss.critical ?? ss.outOfStock ?? 0),
          Number(ss.low ?? ss.lowStock ?? 0),
          Number(ss.sufficient ?? ss.inStock ?? 0)
        ],
        backgroundColor: [COLORS.red, COLORS.yellow, COLORS.green],
        borderWidth: 0
      }]
    };
  }

  // Requisitions by division
  if (analytics.requisitions && analytics.requisitions.length > 0) {
    charts.requisitionChart = {
      labels: analytics.requisitions.map(d => d.division),
      datasets: [
        { label: 'Pending', data: analytics.requisitions.map(d => d.pending), backgroundColor: '#6b7280', borderRadius: 4 },
        { label: 'Approved', data: analytics.requisitions.map(d => d.approved), backgroundColor: COLORS.green, borderRadius: 4 },
        { label: 'Released', data: analytics.requisitions.map(d => d.released), backgroundColor: COLORS.blue, borderRadius: 4 },
        { label: 'Rejected', data: analytics.requisitions.map(d => d.rejected), backgroundColor: COLORS.red, borderRadius: 4 }
      ]
    };
  }

  return charts;
}
