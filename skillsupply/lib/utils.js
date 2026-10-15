// Shared normalization & formatting utilities

export function normalizeInventoryItem(item) {
  return {
    ...item,
    id: item.id ?? item.item_id,
    unit: item.unit ?? item.unit_of_measure ?? '',
    quantity: item.quantity ?? item.quantity_on_hand ?? 0,
    reorder_point: item.reorder_point ?? item.reorder_level ?? 0,
    unit_price: item.unit_price ?? item.unit_cost ?? 0,
    serial_number: item.serial_number ?? '',
    description: item.description ?? '',
    defective_quantity: item.defective_quantity ?? 0,
    total_quantity: item.total_quantity ??
      (item.quantity ?? item.quantity_on_hand ?? 0) + (item.defective_quantity ?? 0),
    notes: item.notes ?? '',
  };
}

export function getStockStatus(item) {
  const qty = parseInt(item.quantity || 0);
  const reorder = parseInt(item.reorder_point || 0);

  if (qty <= reorder) {
    return {
      label: 'Critical',
      color: 'bg-red-100 text-red-700',
      bar: 'bg-red-500',
      pct: reorder > 0 ? Math.min((qty / (reorder * 2)) * 100, 100) : 0,
    };
  }
  if (qty <= reorder * 1.5) return { label: 'Low', color: 'bg-yellow-100 text-yellow-700', bar: 'bg-yellow-400', pct: Math.min((qty / (reorder * 3)) * 100, 100) };
  return { label: 'Sufficient', color: 'bg-green-100 text-green-700', bar: 'bg-green-500', pct: 100 };
}

export function parseMaxBorrowDays(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export function expectedReturnDateFrom(maxDays, from = new Date()) {
  const days = Number(maxDays) > 0 ? Number(maxDays) : 7;
  const base = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}


export function formatCurrency(value) {
  const num = parseFloat(value) || 0;
  return `₱${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}