"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import KpiCard from "@/components/KpiCard";
import { SkeletonKpiCard, SkeletonTableRow } from "@/components/Skeleton";

export default function AuditLogsPage() {
  const [loginData, setLoginData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [totals, setTotals] = useState({
    total_logins: 0,
    total_logouts: 0,
    failed_logins: 0,
    unique_users: 0,
    total_events: 0,
  });

  const fetchLoginAudit = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("token");
      const params = new URLSearchParams();
      if (dateRange.from) params.set("from", dateRange.from);
      if (dateRange.to) params.set("to", `${dateRange.to}T23:59:59`);
      const res = await fetch(`/api/dashboard/login-audit?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load audit logs");
      setError("");
      setLoginData(Array.isArray(data) ? data : (data.rows || []));
      setTotals(data.totals || {
        total_logins: 0,
        total_logouts: 0,
        failed_logins: 0,
        unique_users: 0,
        total_events: 0,
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchLoginAudit();
    const refreshTimer = setInterval(fetchLoginAudit, 5000);
    return () => clearInterval(refreshTimer);
  }, [fetchLoginAudit]);

  const totalLogins = Number(totals.total_logins) || 0;
  const failedLogins = Number(totals.failed_logins) || 0;
  const totalLogouts = Number(totals.total_logouts) || 0;
  const uniqueUsers = Number(totals.unique_users) || 0;
  const failureReason = (reason) => ({
    WRONG_PASSWORD: "Wrong password",
    ACCOUNT_LOCKED: "Account locked/inactive",
    UNKNOWN_USER: "Unknown user",
  }[reason] || reason || "-");

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Audit Logs - Daily Login & Logout</h1>
        <Link
          href="/reports?report=audit"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
        >
          View Audit Trail
        </Link>
      </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {!hasLoaded ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonKpiCard key={i} />)
          ) : (
            <>
              <KpiCard label="TOTAL LOGINS" value={totalLogins} />
              <KpiCard label="TOTAL LOGOUTS" value={totalLogouts} />
              <KpiCard label="FAILED LOGINS" value={failedLogins} />
              <KpiCard label="UNIQUE USERS" value={uniqueUsers} />
              <KpiCard label="TOTAL EVENTS" value={Number(totals.total_events) || 0} />
            </>
          )}
        </div>

        {/* Login/Logout Table */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Daily Login/Logout Activity</h2>
            <div className="flex items-end gap-2 flex-wrap">
              <label className="text-xs text-gray-500">From<input type="date" value={dateRange.from} onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })} className="block mt-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs" /></label>
              <label className="text-xs text-gray-500">To<input type="date" value={dateRange.to} onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })} className="block mt-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs" /></label>
              <button type="button" onClick={() => setDateRange({ from: "", to: "" })} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Clear</button>
            </div>
          </div>
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 pb-3">User</th>
                  <th className="text-left text-xs font-medium text-gray-400 pb-3">Role</th>
                  <th className="text-left text-xs font-medium text-gray-400 pb-3">Action</th>
                  <th className="text-left text-xs font-medium text-gray-400 pb-3">Failure Reason</th>
                  <th className="text-left text-xs font-medium text-gray-400 pb-3">Login Time</th>
                  <th className="text-left text-xs font-medium text-gray-400 pb-3">Logout Time</th>
                  <th className="text-left text-xs font-medium text-gray-400 pb-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonTableRow key={i} widths={['w-24', 'w-20', 'w-20', 'w-28', 'w-28', 'w-24']} />
                  ))
                ) : loginData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-sm text-gray-400">No audit records found</td>
                  </tr>
                ) : (
                  loginData.map((log, idx) => (
                    <tr key={log.id ?? idx} className="hover:bg-gray-50">
                      <td className="py-3 text-sm font-medium text-gray-800">{log.full_name || log.username || "Unknown"}</td>
                      <td className="py-3 text-sm text-gray-600">{log.role_name || "-"}</td>
                      <td className="py-3 text-sm">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          log.action === "LOGIN" ? "bg-green-100 text-green-700" : log.action === "LOGIN_FAILED" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-gray-600">{failureReason(log.failure_reason)}</td>
                      <td className="py-3 text-sm text-gray-600">
                        {log.login_time_display || "-"}
                      </td>
                      <td className="py-3 text-sm text-gray-600">
                        {log.action === "LOGOUT" ? (log.login_time_display || "-") : (log.logout_time_display || "-")}
                      </td>
                      <td className="py-3 text-sm text-gray-600">{log.ip_address || "-"}</td>
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
