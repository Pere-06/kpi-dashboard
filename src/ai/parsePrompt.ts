// src/ai/parsePrompt.ts
import type { ChartSpec } from "../types/chart";

const uid = () => Math.random().toString(36).slice(2, 9);
const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const MONTHS = {
  es: [
    ["enero", "ene", "01"],
    ["febrero", "feb", "02"],
    ["marzo", "mar", "03"],
    ["abril", "abr", "04"],
    ["mayo", "may", "05"],
    ["junio", "jun", "06"],
    ["julio", "jul", "07"],
    ["agosto", "ago", "08"],
    ["septiembre", "sep", "09"],
    ["octubre", "oct", "10"],
    ["noviembre", "nov", "11"],
    ["diciembre", "dic", "12"],
  ],
  en: [
    ["january", "jan", "01"],
    ["february", "feb", "02"],
    ["march", "mar", "03"],
    ["april", "apr", "04"],
    ["may", "may", "05"],
    ["june", "jun", "06"],
    ["july", "jul", "07"],
    ["august", "aug", "08"],
    ["september", "sep", "09"],
    ["october", "oct", "10"],
    ["november", "nov", "11"],
    ["december", "dec", "12"],
  ],
} as const;

function monthNameByLang(mm: string, lang: "es" | "en") {
  const arr = MONTHS[lang];
  const found = arr.find((row) => row[2] === mm);
  if (!found) return mm;
  // capitaliza
  const name = found[0];
  return lang === "es"
    ? name.charAt(0).toUpperCase() + name.slice(1)
    : name.charAt(0).toUpperCase() + name.slice(1);
}

function extractTwoMonths(p: string, lang: "es" | "en"): string[] {
  // nombres (es/en)
  const matches: string[] = [];
  for (const row of MONTHS.es) {
    const [full, short, mm] = row;
    if (p.includes(full) || p.includes(short)) matches.push(mm);
  }
  for (const row of MONTHS.en) {
    const [full, short, mm] = row;
    if (p.includes(full) || p.includes(short)) matches.push(mm);
  }
  // numéricos “03 vs 06”
  const num = p.match(/(?:^|\D)(0?[1-9]|1[0-2])\s*(?:vs|y|and|contra)\s*(0?[1-9]|1[0-2])(?:\D|$)/);
  if (num) {
    matches.push(num[1].padStart(2, "0"), num[2].padStart(2, "0"));
  }
  // dedup y limita a dos
  const uniq = Array.from(new Set(matches)).slice(0, 2);
  return uniq;
}

export function parsePromptToSpec(raw: string, lang: "es" | "en" = "es"): ChartSpec | null {
  const p = norm(raw);

  // ===== Dos meses (marzo vs junio)
  const wantsCompareTwo =
    /(vs|versus|compare|comparar|solo|only)/.test(p) &&
    /(sales|expenses|ventas|gastos)/.test(p);
  const pair = extractTwoMonths(p, lang);
  if (wantsCompareTwo && pair.length === 2) {
    const [m1, m2] = pair;
    const t =
      lang === "en"
        ? `Sales vs Expenses (${monthNameByLang(m1, "en")} vs ${monthNameByLang(m2, "en")})`
        : `Ventas vs Gastos (${monthNameByLang(m1, "es")} vs ${monthNameByLang(m2, "es")})`;
    return {
      id: uid(),
      type: "bar",
      title: t,
      intent: "ventas_vs_gastos_dos_meses",
      params: { months: [m1, m2] }, // MM, MM
      notes:
        lang === "en"
          ? "Direct comparison between two months."
          : "Comparación directa entre dos meses.",
    };
  }

  // ===== Ventas por canal (mes activo)
  if (
    (/(\bventas\b|\bingresos\b).*(\bcanal(es)?\b)/.test(p)) ||
    (/(\bsales\b).*(\bchannel(s)?\b)/.test(p))
  ) {
    return {
      id: uid(),
      type: "pie",
      title: lang === "en" ? "Sales by channel (active month)" : "Ventas por canal (mes activo)",
      intent: "ventas_por_canal_mes",
      params: {},
    };
  }

  // ===== Ventas vs gastos últimos N meses
  if (/(ventas.*gastos|gastos.*ventas)/.test(p) || /(sales.*expenses|expenses.*sales)/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses|month|months)/);
    const months = m ? Math.max(1, Math.min(24, Number(m[1]))) : 8;
    return {
      id: uid(),
      type: "bar",
      title:
        lang === "en"
          ? `Sales vs Expenses (last ${months} months)`
          : `Ventas vs Gastos (últimos ${months} meses)`,
      intent: "ventas_vs_gastos_mes",
      params: { months },
    };
  }

  // ===== Evolución ventas últimos N meses
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
      title:
        lang === "en"
          ? `Sales evolution (last ${months} months)`
          : `Evolución de ventas (últimos ${months} meses)`,
      intent: "evolucion_ventas_n_meses",
      params: { months },
    };
  }

  // ===== Top N canales
  if (/top\s*\d+.*(canales?|channels?)/.test(p)) {
    const m = p.match(/top\s*(\d+)/);
    const topN = m ? Math.max(1, Math.min(20, Number(m[1]))) : 5;
    return {
      id: uid(),
      type: "bar",
      title:
        lang === "en"
          ? `Top ${topN} channels (active month)`
          : `Top ${topN} canales (mes activo)`,
      intent: "top_canales",
      params: { topN },
      notes:
        lang === "en" ? "Sorted by sales descending." : "Ordenado por ventas descendentes.",
    };
  }

  return null;
}
