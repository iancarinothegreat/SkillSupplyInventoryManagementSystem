'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const adminNav = [
  { href: '/dashboard', label: 'Dashboard', icon: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )},
  { href: '/inventory', label: 'Inventory', icon: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
    </svg>
  )},
  { href: '/transactions', label: 'Transactions', icon: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M8 7h12m0 0l-4-4m4 4l-4 4M4 17h12M4 17l4 4M4 17l4-4"/>
    </svg>
  )},
  { href: '/requisitions', label: 'Requisitions', icon: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
    </svg>
  )},
  { href: '/reports', label: 'Reports', icon: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
    </svg>
  )},
  { href: '/forecast', label: 'Forecasting', icon: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )},
];

const adminOnly = [
  { href: '/users', label: 'Users', icon: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  )},
];

const staffNav = [
  { href: '/my-requisitions', label: 'My Requisitions', icon: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
    </svg>
  )},
];

function getStoredUser() {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem('user');
  const token = localStorage.getItem('token');
  if (!stored || !token) return null;

  try {
    return JSON.parse(stored);
  } catch {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return null;
  }
}

function NavItem({ href, label, icon, isActive, collapsed }) {
  return (
    <div className="relative group/navitem">
      <Link
        href={href}
        className={`flex items-center rounded-lg text-sm transition-colors
          ${collapsed ? 'w-10 h-10 justify-center' : 'gap-3 px-3 py-2'}
          ${isActive
            ? 'bg-[#2a4e7a] text-white font-medium'
            : 'text-[#b8cfe5] hover:bg-[#234b73] hover:text-white'}`}
      >
        {icon}
      {!collapsed && <span className="truncate">{label}</span>}
        {collapsed && (
          <span className="absolute -top-2 left-full ml-2 translate-y-[-8px] pointer-events-none whitespace-nowrap bg-[#15304f] text-white text-xs font-medium px-2.5 py-1.5 rounded-md shadow-lg z-[999] opacity-0 group-hover/navitem:opacity-100 transition-opacity duration-100">
            {label}
          </span>
        )}
      </Link>
      {collapsed && (
        <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-[999]
          bg-[#15304f] text-white text-xs font-medium px-2.5 py-1.5 rounded-md whitespace-nowrap shadow-lg
          opacity-0 group-hover/navitem:opacity-100 transition-opacity duration-100">
          {label}
          <span className="absolute top-1/2 right-full -translate-y-1/2 border-4 border-transparent border-r-[#15304f]" />
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationCount, setNotificationCount] = useState(0);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutAnimating, setLogoutAnimating] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [allInventory, setAllInventory] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [overdueReturns, setOverdueReturns] = useState([]);
  const searchInputRef = useRef(null);
  const searchDropdownRef = useRef(null);
  const notificationRef = useRef(null);

  const getLowStockCount = useCallback((items) => {
    return items.filter((item) => {
      const quantity = Number(item.quantity_on_hand ?? item.quantity ?? item.qty ?? 0);
      const reorderLevel = Number(item.reorder_level ?? item.reorder_point ?? 10);
      return quantity <= reorderLevel;
    }).length;
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      const storedUser = getStoredUser();
      setUser(storedUser);
      setCollapsed(localStorage.getItem('sidebar_collapsed') === 'true');
      setCheckingAuth(false);

      if (!storedUser) {
        router.push('/login');
      }
    });
  }, [router]);

  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'user') {
        try {
          const updated = JSON.parse(e.newValue);
          setUser(updated);
        } catch {}
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const querySearch = searchParams?.get('search') || '';
    queueMicrotask(() => setSearchQuery(querySearch));
  }, [pathname, searchParams]);

  useEffect(() => {
    async function fetchInventoryAndNotifications() {
      if (!user) return;

      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const [invRes, txRes] = await Promise.all([
          fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/transactions', { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (invRes.ok) {
          const invData = await invRes.json().catch(() => []);
          const items = Array.isArray(invData) ? invData : (invData.items || []);
          setAllInventory(items);

          // Calculate low stock items
          const lowStock = items.filter((item) => {
            const quantity = Number(item.quantity_on_hand ?? item.quantity ?? item.qty ?? 0);
            const reorderLevel = Number(item.reorder_level ?? item.reorder_point ?? 10);
            return quantity <= reorderLevel;
          });
          setLowStockItems(lowStock);
          setNotificationCount(lowStock.length);
        }

        if (txRes.ok) {
          const txData = await txRes.json().catch(() => []);
          const transactions = Array.isArray(txData) ? txData : (txData.transactions || []);

          const now = new Date();
          const overdue = transactions.filter(tx => {
            if (tx.status !== 'Borrowed') return false;
            const borrowed = new Date(tx.borrow_date || tx.created_at);
            const diffDays = (now - borrowed) / (1000 * 60 * 60 * 24);
            return diffDays > 7;
          });
          setOverdueReturns(overdue);
        }
      } catch (err) {
        console.error('Failed to fetch inventory/transactions', err);
      }
    }

    fetchInventoryAndNotifications();

    function onInventoryUpdated() { fetchInventoryAndNotifications(); }
    window.addEventListener('inventory-updated', onInventoryUpdated);
    return () => window.removeEventListener('inventory-updated', onInventoryUpdated);
  }, [user]);

  // Handle search results
  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const results = allInventory.filter(item => {
        const name = (item.item_name ?? item.name ?? '').toLowerCase();
        const category = (item.category_name ?? item.category ?? '').toLowerCase();
        return name.includes(query) || category.includes(query);
      }).slice(0, 10);
      setSearchResults(results);
      setShowSearchDropdown(true);
    } else {
      setSearchResults([]);
      setShowSearchDropdown(false);
    }
  }, [searchQuery, allInventory]);

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target) && !searchInputRef.current?.contains(e.target)) {
        setShowSearchDropdown(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(e.target)) {
        setShowNotificationDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const handleTopSearchChange = useCallback((value) => {
    setSearchQuery(value);
  }, []);

  const handleLogoutRequest = useCallback(() => {
    setShowLogoutConfirm(true);
  }, []);

  const handleLogoutConfirm = useCallback(() => {
    setLoggingOut(true);
    setLogoutAnimating(true);
    setTimeout(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      router.push('/login');
    }, 900);
  }, [router]);

  const handleLogoutCancel = useCallback(() => {
    setLogoutAnimating(false);
    setShowLogoutConfirm(false);
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  if (checkingAuth || !user) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-sm text-gray-500">Loading...</div>
    </div>
  );

  const isAdmin = user.hierarchy_level >= 2;
  const nav = isAdmin ? adminNav : staffNav;
  const extra = user.hierarchy_level === 3 ? adminOnly : [];
  const allNav = [...nav, ...extra];

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      {/* Sidebar — no scrollbar at all */}
      <aside
        style={{ width: collapsed ? '56px' : '208px', transition: 'width 200ms ease' }}
        className="bg-[#1a3a5c] flex flex-col flex-shrink-0 overflow-hidden"
      >
        {/* Header */}
        <div
          className="h-12 border-b border-[#2a4e7a] flex items-center flex-shrink-0"
          style={{ padding: collapsed ? '0 8px' : '0 12px', justifyContent: collapsed ? 'center' : 'space-between' }}
        >
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Image
                src="/mmtvtc-logo.png"
                alt="MMTVTC"
                width={32}
                height={32}
                className="w-8 h-8 flex-shrink-0 rounded-full ring-2 ring-white/15"
              />
              <div className="min-w-0">
                <div className="text-white text-sm font-semibold leading-tight">SkillSupply</div>
                <div className="text-[#8fb3d4] text-xs leading-tight">MMTVTC</div>
              </div>
            </div>
          )}
          <button
            onClick={toggleCollapse}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-[#8fb3d4] hover:bg-[#234b73] hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
          </button>
        </div>

        {/* Nav — scrollable but scrollbar hidden via CSS */}
        <nav
          className="flex-1 space-y-0.5"
          style={{
            padding: collapsed ? '8px 8px' : '8px 10px',
            overflowY: 'auto',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
          }}
        >
          {nav.map(item => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={pathname === item.href}
              collapsed={collapsed}
            />
          ))}
          {extra.length > 0 && (
            <>
              <div className={`pt-2 pb-1 ${collapsed ? 'flex justify-center' : ''}`}>
                {collapsed
                  ? <div className="w-6 border-t border-[#2a4e7a]" />
                  : <div className="text-xs text-[#8fb3d4] px-3 uppercase tracking-wider">Admin</div>
                }
              </div>
              {extra.map(item => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={pathname === item.href}
                  collapsed={collapsed}
                />
              ))}
            </>
          )}
        </nav>

        {/* User footer */}
        <div
          className="border-t border-[#2a4e7a] flex-shrink-0"
          style={{ padding: collapsed ? '8px' : '12px' }}
        >
          {collapsed ? (
            <div className="flex justify-center">
              <button
                onClick={handleLogoutRequest}
                className="w-8 h-8 rounded-full bg-[#8fb3d4] flex items-center justify-center text-[#1a3a5c] text-xs font-bold hover:opacity-80 transition-opacity"
                title={`${user.full_name} — Click to log out`}
              >
                {user.full_name?.charAt(0).toUpperCase()}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-[#8fb3d4] flex items-center justify-center text-[#1a3a5c] text-xs font-bold flex-shrink-0">
                  {user.full_name?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-white text-xs font-medium truncate">{user.full_name}</div>
                  <div className="text-[#8fb3d4] text-xs truncate">{user.role_name}</div>
                </div>
              </div>
              <button
                onClick={handleLogoutRequest}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-[#8fb3d4] hover:bg-[#234b73] hover:text-white transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
                Log out
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 h-12 flex items-center justify-between flex-shrink-0">
          <h1 className="text-sm font-semibold text-gray-800">
            {allNav.find(n => n.href === pathname)?.label || 'SkillSupply'}
          </h1>
          <div className="flex items-center gap-3">
            {/* Search Dropdown */}
            <div className="relative" ref={searchDropdownRef}>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => handleTopSearchChange(e.target.value)}
                onFocus={() => searchQuery.trim() && setShowSearchDropdown(true)}
                placeholder="Search items..."
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:border-gray-300"
              />
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                  {searchResults.map((item) => (
                    <div
                      key={item.id ?? item.item_id}
                      onClick={() => {
                        setShowSearchDropdown(false);
                        // Could navigate to item detail here
                      }}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <div className="text-xs font-medium text-gray-900">{item.item_name ?? item.name}</div>
                      <div className="text-xs text-gray-500">{(item.category_name ?? item.category) || 'Uncategorized'} · {item.unit || 'unit'}</div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-gray-600">Qty: {item.quantity_on_hand ?? item.quantity ?? 0}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          (item.quantity_on_hand ?? item.quantity ?? 0) <= (item.reorder_level ?? item.reorder_point ?? 10)
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {(item.quantity_on_hand ?? item.quantity ?? 0) <= (item.reorder_level ?? item.reorder_point ?? 10) ? 'LOW' : 'SUFFICIENT'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notification Bell with Dropdown */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                type="button"
                className="relative w-8 h-8 border border-gray-200 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-50"
                aria-label="Notifications"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-medium leading-none text-white bg-red-600 rounded-full border border-white">
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </span>
                )}
              </button>

              {showNotificationDropdown && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                  <div className="p-4 border-b border-gray-100 sticky top-0 bg-white">
                    <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                    <p className="text-xs text-red-600">{notificationCount + overdueReturns.length} alert{notificationCount + overdueReturns.length === 1 ? '' : 's'}</p>
                  </div>

                  {/* Stock Alerts */}
                  {lowStockItems.length > 0 && (
                    <div className="border-b border-gray-100">
                      <div className="px-4 py-3 bg-yellow-50 sticky top-12">
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">⚠️ STOCK ALERTS ({lowStockItems.length})</h4>
                      </div>
                      <div>
                        {lowStockItems.map((item) => (
                          <div key={item.id ?? item.item_id} className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                            <div className="text-xs font-medium text-gray-900">{item.item_name ?? item.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">Qty: {item.quantity_on_hand ?? item.quantity ?? 0} · Reorder at: {item.reorder_level ?? item.reorder_point ?? 10}</div>
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-xs text-gray-500">{(item.category_name ?? item.category) || 'Uncategorized'}</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">LOW</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Overdue Returns */}
                  {overdueReturns.length > 0 && (
                    <div>
                      <div className="px-4 py-3 bg-red-50 sticky top-12">
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">🔴 OVERDUE RETURNS ({overdueReturns.length})</h4>
                      </div>
                      <div>
                        {overdueReturns.map((tx) => (
                          <div key={tx.id ?? tx.transaction_id} className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                            <div className="text-xs font-medium text-gray-900">{tx.item_name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{tx.borrower_name} · Due {new Date(tx.borrow_date || tx.created_at).toLocaleDateString()}</div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 mt-1">OVERDUE</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {lowStockItems.length === 0 && overdueReturns.length === 0 && (
                    <div className="px-4 py-8 text-center">
                      <p className="text-xs text-gray-500">No alerts or notifications</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300 ${
            logoutAnimating ? 'bg-black/70 backdrop-blur-md' : 'bg-black/40 backdrop-blur-[2px]'
          }`}
        >
          <div
            className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden transition-all duration-300 ${
              logoutAnimating ? 'scale-95 opacity-0 translate-y-4' : 'scale-100 opacity-100 translate-y-0'
            }`}
          >
            <div className="p-8 text-center">
              <div className="relative w-16 h-16 mx-auto mb-5">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/30" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-red-500 to-rose-600 animate-ping opacity-20" />
                <div className="absolute inset-0 flex items-center justify-center">
                  {loggingOut ? (
                    <svg className="w-7 h-7 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                    </svg>
                  )}
                </div>
              </div>

              <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                {loggingOut ? 'Logging out...' : 'Log out?'}
              </h3>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                {loggingOut
                  ? `Signing out ${user?.full_name} safely. Hang tight!`
                  : `Are you sure you want to sign out of your account, <span className="font-semibold text-gray-700">${user?.full_name}</span>?`}
              </p>
            </div>

            {!loggingOut && (
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={handleLogoutCancel}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogoutConfirm}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-rose-600 rounded-xl hover:from-red-600 hover:to-rose-700 transition-all shadow-lg shadow-red-500/25"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
