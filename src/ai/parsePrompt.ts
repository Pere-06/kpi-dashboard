// src/ai/parsePrompt.ts
import type { ChartSpec } from "../types/chart";

const uid = () => Math.random().toString(36).slice(2, 9);

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export function parsePromptToSpec(raw: string): ChartSpec | null {
  const p = norm(raw);

  // ventas por canal (mes activo) → pie
  if (/(ventas|ingresos).*(canal)/.test(p)) {
    return {
      id: uid(),
      type: "pie",
      title: "Ventas por canal (mes activo)",
      intent: "ventas_por_canal_mes",
      params: {},
    };
  }

  // ventas vs gastos últimos N meses → bar
  if (/ventas.*gastos|gastos.*ventas/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses)/);
    const months = m ? Math.max(1, Math.min(24, Number(m[1]))) : 8;
    return {
      id: uid(),
      type: "bar",
      title: `Ventas vs Gastos (últimos ${months} meses)`,
      intent: "ventas_vs_gastos_mes",
      params: { months },
    };
  }

  // evolución de ventas últimos N meses → line
  if (/evolucion|tendencia|historico/.test(p) || /ultimos?\s+\d+\s+mes/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses)/);
    const months = m ? Math.max(1, Math.min(36, Number(m[1]))) : 6;
    return {
      id: uid(),
      type: "line",
      title: `Evolución de ventas (últimos ${months} meses)`,
      intent: "evolucion_ventas_n_meses",
      params: { months },
    };
  }

  // top N canales → bar horizontal
  if (/top\s*\d+.*canales?/.test(p)) {
    const m = p.match(/top\s*(\d+)/);
    const topN = m ? Math.max(1, Math.min(20, Number(m[1]))) : 5;
    return {
      id: uid(),
      type: "bar",
      title: `Top ${topN} canales (mes activo)`,
      intent: "top_canales",
      params: { topN },
      notes: "Ordenado por ventas descendentes.",
    };
  }

  return null;
}
