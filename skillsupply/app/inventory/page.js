'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { SkeletonKpiCard, SkeletonTableRow } from '@/components/Skeleton';

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDivision, setFilterDivision] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewItem, setViewItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({
    item_name: '', serial_number: '', category_id: '', division_id: '', unit: '',
    quantity: '', reorder_point: '', unit_price: '', description: '', defective_quantity: '', is_returnable: false, notes: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  function normalizeInventoryItem(item) {
    return {
      ...item,
      id: item.id ?? item.item_id,
      unit: item.unit ?? item.unit_of_measure ?? '',
      quantity: item.quantity ?? item.quantity_on_hand ?? 0,
      reorder_point: item.reorder_point ?? item.reorder_level ?? 0,
      unit_price: item.unit_price ?? item.unit_cost ?? 0,
      serial_number: item.serial_number ?? '',
    };
  }

  function toInventoryPayload(values) {
    return {
      item_name: values.item_name,
      serial_number: values.serial_number || null,
      category_id: values.category_id || null,
      division_id: values.division_id || null,
      unit_of_measure: values.unit,
      quantity_on_hand: values.quantity || 0,
      reorder_level: values.reorder_point || 10,
      defective_quantity: values.defective_quantity || 0,
      is_returnable: values.is_returnable,
      description: values.description || null,
      notes: values.notes || null,
      unit_cost: values.unit_price || 0,
    };
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus('Uploading...');

    try {
      const token = sessionStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const rows = await parseImportFile(file);
      if (rows.length === 0) {
        setImportStatus('No importable rows found in this file.');
        setTimeout(() => setImportStatus(''), 5000);
        return;
      }

      const res = await fetch('/api/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const skipped = data.skippedCount ? ` Skipped ${data.skippedCount} blank or unrecognized row(s).` : '';
        setImportStatus(`Imported ${data.insertedCount} items.${skipped}`);
        setTimeout(() => setImportStatus(''), 5000);
        await fetchItems();
      } else {
        setImportStatus(data.error || 'Import failed');
        setTimeout(() => setImportStatus(''), 5000);
      }
    } catch (err) {
      console.error(err);
      setImportStatus('Import error');
      setTimeout(() => setImportStatus(''), 5000);
    } finally {
      // reset so selecting same file again triggers onChange
      if (e.target) e.target.value = '';
    }
  }

  async function parseImportFile(file) {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];

    const worksheet = workbook.Sheets[sheetName];
    const table = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    });

    const rows = table
      .map((row) => row.map((cell) => String(cell ?? '').trim()))
      .filter((row) => row.some(Boolean));

    if (rows.length === 0) return [];

    const headerIndex = findHeaderRowIndex(rows);
    const headers = rows[headerIndex].map((header, index) => header || `Column ${index + 1}`);

    return rows.slice(headerIndex + 1).map((cells, index) => {
      const row = {
        __rowNumber: headerIndex + index + 2,
        __headers: headers,
        __cells: cells,
      };

      headers.forEach((header, cellIndex) => {
        row[header] = cells[cellIndex] ?? '';
      });

      return row;
    });
  }

  function findHeaderRowIndex(rows) {
    const knownHeaders = [
      'item', 'item name', 'name', 'description', 'general description',
      'unit', 'units', 'uom', 'qty', 'quantity', 'stock',
      'unit price', 'price', 'cost', 'reorder', 'category', 'division'
    ];

    let bestIndex = 0;
    let bestScore = -1;
    const scanLimit = Math.min(rows.length, 10);

    for (let i = 0; i < scanLimit; i++) {
      const normalized = rows[i].map((cell) => cell.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
      const score = normalized.reduce((total, cell) => (
        total + (knownHeaders.some((header) => cell === header || cell.includes(header)) ? 1 : 0)
      ), 0);

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  const searchParams = useSearchParams();

  useEffect(() => {
    fetchItems();
    fetchCategories();
    fetchDivisions();
  }, []);

  useEffect(() => {
    const querySearch = searchParams?.get('search') || '';
    setSearch(querySearch);
  }, [searchParams]);

  async function fetchItems() {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/inventory', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        const inventoryItems = Array.isArray(data) ? data : data.items || [];
        setItems(inventoryItems.map(normalizeInventoryItem));
        // notify layout that inventory changed (so notifications can refresh)
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('inventory-updated'));
      }
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => {
    function onGlobalSearch(e) {
      const v = String(e?.detail ?? '') || '';
      setSearch(v);
    }
    window.addEventListener('global-search', onGlobalSearch);
    return () => window.removeEventListener('global-search', onGlobalSearch);
  }, []);

  async function fetchCategories() {
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/categories', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setCategories(Array.isArray(data) ? data : data.categories || []);
    } catch {}
  }

  async function fetchDivisions() {
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/divisions', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setDivisions(Array.isArray(data) ? data : data.divisions || []);
    } catch {}
  }

  function openAdd() {
    setEditItem(null);
    setForm({ item_name: '', serial_number: '', category_id: '', division_id: '', unit: '', quantity: '', reorder_point: '', unit_price: '', description: '', defective_quantity: '', is_returnable: false, notes: '' });
    setError('');
    setShowModal(true);
  }

  function openEdit(item) {
    setEditItem(item);
    setForm({
      item_name: item.item_name ?? '',
      serial_number: item.serial_number ?? '',
      category_id: item.category_id ?? '',
      division_id: item.division_id ?? '',
      unit: item.unit ?? '',
      quantity: item.quantity ?? '',
      reorder_point: item.reorder_point ?? '',
      unit_price: item.unit_price ?? '',
      description: item.description ?? '',
      defective_quantity: item.defective_qty ?? item.defective_quantity ?? '',
      is_returnable: item.is_returnable ?? item.returnable ?? false,
      notes: item.notes ?? ''
    });
    setError('');
    setShowModal(true);
  }

  function openView(item) {
    setViewItem(item);
    setShowViewModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const token = sessionStorage.getItem('token');
    const url = editItem ? `/api/inventory/${editItem.id}` : '/api/inventory';
    const method = editItem ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(toInventoryPayload(form))
      });
      const data = await res.json();
      if (res.ok) {
        setShowModal(false);
        setSuccess(editItem ? 'Item updated successfully.' : 'Item added successfully.');
        setTimeout(() => setSuccess(''), 5000);
        fetchItems();
      } else {
        setError(data.error || 'Failed to save');
        setTimeout(() => setError(''), 5000);
      }
    } catch {
      setError('Network error');
      setTimeout(() => setError(''), 5000);
    }
  }

  function handleDelete(id, itemName) {
    setConfirmDialog({
      title: 'Delete Inventory Item',
      message: `Are you sure you want to delete “${itemName}”? This action cannot be undone.`,
      confirmLabel: 'Yes, delete item',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null);
        const token = sessionStorage.getItem('token');
        try {
          const res = await fetch(`/api/inventory/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            setSuccess('Item deleted successfully.');
            setTimeout(() => setSuccess(''), 5000);
            fetchItems();
          } else {
            setError('Failed to delete item.');
            setTimeout(() => setError(''), 5000);
          }
        } catch {
          setError('Network error while deleting item.');
          setTimeout(() => setError(''), 5000);
        }
      }
    });
  }

  function getStockStatus(item) {
    const qty = parseInt(item.quantity || 0);
    const reorder = parseInt(item.reorder_point || 0);
    if (qty === 0) return { label: 'Out of Stock', color: 'bg-red-100 text-red-700', bar: 'bg-red-500', pct: 0 };
    if (qty <= reorder) return { label: 'Critical', color: 'bg-red-100 text-red-600', bar: 'bg-red-500', pct: Math.min((qty / (reorder * 2)) * 100, 100) };
    if (qty <= reorder * 1.5) return { label: 'Low', color: 'bg-yellow-100 text-yellow-700', bar: 'bg-yellow-400', pct: Math.min((qty / (reorder * 3)) * 100, 100) };
    return { label: 'Sufficient', color: 'bg-green-100 text-green-700', bar: 'bg-green-500', pct: 100 };
  }

  async function handleSetNonReturnable() {
    setConfirmDialog({
      title: 'Set All Non-Returnable',
      message: 'Set all items as Non-Returnable? This will update every item in inventory.',
      confirmLabel: 'Yes, set all',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmDialog(null);
        const token = sessionStorage.getItem('token');
        try {
          const res = await fetch('/api/inventory/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: 'set_non_returnable' }),
          });
          if (res.ok) {
            setSuccess('All items set to non-returnable.');
            setTimeout(() => setSuccess(''), 5000);
            fetchItems();
          }
        } catch { }
      }
    });
  }

  async function handleDeleteAll() {
    setConfirmDialog({
      title: 'Delete All Items',
      message: 'Are you sure you want to delete ALL items? This action cannot be undone.',
      confirmLabel: 'Yes, delete all',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null);
        const token = sessionStorage.getItem('token');
        try {
          const res = await fetch('/api/inventory/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: 'delete_all' }),
          });
          if (res.ok) {
            setSuccess('All items deleted.');
            setTimeout(() => setSuccess(''), 5000);
            fetchItems();
          }
        } catch { }
      }
    });
  }

  const filtered = items.filter(item => {
    const matchSearch = item.item_name?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory ? String(item.category_id) === String(filterCategory) : true;
    const matchDiv = filterDivision ? String(item.division_id) === String(filterDivision) : true;
    return matchSearch && matchCat && matchDiv;
  });

  const totalItems = items.length;
  const showingItems = filtered.length;
  const criticalStock = items.filter((it) => {
    const qty = parseInt(it.quantity || it.quantity_on_hand || 0);
    const reorder = parseInt(it.reorder_point || it.reorder_level || 0);
    return qty <= reorder && qty > 0;
  }).length;
  const estValue = items.reduce((sum, it) => {
    const q = parseFloat(it.quantity || it.quantity_on_hand || 0) || 0;
    const p = parseFloat(it.unit_price || it.unit_cost || 0) || 0;
    return sum + q * p;
  }, 0);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Inventory Management</h1>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonKpiCard key={i} />)
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 min-h-28 flex flex-col justify-between">
                <p className="text-xs font-semibold text-[#8a96ab] uppercase tracking-[0.14em] leading-5">Total Items</p>
                <p className="text-3xl font-bold text-[#1f2d42] leading-none">{totalItems}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 min-h-28 flex flex-col justify-between">
                <p className="text-xs font-semibold text-[#8a96ab] uppercase tracking-[0.14em] leading-5">Showing</p>
                <p className="text-3xl font-bold text-[#1f2d42] leading-none">{showingItems}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 min-h-28 flex flex-col justify-between">
                <p className="text-xs font-semibold text-[#8a96ab] uppercase tracking-[0.14em] leading-5">Critical Stock</p>
                <p className="text-3xl font-bold text-[#1f2d42] leading-none">{criticalStock}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 min-h-28 flex flex-col justify-between">
                <p className="text-xs font-semibold text-[#8a96ab] uppercase tracking-[0.14em] leading-5">Est. Value</p>
                <p className="text-3xl font-bold text-[#1f2d42] leading-none">₱{estValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative">
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id ?? c.category_id} value={c.id ?? c.category_id}>{c.category_name}</option>)}
          </select>

          <select
            value={filterDivision}
            onChange={e => setFilterDivision(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Divisions</option>
            {divisions.map(d => <option key={d.id ?? d.division_id} value={d.id ?? d.division_id}>{d.division_name}</option>)}
          </select>

          <div className="ml-auto flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelected}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              Import File
            </button>
            <button
              onClick={handleSetNonReturnable}
              className="flex items-center gap-2 border border-orange-300 bg-white text-orange-700 px-4 py-2 rounded-lg text-sm hover:bg-orange-50"
            >
              Set All Non-Returnable
            </button>
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-2 border border-red-300 bg-white text-red-700 px-4 py-2 rounded-lg text-sm hover:bg-red-50"
            >
              Delete All Items
            </button>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              + Add Item
            </button>
          </div>
        </div>

        {importStatus && (
          <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {importStatus}
          </div>
        )}

        {success && (
          <div className="mb-5 rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess('')} className="text-green-500 hover:text-green-700 ml-3">&times;</button>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 ml-3">&times;</button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-20">Item No.</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Item Name</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Category</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Unit</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-48">Stock Level</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Quantity</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Defective Qty</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Total Quantity</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Returnable</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Unit Cost</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Actions</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonTableRow key={i} widths={['w-10', 'w-28', 'w-20', 'w-12', 'w-28', 'w-12', 'w-10', 'w-12', 'w-12', 'w-16', 'w-16', 'w-16']} />
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-10 text-sm text-gray-400">No items found</td></tr>
              ) : (
                filtered.map((item, index) => {
                  const status = getStockStatus(item);
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{item.item_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{item.category_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{item.unit}</td>
                      <td className="px-4 py-3">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${status.bar}`}
                            style={{ width: `${status.pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{parseInt(item.defective_qty ?? item.defectiveQty ?? 0) || 0}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {item.total_quantity ?? ((item.quantity ?? 0) + (parseInt(item.defective_qty ?? item.defectiveQty ?? 0) || 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{(item.is_returnable ?? item.returnable) ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {item.unit_price ? `₱${parseFloat(item.unit_price).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openView(item)}
                            className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="View"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.item_name)}
                            className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-screen overflow-y-auto">
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                {editItem ? 'Edit Item' : 'Add New Item'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Item Name</label>
                  <input type="text" required value={form.item_name}
                    onChange={e => setForm({ ...form, item_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Serial Number</label>
                  <input
                    type="text"
                    value={form.serial_number}
                    onChange={e => setForm({ ...form, serial_number: e.target.value })}
                    placeholder="Enter serial number (optional)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Category</label>
                  <select required value={form.category_id ?? ''}
                    onChange={e => setForm({ ...form, category_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select</option>
                    {categories.map(c => <option key={c.id ?? c.category_id} value={c.id ?? c.category_id}>{c.category_name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Unit</label>
                    <select required value={form.unit}
                      onChange={e => setForm({ ...form, unit: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select unit</option>
                      <option value="pcs">Pieces (pcs)</option>
                      <option value="box">Box</option>
                      <option value="carton">Carton</option>
                      <option value="pack">Pack</option>
                      <option value="set">Set</option>
                      <option value="pair">Pair</option>
                      <option value="roll">Roll</option>
                      <option value="bag">Bag</option>
                      <option value="bottle">Bottle</option>
                      <option value="can">Can</option>
                      <option value="jar">Jar</option>
                      <option value="ream">Ream</option>
                      <option value="liter">Liter</option>
                      <option value="kg">Kilogram (kg)</option>
                      <option value="meter">Meter</option>
                      <option value="ft">Feet (ft)</option>
                      <option value="inch">Inch</option>
                      <option value="gal">Gallon (gal)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Quantity</label>
                    <input type="number" required min="0" value={form.quantity}
                      onChange={e => setForm({ ...form, quantity: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Reorder Point</label>
                    <input type="number" required min="0" value={form.reorder_point}
                      onChange={e => setForm({ ...form, reorder_point: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Unit Price (₱)</label>
                  <input type="number" min="0" step="0.01" value={form.unit_price}
                    onChange={e => setForm({ ...form, unit_price: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Defective Qty</label>
                    <input type="number" min="0" value={form.defective_quantity}
                      onChange={e => setForm({ ...form, defective_quantity: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_returnable}
                        onChange={e => setForm({ ...form, is_returnable: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Returnable
                    </label>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Defective Notes</label>
                  <textarea rows={2} value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Reason or notes for defective quantity (optional)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Description (optional)</label>
                  <textarea rows={2} value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                  <button type="submit"
                    className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                    {editItem ? 'Save Changes' : 'Add Item'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Modal */}
        {showViewModal && viewItem && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Item Details</h2>
              <div className="space-y-3 text-sm">
                {[
                  ['Item Name', viewItem.item_name],
                  ['Serial Number', viewItem.serial_number || '—'],
                  ['Category', viewItem.category_name],
                  ['Division', viewItem.division_name || '—'],
                  ['Unit', viewItem.unit],
                  ['Quantity', `${viewItem.quantity} ${viewItem.unit}`],
                  ['Total Quantity', `${viewItem.total_quantity ?? ((viewItem.quantity ?? 0) + (parseInt(viewItem.defective_qty ?? viewItem.defectiveQty ?? 0) || 0))} ${viewItem.unit}`],
                  ['Reorder Point', viewItem.reorder_point],
                  ['Defective Qty', parseInt(viewItem.defective_qty ?? viewItem.defectiveQty ?? 0) || 0],
                  ['Returnable', (viewItem.is_returnable ?? viewItem.returnable) ? 'Yes' : 'No'],
                  ['Unit Price', viewItem.unit_price ? `₱${parseFloat(viewItem.unit_price).toLocaleString()}` : '—'],
                  ['Defective Notes', viewItem.notes || '—'],
                  ['Description', viewItem.description || '—'],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-gray-500 font-medium">{label}</span>
                    <span className="text-gray-800">{val}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3 mt-5">
                <button onClick={() => { setShowViewModal(false); openEdit(viewItem); }}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                  Edit
                </button>
                <button onClick={() => setShowViewModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmDialog && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-2">{confirmDialog.title}</h2>
              <p className="text-sm text-gray-600 mb-5">{confirmDialog.message}</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={confirmDialog.onConfirm}
                  className={`px-4 py-2 text-sm text-white rounded-lg ${
                    confirmDialog.variant === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-orange-500 hover:bg-orange-600'
                  }`}>
                  {confirmDialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
