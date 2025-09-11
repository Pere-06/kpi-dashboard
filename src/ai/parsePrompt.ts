// src/ai/parsePrompt.ts
import type { ChartSpec } from "../types/chart";

const uid = () => Math.random().toString(36).slice(2, 9);

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export function parsePromptToSpec(raw: string): ChartSpec | null {
  const p = norm(raw);

  // ======= Ventas por canal / Sales by channel (mes activo) → pie
  // ES: ventas|ingresos + canal
  // EN: sales + channel
  if (
    (/(\bventas\b|\bingresos\b).*(\bcanal(es)?\b)/.test(p)) ||
    (/(\bsales\b).*(\bchannel(s)?\b)/.test(p))
  ) {
    return {
      id: uid(),
      type: "pie",
      title: /sales/i.test(raw) ? "Sales by channel (active month)" : "Ventas por canal (mes activo)",
      intent: "ventas_por_canal_mes",
      params: {},
    };
  }

  // ======= Ventas vs gastos / Sales vs expenses últimos N meses → bar
  // ES: ventas.*gastos  | gastos.*ventas
  // EN: sales.*expenses | expenses.*sales
  if (
    /(ventas.*gastos|gastos.*ventas)/.test(p) ||
    /(sales.*expenses|expenses.*sales)/.test(p)
  ) {
    const m = p.match(/(\d+)\s*(mes|meses|month|months)/);
    const months = m ? Math.max(1, Math.min(24, Number(m[1]))) : 8;
    return {
      id: uid(),
      type: "bar",
      title: /sales/i.test(raw)
        ? `Sales vs Expenses (last ${months} months)`
        : `Ventas vs Gastos (últimos ${months} meses)`,
      intent: "ventas_vs_gastos_mes",
      params: { months },
    };
  }

  // ======= Evolución de ventas / Sales evolution últimos N meses → line
  // ES: evolucion|tendencia|historico|últimos N meses
  // EN: evolution|trend|history|last N months
  if (
    /(evolucion|tendencia|historico)/.test(p) ||
    /(evolution|trend|history)/.test(p) ||
    /ultimos?\s+\d+\s+mes(es)?/.test(p) ||
    /last\s+\d+\s+month(s)?/.test(p)
  ) {
    const m = p.match(/(\d+)\s*(mes|meses|month|months)/);
    const months = m ? Math.max(1, Math.min(36, Number(m[1]))) : 6;
    return {
      id: uid(),
      type: "line",
      title: /sales/i.test(raw)
        ? `Sales evolution (last ${months} months)`
        : `Evolución de ventas (últimos ${months} meses)`,
      intent: "evolucion_ventas_n_meses",
      params: { months },
    };
  }

  // ======= Top N canales / Top N channels → bar
  if (/top\s*\d+.*(canales?|channels?)/.test(p)) {
    const m = p.match(/top\s*(\d+)/);
    const topN = m ? Math.max(1, Math.min(20, Number(m[1]))) : 5;
    return {
      id: uid(),
      type: "bar",
      title: /channel/i.test(raw)
        ? `Top ${topN} channels (active month)`
        : `Top ${topN} canales (mes activo)`,
      intent: "top_canales",
      params: { topN },
      notes: /channel/i.test(raw)
        ? "Sorted by sales descending."
        : "Ordenado por ventas descendentes.",
    };
  }

  return null;
}
