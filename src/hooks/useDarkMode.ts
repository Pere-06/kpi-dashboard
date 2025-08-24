import { useEffect, useMemo, useState } from "react";

export type ThemeMode = "dark" | "light";

function safeGetLocalStorage(key: string): string | null {
  try {
    return window?.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function safeSetLocalStorage(key: string, value: string) {
  try {
    window?.localStorage?.setItem(key, value);
  } catch {}
}

export function useDarkMode(): { theme: ThemeMode; toggle: (next?: ThemeMode) => void } {
  const getPref = useMemo<() => ThemeMode>(() => {
    return () => {
      // 1) preferencia guardada
      const saved = safeGetLocalStorage("theme");
      if (saved === "dark" || saved === "light") return saved as ThemeMode;
      // 2) preferencia del sistema
      const prefersDark =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    };
  }, []);

  const [theme, setTheme] = useState<ThemeMode>(getPref);

  // aplicar clase y persistir
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    safeSetLocalStorage("theme", theme);
  }, [theme]);

  // escuchar cambios del SO SOLO si no hay preferencia guardada
  useEffect(() => {
    const saved = safeGetLocalStorage("theme");
    if (saved === "dark" || saved === "light") return;

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? "dark" : "light");
    };

    // addEventListener moderno con fallback a addListener
    if (mq?.addEventListener) mq.addEventListener("change", handler);
    else mq?.addListener?.(handler);

    return () => {
      if (mq?.removeEventListener) mq.removeEventListener("change", handler);
      else mq?.removeListener?.(handler);
    };
  }, []);

  const toggle = (next?: ThemeMode) => {
    setTheme((prev) => (next ? next : prev === "dark" ? "light" : "dark"));
  };

  return { theme, toggle };
}
