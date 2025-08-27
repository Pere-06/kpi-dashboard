// src/components/DynamicChart.tsx
import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { ChartSpec } from "@/types/chart";

type VentasRow = {
  fecha?: Date | null;
  canal?: string | null;
  ventas?: number | null;
  gastos?: number | null;
  mes?: string | null;
};

type SerieBarPoint = { mes: string; ventas: number; gastos: number };

type Props = {
  spec: ChartSpec & { intent?: string; params?: Record<string, any> };
  ventas?: VentasRow[] | undefined;
  serieBar?: SerieBarPoint[] | undefined;
  mesActivo?: string | null | undefined;
};

/* Helpers */
const ymKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a78bfa", "#14b8a6"];

/** Agrega ventas/gastos por mes (YYYY-MM) */
function aggregateByMonth(ventas: VentasRow[] = []) {
  const map: Record<
    string,
    { mes: string; ventas: number; gastos: number }
  > = {};
  for (const r of ventas) {
    if (!r.fecha) continue;
    const ym = ymKey(r.fecha);
    if (!map[ym]) map[ym] = { mes: ym.slice(5), ventas: 0, gastos: 0 }; // guardamos “MM” para el eje
    map[ym].ventas += Number(r.ventas ?? 0);
    map[ym].gastos += Number(r.gastos ?? 0);
  }
  // ordenar asc por año-mes
  return Object.keys(map)
    .sort()
    .map((ym) => map[ym]);
}

/** Agrega ventas por canal (opcionalmente filtrando por mes YYYY-MM) */
function aggregateByChannel(ventas: VentasRow[] = [], ym?: string | null) {
  const map: Record<string, number> = {};
  for (const r of ventas) {
    if (!r.fecha) continue;
    const key = ymKey(r.fecha);
    if (ym && key !== ym) continue;
    const canal = (r.canal ?? "N/D") as string;
    map[canal] = (map[canal] || 0) + Number(r.ventas ?? 0);
  }
  const arr = Object.entries(map).map(([name, value]) => ({ name, value }));
  // ordenar desc
  arr.sort((a, b) => b.value - a.value);
  return arr;
}

/** Devuelve la lista de últimos N meses en orden ascendente (MM) usando “aggregateByMonth” o “serieBar” */
function lastNMonthsData(
  n: number,
  ventas: VentasRow[] | undefined,
  serieBar: SerieBarPoint[] | undefined
) {
  const fromVentas = aggregateByMonth(ventas || []);
  if (fromVentas.length) return fromVentas.slice(-n);

  // fallback al backend preagregado si no hay filas de ventas
  const fb = (serieBar || []).map((p) => ({
    mes: p.mes?.slice(5) || "",
    ventas: p.ventas || 0,
    gastos: p.gastos || 0,
  }));
  return fb.slice(-n);
}

/* Componente principal */
const DynamicChart: React.FC<Props> = ({ spec, ventas, serieBar, mesActivo }) => {
  const intent = spec.intent ?? ""; // ej: "ventas_por_canal_mes"
  const params = spec.params ?? {};

  const prepared = useMemo(() => {
    switch (intent) {
      case "ventas_por_canal_mes": {
        const ym = mesActivo ?? null;
        const data = aggregateByChannel(ventas || [], ym);
        return { kind: "pie", data };
      }

      case "ventas_vs_gastos_mes": {
        const n = Number(params.months ?? 8);
        const data = lastNMonthsData(n, ventas, serieBar);
        return { kind: "bar-vs", data };
      }

      case "evolucion_ventas_n_meses": {
        const n = Number(params.months ?? 6);
        const data = lastNMonthsData(n, ventas, serieBar).map((d) => ({
          mes: d.mes,
          ventas: d.ventas,
        }));
        return { kind: "line-evol", data };
      }

      case "top_canales": {
        const topN = Number(params.topN ?? 5);
        const all = aggregateByChannel(ventas || []);
        const data = all.slice(0, topN).map((d) => ({ canal: d.name, ventas: d.value }));
        return { kind: "bar-top", data };
      }

      default:
        // si la spec no trae intent, intenta inferir por type sencillo
        if (spec.type === "pie") {
          const data = aggregateByChannel(ventas || [], mesActivo ?? null);
          return { kind: "pie", data };
        }
        if (spec.type === "bar") {
          const data = lastNMonthsData(8, ventas, serieBar);
          return { kind: "bar-vs", data };
        }
        if (spec.type === "line") {
          const data = lastNMonthsData(6, ventas, serieBar).map((d) => ({
            mes: d.mes,
            ventas: d.ventas,
          }));
          return { kind: "line-evol", data };
        }
        return { kind: "unknown", data: [] as any[] };
    }
  }, [intent, params, ventas, serieBar, mesActivo, spec.type]);

  /* Render segun prepared.kind */
  if (prepared.kind === "unknown") {
    return (
      <div className="h-[260px] grid place-items-center text-sm text-zinc-500">
        No sé cómo renderizar esta especificación.
      </div>
    );
  }

  if (!prepared.data?.length) {
    return (
      <div className="h-[260px] grid place-items-center text-sm text-zinc-500">
        Sin datos para esta visualización.
      </div>
    );
  }

  if (prepared.kind === "pie") {
    const data = prepared.data as { name: string; value: number }[];
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Tooltip />
          <Legend />
          <Pie dataKey="value" data={data} innerRadius={50} outerRadius={90} nameKey="name">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (prepared.kind === "bar-vs") {
    const data = prepared.data as { mes: string; ventas: number; gastos: number }[];
    return (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="mes" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="gastos" name="Gastos" radius={[6, 6, 0, 0]} fill="#22c55e" />
          <Bar dataKey="ventas" name="Ventas" radius={[6, 6, 0, 0]} fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (prepared.kind === "line-evol") {
    const data = prepared.data as { mes: string; ventas: number }[];
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="mes" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="ventas" name="Ventas" stroke="#3b82f6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (prepared.kind === "bar-top") {
    const data = prepared.data as { canal: string; ventas: number }[];
    return (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="canal" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="ventas" name="Ventas" radius={[6, 6, 0, 0]} fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return null;
};

export default DynamicChart;
