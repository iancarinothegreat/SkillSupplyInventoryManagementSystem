'use client';

export default function KpiCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 min-h-28 flex flex-col justify-between">
      <p className="text-xs font-semibold text-[#8a96ab] uppercase tracking-[0.14em] leading-5">
        {label}
      </p>
      <p className="text-3xl font-bold text-[#1f2d42] leading-none">
        {value}
      </p>
    </div>
  );
}
