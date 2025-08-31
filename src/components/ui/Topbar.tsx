import React from "react";

type Props = {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  title?: string;
  rightText?: string;
};

export default function Topbar({
  theme,
  onToggleTheme,
  title = "MiKPI",
  rightText = "Pere · Cerrar sesión",
}: Props) {
  const isDark = theme === "dark";
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-white/70 dark:bg-zinc-950/70 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto max-w-7xl h-14 px-4 flex items-center justify-between">
        <h1 className="text-sm tracking-tight text-zinc-700 dark:text-zinc-300">{title}</h1>

        <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <button
            onClick={onToggleTheme}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            title="Cambiar tema"
            aria-pressed={isDark}
            aria-label="Cambiar tema claro/oscuro"
          >
            {isDark ? "☀️ Claro" : "🌙 Oscuro"}
          </button>
          <span>{rightText}</span>
        </div>
      </div>
    </header>
  );
}
