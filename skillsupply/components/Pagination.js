'use client';

function pageWindow(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, 2, page - 1, page, page + 1, totalPages - 1, totalPages]);
  const list = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of list) {
    if (prev && p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

export default function Pagination({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const base = "px-2.5 py-1.5 text-sm rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed";

  let keyCounter = 0;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-gray-100">
      <p className="text-xs text-gray-500">
        Showing <span className="font-medium text-gray-700">{start}–{end}</span> of{' '}
        <span className="font-medium text-gray-700">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={`${base} bg-white text-gray-600 border border-gray-200 hover:bg-gray-50`}
        >
          Prev
        </button>
        {pageWindow(page, totalPages).map((p) => {
          const key = p === '…' ? `dots-${keyCounter++}` : `page-${p}`;
          if (p === '…') {
            return <span key={key} className="px-1.5 text-sm text-gray-400 select-none">…</span>;
          }
          return (
            <button
              key={key}
              onClick={() => onPageChange(p)}
              className={`${base} ${
                p === page
                  ? 'bg-blue-600 text-white font-medium'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className={`${base} bg-white text-gray-600 border border-gray-200 hover:bg-gray-50`}
        >
          Next
        </button>
      </div>
    </div>
  );
}
