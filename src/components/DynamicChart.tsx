import React, { useMemo, useRef, useCallback } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell
} from "recharts";
import { ChartSpec } from "@/types/chart";
import { useDarkMode } from "@/hooks/useDarkMode";

type VentasRow = { fecha?: Date | null; canal?: string | null; ventas?: number | null; gastos?: number | null; mes?: string | null; };
type SerieBarPoint = { mes: string; ventas: number; gastos: number; };

type Props = {
  spec: ChartSpec;
  ventas: VentasRow[];
  serieBar: SerieBarPoint[];
  mesActivo: string | null;
};

const COLORS = ["#3b82f6","#22c55e","#f59e0b","#ef4444","#a78bfa","#10b981","#f97316"];
const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;

export default function DynamicChart({ spec, ventas, serieBar, mesActivo }: Props) {
  const { theme } = useDarkMode() as { theme: "light" | "dark"; toggle: () => void };
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ---- Datos derivados según intención ----
  const data = useMemo<any[]>(() => {
    switch (spec.intent) {
      case "ventas_por_canal_mes": {
        if (!mesActivo) return [];
        const map: Record<string, number> = {};
        ventas.forEach(v => {
          if (v.fecha && ymKey(v.fecha) === mesActivo) {
            const canal = (v.canal ?? "N/D") as string;
            const val = Number(v.ventas ?? 0);
            map[canal] = (map[canal] || 0) + val;
          }
        });
        return Object.entries(map).map(([name, value]) => ({ name, value }));
      }
      case "ventas_vs_gastos_mes": {
        const months = spec.params?.months ?? 8;
        return Array.isArray(serieBar) ? serieBar.slice(-months) : [];
      }
      case "evolucion_ventas_n_meses": {
        const months = spec.params?.months ?? 6;
        const arr = Array.isArray(serieBar) ? serieBar.slice(-months) : [];
        return arr.map(d => ({ mes: d.mes, ventas: d.ventas }));
      }
      case "top_canales": {
        const topN = spec.params?.topN ?? 5;
        if (!mesActivo) return [];
        const map: Record<string, number> = {};
        ventas.forEach(v => {
          if (v.fecha && ymKey(v.fecha) === mesActivo) {
            const canal = (v.canal ?? "N/D") as string;
            map[canal] = (map[canal] || 0) + Number(v.ventas ?? 0);
          }
        });
        return Object.entries(map)
          .map(([name, value]) => ({ name, value }))
          .sort((a,b) => b.value - a.value)
          .slice(0, topN);
      }
      default:
        return [];
    }
  }, [spec, ventas, serieBar, mesActivo]);

  // ---- Tooltip estilizado ----
  const tooltipStyle: React.CSSProperties = {
    background: theme === "dark" ? "#18181b" : "#fff",
    borderRadius: 12,
    border: "1px solid rgba(63,63,70,.4)",
    color: theme === "dark" ? "#e5e7eb" : "#18181b",
    fontSize: "0.875rem"
  };

  // ---- Export helpers ----
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportCSV = useCallback(() => {
    if (!data || !data.length) return;
    // columnas = keys del primer elemento
    const keys = Object.keys(data[0]);
    const rows = [keys.join(",")].concat(
      data.map((row) =>
        keys.map((k) => JSON.stringify((row as any)[k] ?? "")).join(",")
      )
    );
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `${spec.title?.replace(/\s+/g, "_") || "chart"}.csv`);
  }, [data, spec.title]);

  const exportPNG = useCallback(async () => {
    const root = containerRef.current;
    if (!root) return;
    const svg = root.querySelector("svg") as SVGSVGElement | null;
    if (!svg) return;

    // Serializa el SVG y dibuja en un canvas -> PNG
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    const { width, height } = svg.viewBox.baseVal || { width: svg.clientWidth, height: svg.clientHeight };
    const w = width || svg.clientWidth || 800;
    const h = height || svg.clientHeight || 400;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = theme === "dark" ? "#0b0b0f" : "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${spec.title?.replace(/\s+/g, "_") || "chart"}.png`);
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [theme, spec.title]);

  // ---- Render según tipo + barra de acciones ----
  return (
    <div ref={containerRef} className="relative">
      {/* Acciones exportar */}
      <div className="absolute right-2 top-2 z-10 flex gap-2">
        <button
          onClick={exportPNG}
          className="text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 backdrop-blur hover:bg-white dark:hover:bg-zinc-900"
          title="Descargar PNG"
        >
          PNG
        </button>
        <button
          onClick={exportCSV}
          className="text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 backdrop-blur hover:bg-white dark:hover:bg-zinc-900"
          title="Descargar CSV"
        >
          CSV
        </button>
      </div>

      {spec.type === "pie" ? (
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={3} isAnimationActive>
              {data.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      ) : spec.type === "line" ? (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis dataKey="mes" />
            <YAxis />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Line type="monotone" dataKey="ventas" name="Ventas" stroke={theme === "dark" ? "#60a5fa" : "#2563eb"} strokeWidth={2} dot={false} isAnimationActive />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis dataKey={spec.intent === "top_canales" ? "name" : "mes"} />
            <YAxis />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            {spec.intent === "ventas_vs_gastos_mes" ? (
              <>
                <Bar dataKey="gastos" name="Gastos" radius={[6,6,0,0]} fill={theme === "dark" ? "#22c55e" : "#16a34a"} isAnimationActive />
                <Bar dataKey="ventas" name="Ventas" radius={[6,6,0,0]} fill={theme === "dark" ? "#3b82f6" : "#2563eb"} isAnimationActive />
              </>
            ) : (
              <Bar dataKey="value" name="Ventas" radius={[6,6,0,0]} fill={theme === "dark" ? "#3b82f6" : "#2563eb"} isAnimationActive />
            )}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
