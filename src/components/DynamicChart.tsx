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

type VentasRow = {
  fecha?: Date | null;
  canal?: string | null;
  ventas?: number | null;
  gastos?: number | null;
  mes?: string | null;
};
type SerieBarPoint = { mes: string; ventas: number; gastos: number };

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#84cc16"];

function lastN<T>(arr: T[], n: number) {
  if (!n || n <= 0) return arr;
  return arr.slice(Math.max(0, arr.length - n));
}

function monthSort(a: string, b: string) {
  return a.localeCompare(b);
}

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

  const data = useMemo(() => {
    switch (intent) {
      case "ventas_por_canal_mes": {
        const month = params?.month || mesActivo;
        if (!month || !ventas?.length) return [];
        const map: Record<string, number> = {};
        for (const r of ventas) {
          if (r.fecha && `${r.fecha.getFullYear()}-${String(r.fecha.getMonth() + 1).padStart(2, "0")}` === month) {
            const canal = (r.canal ?? "N/D") as string;
            const v = Number(r.ventas ?? 0);
            map[canal] = (map[canal] || 0) + v;
          }
        }
        return Object.entries(map).map(([name, value]) => ({ name, value }));
      }

      case "ventas_vs_gastos_mes": {
        const months = Math.max(1, Math.min(24, params?.months ?? 8));
        const src = Array.isArray(serieBar) ? serieBar.slice() : [];
        src.sort((a, b) => monthSort(a.mes, b.mes));
        return lastN(src, months);
      }

      case "evolucion_ventas_n_meses": {
        const months = Math.max(1, Math.min(24, params?.months ?? 6));
        const src = Array.isArray(serieBar) ? serieBar.slice() : [];
        src.sort((a, b) => monthSort(a.mes, b.mes));
        return lastN(src, months).map((d) => ({ mes: d.mes, ventas: d.ventas }));
      }

      case "top_canales": {
        const month = params?.month || mesActivo;
        const topN = Math.max(1, Math.min(12, params?.topN ?? 5));
        if (!month || !ventas?.length) return [];
        const map: Record<string, number> = {};
        for (const r of ventas) {
          if (r.fecha && `${r.fecha.getFullYear()}-${String(r.fecha.getMonth() + 1).padStart(2, "0")}` === month) {
            const canal = (r.canal ?? "N/D") as string;
            const v = Number(r.ventas ?? 0);
            map[canal] = (map[canal] || 0) + v;
          }
        }
        const sorted = Object.entries(map)
          .sort((a, b) => b[1] - a[1])
          .slice(0, topN)
          .map(([name, value]) => ({ name, value }));
        return sorted;
      }
      default:
        return [];
    }
  }, [intent, params, ventas, mesActivo, serieBar]);

  if (!data || data.length === 0) {
    return <div className="h-56 grid place-items-center text-sm text-zinc-500">{TXT.noData}</div>;
  }

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

  if (type === "bar") {
    const hasGastos = (data[0] as any).gastos != null;
    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data as any}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={hasGastos ? "mes" : "name"} />
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

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data as any}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="mes" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Area dataKey="ventas" name={TXT.sales} type="monotone" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
