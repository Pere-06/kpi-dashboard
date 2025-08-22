export default function KpiCard({ label, value = "—", delta = "—", positive = true, loading = false }) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 animate-pulse">
        <div className="h-3 w-24 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="mt-2 h-6 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="mt-1 h-3 w-12 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className={`text-xs ${positive ? "text-emerald-600" : "text-rose-500"}`}>{delta}</div>
    </div>
  );
}
