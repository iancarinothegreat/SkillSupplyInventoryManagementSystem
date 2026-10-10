'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Layout from '../../components/Layout';
import KpiCard from '../../components/KpiCard';

const ROLES = [
  { value: '1', label: 'Division Staff' },
  { value: '2', label: 'Supply Officer' },
  { value: '3', label: 'Administrator' },
];

const roleMap = { 1: 'Division Staff', 2: 'Supply Officer', 3: 'Administrator' };
const FULL_NAME_CHARACTERS_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿñÑ '.\\-]*$/;
const ADMIN_DIVISION_NAME = 'administrative';

function isAdministrativeDivision(division) {
  return String(division?.division_name ?? '').trim().toLowerCase() === ADMIN_DIVISION_NAME;
}

function rolesForDivision(divisionId, divisions) {
  const division = divisions.find((d) => String(d.id ?? d.division_id) === String(divisionId));
  if (isAdministrativeDivision(division)) return ROLES;
  return ROLES.filter((r) => r.value === '1');
}

function formatFullName(value) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

const roleBadge = (roleId) => {
  const map = {
    1: 'bg-gray-100 text-gray-700',
    2: 'bg-blue-100 text-blue-700',
    3: 'bg-purple-100 text-purple-700',
  };
  return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[roleId] || 'bg-gray-100 text-gray-700'}`;
};

const STATS_CONFIG = [
  { label: 'Total Users', filter: () => true },
  { label: 'Administrators', filter: (u) => u.role_id === 3 },
  { label: 'Supply Officers', filter: (u) => u.role_id === 2 },
  { label: 'Division Staff', filter: (u) => u.role_id === 1 },
];

const TABLE_HEADERS = ['ID', 'Username', 'Full Name', 'Email', 'Contact', 'Role', 'Division', 'Created', 'Actions'];

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const searchParams = useSearchParams();
  const [form, setForm] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    contact: '',
    role_id: '1',
    division_id: '',
  });
  const [editingUser, setEditingUser] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else if (res.status === 403) {
        setError('Access denied. Administrator role required.');
      }
    } catch (err) {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDivisions = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/divisions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDivisions(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const openEditModal = (user) => {
    setEditingUser(user);
    setForm({
      user_id: user.user_id,
      username: user.username,
      password: '',
      full_name: user.full_name || '',
      email: user.email || '',
      contact: user.contact || '',
      role_id: String(user.role_id),
      division_id: user.division_id || '',
    });
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  useEffect(() => {
    fetchUsers();
    fetchDivisions();
  }, [fetchUsers, fetchDivisions]);

  useEffect(() => {
    const querySearch = searchParams?.get('search') || '';
    setSearch(querySearch);
  }, [searchParams]);

  useEffect(() => {
    function onGlobalSearch(e) {
      const v = String(e?.detail ?? '') || '';
      setSearch(v);
    }
    window.addEventListener('global-search', onGlobalSearch);
    return () => window.removeEventListener('global-search', onGlobalSearch);
  }, []);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const token = sessionStorage.getItem('token');
      const method = editingUser ? 'PUT' : 'POST';
      const res = await fetch('/api/users', {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(editingUser ? `User "${form.username}" updated successfully.` : `User "${form.username}" created successfully.`);
        setShowModal(false);
        setEditingUser(null);
        setForm({ username: '', password: '', full_name: '', email: '', contact: '', role_id: '1', division_id: '' });
        fetchUsers();
      } else {
        setError(data.message || data.error || 'Failed to save user.');
      }
    } catch (err) {
      setError('Server error.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (user) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!userToDelete) return;

    setShowDeleteModal(false);
    setDeletingUserId(userToDelete.user_id);
    setError('');
    setSuccess('');

    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userToDelete.user_id }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccess(`User "${userToDelete.username}" was deleted permanently.`);
        fetchUsers();
      } else {
        setError(data.error || 'Failed to delete user.');
      }
    } catch {
      setError('Network error while deleting the user.');
    } finally {
      setDeletingUserId(null);
      setUserToDelete(null);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const divisionRoles = rolesForDivision(form.division_id, divisions);
  const selectedDivision = divisions.find((d) => String(d.id ?? d.division_id) === String(form.division_id));
  const isAdminDivision = isAdministrativeDivision(selectedDivision);
  const currentRole = ROLES.find((r) => r.value === String(form.role_id));
  const visibleRoles = divisionRoles.some((r) => r.value === String(form.role_id))
    ? divisionRoles
    : [...divisionRoles, currentRole].filter(Boolean);

  const handleDivisionChange = (value) => {
    const nextRoles = rolesForDivision(value, divisions);
    const nextRoleId = nextRoles.some((r) => r.value === String(form.role_id)) ? form.role_id : '1';
    setForm({ ...form, division_id: value, role_id: nextRoleId });
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-500 mt-1">Manage system accounts and roles</p>
          </div>
          <button
            onClick={() => { setEditingUser(null); setShowModal(true); setError(''); setSuccess(''); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            + Add User
          </button>
        </div>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={`kpi-skeleton-${i}`} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 min-h-28 flex flex-col justify-between">
                <div className="h-3 bg-gray-200 rounded w-24 animate-pulse" />
                <div className="h-8 bg-gray-200 rounded w-12 animate-pulse" />
              </div>
            ))
          ) : (
            STATS_CONFIG.map((s) => (
              <KpiCard key={s.label} label={s.label} value={users.filter(s.filter).length} />
            ))
          )}
        </div>

        {/* Search */}
        <div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username, name, or email..."
            className="w-full sm:max-w-sm border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {TABLE_HEADERS.map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...Array(5)].map((_, i) => (
                    <tr key={`skeleton-${i}`}>
                      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8 animate-pulse" /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gray-200 animate-pulse" />
                          <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
                        </div>
                      </td>
                      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-32 animate-pulse" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-40 animate-pulse" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-24 animate-pulse" /></td>
                      <td className="px-4 py-3"><div className="h-5 bg-gray-200 rounded-full w-20 animate-pulse" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-28 animate-pulse" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-20 animate-pulse" /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-4 bg-gray-200 rounded w-10 animate-pulse" />
                          <div className="h-4 bg-gray-200 rounded w-12 animate-pulse" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {TABLE_HEADERS.map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredUsers.map((u, idx) => (
                    <tr key={u.user_id ?? `user-${idx}`} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-sm text-gray-400">#{u.user_id}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold uppercase">
                            {u.username?.[0]}
                          </div>
                          {u.username}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{u.full_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{u.email || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{u.contact || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={roleBadge(u.role_id)}>{roleMap[u.role_id] || `Role ${u.role_id}`}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{u.division_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => openEditModal(u)}
                            className="text-blue-600 hover:text-blue-800 font-medium text-xs uppercase tracking-wide"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClick(u)}
                            disabled={deletingUserId === u.user_id}
                            className="text-red-600 hover:text-red-800 font-medium text-xs uppercase tracking-wide disabled:opacity-50"
                          >
                            {deletingUserId === u.user_id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {/* Add / Edit User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[65vh]">
            <div className="p-6 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">{editingUser ? 'Edit User' : 'Create New User'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 pb-4">
              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password {editingUser ? '(leave blank to keep current)' : '*'}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required={!editingUser}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={editingUser ? 'New password (optional)' : 'Min 8 chars'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-6.94" />
                          <path d="M1 1l22 22" />
                          <path d="M9.9 4.24A12.52 12.52 0 0 1 12 4c7 0 11 8 11 8a21.77 21.77 0 0 1-4.06 5.94" />
                          <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => {
                    if (FULL_NAME_CHARACTERS_PATTERN.test(e.target.value)) {
                      setForm({ ...form, full_name: e.target.value });
                    }
                  }}
                  onBlur={(e) => setForm({ ...form, full_name: formatFullName(e.target.value) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Juan dela Cruz"
                  pattern="[A-Za-zÀ-ÖØ-öø-ÿñÑ '.\\-]+"
                  title="Full name may contain letters, spaces, hyphens, apostrophes, dots, and ñ (e.g., Juan P. Dela Cruz)."
                />
                <p className="mt-1 text-xs text-gray-500">Format: First Name Middle Name Last Name (e.g., Juan Dela Cruz)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="user@mmtvtc.edu.ph"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.contact}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length <= 11) setForm({ ...form, contact: val });
                  }}
                  maxLength={11}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="09171234567"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                  <select
                    required
                    value={form.role_id}
                    onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {visibleRoles.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  {!isAdminDivision && form.division_id !== '' && (
                    <p className="mt-1 text-xs text-gray-500">Only Division Staff is available for this division.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
                  <select
                    value={form.division_id}
                    onChange={(e) => handleDivisionChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {divisions.map((d) => (
                      <option key={d.id ?? d.division_id} value={d.id ?? d.division_id}>{d.division_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </form>
            <div className="flex gap-3 p-6 pt-0 border-t border-gray-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {submitting ? (editingUser ? 'Updating...' : 'Creating...') : (editingUser ? 'Update User' : 'Create User')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6 text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete User Account</h3>
              <p className="text-sm text-gray-500 mb-1">
                Are you sure you want to delete <span className="font-medium text-gray-700">&quot;{userToDelete.username}&quot;</span>?
              </p>
              <p className="text-xs text-gray-400">This will remove the account but preserve historical records.</p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => { setShowDeleteModal(false); setUserToDelete(null); }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
  );
}
