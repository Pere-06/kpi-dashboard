import React from "react";

type Props = {
  title: string;
  footer?: string;
  children: React.ReactNode;
  className?: string;
};

export default function ChartCard({ title, footer, children, className }: Props) {
  return (
    <div className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 h-[360px] ${className ?? ""}`}>
      <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-2">{title}</div>
      <div className="w-full h-[calc(100%-2.25rem)]">{children}</div>
      {footer && <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{footer}</div>}
    </div>
  );
}
