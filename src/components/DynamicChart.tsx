// src/components/DynamicChart.tsx
import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { ChartSpec } from "../types/chart";
import type { Lang } from "../i18n";

/* =========================
   Tipos de datos locales
   ========================= */
type VentasRow = {
  fecha?: Date | null;
  canal?: string | null;
  ventas?: number | null;
  gastos?: number | null;
  mes?: string | null; // puede venir "01".."12" o "YYYY-MM"
};
type SerieBarPoint = { mes: string; ventas: number; gastos: number };

/* =========================
   Utilidades
   ========================= */
const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#84cc16"];

function lastN<T>(arr: T[], n: number) {
  if (!n || n <= 0) return arr;
  return arr.slice(Math.max(0, arr.length - n));
}

// "2025-03" → {y:2025, m:3}; "03" → {y:0, m:3}
function parseMonthKey(s: string) {
  if (!s) return { y: 0, m: 0, raw: s };
  const mm = s.match(/^\d{2}$/);
  if (mm) return { y: 0, m: Number(s), raw: s };
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) return { y: Number(ym[1]), m: Number(ym[2]), raw: s };
  // fallback: intenta coger los 2 últimos dígitos como mes
  const tail = s.slice(-2);
  const m = Number(tail);
  return { y: 0, m: Number.isFinite(m) ? m : 0, raw: s };
}

// Ordena por año, luego mes (cubre "MM" y "YYYY-MM")
function monthSort(a: string, b: string) {
  const A = parseMonthKey(a);
  const B = parseMonthKey(b);
  if (A.y !== B.y) return A.y - B.y;
  return A.m - B.m;
}

// Compara punto de serie contra un target (acepta "MM" o "YYYY-MM")
function matchesMonth(d: { mes: string }, target: string) {
  const A = parseMonthKey(d.mes);
  const T = parseMonthKey(target);
  // match fuerte si iguales raw
  if (A.raw === T.raw) return true;
  // match por MM si alguno no trae año
  return A.m === T.m && (A.y === 0 || T.y === 0);
}

/* =========================
   Componente
   ========================= */
export default function DynamicChart({
  spec,
  ventas,
  serieBar,
  mesActivo,
  lang,
}: {
  spec: ChartSpec;
  ventas?: VentasRow[];
  serieBar?: SerieBarPoint[];
  mesActivo: string | null;
  lang: Lang;
}) {
  const { type, intent, params } = spec;

  const TXT = {
    sales: lang === "en" ? "Sales" : "Ventas",
    expenses: lang === "en" ? "Expenses" : "Gastos",
    noData: lang === "en" ? "No data." : "Sin datos.",
  };

  /* -------------------------
     Preparación de datos
     ------------------------- */
  const data = useMemo(() => {
    switch (intent) {
      /* ► Ventas por canal del mes activo */
      case "ventas_por_canal_mes": {
        const month = params?.month || mesActivo;
        if (!month || !ventas?.length) return [];
        const map: Record<string, number> = {};
        for (const r of ventas) {
          if (!r?.fecha) continue;
          const ym = `${r.fecha.getFullYear()}-${String(r.fecha.getMonth() + 1).padStart(2, "0")}`;
          if (matchesMonth({ mes: ym }, String(month))) {
            const canal = (r.canal ?? "N/D") as string;
            const v = Number(r.ventas ?? 0);
            if (!Number.isFinite(v)) continue;
            map[canal] = (map[canal] || 0) + v;
          }
        }
        return Object.entries(map).map(([name, value]) => ({ name, value }));
      }

      /* ► Ventas vs gastos últimos N meses */
      case "ventas_vs_gastos_mes": {
        const months = Math.max(1, Math.min(24, params?.months ?? 8));
        const src = Array.isArray(serieBar) ? serieBar.slice() : [];
        src.sort((a, b) => monthSort(a.mes, b.mes)); // asc
        return lastN(src, months);
      }

      /* ► Evolución de ventas últimos N meses (solo serie de ventas) */
      case "evolucion_ventas_n_meses": {
        const months = Math.max(1, Math.min(36, params?.months ?? 6));
        const src = Array.isArray(serieBar) ? serieBar.slice() : [];
        src.sort((a, b) => monthSort(a.mes, b.mes));
        return lastN(src, months).map((d) => ({ mes: d.mes, ventas: d.ventas }));
      }

      /* ► Top N canales del mes activo */
      case "top_canales": {
        const month = params?.month || mesActivo;
        const topN = Math.max(1, Math.min(12, params?.topN ?? 5));
        if (!month || !ventas?.length) return [];
        const map: Record<string, number> = {};
        for (const r of ventas) {
          if (!r?.fecha) continue;
          const ym = `${r.fecha.getFullYear()}-${String(r.fecha.getMonth() + 1).padStart(2, "0")}`;
          if (matchesMonth({ mes: ym }, String(month))) {
            const canal = (r.canal ?? "N/D") as string;
            const v = Number(r.ventas ?? 0);
            if (!Number.isFinite(v)) continue;
            map[canal] = (map[canal] || 0) + v;
          }
        }
        return Object
          .entries(map)
          .sort((a, b) => b[1] - a[1])
          .slice(0, topN)
          .map(([name, value]) => ({ name, value }));
      }

      /* ► Comparativa exacta de DOS MESES (p.ej., marzo vs junio) */
      // Requiere que el backend envíe: params.months = ["YYYY-MM","YYYY-MM"] o ["MM","MM"]
      // Coincide aunque la serie tenga "MM" o "YYYY-MM".
      case "ventas_vs_gastos_dos_meses": {
        const pair = Array.isArray(params?.months) ? params.months.slice(0, 2) : [];
        if (!Array.isArray(serieBar) || serieBar.length === 0 || pair.length < 2) return [];

        const [A, B] = pair.map((x) => String(x));
        const pick = (target: string) => serieBar.find((d) => matchesMonth(d, target));

        const d1 = pick(A);
        const d2 = pick(B);

        // Etiqueta: si viene "YYYY-MM" lo dejamos; si es "MM" lo normalizamos a "MM"
        const label = (raw: string) => {
          const p = parseMonthKey(raw);
          return p.y ? raw : String(p.m).padStart(2, "0"); // "2025-03" o "03"
        };

        const rows: Array<{ name: string; ventas: number; gastos: number }> = [];
        if (d1) rows.push({ name: label(A), ventas: d1.ventas, gastos: d1.gastos });
        if (d2) rows.push({ name: label(B), ventas: d2.ventas, gastos: d2.gastos });

        return rows;
      }

      default:
        return [];
    }
  }, [intent, params, ventas, mesActivo, serieBar]);

  /* -------------------------
     Render del gráfico
     ------------------------- */
  if (!data || data.length === 0) {
    return <div className="h-56 grid place-items-center text-sm text-zinc-500">{TXT.noData}</div>;
  }

  // Pie
  if (type === "pie") {
    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip />
            <Legend />
            <Pie data={data as any} dataKey="value" nameKey="name" outerRadius={90}>
              {(data as any[]).map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Barras (dos series ventas/gastos O una sola "value")
  if (type === "bar") {
    const hasGastos = (data[0] as any).gastos != null && (data[0] as any).ventas != null;
    const xKey = (data[0] as any).mes != null ? "mes" : "name";
    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data as any}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {hasGastos ? (
              <>
                <Bar dataKey="gastos" name={TXT.expenses} fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="ventas" name={TXT.sales}    fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </>
            ) : (
              <Bar dataKey="value" name={TXT.sales} fill="#3b82f6" radius={[6, 6, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Línea (evolución de ventas)
  if (type === "line") {
    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data as any}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line dataKey="ventas" name={TXT.sales} type="monotone" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Área (fallback para series de ventas)
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data as any}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={(data[0] as any).mes != null ? "mes" : "name"} />
          <YAxis />
          <Tooltip />
          <Legend />
          <Area dataKey="ventas" name={TXT.sales} type="monotone" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
