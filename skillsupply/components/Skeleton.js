'use client';

export default function Skeleton({ className = '', children }) {
  return (
    <div
      className={`relative overflow-hidden bg-gray-200 rounded animate-pulse ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-50 animate-shimmer" />
      {children}
    </div>
  );
}

export function SkeletonText({ lines = 1, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-gray-200 rounded animate-pulse"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function SkeletonKpiCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 min-h-28 flex flex-col justify-between">
      <div className="h-3 w-24 bg-gray-200 rounded animate-pulse mb-3" />
      <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
    </div>
  );
}

export function SkeletonTableRow({ widths = ['w-32', 'w-20', 'w-24', 'w-16', 'w-20', 'w-16'], className = '' }) {
  return (
    <tr className={className}>
      {widths.map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className={`h-4 ${w} bg-gray-200 rounded animate-pulse`} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-4" />
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-5/6 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-4/6 bg-gray-200 rounded animate-pulse" />
      </div>
    </div>
  );
}

export function SkeletonListCard({ lines = 3, className = '' }) {
  return (
    <div className={`border border-gray-100 bg-gray-50 rounded-lg p-3 ${className}`}>
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-gray-200 rounded animate-pulse"
            style={{ width: i === 0 ? '75%' : i === 1 ? '50%' : '66%' }}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart({ className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-4" />
      <div className="h-64 bg-gray-100 rounded animate-pulse" />
    </div>
  );
}
