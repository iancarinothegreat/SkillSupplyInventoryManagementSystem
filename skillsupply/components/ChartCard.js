'use client';

export default function ChartCard({ title, description, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {description ? (
        <p className="text-xs text-gray-400 mt-1 leading-4">{description}</p>
      ) : null}
      <div className={description ? 'mt-4' : 'mt-4'}>
        {children}
      </div>
    </div>
  );
}
