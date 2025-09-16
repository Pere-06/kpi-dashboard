// src/components/DynamicChartGeneric.tsx
import React from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import type { Lang } from "@/i18n";

type Props = {
  type: "bar" | "line" | "area" | "pie";
  dataset: Record<string, any>[];
  xKey: string;
  yKeys: string[];
  lang: Lang;
};

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#84cc16"];

export default function DynamicChartGeneric({
  type,
  dataset,
  xKey,
  yKeys,
  lang,
}: Props) {
  if (!Array.isArray(dataset) || dataset.length === 0) {
    return <div className="h-56 grid place-items-center text-sm text-zinc-500">
      {lang === "en" ? "No data." : "Sin datos."}
    </div>;
  }

  const Common = () => (
    <>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey={xKey} />
      <YAxis />
      <Tooltip />
      <Legend />
    </>
  );

  if (type === "bar") {
    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dataset}>
            <Common />
            {yKeys.map((k, i) => (
              <Bar key={k} dataKey={k} name={k} fill={COLORS[i % COLORS.length]} radius={[6,6,0,0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "line") {
    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dataset}>
            <Common />
            {yKeys.map((k, i) => (
              <Line key={k} dataKey={k} name={k} type="monotone" stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // area (fallback)
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dataset}>
          <Common />
          {yKeys.map((k, i) => (
            <Area key={k} dataKey={k} name={k} type="monotone" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.25} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
