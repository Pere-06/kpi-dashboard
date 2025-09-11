// src/components/SettingsDrawer.tsx
import React, { useEffect } from "react";
import ConnectionsPage from "../pages/Connections";
import { type Lang } from "../i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
};

export default function SettingsDrawer({ open, onClose, lang, setLang, theme, toggleTheme }: Props) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      {/* Panel */}
      <aside
        className={`fixed top-0 left-0 h-screen w-[320px] max-w-[85vw] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 shadow-2xl
        transition-transform ${open ? "translate-x-0" : "-translate-x-full"} z-50`}
      >
        <div className="h-14 px-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="font-medium">Settings</div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-700">✕</button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto h-[calc(100vh-56px)]">
          {/* Language */}
          <section>
            <div className="text-sm font-medium mb-2">Language / Idioma</div>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              The assistant will always reply in the selected language.
            </p>
          </section>

          {/* Theme */}
          <section>
            <div className="text-sm font-medium mb-2">Theme</div>
            <button
              onClick={toggleTheme}
              className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm"
            >
              {theme === "dark" ? "Switch to light" : "Cambiar a oscuro"}
            </button>
          </section>

          {/* Connections (mueve aquí la página) */}
          <section>
            <div className="text-sm font-medium mb-2">Connections</div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
              <ConnectionsPage />
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
