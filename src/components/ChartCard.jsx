export default function ChartCard({ title, children, footer }) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="mb-2 font-medium">{title}</div>
      <div className="h-64">{children}</div>
      {footer ? <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{footer}</div> : null}
    </div>
  );
}
