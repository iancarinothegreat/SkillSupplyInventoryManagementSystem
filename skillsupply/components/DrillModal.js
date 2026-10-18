'use client';

export default function DrillModal({ title, subtitle, columns = [], rows = [], loading, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {subtitle ? (
              <p className="text-xs text-gray-400 mt-1 leading-4">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="px-6 py-4 overflow-auto">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-10">Loading details…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              No records found for this selection within the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
                    {columns.map((c) => (
                      <th key={c} className="py-2 pr-4 whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {columns.map((c) => (
                        <td key={c} className="py-2 pr-4 text-gray-700 whitespace-nowrap">
                          {row[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
