'use client';

import { useState, useEffect } from 'react';

export default function BackupPage() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [backupDetail, setBackupDetail] = useState(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(null);
  const [message, setMessage] = useState(null);
  const [backupForm, setBackupForm] = useState({
    retentionDate: '',
    recoveryNotes: '',
    createdBy: 'System administrator'
  });
  const [savingDetails, setSavingDetails] = useState(false);

  const getToken = () => sessionStorage.getItem('token') || '';

  useEffect(() => {
    fetchBackups();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  async function fetchBackups() {
    setLoading(true);
    try {
      const res = await fetch('/api/backup', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function createBackup() {
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(backupForm)
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Backup created: ${data.filename}` });
        fetchBackups();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create backup' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to create backup' });
    } finally {
      setCreating(false);
    }
  }

  function updateBackupForm(field, value) {
    setBackupForm((current) => ({ ...current, [field]: value }));
  }

  async function saveBackupDetails() {
    if (!selectedBackup) return;
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(selectedBackup)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(backupForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save backup details');
      setBackupDetail((current) => ({ ...current, ...data }));
      setBackups((current) => current.map((backup) => backup.filename === selectedBackup ? { ...backup, ...data } : backup));
      setMessage({ type: 'success', text: 'Backup details saved' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSavingDetails(false);
    }
  }

  async function viewBackup(filename) {
    setSelectedBackup(filename);
    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(filename)}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBackupDetail(data);
        setBackupForm({
          retentionDate: data.retentionDate || '',
          recoveryNotes: data.recoveryNotes || '',
          createdBy: data.createdBy || 'System administrator'
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function restoreBackup(filename) {
    setRestoring(filename);
    setShowRestoreConfirm(null);
    setMessage(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 130000);
    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        signal: controller.signal
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || 'Failed to restore backup');
      }
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to restore' });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.name === 'AbortError' ? 'Restore timed out. No changes were committed.' : err.message
      });
    } finally {
      clearTimeout(timeout);
      setRestoring(null);
    }
  }

  async function deleteBackup(filename) {
    setMessage(null);
    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Backup deleted' });
        if (selectedBackup === filename) {
          setSelectedBackup(null);
          setBackupDetail(null);
        }
        fetchBackups();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete backup' });
    }
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Backup & Recovery</h1>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="float-right font-bold">&times;</button>
        </div>
      )}

      {/* Actions Bar */}
      <div className="bg-white rounded-xl shadow-sm p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Database Backup Management</h2>
          <p className="text-xs text-gray-400 mt-1">Create, restore, and manage database backups. Maximum 10 backups retained.</p>
        </div>
        {loading ? (
          <div className="h-10 w-36 bg-gray-200 rounded-lg animate-pulse" />
        ) : (
          <button
            onClick={createBackup}
            disabled={creating}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {creating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Creating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                Create Backup
              </>
            )}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Backup Details</h2>
        <p className="text-xs text-gray-400 mb-4">These details are saved with the next backup you create, and can be edited for an existing backup.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-xs text-gray-600">Retention / expiration date
            <input type="date" value={backupForm.retentionDate} onChange={(e) => updateBackupForm('retentionDate', e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-gray-600">Created by
            <input value={backupForm.createdBy} onChange={(e) => updateBackupForm('createdBy', e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-gray-600 md:col-span-3">Recovery notes
            <textarea value={backupForm.recoveryNotes} onChange={(e) => updateBackupForm('recoveryNotes', e.target.value)} rows={2} placeholder="Add restore instructions or notes" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
        {selectedBackup && <button onClick={saveBackupDetails} disabled={savingDetails} className="mt-4 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-900 disabled:opacity-50">{savingDetails ? 'Saving...' : 'Save Details'}</button>}
      </div>

      {/* Backup List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* List */}
        <div className={`bg-white rounded-xl shadow-sm overflow-hidden ${selectedBackup ? 'lg:col-span-2' : 'lg:col-span-5'}`}>
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Available Backups ({backups.length})</h3>
          </div>
          <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="h-4 w-56 bg-gray-200 rounded animate-pulse mb-2" />
                      <div className="h-3 w-36 bg-gray-100 rounded animate-pulse" />
                    </div>
                    <div className="flex gap-2 ml-3">
                      <div className="h-6 w-16 bg-gray-100 rounded animate-pulse" />
                      <div className="h-6 w-14 bg-gray-100 rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              ))
            ) : backups.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-400">
                No backups yet. Click &quot;Create Backup&quot; to get started.
              </div>
            ) : (
              backups.map((backup) => (
                <div
                  key={backup.filename}
                  onClick={() => viewBackup(backup.filename)}
                  className={`px-5 py-4 cursor-pointer transition-colors ${selectedBackup === backup.filename ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{backup.filename}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {backup.sizeFormatted} &middot; {new Date(backup.created).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowRestoreConfirm(backup.filename); }}
                        disabled={restoring === backup.filename}
                        className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 disabled:opacity-50"
                      >
                        {restoring === backup.filename ? 'Restoring...' : 'Restore'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteBackup(backup.filename); }}
                        className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedBackup && (
          <div className="lg:col-span-3 bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Backup Details</h3>
              <button onClick={() => { setSelectedBackup(null); setBackupDetail(null); }} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>
            {backupDetail ? (
              <div className="p-5">
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">Tables</p>
                    <p className="text-xl font-bold text-gray-800">{backupDetail.tableCount}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">Size</p>
                    <p className="text-xl font-bold text-gray-800">{backupDetail.sizeFormatted}</p>
                  </div>
                </div>
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-1">Created</p>
                  <p className="text-sm text-gray-700">{new Date(backupDetail.created).toLocaleString('en-PH')}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div><p className="text-xs text-gray-400">Retention date</p><p className="text-gray-700">{backupDetail.retentionDate || 'Not set'}</p></div>
                  <div><p className="text-xs text-gray-400">Created by</p><p className="text-gray-700">{backupDetail.createdBy}</p></div>
                </div>
                <div className="mb-4"><p className="text-xs text-gray-400">Recovery notes</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{backupDetail.recoveryNotes || 'No recovery notes added.'}</p></div>
                <div>
                  <p className="text-xs text-gray-400 mb-2">Preview (all tables backed up)</p>
                  <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-auto max-h-[400px] font-mono whitespace-pre-wrap">
                    {(backupDetail.tables || []).map((table) => `Table: ${table}`).join('\n') || 'No tables found in this backup.'}
                  </pre>
                </div>
              </div>
            ) : selectedBackup ? (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="h-3 w-12 bg-gray-200 rounded animate-pulse mx-auto mb-2" />
                    <div className="h-6 w-8 bg-gray-200 rounded animate-pulse mx-auto" />
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="h-3 w-14 bg-gray-200 rounded animate-pulse mx-auto mb-2" />
                    <div className="h-6 w-10 bg-gray-200 rounded animate-pulse mx-auto" />
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="h-3 w-10 bg-gray-200 rounded animate-pulse mx-auto mb-2" />
                    <div className="h-6 w-12 bg-gray-200 rounded animate-pulse mx-auto" />
                  </div>
                </div>
                <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
                <div className="bg-gray-900 rounded-lg h-48 animate-pulse" />
              </div>
            ) : (
              <div className="p-5 text-center text-sm text-gray-400">Select a backup to view details</div>
            )}
          </div>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRestoreConfirm(null)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Confirm Restore</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will overwrite the current database with data from <strong>{showRestoreConfirm}</strong>. Existing data will be replaced.
            </p>
            <p className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded mb-4">
              Restores are wrapped in a database transaction. If any error occurs, all changes will be automatically rolled back to keep your data safe.
            </p>
            <p className="text-xs text-red-500 mb-4">Consider creating a backup before restoring.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowRestoreConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={() => restoreBackup(showRestoreConfirm)} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                Restore Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Procedures Section */}
      <div className="bg-white rounded-xl shadow-sm p-5 mt-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Backup &amp; Recovery Procedures</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="font-semibold text-gray-700 mb-2">Creating a Backup</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click &quot;Create Backup&quot; button above</li>
              <li>System exports all tables as SQL statements</li>
              <li>File is saved as <code>backup_YYYY-MM-DDTHH-MM-SS.sql</code></li>
              <li>Oldest backups are auto-deleted (max 10 retained)</li>
            </ol>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="font-semibold text-gray-700 mb-2">Restoring a Backup</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Select a backup from the list</li>
              <li>Review the backup details and preview</li>
              <li>Click &quot;Restore&quot; and confirm</li>
              <li>System truncates tables and re-inserts all data</li>
              <li>Restore runs in a transaction &mdash; if any error occurs, all changes are rolled back</li>
            </ol>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="font-semibold text-gray-700 mb-2">File Naming Convention</p>
            <p className="mt-1"><code>backup_YYYY-MM-DDTHH-MM-SS-mmmZ.sql</code></p>
            <p className="mt-1">Example: <code>backup_2026-09-16T09-30-00-000Z.sql</code></p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="font-semibold text-gray-700 mb-2">Retention Policy</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Maximum 10 backups stored</li>
              <li>Oldest backups auto-deleted</li>
              <li>Manual deletion available</li>
              <li>Recommend: backup before major changes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
