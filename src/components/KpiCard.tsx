import React from "react";

type Props = {
  label: string;
  value: string | number;
  delta?: string;
  positive?: boolean;
  loading?: boolean;
  className?: string;
};

export default function KpiCard({
  label,
  value,
  delta,
  positive = true,
  loading = false,
  className = "",
}: Props) {
  return (
    <div className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 h-[104px] ${className}`}>
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      {loading ? (
        <div className="mt-2 h-6 w-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
      ) : (
        <div className="mt-1 text-xl font-semibold">{value}</div>
      )}
      {delta !== undefined && (
        <div className={`text-xs mt-1 ${positive ? "text-emerald-600" : "text-rose-600"}`}>
          {delta}
        </div>
      )}
    </div>
  );
}
